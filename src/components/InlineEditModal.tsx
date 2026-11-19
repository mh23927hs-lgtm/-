import React, { useEffect, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, generateFirestoreId, stripUndefined } from '../firebase';
import type { Banner, Category, Product, StoreSettings } from '../types';
import { compressImageToDataUrl } from '../utils/storeHelpers';
import { MediaImage } from './MediaImage';

export type InlineEditTarget =
  | { type: 'hero'; storeSettings: StoreSettings }
  | { type: 'category'; category?: Category }
  | { type: 'product'; product?: Product; defaultCategoryId?: string }
  | { type: 'banner'; banner?: Banner }
  | null;

interface InlineEditModalProps {
  target: InlineEditTarget;
  categories: Category[];
  currency: string;
  onClose: () => void;
  onUploadMedia: (dataUrl: string, mimeType: string) => Promise<string>;
  onLogAction: (action: string, col: string, id: string, summary: string) => Promise<void>;
  onSaved: (message: string) => void;
}

export const InlineEditModal: React.FC<InlineEditModalProps> = ({
  target,
  categories,
  currency,
  onClose,
  onUploadMedia,
  onLogAction,
  onSaved,
}) => {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Hero / Store Identity fields
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState('');

  // Category fields
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catImage, setCatImage] = useState('');
  const [catOrder, setCatOrder] = useState('1');
  const [catActive, setCatActive] = useState(true);

  // Product fields
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDiscountPrice, setProdDiscountPrice] = useState('');
  const [prodCatId, setProdCatId] = useState('');
  const [prodImage, setProdImage] = useState('');
  const [prodPrepMins, setProdPrepMins] = useState('');
  const [prodCalories, setProdCalories] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodShowHome, setProdShowHome] = useState(true);

  // Banner fields
  const [banTitle, setBanTitle] = useState('');
  const [banSubtitle, setBanSubtitle] = useState('');
  const [banImage, setBanImage] = useState('');
  const [banOrder, setBanOrder] = useState('1');
  const [banActive, setBanActive] = useState(true);

  useEffect(() => {
    setError('');
    setSaving(false);
    setUploading(false);
    if (!target) return;

    if (target.type === 'hero') {
      const s = target.storeSettings;
      setNameAr(s.nameAr || '');
      setNameEn(s.nameEn || '');
      setHeroTitle(s.heroTitle || '');
      setHeroSubtitle(s.heroSubtitle || '');
      setDescription(s.description || '');
      setLogoUrl(s.logoUrl || '');
      setHeroImageUrl(s.heroImageUrl || '');
      setPhone(s.phone || '');
      setWhatsapp(s.whatsapp || '');
      setAddress(s.address || '');
      setAnnouncementEnabled(Boolean(s.announcementEnabled));
      setAnnouncementText(s.announcementText || '');
    } else if (target.type === 'category') {
      const c = target.category;
      setCatName(c?.name || '');
      setCatDesc(c?.description || '');
      setCatImage(c?.imageUrl || '');
      setCatOrder(String(c?.sortOrder ?? categories.length + 1));
      setCatActive(c ? c.isActive && !c.isHidden : true);
    } else if (target.type === 'product') {
      const p = target.product;
      setProdName(p?.name || '');
      setProdDesc(p?.description || '');
      setProdPrice(p ? String(p.price) : '');
      setProdDiscountPrice(typeof p?.discountPrice === 'number' ? String(p.discountPrice) : '');
      setProdCatId(p?.categoryId || target.defaultCategoryId || categories[0]?.id || '');
      setProdImage(p?.imageUrl || '');
      setProdPrepMins(typeof p?.prepTimeMinutes === 'number' ? String(p.prepTimeMinutes) : '');
      setProdCalories(typeof p?.calories === 'number' ? String(p.calories) : '');
      setProdAvailable(p ? p.isAvailable : true);
      setProdFeatured(p ? p.isFeatured : false);
      setProdShowHome(p ? p.showOnHome : true);
    } else if (target.type === 'banner') {
      const b = target.banner;
      setBanTitle(b?.title || '');
      setBanSubtitle(b?.subtitle || '');
      setBanImage(b?.imageUrl || '');
      setBanOrder(String(b?.sortOrder ?? 1));
      setBanActive(b ? b.isActive : true);
    }
  }, [target, categories]);

  if (!target) return null;

  const handleFileUpload = async (file: File | undefined, onUrl: (url: string) => void) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(file);
      const url = await onUploadMedia(dataUrl, mimeType);
      onUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (target.type === 'hero') {
        const nextSettings: StoreSettings = {
          ...target.storeSettings,
          nameAr: nameAr.trim() || 'زاد مهاوي',
          nameEn: nameEn.trim() || 'ZAD MAHAWI',
          heroTitle: heroTitle.trim(),
          heroSubtitle: heroSubtitle.trim(),
          description: description.trim(),
          logoUrl: logoUrl.trim(),
          heroImageUrl: heroImageUrl.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim(),
          address: address.trim(),
          announcementEnabled,
          announcementText: announcementText.trim(),
        };
        await setDoc(
          doc(db, 'settings', 'store'),
          stripUndefined({
            ...nextSettings,
            updatedAt: serverTimestamp(),
          }),
        );
        await onLogAction('inline_edit_store', 'settings', 'store', 'تعديل مباشر لهوية وإعدادات المتجر');
        onSaved('تم تحديث هوية وإعدادات المتجر بنجاح');
      } else if (target.type === 'category') {
        if (!catName.trim()) {
          setError('اسم القسم مطلوب');
          setSaving(false);
          return;
        }
        const id = target.category?.id || generateFirestoreId('cat');
        if (target.category) {
          await updateDoc(
            doc(db, 'categories', id),
            stripUndefined({
              name: catName.trim(),
              description: catDesc.trim() || undefined,
              imageUrl: catImage.trim() || undefined,
              sortOrder: Number(catOrder) || 1,
              isActive: catActive,
              isHidden: !catActive,
              updatedAt: serverTimestamp(),
            }),
          );
          await onLogAction('inline_edit_category', 'categories', id, catName.trim());
          onSaved('تم تحديث القسم بنجاح');
        } else {
          await setDoc(
            doc(db, 'categories', id),
            stripUndefined({
              name: catName.trim(),
              description: catDesc.trim() || undefined,
              imageUrl: catImage.trim() || undefined,
              sortOrder: Number(catOrder) || 1,
              isActive: catActive,
              isHidden: !catActive,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          );
          await onLogAction('inline_create_category', 'categories', id, catName.trim());
          onSaved('تمت إضافة القسم بنجاح');
        }
      } else if (target.type === 'product') {
        if (!prodName.trim() || !prodCatId) {
          setError('يرجى إدخال اسم المنتج واختيار القسم');
          setSaving(false);
          return;
        }
        const id = target.product?.id || generateFirestoreId('prod');
        const payload = stripUndefined({
          name: prodName.trim(),
          description: prodDesc.trim() || undefined,
          price: Math.max(0, Number(prodPrice) || 0),
          discountPrice: prodDiscountPrice.trim() ? Math.max(0, Number(prodDiscountPrice) || 0) : null,
          categoryId: prodCatId,
          imageUrl: prodImage.trim() || undefined,
          prepTimeMinutes: prodPrepMins.trim() ? Math.max(0, Number(prodPrepMins) || 0) : null,
          calories: prodCalories.trim() ? Math.max(0, Number(prodCalories) || 0) : null,
          isAvailable: prodAvailable,
          isHidden: target.product?.isHidden ?? false,
          showOnHome: prodShowHome,
          isFeatured: prodFeatured,
          updatedAt: serverTimestamp(),
        });

        if (target.product) {
          await updateDoc(doc(db, 'products', id), payload);
          await onLogAction('inline_edit_product', 'products', id, prodName.trim());
          onSaved('تم تحديث المنتج بنجاح');
        } else {
          await setDoc(doc(db, 'products', id), {
            ...payload,
            salesCount: 0,
            optionGroups: [],
            addons: [],
            createdAt: serverTimestamp(),
          });
          await onLogAction('inline_create_product', 'products', id, prodName.trim());
          onSaved('تمت إضافة المنتج بنجاح');
        }
      } else if (target.type === 'banner') {
        if (!banTitle.trim()) {
          setError('عنوان البانر مطلوب');
          setSaving(false);
          return;
        }
        const id = target.banner?.id || generateFirestoreId('ban');
        if (target.banner) {
          await updateDoc(
            doc(db, 'banners', id),
            stripUndefined({
              title: banTitle.trim(),
              subtitle: banSubtitle.trim() || undefined,
              imageUrl: banImage.trim() || undefined,
              sortOrder: Number(banOrder) || 1,
              isActive: banActive,
              updatedAt: serverTimestamp(),
            }),
          );
          await onLogAction('inline_edit_banner', 'banners', id, banTitle.trim());
          onSaved('تم تحديث البانر بنجاح');
        } else {
          await setDoc(
            doc(db, 'banners', id),
            stripUndefined({
              title: banTitle.trim(),
              subtitle: banSubtitle.trim() || undefined,
              imageUrl: banImage.trim() || undefined,
              linkType: 'none',
              sortOrder: Number(banOrder) || 1,
              isActive: banActive,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          );
          await onLogAction('inline_create_banner', 'banners', id, banTitle.trim());
          onSaved('تمت إضافة البانر بنجاح');
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ، تحقق من الصلاحيات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4" dir="rtl">
      <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-zinc-100 flex items-center justify-between shrink-0">
          <h3 className="font-display font-extrabold text-lg text-zinc-900">
            {target.type === 'hero' && 'تعديل الواجهة والهوية والصور يدوياً'}
            {target.type === 'category' && (target.category ? 'تعديل القسم وصورته' : 'إضافة قسم جديد يدوياً')}
            {target.type === 'product' && (target.product ? 'تعديل الصنف وصورته' : 'إضافة صنف جديد يدوياً')}
            {target.type === 'banner' && (target.banner ? 'تعديل بانر العروض' : 'إضافة بانر جديد يدوياً')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full text-zinc-500 hover:bg-zinc-100 flex items-center justify-center"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {target.type === 'hero' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">اسم المطعم (عربي)</label>
                  <input required value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">الاسم بالإنجليزية</label>
                  <input required value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">العنوان الرئيسي في الواجهة</label>
                <input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">النص الفرعي للواجهة</label>
                <input value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">وصف المطعم</label>
                <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-zinc-200 p-3 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">شعار المطعم (رفع يدوي)</label>
                  <div className="flex items-center gap-2">
                    {logoUrl && <MediaImage src={logoUrl} alt="الشعار" className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shrink-0" />}
                    <label className="flex-1 h-10 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer">
                      <Upload className="w-4 h-4 text-[#E94F36]" />
                      <span>رفع شعار جديد</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], setLogoUrl)} />
                    </label>
                    {logoUrl && (
                      <button type="button" onClick={() => setLogoUrl('')} className="h-10 px-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-500">حذف</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">صورة الواجهة الرئيسية (رفع يدوي)</label>
                  <div className="flex items-center gap-2">
                    {heroImageUrl && <MediaImage src={heroImageUrl} alt="صورة الواجهة" className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shrink-0" />}
                    <label className="flex-1 h-10 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer">
                      <Upload className="w-4 h-4 text-[#E94F36]" />
                      <span>رفع صورة للواجهة</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], setHeroImageUrl)} />
                    </label>
                    {heroImageUrl && (
                      <button type="button" onClick={() => setHeroImageUrl('')} className="h-10 px-2.5 rounded-xl border border-zinc-200 text-xs text-zinc-500">حذف</button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">رقم الهاتف</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">رقم الواتساب</label>
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">عنوان المحل</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-800 cursor-pointer">
                  <input type="checkbox" checked={announcementEnabled} onChange={(e) => setAnnouncementEnabled(e.target.checked)} />
                  <span>عرض شريط إعلان أعلى المتجر</span>
                </label>
                {announcementEnabled && (
                  <input value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} placeholder="نص الإعلان..." className="w-full h-9 rounded-lg border border-zinc-200 bg-white px-3 text-xs" />
                )}
              </div>
            </>
          )}

          {target.type === 'category' && (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">اسم القسم *</label>
                <input required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="مثال: قسم المعجنات، قسم السندويشات" className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">وصف مختصر</label>
                <input value={catDesc} onChange={(e) => setCatDesc(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">ترتيب العرض</label>
                  <input type="number" value={catOrder} onChange={(e) => setCatOrder(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">صورة القسم (رفع يدوي)</label>
                  <div className="flex items-center gap-2">
                    {catImage && <MediaImage src={catImage} alt="صورة القسم" className="w-10 h-10 rounded-xl object-cover border border-zinc-200 shrink-0" />}
                    <label className="flex-1 h-10 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer">
                      <Upload className="w-4 h-4 text-[#E94F36]" />
                      <span>اختر صورة من جهازك</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], setCatImage)} />
                    </label>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-800 cursor-pointer">
                <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} />
                <span>القسم ظاهر ومفعّل للعملاء</span>
              </label>
            </>
          )}

          {target.type === 'product' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">اسم الصنف *</label>
                  <input required value={prodName} onChange={(e) => setProdName(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">القسم *</label>
                  <select required value={prodCatId} onChange={(e) => setProdCatId(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm">
                    <option value="">اختر القسم...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">الوصف</label>
                <textarea rows={2} value={prodDesc} onChange={(e) => setProdDesc(e.target.value)} className="w-full rounded-xl border border-zinc-200 p-3 text-sm" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">السعر ({currency}) *</label>
                  <input required type="number" step="0.01" min="0" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">سعر الخصم</label>
                  <input type="number" step="0.01" min="0" value={prodDiscountPrice} onChange={(e) => setProdDiscountPrice(e.target.value)} placeholder="اختياري" className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">التحضير (د)</label>
                  <input type="number" min="0" value={prodPrepMins} onChange={(e) => setProdPrepMins(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">السعرات</label>
                  <input type="number" min="0" value={prodCalories} onChange={(e) => setProdCalories(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">صورة المنتج (رفع يدوي من جهازك)</label>
                <div className="flex items-center gap-3">
                  {prodImage && <MediaImage src={prodImage} alt="صورة المنتج" className="w-16 h-16 rounded-xl object-cover border border-zinc-200 shrink-0" />}
                  <label className="flex-1 h-12 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 px-4 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer">
                    <Upload className="w-4 h-4 text-[#E94F36]" />
                    <span>{prodImage ? 'تغيير صورة المنتج' : 'رفع صورة من الهاتف / الكمبيوتر'}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], setProdImage)} />
                  </label>
                  {prodImage && (
                    <button type="button" onClick={() => setProdImage('')} className="h-10 px-3 rounded-xl border border-zinc-200 text-xs text-zinc-600">حذف</button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-1 text-xs font-bold text-zinc-800">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={prodAvailable} onChange={(e) => setProdAvailable(e.target.checked)} />
                  <span>متوفر للطلب</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={prodFeatured} onChange={(e) => setProdFeatured(e.target.checked)} />
                  <span>منتج مميز</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={prodShowHome} onChange={(e) => setProdShowHome(e.target.checked)} />
                  <span>عرض في الرئيسية</span>
                </label>
              </div>
            </>
          )}

          {target.type === 'banner' && (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">عنوان البانر *</label>
                <input required value={banTitle} onChange={(e) => setBanTitle(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">نص فرعي</label>
                <input value={banSubtitle} onChange={(e) => setBanSubtitle(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">الترتيب</label>
                  <input type="number" value={banOrder} onChange={(e) => setBanOrder(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">صورة البانر (رفع يدوي)</label>
                  <div className="flex items-center gap-2">
                    {banImage && <MediaImage src={banImage} alt="البانر" className="w-12 h-10 rounded-xl object-cover border border-zinc-200 shrink-0" />}
                    <label className="flex-1 h-10 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 px-3 flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer">
                      <Upload className="w-4 h-4 text-[#E94F36]" />
                      <span>رفع صورة</span>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], setBanImage)} />
                    </label>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-zinc-800 cursor-pointer">
                <input type="checkbox" checked={banActive} onChange={(e) => setBanActive(e.target.checked)} />
                <span>البانر مفعّل في الواجهة</span>
              </label>
            </>
          )}

          {uploading && (
            <div className="flex items-center gap-2 text-xs font-bold text-[#E94F36]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري ضغط ورفع الصورة إلى قاعدة البيانات...</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-2.5 text-xs font-bold text-[#E94F36]">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 h-11 rounded-xl bg-[#E94F36] text-white text-sm font-bold hover:bg-[#d54028] disabled:bg-zinc-300 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>حفظ التغييرات</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
