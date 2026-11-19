import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  ChefHat,
  Clock,
  CreditCard,
  Download,
  FileText,
  FolderTree,
  Home,
  LayoutDashboard,
  Menu,
  Package,
  Printer,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Star,
  Tag,
  Truck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AdminTab,
  AppNotification,
  AuditLog,
  Banner,
  Category,
  DeliveryZone,
  Offer,
  Order,
  OrderRating,
  OrderStatus,
  PaymentCapabilities,
  PaymentSettings,
  Product,
  ProductCost,
  StaffInvite,
  StoreSettings,
  UserProfile,
} from '../types';
import type { StaffAccess } from '../hooks/useStoreData';
import {
  exportReportToExcel,
  formatDateTime,
  formatPrice,
  FULFILLMENT_LABELS,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  playNewOrderChime,
  timestampToMillis,
} from '../utils/storeHelpers';
import { BrandLogo } from './BrandLogo';
import { AdminCatalogPanels } from './admin/AdminCatalogPanels';
import { AdminOperationsPanels } from './admin/AdminOperationsPanels';

interface AdminDashboardProps {
  onExitAdmin: () => void;
  initialTab?: AdminTab;
  staffAccess: StaffAccess;
  storeSettings: StoreSettings;
  paymentSettings: PaymentSettings;
  paymentCapabilities: PaymentCapabilities;
  banners: Banner[];
  categories: Category[];
  products: Product[];
  productCosts: Record<string, ProductCost>;
  offers: Offer[];
  deliveryZones: DeliveryZone[];
  orders: Order[];
  ratings: OrderRating[];
  customers: UserProfile[];
  staffInvites: StaffInvite[];
  auditLogs: AuditLog[];
  adminNotifications: AppNotification[];
  onOpenInvoice: (order: Order) => void;
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

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onExitAdmin,
  initialTab = 'overview',
  staffAccess,
  storeSettings,
  paymentSettings,
  paymentCapabilities,
  banners,
  categories,
  products,
  productCosts,
  offers,
  deliveryZones,
  orders,
  ratings,
  customers,
  staffInvites,
  auditLogs,
  adminNotifications,
  onOpenInvoice,
  onUploadMedia,
  onSendNotification,
  onLogAction,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const seenOrderIdsRef = useRef<Set<string> | null>(null);

  const { permissions, role } = staffAccess;

  // Update elapsed minute counters for Kitchen Display every 15s
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Real-time sound alert when a brand-new order arrives
  useEffect(() => {
    if (!seenOrderIdsRef.current) {
      seenOrderIdsRef.current = new Set(orders.map((o) => o.id));
      return;
    }
    const prev = seenOrderIdsRef.current;
    let hasNewIncoming = false;
    for (const o of orders) {
      if (!prev.has(o.id)) {
        prev.add(o.id);
        if (o.status === 'new') hasNewIncoming = true;
      }
    }
    if (hasNewIncoming && soundEnabled) {
      playNewOrderChime();
    }
  }, [orders, soundEnabled]);

  const kitchenOrders = useMemo(() => {
    return orders
      .filter((o) => ['new', 'received', 'preparing', 'ready'].includes(o.status))
      .sort((a, b) => timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt));
  }, [orders]);

  const allNavItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode; allowed: boolean }> = [
    { id: 'overview', label: 'لوحة المعلومات', icon: <LayoutDashboard className="w-4 h-4" />, allowed: true },
    { id: 'kitchen', label: 'شاشة المطبخ (KDS)', icon: <ChefHat className="w-4 h-4" />, allowed: permissions.manageOrders },
    { id: 'orders', label: 'إدارة الطلبات', icon: <ShoppingBag className="w-4 h-4" />, allowed: permissions.manageOrders },
    { id: 'ratings', label: 'تقييمات المطعم والسائقين', icon: <Star className="w-4 h-4" />, allowed: permissions.manageOrders || permissions.viewReports },
    { id: 'products', label: 'إدارة المنتجات', icon: <Package className="w-4 h-4" />, allowed: permissions.manageProducts },
    { id: 'categories', label: 'إدارة الأقسام', icon: <FolderTree className="w-4 h-4" />, allowed: permissions.manageCategories },
    { id: 'customers', label: 'إدارة العملاء', icon: <Users className="w-4 h-4" />, allowed: permissions.manageCustomers },
    { id: 'offers', label: 'العروض والكوبونات', icon: <Tag className="w-4 h-4" />, allowed: permissions.manageOffers },
    { id: 'delivery', label: 'إدارة التوصيل', icon: <Truck className="w-4 h-4" />, allowed: permissions.manageDelivery },
    { id: 'payments', label: 'إدارة الدفع', icon: <CreditCard className="w-4 h-4" />, allowed: permissions.managePayments },
    { id: 'home', label: 'الصفحة الرئيسية', icon: <Home className="w-4 h-4" />, allowed: permissions.manageHome },
    { id: 'settings', label: 'إعدادات المحل', icon: <Settings className="w-4 h-4" />, allowed: permissions.manageSettings },
    { id: 'notifications', label: 'الإشعارات', icon: <Bell className="w-4 h-4" />, allowed: permissions.manageNotifications || permissions.manageOrders },
    { id: 'staff', label: 'الموديتور والموظفون والصلاحيات', icon: <Shield className="w-4 h-4" />, allowed: role === 'owner' || permissions.manageStaff },
    { id: 'reports', label: 'التقارير والأرباح', icon: <BarChart3 className="w-4 h-4" />, allowed: permissions.viewReports },
  ];
  const navItems = allNavItems.filter((n) => n.allowed);

  const periodFilteredOrders = useMemo(() => {
    if (periodFilter === 'all') return orders;
    const now = Date.now();
    const msMap = {
      today: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };
    const cutoff = now - msMap[periodFilter];
    return orders.filter((o) => timestampToMillis(o.createdAt) >= cutoff);
  }, [orders, periodFilter]);

  const metrics = useMemo(() => {
    const validOrders = periodFilteredOrders.filter((o) => o.status !== 'cancelled');
    const totalSales = validOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalCost = validOrders.reduce(
      (sum, o) =>
        sum +
        o.items.reduce(
          (iSum, item) => iSum + (productCosts[item.productId]?.costPrice ?? 0) * item.quantity,
          0,
        ),
      0,
    );
    const totalProfit = validOrders.reduce((s, o) => s + (o.subtotal - o.discountAmount), 0) - totalCost;
    const newCount = periodFilteredOrders.filter((o) => o.status === 'new').length;
    const inProgressCount = periodFilteredOrders.filter((o) =>
      ['received', 'preparing', 'ready', 'out_for_delivery'].includes(o.status),
    ).length;
    const completedCount = periodFilteredOrders.filter((o) => o.status === 'delivered').length;
    const cancelledCount = periodFilteredOrders.filter((o) => o.status === 'cancelled').length;

    // Real top selling products from actual non-cancelled orders
    const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of validOrders) {
      for (const item of o.items) {
        const cur = productSalesMap.get(item.productId) || { name: item.productName, qty: 0, revenue: 0 };
        cur.qty += item.quantity;
        cur.revenue += item.lineTotal;
        productSalesMap.set(item.productId, cur);
      }
    }
    const topProducts = Array.from(productSalesMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 6);

    return {
      totalSales,
      totalCost,
      totalProfit,
      ordersCount: periodFilteredOrders.length,
      newCount,
      inProgressCount,
      completedCount,
      cancelledCount,
      topProducts,
    };
  }, [periodFilteredOrders, productCosts]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (orderStatusFilter !== 'all' && o.status !== orderStatusFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q)
      );
    });
  }, [orders, orderSearch, orderStatusFilter]);

  const handleUpdateOrderStatus = async (order: Order, nextStatus: OrderStatus, reason?: string) => {
    try {
      const nextPayStatus =
        nextStatus === 'delivered' && order.paymentMethod !== 'online' ? 'paid' : order.paymentStatus;

      await updateDoc(doc(db, 'orders', order.id), {
        status: nextStatus,
        paymentStatus: nextPayStatus,
        rejectionReason: reason || order.rejectionReason || '',
        updatedAt: serverTimestamp(),
      });

      // When delivered, commit real sales & customer totals once
      if (nextStatus === 'delivered' && order.status !== 'delivered') {
        for (const item of order.items) {
          const prod = products.find((p) => p.id === item.productId);
          if (prod) {
            const updates: Record<string, unknown> = {
              salesCount: increment(item.quantity),
              updatedAt: serverTimestamp(),
            };
            if (typeof prod.stockQuantity === 'number') {
              updates.stockQuantity = Math.max(0, prod.stockQuantity - item.quantity);
            }
            await updateDoc(doc(db, 'products', prod.id), updates);
          }
        }
        await updateDoc(doc(db, 'users', order.customerId), {
          ordersCount: increment(1),
          totalSpent: increment(order.total),
          updatedAt: serverTimestamp(),
        });
      }

      const statusLabel = ORDER_STATUS_META[nextStatus].label;
      await onSendNotification({
        targetType: 'user',
        targetUserId: order.customerId,
        title: `تحديث الطلب #${order.orderNumber}`,
        body: `حالة طلبك الآن: ${statusLabel}${reason ? ` (${reason})` : ''}`,
        orderId: order.id,
      });

      await onLogAction('update_order_status', 'orders', order.id, `#${order.orderNumber} -> ${statusLabel}`);
      setActionMsg(`تم تحديث حالة الطلب #${order.orderNumber} إلى "${statusLabel}"`);
      if (selectedOrder?.id === order.id) {
        setSelectedOrder({ ...order, status: nextStatus, paymentStatus: nextPayStatus });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleVerifyOnlinePayment = async (order: Order) => {
    if (!order.paymentProvider || !order.paymentReference) return;
    const res = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: order.paymentProvider,
        paymentReference: order.paymentReference,
      }),
    });
    const data = (await res.json()) as { verified: boolean; status: string };
    if (data.verified) {
      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'paid',
        updatedAt: serverTimestamp(),
      });
      setActionMsg(`تم تأكيد الدفع الإلكتروني للطلب #${order.orderNumber}`);
    } else {
      setActionMsg(`حالة الدفع لدى المزود: ${data.status}`);
    }
  };

  const handleRefundOnlinePayment = async (order: Order) => {
    if (!order.paymentProvider || !order.paymentReference) return;
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/payments/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({
        provider: order.paymentProvider,
        paymentReference: order.paymentReference,
      }),
    });
    const data = (await res.json()) as { refunded: boolean; error?: string };
    if (data.refunded) {
      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'refunded',
        updatedAt: serverTimestamp(),
      });
      await onLogAction('refund_payment', 'orders', order.id, `استرداد مبلغ الطلب #${order.orderNumber}`);
      setActionMsg(`تم استرداد المبلغ للطلب #${order.orderNumber}`);
    } else {
      setActionMsg(data.error || 'تعذر تنفيذ الاسترداد');
    }
  };

  const unreadAdminCount = adminNotifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row" dir="rtl">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden md:flex w-64 shrink-0 bg-white border-l border-zinc-200 flex-col justify-between p-4 sticky top-0 h-screen overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <BrandLogo logoUrl={storeSettings.logoUrl} nameAr={storeSettings.nameAr} nameEn="ADMIN PANEL" />
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#E94F36] text-white'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
                {item.id === 'notifications' && unreadAdminCount > 0 && (
                  <span className="tabular-nums text-[11px] font-mono">{unreadAdminCount}</span>
                )}
                {item.id === 'kitchen' && kitchenOrders.length > 0 && (
                  <span className="tabular-nums text-[11px] font-mono">{kitchenOrders.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <button
          onClick={onExitAdmin}
          className="mt-4 w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-100"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة لواجهة المتجر</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Mobile/Tablet Header */}
        <header className="no-print sticky top-0 z-30 bg-white border-b border-zinc-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl text-zinc-700 hover:bg-zinc-100"
              aria-label="القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-display font-extrabold text-sm text-zinc-900 truncate">
              لوحة تحكم {storeSettings.nameAr} · {role === 'owner' ? 'المالك' : role === 'manager' ? 'المدير' : 'الموظف'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${
                soundEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-zinc-200 text-zinc-500'
              }`}
              title={soundEnabled ? 'تنبيه صوتي مفعل' : 'تنبيه صوتي صامت'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{soundEnabled ? 'صوت التنبيه' : 'صامت'}</span>
            </button>
            <button
              onClick={onExitAdmin}
              className="px-3.5 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              عرض المتجر
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex bg-black/50">
            <div className="w-72 bg-white h-full p-4 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                  <BrandLogo logoUrl={storeSettings.logoUrl} nameAr={storeSettings.nameAr} nameEn="ADMIN" />
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-zinc-500">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold ${
                        activeTab === item.id ? 'bg-[#E94F36] text-white' : 'text-zinc-700'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </div>
              <button onClick={onExitAdmin} className="w-full h-10 rounded-xl border border-zinc-200 text-xs font-bold">
                العودة للمتجر
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {actionMsg && (
            <div className="no-print rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs font-bold text-emerald-800 flex items-center justify-between">
              <span>{actionMsg}</span>
              <button onClick={() => setActionMsg('')}>×</button>
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-extrabold text-zinc-900">ملخص الأداء الفعلي</h1>
                <div className="flex items-center gap-1 p-1 bg-zinc-200/70 rounded-xl text-xs font-bold">
                  {([
                    ['today', 'اليوم'],
                    ['week', 'أسبوعي'],
                    ['month', 'شهري'],
                    ['all', 'الكل'],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => setPeriodFilter(k)}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${periodFilter === k ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">إجمالي المبيعات الفعلية</p>
                  <p className="font-display text-2xl font-extrabold text-[#E94F36] mt-1 tabular-nums">
                    {formatPrice(metrics.totalSales, storeSettings.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">عدد الطلبات</p>
                  <p className="font-display text-2xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {metrics.ordersCount}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
                    جديد {metrics.newCount} · قيد التنفيذ {metrics.inProgressCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">المكتملة / الملغاة</p>
                  <p className="font-display text-2xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {metrics.completedCount} / {metrics.cancelledCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">عدد العملاء المسجلين</p>
                  <p className="font-display text-2xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {customers.length}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
                <h2 className="font-display font-bold text-base text-zinc-900">أكثر المنتجات مبيعاً</h2>
                {metrics.topProducts.length === 0 ? (
                  <p className="text-xs text-zinc-500">لا توجد مبيعات مسجلة في هذه الفترة بعد.</p>
                ) : (
                  <div className="divide-y divide-zinc-100 text-sm">
                    {metrics.topProducts.map((tp, idx) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between">
                        <span className="font-bold text-zinc-800">{tp.name}</span>
                        <span className="text-xs text-zinc-600 tabular-nums">
                          {tp.qty} وحدة · {formatPrice(tp.revenue, storeSettings.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KITCHEN DISPLAY SYSTEM (KDS) */}
          {activeTab === 'kitchen' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-extrabold text-zinc-900 flex items-center gap-2">
                    <ChefHat className="w-6 h-6 text-[#E94F36]" />
                    <span>شاشة المطبخ المباشرة (KDS)</span>
                  </h1>
                  <p className="text-xs text-zinc-500 mt-1">
                    تذاكر التحضير مرتبة من الأقدم للأحدث لسرعة تسليم الطلبات داخل المطبخ.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-zinc-700 bg-white border border-zinc-200 rounded-xl px-3.5 py-2 tabular-nums">
                  الطلبات النشطة: {kitchenOrders.length}
                </span>
              </div>

              {kitchenOrders.length === 0 ? (
                <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center space-y-2">
                  <ChefHat className="w-10 h-10 text-zinc-300 mx-auto" />
                  <p className="font-display font-bold text-zinc-900">لا توجد طلبات قيد التحضير في المطبخ حالياً</p>
                  <p className="text-xs text-zinc-500">ستظهر تذاكر الطلبات الجديدة هنا فور وصولها مع تنبيه صوتي.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {kitchenOrders.map((order) => {
                    const createdMs = timestampToMillis(order.createdAt);
                    const elapsedMin = createdMs > 0 ? Math.max(0, Math.floor((nowMs - createdMs) / 60000)) : 0;
                    const urgent = elapsedMin >= 20;
                    return (
                      <div
                        key={order.id}
                        className={`rounded-2xl border-2 bg-white flex flex-col justify-between overflow-hidden ${
                          order.status === 'new'
                            ? 'border-[#E94F36]'
                            : order.status === 'preparing'
                              ? 'border-amber-400'
                              : order.status === 'ready'
                                ? 'border-emerald-500'
                                : 'border-zinc-200'
                        }`}
                      >
                        <div className="p-4 border-b border-zinc-100 bg-zinc-50 flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-extrabold text-base text-zinc-900">#{order.orderNumber}</span>
                              <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${ORDER_STATUS_META[order.status].colorClass}`}>
                                {ORDER_STATUS_META[order.status].label}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-zinc-700 mt-1">
                              {FULFILLMENT_LABELS[order.fulfillmentType]}
                              {order.fulfillmentType === 'dine_in' && order.tableNumber ? ` · طاولة ${order.tableNumber}` : ''}
                            </p>
                            <p className="text-[11px] text-zinc-500">{order.customerName}</p>
                          </div>
                          <div className={`inline-flex items-center gap-1 font-mono text-xs font-extrabold tabular-nums px-2 py-1 rounded-lg ${urgent ? 'bg-[#E94F36] text-white' : 'bg-white border border-zinc-200 text-zinc-700'}`}>
                            <Clock className="w-3.5 h-3.5" />
                            <span>{elapsedMin} د</span>
                          </div>
                        </div>

                        <div className="p-4 space-y-2.5 flex-1">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="pb-2 border-b border-zinc-100 last:border-0 last:pb-0">
                              <div className="flex items-start gap-2 font-bold text-sm text-zinc-900">
                                <span className="font-mono text-[#E94F36] tabular-nums shrink-0">{it.quantity}×</span>
                                <span>{it.productName}</span>
                              </div>
                              {it.selectedOptions?.length > 0 && (
                                <p className="text-xs text-zinc-600 pr-6 mt-0.5">
                                  {it.selectedOptions.map((o) => `${o.groupName}: ${o.choiceName}`).join(' · ')}
                                </p>
                              )}
                              {it.selectedAddons?.length > 0 && (
                                <p className="text-xs text-zinc-600 pr-6">
                                  + {it.selectedAddons.map((a) => a.name).join('، ')}
                                </p>
                              )}
                              {it.note && (
                                <p className="text-xs font-bold text-[#E94F36] bg-[#E94F36]/8 rounded-lg px-2 py-1 mt-1 mr-6">
                                  ملاحظة: {it.note}
                                </p>
                              )}
                            </div>
                          ))}

                          {order.notes && (
                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-900">
                              ملاحظة الطلب: {order.notes}
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex gap-2">
                          {order.status === 'new' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order, 'received')}
                              className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                            >
                              قبول للمطبخ
                            </button>
                          )}
                          {order.status === 'received' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order, 'preparing')}
                              className="flex-1 h-10 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
                            >
                              بدء التحضير
                            </button>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order, 'ready')}
                              className="flex-1 h-10 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
                            >
                              جاهز للتقديم / الاستلام
                            </button>
                          )}
                          {order.status === 'ready' && order.fulfillmentType === 'delivery' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order, 'out_for_delivery')}
                              className="flex-1 h-10 rounded-xl bg-cyan-700 text-white text-xs font-bold"
                            >
                              خرج للتوصيل
                            </button>
                          )}
                          {order.status === 'ready' && order.fulfillmentType !== 'delivery' && (
                            <button
                              onClick={() => handleUpdateOrderStatus(order, 'delivered')}
                              className="flex-1 h-10 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                            >
                              تم التسليم
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-xl font-extrabold text-zinc-900">إدارة الطلبات الواردة</h1>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="رقم الطلب، الاسم، الهاتف..."
                      className="h-10 pr-9 pl-3 rounded-xl border border-zinc-200 bg-white text-xs"
                    />
                  </div>
                  <select
                    value={orderStatusFilter}
                    onChange={(e) => setOrderStatusFilter(e.target.value as OrderStatus | 'all')}
                    className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold"
                  >
                    <option value="all">كل الحالات</option>
                    {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {ORDER_STATUS_META[st].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                  لا توجد طلبات مطابقة حالياً.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-zinc-900">#{order.orderNumber}</span>
                            <span className={`px-2 py-0.5 rounded-lg border text-xs font-bold ${ORDER_STATUS_META[order.status].colorClass}`}>
                              {ORDER_STATUS_META[order.status].label}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">
                            {order.customerName} · {order.customerPhone} · {formatDateTime(order.createdAt)}
                          </p>
                        </div>
                        <div className="text-left tabular-nums">
                          <div className="font-extrabold text-base text-[#E94F36]">
                            {formatPrice(order.total, storeSettings.currency)}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {PAYMENT_METHOD_LABELS[order.paymentMethod]} ({PAYMENT_STATUS_LABELS[order.paymentStatus]})
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
                        {order.status === 'new' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(order, 'received')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                          >
                            قبول الطلب
                          </button>
                        )}
                        {order.status === 'received' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(order, 'preparing')}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold"
                          >
                            بدء التحضير
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(order, 'ready')}
                            className="px-3 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-bold"
                          >
                            جاهز للاستلام
                          </button>
                        )}
                        {order.status === 'ready' && order.fulfillmentType === 'delivery' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(order, 'out_for_delivery')}
                            className="px-3 py-1.5 rounded-xl bg-cyan-700 text-white text-xs font-bold"
                          >
                            خرج للتوصيل
                          </button>
                        )}
                        {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                          <button
                            onClick={() => handleUpdateOrderStatus(order, 'delivered')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                          >
                            تم التسليم
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700"
                        >
                          التفاصيل والرفض
                        </button>
                        <button
                          onClick={() => onOpenInvoice(order)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>الفاتورة</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-3xl bg-white border border-zinc-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <h3 className="font-display font-bold text-lg">تفاصيل الطلب #{selectedOrder.orderNumber}</h3>
                      <button onClick={() => setSelectedOrder(null)} className="text-zinc-500 p-1">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="text-xs space-y-1.5 text-zinc-700">
                      <p><strong>العميل:</strong> {selectedOrder.customerName} ({selectedOrder.customerPhone})</p>
                      <p>
                        <strong>الاستلام:</strong>{' '}
                        {FULFILLMENT_LABELS[selectedOrder.fulfillmentType]}
                        {selectedOrder.fulfillmentType === 'dine_in' && selectedOrder.tableNumber
                          ? ` — طاولة رقم ${selectedOrder.tableNumber}`
                          : ''}
                      </p>
                      {selectedOrder.deliveryAddress && (
                        <p>
                          <strong>العنوان:</strong> {selectedOrder.deliveryAddress.governorate}، {selectedOrder.deliveryAddress.city}، {selectedOrder.deliveryAddress.area} — {selectedOrder.deliveryAddress.street} {selectedOrder.deliveryAddress.details || ''}
                        </p>
                      )}
                      {selectedOrder.notes && <p><strong>ملاحظات العميل:</strong> {selectedOrder.notes}</p>}
                    </div>

                    <div className="rounded-xl bg-zinc-50 p-3 space-y-1.5 text-xs">
                      {selectedOrder.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{it.quantity}× {it.productName}</span>
                          <span className="tabular-nums font-bold">{formatPrice(it.lineTotal, storeSettings.currency)}</span>
                        </div>
                      ))}
                    </div>

                    {selectedOrder.paymentMethod === 'online' && selectedOrder.paymentReference && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleVerifyOnlinePayment(selectedOrder)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>التحقق من الدفع عبر المزود</span>
                        </button>
                        {selectedOrder.paymentStatus === 'paid' && (
                          <button
                            onClick={() => handleRefundOnlinePayment(selectedOrder)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E94F36]/30 text-[#E94F36] text-xs font-bold"
                          >
                            استرداد المبلغ
                          </button>
                        )}
                      </div>
                    )}

                    {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' && (
                      <div className="space-y-2 pt-2 border-t border-zinc-100">
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="سبب الرفض أو الإلغاء (اختياري)"
                          className="w-full h-9 rounded-xl border border-zinc-200 px-3 text-xs"
                        />
                        <button
                          onClick={() => {
                            handleUpdateOrderStatus(selectedOrder, 'cancelled', rejectReason);
                            setRejectReason('');
                          }}
                          className="w-full h-10 rounded-xl border border-[#E94F36]/40 text-[#E94F36] text-xs font-bold hover:bg-[#E94F36]/10"
                        >
                          رفض / إلغاء الطلب
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RATINGS & REVIEWS */}
          {activeTab === 'ratings' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-xl font-extrabold text-zinc-900">
                  تقييمات العملاء للمطعم والسائقين ({ratings.length})
                </h1>
              </div>

              {ratings.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
                  لا توجد تقييمات مرسلة من العملاء حتى الآن. تظهر هنا التقييمات الحقيقية بعد تسليم الطلبات.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <p className="text-xs text-zinc-500">متوسط تقييم المطعم</p>
                      <p className="font-display text-2xl font-extrabold text-[#E94F36] mt-1 tabular-nums">
                        {(ratings.reduce((s, r) => s + r.restaurantRating, 0) / ratings.length).toFixed(1)} / 5
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <p className="text-xs text-zinc-500">متوسط تقييم السائقين</p>
                      <p className="font-display text-2xl font-extrabold text-cyan-700 mt-1 tabular-nums">
                        {(() => {
                          const dList = ratings.filter((r) => typeof r.driverRating === 'number');
                          return dList.length > 0
                            ? `${(dList.reduce((s, r) => s + (r.driverRating || 0), 0) / dList.length).toFixed(1)} / 5`
                            : '—';
                        })()}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <p className="text-xs text-zinc-500">إجمالي التقييمات الموثقة</p>
                      <p className="font-display text-2xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                        {ratings.length}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {ratings.map((rev) => {
                      const draft = replyDrafts[rev.id] ?? rev.staffReply ?? '';
                      return (
                        <div key={rev.id} className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-sm text-zinc-900">{rev.customerName}</span>
                              <span className="font-mono text-xs text-zinc-500 mr-2">#{rev.orderNumber}</span>
                              <span className="text-xs text-zinc-400 mr-2">· {formatDateTime(rev.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-bold tabular-nums">
                              <span className="text-[#E94F36]">المطعم: {rev.restaurantRating}/5</span>
                              {typeof rev.driverRating === 'number' && (
                                <span className="text-cyan-700">السائق: {rev.driverRating}/5</span>
                              )}
                            </div>
                          </div>
                          {rev.comment && <p className="text-xs text-zinc-700 leading-relaxed">{rev.comment}</p>}
                          {permissions.manageOrders && (
                            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-zinc-100">
                              <input
                                value={draft}
                                onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                                maxLength={300}
                                placeholder="اكتب رداً رسمياً للعميل..."
                                className="flex-1 h-9 rounded-xl border border-zinc-200 px-3 text-xs"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'ratings', rev.id), {
                                      staffReply: draft.trim(),
                                      updatedAt: serverTimestamp(),
                                    });
                                    await onLogAction('reply_rating', 'ratings', rev.id, `رد على تقييم #${rev.orderNumber}`);
                                    setActionMsg(`تم حفظ الرد على تقييم الطلب #${rev.orderNumber}`);
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.UPDATE, `ratings/${rev.id}`);
                                  }
                                }}
                                className="h-9 px-4 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 shrink-0"
                              >
                                حفظ الرد
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PRODUCTS & CATEGORIES */}
          {(activeTab === 'products' || activeTab === 'categories') && (
            <AdminCatalogPanels
              mode={activeTab}
              categories={categories}
              products={products}
              productCosts={productCosts}
              currency={storeSettings.currency}
              onUploadMedia={onUploadMedia}
              onLogAction={onLogAction}
            />
          )}

          {/* CUSTOMERS */}
          {activeTab === 'customers' && (
            <div className="space-y-4">
              <h1 className="font-display text-xl font-extrabold text-zinc-900">إدارة العملاء ({customers.length})</h1>
              {customers.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
                  لا يوجد عملاء مسجلون حتى الآن.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                      <tr>
                        <th className="p-3.5 font-bold">العميل</th>
                        <th className="p-3.5 font-bold">الهاتف / البريد</th>
                        <th className="p-3.5 font-bold">عدد الطلبات</th>
                        <th className="p-3.5 font-bold">إجمالي المشتريات</th>
                        <th className="p-3.5 font-bold">السجل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {customers.map((c) => {
                        const custOrders = orders.filter((o) => o.customerId === c.uid && o.status !== 'cancelled');
                        const realCount = custOrders.length || c.ordersCount;
                        const realSpent = custOrders.reduce((s, o) => s + o.total, 0) || c.totalSpent;
                        return (
                          <tr key={c.uid} className="hover:bg-zinc-50">
                            <td className="p-3.5 font-bold text-zinc-900">{c.name}</td>
                            <td className="p-3.5 text-zinc-600">
                              {c.phone || '—'} · {c.email || '—'}
                            </td>
                            <td className="p-3.5 tabular-nums font-bold">{realCount}</td>
                            <td className="p-3.5 tabular-nums font-bold text-[#E94F36]">
                              {formatPrice(realSpent, storeSettings.currency)}
                            </td>
                            <td className="p-3.5">
                              <button
                                onClick={() => setSelectedCustomer(c)}
                                className="px-3 py-1.5 rounded-lg border border-zinc-200 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100"
                              >
                                عرض الطلبات
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCustomer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="w-full max-w-lg rounded-3xl bg-white border border-zinc-200 p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <div>
                        <h3 className="font-display font-bold text-lg text-zinc-900">{selectedCustomer.name}</h3>
                        <p className="text-xs text-zinc-500">{selectedCustomer.phone || 'بدون هاتف'} · {selectedCustomer.email || '—'}</p>
                      </div>
                      <button onClick={() => setSelectedCustomer(null)} className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    {(() => {
                      const cOrders = orders.filter((o) => o.customerId === selectedCustomer.uid);
                      if (cOrders.length === 0) {
                        return <p className="text-xs text-zinc-500 py-4 text-center">لا توجد طلبات مسجلة لهذا العميل حتى الآن.</p>;
                      }
                      return (
                        <div className="space-y-2.5">
                          {cOrders.map((o) => (
                            <div key={o.id} className="rounded-xl border border-zinc-200 p-3 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-mono font-bold text-zinc-900">#{o.orderNumber}</div>
                                <div className="text-zinc-500 mt-0.5">{formatDateTime(o.createdAt)} · {ORDER_STATUS_META[o.status].label}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#E94F36] tabular-nums">{formatPrice(o.total, storeSettings.currency)}</span>
                                <button
                                  onClick={() => onOpenInvoice(o)}
                                  className="px-2.5 py-1 rounded-lg border border-zinc-200 font-bold text-zinc-700"
                                >
                                  الفاتورة
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OPERATIONS PANELS */}
          {(activeTab === 'offers' ||
            activeTab === 'delivery' ||
            activeTab === 'payments' ||
            activeTab === 'home' ||
            activeTab === 'settings' ||
            activeTab === 'notifications' ||
            activeTab === 'staff') && (
            <AdminOperationsPanels
              tab={activeTab}
              storeSettings={storeSettings}
              paymentSettings={paymentSettings}
              paymentCapabilities={paymentCapabilities}
              banners={banners}
              categories={categories}
              offers={offers}
              deliveryZones={deliveryZones}
              products={products}
              staffInvites={staffInvites}
              auditLogs={auditLogs}
              adminNotifications={adminNotifications}
              isOwner={role === 'owner'}
              onUploadMedia={onUploadMedia}
              onSendNotification={onSendNotification}
              onLogAction={onLogAction}
            />
          )}

          {/* REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-display text-xl font-extrabold text-zinc-900">التقارير المالية والأرباح</h1>
                <div className="no-print flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => exportReportToExcel(periodFilteredOrders, productCosts, storeSettings.currency, periodFilter)}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة / PDF</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">إجمالي المبيعات</p>
                  <p className="font-display text-xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {formatPrice(metrics.totalSales, storeSettings.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">إجمالي التكاليف المدخلة</p>
                  <p className="font-display text-xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {formatPrice(metrics.totalCost, storeSettings.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">صافي الربح التقديري</p>
                  <p className="font-display text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">
                    {formatPrice(metrics.totalProfit, storeSettings.currency)}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">الطلبات المكتملة</p>
                  <p className="font-display text-xl font-extrabold text-zinc-900 mt-1 tabular-nums">
                    {metrics.completedCount}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600">
                    <tr>
                      <th className="p-3 font-bold">رقم الطلب</th>
                      <th className="p-3 font-bold">التاريخ</th>
                      <th className="p-3 font-bold">العميل</th>
                      <th className="p-3 font-bold">الحالة</th>
                      <th className="p-3 font-bold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {periodFilteredOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="p-3 font-mono font-bold">#{o.orderNumber}</td>
                        <td className="p-3 text-zinc-500">{formatDateTime(o.createdAt)}</td>
                        <td className="p-3">{o.customerName}</td>
                        <td className="p-3">{ORDER_STATUS_META[o.status].label}</td>
                        <td className="p-3 tabular-nums font-bold">{formatPrice(o.total, storeSettings.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
