import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Loader2,
  Plus,
  Send,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, generateFirestoreId, handleFirestoreError, OperationType, stripUndefined } from '../../firebase';
import type {
  AppNotification,
  AuditLog,
  Banner,
  Category,
  DayKey,
  DeliveryZone,
  Offer,
  OnlineProvider,
  PaymentCapabilities,
  PaymentSettings,
  Product,
  StaffInvite,
  StaffPermissions,
  StaffRole,
  StoreSettings,
} from '../../types';
import {
  compressImageToDataUrl,
  DAY_LABELS,
  DEFAULT_STAFF_PERMISSIONS,
  formatDateTime,
  formatPrice,
} from '../../utils/storeHelpers';
import { MediaImage } from '../MediaImage';

interface OperationsPanelsProps {
  tab: 'offers' | 'delivery' | 'payments' | 'home' | 'settings' | 'notifications' | 'staff';
  storeSettings: StoreSettings;
  paymentSettings: PaymentSettings;
  paymentCapabilities: PaymentCapabilities;
  banners: Banner[];
  categories: Category[];
  offers: Offer[];
  deliveryZones: DeliveryZone[];
  products: Product[];
  staffInvites: StaffInvite[];
  auditLogs: AuditLog[];
  adminNotifications: AppNotification[];
  isOwner: boolean;
  onUploadMedia: (dataUrl: string, mimeType: string) => Promise<string>;
  onSendNotification: (p: {
    targetType: 'user' | 'admin' | 'broadcast';
    targetUserId?: string;
    title: string;
    body: string;
    orderId?: string;
  }) => Promise<void>;
  onLogAction: (action: string, col: string, id: string, summary: string) => Promise<void>;
}

const PERMISSION_LABELS: Record<keyof StaffPermissions, string> = {
  manageProducts: 'إدارة المنتجات',
  manageCategories: 'إدارة الأقسام',
  manageOrders: 'إدارة الطلبات',
  manageCustomers: 'إدارة العملاء',
  manageOffers: 'إدارة العروض',
  manageDelivery: 'إدارة التوصيل',
  managePayments: 'إدارة الدفع',
  manageSettings: 'إعدادات المحل الحساسة',
  manageHome: 'إدارة الرئيسية والبنرات',
  manageNotifications: 'إرسال الإشعارات',
  manageStaff: 'إدارة الموظفين والصلاحيات',
  viewReports: 'عرض التقارير والأرباح',
};

export const AdminOperationsPanels: React.FC<OperationsPanelsProps> = ({
  tab,
  storeSettings,
  paymentSettings,
  paymentCapabilities,
  banners,
  categories,
  offers,
  deliveryZones,
  products,
  staffInvites,
  auditLogs,
  adminNotifications,
  isOwner,
  onUploadMedia,
  onSendNotification,
  onLogAction,
}) => {
  const [toast, setToast] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  // Offers State
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerType, setOfferType] = useState<'discount' | 'coupon'>('coupon');
  const [offerCode, setOfferCode] = useState('');
  const [offerDiscountType, setOfferDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [offerValue, setOfferValue] = useState('10');
  const [offerMinOrder, setOfferMinOrder] = useState('');
  const [offerStart, setOfferStart] = useState('');
  const [offerEnd, setOfferEnd] = useState('');
  const [offerProductIds, setOfferProductIds] = useState<string[]>([]);

  // Delivery Zone State
  const [zoneGov, setZoneGov] = useState('');
  const [zoneCity, setZoneCity] = useState('');
  const [zoneArea, setZoneArea] = useState('');
  const [zoneFee, setZoneFee] = useState('10');
  const [zoneMin, setZoneMin] = useState('0');
  const [zoneMins, setZoneMins] = useState('35');

  // Banner State
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSub, setBannerSub] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [bannerLinkType, setBannerLinkType] = useState<'none' | 'category' | 'product' | 'offer'>('none');
  const [bannerLinkTarget, setBannerLinkTarget] = useState('');
  const [bannerOrder, setBannerOrder] = useState(1);

  // Settings local draft (synced whenever remote storeSettings updates)
  const [settingsDraft, setSettingsDraft] = useState<StoreSettings>(storeSettings);
  useEffect(() => {
    setSettingsDraft(storeSettings);
  }, [storeSettings]);

  const [holidayInput, setHolidayInput] = useState('');
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');

  // Broadcast notification state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');

  // Staff / Moderator Invite State
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('manager');
  const [staffPerms, setStaffPerms] = useState<StaffPermissions>(DEFAULT_STAFF_PERMISSIONS.manager);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleUpload = async (file: File | undefined, key: string, cb: (url: string) => void) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(file);
      const url = await onUploadMedia(dataUrl, mimeType);
      cb(url);
      showToast('تم رفع الصورة بنجاح');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploadingKey(null);
    }
  };

  // OFFERS
  if (tab === 'offers') {
    const handleCreateOffer = async (e: React.FormEvent) => {
      e.preventDefault();
      const id = generateFirestoreId('off');
      await setDoc(
        doc(db, 'offers', id),
        stripUndefined({
          title: offerTitle.trim(),
          description: offerDesc.trim() || undefined,
          type: offerType,
          code: offerType === 'coupon' ? offerCode.trim().toUpperCase() : undefined,
          discountType: offerDiscountType,
          discountValue: Number(offerValue) || 0,
          minOrderAmount: offerMinOrder ? Number(offerMinOrder) : null,
          startDate: offerStart || undefined,
          endDate: offerEnd || undefined,
          productIds: offerProductIds,
          isActive: true,
          usageCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      await onLogAction('create_offer', 'offers', id, offerTitle.trim());
      setOfferTitle('');
      setOfferDesc('');
      setOfferCode('');
      setOfferProductIds([]);
      showToast('تم إنشاء العرض/الكوبون بنجاح');
    };

    return (
      <div className="space-y-6">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة العروض وكوبونات الخصم</h2>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <form onSubmit={handleCreateOffer} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input required value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} placeholder="عنوان العرض *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <select value={offerType} onChange={(e) => setOfferType(e.target.value as 'discount' | 'coupon')} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white">
              <option value="coupon">كوبون خصم بكود</option>
              <option value="discount">عرض ترويجي عام</option>
            </select>
            {offerType === 'coupon' && (
              <input required value={offerCode} onChange={(e) => setOfferCode(e.target.value)} placeholder="كود الكوبون (مثال: ZAD10)" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm font-mono uppercase" />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <select value={offerDiscountType} onChange={(e) => setOfferDiscountType(e.target.value as 'percent' | 'fixed')} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white">
              <option value="percent">نسبة مئوية (%)</option>
              <option value="fixed">مبلغ ثابت</option>
            </select>
            <input type="number" min="0" step="0.01" required value={offerValue} onChange={(e) => setOfferValue(e.target.value)} placeholder="قيمة الخصم" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            <input type="number" min="0" step="0.01" value={offerMinOrder} onChange={(e) => setOfferMinOrder(e.target.value)} placeholder="الحد الأدنى للطلب" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            <input value={offerDesc} onChange={(e) => setOfferDesc(e.target.value)} placeholder="وصف العرض" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">تاريخ البداية</label>
              <input type="date" value={offerStart} onChange={(e) => setOfferStart(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">تاريخ النهاية</label>
              <input type="date" value={offerEnd} onChange={(e) => setOfferEnd(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            </div>
          </div>
          {products.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">المنتجات المشمولة (اتركه فارغاً ليشمل كل القائمة)</label>
              <div className="flex flex-wrap gap-2">
                {products.map((p) => (
                  <label key={p.id} className="inline-flex items-center gap-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={offerProductIds.includes(p.id)}
                      onChange={(e) =>
                        setOfferProductIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                      }
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <button type="submit" className="px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]">
            حفظ العرض
          </button>
        </form>

        <div className="space-y-2.5">
          {offers.map((o) => (
            <div key={o.id} className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-sm text-zinc-900">
                  {o.title} {o.code ? `(${o.code})` : ''}
                </h4>
                <p className="text-xs text-zinc-500">
                  {o.discountType === 'percent' ? `${o.discountValue}%` : formatPrice(o.discountValue, storeSettings.currency)} · مرات الاستخدام: {o.usageCount}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDoc(doc(db, 'offers', o.id), { isActive: !o.isActive, updatedAt: serverTimestamp() })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${o.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-300 text-zinc-600'}`}
                >
                  {o.isActive ? 'مفعل' : 'متوقف'}
                </button>
                <button onClick={() => deleteDoc(doc(db, 'offers', o.id))} className="p-2 text-[#E94F36]">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // DELIVERY ZONES
  if (tab === 'delivery') {
    const handleAddZone = async (e: React.FormEvent) => {
      e.preventDefault();
      const id = generateFirestoreId('zone');
      await setDoc(doc(db, 'delivery_zones', id), {
        governorate: zoneGov.trim(),
        city: zoneCity.trim(),
        area: zoneArea.trim(),
        fee: Number(zoneFee) || 0,
        minOrderAmount: Number(zoneMin) || 0,
        estimatedMinutes: Number(zoneMins) || 30,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await onLogAction('create_zone', 'delivery_zones', id, `${zoneCity} - ${zoneArea}`);
      setZoneArea('');
      showToast('تمت إضافة منطقة التوصيل');
    };

    return (
      <div className="space-y-6">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة مناطق ورسوم التوصيل</h2>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <form onSubmit={handleAddZone} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input required value={zoneGov} onChange={(e) => setZoneGov(e.target.value)} placeholder="المحافظة *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input required value={zoneCity} onChange={(e) => setZoneCity(e.target.value)} placeholder="المدينة *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input required value={zoneArea} onChange={(e) => setZoneArea(e.target.value)} placeholder="المنطقة / الحي *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">رسوم التوصيل</label>
              <input type="number" min="0" step="0.01" required value={zoneFee} onChange={(e) => setZoneFee(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">الحد الأدنى للطلب</label>
              <input type="number" min="0" step="0.01" required value={zoneMin} onChange={(e) => setZoneMin(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">مدة التوصيل المتوقعة (دقيقة)</label>
              <input type="number" min="1" required value={zoneMins} onChange={(e) => setZoneMins(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            </div>
          </div>
          <button type="submit" className="px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold">
            إضافة منطقة التوصيل
          </button>
        </form>

        <div className="space-y-2.5">
          {deliveryZones.map((z) => (
            <div key={z.id} className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-sm text-zinc-900">
                  {z.governorate} / {z.city} / {z.area}
                </h4>
                <p className="text-xs text-zinc-500 tabular-nums">
                  الرسوم: {formatPrice(z.fee, storeSettings.currency)} · الحد الأدنى: {formatPrice(z.minOrderAmount, storeSettings.currency)} · المدة: {z.estimatedMinutes} دقيقة
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDoc(doc(db, 'delivery_zones', z.id), { isActive: !z.isActive, updatedAt: serverTimestamp() })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${z.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-300 text-zinc-600'}`}
                >
                  {z.isActive ? 'مفعلة' : 'متوقفة'}
                </button>
                <button onClick={() => deleteDoc(doc(db, 'delivery_zones', z.id))} className="p-2 text-[#E94F36]">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // PAYMENTS
  if (tab === 'payments') {
    const savePaymentConfig = async (next: PaymentSettings) => {
      try {
        await setDoc(doc(db, 'settings', 'payments'), {
          ...next,
          updatedAt: serverTimestamp(),
        });
        await onLogAction('update_payments', 'settings', 'payments', `تحديث طرق الدفع`);
        showToast('تم حفظ إعدادات الدفع');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/payments');
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة وسائل وبوابات الدفع</h2>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 cursor-pointer">
            <span className="font-bold text-sm text-zinc-900">الدفع نقداً عند التوصيل</span>
            <input
              type="checkbox"
              checked={paymentSettings.codDeliveryEnabled}
              onChange={(e) => savePaymentConfig({ ...paymentSettings, codDeliveryEnabled: e.target.checked })}
              className="accent-[#E94F36] w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 cursor-pointer">
            <span className="font-bold text-sm text-zinc-900">الدفع نقداً عند الاستلام من المحل</span>
            <input
              type="checkbox"
              checked={paymentSettings.codPickupEnabled}
              onChange={(e) => savePaymentConfig({ ...paymentSettings, codPickupEnabled: e.target.checked })}
              className="accent-[#E94F36] w-4 h-4"
            />
          </label>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-sm text-zinc-900">الدفع الإلكتروني الحقيقي</h3>
                <p className="text-xs text-zinc-600 mt-0.5">
                  لا يظهر الدفع الإلكتروني للعملاء قبل ربط مفتاح API سري حقيقي في إعدادات الخادم (Secrets).
                </p>
              </div>
              <input
                type="checkbox"
                disabled={!paymentCapabilities.anyConfigured}
                checked={paymentSettings.onlinePaymentEnabled && paymentCapabilities.anyConfigured}
                onChange={(e) =>
                  savePaymentConfig({
                    ...paymentSettings,
                    onlinePaymentEnabled: e.target.checked,
                  })
                }
                className="accent-[#E94F36] w-4 h-4"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {(['stripe', 'moyasar', 'tap'] as const).map((prov) => {
                const ready = paymentCapabilities.providers[prov];
                return (
                  <button
                    key={prov}
                    type="button"
                    disabled={!ready}
                    onClick={() =>
                      savePaymentConfig({
                        ...paymentSettings,
                        onlineProvider: prov as OnlineProvider,
                        onlinePaymentEnabled: true,
                      })
                    }
                    className={`p-3 rounded-xl border text-right transition-colors ${
                      paymentSettings.onlineProvider === prov && ready
                        ? 'border-[#E94F36] bg-white font-bold'
                        : 'border-zinc-200 bg-white/70'
                    } ${!ready ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="font-bold uppercase">{prov}</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {ready ? 'مفعل وجاهز على الخادم' : `يتطلب ${prov.toUpperCase()}_SECRET_KEY`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // HOME & BANNERS
  if (tab === 'home') {
    const SECTION_LABELS: Record<string, string> = {
      offers: 'العروض والخصومات',
      categories: 'الأقسام الرئيسية',
      featured: 'المنتجات المميزة',
      bestsellers: 'الأكثر مبيعاً',
      new: 'المنتجات الجديدة',
    };

    const currentSections =
      settingsDraft.homeSectionsOrder && settingsDraft.homeSectionsOrder.length > 0
        ? settingsDraft.homeSectionsOrder
        : ['offers', 'categories', 'featured', 'bestsellers', 'new'];

    const moveSection = (idx: number, dir: -1 | 1) => {
      const target = idx + dir;
      if (target < 0 || target >= currentSections.length) return;
      const next = [...currentSections];
      [next[idx], next[target]] = [next[target], next[idx]];
      setSettingsDraft({ ...settingsDraft, homeSectionsOrder: next });
    };

    const saveHomeTexts = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await setDoc(doc(db, 'settings', 'store'), stripUndefined({ ...settingsDraft, updatedAt: serverTimestamp() }));
        await onLogAction('update_home', 'settings', 'store', 'تحديث واجهة الرئيسية');
        showToast('تم حفظ إعدادات الصفحة الرئيسية');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/store');
      }
    };

    const handleAddBanner = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const id = generateFirestoreId('ban');
        await setDoc(
          doc(db, 'banners', id),
          stripUndefined({
            title: bannerTitle.trim(),
            subtitle: bannerSub.trim() || undefined,
            imageUrl: bannerImage.trim() || undefined,
            linkType: bannerLinkType,
            linkTarget: bannerLinkType === 'none' || bannerLinkType === 'offer' ? undefined : bannerLinkTarget || undefined,
            sortOrder: Number(bannerOrder) || 1,
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
        await onLogAction('create_banner', 'banners', id, bannerTitle.trim());
        setBannerTitle('');
        setBannerSub('');
        setBannerImage('');
        setBannerLinkType('none');
        setBannerLinkTarget('');
        showToast('تمت إضافة البنر بنجاح');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'banners');
      }
    };

    return (
      <div className="space-y-6">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة الصفحة الرئيسية والبنرات</h2>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <form onSubmit={saveHomeTexts} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">العنوان الرئيسي</label>
              <input value={settingsDraft.heroTitle} onChange={(e) => setSettingsDraft({ ...settingsDraft, heroTitle: e.target.value })} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1">النص الفرعي</label>
              <input value={settingsDraft.heroSubtitle} onChange={(e) => setSettingsDraft({ ...settingsDraft, heroSubtitle: e.target.value })} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {settingsDraft.heroImageUrl && (
              <MediaImage src={settingsDraft.heroImageUrl} alt="صورة الرئيسية" className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0" />
            )}
            <input value={settingsDraft.heroImageUrl} onChange={(e) => setSettingsDraft({ ...settingsDraft, heroImageUrl: e.target.value })} placeholder="رابط الصورة الرئيسية" className="flex-1 h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold cursor-pointer">
              {uploadingKey === 'hero' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploadingKey === 'hero' ? 'جاري الرفع...' : 'رفع صورة رئيسية'}</span>
              <input type="file" accept="image/*" disabled={uploadingKey === 'hero'} className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], 'hero', (u) => setSettingsDraft({ ...settingsDraft, heroImageUrl: u }))} />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center pt-2 border-t border-zinc-100">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-zinc-800 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.announcementEnabled} onChange={(e) => setSettingsDraft({ ...settingsDraft, announcementEnabled: e.target.checked })} className="accent-[#E94F36]" />
              <span>تفعيل شريط الإعلانات العلوي</span>
            </label>
            <input value={settingsDraft.announcementText} onChange={(e) => setSettingsDraft({ ...settingsDraft, announcementText: e.target.value })} placeholder="نص الإعلان..." className="sm:col-span-2 h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          </div>

          <div className="pt-2 border-t border-zinc-100 space-y-2">
            <label className="block text-xs font-bold text-zinc-700">ترتيب أقسام الصفحة الرئيسية</label>
            <div className="space-y-1.5">
              {currentSections.map((secKey, idx) => (
                <div key={secKey} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold text-zinc-800">
                  <span>{idx + 1}. {SECTION_LABELS[secKey] || secKey}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveSection(idx, -1)} disabled={idx === 0} className="p-1 rounded-lg hover:bg-zinc-200 disabled:opacity-30" aria-label="أعلى">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => moveSection(idx, 1)} disabled={idx === currentSections.length - 1} className="p-1 rounded-lg hover:bg-zinc-200 disabled:opacity-30" aria-label="أسفل">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="submit" className="px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold">
            حفظ تغييرات الرئيسية
          </button>
        </form>

        <form onSubmit={handleAddBanner} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-zinc-900">إضافة بنر ترويجي</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input required value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} placeholder="عنوان البنر *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input value={bannerSub} onChange={(e) => setBannerSub(e.target.value)} placeholder="نص إضافي" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input type="number" value={bannerOrder} onChange={(e) => setBannerOrder(Number(e.target.value))} placeholder="الترتيب" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={bannerLinkType}
              onChange={(e) => {
                setBannerLinkType(e.target.value as 'none' | 'category' | 'product' | 'offer');
                setBannerLinkTarget('');
              }}
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
            >
              <option value="none">بنر عرض فقط (بدون ربط)</option>
              <option value="category">فتح قسم محدد عند الضغط</option>
              <option value="product">فتح منتج محدد عند الضغط</option>
              <option value="offer">الانتقال إلى قسم العروض</option>
            </select>
            {bannerLinkType === 'category' && (
              <select
                required
                value={bannerLinkTarget}
                onChange={(e) => setBannerLinkTarget(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
              >
                <option value="">اختر القسم المرتبط...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {bannerLinkType === 'product' && (
              <select
                required
                value={bannerLinkTarget}
                onChange={(e) => setBannerLinkTarget(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
              >
                <option value="">اختر المنتج المرتبط...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {bannerImage && (
              <MediaImage src={bannerImage} alt="معاينة البنر" className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0" />
            )}
            <input value={bannerImage} onChange={(e) => setBannerImage(e.target.value)} placeholder="رابط صورة البنر" className="flex-1 h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold cursor-pointer">
              {uploadingKey === 'banner' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploadingKey === 'banner' ? 'جاري الرفع...' : 'رفع صورة'}</span>
              <input type="file" accept="image/*" disabled={uploadingKey === 'banner'} className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], 'banner', setBannerImage)} />
            </label>
          </div>
          <button type="submit" className="px-5 h-10 rounded-xl bg-zinc-900 text-white text-xs font-bold">
            إضافة البنر
          </button>
        </form>

        <div className="space-y-2">
          {banners.map((b) => (
            <div key={b.id} className="rounded-xl border border-zinc-200 bg-white p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {b.imageUrl && (
                  <MediaImage src={b.imageUrl} alt={b.title} className="w-12 h-12 rounded-lg object-cover border border-zinc-200 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-sm text-zinc-900 truncate">{b.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{b.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateDoc(doc(db, 'banners', b.id), { isActive: !b.isActive, updatedAt: serverTimestamp() })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border ${b.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-zinc-100 border-zinc-300'}`}
                >
                  {b.isActive ? 'ظاهر' : 'مخفي'}
                </button>
                <button onClick={() => deleteDoc(doc(db, 'banners', b.id))} className="p-2 text-[#E94F36]">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // STORE SETTINGS & WORKING HOURS
  if (tab === 'settings') {
    const handleSaveSettings = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        await setDoc(doc(db, 'settings', 'store'), stripUndefined({ ...settingsDraft, updatedAt: serverTimestamp() }));
        await onLogAction('update_settings', 'settings', 'store', 'تحديث إعدادات المحل وأوقات العمل');
        showToast('تم حفظ جميع إعدادات المحل بنجاح');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/store');
      }
    };

    return (
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold text-zinc-900">إعدادات المحل وأوقات العمل</h2>
          <button type="submit" className="px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]">
            حفظ الإعدادات
          </button>
        </div>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-zinc-900">الهوية ومعلومات الاتصال</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={settingsDraft.nameAr} onChange={(e) => setSettingsDraft({ ...settingsDraft, nameAr: e.target.value })} placeholder="اسم المحل بالعربية" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input required value={settingsDraft.nameEn} onChange={(e) => setSettingsDraft({ ...settingsDraft, nameEn: e.target.value })} placeholder="اسم المحل بالإنجليزية" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input value={settingsDraft.phone} onChange={(e) => setSettingsDraft({ ...settingsDraft, phone: e.target.value })} placeholder="رقم الهاتف" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            <input value={settingsDraft.whatsapp} onChange={(e) => setSettingsDraft({ ...settingsDraft, whatsapp: e.target.value })} placeholder="رقم الواتساب (مثال: 0791917755)" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            <input value={settingsDraft.address} onChange={(e) => setSettingsDraft({ ...settingsDraft, address: e.target.value })} placeholder="عنوان المحل" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <input value={settingsDraft.currency} onChange={(e) => setSettingsDraft({ ...settingsDraft, currency: e.target.value })} placeholder="العملة (مثال: د.أ)" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          </div>
          <textarea value={settingsDraft.description} onChange={(e) => setSettingsDraft({ ...settingsDraft, description: e.target.value })} rows={2} placeholder="وصف المحل" className="w-full rounded-xl border border-zinc-200 p-3 text-sm" />
          <div className="flex flex-wrap items-center gap-3">
            {settingsDraft.logoUrl && (
              <MediaImage src={settingsDraft.logoUrl} alt="الشعار" className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0" />
            )}
            <input value={settingsDraft.logoUrl} onChange={(e) => setSettingsDraft({ ...settingsDraft, logoUrl: e.target.value })} placeholder="رابط الشعار" className="flex-1 h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
            <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold cursor-pointer">
              {uploadingKey === 'logo' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploadingKey === 'logo' ? 'جاري الرفع...' : 'رفع الشعار'}</span>
              <input type="file" accept="image/*" disabled={uploadingKey === 'logo'} className="hidden" onChange={(e) => handleUpload(e.target.files?.[0], 'logo', (u) => setSettingsDraft({ ...settingsDraft, logoUrl: u }))} />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-zinc-900">إعدادات الطلبات والتشغيل</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">الحد الأدنى للطلب</label>
              <input type="number" min="0" step="0.01" value={settingsDraft.minOrderAmount} onChange={(e) => setSettingsDraft({ ...settingsDraft, minOrderAmount: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">رسوم التوصيل الافتراضية</label>
              <input type="number" min="0" step="0.01" value={settingsDraft.defaultDeliveryFee} onChange={(e) => setSettingsDraft({ ...settingsDraft, defaultDeliveryFee: Number(e.target.value) })} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-xs font-bold text-zinc-800 pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.isAcceptingOrders} onChange={(e) => setSettingsDraft({ ...settingsDraft, isAcceptingOrders: e.target.checked })} className="accent-[#E94F36]" />
              <span>استقبال الطلبات مفعل</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.allowScheduledOrders} onChange={(e) => setSettingsDraft({ ...settingsDraft, allowScheduledOrders: e.target.checked })} className="accent-[#E94F36]" />
              <span>السماح بالطلبات المجدولة عند الإغلاق</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.deliveryEnabled} onChange={(e) => setSettingsDraft({ ...settingsDraft, deliveryEnabled: e.target.checked })} className="accent-[#E94F36]" />
              <span>تفعيل التوصيل للمنزل</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.pickupEnabled} onChange={(e) => setSettingsDraft({ ...settingsDraft, pickupEnabled: e.target.checked })} className="accent-[#E94F36]" />
              <span>تفعيل الاستلام من المحل</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={settingsDraft.dineInEnabled ?? true} onChange={(e) => setSettingsDraft({ ...settingsDraft, dineInEnabled: e.target.checked })} className="accent-[#E94F36]" />
              <span>تفعيل الطلب داخل المطعم (الطاولات)</span>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-zinc-900">ساعات العمل الأسبوعية وأيام العطلة</h3>
          {(Object.keys(DAY_LABELS) as DayKey[]).map((day) => {
            const sched = settingsDraft.workingHours[day];
            return (
              <div key={day} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-zinc-100 text-xs">
                <span className="font-bold w-20">{DAY_LABELS[day]}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={sched.open}
                    disabled={sched.closed}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        workingHours: { ...settingsDraft.workingHours, [day]: { ...sched, open: e.target.value } },
                      })
                    }
                    className="h-9 rounded-lg border border-zinc-200 px-2"
                  />
                  <span>إلى</span>
                  <input
                    type="time"
                    value={sched.close}
                    disabled={sched.closed}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        workingHours: { ...settingsDraft.workingHours, [day]: { ...sched, close: e.target.value } },
                      })
                    }
                    className="h-9 rounded-lg border border-zinc-200 px-2"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sched.closed}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        workingHours: { ...settingsDraft.workingHours, [day]: { ...sched, closed: e.target.checked } },
                      })
                    }
                    className="accent-[#E94F36]"
                  />
                  <span>مغلق</span>
                </label>
              </div>
            );
          })}

          <div className="pt-2 space-y-2">
            <label className="block text-xs font-bold text-zinc-700">تواريخ العطل الرسمية</label>
            <div className="flex gap-2">
              <input type="date" value={holidayInput} onChange={(e) => setHolidayInput(e.target.value)} className="h-9 rounded-lg border border-zinc-200 px-3 text-xs" />
              <button
                type="button"
                onClick={() => {
                  if (holidayInput && !settingsDraft.holidays.includes(holidayInput)) {
                    setSettingsDraft({ ...settingsDraft, holidays: [...settingsDraft.holidays, holidayInput] });
                    setHolidayInput('');
                  }
                }}
                className="px-4 h-9 rounded-lg bg-zinc-900 text-white text-xs font-bold"
              >
                إضافة عطلة
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settingsDraft.holidays.map((h) => (
                <span key={h} className="inline-flex items-center gap-2 text-xs bg-zinc-100 rounded-lg px-2.5 py-1">
                  {h}
                  <button
                    type="button"
                    onClick={() => setSettingsDraft({ ...settingsDraft, holidays: settingsDraft.holidays.filter((x) => x !== h) })}
                    className="text-[#E94F36] font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-zinc-900">السياسات والأسئلة الشائعة</h3>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">سياسة الخصوصية</label>
            <textarea value={settingsDraft.privacyPolicy} onChange={(e) => setSettingsDraft({ ...settingsDraft, privacyPolicy: e.target.value })} rows={3} className="w-full rounded-xl border border-zinc-200 p-3 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">شروط الاستخدام</label>
            <textarea value={settingsDraft.termsOfUse} onChange={(e) => setSettingsDraft({ ...settingsDraft, termsOfUse: e.target.value })} rows={3} className="w-full rounded-xl border border-zinc-200 p-3 text-xs" />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">سياسة الإلغاء والاسترجاع</label>
            <textarea value={settingsDraft.refundPolicy} onChange={(e) => setSettingsDraft({ ...settingsDraft, refundPolicy: e.target.value })} rows={3} className="w-full rounded-xl border border-zinc-200 p-3 text-xs" />
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-100">
            <label className="block text-xs font-bold text-zinc-700">الأسئلة الشائعة</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={faqQ} onChange={(e) => setFaqQ(e.target.value)} placeholder="السؤال" className="h-9 rounded-lg border border-zinc-200 px-3 text-xs" />
              <input value={faqA} onChange={(e) => setFaqA(e.target.value)} placeholder="الإجابة" className="h-9 rounded-lg border border-zinc-200 px-3 text-xs" />
            </div>
            <button
              type="button"
              onClick={() => {
                if (faqQ.trim() && faqA.trim()) {
                  setSettingsDraft({
                    ...settingsDraft,
                    faqItems: [...settingsDraft.faqItems, { id: generateFirestoreId('faq'), question: faqQ.trim(), answer: faqA.trim() }],
                  });
                  setFaqQ('');
                  setFaqA('');
                }
              }}
              className="px-4 h-9 rounded-lg bg-zinc-900 text-white text-xs font-bold"
            >
              + إضافة سؤال
            </button>
            {settingsDraft.faqItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-xs bg-zinc-50 rounded-xl p-2.5">
                <span><strong>{item.question}</strong> — {item.answer}</span>
                <button
                  type="button"
                  onClick={() => setSettingsDraft({ ...settingsDraft, faqItems: settingsDraft.faqItems.filter((f) => f.id !== item.id) })}
                  className="text-[#E94F36] font-bold"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        </div>
      </form>
    );
  }

  // NOTIFICATIONS
  if (tab === 'notifications') {
    const handleBroadcast = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!notifTitle.trim() || !notifBody.trim()) return;
      await onSendNotification({
        targetType: 'broadcast',
        title: notifTitle.trim(),
        body: notifBody.trim(),
      });
      await onLogAction('send_broadcast', 'notifications', 'broadcast', notifTitle.trim());
      setNotifTitle('');
      setNotifBody('');
      showToast('تم إرسال الإشعار العام لجميع العملاء');
    };

    return (
      <div className="space-y-6">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">الإشعارات والتنبيهات</h2>
        {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

        <form onSubmit={handleBroadcast} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-zinc-900">إرسال إشعار عام أو عرض للعملاء</h3>
          <input required value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} placeholder="عنوان الإشعار" className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          <textarea required value={notifBody} onChange={(e) => setNotifBody(e.target.value)} rows={2} placeholder="نص الإشعار أو تفاصيل العرض..." className="w-full rounded-xl border border-zinc-200 p-3 text-sm" />
          <button type="submit" className="inline-flex items-center gap-2 px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold">
            <Send className="w-3.5 h-3.5" />
            <span>إرسال للجميع</span>
          </button>
        </form>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-zinc-900">إشعارات الطلبات الواردة</h3>
          {adminNotifications.length === 0 ? (
            <p className="text-xs text-zinc-500">لا توجد إشعارات إدارية حالياً.</p>
          ) : (
            adminNotifications.slice(0, 20).map((n) => (
              <div
                key={n.id}
                onClick={() => !n.isRead && updateDoc(doc(db, 'notifications', n.id), { isRead: true })}
                className={`rounded-xl border p-3 text-xs cursor-pointer ${n.isRead ? 'border-zinc-200' : 'border-[#E94F36]/40 bg-[#E94F36]/5'}`}
              >
                <div className="flex justify-between font-bold text-zinc-900">
                  <span>{n.title}</span>
                  <span className="text-zinc-400 font-normal">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-zinc-600 mt-1">{n.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // STAFF & AUDIT LOGS
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLower = staffEmail.trim().toLowerCase();
    if (!emailLower.includes('@')) return;
    const existing = staffInvites.find((s) => s.id === emailLower);
    await setDoc(doc(db, 'staff_invites', emailLower), {
      email: emailLower,
      name: staffName.trim(),
      role: staffRole,
      permissions: staffPerms,
      isActive: true,
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await onLogAction('upsert_staff', 'staff_invites', emailLower, `${staffName.trim()} (${staffRole})`);
    setStaffEmail('');
    setStaffName('');
    setStaffRole('manager');
    setStaffPerms(DEFAULT_STAFF_PERMISSIONS.manager);
    showToast('تم تعيين وحفظ صلاحيات الموديتور / الموظف بنجاح');
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-extrabold text-zinc-900 flex items-center gap-2">
        <Shield className="w-5 h-5 text-[#E94F36]" />
        <span>تعيين الموديتور والموظفين والصلاحيات</span>
      </h2>
      {toast && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{toast}</div>}

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div>
          <span className="font-bold text-zinc-900">حساب الإدارة والمالك الرئيسي: </span>
          <span className="font-mono font-bold text-[#E94F36]">mh239273@gmail.com</span>
        </div>
        <span className="text-zinc-600">
          أضف بريد Google لأي مودتير أو موظف بالأسفل ليحصل على صلاحيات الإدارة يدوياً فور تسجيل دخوله.
        </span>
      </div>

      <form onSubmit={handleSaveStaff} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-sm text-zinc-900">تعيين مودتير أو موظف جديد يدوياً</h3>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                setStaffRole('manager');
                setStaffPerms(DEFAULT_STAFF_PERMISSIONS.manager);
              }}
              className={`px-3 py-1 rounded-lg border ${staffRole === 'manager' ? 'bg-[#E94F36] text-white border-[#E94F36]' : 'border-zinc-200 text-zinc-700'}`}
            >
              قالب مودتير (Moderator)
            </button>
            <button
              type="button"
              onClick={() => {
                setStaffRole('employee');
                setStaffPerms(DEFAULT_STAFF_PERMISSIONS.employee);
              }}
              className={`px-3 py-1 rounded-lg border ${staffRole === 'employee' ? 'bg-zinc-900 text-white border-zinc-900' : 'border-zinc-200 text-zinc-700'}`}
            >
              قالب موظف طلبات
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="email" required value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="بريد Google للموديتور / الموظف *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          <input required value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="الاسم الكامل *" className="h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
          <select
            value={staffRole}
            onChange={(e) => {
              const r = e.target.value as StaffRole;
              setStaffRole(r);
              setStaffPerms(DEFAULT_STAFF_PERMISSIONS[r]);
            }}
            className="h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
          >
            <option value="manager">مودتير / مدير التطبيق (Moderator)</option>
            <option value="employee">موظف طلبات ومطبخ</option>
            {isOwner && <option value="owner">مالك (صلاحية كاملة)</option>}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {(Object.keys(PERMISSION_LABELS) as Array<keyof StaffPermissions>).map((k) => (
            <label key={k} className="inline-flex items-center gap-1.5 cursor-pointer p-1.5 rounded-lg hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={staffPerms[k]}
                onChange={(e) => setStaffPerms({ ...staffPerms, [k]: e.target.checked })}
                className="accent-[#E94F36]"
              />
              <span>{PERMISSION_LABELS[k]}</span>
            </label>
          ))}
        </div>

        <button type="submit" className="inline-flex items-center gap-1.5 px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]">
          <Plus className="w-4 h-4" />
          <span>تعيين وحفظ الصلاحيات</span>
        </button>
      </form>

      <div className="space-y-2.5">
        {staffInvites.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-xs text-zinc-500">
            لم يتم تعيين أي مودتير أو موظف إضافي حتى الآن. يمكنك إضافة بريد الموديتور من النموذج أعلاه.
          </div>
        ) : (
          staffInvites.map((s) => (
            <div key={s.id} className="rounded-2xl border border-zinc-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-sm text-zinc-900">
                  {s.name} · <span className="font-mono text-xs">{s.email}</span>
                </h4>
                <p className="text-xs text-zinc-500">
                  الدور: {s.role === 'owner' ? 'مالك' : s.role === 'manager' ? 'مودتير / مدير' : 'موظف'} · {s.isActive ? 'نشط' : 'معطل'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setStaffEmail(s.email);
                    setStaffName(s.name);
                    setStaffRole(s.role);
                    setStaffPerms(s.permissions);
                  }}
                  className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-700"
                  aria-label="تعديل الصلاحيات"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => updateDoc(doc(db, 'staff_invites', s.id), { isActive: !s.isActive, updatedAt: serverTimestamp() })}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-bold"
                >
                  {s.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
                <button onClick={() => deleteDoc(doc(db, 'staff_invites', s.id))} className="p-2 text-[#E94F36]" aria-label="حذف">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Audit Log */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-zinc-900">سجل العمليات الإدارية (Audit Log)</h3>
        {auditLogs.length === 0 ? (
          <p className="text-xs text-zinc-500">لا توجد عمليات مسجلة بعد.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="text-xs border-b border-zinc-100 pb-2 flex flex-wrap justify-between gap-2">
                <span>
                  <strong>{log.actorEmail || log.actorRole}</strong>: {log.summary} ({log.action})
                </span>
                <span className="text-zinc-400">{formatDateTime(log.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
