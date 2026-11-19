import React, { useMemo, useState } from 'react';
import {
  Bell,
  Clock,
  Edit3,
  Eye,
  FileText,
  Heart,
  HelpCircle,
  LayoutGrid,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Trash2,
  Truck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import defaultHeroGeoImg from '../assets/images/zad_mahawi_hero_geo_1795100393147.jpg';
import {
  BOOTSTRAPPED_OWNER_EMAIL,
  db,
  generateFirestoreId,
  registerFcmPushToken,
  stripUndefined,
} from '../firebase';
import type {
  Address,
  AdminTab,
  AppNotification,
  Banner,
  Category,
  CustomerTab,
  Offer,
  Order,
  OrderRating,
  Product,
  StaffPermissions,
  StoreSettings,
  UserProfile,
} from '../types';
import {
  DAY_LABELS,
  formatDateTime,
  formatPrice,
  formatWhatsAppUrl,
  FULFILLMENT_LABELS,
  getEffectiveProductPrice,
  isStoreCurrentlyOpen,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
  timestampToMillis,
  USER_LOGO_PATH,
} from '../utils/storeHelpers';
import { InlineEditModal, type InlineEditTarget } from './InlineEditModal';
import { MediaImage } from './MediaImage';
import { PWAInstallButton } from './PWAInstallButton';

interface CustomerPagesProps {
  activeTab: CustomerTab;
  onChangeTab: (tab: CustomerTab) => void;
  storeSettings: StoreSettings;
  banners: Banner[];
  categories: Category[];
  products: Product[];
  offers: Offer[];
  ratings: OrderRating[];
  catalogLoading: boolean;
  currentUser: User | null;
  userProfile: UserProfile | null;
  addresses: Address[];
  myOrders: Order[];
  notifications: AppNotification[];
  favoriteIds: string[];
  onToggleFavorite: (productId: string) => void;
  onSelectProduct: (product: Product) => void;
  onQuickAddToCart: (product: Product) => void;
  onReorder: (order: Order) => void;
  onOpenInvoice: (order: Order) => void;
  onOpenRating: (order: Order) => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenAdmin?: (tab?: AdminTab) => void;
  isStaff: boolean;
  staffPermissions: StaffPermissions;
  onUploadMedia: (dataUrl: string, mimeType: string) => Promise<string>;
  onLogAction: (action: string, col: string, id: string, summary: string) => Promise<void>;
  onNotifyToast: (msg: string) => void;
}

type LegalModalType = 'faq' | 'privacy' | 'terms' | 'refund' | 'hours' | null;

export const CustomerPages: React.FC<CustomerPagesProps> = ({
  activeTab,
  onChangeTab,
  storeSettings,
  banners,
  categories,
  products,
  offers,
  ratings,
  catalogLoading,
  currentUser,
  userProfile,
  addresses,
  myOrders,
  notifications,
  favoriteIds,
  onToggleFavorite,
  onSelectProduct,
  onQuickAddToCart,
  onReorder,
  onOpenInvoice,
  onOpenRating,
  onOpenLogin,
  onLogout,
  onOpenAdmin,
  isStaff,
  staffPermissions,
  onUploadMedia,
  onLogAction,
  onNotifyToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [menuFilter, setMenuFilter] = useState<'all' | 'featured' | 'discounted'>('all');
  const [ordersSegment, setOrdersSegment] = useState<'current' | 'past'>('current');
  const [legalModal, setLegalModal] = useState<LegalModalType>(null);

  // In-app manual edit mode for owner/staff
  const [editMode, setEditMode] = useState(false);
  const [inlineTarget, setInlineTarget] = useState<InlineEditTarget>(null);

  // Account edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameInput, setNameInput] = useState(userProfile?.name || '');
  const [phoneInput, setPhoneInput] = useState(userProfile?.phone || '');
  const [profileMsg, setProfileMsg] = useState('');

  // Address form state
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrGov, setAddrGov] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [addrArea, setAddrArea] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrDetails, setAddrDetails] = useState('');
  const [pushStatusMsg, setPushStatusMsg] = useState('');

  const openStatus = useMemo(() => isStoreCurrentlyOpen(storeSettings), [storeSettings]);
  const whatsappNumber = storeSettings.whatsapp?.trim() || '0791917755';
  const whatsappUrl = useMemo(() => formatWhatsAppUrl(whatsappNumber), [whatsappNumber]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive && !c.isHidden),
    [categories],
  );

  const visibleProducts = useMemo(() => {
    const activeCatIds = new Set(activeCategories.map((c) => c.id));
    return products.filter(
      (p) =>
        !p.isHidden &&
        p.isAvailable &&
        (activeCategories.length === 0 || activeCatIds.has(p.categoryId)),
    );
  }, [products, activeCategories]);

  const searchedProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleProducts.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (menuFilter === 'featured' && !p.isFeatured) return false;
      if (
        menuFilter === 'discounted' &&
        !(typeof p.discountPrice === 'number' && p.discountPrice < p.price)
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
      );
    });
  }, [visibleProducts, selectedCategoryId, menuFilter, searchQuery]);

  const activeBanners = useMemo(() => banners.filter((b) => b.isActive), [banners]);

  const activeOffers = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return offers.filter((o) => {
      if (!o.isActive) return false;
      if (o.startDate && o.startDate > today) return false;
      if (o.endDate && o.endDate < today) return false;
      return true;
    });
  }, [offers]);

  const featuredProducts = useMemo(
    () => visibleProducts.filter((p) => p.isFeatured),
    [visibleProducts],
  );

  const discountedProducts = useMemo(
    () =>
      visibleProducts.filter(
        (p) => typeof p.discountPrice === 'number' && p.discountPrice < p.price,
      ),
    [visibleProducts],
  );

  const bestSellingProducts = useMemo(
    () =>
      [...visibleProducts]
        .filter((p) => p.salesCount > 0)
        .sort((a, b) => b.salesCount - a.salesCount)
        .slice(0, 6),
    [visibleProducts],
  );

  const newProducts = useMemo(
    () =>
      [...visibleProducts]
        .filter((p) => p.showOnHome)
        .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt))
        .slice(0, 8),
    [visibleProducts],
  );

  const favoriteProducts = useMemo(
    () => visibleProducts.filter((p) => favoriteIds.includes(p.id)),
    [visibleProducts, favoriteIds],
  );

  const currentOrders = useMemo(
    () =>
      myOrders.filter((o) =>
        ['new', 'received', 'preparing', 'ready', 'out_for_delivery'].includes(o.status),
      ),
    [myOrders],
  );

  const pastOrders = useMemo(
    () => myOrders.filter((o) => o.status === 'delivered' || o.status === 'cancelled'),
    [myOrders],
  );

  const ratingsMap = useMemo(() => {
    const map: Record<string, OrderRating> = {};
    for (const r of ratings) {
      map[r.orderId || r.id] = r;
    }
    return map;
  }, [ratings]);

  const ratingStats = useMemo(() => {
    if (ratings.length === 0) return null;
    const restSum = ratings.reduce((s, r) => s + r.restaurantRating, 0);
    const restAvg = Number((restSum / ratings.length).toFixed(1));
    const driverRatings = ratings.filter((r) => typeof r.driverRating === 'number');
    const driverAvg =
      driverRatings.length > 0
        ? Number(
            (
              driverRatings.reduce((s, r) => s + (r.driverRating || 0), 0) /
              driverRatings.length
            ).toFixed(1),
          )
        : null;
    return {
      count: ratings.length,
      restAvg,
      driverAvg,
      driverCount: driverRatings.length,
    };
  }, [ratings]);

  const getCategoryName = (catId: string) =>
    categories.find((c) => c.id === catId)?.name || 'أصناف المحل';

  const getCategoryCount = (catId: string) =>
    visibleProducts.filter((p) => p.categoryId === catId).length;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileMsg('');
    await updateDoc(doc(db, 'users', currentUser.uid), {
      name: nameInput.trim() || currentUser.displayName || 'عميل',
      phone: phoneInput.trim(),
      updatedAt: serverTimestamp(),
    });
    setEditingProfile(false);
    setProfileMsg('تم تحديث بيانات الحساب بنجاح.');
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const addrId = generateFirestoreId('addr');
    await setDoc(
      doc(db, 'users', currentUser.uid, 'addresses', addrId),
      stripUndefined({
        label: addrLabel.trim() || 'المنزل',
        governorate: addrGov.trim(),
        city: addrCity.trim(),
        area: addrArea.trim(),
        street: addrStreet.trim(),
        details: addrDetails.trim(),
        isDefault: addresses.length === 0,
        createdAt: serverTimestamp(),
      }),
    );
    setAddrLabel('');
    setAddrGov('');
    setAddrCity('');
    setAddrArea('');
    setAddrStreet('');
    setAddrDetails('');
    setShowAddrForm(false);
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (!currentUser) return;
    await deleteDoc(doc(db, 'users', currentUser.uid, 'addresses', addrId));
  };

  const handleCancelNewOrder = async (order: Order) => {
    if (order.status !== 'new') return;
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  };

  const handleMarkNotifRead = async (notif: AppNotification) => {
    if (notif.isRead || notif.targetType === 'broadcast') return;
    await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
  };

  const handleEnablePush = async () => {
    if (!currentUser) return;
    const res = await registerFcmPushToken(currentUser.uid);
    if (res.ok) {
      setPushStatusMsg('تم تفعيل إشعارات الدفع الفورية لهذا الجهاز بنجاح.');
    } else if (res.reason === 'missing_vapid_key') {
      setPushStatusMsg(
        'تعمل الإشعارات الفورية داخل التطبيق حالياً. لتفعيل إشعارات المتصفح الخلفية (FCM)، يرجى إضافة مفتاح VITE_FIREBASE_VAPID_KEY في الإعدادات.',
      );
    } else if (res.reason === 'permission_denied') {
      setPushStatusMsg('تم رفض إذن الإشعارات في المتصفح.');
    } else {
      setPushStatusMsg(
        'المتصفح لا يدعم إشعارات FCM في هذه البيئة، وستصلك الإشعارات لحظياً داخل التطبيق.',
      );
    }
  };

  const openAllProductsView = () => {
    setSelectedCategoryId('all');
    setMenuFilter('all');
    onChangeTab('categories');
  };

  const renderProductCard = (product: Product) => {
    const effPrice = getEffectiveProductPrice(product);
    const hasDiscount =
      typeof product.discountPrice === 'number' && product.discountPrice < product.price;
    const isFav = favoriteIds.includes(product.id);
    const isAvailable =
      product.isAvailable &&
      (typeof product.stockQuantity !== 'number' || product.stockQuantity > 0);

    return (
      <article
        key={product.id}
        className="group bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col hover:border-zinc-300 hover:shadow-md transition-all duration-150 hover:-translate-y-0.5"
      >
        <div
          onClick={() => onSelectProduct(product)}
          className="relative aspect-4/3 bg-zinc-100 cursor-pointer overflow-hidden"
        >
          <MediaImage
            src={product.imageUrl}
            alt={product.name}
            fallbackLabel={product.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(product.id);
            }}
            className="absolute top-3 left-3 w-11 h-11 rounded-full bg-white/95 border border-zinc-200 flex items-center justify-center text-zinc-700 hover:bg-white shadow-xs"
            aria-label="إضافة للمفضلة"
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-[#E94F36] text-[#E94F36]' : ''}`} />
          </button>

          {editMode && staffPermissions.manageProducts && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInlineTarget({ type: 'product', product });
              }}
              className="absolute top-3 right-3 h-9 px-3 rounded-xl bg-zinc-900/90 text-white text-xs font-bold flex items-center gap-1 hover:bg-[#E94F36]"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>تعديل</span>
            </button>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
          <div onClick={() => onSelectProduct(product)} className="cursor-pointer space-y-1.5">
            <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-1.5">
              <span>{getCategoryName(product.categoryId)}</span>
              {typeof product.prepTimeMinutes === 'number' && product.prepTimeMinutes > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{product.prepTimeMinutes} د</span>
                </>
              )}
              {typeof product.calories === 'number' && product.calories > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{product.calories} سعرة</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className={isAvailable ? 'text-emerald-700 font-semibold' : 'text-zinc-400'}>
                {isAvailable ? 'متوفر' : 'غير متوفر'}
              </span>
            </div>

            <h3 className="font-display font-bold text-base text-zinc-900 line-clamp-1">
              {product.name}
            </h3>

            {product.description && (
              <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                {product.description}
              </p>
            )}
          </div>

          <div className="space-y-2.5 pt-2 border-t border-zinc-100">
            <div className="flex items-baseline justify-between gap-2 tabular-nums">
              <div className="font-extrabold text-base text-[#E94F36]">
                {formatPrice(effPrice, storeSettings.currency)}
              </div>
              {hasDiscount && (
                <div className="text-xs text-zinc-400 line-through">
                  {formatPrice(product.price, storeSettings.currency)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectProduct(product)}
                className="h-10 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-800 text-xs font-bold hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>التفاصيل</span>
              </button>
              <button
                type="button"
                disabled={!isAvailable}
                onClick={() => onQuickAddToCart(product)}
                className="h-10 px-3 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028] disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>أضف للسلة</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderEmptyCatalog = () => (
    <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-10 text-center space-y-3">
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span className="w-3.5 h-3.5 rounded-xs bg-[#E94F36]" />
        <span className="w-3.5 h-3.5 rounded-xs bg-[#B8E638]" />
        <span className="w-3.5 h-3.5 rounded-xs bg-[#65D9EA]" />
      </div>
      <h3 className="font-display text-lg font-extrabold text-zinc-900">
        لا توجد منتجات حالياً، ترقبوا إضافتنا القادمة
      </h3>
      <p className="text-sm text-zinc-500 max-w-md mx-auto">
        يعرض المتجر فقط الأصناف الحقيقية المضافة من قِبل إدارة {storeSettings.nameAr}.
      </p>
      {isStaff && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {staffPermissions.manageCategories && (
            <button
              type="button"
              onClick={() => setInlineTarget({ type: 'category' })}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-xs font-bold hover:bg-zinc-100"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قسم يدوياً</span>
            </button>
          )}
          {staffPermissions.manageProducts && activeCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setInlineTarget({ type: 'product' })}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة أول منتج يدوياً</span>
            </button>
          )}
          {onOpenAdmin && (
            <button
              type="button"
              onClick={() => onOpenAdmin('overview')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
            >
              <Store className="w-4 h-4 text-[#B8E638]" />
              <span>فتح لوحة الإدارة</span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="pb-24 md:pb-12">
      {/* Announcement strip if enabled */}
      {storeSettings.announcementEnabled && storeSettings.announcementText && (
        <div className="bg-zinc-900 text-white text-xs font-medium py-2 px-4 text-center">
          {storeSettings.announcementText}
        </div>
      )}

      {/* Owner/Staff Live Manual Editing Bar inside Storefront */}
      {isStaff && (
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-zinc-800">
              <Edit3 className="w-4 h-4 text-[#E94F36]" />
              <span>إدارة وتعديل المتجر يدوياً من الواجهة</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`h-9 px-3.5 rounded-xl font-bold transition-colors ${
                  editMode
                    ? 'bg-[#E94F36] text-white'
                    : 'bg-white border border-zinc-300 text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                {editMode ? 'إنهاء وضع التعديل المباشر' : 'تفعيل التعديل المباشر'}
              </button>
              {staffPermissions.manageSettings && (
                <button
                  type="button"
                  onClick={() => setInlineTarget({ type: 'hero', storeSettings })}
                  className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-bold hover:border-[#E94F36]"
                >
                  تعديل الهوية والصور
                </button>
              )}
              {staffPermissions.manageCategories && (
                <button
                  type="button"
                  onClick={() => setInlineTarget({ type: 'category' })}
                  className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-bold hover:border-[#E94F36]"
                >
                  + قسم جديد
                </button>
              )}
              {staffPermissions.manageProducts && (
                <button
                  type="button"
                  onClick={() => setInlineTarget({ type: 'product' })}
                  className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-zinc-700 font-bold hover:border-[#E94F36]"
                >
                  + منتج جديد
                </button>
              )}
              {staffPermissions.manageStaff && onOpenAdmin && (
                <button
                  type="button"
                  onClick={() => onOpenAdmin('staff')}
                  className="h-9 px-3 rounded-xl border border-zinc-200 bg-zinc-900 text-white font-bold hover:bg-zinc-800"
                >
                  تعيين مودتير يدوياً
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HOME TAB */}
      {activeTab === 'home' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-10">
          {/* Hero Section (Architectural brand palette & real emblem) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8 flex flex-col justify-between gap-6 relative">
              {editMode && staffPermissions.manageSettings && (
                <button
                  type="button"
                  onClick={() => setInlineTarget({ type: 'hero', storeSettings })}
                  className="absolute top-4 left-4 h-9 px-3 rounded-xl bg-zinc-900 text-white text-xs font-bold flex items-center gap-1 hover:bg-[#E94F36]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>تعديل الواجهة</span>
                </button>
              )}

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-950 shrink-0">
                    <MediaImage
                      src={storeSettings.logoUrl || USER_LOGO_PATH}
                      alt={storeSettings.nameAr}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-xs text-zinc-600 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-zinc-900">{storeSettings.nameAr}</span>
                      <span aria-hidden="true">·</span>
                      <span className={openStatus.open ? 'text-emerald-700 font-bold' : 'text-[#E94F36] font-bold'}>
                        {openStatus.open ? 'مفتوح الآن' : 'مغلق حالياً'}
                      </span>
                      {ratingStats && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-bold text-zinc-800 tabular-nums">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            {ratingStats.restAvg} ({ratingStats.count})
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-zinc-500">{openStatus.reason}</p>
                  </div>
                </div>

                <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-zinc-900 leading-tight text-balance">
                  {storeSettings.heroTitle || `${storeSettings.nameAr} — معجنات وسندويشات طازجة`}
                </h1>
                <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-xl">
                  {storeSettings.heroSubtitle || storeSettings.description}
                </p>
              </div>

              {/* Search Bar + Actions */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute right-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث عن معجنات، سندويشات، عروض..."
                    className="w-full h-12 pr-11 pl-4 rounded-2xl border border-zinc-200 bg-zinc-50 text-sm focus:bg-white focus:outline-none focus:border-[#E94F36]"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={openAllProductsView}
                    className="h-11 px-6 rounded-xl bg-[#E94F36] text-white text-sm font-bold hover:bg-[#d54028] transition-colors inline-flex items-center gap-2"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>عرض جميع المنتجات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegalModal('hours')}
                    className="h-11 px-4 rounded-xl border border-zinc-200 text-zinc-700 text-xs font-bold hover:bg-zinc-50 inline-flex items-center gap-1.5"
                  >
                    <Clock className="w-4 h-4 text-[#65D9EA]" />
                    <span>ساعات العمل</span>
                  </button>
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="h-11 px-4 rounded-xl border border-zinc-200 bg-white text-zinc-800 text-xs font-bold hover:border-emerald-500 inline-flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <span>واتساب {whatsappNumber}</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-3xl border border-zinc-200 overflow-hidden bg-zinc-950 min-h-[240px] relative">
              <MediaImage
                src={storeSettings.heroImageUrl || defaultHeroGeoImg}
                alt={storeSettings.nameAr}
                className="w-full h-full object-cover min-h-[240px]"
              />
              {editMode && staffPermissions.manageSettings && (
                <button
                  type="button"
                  onClick={() => setInlineTarget({ type: 'hero', storeSettings })}
                  className="absolute bottom-4 left-4 h-9 px-3 rounded-xl bg-white/95 text-zinc-900 text-xs font-bold shadow-md flex items-center gap-1.5 hover:bg-white"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#E94F36]" />
                  <span>تغيير صورة الواجهة</span>
                </button>
              )}
            </div>
          </section>

          {/* Search Results directly when typing */}
          {searchQuery.trim() ? (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-extrabold text-zinc-900">
                  نتائج البحث عن "{searchQuery}"
                </h2>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-bold text-[#E94F36]"
                >
                  مسح البحث
                </button>
              </div>
              {searchedProducts.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
                  لا توجد منتجات مطابقة لبحثك حالياً.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {searchedProducts.map(renderProductCard)}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* Active Banners */}
              {(activeBanners.length > 0 || (editMode && staffPermissions.manageHome)) && (
                <section className="space-y-3">
                  {editMode && staffPermissions.manageHome && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-600">بنرات الواجهة الترويجية</span>
                      <button
                        type="button"
                        onClick={() => setInlineTarget({ type: 'banner' })}
                        className="h-9 px-3 rounded-xl bg-zinc-900 text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة بانر</span>
                      </button>
                    </div>
                  )}
                  {activeBanners.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeBanners.map((b) => (
                        <div
                          key={b.id}
                          onClick={() => {
                            if (b.linkType === 'category' && b.linkTarget) {
                              setSelectedCategoryId(b.linkTarget);
                              onChangeTab('categories');
                            } else if (b.linkType === 'product' && b.linkTarget) {
                              const p = products.find((x) => x.id === b.linkTarget);
                              if (p) onSelectProduct(p);
                            } else if (b.linkType === 'offer') {
                              setMenuFilter('discounted');
                              onChangeTab('categories');
                            }
                          }}
                          className="relative rounded-2xl border border-zinc-200 overflow-hidden bg-zinc-900 text-white min-h-[160px] flex items-end cursor-pointer"
                        >
                          {b.imageUrl && (
                            <MediaImage
                              src={b.imageUrl}
                              alt={b.title}
                              className="absolute inset-0 w-full h-full object-cover opacity-70"
                            />
                          )}
                          {editMode && staffPermissions.manageHome && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineTarget({ type: 'banner', banner: b });
                              }}
                              className="absolute top-3 right-3 z-20 h-8 px-3 rounded-lg bg-white text-zinc-900 text-xs font-bold flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>
                          )}
                          <div className="relative z-10 w-full p-5 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                            <h3 className="font-display font-bold text-lg">{b.title}</h3>
                            {b.subtitle && <p className="text-xs text-zinc-200 mt-1">{b.subtitle}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Dynamic Ordered Home Sections */}
              {(storeSettings.homeSectionsOrder?.length
                ? storeSettings.homeSectionsOrder
                : ['offers', 'categories', 'featured', 'bestsellers', 'new']
              ).map((sectionKey) => {
                if (sectionKey === 'offers' && (activeOffers.length > 0 || discountedProducts.length > 0)) {
                  return (
                    <section key="offers" className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-extrabold text-zinc-900">
                          العروض والخصومات
                        </h2>
                        {discountedProducts.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategoryId('all');
                              setMenuFilter('discounted');
                              onChangeTab('categories');
                            }}
                            className="text-xs font-bold text-[#E94F36] hover:underline"
                          >
                            عرض الأصناف المخفضة
                          </button>
                        )}
                      </div>
                      {activeOffers.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {activeOffers.map((offer) => (
                            <div
                              key={offer.id}
                              className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-[#E94F36] flex items-center gap-1">
                                  <Tag className="w-3.5 h-3.5" />
                                  {offer.type === 'coupon' ? 'كوبون خصم' : 'عرض خاص'}
                                </span>
                                <span className="font-mono text-xs font-bold text-zinc-900">
                                  {offer.discountType === 'percent'
                                    ? `${offer.discountValue}%`
                                    : formatPrice(offer.discountValue, storeSettings.currency)}
                                </span>
                              </div>
                              <h3 className="font-display font-bold text-base text-zinc-900">
                                {offer.title}
                              </h3>
                              {offer.description && (
                                <p className="text-xs text-zinc-600">{offer.description}</p>
                              )}
                              {offer.code && (
                                <div className="pt-1 font-mono text-xs font-bold text-zinc-900 bg-zinc-100 rounded-lg px-3 py-1.5 inline-block">
                                  الكود: {offer.code}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {discountedProducts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {discountedProducts.slice(0, 6).map(renderProductCard)}
                        </div>
                      )}
                    </section>
                  );
                }

                if (sectionKey === 'categories' && activeCategories.length > 0) {
                  const gridColsClass =
                    activeCategories.length <= 2
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : activeCategories.length <= 4
                        ? 'grid-cols-2 sm:grid-cols-4'
                        : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6';
                  return (
                    <section key="categories" className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="font-display text-xl font-extrabold text-zinc-900">
                          الأقسام الرئيسية
                        </h2>
                        <button
                          type="button"
                          onClick={openAllProductsView}
                          className="text-xs font-bold text-[#E94F36] hover:underline"
                        >
                          عرض الكل
                        </button>
                      </div>
                      <div className={`grid ${gridColsClass} gap-4`}>
                        {activeCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className="relative group rounded-2xl border border-zinc-200 bg-white p-3.5 text-center hover:border-[#E94F36] hover:shadow-sm transition-all space-y-2.5"
                          >
                            {editMode && staffPermissions.manageCategories && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInlineTarget({ type: 'category', category: cat });
                                }}
                                className="absolute top-3 right-3 z-10 h-8 px-2.5 rounded-lg bg-zinc-900 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-[#E94F36]"
                                aria-label="تعديل القسم"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>تعديل</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategoryId(cat.id);
                                setMenuFilter('all');
                                onChangeTab('categories');
                              }}
                              className="w-full space-y-2.5 text-right"
                            >
                              <div className="aspect-16/10 rounded-xl overflow-hidden bg-zinc-100">
                                <MediaImage
                                  src={cat.imageUrl}
                                  alt={cat.name}
                                  fallbackLabel={cat.name}
                                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2 px-0.5">
                                <span className="font-display font-bold text-base text-zinc-900 truncate">
                                  {cat.name}
                                </span>
                                <span className="text-[11px] font-bold text-zinc-500 tabular-nums shrink-0">
                                  {getCategoryCount(cat.id)} صنف
                                </span>
                              </div>
                              {cat.description && (
                                <p className="text-xs text-zinc-500 line-clamp-1 px-0.5">
                                  {cat.description}
                                </p>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                }

                if (sectionKey === 'featured' && !catalogLoading && featuredProducts.length > 0) {
                  return (
                    <section key="featured" className="space-y-4">
                      <h2 className="font-display text-xl font-extrabold text-zinc-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#E94F36]" />
                        <span>المنتجات المميزة</span>
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {featuredProducts.map(renderProductCard)}
                      </div>
                    </section>
                  );
                }

                if (
                  sectionKey === 'bestsellers' &&
                  !catalogLoading &&
                  bestSellingProducts.length > 0
                ) {
                  return (
                    <section key="bestsellers" className="space-y-4">
                      <h2 className="font-display text-xl font-extrabold text-zinc-900">
                        الأكثر طلباً
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {bestSellingProducts.map(renderProductCard)}
                      </div>
                    </section>
                  );
                }

                if (sectionKey === 'new' && !catalogLoading && newProducts.length > 0) {
                  return (
                    <section key="new" className="space-y-4">
                      <h2 className="font-display text-xl font-extrabold text-zinc-900">
                        أحدث المنتجات
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {newProducts.map(renderProductCard)}
                      </div>
                    </section>
                  );
                }

                return null;
              })}

              {catalogLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-72 rounded-2xl border border-zinc-200 bg-zinc-100 animate-pulse"
                    />
                  ))}
                </div>
              ) : visibleProducts.length === 0 ? (
                renderEmptyCatalog()
              ) : (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={openAllProductsView}
                    className="h-12 px-8 rounded-2xl bg-zinc-900 text-white text-sm font-bold hover:bg-[#E94F36] transition-colors inline-flex items-center gap-2"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span>عرض جميع المنتجات ({visibleProducts.length})</span>
                  </button>
                </div>
              )}

              {/* Real Verified Customer Ratings (shown ONLY when real ratings exist) */}
              {ratingStats && (
                <section className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-display text-xl font-extrabold text-zinc-900">
                      تقييمات العملاء
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-zinc-700 tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <Star className="w-4 h-4 fill-[#E94F36] text-[#E94F36]" />
                        <span>المطعم: {ratingStats.restAvg} / 5</span>
                      </span>
                      {ratingStats.driverAvg !== null && (
                        <span className="inline-flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-[#65D9EA]" />
                          <span>التوصيل والسائق: {ratingStats.driverAvg} / 5</span>
                        </span>
                      )}
                      <span className="text-zinc-500">({ratingStats.count} تقييم)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {ratings.slice(0, 6).map((rev) => (
                      <div
                        key={rev.id}
                        className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-sm text-zinc-900">
                            {rev.customerName}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#E94F36] tabular-nums">
                            <Star className="w-3.5 h-3.5 fill-[#E94F36]" />
                            {rev.restaurantRating}/5
                          </span>
                        </div>
                        {typeof rev.driverRating === 'number' && (
                          <div className="text-[11px] font-semibold text-zinc-600 flex items-center gap-1 tabular-nums">
                            <Truck className="w-3.5 h-3.5 text-[#65D9EA]" />
                            <span>تقييم السائق: {rev.driverRating}/5</span>
                          </div>
                        )}
                        {rev.comment && (
                          <p className="text-xs text-zinc-600 leading-relaxed">{rev.comment}</p>
                        )}
                        {rev.staffReply && (
                          <p className="text-[11px] text-zinc-700 bg-zinc-50 rounded-xl p-2.5 border border-zinc-200">
                            <strong>رد الإدارة:</strong> {rev.staffReply}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Store Contact, Working Hours & Legal Footer */}
          <footer className="rounded-3xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <h3 className="font-display font-bold text-zinc-900">{storeSettings.nameAr}</h3>
                <p className="text-xs text-zinc-600 leading-relaxed">
                  {storeSettings.description}
                </p>
                {storeSettings.address && (
                  <p className="text-xs text-zinc-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#E94F36] shrink-0" />
                    <span>{storeSettings.address}</span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setLegalModal('hours')}
                  className="text-xs font-bold text-[#E94F36] inline-flex items-center gap-1 hover:underline pt-1"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>عرض جدول ساعات العمل الأسبوعي</span>
                </button>
              </div>

              <div className="space-y-2">
                <h3 className="font-display font-bold text-zinc-900">التواصل المباشر</h3>
                <div className="flex flex-wrap gap-2.5">
                  {storeSettings.phone && (
                    <a
                      href={`tel:${storeSettings.phone}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-800 hover:border-[#E94F36]"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#E94F36]" />
                      <span className="tabular-nums">{storeSettings.phone}</span>
                    </a>
                  )}
                  {whatsappUrl && (
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>واتساب: {whatsappNumber}</span>
                    </a>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display font-bold text-zinc-900">معلومات وسياسات المتجر</h3>
                <div className="flex flex-wrap gap-3 text-xs font-medium text-zinc-600">
                  <button
                    type="button"
                    onClick={() => setLegalModal('faq')}
                    className="hover:text-[#E94F36]"
                  >
                    الأسئلة الشائعة
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegalModal('privacy')}
                    className="hover:text-[#E94F36]"
                  >
                    سياسة الخصوصية
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegalModal('terms')}
                    className="hover:text-[#E94F36]"
                  >
                    شروط الاستخدام
                  </button>
                  <button
                    type="button"
                    onClick={() => setLegalModal('refund')}
                    className="hover:text-[#E94F36]"
                  >
                    سياسة الإلغاء والاسترجاع
                  </button>
                </div>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/* CATEGORIES TAB */}
      {activeTab === 'categories' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h1 className="font-display text-2xl font-extrabold text-zinc-900">
              الأقسام وقائمة الطعام
            </h1>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في الأصناف..."
                  className="w-full h-10 pr-10 pl-3 rounded-xl border border-zinc-200 bg-white text-sm"
                />
              </div>
              <select
                value={menuFilter}
                onChange={(e) =>
                  setMenuFilter(e.target.value as 'all' | 'featured' | 'discounted')
                }
                className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold"
              >
                <option value="all">جميع الأصناف</option>
                <option value="featured">المميزة فقط</option>
                <option value="discounted">العروض المخفضة</option>
              </select>
            </div>
          </div>

          {/* Visual Category Cards Grid */}
          {activeCategories.length > 0 && (
            <div
              className={`grid gap-3.5 ${
                activeCategories.length <= 2
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : activeCategories.length <= 4
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
                    : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`rounded-2xl border p-3 text-center transition-colors flex flex-col items-center justify-center gap-2 min-h-[116px] ${
                  selectedCategoryId === 'all'
                    ? 'bg-[#E94F36] text-white border-[#E94F36]'
                    : 'bg-white text-zinc-800 border-zinc-200 hover:border-[#E94F36]'
                }`}
              >
                <LayoutGrid className="w-6 h-6" />
                <span className="font-display font-bold text-sm">جميع الأصناف</span>
                <span className="text-[11px] opacity-80 tabular-nums">
                  {visibleProducts.length} صنف
                </span>
              </button>

              {activeCategories.map((c) => {
                const isSelected = selectedCategoryId === c.id;
                return (
                  <div
                    key={c.id}
                    className={`relative rounded-2xl border p-3 text-center transition-colors ${
                      isSelected
                        ? 'bg-[#E94F36] text-white border-[#E94F36]'
                        : 'bg-white text-zinc-800 border-zinc-200 hover:border-[#E94F36]'
                    }`}
                  >
                    {editMode && staffPermissions.manageCategories && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInlineTarget({ type: 'category', category: c });
                        }}
                        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center"
                        aria-label="تعديل القسم"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(c.id)}
                      className="w-full space-y-2"
                    >
                      <div className="aspect-4/3 rounded-xl overflow-hidden bg-zinc-100">
                        <MediaImage
                          src={c.imageUrl}
                          alt={c.name}
                          fallbackLabel={c.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="font-display font-bold text-sm truncate">{c.name}</div>
                      <div className="text-[11px] opacity-80 tabular-nums">
                        {getCategoryCount(c.id)} صنف
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {isStaff && staffPermissions.manageProducts && selectedCategoryId !== 'all' && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <span className="text-xs font-bold text-zinc-700">
                إدارة أصناف {getCategoryName(selectedCategoryId)}
              </span>
              <button
                type="button"
                onClick={() =>
                  setInlineTarget({ type: 'product', defaultCategoryId: selectedCategoryId })
                }
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف في {getCategoryName(selectedCategoryId)}</span>
              </button>
            </div>
          )}

          {visibleProducts.length === 0 ? (
            renderEmptyCatalog()
          ) : searchedProducts.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 p-8 text-center text-sm text-zinc-500">
              لا توجد منتجات في هذا القسم حالياً.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {searchedProducts.map(renderProductCard)}
            </div>
          )}
        </div>
      )}

      {/* FAVORITES TAB */}
      {activeTab === 'favorites' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-extrabold text-zinc-900">المفضلة</h1>
            {favoriteProducts.length > 0 && (
              <span className="text-xs font-bold text-zinc-500 tabular-nums">
                {favoriteProducts.length} صنف
              </span>
            )}
          </div>
          {favoriteProducts.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-10 text-center space-y-3">
              <Heart className="w-8 h-8 text-zinc-400 mx-auto" />
              <h3 className="font-display font-bold text-zinc-900">قائمة المفضلة فارغة</h3>
              <p className="text-sm text-zinc-500">
                اضغط على رمز القلب بجانب أي منتج لحفظه هنا والوصول إليه بسرعة.
              </p>
              <button
                type="button"
                onClick={openAllProductsView}
                className="px-5 py-2.5 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
              >
                تصفح الأصناف
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {favoriteProducts.map(renderProductCard)}
            </div>
          )}
        </div>
      )}

      {/* MY ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-extrabold text-zinc-900">
              طلباتي وتتبع الحالة
            </h1>
            {currentUser && myOrders.length > 0 && (
              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setOrdersSegment('current')}
                  className={`px-3.5 py-2 rounded-lg transition-colors tabular-nums ${
                    ordersSegment === 'current'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600'
                  }`}
                >
                  الطلبات الحالية ({currentOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOrdersSegment('past')}
                  className={`px-3.5 py-2 rounded-lg transition-colors tabular-nums ${
                    ordersSegment === 'past'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600'
                  }`}
                >
                  الطلبات السابقة ({pastOrders.length})
                </button>
              </div>
            )}
          </div>

          {!currentUser ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center space-y-4">
              <Package className="w-10 h-10 text-[#E94F36] mx-auto" />
              <h3 className="font-display font-bold text-lg text-zinc-900">
                سجّل الدخول لمتابعة طلباتك
              </h3>
              <p className="text-sm text-zinc-600 max-w-md mx-auto">
                عرض سجل الطلبات، تتبع حالة التحضير والتوصيل لحظياً، تقييم المطعم والسائق، وإعادة
                الطلب.
              </p>
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800"
              >
                <LogIn className="w-4 h-4" />
                <span>تسجيل الدخول</span>
              </button>
            </div>
          ) : myOrders.length === 0 ? (
            <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-10 text-center space-y-3">
              <ShoppingBag className="w-8 h-8 text-zinc-400 mx-auto" />
              <h3 className="font-display font-bold text-zinc-900">
                لم تقم بأي طلبات حتى الآن
              </h3>
              <button
                type="button"
                onClick={() => onChangeTab('categories')}
                className="px-5 py-2.5 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
              >
                تصفح المنتجات
              </button>
            </div>
          ) : (
            (() => {
              const displayedOrders =
                ordersSegment === 'current' ? currentOrders : pastOrders;
              if (displayedOrders.length === 0) {
                return (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                    {ordersSegment === 'current'
                      ? 'لا توجد طلبات قيد التنفيذ حالياً.'
                      : 'لا توجد طلبات سابقة مكتملة أو ملغاة بعد.'}
                  </div>
                );
              }
              return (
                <div className="space-y-4">
                  {displayedOrders.map((order) => {
                    const statusInfo = ORDER_STATUS_META[order.status];
                    const existingRating = ratingsMap[order.id];
                    const steps =
                      order.fulfillmentType === 'delivery'
                        ? [
                            'طلب جديد',
                            'تم الاستلام',
                            'جاري التحضير',
                            'جاهز',
                            'خرج للتوصيل',
                            'تم التسليم',
                          ]
                        : [
                            'طلب جديد',
                            'تم الاستلام',
                            'جاري التحضير',
                            'جاهز للتقديم',
                            'تم التسليم',
                          ];

                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-base text-zinc-900">
                                #{order.orderNumber}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${statusInfo.colorClass}`}
                              >
                                {statusInfo.label}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-500 mt-1">
                              {formatDateTime(order.createdAt)} ·{' '}
                              {FULFILLMENT_LABELS[order.fulfillmentType]}
                              {order.fulfillmentType === 'dine_in' && order.tableNumber
                                ? ` (طاولة ${order.tableNumber})`
                                : ''}{' '}
                              · {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                            </div>
                          </div>
                          <div className="text-left font-extrabold text-base text-[#E94F36] tabular-nums">
                            {formatPrice(order.total, storeSettings.currency)}
                          </div>
                        </div>

                        {/* Progress Stepper */}
                        {order.status !== 'cancelled' && (
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 pt-1">
                            {steps.map((label, idx) => {
                              const mappedStep =
                                order.fulfillmentType !== 'delivery' && idx === 4 ? 5 : idx;
                              const done = statusInfo.stepIndex >= mappedStep;
                              return (
                                <div key={label} className="space-y-1">
                                  <div
                                    className={`h-1.5 rounded-full ${done ? 'bg-[#E94F36]' : 'bg-zinc-200'}`}
                                  />
                                  <span
                                    className={`block text-[10px] font-bold truncate ${done ? 'text-zinc-900' : 'text-zinc-400'}`}
                                  >
                                    {label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {order.rejectionReason && (
                          <p className="text-xs text-[#E94F36] bg-[#E94F36]/8 rounded-xl px-3 py-2">
                            سبب الإلغاء: {order.rejectionReason}
                          </p>
                        )}

                        <div className="text-xs text-zinc-600 space-y-1 border-t border-zinc-100 pt-3">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between">
                              <span>
                                {item.quantity}× {item.productName}
                              </span>
                              <span className="tabular-nums font-medium">
                                {formatPrice(item.lineTotal, storeSettings.currency)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Rating display if already rated */}
                        {existingRating && (
                          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-xs space-y-1">
                            <div className="flex flex-wrap items-center gap-3 font-bold text-zinc-800">
                              <span className="inline-flex items-center gap-1">
                                <Star className="w-3.5 h-3.5 fill-[#E94F36] text-[#E94F36]" />
                                تقييم المطعم: {existingRating.restaurantRating}/5
                              </span>
                              {typeof existingRating.driverRating === 'number' && (
                                <span className="inline-flex items-center gap-1">
                                  <Truck className="w-3.5 h-3.5 text-[#65D9EA]" />
                                  تقييم السائق: {existingRating.driverRating}/5
                                </span>
                              )}
                            </div>
                            {existingRating.comment && (
                              <p className="text-zinc-600">{existingRating.comment}</p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                          <button
                            type="button"
                            onClick={() => onOpenInvoice(order)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>عرض الفاتورة / PDF</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onReorder(order)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>إعادة الطلب</span>
                          </button>
                          {order.status === 'delivered' && (
                            <button
                              type="button"
                              onClick={() => onOpenRating(order)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028]"
                            >
                              <Star className="w-3.5 h-3.5" />
                              <span>
                                {existingRating ? 'تعديل التقييم' : 'قيّم المطعم والسائق'}
                              </span>
                            </button>
                          )}
                          {order.status === 'new' && (
                            <button
                              type="button"
                              onClick={() => handleCancelNewOrder(order)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E94F36]/30 text-[#E94F36] text-xs font-bold hover:bg-[#E94F36]/10 mr-auto"
                            >
                              إلغاء الطلب
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ACCOUNT TAB */}
      {activeTab === 'account' && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-extrabold text-zinc-900">حسابي</h1>
            {isStaff && onOpenAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                {staffPermissions.manageStaff && (
                  <button
                    type="button"
                    onClick={() => onOpenAdmin('staff')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-xs font-bold hover:bg-zinc-50"
                  >
                    <span>تعيين مودتير يدوياً</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenAdmin('overview')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
                >
                  <Store className="w-4 h-4 text-[#B8E638]" />
                  <span>لوحة الإدارة</span>
                </button>
              </div>
            )}
          </div>

          {!currentUser ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center space-y-4">
              <UserIcon className="w-10 h-10 text-[#E94F36] mx-auto" />
              <h2 className="font-display font-bold text-lg text-zinc-900">
                مرحباً بك في {storeSettings.nameAr}
              </h2>
              <p className="text-sm text-zinc-600 max-w-md mx-auto">
                سجّل الدخول لإدارة بياناتك، عناوين التوصيل المحفوظة، الإشعارات، الطلبات السابقة،
                والمفضلة.
              </p>
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#E94F36] text-white text-sm font-bold hover:bg-[#d54028]"
              >
                <LogIn className="w-4 h-4" />
                <span>تسجيل الدخول / إنشاء حساب</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display font-bold text-lg text-zinc-900">
                      {userProfile?.name || currentUser.displayName}
                    </h2>
                    <p className="text-xs text-zinc-500">
                      {currentUser.email}{' '}
                      {userProfile?.phone ? `· ${userProfile.phone}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(userProfile?.name || currentUser.displayName || '');
                        setPhoneInput(userProfile?.phone || '');
                        setEditingProfile((v) => !v);
                      }}
                      className="px-3.5 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      {editingProfile ? 'إلغاء' : 'تعديل البيانات'}
                    </button>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#E94F36]/30 text-[#E94F36] text-xs font-bold hover:bg-[#E94F36]/10"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                </div>

                {profileMsg && (
                  <p className="text-xs text-emerald-700 font-medium">{profileMsg}</p>
                )}

                {!isStaff && (
                  <p className="text-[11px] text-zinc-500 bg-zinc-50 rounded-xl px-3 py-2 border border-zinc-200">
                    مسجّل الدخول بحساب عميل ({currentUser.email}). للوصول إلى لوحة إدارة المطعم،
                    سجّل الدخول بحساب المالك ({BOOTSTRAPPED_OWNER_EMAIL}) أو اطلب من المالك
                    إضافتك في صلاحيات الموظفين.
                  </p>
                )}

                {editingProfile && (
                  <form
                    onSubmit={handleSaveProfile}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-100"
                  >
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="الاسم"
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                    <input
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="رقم الهاتف"
                      className="h-10 rounded-xl border border-zinc-200 px-3 text-sm tabular-nums"
                    />
                    <button
                      type="submit"
                      className="h-10 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
                    >
                      حفظ التعديلات
                    </button>
                  </form>
                )}
              </div>

              {/* Account Quick Summaries: Orders & Favorites */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm text-zinc-900 flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#E94F36]" />
                      <span>الطلبات السابقة ({pastOrders.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setOrdersSegment('past');
                        onChangeTab('orders');
                      }}
                      className="text-xs font-bold text-[#E94F36] hover:underline"
                    >
                      عرض السجل
                    </button>
                  </div>
                  {pastOrders.length === 0 ? (
                    <p className="text-xs text-zinc-500">لا توجد طلبات سابقة بعد.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {pastOrders.slice(0, 2).map((o) => (
                        <div
                          key={o.id}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 p-2.5 border border-zinc-100"
                        >
                          <div>
                            <span className="font-mono font-bold">#{o.orderNumber}</span>
                            <span className="text-zinc-500 mr-2">
                              {ORDER_STATUS_META[o.status].label}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onReorder(o)}
                            className="font-bold text-[#E94F36] hover:underline"
                          >
                            إعادة الطلب
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-sm text-zinc-900 flex items-center gap-2">
                      <Heart className="w-4 h-4 text-[#E94F36]" />
                      <span>المنتجات المفضلة ({favoriteProducts.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => onChangeTab('favorites')}
                      className="text-xs font-bold text-[#E94F36] hover:underline"
                    >
                      عرض الكل
                    </button>
                  </div>
                  {favoriteProducts.length === 0 ? (
                    <p className="text-xs text-zinc-500">لم تقم بإضافة أصناف للمفضلة بعد.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {favoriteProducts.slice(0, 2).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 p-2.5 border border-zinc-100"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectProduct(p)}
                            className="font-bold text-zinc-900 truncate hover:text-[#E94F36]"
                          >
                            {p.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => onQuickAddToCart(p)}
                            className="font-bold text-[#E94F36] shrink-0 mr-2"
                          >
                            + للسلة
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Saved Addresses */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-base text-zinc-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#E94F36]" />
                    <span>عناوين التوصيل المحفوظة</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowAddrForm((v) => !v)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة عنوان</span>
                  </button>
                </div>

                {showAddrForm && (
                  <form
                    onSubmit={handleAddAddress}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-200"
                  >
                    <input
                      type="text"
                      required
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                      placeholder="التسمية (المنزل / العمل)"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={addrGov}
                      onChange={(e) => setAddrGov(e.target.value)}
                      placeholder="المحافظة"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      placeholder="المدينة"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={addrArea}
                      onChange={(e) => setAddrArea(e.target.value)}
                      placeholder="المنطقة"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="text"
                      required
                      value={addrStreet}
                      onChange={(e) => setAddrStreet(e.target.value)}
                      placeholder="الشارع"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <input
                      type="text"
                      value={addrDetails}
                      onChange={(e) => setAddrDetails(e.target.value)}
                      placeholder="تفاصيل إضافية"
                      className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    />
                    <button
                      type="submit"
                      className="sm:col-span-3 h-10 rounded-xl bg-[#E94F36] text-white text-xs font-bold"
                    >
                      حفظ العنوان
                    </button>
                  </form>
                )}

                {addresses.length === 0 ? (
                  <p className="text-xs text-zinc-500">لا توجد عناوين محفوظة بعد.</p>
                ) : (
                  <div className="space-y-2">
                    {addresses.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-zinc-900">{a.label}</span>
                          <p className="text-zinc-600 mt-0.5">
                            {a.governorate}، {a.city}، {a.area} — {a.street}{' '}
                            {a.details ? `(${a.details})` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteAddress(a.id)}
                          className="p-2 text-zinc-400 hover:text-[#E94F36]"
                          aria-label="حذف العنوان"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-base text-zinc-900 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-[#E94F36]" />
                    <span>الإشعارات والتنبيهات</span>
                  </h2>
                  <button
                    type="button"
                    onClick={handleEnablePush}
                    className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    تفعيل إشعارات الجهاز (FCM)
                  </button>
                </div>

                {pushStatusMsg && (
                  <p className="text-xs text-zinc-600 bg-zinc-50 rounded-xl p-3">
                    {pushStatusMsg}
                  </p>
                )}

                {notifications.length === 0 ? (
                  <p className="text-xs text-zinc-500">لا توجد إشعارات حالياً.</p>
                ) : (
                  <div className="space-y-2">
                    {notifications.slice(0, 15).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleMarkNotifRead(n)}
                        className={`rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                          n.isRead
                            ? 'border-zinc-200 bg-white'
                            : 'border-[#E94F36]/30 bg-[#E94F36]/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-zinc-900">{n.title}</span>
                          <span className="text-[11px] text-zinc-400">
                            {formatDateTime(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-zinc-600 mt-1">{n.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Direct Support (WhatsApp 0791917755), App Install & Legal links */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h2 className="font-display font-bold text-base text-zinc-900">
              الدعم والتواصل المباشر
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>تواصل مباشر عبر واتساب ({whatsappNumber})</span>
                </a>
              )}
              {storeSettings.phone && (
                <a
                  href={`tel:${storeSettings.phone}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-800 text-xs font-bold hover:bg-zinc-50"
                >
                  <Phone className="w-4 h-4 text-[#E94F36]" />
                  <span className="tabular-nums">اتصال: {storeSettings.phone}</span>
                </a>
              )}
            </div>

            <PWAInstallButton variant="full" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLegalModal('faq')}
                className="p-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-1.5"
              >
                <HelpCircle className="w-4 h-4 text-[#65D9EA]" />
                <span>الأسئلة الشائعة</span>
              </button>
              <button
                type="button"
                onClick={() => setLegalModal('privacy')}
                className="p-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                سياسة الخصوصية
              </button>
              <button
                type="button"
                onClick={() => setLegalModal('terms')}
                className="p-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                شروط الاستخدام
              </button>
              <button
                type="button"
                onClick={() => setLegalModal('refund')}
                className="p-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                الإلغاء والاسترجاع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legal / Hours / FAQ Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-zinc-200 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="font-display font-extrabold text-lg text-zinc-900">
                {legalModal === 'faq' && 'الأسئلة الشائعة'}
                {legalModal === 'privacy' && 'سياسة الخصوصية'}
                {legalModal === 'terms' && 'شروط الاستخدام'}
                {legalModal === 'refund' && 'سياسة الإلغاء والاسترجاع'}
                {legalModal === 'hours' && 'أوقات العمل'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {legalModal === 'hours' && (
              <div className="space-y-2 text-sm">
                {(Object.keys(DAY_LABELS) as Array<keyof typeof DAY_LABELS>).map((d) => {
                  const sched = storeSettings.workingHours?.[d];
                  return (
                    <div key={d} className="flex justify-between py-2 border-b border-zinc-100">
                      <span className="font-bold text-zinc-800">{DAY_LABELS[d]}</span>
                      <span className="tabular-nums text-zinc-600">
                        {!sched || sched.closed
                          ? 'مغلق'
                          : `${sched.open} - ${sched.close}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {legalModal === 'faq' && (
              <div className="space-y-3 text-sm">
                {storeSettings.faqItems.length === 0 ? (
                  <p className="text-zinc-500">لم تُضف أسئلة شائعة بعد من لوحة الإدارة.</p>
                ) : (
                  storeSettings.faqItems.map((item) => (
                    <div key={item.id} className="rounded-xl bg-zinc-50 p-3.5 space-y-1">
                      <p className="font-bold text-zinc-900">{item.question}</p>
                      <p className="text-xs text-zinc-600 leading-relaxed">{item.answer}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {legalModal === 'privacy' && (
              <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                {storeSettings.privacyPolicy}
              </p>
            )}

            {legalModal === 'terms' && (
              <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                {storeSettings.termsOfUse}
              </p>
            )}

            {legalModal === 'refund' && (
              <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
                {storeSettings.refundPolicy}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Inline Manual Editor Modal for Storefront */}
      <InlineEditModal
        target={inlineTarget}
        categories={categories}
        currency={storeSettings.currency}
        onClose={() => setInlineTarget(null)}
        onUploadMedia={onUploadMedia}
        onLogAction={onLogAction}
        onSaved={onNotifyToast}
      />
    </div>
  );
};
