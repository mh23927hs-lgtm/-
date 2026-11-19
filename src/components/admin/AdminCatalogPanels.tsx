import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, generateFirestoreId, handleFirestoreError, OperationType, stripUndefined } from '../../firebase';
import type {
  Category,
  Product,
  ProductAddon,
  ProductCost,
  ProductOptionGroup,
} from '../../types';
import { compressImageToDataUrl, formatPrice } from '../../utils/storeHelpers';
import { MediaImage } from '../MediaImage';

interface CatalogPanelsProps {
  mode: 'products' | 'categories';
  categories: Category[];
  products: Product[];
  productCosts: Record<string, ProductCost>;
  currency: string;
  onUploadMedia: (dataUrl: string, mimeType: string) => Promise<string>;
  onLogAction: (action: string, col: string, id: string, summary: string) => Promise<void>;
}

export const AdminCatalogPanels: React.FC<CatalogPanelsProps> = ({
  mode,
  categories,
  products,
  productCosts,
  currency,
  onUploadMedia,
  onLogAction,
}) => {
  // Category form
  const [catEditingId, setCatEditingId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catImageUrl, setCatImageUrl] = useState('');
  const [catSortOrder, setCatSortOrder] = useState(1);
  const [catActive, setCatActive] = useState(true);
  const [catHidden, setCatHidden] = useState(false);
  const [catSaving, setCatSaving] = useState(false);

  // Product form
  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [prodEditingId, setProdEditingId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodDiscountPrice, setProdDiscountPrice] = useState('');
  const [prodCostPrice, setProdCostPrice] = useState('');
  const [prodCategoryId, setProdCategoryId] = useState('');
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodHidden, setProdHidden] = useState(false);
  const [prodStock, setProdStock] = useState('');
  const [prodPrepTime, setProdPrepTime] = useState('');
  const [prodCalories, setProdCalories] = useState('');
  const [prodAllergens, setProdAllergens] = useState('');
  const [prodShowOnHome, setProdShowOnHome] = useState(true);
  const [prodFeatured, setProdFeatured] = useState(false);
  const [prodOptionGroups, setProdOptionGroups] = useState<ProductOptionGroup[]>([]);
  const [prodAddons, setProdAddons] = useState<ProductAddon[]>([]);
  const [prodSaving, setProdSaving] = useState(false);
  const [uploadingTarget, setUploadingTarget] = useState<'category' | 'product' | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleImageFile = async (file: File | undefined, target: 'category' | 'product') => {
    if (!file) return;
    setErrorMsg('');
    setUploadingTarget(target);
    try {
      const { dataUrl, mimeType } = await compressImageToDataUrl(file);
      const mediaUri = await onUploadMedia(dataUrl, mimeType);
      if (target === 'category') setCatImageUrl(mediaUri);
      else setProdImageUrl(mediaUri);
      setStatusMsg('تم رفع الصورة بنجاح');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'فشل رفع الصورة');
    } finally {
      setUploadingTarget(null);
    }
  };

  // Category Handlers
  const resetCatForm = () => {
    setCatEditingId(null);
    setCatName('');
    setCatDesc('');
    setCatImageUrl('');
    setCatSortOrder(categories.length + 1);
    setCatActive(true);
    setCatHidden(false);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatSaving(true);
    setErrorMsg('');
    try {
      const id = catEditingId || generateFirestoreId('cat');
      const existing = categories.find((c) => c.id === id);
      await setDoc(
        doc(db, 'categories', id),
        stripUndefined({
          name: catName.trim(),
          description: catDesc.trim() || undefined,
          imageUrl: catImageUrl.trim() || undefined,
          sortOrder: Number(catSortOrder) || 1,
          isActive: catActive,
          isHidden: catHidden,
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      await onLogAction(catEditingId ? 'update_category' : 'create_category', 'categories', id, `قسم: ${catName.trim()}`);
      setStatusMsg(catEditingId ? 'تم تحديث القسم بنجاح' : 'تمت إضافة القسم بنجاح');
      resetCatForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'categories');
    } finally {
      setCatSaving(false);
    }
  };

  const handleQuickSuggestedCategory = async (name: string, description?: string, fixedId?: string) => {
    setErrorMsg('');
    try {
      const id = fixedId || generateFirestoreId('cat');
      await setDoc(
        doc(db, 'categories', id),
        stripUndefined({
          name,
          description,
          sortOrder: categories.length + 1,
          isActive: true,
          isHidden: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );
      await onLogAction('create_category', 'categories', id, `إضافة قسم: ${name}`);
      setStatusMsg(`تمت إضافة "${name}"`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'categories');
    }
  };

  const handleMoveCategory = async (cat: Category, delta: number) => {
    try {
      await updateDoc(doc(db, 'categories', cat.id), {
        sortOrder: Math.max(0, (cat.sortOrder || 0) + delta),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `categories/${cat.id}`);
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    try {
      await deleteDoc(doc(db, 'categories', cat.id));
      await onLogAction('delete_category', 'categories', cat.id, `حذف قسم: ${cat.name}`);
      setStatusMsg(`تم حذف قسم "${cat.name}"`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories/${cat.id}`);
    }
  };

  // Product Handlers
  const openNewProduct = () => {
    setProdEditingId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdDiscountPrice('');
    setProdCostPrice('');
    setProdCategoryId(categories[0]?.id || '');
    setProdImageUrl('');
    setProdAvailable(true);
    setProdHidden(false);
    setProdStock('');
    setProdPrepTime('');
    setProdCalories('');
    setProdAllergens('');
    setProdShowOnHome(true);
    setProdFeatured(false);
    setProdOptionGroups([]);
    setProdAddons([]);
    setErrorMsg('');
    setProdModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setProdEditingId(p.id);
    setProdName(p.name);
    setProdDesc(p.description || '');
    setProdPrice(String(p.price));
    setProdDiscountPrice(p.discountPrice != null ? String(p.discountPrice) : '');
    setProdCostPrice(productCosts[p.id]?.costPrice != null ? String(productCosts[p.id].costPrice) : '');
    setProdCategoryId(p.categoryId);
    setProdImageUrl(p.imageUrl || '');
    setProdAvailable(p.isAvailable);
    setProdHidden(p.isHidden);
    setProdStock(p.stockQuantity != null ? String(p.stockQuantity) : '');
    setProdPrepTime(p.prepTimeMinutes != null ? String(p.prepTimeMinutes) : '');
    setProdCalories(p.calories != null ? String(p.calories) : '');
    setProdAllergens(p.allergens || '');
    setProdShowOnHome(p.showOnHome);
    setProdFeatured(p.isFeatured);
    setProdOptionGroups(p.optionGroups || []);
    setProdAddons(p.addons || []);
    setErrorMsg('');
    setProdModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodCategoryId) {
      setErrorMsg('يرجى إنشاء واختيار قسم أولاً قبل حفظ المنتج.');
      return;
    }
    const priceNum = Number(prodPrice);
    if (!prodName.trim() || Number.isNaN(priceNum) || priceNum < 0) {
      setErrorMsg('يرجى إدخال اسم وسعر صالح للمنتج.');
      return;
    }

    setProdSaving(true);
    setErrorMsg('');
    try {
      const id = prodEditingId || generateFirestoreId('prod');
      const existing = products.find((x) => x.id === id);

      const discountNum = prodDiscountPrice.trim() !== '' ? Math.max(0, Number(prodDiscountPrice)) : null;
      const stockNum = prodStock.trim() !== '' ? Math.max(0, Number(prodStock)) : null;
      const prepNum = prodPrepTime.trim() !== '' ? Math.max(0, Number(prodPrepTime)) : null;
      const calNum = prodCalories.trim() !== '' ? Math.max(0, Number(prodCalories)) : null;

      await setDoc(
        doc(db, 'products', id),
        stripUndefined({
          name: prodName.trim(),
          description: prodDesc.trim() || undefined,
          price: priceNum,
          discountPrice: discountNum,
          categoryId: prodCategoryId,
          imageUrl: prodImageUrl.trim() || undefined,
          isAvailable: prodAvailable,
          isHidden: prodHidden,
          stockQuantity: stockNum,
          prepTimeMinutes: prepNum,
          calories: calNum,
          allergens: prodAllergens.trim().slice(0, 200) || undefined,
          showOnHome: prodShowOnHome,
          isFeatured: prodFeatured,
          salesCount: existing?.salesCount ?? 0,
          optionGroups: prodOptionGroups,
          addons: prodAddons,
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      );

      if (prodCostPrice.trim() !== '' && !Number.isNaN(Number(prodCostPrice))) {
        await setDoc(doc(db, 'product_costs', id), {
          costPrice: Math.max(0, Number(prodCostPrice)),
          updatedAt: serverTimestamp(),
        });
      }

      await onLogAction(prodEditingId ? 'update_product' : 'create_product', 'products', id, `منتج: ${prodName.trim()}`);
      setStatusMsg(prodEditingId ? 'تم تحديث المنتج بنجاح' : 'تمت إضافة المنتج بنجاح');
      setProdModalOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    } finally {
      setProdSaving(false);
    }
  };

  const handleToggleProductField = async (p: Product, field: 'isAvailable' | 'isHidden') => {
    try {
      await updateDoc(doc(db, 'products', p.id), {
        [field]: !p[field],
        updatedAt: serverTimestamp(),
      });
      await onLogAction(`toggle_${field}`, 'products', p.id, `${p.name}: ${field}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${p.id}`);
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    try {
      await deleteDoc(doc(db, 'products', p.id));
      await onLogAction('delete_product', 'products', p.id, `حذف منتج: ${p.name}`);
      setStatusMsg(`تم حذف "${p.name}"`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `products/${p.id}`);
    }
  };

  // Option Groups & Addons Builders
  const addOptionGroup = () => {
    setProdOptionGroups((prev) => [
      ...prev,
      {
        id: generateFirestoreId('grp'),
        name: 'الحجم',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        choices: [{ id: generateFirestoreId('ch'), name: 'عادي', extraPrice: 0 }],
      },
    ]);
  };

  const addAddon = () => {
    setProdAddons((prev) => [
      ...prev,
      { id: generateFirestoreId('add'), name: 'إضافة جبنة', price: 0 },
    ]);
  };

  if (mode === 'categories') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة الأقسام</h2>
          <div className="flex flex-wrap gap-2">
            {[
              {
                id: 'cat_pastries',
                name: 'قسم المعجنات',
                desc: 'معجنات وفطائر مخبوزة طازجة يومياً من الفرن',
              },
              {
                id: 'cat_sandwiches',
                name: 'قسم السندويشات',
                desc: 'سندويشات محضّرة يومياً بمكونات طازجة ونكهات أردنية شهية',
              },
              { id: undefined, name: 'العروض', desc: 'وجبات وعروض توفيرية خاصة' },
              { id: undefined, name: 'أصناف أخرى', desc: 'مشروبات ومقبلات جانبية' },
            ].map((sug) => {
              const exists = categories.some((c) => c.name === sug.name);
              if (exists) return null;
              return (
                <button
                  key={sug.name}
                  type="button"
                  onClick={() => handleQuickSuggestedCategory(sug.name, sug.desc, sug.id)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:border-[#E94F36]"
                >
                  + إضافة "{sug.name}"
                </button>
              );
            })}
          </div>
        </div>

        {statusMsg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{statusMsg}</div>}
        {errorMsg && <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-2.5 text-xs font-bold text-[#E94F36]">{errorMsg}</div>}

        <form onSubmit={handleSaveCategory} className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-sm text-zinc-900">
            {catEditingId ? 'تعديل القسم' : 'إضافة قسم جديد'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="اسم القسم (مثال: قسم المعجنات) *"
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              type="text"
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="وصف مختصر (اختياري)"
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <input
              type="number"
              value={catSortOrder}
              onChange={(e) => setCatSortOrder(Number(e.target.value))}
              placeholder="الترتيب"
              className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {catImageUrl && (
              <MediaImage src={catImageUrl} alt={catName || 'معاينة'} className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0" />
            )}
            <input
              type="text"
              value={catImageUrl}
              onChange={(e) => setCatImageUrl(e.target.value)}
              placeholder="رابط صورة القسم أو ارفع صورة"
              className="flex-1 min-w-[200px] h-10 rounded-xl border border-zinc-200 px-3 text-sm"
            />
            <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold cursor-pointer hover:bg-zinc-100">
              {uploadingTarget === 'category' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              <span>{uploadingTarget === 'category' ? 'جاري الرفع...' : 'رفع صورة'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploadingTarget === 'category'}
                className="hidden"
                onChange={(e) => handleImageFile(e.target.files?.[0], 'category')}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-700">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} className="accent-[#E94F36]" />
              <span>القسم مفعل</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={catHidden} onChange={(e) => setCatHidden(e.target.checked)} className="accent-[#E94F36]" />
              <span>إخفاء عن العملاء</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={catSaving}
              className="px-5 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
            >
              {catSaving ? 'جاري الحفظ...' : catEditingId ? 'حفظ التعديلات' : 'إضافة القسم'}
            </button>
            {catEditingId && (
              <button
                type="button"
                onClick={resetCatForm}
                className="px-4 h-10 rounded-xl border border-zinc-200 text-xs font-bold"
              >
                إلغاء
              </button>
            )}
          </div>
        </form>

        {categories.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            لا توجد أقسام مضافة حتى الآن. أضف أول قسم لبدء إضافة المنتجات.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-2xl border border-zinc-200 bg-white p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <MediaImage src={cat.imageUrl} alt={cat.name} className="w-14 h-14 rounded-xl object-cover shrink-0 border border-zinc-200" />
                  <div className="min-w-0">
                    <h4 className="font-display font-bold text-sm text-zinc-900 truncate">{cat.name}</h4>
                    <p className="text-xs text-zinc-500">
                      ترتيب {cat.sortOrder} · {cat.isActive ? 'مفعل' : 'متوقف'} · {cat.isHidden ? 'مخفي' : 'ظاهر'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleMoveCategory(cat, -1)} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-600" aria-label="تقديم">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleMoveCategory(cat, 1)} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-600" aria-label="تأخير">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setCatEditingId(cat.id);
                      setCatName(cat.name);
                      setCatDesc(cat.description || '');
                      setCatImageUrl(cat.imageUrl || '');
                      setCatSortOrder(cat.sortOrder);
                      setCatActive(cat.isActive);
                      setCatHidden(cat.isHidden);
                    }}
                    className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-700"
                    aria-label="تعديل"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCategory(cat)}
                    className="p-2 rounded-lg hover:bg-[#E94F36]/10 text-[#E94F36]"
                    aria-label="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // PRODUCTS MODE
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-extrabold text-zinc-900">إدارة المنتجات</h2>
        <button
          onClick={openNewProduct}
          className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة منتج جديد</span>
        </button>
      </div>

      {statusMsg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800">{statusMsg}</div>}
      {errorMsg && <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-2.5 text-xs font-bold text-[#E94F36]">{errorMsg}</div>}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center space-y-2">
          <p className="font-display font-bold text-zinc-900">لا توجد منتجات مضافة حتى الآن</p>
          <p className="text-xs text-zinc-500">أضف منتجات المحل الحقيقية لتظهر للعملاء في المتجر.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const catName = categories.find((c) => c.id === p.categoryId)?.name || 'بدون قسم';
            return (
              <div key={p.id} className="rounded-2xl border border-zinc-200 bg-white overflow-hidden flex flex-col">
                <div className="aspect-4/3 bg-zinc-100">
                  <MediaImage src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <div className="text-xs text-zinc-500 flex items-center justify-between">
                      <span>{catName}</span>
                      <span className="tabular-nums">مبيعات: {p.salesCount}</span>
                    </div>
                    <h3 className="font-display font-bold text-base text-zinc-900 mt-1">{p.name}</h3>
                    <div className="flex items-center gap-2 mt-1 tabular-nums">
                      <span className="font-extrabold text-sm text-[#E94F36]">
                        {formatPrice(p.discountPrice != null && p.discountPrice < p.price ? p.discountPrice : p.price, currency)}
                      </span>
                      {p.discountPrice != null && p.discountPrice < p.price && (
                        <span className="text-xs text-zinc-400 line-through">{formatPrice(p.price, currency)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-100 gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleProductField(p, 'isAvailable')}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                          p.isAvailable
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                        }`}
                      >
                        {p.isAvailable ? 'متوفر' : 'غير متوفر'}
                      </button>
                      <button
                        onClick={() => handleToggleProductField(p, 'isHidden')}
                        className="p-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        title={p.isHidden ? 'إظهار' : 'إخفاء'}
                      >
                        {p.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditProduct(p)} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-700">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteProduct(p)} className="p-2 rounded-lg hover:bg-[#E94F36]/10 text-[#E94F36]">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Editor Modal */}
      {prodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4">
          <div className="w-full max-w-2xl max-h-[92vh] bg-white rounded-3xl border border-zinc-200 flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-lg text-zinc-900">
                {prodEditingId ? 'تعديل المنتج' : 'إضافة منتج جديد'}
              </h3>
              <button onClick={() => setProdModalOpen(false)} className="text-xs font-bold text-zinc-500 px-3 py-1.5 rounded-lg hover:bg-zinc-100">
                إغلاق
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-5">
              {categories.length === 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-bold text-amber-800">
                  تنبيه: يرجى إضافة قسم واحد على الأقل من تبويب "إدارة الأقسام" قبل إضافة المنتج.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">اسم المنتج *</label>
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">القسم *</label>
                  <select
                    required
                    value={prodCategoryId}
                    onChange={(e) => setProdCategoryId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
                  >
                    <option value="">اختر القسم...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">وصف المنتج</label>
                <textarea
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200 p-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">السعر الأساسي *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">السعر بعد الخصم (اختياري)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prodDiscountPrice}
                    onChange={(e) => setProdDiscountPrice(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">سعر التكلفة للتقارير (سري)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={prodCostPrice}
                    onChange={(e) => setProdCostPrice(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">الكمية المتوفرة (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    placeholder="اتركه فارغاً للتوفر غير المحدود"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">مدة التحضير بالدقائق (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    value={prodPrepTime}
                    onChange={(e) => setProdPrepTime(e.target.value)}
                    placeholder="مثال: 15"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">السعرات الحرارية (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    value={prodCalories}
                    onChange={(e) => setProdCalories(e.target.value)}
                    placeholder="مثال: 420"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">تنبيهات الحساسية / المكونات (اختياري)</label>
                  <input
                    type="text"
                    maxLength={200}
                    value={prodAllergens}
                    onChange={(e) => setProdAllergens(e.target.value)}
                    placeholder="مثال: يحتوي على الجلوتين، السمسم، الألبان"
                    className="w-full h-10 rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-700">صورة المنتج</label>
                <div className="flex flex-wrap items-center gap-3">
                  {prodImageUrl && (
                    <MediaImage src={prodImageUrl} alt={prodName || 'معاينة'} className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0" />
                  )}
                  <input
                    type="text"
                    value={prodImageUrl}
                    onChange={(e) => setProdImageUrl(e.target.value)}
                    placeholder="رابط الصورة أو ارفع صورة من جهازك"
                    className="flex-1 min-w-[200px] h-10 rounded-xl border border-zinc-200 px-3 text-sm"
                  />
                  <label className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold cursor-pointer hover:bg-zinc-100">
                    {uploadingTarget === 'product' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingTarget === 'product' ? 'جاري الرفع...' : 'رفع صورة'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingTarget === 'product'}
                      className="hidden"
                      onChange={(e) => handleImageFile(e.target.files?.[0], 'product')}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs font-bold text-zinc-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={prodAvailable} onChange={(e) => setProdAvailable(e.target.checked)} className="accent-[#E94F36]" />
                  <span>متوفر للطلب</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={prodHidden} onChange={(e) => setProdHidden(e.target.checked)} className="accent-[#E94F36]" />
                  <span>إخفاء المنتج</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={prodShowOnHome} onChange={(e) => setProdShowOnHome(e.target.checked)} className="accent-[#E94F36]" />
                  <span>إظهار في الرئيسية</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={prodFeatured} onChange={(e) => setProdFeatured(e.target.checked)} className="accent-[#E94F36]" />
                  <span>منتج مميز</span>
                </label>
              </div>

              {/* Dynamic Option Groups */}
              <div className="space-y-3 pt-3 border-t border-zinc-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-zinc-900">مجموعات الخيارات (الأحجام، الحشوات، الجبنة...)</h4>
                  <button type="button" onClick={addOptionGroup} className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold">
                    + إضافة مجموعة خيارات
                  </button>
                </div>

                {prodOptionGroups.map((grp, gIdx) => (
                  <div key={grp.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        value={grp.name}
                        onChange={(e) => {
                          const next = [...prodOptionGroups];
                          next[gIdx] = { ...grp, name: e.target.value };
                          setProdOptionGroups(next);
                        }}
                        placeholder="اسم المجموعة"
                        className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-bold"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs font-bold px-2">
                        <input
                          type="checkbox"
                          checked={grp.required}
                          onChange={(e) => {
                            const next = [...prodOptionGroups];
                            next[gIdx] = { ...grp, required: e.target.checked };
                            setProdOptionGroups(next);
                          }}
                          className="accent-[#E94F36]"
                        />
                        <span>إجباري</span>
                      </label>
                      <div className="flex items-center gap-1 text-xs">
                        <span>أدنى:</span>
                        <input
                          type="number"
                          min="0"
                          value={grp.minSelect}
                          onChange={(e) => {
                            const next = [...prodOptionGroups];
                            next[gIdx] = { ...grp, minSelect: Number(e.target.value) };
                            setProdOptionGroups(next);
                          }}
                          className="w-14 h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs tabular-nums"
                        />
                        <span>أقصى:</span>
                        <input
                          type="number"
                          min="1"
                          value={grp.maxSelect}
                          onChange={(e) => {
                            const next = [...prodOptionGroups];
                            next[gIdx] = { ...grp, maxSelect: Number(e.target.value) };
                            setProdOptionGroups(next);
                          }}
                          className="w-14 h-9 rounded-lg border border-zinc-200 bg-white px-2 text-xs tabular-nums"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setProdOptionGroups((prev) => prev.filter((_, i) => i !== gIdx))}
                        className="text-xs font-bold text-[#E94F36] text-left"
                      >
                        حذف المجموعة
                      </button>
                    </div>

                    <div className="space-y-2">
                      {grp.choices.map((ch, cIdx) => (
                        <div key={ch.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ch.name}
                            onChange={(e) => {
                              const next = [...prodOptionGroups];
                              const choices = [...grp.choices];
                              choices[cIdx] = { ...ch, name: e.target.value };
                              next[gIdx] = { ...grp, choices };
                              setProdOptionGroups(next);
                            }}
                            placeholder="اسم الخيار"
                            className="flex-1 h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={ch.extraPrice}
                            onChange={(e) => {
                              const next = [...prodOptionGroups];
                              const choices = [...grp.choices];
                              choices[cIdx] = { ...ch, extraPrice: Number(e.target.value) };
                              next[gIdx] = { ...grp, choices };
                              setProdOptionGroups(next);
                            }}
                            placeholder="سعر إضافي"
                            className="w-24 h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...prodOptionGroups];
                              next[gIdx] = { ...grp, choices: grp.choices.filter((_, i) => i !== cIdx) };
                              setProdOptionGroups(next);
                            }}
                            className="p-1.5 text-[#E94F36]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...prodOptionGroups];
                          next[gIdx] = {
                            ...grp,
                            choices: [...grp.choices, { id: generateFirestoreId('ch'), name: '', extraPrice: 0 }],
                          };
                          setProdOptionGroups(next);
                        }}
                        className="text-xs font-bold text-[#E94F36]"
                      >
                        + خيار جديد داخل {grp.name}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Addons */}
              <div className="space-y-3 pt-3 border-t border-zinc-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-sm text-zinc-900">الإضافات (صوصات، إضافات جانبية...)</h4>
                  <button type="button" onClick={addAddon} className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold">
                    + إضافة اختيار
                  </button>
                </div>
                {prodAddons.map((ad, aIdx) => (
                  <div key={ad.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ad.name}
                      onChange={(e) => {
                        const next = [...prodAddons];
                        next[aIdx] = { ...ad, name: e.target.value };
                        setProdAddons(next);
                      }}
                      placeholder="اسم الإضافة"
                      className="flex-1 h-9 rounded-lg border border-zinc-200 px-3 text-xs"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={ad.price}
                      onChange={(e) => {
                        const next = [...prodAddons];
                        next[aIdx] = { ...ad, price: Number(e.target.value) };
                        setProdAddons(next);
                      }}
                      placeholder="السعر"
                      className="w-24 h-9 rounded-lg border border-zinc-200 px-3 text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setProdAddons((prev) => prev.filter((_, i) => i !== aIdx))}
                      className="p-1.5 text-[#E94F36]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {errorMsg && <div className="text-xs font-bold text-[#E94F36]">{errorMsg}</div>}

              <button
                type="submit"
                disabled={prodSaving}
                className="w-full h-11 rounded-xl bg-[#E94F36] text-white text-sm font-bold hover:bg-[#d54028]"
              >
                {prodSaving ? 'جاري الحفظ...' : prodEditingId ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
