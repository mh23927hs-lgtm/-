import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, setDoc, serverTimestamp } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned as T;
}

export function generateFirestoreId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export async function registerFcmPushToken(userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
    if (!vapidKey || vapidKey.trim().length < 10) {
      return { ok: false, reason: 'missing_vapid_key' };
    }
    const supported = await isSupported();
    if (!supported || typeof Notification === 'undefined') {
      return { ok: false, reason: 'unsupported' };
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    if (!token) {
      return { ok: false, reason: 'no_token' };
    }
    const tokenDocId = `${userId}_web`;
    await setDoc(doc(db, 'fcm_tokens', tokenDocId), {
      userId,
      token,
      platform: 'web',
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    console.warn('FCM registration skipped:', err);
    return { ok: false, reason: 'error' };
  }
}

export const BOOTSTRAPPED_OWNER_EMAIL = 'mh239273@gmail.com';
export const BOOTSTRAPPED_OWNER_EMAILS = ['mh239273@gmail.com', 'mh23927hs@gmail.com'];
