export type DayKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

export interface DaySchedule {
  open: string;
  close: string;
  closed: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface StoreSettings {
  nameAr: string;
  nameEn: string;
  description: string;
  logoUrl: string;
  heroImageUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  phone: string;
  whatsapp: string;
  address: string;
  currency: string;
  minOrderAmount: number;
  defaultDeliveryFee: number;
  isAcceptingOrders: boolean;
  allowScheduledOrders: boolean;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  dineInEnabled?: boolean;
  announcementEnabled: boolean;
  announcementText: string;
  workingHours: Record<DayKey, DaySchedule>;
  holidays: string[];
  homeSectionsOrder: string[];
  faqItems: FaqItem[];
  privacyPolicy: string;
  termsOfUse: string;
  refundPolicy: string;
  updatedAt?: unknown;
}

export type OnlineProvider = 'none' | 'stripe' | 'moyasar' | 'tap';

export interface PaymentSettings {
  codDeliveryEnabled: boolean;
  codPickupEnabled: boolean;
  onlinePaymentEnabled: boolean;
  onlineProvider: OnlineProvider;
  updatedAt?: unknown;
}

export interface PaymentCapabilities {
  providers: {
    stripe: boolean;
    moyasar: boolean;
    tap: boolean;
  };
  anyConfigured: boolean;
}

export interface Banner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  linkType: 'none' | 'category' | 'product' | 'offer';
  linkTarget?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  isHidden: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductOptionChoice {
  id: string;
  name: string;
  extraPrice: number;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  choices: ProductOptionChoice[];
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  discountPrice?: number | null;
  categoryId: string;
  imageUrl?: string;
  isAvailable: boolean;
  isHidden: boolean;
  stockQuantity?: number | null;
  prepTimeMinutes?: number | null;
  calories?: number | null;
  allergens?: string;
  showOnHome: boolean;
  isFeatured: boolean;
  salesCount: number;
  optionGroups: ProductOptionGroup[];
  addons: ProductAddon[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductCost {
  id: string;
  costPrice: number;
  updatedAt?: unknown;
}

export interface Offer {
  id: string;
  title: string;
  description?: string;
  type: 'discount' | 'coupon';
  code?: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderAmount?: number | null;
  startDate?: string;
  endDate?: string;
  productIds?: string[];
  isActive: boolean;
  usageCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DeliveryZone {
  id: string;
  governorate: string;
  city: string;
  area: string;
  fee: number;
  minOrderAmount: number;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  name: string;
  phone?: string;
  email?: string;
  favoriteProductIds: string[];
  ordersCount: number;
  totalSpent: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Address {
  id: string;
  label: string;
  governorate: string;
  city: string;
  area: string;
  street: string;
  details?: string;
  lat?: number | null;
  lng?: number | null;
  isDefault: boolean;
  createdAt?: unknown;
}

export type OrderStatus =
  | 'new'
  | 'received'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'cod_delivery' | 'cod_pickup' | 'online';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderSelectedOption {
  groupName: string;
  choiceName: string;
  extraPrice: number;
}

export interface OrderSelectedAddon {
  name: string;
  price: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  optionsTotal: number;
  addonsTotal: number;
  lineTotal: number;
  selectedOptions: OrderSelectedOption[];
  selectedAddons: OrderSelectedAddon[];
  note?: string;
}

export interface OrderDeliveryAddress {
  governorate: string;
  city: string;
  area: string;
  street: string;
  details?: string;
  zoneId?: string;
  lat?: number | null;
  lng?: number | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillmentType: 'delivery' | 'pickup' | 'dine_in';
  deliveryAddress?: OrderDeliveryAddress | null;
  tableNumber?: string;
  pickupTime?: string;
  scheduledFor?: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProvider?: string;
  paymentReference?: string;
  status: OrderStatus;
  notes?: string;
  rejectionReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  id: string;
  targetType: 'user' | 'admin' | 'broadcast';
  targetUserId?: string;
  title: string;
  body: string;
  orderId?: string;
  isRead: boolean;
  createdAt?: unknown;
}

export type StaffRole = 'owner' | 'manager' | 'employee';

export interface StaffPermissions {
  manageProducts: boolean;
  manageCategories: boolean;
  manageOrders: boolean;
  manageCustomers: boolean;
  manageOffers: boolean;
  manageDelivery: boolean;
  managePayments: boolean;
  manageSettings: boolean;
  manageHome: boolean;
  manageNotifications: boolean;
  manageStaff: boolean;
  viewReports: boolean;
}

export interface StaffInvite {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  permissions: StaffPermissions;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId?: string;
  summary: string;
  createdAt?: unknown;
}

export interface OrderRating {
  id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  fulfillmentType: 'delivery' | 'pickup' | 'dine_in';
  restaurantRating: number;
  driverRating?: number | null;
  comment?: string;
  staffReply?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CartItem {
  cartKey: string;
  productId: string;
  productName: string;
  imageUrl?: string;
  baseUnitPrice: number;
  quantity: number;
  selectedOptionChoices: Array<{ groupId: string; groupName: string; choiceId: string; choiceName: string; extraPrice: number }>;
  selectedAddons: Array<{ id: string; name: string; price: number }>;
  note: string;
}

export type CustomerTab = 'home' | 'categories' | 'favorites' | 'orders' | 'account';
export type AdminTab =
  | 'overview'
  | 'kitchen'
  | 'orders'
  | 'ratings'
  | 'products'
  | 'categories'
  | 'customers'
  | 'offers'
  | 'delivery'
  | 'payments'
  | 'home'
  | 'settings'
  | 'notifications'
  | 'staff'
  | 'reports';
