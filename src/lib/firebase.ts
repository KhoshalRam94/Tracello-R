import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Explicitly set persistence to avoid silent restoration issues in some environments
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn('Persistence setting failed:', err);
});

async function testConnection() {
  try {
    // Attempt to read a dummy doc to verify connection
    await getDocFromServer(doc(db, '_internal', 'connection_test'));
    console.log('Firebase connection verified');
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
    // Expected error if collection doesn't exist, but it confirms reachability
    console.log('Firebase reachable');
  }
}

testConnection();

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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const errorString = JSON.stringify(errInfo);
  console.error('Firestore Error: ', errorString);
  throw new Error(errorString);
}

export async function syncToGoogleSheet(data: any) {
  try {
    const settingsSnap = await getDocFromServer(doc(db, 'settings', 'config'));
    const webhookUrl = settingsSnap.exists() ? settingsSnap.data().sheetWebhookUrl : null;
    
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      console.log('Synced to Google Sheets');
    }
  } catch (err) {
    console.error('Sheet Sync Error:', err);
  }
}
