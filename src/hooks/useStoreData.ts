import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_OWNER_EMAILS,
  db,
  generateFirestoreId,
  googleProvider,
  handleFirestoreError,
  OperationType,
  stripUndefined,
} from '../firebase';
import type {
  Address,
  AppNotification,
  AuditLog,
  Banner,
  Category,
  DeliveryZone,
  Offer,
  Order,
  OrderRating,
  PaymentCapabilities,
  PaymentSettings,
  Product,
  ProductCost,
  StaffInvite,
  StaffPermissions,
  StaffRole,
  StoreSettings,
  UserProfile,
} from '../types';
import { DEFAULT_STAFF_PERMISSIONS, DEFAULT_STORE_SETTINGS, timestampToMillis } from '../utils/storeHelpers';

export interface StaffAccess {
  isStaff: boolean;
  role: StaffRole | null;
  permissions: StaffPermissions;
}

const EMPTY_PERMS: StaffPermissions = {
  manageProducts: false,
  manageCategories: false,
  manageOrders: false,
  manageCustomers: false,
  manageOffers: false,
  manageDelivery: false,
  managePayments: false,
  manageSettings: false,
  manageHome: false,
  manageNotifications: false,
  manageStaff: false,
  viewReports: false,
};

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  codDeliveryEnabled: true,
  codPickupEnabled: true,
  onlinePaymentEnabled: false,
  onlineProvider: 'none',
};

export function useStoreData() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [paymentCapabilities, setPaymentCapabilities] = useState<PaymentCapabilities>({
    providers: { stripe: false, moyasar: false, tap: false },
    anyConfigured: false,
  });

  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [ratings, setRatings] = useState<OrderRating[]>([]);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [userNotifications, setUserNotifications] = useState<AppNotification[]>([]);
  const [broadcastNotifications, setBroadcastNotifications] = useState<AppNotification[]>([]);

  const [staffInviteDoc, setStaffInviteDoc] = useState<StaffInvite | null>(null);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminCustomers, setAdminCustomers] = useState<UserProfile[]>([]);
  const [productCosts, setProductCosts] = useState<Record<string, ProductCost>>({});
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AppNotification[]>([]);

  // Check server payment gateway capabilities
  const refreshPaymentCapabilities = useCallback(async () => {
    try {
      const res = await fetch('/api/payments/capabilities');
      if (res.ok) {
        const data = (await res.json()) as PaymentCapabilities;
        setPaymentCapabilities(data);
      }
    } catch (err) {
      console.warn('Could not check payment capabilities:', err);
    }
  }, []);

  useEffect(() => {
    refreshPaymentCapabilities();
  }, [refreshPaymentCapabilities]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user && user.emailVerified) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(
              userRef,
              stripUndefined({
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'عميل زاد مهاوي',
                phone: '',
                email: user.email || '',
                favoriteProductIds: [],
                ordersCount: 0,
                totalSpent: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          }
        } catch (err) {
          console.error('Error initializing user profile:', err);
        }
      } else {
        setUserProfile(null);
        setAddresses([]);
        setMyOrders([]);
        setUserNotifications([]);
        setStaffInviteDoc(null);
      }
    });
    return () => unsub();
  }, []);

  // Public Storefront Subscriptions
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'store'),
        (snap) => {
          if (snap.exists()) {
            const rawData = snap.data() as Partial<StoreSettings>;
            const normalizedCurrency =
              rawData.currency && rawData.currency !== 'ر.س' ? rawData.currency : 'د.أ';
            setStoreSettings({
              ...DEFAULT_STORE_SETTINGS,
              ...rawData,
              currency: normalizedCurrency,
            });
          } else {
            setStoreSettings(DEFAULT_STORE_SETTINGS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'settings/store'),
      ),
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'payments'),
        (snap) => {
          if (snap.exists()) {
            setPaymentSettings({ ...DEFAULT_PAYMENT_SETTINGS, ...(snap.data() as Partial<PaymentSettings>) });
          } else {
            setPaymentSettings(DEFAULT_PAYMENT_SETTINGS);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'settings/payments'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'banners'), orderBy('sortOrder', 'asc')),
        (snap) => {
          setBanners(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Banner, 'id'>) })));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'banners'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'categories'), orderBy('sortOrder', 'asc')),
        (snap) => {
          setCategories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) })));
          setCategoriesLoaded(true);
        },
        (err) => {
          setCategoriesLoaded(true);
          handleFirestoreError(err, OperationType.LIST, 'categories');
        },
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'products'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setProducts(list);
          setCatalogLoading(false);
        },
        (err) => {
          setCatalogLoading(false);
          handleFirestoreError(err, OperationType.LIST, 'products');
        },
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'offers'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Offer, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setOffers(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'offers'),
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'delivery_zones'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeliveryZone, 'id'>) }));
          list.sort((a, b) => a.area.localeCompare(b.area, 'ar'));
          setDeliveryZones(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'delivery_zones'),
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'ratings'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderRating, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setRatings(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'ratings'),
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, []);

  // Signed-in User Subscriptions
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified) return;
    const unsubs: Array<() => void> = [];
    const uid = currentUser.uid;
    const emailLower = (currentUser.email || '').toLowerCase();

    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`),
      ),
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'addresses'),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Address, 'id'>) }));
          setAddresses(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/addresses`),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'orders'), where('customerId', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setMyOrders(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'orders'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(
          collection(db, 'notifications'),
          where('targetType', '==', 'user'),
          where('targetUserId', '==', uid),
        ),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setUserNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications(user)'),
      ),
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('targetType', '==', 'broadcast')),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setBroadcastNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications(broadcast)'),
      ),
    );

    if (emailLower) {
      unsubs.push(
        onSnapshot(
          doc(db, 'staff_invites', emailLower),
          (snap) => {
            if (snap.exists()) {
              setStaffInviteDoc({ id: snap.id, ...(snap.data() as Omit<StaffInvite, 'id'>) });
            } else {
              setStaffInviteDoc(null);
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, `staff_invites/${emailLower}`),
        ),
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, currentUser]);

  // Compute RBAC staffAccess
  const staffAccess: StaffAccess = useMemo(() => {
    if (!currentUser || !currentUser.emailVerified) {
      return { isStaff: false, role: null, permissions: EMPTY_PERMS };
    }
    const emailLower = (currentUser.email || '').toLowerCase();
    if (BOOTSTRAPPED_OWNER_EMAILS.includes(emailLower)) {
      return {
        isStaff: true,
        role: 'owner',
        permissions: DEFAULT_STAFF_PERMISSIONS.owner,
      };
    }
    if (staffInviteDoc && staffInviteDoc.isActive) {
      if (staffInviteDoc.role === 'owner') {
        return { isStaff: true, role: 'owner', permissions: DEFAULT_STAFF_PERMISSIONS.owner };
      }
      return {
        isStaff: true,
        role: staffInviteDoc.role,
        permissions: { ...EMPTY_PERMS, ...(staffInviteDoc.permissions || {}) },
      };
    }
    return { isStaff: false, role: null, permissions: EMPTY_PERMS };
  }, [currentUser, staffInviteDoc]);

  // One-time migration if settings/store still had legacy 'ر.س' in Firestore
  useEffect(() => {
    if (!authReady || !currentUser || !staffAccess.permissions.manageSettings) return;
    getDoc(doc(db, 'settings', 'store'))
      .then((snap) => {
        if (snap.exists() && snap.data().currency === 'ر.س') {
          return updateDoc(doc(db, 'settings', 'store'), {
            currency: 'د.أ',
            updatedAt: serverTimestamp(),
          });
        }
        return undefined;
      })
      .catch(() => {});
  }, [authReady, currentUser, staffAccess.permissions.manageSettings]);

  // One-time bootstrap of the two core restaurant categories when categories collection is empty
  useEffect(() => {
    if (
      !authReady ||
      !currentUser ||
      !currentUser.emailVerified ||
      !staffAccess.permissions.manageCategories ||
      !categoriesLoaded ||
      categories.length > 0
    ) {
      return;
    }
    const seedKey = 'zad_mahawi_cats_bootstrapped_v1';
    try {
      if (localStorage.getItem(seedKey)) return;
    } catch {
      // Ignore storage access restrictions
    }

    const coreCategories = [
      {
        id: 'cat_pastries',
        name: 'قسم المعجنات',
        description: 'معجنات وفطائر مخبوزة طازجة يومياً من الفرن',
        sortOrder: 1,
      },
      {
        id: 'cat_sandwiches',
        name: 'قسم السندويشات',
        description: 'سندويشات محضّرة يومياً بمكونات طازجة ونكهات أردنية شهية',
        sortOrder: 2,
      },
    ];

    Promise.all(
      coreCategories.map((cat) =>
        setDoc(doc(db, 'categories', cat.id), {
          name: cat.name,
          description: cat.description,
          sortOrder: cat.sortOrder,
          isActive: true,
          isHidden: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ),
    )
      .then(() => {
        try {
          localStorage.setItem(seedKey, '1');
        } catch {
          // Ignore storage access restrictions
        }
      })
      .catch((err) => {
        console.warn('Could not bootstrap default categories:', err);
      });
  }, [
    authReady,
    currentUser,
    staffAccess.permissions.manageCategories,
    categoriesLoaded,
    categories.length,
  ]);

  // Staff-only Admin Subscriptions
  useEffect(() => {
    if (!authReady || !currentUser || !currentUser.emailVerified || !staffAccess.isStaff) {
      setAdminOrders([]);
      setAdminCustomers([]);
      setProductCosts({});
      setStaffInvites([]);
      setAuditLogs([]);
      setAdminNotifications([]);
      return;
    }

    const unsubs: Array<() => void> = [];
    const { permissions, role } = staffAccess;

    if (permissions.manageOrders || permissions.viewReports) {
      unsubs.push(
        onSnapshot(
          collection(db, 'orders'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }));
            list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
            setAdminOrders(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admin/orders'),
        ),
      );
    }

    if (permissions.manageCustomers || permissions.viewReports) {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const list = snap.docs.map((d) => d.data() as UserProfile);
            list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
            setAdminCustomers(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admin/users'),
        ),
      );
    }

    if (permissions.manageProducts || permissions.viewReports) {
      unsubs.push(
        onSnapshot(
          collection(db, 'product_costs'),
          (snap) => {
            const map: Record<string, ProductCost> = {};
            snap.docs.forEach((d) => {
              map[d.id] = { id: d.id, ...(d.data() as Omit<ProductCost, 'id'>) };
            });
            setProductCosts(map);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admin/product_costs'),
        ),
      );
    }

    if (role === 'owner' || permissions.manageStaff) {
      unsubs.push(
        onSnapshot(
          collection(db, 'staff_invites'),
          (snap) => {
            setStaffInvites(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StaffInvite, 'id'>) })));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admin/staff_invites'),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'audit_logs'),
          (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }));
            list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
            setAuditLogs(list.slice(0, 120));
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admin/audit_logs'),
        ),
      );
    }

    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('targetType', '==', 'admin')),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
          list.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
          setAdminNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'admin/notifications'),
      ),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, currentUser, staffAccess]);

  const signInWithGoogle = useCallback(async () => {
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const logAdminAction = useCallback(
    async (action: string, targetCollection: string, targetId: string, summary: string) => {
      if (!currentUser || !staffAccess.isStaff) return;
      try {
        const logId = generateFirestoreId('log');
        await setDoc(doc(db, 'audit_logs', logId), {
          actorUid: currentUser.uid,
          actorEmail: currentUser.email || '',
          actorRole: staffAccess.role || 'staff',
          action: action.slice(0, 80),
          targetCollection: targetCollection.slice(0, 80),
          targetId: targetId.slice(0, 128),
          summary: summary.slice(0, 300),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Audit log write failed:', err);
      }
    },
    [currentUser, staffAccess],
  );

  const combinedUserNotifications = useMemo(() => {
    const merged = [...userNotifications, ...broadcastNotifications];
    merged.sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
    return merged;
  }, [userNotifications, broadcastNotifications]);

  const sendSystemNotification = useCallback(
    async (payload: {
      targetType: 'user' | 'admin' | 'broadcast';
      targetUserId?: string;
      title: string;
      body: string;
      orderId?: string;
    }) => {
      const notifId = generateFirestoreId('notif');
      await setDoc(
        doc(db, 'notifications', notifId),
        stripUndefined({
          targetType: payload.targetType,
          targetUserId: payload.targetUserId,
          title: payload.title.slice(0, 140),
          body: payload.body.slice(0, 500),
          orderId: payload.orderId,
          isRead: false,
          createdAt: serverTimestamp(),
        }),
      );
    },
    [],
  );

  const uploadMediaImage = useCallback(
    async (dataUrl: string, mimeType: string): Promise<string> => {
      if (!currentUser) throw new Error('يجب تسجيل الدخول لرفع الصور');
      const mediaId = generateFirestoreId('media');
      await setDoc(doc(db, 'media', mediaId), {
        dataUrl,
        mimeType,
        uploadedBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      return `media://${mediaId}`;
    },
    [currentUser],
  );

  const submitOrderRating = useCallback(
    async (
      order: Order,
      payload: { restaurantRating: number; driverRating?: number | null; comment: string },
    ) => {
      if (!currentUser || !currentUser.emailVerified) {
        throw new Error('يجب تسجيل الدخول بحساب موثق لإرسال التقييم');
      }
      const ratingRef = doc(db, 'ratings', order.id);
      const existing = ratings.find((r) => r.orderId === order.id || r.id === order.id);
      const driverVal =
        order.fulfillmentType === 'delivery' && typeof payload.driverRating === 'number'
          ? payload.driverRating
          : null;
      const cleanComment = payload.comment.trim().slice(0, 500);

      if (existing) {
        await updateDoc(ratingRef, {
          restaurantRating: payload.restaurantRating,
          driverRating: driverVal,
          comment: cleanComment,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          ratingRef,
          stripUndefined({
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: currentUser.uid,
            customerName: userProfile?.name || currentUser.displayName || order.customerName || 'عميل زاد مهاوي',
            fulfillmentType: order.fulfillmentType,
            restaurantRating: payload.restaurantRating,
            driverRating: driverVal,
            comment: cleanComment,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
      }
    },
    [currentUser, ratings, userProfile],
  );

  // Keep unused import clean
  void addDoc;

  return {
    authReady,
    currentUser,
    catalogLoading,
    storeSettings,
    paymentSettings,
    paymentCapabilities,
    refreshPaymentCapabilities,
    banners,
    categories,
    products,
    offers,
    deliveryZones,
    ratings,
    userProfile,
    addresses,
    myOrders,
    notifications: combinedUserNotifications,
    staffAccess,
    adminOrders,
    adminCustomers,
    productCosts,
    staffInvites,
    auditLogs,
    adminNotifications,
    signInWithGoogle,
    logout,
    logAdminAction,
    sendSystemNotification,
    uploadMediaImage,
    submitOrderRating,
  };
}
