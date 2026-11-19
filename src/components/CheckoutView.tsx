import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Navigation,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import { doc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, generateFirestoreId, handleFirestoreError, OperationType, stripUndefined } from '../firebase';
import type {
  Address,
  CartItem,
  DeliveryZone,
  Offer,
  Order,
  PaymentCapabilities,
  PaymentMethod,
  PaymentSettings,
  StoreSettings,
  UserProfile,
} from '../types';
import { calculateCartItemTotal, formatPrice, isStoreCurrentlyOpen } from '../utils/storeHelpers';

interface CheckoutViewProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  storeSettings: StoreSettings;
  paymentSettings: PaymentSettings;
  paymentCapabilities: PaymentCapabilities;
  deliveryZones: DeliveryZone[];
  appliedCoupon: Offer | null;
  currentUser: User | null;
  userProfile: UserProfile | null;
  addresses: Address[];
  onRequireLogin: () => void;
  onOrderCreated: (order: Order) => void;
  onSendNotification: (p: {
    targetType: 'user' | 'admin' | 'broadcast';
    targetUserId?: string;
    title: string;
    body: string;
    orderId?: string;
  }) => Promise<void>;
}

export const CheckoutView: React.FC<CheckoutViewProps> = ({
  isOpen,
  onClose,
  cart,
  storeSettings,
  paymentSettings,
  paymentCapabilities,
  deliveryZones,
  appliedCoupon,
  currentUser,
  userProfile,
  addresses,
  onRequireLogin,
  onOrderCreated,
  onSendNotification,
}) => {
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup' | 'dine_in'>(
    storeSettings.deliveryEnabled
      ? 'delivery'
      : storeSettings.pickupEnabled
        ? 'pickup'
        : 'dine_in',
  );
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [street, setStreet] = useState('');
  const [details, setDetails] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saveAddress, setSaveAddress] = useState(true);
  const [pickupTime, setPickupTime] = useState('في أقرب وقت ممكن');
  const [scheduledFor, setScheduledFor] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod_delivery');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  const openStatus = useMemo(() => isStoreCurrentlyOpen(storeSettings), [storeSettings]);
  const activeZones = useMemo(() => deliveryZones.filter((z) => z.isActive), [deliveryZones]);

  useEffect(() => {
    if (!isOpen) return;
    setCustomerName(userProfile?.name || currentUser?.displayName || '');
    setCustomerPhone(userProfile?.phone || '');
    const defAddr = addresses.find((a) => a.isDefault) || addresses[0];
    if (defAddr) {
      setSelectedAddressId(defAddr.id);
      setGovernorate(defAddr.governorate);
      setCity(defAddr.city);
      setArea(defAddr.area);
      setStreet(defAddr.street);
      setDetails(defAddr.details || '');
      setLat(defAddr.lat ?? null);
      setLng(defAddr.lng ?? null);
    } else if (activeZones.length > 0 && !selectedZoneId) {
      const z = activeZones[0];
      setSelectedZoneId(z.id);
      setGovernorate(z.governorate);
      setCity(z.city);
      setArea(z.area);
    }
  }, [isOpen, userProfile, currentUser, addresses, activeZones, selectedZoneId]);

  const canOnlinePay =
    paymentSettings.onlinePaymentEnabled &&
    paymentSettings.onlineProvider !== 'none' &&
    paymentCapabilities.providers[paymentSettings.onlineProvider];

  useEffect(() => {
    if (fulfillmentType === 'delivery') {
      if (paymentSettings.codDeliveryEnabled) setPaymentMethod('cod_delivery');
      else if (canOnlinePay) setPaymentMethod('online');
    } else {
      if (paymentSettings.codPickupEnabled) setPaymentMethod('cod_pickup');
      else if (canOnlinePay) setPaymentMethod('online');
    }
  }, [fulfillmentType, paymentSettings, canOnlinePay]);

  if (!isOpen) return null;

  const subtotal = Number(
    cart.reduce((s, item) => s + calculateCartItemTotal(item), 0).toFixed(2),
  );

  let discountAmount = 0;
  if (appliedCoupon) {
    if (!appliedCoupon.minOrderAmount || subtotal >= appliedCoupon.minOrderAmount) {
      discountAmount =
        appliedCoupon.discountType === 'percent'
          ? Number(((subtotal * appliedCoupon.discountValue) / 100).toFixed(2))
          : Number(Math.min(subtotal, appliedCoupon.discountValue).toFixed(2));
    }
  }

  const matchedZone = activeZones.find((z) => z.id === selectedZoneId) ||
    activeZones.find((z) => z.area === area && z.city === city);
  const deliveryFee =
    fulfillmentType === 'pickup' || fulfillmentType === 'dine_in'
      ? 0
      : matchedZone
        ? matchedZone.fee
        : storeSettings.defaultDeliveryFee || 0;
  const total = Number(Math.max(0, subtotal - discountAmount + deliveryFee).toFixed(2));

  const handleSelectAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'new') {
      setStreet('');
      setDetails('');
      return;
    }
    const addr = addresses.find((a) => a.id === addrId);
    if (addr) {
      setGovernorate(addr.governorate);
      setCity(addr.city);
      setArea(addr.area);
      setStreet(addr.street);
      setDetails(addr.details || '');
      setLat(addr.lat ?? null);
      setLng(addr.lng ?? null);
      const z = activeZones.find((zn) => zn.area === addr.area && zn.city === addr.city);
      if (z) setSelectedZoneId(z.id);
    }
  };

  const handleSelectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    const z = activeZones.find((zn) => zn.id === zoneId);
    if (z) {
      setGovernorate(z.governorate);
      setCity(z.city);
      setArea(z.area);
    }
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(6)));
        setLng(Number(pos.coords.longitude.toFixed(6)));
        setLocating(false);
      },
      () => {
        setError('تعذر الحصول على الموقع الجغرافي. يرجى كتابة العنوان يدوياً.');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentUser || !currentUser.emailVerified) {
      onRequireLogin();
      return;
    }
    if (!openStatus.open && !storeSettings.allowScheduledOrders) {
      setError(`المتجر مغلق حالياً: ${openStatus.reason}`);
      return;
    }
    if (!openStatus.open && storeSettings.allowScheduledOrders && !scheduledFor.trim()) {
      setError('المتجر مغلق حالياً، يرجى تحديد موعد الطلب المجدول للمتابعة.');
      return;
    }
    if (!customerName.trim() || customerPhone.trim().length < 5) {
      setError('يرجى إدخال الاسم ورقم الهاتف بشكل صحيح');
      return;
    }
    if (fulfillmentType === 'delivery') {
      if (!governorate.trim() || !city.trim() || !area.trim() || !street.trim()) {
        setError('يرجى إكمال بيانات عنوان التوصيل (المحافظة، المدينة، المنطقة، الشارع)');
        return;
      }
    }
    if (fulfillmentType === 'dine_in' && !tableNumber.trim()) {
      setError('يرجى إدخال رقم الطاولة أو موقع الجلوس داخل المطعم');
      return;
    }

    setSubmitting(true);
    try {
      const quotePayload = {
        items: cart.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          selectedOptionChoices: c.selectedOptionChoices.map((o) => ({
            groupId: o.groupId,
            choiceId: o.choiceId,
          })),
          selectedAddonIds: c.selectedAddons.map((a) => a.id),
          note: c.note,
        })),
        fulfillmentType,
        zoneId: matchedZone?.id,
        couponCode: appliedCoupon?.code,
        scheduledFor: scheduledFor || undefined,
      };

      const verifyRes = await fetch('/api/orders/validate-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotePayload),
      });
      const verified = (await verifyRes.json()) as {
        valid: boolean;
        error?: string;
        subtotal: number;
        discountAmount: number;
        deliveryFee: number;
        total: number;
        items: Order['items'];
      };

      if (!verifyRes.ok || !verified.valid) {
        setError(verified.error || 'تعذر التحقق من الأسعار والتوفر من الخادم');
        setSubmitting(false);
        return;
      }

      const orderId = generateFirestoreId('ord');
      const orderNumber = `ZM-${Math.floor(100000 + Math.random() * 900000)}`;

      const orderDocData = stripUndefined({
        orderNumber,
        customerId: currentUser.uid,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: currentUser.email || '',
        fulfillmentType,
        deliveryAddress:
          fulfillmentType === 'delivery'
            ? {
                governorate: governorate.trim(),
                city: city.trim(),
                area: area.trim(),
                street: street.trim(),
                details: details.trim(),
                zoneId: matchedZone?.id || '',
                lat,
                lng,
              }
            : null,
        tableNumber: fulfillmentType === 'dine_in' ? tableNumber.trim().slice(0, 32) : undefined,
        pickupTime: fulfillmentType === 'pickup' ? pickupTime : undefined,
        scheduledFor: scheduledFor.trim() || undefined,
        items: verified.items,
        subtotal: verified.subtotal,
        discountAmount: verified.discountAmount,
        couponCode: appliedCoupon?.code || undefined,
        deliveryFee: verified.deliveryFee,
        total: verified.total,
        paymentMethod,
        paymentStatus: 'pending' as const,
        paymentProvider: paymentMethod === 'online' ? paymentSettings.onlineProvider : 'cash',
        status: 'new' as const,
        notes: notes.trim() || undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        await setDoc(doc(db, 'orders', orderId), orderDocData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
      }

      // Save customer phone / address if new
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          updatedAt: serverTimestamp(),
        });
        if (fulfillmentType === 'delivery' && selectedAddressId === 'new' && saveAddress) {
          const addrId = generateFirestoreId('addr');
          await setDoc(
            doc(db, 'users', currentUser.uid, 'addresses', addrId),
            stripUndefined({
              label: area.trim() || 'عنوان التوصيل',
              governorate: governorate.trim(),
              city: city.trim(),
              area: area.trim(),
              street: street.trim(),
              details: details.trim(),
              lat,
              lng,
              isDefault: addresses.length === 0,
              createdAt: serverTimestamp(),
            }),
          );
        }
        if (appliedCoupon) {
          await updateDoc(doc(db, 'offers', appliedCoupon.id), {
            usageCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Secondary profile/address/coupon update warning:', err);
      }

      // Notify store administration in real time
      const fulfillDesc =
        fulfillmentType === 'delivery'
          ? 'توصيل'
          : fulfillmentType === 'dine_in'
            ? `في المطعم - طاولة ${tableNumber.trim()}`
            : 'استلام من المحل';
      await onSendNotification({
        targetType: 'admin',
        title: `طلب جديد #${orderNumber}`,
        body: `من ${customerName.trim()} بقيمة ${formatPrice(verified.total, storeSettings.currency)} (${fulfillDesc})`,
        orderId,
      });

      // If Online Payment: create real gateway session and redirect
      if (paymentMethod === 'online' && paymentSettings.onlineProvider !== 'none') {
        const payRes = await fetch('/api/payments/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: paymentSettings.onlineProvider,
            orderId,
            orderNumber,
            quoteInput: quotePayload,
          }),
        });
        const payData = (await payRes.json()) as { checkoutUrl?: string; paymentReference?: string; error?: string };
        if (!payRes.ok || !payData.checkoutUrl || !payData.paymentReference) {
          setError(payData.error || 'تعذر بدء الدفع الإلكتروني عبر المزود.');
          setSubmitting(false);
          return;
        }
        await updateDoc(doc(db, 'orders', orderId), {
          paymentReference: payData.paymentReference,
          updatedAt: serverTimestamp(),
        });
        window.location.href = payData.checkoutUrl;
        return;
      }

      onOrderCreated({
        id: orderId,
        ...orderDocData,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء إتمام الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] bg-white sm:rounded-3xl border border-zinc-200 flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-zinc-900">إتمام الطلب</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-6 space-y-6">
          {!currentUser && (
            <div className="rounded-2xl border border-[#E94F36]/30 bg-[#E94F36]/8 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="text-sm text-zinc-800">
                <p className="font-bold">تسجيل الدخول مطلوب لإرسال الطلب وتتبع حالته</p>
                <p className="text-xs text-zinc-600 mt-0.5">ستبقى سلتك محفوظة بالكامل بعد تسجيل الدخول.</p>
              </div>
              <button
                type="button"
                onClick={onRequireLogin}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 shrink-0"
              >
                تسجيل الدخول
              </button>
            </div>
          )}

          {!openStatus.open && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
              <p className="font-bold">{openStatus.reason}</p>
              {storeSettings.allowScheduledOrders ? (
                <div>
                  <label className="block text-xs font-bold mb-1">اختر موعد الطلب المجدول:</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    required
                    className="w-full h-10 rounded-xl border border-amber-300 bg-white px-3 text-sm"
                  />
                </div>
              ) : (
                <p className="text-xs">الطلبات متوقفة حتى أوقات العمل القادمة.</p>
              )}
            </div>
          )}

          {/* Fulfillment Type */}
          <div className="space-y-2.5">
            <label className="block text-sm font-bold text-zinc-900">طريقة الطلب</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {storeSettings.deliveryEnabled && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('delivery')}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3.5 text-xs sm:text-sm font-bold transition-colors ${
                    fulfillmentType === 'delivery'
                      ? 'border-[#E94F36] bg-[#E94F36]/10 text-[#E94F36]'
                      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Truck className="w-4 h-4 shrink-0" />
                  <span>التوصيل للمنزل</span>
                </button>
              )}
              {storeSettings.pickupEnabled && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('pickup')}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3.5 text-xs sm:text-sm font-bold transition-colors ${
                    fulfillmentType === 'pickup'
                      ? 'border-[#E94F36] bg-[#E94F36]/10 text-[#E94F36]'
                      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>استلام من المطعم</span>
                </button>
              )}
              {(storeSettings.dineInEnabled ?? true) && (
                <button
                  type="button"
                  onClick={() => setFulfillmentType('dine_in')}
                  className={`flex items-center justify-center gap-2 rounded-2xl border p-3.5 text-xs sm:text-sm font-bold transition-colors ${
                    fulfillmentType === 'dine_in'
                      ? 'border-[#E94F36] bg-[#E94F36]/10 text-[#E94F36]'
                      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <UtensilsCrossed className="w-4 h-4 shrink-0" />
                  <span>تناول في المطعم</span>
                </button>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">اسم العميل *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="الاسم الكامل"
                className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm focus:outline-none focus:border-[#E94F36]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">رقم الهاتف *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm focus:outline-none focus:border-[#E94F36] tabular-nums"
              />
            </div>
          </div>

          {/* Delivery Details */}
          {fulfillmentType === 'delivery' ? (
            <div className="space-y-4 pt-2 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900">عنوان التوصيل</span>
                <button
                  type="button"
                  onClick={handleGeolocate}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E94F36] hover:underline"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{locating ? 'جاري التحديد...' : lat ? `تم تحديد الموقع (${lat}, ${lng})` : 'تحديد موقعي الحالي'}</span>
                </button>
              </div>

              {addresses.length > 0 && (
                <select
                  value={selectedAddressId}
                  onChange={(e) => handleSelectAddress(e.target.value)}
                  className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm bg-white"
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.city}، {a.area}، {a.street}
                    </option>
                  ))}
                  <option value="new">+ عنوان توصيل جديد</option>
                </select>
              )}

              {activeZones.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1.5">منطقة التوصيل المعتمدة</label>
                  <select
                    value={selectedZoneId}
                    onChange={(e) => handleSelectZone(e.target.value)}
                    className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm bg-white"
                  >
                    <option value="">اختر المنطقة...</option>
                    {activeZones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.governorate} / {z.city} / {z.area} — رسوم التوصيل: {formatPrice(z.fee, storeSettings.currency)} ({z.estimatedMinutes} د)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  placeholder="المحافظة *"
                  className="h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="المدينة *"
                  className="h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
                <input
                  type="text"
                  required
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="المنطقة / الحي *"
                  className="h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="الشارع *"
                  className="h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
                <input
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="رقم المبنى، الشقة، علامة مميزة"
                  className="h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
              </div>

              {selectedAddressId === 'new' && currentUser && (
                <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(e) => setSaveAddress(e.target.checked)}
                    className="rounded border-zinc-300 accent-[#E94F36]"
                  />
                  <span>حفظ هذا العنوان في حسابي للطلبات القادمة</span>
                </label>
              )}
            </div>
          ) : fulfillmentType === 'dine_in' ? (
            <div className="space-y-3 pt-2 border-t border-zinc-100">
              <div className="flex items-start gap-2.5 text-sm text-zinc-700 bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200">
                <UtensilsCrossed className="w-4 h-4 text-[#E94F36] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">خدمة الطلب على الطاولة داخل {storeSettings.nameAr}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">أدخل رقم طاولتك وسيتم تحضير وتقديم الطلب إليك مباشرة.</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">رقم الطاولة *</label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="مثال: طاولة 4 أو القسم العائلي"
                  className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-2 border-t border-zinc-100">
              <div className="flex items-start gap-2.5 text-sm text-zinc-700 bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200">
                <MapPin className="w-4 h-4 text-[#E94F36] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">الاستلام من فرع {storeSettings.nameAr}</p>
                  {storeSettings.address && <p className="text-xs text-zinc-500 mt-0.5">{storeSettings.address}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1.5">وقت الاستلام المفضل</label>
                <input
                  type="text"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  placeholder="مثال: خلال 20 دقيقة أو الساعة 6:30 مساءً"
                  className="w-full h-11 rounded-xl border border-zinc-200 px-3.5 text-sm"
                />
              </div>
            </div>
          )}

          {/* Payment Methods */}
          <div className="space-y-2.5 pt-2 border-t border-zinc-100">
            <label className="block text-sm font-bold text-zinc-900">طريقة الدفع</label>
            <div className="space-y-2">
              {fulfillmentType === 'delivery' && paymentSettings.codDeliveryEnabled && (
                <label className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3.5 cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'cod_delivery'}
                      onChange={() => setPaymentMethod('cod_delivery')}
                      className="accent-[#E94F36]"
                    />
                    <Wallet className="w-4 h-4 text-[#B8E638]" />
                    <span className="text-sm font-bold text-zinc-800">الدفع نقداً عند التوصيل</span>
                  </div>
                </label>
              )}

              {(fulfillmentType === 'pickup' || fulfillmentType === 'dine_in') && paymentSettings.codPickupEnabled && (
                <label className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3.5 cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'cod_pickup'}
                      onChange={() => setPaymentMethod('cod_pickup')}
                      className="accent-[#E94F36]"
                    />
                    <Wallet className="w-4 h-4 text-[#B8E638]" />
                    <span className="text-sm font-bold text-zinc-800">
                      {fulfillmentType === 'dine_in' ? 'الدفع عند الكاشير / الطاولة' : 'الدفع نقداً عند الاستلام من المحل'}
                    </span>
                  </div>
                </label>
              )}

              {canOnlinePay && (
                <label className="flex items-center justify-between rounded-2xl border border-zinc-200 p-3.5 cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === 'online'}
                      onChange={() => setPaymentMethod('online')}
                      className="accent-[#E94F36]"
                    />
                    <CreditCard className="w-4 h-4 text-[#65D9EA]" />
                    <span className="text-sm font-bold text-zinc-800">
                      الدفع الإلكتروني ({paymentSettings.onlineProvider.toUpperCase()})
                    </span>
                  </div>
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1.5">ملاحظات إضافية للطلب</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="أي تعليمات للتوصيل أو التحضير..."
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm"
            />
          </div>

          {/* Summary */}
          <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 space-y-2 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>المجموع الفرعي</span>
              <span className="tabular-nums">{formatPrice(subtotal, storeSettings.currency)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>الخصم</span>
                <span className="tabular-nums">-{formatPrice(discountAmount, storeSettings.currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-zinc-600">
              <span>رسوم التوصيل</span>
              <span className="tabular-nums">
                {fulfillmentType === 'pickup' || fulfillmentType === 'dine_in'
                  ? 'مجاناً'
                  : formatPrice(deliveryFee, storeSettings.currency)}
              </span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-zinc-900 pt-2 border-t border-zinc-200">
              <span>الإجمالي النهائي</span>
              <span className="tabular-nums text-[#E94F36]">{formatPrice(total, storeSettings.currency)}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-3 text-xs font-bold text-[#E94F36]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (!openStatus.open && !storeSettings.allowScheduledOrders)}
            className="w-full h-12 rounded-xl bg-[#E94F36] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#d54028] disabled:opacity-50 transition-colors"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري التحقق وإرسال الطلب...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد الطلب · {formatPrice(total, storeSettings.currency)}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
