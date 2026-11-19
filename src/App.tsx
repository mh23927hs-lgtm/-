import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Grid,
  Heart,
  Home,
  Package,
  Shield,
  ShoppingCart,
  User as UserIcon,
} from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useStoreData } from './hooks/useStoreData';
import type { AdminTab, CartItem, CustomerTab, Offer, Order, OrderStatus, Product } from './types';
import { calculateCartItemTotal, formatPrice, getEffectiveProductPrice, ORDER_STATUS_META } from './utils/storeHelpers';
import { BrandLogo } from './components/BrandLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';
import { AuthModal } from './components/AuthModal';
import { ProductModal } from './components/ProductModal';
import { RatingModal } from './components/RatingModal';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutView } from './components/CheckoutView';
import { InvoiceModal } from './components/InvoiceModal';
import { CustomerPages } from './components/CustomerPages';
import { AdminDashboard } from './components/AdminDashboard';

const LOCAL_CART_KEY = 'zad_mahawi_cart_v1';
const LOCAL_FAV_KEY = 'zad_mahawi_favs_v1';

function StorefrontApp() {
  const store = useStoreData();
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab>('overview');

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_CART_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  const [localFavorites, setLocalFavorites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_FAV_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [showSplash, setShowSplash] = useState(true);
  const [appliedCoupon, setAppliedCoupon] = useState<Offer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [ratingOrder, setRatingOrder] = useState<Order | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [bannerToast, setBannerToast] = useState<string>('');
  const orderStatusMapRef = useRef<Record<string, OrderStatus> | null>(null);

  // Live customer toast when an active order status changes
  useEffect(() => {
    if (!store.currentUser) {
      orderStatusMapRef.current = null;
      return;
    }
    if (!orderStatusMapRef.current) {
      const init: Record<string, OrderStatus> = {};
      for (const o of store.myOrders) init[o.id] = o.status;
      orderStatusMapRef.current = init;
      return;
    }
    const prevMap = orderStatusMapRef.current;
    for (const o of store.myOrders) {
      if (prevMap[o.id] && prevMap[o.id] !== o.status) {
        setBannerToast(`تحديث طلبك #${o.orderNumber}: ${ORDER_STATUS_META[o.status].label}`);
        setTimeout(() => setBannerToast(''), 5000);
      }
      prevMap[o.id] = o.status;
    }
  }, [store.currentUser, store.myOrders]);

  // Persist cart & guest favorites locally
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_FAV_KEY, JSON.stringify(localFavorites));
    } catch {
      // ignore
    }
  }, [localFavorites]);

  // Verify online payment return URL if redirected back from Stripe / Moyasar / Tap
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_verify') === '1') {
      const provider = params.get('provider') || '';
      const orderId = params.get('orderId') || '';
      const sessionId = params.get('session_id') || params.get('tap_id') || params.get('id') || '';

      window.history.replaceState({}, document.title, window.location.pathname);
      setCart([]);
      setAppliedCoupon(null);
      setActiveTab('orders');

      if (provider && sessionId) {
        fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, paymentReference: sessionId }),
        })
          .then((r) => r.json())
          .then((res: { verified?: boolean; status?: string }) => {
            if (res.verified) {
              setBannerToast(`تم استلام وتأكيد الدفع الإلكتروني للطلب (${orderId}) بنجاح.`);
            } else {
              setBannerToast(`تم إرسال الطلب، وحالة الدفع لدى المزود: ${res.status || 'قيد التحقق'}`);
            }
          })
          .catch(() => {
            setBannerToast('تم إرسال الطلب، سيتم التحقق من حالة الدفع من قِبل الإدارة.');
          });
      }
    } else if (params.get('payment_cancelled') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
      setActiveTab('orders');
      setBannerToast('تم إلغاء عملية الدفع الإلكتروني. يمكنك المتابعة من صفحة طلباتي.');
    }
  }, []);

  const favoriteIds = useMemo(() => {
    if (store.currentUser && store.userProfile) {
      return store.userProfile.favoriteProductIds || [];
    }
    return localFavorites;
  }, [store.currentUser, store.userProfile, localFavorites]);

  const handleToggleFavorite = async (productId: string) => {
    const exists = favoriteIds.includes(productId);
    const next = exists ? favoriteIds.filter((id) => id !== productId) : [...favoriteIds, productId];
    setLocalFavorites(next);
    if (store.currentUser && store.userProfile) {
      await updateDoc(doc(db, 'users', store.currentUser.uid), {
        favoriteProductIds: next,
        updatedAt: serverTimestamp(),
      });
    }
  };

  const showToastMsg = (msg: string) => {
    setBannerToast(msg);
    setTimeout(() => setBannerToast(''), 3500);
  };

  const handleAddToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === newItem.cartKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + newItem.quantity };
        return next;
      }
      return [...prev, newItem];
    });
    showToastMsg(`تمت إضافة "${newItem.productName}" إلى سلة المشتريات`);
  };

  const handleQuickAddToCart = (product: Product) => {
    const isOutOfStock =
      !product.isAvailable ||
      product.isHidden ||
      (typeof product.stockQuantity === 'number' && product.stockQuantity <= 0);
    if (isOutOfStock) return;

    const hasRequiredOptions = (product.optionGroups || []).some(
      (grp) => grp.required || (grp.minSelect || 0) > 0,
    );
    if (hasRequiredOptions) {
      setSelectedProduct(product);
      return;
    }

    handleAddToCart({
      cartKey: `${product.id}||`,
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      baseUnitPrice: getEffectiveProductPrice(product),
      quantity: 1,
      selectedOptionChoices: [],
      selectedAddons: [],
      note: '',
    });
  };

  const handleUpdateCartQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: item.quantity + delta } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveCartItem = (cartKey: string) => {
    setCart((prev) => prev.filter((i) => i.cartKey !== cartKey));
  };

  const handleReorder = (order: Order) => {
    const itemsToAdd: CartItem[] = [];
    for (const item of order.items) {
      const liveProduct = store.products.find((p) => p.id === item.productId);
      if (!liveProduct || !liveProduct.isAvailable || liveProduct.isHidden) continue;

      const selectedOptionChoices: CartItem['selectedOptionChoices'] = [];
      for (const opt of item.selectedOptions || []) {
        const grp = liveProduct.optionGroups.find((g) => g.name === opt.groupName);
        const ch = grp?.choices.find((c) => c.name === opt.choiceName);
        if (grp && ch) {
          selectedOptionChoices.push({
            groupId: grp.id,
            groupName: grp.name,
            choiceId: ch.id,
            choiceName: ch.name,
            extraPrice: ch.extraPrice || 0,
          });
        }
      }

      const selectedAddons: CartItem['selectedAddons'] = [];
      for (const ad of item.selectedAddons || []) {
        const liveAd = liveProduct.addons.find((a) => a.name === ad.name);
        if (liveAd) {
          selectedAddons.push({ id: liveAd.id, name: liveAd.name, price: liveAd.price || 0 });
        }
      }

      const baseUnit =
        typeof liveProduct.discountPrice === 'number' && liveProduct.discountPrice < liveProduct.price
          ? liveProduct.discountPrice
          : liveProduct.price;

      itemsToAdd.push({
        cartKey: `${liveProduct.id}|reorder|${Date.now()}_${Math.random()}`,
        productId: liveProduct.id,
        productName: liveProduct.name,
        imageUrl: liveProduct.imageUrl,
        baseUnitPrice: baseUnit,
        quantity: item.quantity,
        selectedOptionChoices,
        selectedAddons,
        note: item.note || '',
      });
    }

    if (itemsToAdd.length === 0) {
      setBannerToast('الأصناف في هذا الطلب غير متوفرة حالياً.');
      setTimeout(() => setBannerToast(''), 3500);
      return;
    }

    setCart((prev) => [...prev, ...itemsToAdd]);
    setCartOpen(true);
  };

  const totalCartItems = cart.reduce((s, i) => s + i.quantity, 0);
  const totalCartAmount = cart.reduce((s, i) => s + calculateCartItemTotal(i), 0);
  const unreadNotifsCount = store.notifications.filter((n) => !n.isRead).length;

  // Separate Admin Control Panel View
  if (isAdminView && store.staffAccess.isStaff) {
    return (
      <>
        <AdminDashboard
          onExitAdmin={() => setIsAdminView(false)}
          initialTab={adminInitialTab}
          staffAccess={store.staffAccess}
          storeSettings={store.storeSettings}
          paymentSettings={store.paymentSettings}
          paymentCapabilities={store.paymentCapabilities}
          banners={store.banners}
          categories={store.categories}
          products={store.products}
          productCosts={store.productCosts}
          offers={store.offers}
          deliveryZones={store.deliveryZones}
          orders={store.adminOrders}
          ratings={store.ratings}
          customers={store.adminCustomers}
          staffInvites={store.staffInvites}
          auditLogs={store.auditLogs}
          adminNotifications={store.adminNotifications}
          onOpenInvoice={(o) => setInvoiceOrder(o)}
          onUploadMedia={store.uploadMediaImage}
          onSendNotification={store.sendSystemNotification}
          onLogAction={store.logAdminAction}
        />
        <InvoiceModal
          order={invoiceOrder}
          storeSettings={store.storeSettings}
          onClose={() => setInvoiceOrder(null)}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col" dir="rtl">
      {/* Top Bar (3-zone clean layout on desktop, compact bar on mobile) */}
      <header className="no-print sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="text-right shrink-0 focus:outline-none"
          >
            <BrandLogo
              logoUrl={store.storeSettings.logoUrl}
              nameAr={store.storeSettings.nameAr}
              nameEn={store.storeSettings.nameEn}
            />
          </button>

          {/* Zone 2: Desktop Single-Line Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-zinc-600">
            {(
              [
                ['home', 'الرئيسية'],
                ['categories', 'الأقسام'],
                ['favorites', 'المفضلة'],
                ['orders', 'طلباتي'],
                ['account', 'حسابي'],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  activeTab === tabKey
                    ? 'border-[#E94F36] text-zinc-900'
                    : 'border-transparent hover:text-zinc-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Primary Actions (Cart + Admin Entry if staff + PWA Install) */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton variant="compact" />
            </div>

            {store.staffAccess.isStaff && (
              <button
                type="button"
                onClick={() => {
                  setAdminInitialTab('overview');
                  setIsAdminView(true);
                }}
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 whitespace-nowrap shrink-0"
              >
                <Shield className="w-3.5 h-3.5 text-[#B8E638]" />
                <span>الإدارة</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#E94F36] text-white text-xs font-bold hover:bg-[#d54028] transition-colors whitespace-nowrap shrink-0"
              aria-label="سلة المشتريات"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">السلة</span>
              {totalCartItems > 0 && (
                <span className="tabular-nums font-mono bg-white text-[#E94F36] rounded-md px-1.5 py-0.5 text-[11px] font-extrabold leading-none">
                  {totalCartItems}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Toast feedback */}
      {bannerToast && (
        <div className="no-print fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-zinc-900 text-white px-5 py-2.5 text-xs font-bold shadow-xl flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-[#B8E638]" />
          <span>{bannerToast}</span>
        </div>
      )}

      {showSplash && (
        <SplashScreen
          logoUrl={store.storeSettings.logoUrl}
          nameAr={store.storeSettings.nameAr}
          nameEn={store.storeSettings.nameEn}
          onFinish={() => setShowSplash(false)}
        />
      )}

      {/* Main Storefront Content */}
      <main className="flex-1">
        <CustomerPages
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          storeSettings={store.storeSettings}
          banners={store.banners}
          categories={store.categories}
          products={store.products}
          offers={store.offers}
          ratings={store.ratings}
          catalogLoading={store.catalogLoading}
          currentUser={store.currentUser}
          userProfile={store.userProfile}
          addresses={store.addresses}
          myOrders={store.myOrders}
          notifications={store.notifications}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onSelectProduct={(p) => setSelectedProduct(p)}
          onQuickAddToCart={handleQuickAddToCart}
          onReorder={handleReorder}
          onOpenInvoice={(o) => setInvoiceOrder(o)}
          onOpenRating={(o) => setRatingOrder(o)}
          onOpenLogin={() => setAuthModalOpen(true)}
          onLogout={store.logout}
          onOpenAdmin={(tab) => {
            setAdminInitialTab(tab || 'overview');
            setIsAdminView(true);
          }}
          isStaff={store.staffAccess.isStaff}
          staffPermissions={store.staffAccess.permissions}
          onUploadMedia={store.uploadMediaImage}
          onLogAction={store.logAdminAction}
          onNotifyToast={showToastMsg}
        />
      </main>

      {/* Compact Mobile Floating Cart Bar above bottom navigation */}
      {totalCartItems > 0 && !cartOpen && !checkoutOpen && (
        <div className="no-print md:hidden fixed bottom-[70px] left-3 right-3 z-30">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full h-12 rounded-2xl bg-[#E94F36] text-white px-4 shadow-lg flex items-center justify-between text-xs font-bold hover:bg-[#d54028]"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span>عرض السلة ({totalCartItems})</span>
            </span>
            <span className="tabular-nums font-extrabold">
              {formatPrice(totalCartAmount, store.storeSettings.currency)}
            </span>
          </button>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (5 required destinations) */}
      <nav
        className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200"
        aria-label="التنقل السفلي"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {(
            [
              { id: 'home', label: 'الرئيسية', icon: Home },
              { id: 'categories', label: 'الأقسام', icon: Grid },
              { id: 'favorites', label: 'المفضلة', icon: Heart },
              { id: 'orders', label: 'طلباتي', icon: Package },
              { id: 'account', label: 'حسابي', icon: UserIcon },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center h-full gap-0.5 transition-colors ${
                  active ? 'text-[#E94F36]' : 'text-zinc-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.4]' : ''}`} />
                <span className="text-[10px] font-bold">{item.label}</span>
                {item.id === 'account' && unreadNotifsCount > 0 && (
                  <span className="absolute top-2 left-1/3 w-2 h-2 rounded-full bg-[#E94F36]" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Drawers */}
      <ProductModal
        product={selectedProduct}
        currency={store.storeSettings.currency}
        isFavorite={selectedProduct ? favoriteIds.includes(selectedProduct.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        currency={store.storeSettings.currency}
        offers={store.offers}
        appliedCoupon={appliedCoupon}
        onApplyCoupon={setAppliedCoupon}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => {
          setCart([]);
          setAppliedCoupon(null);
        }}
        onProceedCheckout={() => {
          setCartOpen(false);
          setCheckoutOpen(true);
        }}
        defaultDeliveryFee={store.storeSettings.defaultDeliveryFee}
      />

      <CheckoutView
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        storeSettings={store.storeSettings}
        paymentSettings={store.paymentSettings}
        paymentCapabilities={store.paymentCapabilities}
        deliveryZones={store.deliveryZones}
        appliedCoupon={appliedCoupon}
        currentUser={store.currentUser}
        userProfile={store.userProfile}
        addresses={store.addresses}
        onRequireLogin={() => setAuthModalOpen(true)}
        onOrderCreated={(order) => {
          setCheckoutOpen(false);
          setCart([]);
          setAppliedCoupon(null);
          setActiveTab('orders');
          setInvoiceOrder(order);
          setBannerToast(`تم استلام طلبك #${order.orderNumber} بنجاح!`);
          setTimeout(() => setBannerToast(''), 4000);
        }}
        onSendNotification={store.sendSystemNotification}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onGoogleLogin={store.signInWithGoogle}
      />

      <InvoiceModal
        order={invoiceOrder}
        storeSettings={store.storeSettings}
        onClose={() => setInvoiceOrder(null)}
      />

      <RatingModal
        order={ratingOrder}
        existingRating={
          ratingOrder
            ? store.ratings.find((r) => r.orderId === ratingOrder.id || r.id === ratingOrder.id) || null
            : null
        }
        onClose={() => setRatingOrder(null)}
        onSubmit={async (order, payload) => {
          await store.submitOrderRating(order, payload);
          showToastMsg(`شكراً لتقييمك طلب #${order.orderNumber}`);
        }}
      />

      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StorefrontApp />
    </ErrorBoundary>
  );
}
