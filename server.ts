import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

function loadFirebaseConfig(): FirebaseConfig {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  return JSON.parse(raw) as FirebaseConfig;
}

const firebaseCfg = loadFirebaseConfig();
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseCfg.projectId}/databases/${firebaseCfg.firestoreDatabaseId}/documents`;

// Decode Firestore REST typed values into plain JS values
function decodeFirestoreValue(val: Record<string, unknown>): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const arr = (val.arrayValue as { values?: Record<string, unknown>[] }).values || [];
    return arr.map(decodeFirestoreValue);
  }
  if ('mapValue' in val) {
    const fields = (val.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields || {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function decodeDocument(doc: { name?: string; fields?: Record<string, Record<string, unknown>> }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (doc.name) {
    const parts = doc.name.split('/');
    out.id = parts[parts.length - 1];
  }
  if (doc.fields) {
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
  }
  return out;
}

async function fetchPublicDoc(docPath: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore REST fetch failed for ${docPath}: ${res.status}`);
  }
  const data = (await res.json()) as { name?: string; fields?: Record<string, Record<string, unknown>> };
  return decodeDocument(data);
}

async function verifyFirebaseUser(idToken: string): Promise<{ uid: string; email: string; emailVerified: boolean } | null> {
  if (!idToken) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseCfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    users?: Array<{ localId: string; email?: string; emailVerified?: boolean }>;
  };
  const user = data.users?.[0];
  if (!user || !user.email || !user.emailVerified) return null;
  return { uid: user.localId, email: user.email.toLowerCase(), emailVerified: true };
}

function getConfiguredProviders() {
  const stripe = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim().length > 10);
  const moyasar = Boolean(process.env.MOYASAR_SECRET_KEY && process.env.MOYASAR_SECRET_KEY.trim().length > 10);
  const tap = Boolean(process.env.TAP_SECRET_KEY && process.env.TAP_SECRET_KEY.trim().length > 10);
  return {
    providers: { stripe, moyasar, tap },
    anyConfigured: stripe || moyasar || tap,
  };
}

interface OrderQuoteItemInput {
  productId: string;
  quantity: number;
  selectedOptionChoices: Array<{ groupId: string; choiceId: string }>;
  selectedAddonIds: string[];
  note?: string;
}

interface ValidatedOrderCalculation {
  valid: boolean;
  error?: string;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  currency: string;
  items: Array<{
    productId: string;
    productName: string;
    imageUrl: string;
    quantity: number;
    unitPrice: number;
    optionsTotal: number;
    addonsTotal: number;
    lineTotal: number;
    selectedOptions: Array<{ groupName: string; choiceName: string; extraPrice: number }>;
    selectedAddons: Array<{ name: string; price: number }>;
    note: string;
  }>;
}

async function calculateAuthoritativeOrder(body: {
  items: OrderQuoteItemInput[];
  fulfillmentType: 'delivery' | 'pickup' | 'dine_in';
  zoneId?: string;
  couponCode?: string;
  scheduledFor?: string;
}): Promise<ValidatedOrderCalculation> {
  const storeDoc = await fetchPublicDoc('settings/store');
  const currency =
    typeof storeDoc?.currency === 'string' && storeDoc.currency !== 'ر.س'
      ? storeDoc.currency
      : 'د.أ';

  if (storeDoc) {
    if (storeDoc.isAcceptingOrders === false && !body.scheduledFor) {
      return { valid: false, error: 'المتجر متوقف عن استقبال الطلبات حالياً', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    if (body.fulfillmentType === 'delivery' && storeDoc.deliveryEnabled === false) {
      return { valid: false, error: 'خدمة التوصيل متوقفة حالياً', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    if (body.fulfillmentType === 'pickup' && storeDoc.pickupEnabled === false) {
      return { valid: false, error: 'خدمة الاستلام من المحل متوقفة حالياً', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    if (body.fulfillmentType === 'dine_in' && storeDoc.dineInEnabled === false) {
      return { valid: false, error: 'خدمة الطلب داخل المطعم متوقفة حالياً', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return { valid: false, error: 'السلة فارغة', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
  }

  let subtotal = 0;
  const verifiedItems: ValidatedOrderCalculation['items'] = [];

  for (const item of body.items) {
    if (!item.productId || typeof item.quantity !== 'number' || item.quantity < 1 || !Number.isInteger(item.quantity)) {
      return { valid: false, error: 'بيانات الكمية غير صالحة', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    const product = await fetchPublicDoc(`products/${encodeURIComponent(item.productId)}`);
    if (!product) {
      return { valid: false, error: 'أحد المنتجات لم يعد موجوداً في القائمة', subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    if (product.isAvailable === false || product.isHidden === true) {
      return { valid: false, error: `المنتج "${String(product.name)}" غير متوفر حالياً`, subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }
    if (typeof product.stockQuantity === 'number' && product.stockQuantity < item.quantity) {
      return { valid: false, error: `الكمية المطلوبة من "${String(product.name)}" تتجاوز المتاح (${product.stockQuantity})`, subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
    }

    const basePrice = typeof product.discountPrice === 'number' && product.discountPrice >= 0 && product.discountPrice < Number(product.price)
      ? Number(product.discountPrice)
      : Number(product.price);

    const optionGroups = Array.isArray(product.optionGroups)
      ? (product.optionGroups as Array<{
          id: string;
          name: string;
          required?: boolean;
          minSelect?: number;
          maxSelect?: number;
          choices?: Array<{ id: string; name: string; extraPrice?: number }>;
        }>)
      : [];

    const selectedOptionsOut: Array<{ groupName: string; choiceName: string; extraPrice: number }> = [];
    let optionsTotal = 0;

    for (const grp of optionGroups) {
      const picked = (item.selectedOptionChoices || []).filter((s) => s.groupId === grp.id);
      const minRequired = grp.required ? Math.max(1, grp.minSelect || 1) : (grp.minSelect || 0);
      if (picked.length < minRequired) {
        return { valid: false, error: `يرجى اختيار ${grp.name} للمنتج "${String(product.name)}"`, subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
      }
      if (grp.maxSelect && picked.length > grp.maxSelect) {
        return { valid: false, error: `تجاوزت الحد الأقصى لخيارات ${grp.name}`, subtotal: 0, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: [] };
      }
      for (const p of picked) {
        const choice = (grp.choices || []).find((c) => c.id === p.choiceId);
        if (choice) {
          const extra = Number(choice.extraPrice || 0);
          optionsTotal += extra;
          selectedOptionsOut.push({ groupName: grp.name, choiceName: choice.name, extraPrice: extra });
        }
      }
    }

    const addonsList = Array.isArray(product.addons)
      ? (product.addons as Array<{ id: string; name: string; price: number }>)
      : [];
    const selectedAddonsOut: Array<{ name: string; price: number }> = [];
    let addonsTotal = 0;

    for (const addonId of item.selectedAddonIds || []) {
      const addon = addonsList.find((a) => a.id === addonId);
      if (addon) {
        const addonPrice = Number(addon.price || 0);
        addonsTotal += addonPrice;
        selectedAddonsOut.push({ name: addon.name, price: addonPrice });
      }
    }

    const lineTotal = Number(((basePrice + optionsTotal + addonsTotal) * item.quantity).toFixed(2));
    subtotal += lineTotal;

    verifiedItems.push({
      productId: String(product.id),
      productName: String(product.name),
      imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : '',
      quantity: item.quantity,
      unitPrice: basePrice,
      optionsTotal,
      addonsTotal,
      lineTotal,
      selectedOptions: selectedOptionsOut,
      selectedAddons: selectedAddonsOut,
      note: (item.note || '').slice(0, 200),
    });
  }

  subtotal = Number(subtotal.toFixed(2));

  // Verify delivery zone fee
  let deliveryFee = 0;
  let minOrderAmount = typeof storeDoc?.minOrderAmount === 'number' ? Number(storeDoc.minOrderAmount) : 0;

  if (body.fulfillmentType === 'delivery') {
    if (body.zoneId) {
      const zone = await fetchPublicDoc(`delivery_zones/${encodeURIComponent(body.zoneId)}`);
      if (!zone || zone.isActive === false) {
        return { valid: false, error: 'منطقة التوصيل المحددة غير متاحة حالياً', subtotal, discountAmount: 0, deliveryFee: 0, total: 0, currency, items: verifiedItems };
      }
      deliveryFee = Number(zone.fee || 0);
      minOrderAmount = Math.max(minOrderAmount, Number(zone.minOrderAmount || 0));
    } else if (typeof storeDoc?.defaultDeliveryFee === 'number') {
      deliveryFee = Number(storeDoc.defaultDeliveryFee);
    }
  }

  if (subtotal < minOrderAmount) {
    return {
      valid: false,
      error: `الحد الأدنى للطلب هو ${minOrderAmount} ${currency}`,
      subtotal,
      discountAmount: 0,
      deliveryFee,
      total: 0,
      currency,
      items: verifiedItems,
    };
  }

  // Verify coupon code if supplied
  let discountAmount = 0;
  if (body.couponCode && body.couponCode.trim()) {
    const codeUpper = body.couponCode.trim().toUpperCase();
    const offersRes = await fetch(`${FIRESTORE_BASE}/offers`);
    if (offersRes.ok) {
      const offersJson = (await offersRes.json()) as {
        documents?: Array<{ name?: string; fields?: Record<string, Record<string, unknown>> }>;
      };
      const docs = (offersJson.documents || []).map(decodeDocument);
      const today = new Date().toISOString().slice(0, 10);
      const matched = docs.find((o) => {
        if (o.type !== 'coupon' || o.isActive !== true) return false;
        if (String(o.code || '').toUpperCase() !== codeUpper) return false;
        if (o.startDate && String(o.startDate) > today) return false;
        if (o.endDate && String(o.endDate) < today) return false;
        return true;
      });
      if (!matched) {
        return { valid: false, error: 'كود الخصم غير صالح أو منتهي الصلاحية', subtotal, discountAmount: 0, deliveryFee, total: 0, currency, items: verifiedItems };
      }
      if (typeof matched.minOrderAmount === 'number' && subtotal < Number(matched.minOrderAmount)) {
        return {
          valid: false,
          error: `كود الخصم يتطلب حداً أدنى للطلب قدره ${matched.minOrderAmount} ${currency}`,
          subtotal,
          discountAmount: 0,
          deliveryFee,
          total: 0,
          currency,
          items: verifiedItems,
        };
      }
      if (matched.discountType === 'percent') {
        discountAmount = Number(((subtotal * Number(matched.discountValue || 0)) / 100).toFixed(2));
      } else {
        discountAmount = Number(Math.min(subtotal, Number(matched.discountValue || 0)).toFixed(2));
      }
    }
  }

  const total = Number(Math.max(0, subtotal - discountAmount + deliveryFee).toFixed(2));
  return {
    valid: true,
    subtotal,
    discountAmount,
    deliveryFee,
    total,
    currency,
    items: verifiedItems,
  };
}

function currencyToIsoCode(currencyLabel: string): string {
  const c = currencyLabel.trim().toLowerCase();
  if (c.includes('د.أ') || c.includes('jod') || c.includes('دينار')) return 'jod';
  if (c.includes('ر.س') || c.includes('sar') || c.includes('ريال')) return 'sar';
  if (c.includes('د.إ') || c.includes('aed') || c.includes('درهم')) return 'aed';
  if (c.includes('د.ك') || c.includes('kwd')) return 'kwd';
  if (c.includes('ج.م') || c.includes('egp')) return 'egp';
  if (c.includes('د.ع') || c.includes('iqd')) return 'iqd';
  if (c.includes('eur') || c.includes('€')) return 'eur';
  return 'jod';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'zad-mahawi' });
  });

  app.get('/api/payments/capabilities', (_req, res) => {
    res.json(getConfiguredProviders());
  });

  app.post('/api/orders/validate-totals', async (req, res) => {
    try {
      const result = await calculateAuthoritativeOrder(req.body);
      res.status(result.valid ? 200 : 400).json(result);
    } catch (err) {
      console.error('Order validation error:', err);
      res.status(500).json({ valid: false, error: 'تعذر التحقق من الأسعار من الخادم' });
    }
  });

  app.post('/api/payments/create-checkout', async (req, res) => {
    try {
      const { provider, orderId, orderNumber, quoteInput } = req.body as {
        provider: 'stripe' | 'moyasar' | 'tap';
        orderId: string;
        orderNumber: string;
        quoteInput: Parameters<typeof calculateAuthoritativeOrder>[0];
      };

      const caps = getConfiguredProviders();
      if (!provider || !caps.providers[provider]) {
        return res.status(400).json({ error: 'مزود الدفع الإلكتروني غير مُعد بمفتاح API حقيقي على الخادم.' });
      }

      const calc = await calculateAuthoritativeOrder(quoteInput);
      if (!calc.valid) {
        return res.status(400).json({ error: calc.error || 'تعذر التحقق من قيمة الطلب' });
      }

      const appOrigin = (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL')
        ? process.env.APP_URL.replace(/\/$/, '')
        : `${req.protocol}://${req.get('host')}`;
      const isoCurrency = currencyToIsoCode(calc.currency);
      const unitMultiplier = ['jod', 'kwd', 'bhd', 'omr'].includes(isoCurrency) ? 1000 : 100;
      const amountSmallestUnit = Math.round(calc.total * unitMultiplier);

      if (provider === 'stripe') {
        const params = new URLSearchParams();
        params.append('mode', 'payment');
        params.append('success_url', `${appOrigin}/?payment_verify=1&provider=stripe&orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}`);
        params.append('cancel_url', `${appOrigin}/?payment_cancelled=1&orderId=${encodeURIComponent(orderId)}`);
        params.append('line_items[0][price_data][currency]', isoCurrency);
        params.append('line_items[0][price_data][product_data][name]', `طلب زاد مهاوي #${orderNumber}`);
        params.append('line_items[0][price_data][unit_amount]', String(amountSmallestUnit));
        params.append('line_items[0][quantity]', '1');
        params.append('metadata[orderId]', orderId);
        params.append('metadata[orderNumber]', orderNumber);

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        const stripeData = (await stripeRes.json()) as { id?: string; url?: string; error?: { message?: string } };
        if (!stripeRes.ok || !stripeData.url || !stripeData.id) {
          return res.status(502).json({ error: stripeData.error?.message || 'فشل إنشاء جلسة الدفع عبر Stripe' });
        }
        return res.json({ checkoutUrl: stripeData.url, paymentReference: stripeData.id });
      }

      if (provider === 'moyasar') {
        const authHeader = Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString('base64');
        const moyasarRes = await fetch('https://api.moyasar.com/v1/invoices', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: amountSmallestUnit,
            currency: isoCurrency.toUpperCase(),
            description: `ZAD MAHAWI Order #${orderNumber}`,
            callback_url: `${appOrigin}/?payment_verify=1&provider=moyasar&orderId=${encodeURIComponent(orderId)}`,
            metadata: { orderId, orderNumber },
          }),
        });
        const mData = (await moyasarRes.json()) as { id?: string; url?: string; message?: string };
        if (!moyasarRes.ok || !mData.url || !mData.id) {
          return res.status(502).json({ error: mData.message || 'فشل إنشاء فاتورة الدفع عبر Moyasar' });
        }
        return res.json({ checkoutUrl: mData.url, paymentReference: mData.id });
      }

      if (provider === 'tap') {
        const tapRes = await fetch('https://api.tap.company/v2/charges', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: calc.total,
            currency: isoCurrency.toUpperCase(),
            customer_initiated: true,
            threeDSecure: true,
            description: `ZAD MAHAWI Order #${orderNumber}`,
            reference: { order: orderNumber },
            metadata: { orderId, orderNumber },
            source: { id: 'src_all' },
            redirect: {
              url: `${appOrigin}/?payment_verify=1&provider=tap&orderId=${encodeURIComponent(orderId)}`,
            },
          }),
        });
        const tData = (await tapRes.json()) as { id?: string; transaction?: { url?: string }; errors?: Array<{ description?: string }> };
        if (!tapRes.ok || !tData.transaction?.url || !tData.id) {
          return res.status(502).json({ error: tData.errors?.[0]?.description || 'فشل إنشاء عملية الدفع عبر Tap' });
        }
        return res.json({ checkoutUrl: tData.transaction.url, paymentReference: tData.id });
      }

      return res.status(400).json({ error: 'مزود الدفع غير مدعوم' });
    } catch (err) {
      console.error('Create checkout error:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء الاتصال ببوابة الدفع' });
    }
  });

  app.post('/api/payments/verify', async (req, res) => {
    try {
      const { provider, paymentReference } = req.body as {
        provider: 'stripe' | 'moyasar' | 'tap';
        paymentReference: string;
      };
      const caps = getConfiguredProviders();
      if (!provider || !caps.providers[provider] || !paymentReference) {
        return res.status(400).json({ verified: false, error: 'بيانات التحقق غير مكتملة أو مزود الدفع غير مُعد' });
      }

      if (provider === 'stripe') {
        const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(paymentReference)}`, {
          headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        });
        const data = (await r.json()) as { payment_status?: string; payment_intent?: string; status?: string };
        const verified = r.ok && data.payment_status === 'paid';
        return res.json({ verified, status: data.payment_status || data.status || 'unknown', paymentReference: data.payment_intent || paymentReference });
      }

      if (provider === 'moyasar') {
        const authHeader = Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString('base64');
        const r = await fetch(`https://api.moyasar.com/v1/invoices/${encodeURIComponent(paymentReference)}`, {
          headers: { Authorization: `Basic ${authHeader}` },
        });
        const data = (await r.json()) as { status?: string; payments?: Array<{ id?: string; status?: string }> };
        const paidPayment = data.payments?.find((p) => p.status === 'paid');
        const verified = r.ok && (data.status === 'paid' || Boolean(paidPayment));
        return res.json({ verified, status: data.status || 'unknown', paymentReference: paidPayment?.id || paymentReference });
      }

      if (provider === 'tap') {
        const r = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(paymentReference)}`, {
          headers: { Authorization: `Bearer ${process.env.TAP_SECRET_KEY}` },
        });
        const data = (await r.json()) as { status?: string };
        const verified = r.ok && data.status === 'CAPTURED';
        return res.json({ verified, status: data.status || 'unknown', paymentReference });
      }

      return res.status(400).json({ verified: false, error: 'مزود الدفع غير مدعوم' });
    } catch (err) {
      console.error('Payment verify error:', err);
      res.status(500).json({ verified: false, error: 'تعذر التحقق من حالة الدفع' });
    }
  });

  app.post('/api/payments/refund', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const verifiedUser = await verifyFirebaseUser(idToken);
      if (!verifiedUser) {
        return res.status(401).json({ refunded: false, error: 'مصادقة غير صالحة' });
      }

      const { provider, paymentReference } = req.body as {
        provider: 'stripe' | 'moyasar' | 'tap';
        paymentReference: string;
      };
      const caps = getConfiguredProviders();
      if (!provider || !caps.providers[provider] || !paymentReference) {
        return res.status(400).json({ refunded: false, error: 'مزود الدفع أو مرجع العملية غير متوفر' });
      }

      if (provider === 'stripe') {
        const params = new URLSearchParams();
        params.append('payment_intent', paymentReference);
        const r = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        const data = (await r.json()) as { status?: string; error?: { message?: string } };
        if (!r.ok) return res.status(502).json({ refunded: false, error: data.error?.message || 'فشل الاسترداد في Stripe' });
        return res.json({ refunded: true, status: data.status });
      }

      if (provider === 'moyasar') {
        const authBasic = Buffer.from(`${process.env.MOYASAR_SECRET_KEY}:`).toString('base64');
        const r = await fetch(`https://api.moyasar.com/v1/payments/${encodeURIComponent(paymentReference)}/refund`, {
          method: 'POST',
          headers: { Authorization: `Basic ${authBasic}` },
        });
        const data = (await r.json()) as { status?: string; message?: string };
        if (!r.ok) return res.status(502).json({ refunded: false, error: data.message || 'فشل الاسترداد في Moyasar' });
        return res.json({ refunded: true, status: data.status });
      }

      if (provider === 'tap') {
        const r = await fetch('https://api.tap.company/v2/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            charge_id: paymentReference,
            reason: 'requested_by_customer',
          }),
        });
        const data = (await r.json()) as { status?: string; errors?: Array<{ description?: string }> };
        if (!r.ok) return res.status(502).json({ refunded: false, error: data.errors?.[0]?.description || 'فشل الاسترداد في Tap' });
        return res.json({ refunded: true, status: data.status });
      }

      return res.status(400).json({ refunded: false, error: 'مزود الدفع غير مدعوم' });
    } catch (err) {
      console.error('Payment refund error:', err);
      res.status(500).json({ refunded: false, error: 'تعذر تنفيذ الاسترداد' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`ZAD MAHAWI server running on http://0.0.0.0:${port}`);
  });
}

startServer();
