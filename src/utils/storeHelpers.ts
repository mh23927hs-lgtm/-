import * as XLSX from 'xlsx';
import type {
  CartItem,
  DayKey,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductCost,
  StaffPermissions,
  StoreSettings,
} from '../types';

export const USER_LOGO_PATH = '/assets/aistudio/file_000000008a788246a01a23c1b3bd297c_5dbd2452.png';

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  nameAr: 'زاد مهاوي',
  nameEn: 'ZAD MAHAWI',
  description: 'معجنات وسندويشات وأطعمة طازجة محضّرة يومياً بعناية.',
  logoUrl: '',
  heroImageUrl: '',
  heroTitle: 'زاد مهاوي — نكهة المعجنات والسندويشات الطازجة',
  heroSubtitle: 'اطلب الآن توصيلاً إلى باب منزلك أو استلاماً سريعاً من المحل.',
  phone: '0791917755',
  whatsapp: '0791917755',
  address: '',
  currency: 'د.أ',
  minOrderAmount: 0,
  defaultDeliveryFee: 0,
  isAcceptingOrders: true,
  allowScheduledOrders: false,
  pickupEnabled: true,
  deliveryEnabled: true,
  dineInEnabled: true,
  announcementEnabled: false,
  announcementText: '',
  workingHours: {
    sat: { open: '08:00', close: '23:00', closed: false },
    sun: { open: '08:00', close: '23:00', closed: false },
    mon: { open: '08:00', close: '23:00', closed: false },
    tue: { open: '08:00', close: '23:00', closed: false },
    wed: { open: '08:00', close: '23:00', closed: false },
    thu: { open: '08:00', close: '23:59', closed: false },
    fri: { open: '13:00', close: '23:59', closed: false },
  },
  holidays: [],
  homeSectionsOrder: ['offers', 'categories', 'featured', 'bestsellers', 'new'],
  faqItems: [],
  privacyPolicy: 'نلتزم في زاد مهاوي بحماية خصوصية بيانات العملاء وعدم مشاركتها مع أي طرف ثالث إلا بالقدر اللازم لإتمام الطلب والتوصيل.',
  termsOfUse: 'تخضع جميع الطلبات لتوفر الأصناف وساعات العمل المعلنة في المتجر.',
  refundPolicy: 'يحق للعميل إلغاء الطلب قبل بدء التحضير. في حال الدفع الإلكتروني يتم استرداد المبلغ عبر نفس وسيلة الدفع.',
};

export const DAY_LABELS: Record<DayKey, string> = {
  sat: 'السبت',
  sun: 'الأحد',
  mon: 'الإثنين',
  tue: 'الثلاثاء',
  wed: 'الأربعاء',
  thu: 'الخميس',
  fri: 'الجمعة',
};

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; colorClass: string; stepIndex: number }
> = {
  new: { label: 'طلب جديد', colorClass: 'text-[#E94F36] bg-[#E94F36]/10 border-[#E94F36]/25', stepIndex: 0 },
  received: { label: 'تم استلام الطلب', colorClass: 'text-sky-700 bg-sky-50 border-sky-200', stepIndex: 1 },
  preparing: { label: 'جاري التحضير', colorClass: 'text-amber-700 bg-amber-50 border-amber-200', stepIndex: 2 },
  ready: { label: 'جاهز للاستلام', colorClass: 'text-lime-800 bg-[#B8E638]/25 border-[#B8E638]/50', stepIndex: 3 },
  out_for_delivery: { label: 'خرج للتوصيل', colorClass: 'text-cyan-800 bg-[#65D9EA]/25 border-[#65D9EA]/50', stepIndex: 4 },
  delivered: { label: 'تم التسليم', colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200', stepIndex: 5 },
  cancelled: { label: 'ملغي', colorClass: 'text-zinc-600 bg-zinc-100 border-zinc-300', stepIndex: -1 },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod_delivery: 'الدفع نقداً عند التوصيل',
  cod_pickup: 'الدفع نقداً عند الاستلام من المحل',
  online: 'الدفع الإلكتروني',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'بانتظار الدفع',
  paid: 'مدفوع',
  failed: 'فشل الدفع',
  refunded: 'مسترد',
};

export const FULFILLMENT_LABELS: Record<Order['fulfillmentType'], string> = {
  delivery: 'توصيل للمنزل',
  pickup: 'استلام من المطعم',
  dine_in: 'تناول في المطعم',
};

export function playNewOrderChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [659.25, 880]; // E5 -> A5 clean kitchen bell
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.001, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1000);
  } catch {
    // Ignore audio context restriction errors before user gesture
  }
}

export const DEFAULT_STAFF_PERMISSIONS: Record<'owner' | 'manager' | 'employee', StaffPermissions> = {
  owner: {
    manageProducts: true,
    manageCategories: true,
    manageOrders: true,
    manageCustomers: true,
    manageOffers: true,
    manageDelivery: true,
    managePayments: true,
    manageSettings: true,
    manageHome: true,
    manageNotifications: true,
    manageStaff: true,
    viewReports: true,
  },
  manager: {
    manageProducts: true,
    manageCategories: true,
    manageOrders: true,
    manageCustomers: true,
    manageOffers: true,
    manageDelivery: true,
    managePayments: false,
    manageSettings: false,
    manageHome: true,
    manageNotifications: true,
    manageStaff: false,
    viewReports: true,
  },
  employee: {
    manageProducts: false,
    manageCategories: false,
    manageOrders: true,
    manageCustomers: false,
    manageOffers: false,
    manageDelivery: false,
    managePayments: false,
    manageSettings: false,
    manageHome: false,
    manageNotifications: false,
    manageStaff: false,
    viewReports: false,
  },
};

export function formatWhatsAppUrl(raw: string): string {
  const digitsOnly = (raw || '').replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';
  let normalized = digitsOnly;
  if (normalized.startsWith('00')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('07') && normalized.length === 10) {
    normalized = `962${normalized.slice(1)}`;
  } else if (normalized.startsWith('0') && normalized.length >= 9 && normalized.length <= 10) {
    normalized = `962${normalized.slice(1)}`;
  }
  return `https://wa.me/${normalized}`;
}

export function formatPrice(amount: number, currency = 'د.أ'): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return `${num.toFixed(2).replace(/\.00$/, '')} ${currency}`;
}

export function formatDateTime(ts: unknown): string {
  if (!ts) return '—';
  let date: Date | null = null;
  if (ts instanceof Date) {
    date = ts;
  } else if (typeof ts === 'string' || typeof ts === 'number') {
    date = new Date(ts);
  } else if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    date = (ts as { toDate: () => Date }).toDate();
  } else if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    date = new Date(Number((ts as { seconds: number }).seconds) * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-JO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function timestampToMillis(ts: unknown): number {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'string' || typeof ts === 'number') return new Date(ts).getTime() || 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}

export function isStoreCurrentlyOpen(settings: StoreSettings): { open: boolean; reason: string } {
  if (!settings.isAcceptingOrders) {
    return { open: false, reason: 'المتجر متوقف عن استقبال الطلبات مؤقتاً' };
  }
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  if (Array.isArray(settings.holidays) && settings.holidays.includes(todayIso)) {
    return { open: false, reason: 'اليوم عطلة رسمية للمتجر' };
  }
  const dayMap: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayMap[now.getDay()];
  const schedule = settings.workingHours?.[dayKey];
  if (!schedule) return { open: true, reason: 'مفتوح الآن' };
  if (schedule.closed) {
    return { open: false, reason: `مغلق اليوم (${DAY_LABELS[dayKey]})` };
  }
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentHHMM = `${hh}:${mm}`;
  if (currentHHMM < schedule.open || currentHHMM > schedule.close) {
    return { open: false, reason: `خارج ساعات العمل (${schedule.open} - ${schedule.close})` };
  }
  return { open: true, reason: `مفتوح الآن حتى ${schedule.close}` };
}

export function getEffectiveProductPrice(product: Product): number {
  if (
    typeof product.discountPrice === 'number' &&
    product.discountPrice >= 0 &&
    product.discountPrice < product.price
  ) {
    return product.discountPrice;
  }
  return product.price;
}

export function calculateCartItemTotal(item: CartItem): number {
  const optionsSum = item.selectedOptionChoices.reduce((s, o) => s + (o.extraPrice || 0), 0);
  const addonsSum = item.selectedAddons.reduce((s, a) => s + (a.price || 0), 0);
  return Number(((item.baseUnitPrice + optionsSum + addonsSum) * item.quantity).toFixed(2));
}

export async function compressImageToDataUrl(file: File, maxDimension = 900, quality = 0.8): Promise<{ dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL(mimeType, quality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ dataUrl, mimeType: dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function exportReportToExcel(
  orders: Order[],
  costsMap: Record<string, ProductCost>,
  currency: string,
  periodLabel: string,
) {
  const orderRows = orders.map((o) => {
    const costSum = o.items.reduce((acc, item) => {
      const c = costsMap[item.productId]?.costPrice ?? 0;
      return acc + c * item.quantity;
    }, 0);
    const profit = o.status === 'cancelled' ? 0 : Number((o.subtotal - o.discountAmount - costSum).toFixed(2));
    return {
      'رقم الطلب': o.orderNumber,
      'التاريخ': formatDateTime(o.createdAt),
      'العميل': o.customerName,
      'الهاتف': o.customerPhone,
      'الاستلام':
        o.fulfillmentType === 'delivery'
          ? 'توصيل'
          : o.fulfillmentType === 'dine_in'
            ? `في المطعم${o.tableNumber ? ` (طاولة ${o.tableNumber})` : ''}`
            : 'استلام من المحل',
      'الدفع': PAYMENT_METHOD_LABELS[o.paymentMethod],
      'حالة الدفع': PAYMENT_STATUS_LABELS[o.paymentStatus],
      'الحالة': ORDER_STATUS_META[o.status].label,
      [`المجموع الفرعي (${currency})`]: o.subtotal,
      [`الخصم (${currency})`]: o.discountAmount,
      [`رسوم التوصيل (${currency})`]: o.deliveryFee,
      [`الإجمالي (${currency})`]: o.total,
      [`التكلفة (${currency})`]: Number(costSum.toFixed(2)),
      [`الربح التقديري (${currency})`]: profit,
    };
  });

  const ws = XLSX.utils.json_to_sheet(orderRows.length > 0 ? orderRows : [{ 'ملاحظة': 'لا توجد طلبات في هذه الفترة' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير المبيعات');
  XLSX.writeFile(wb, `zad-mahawi-report-${periodLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
