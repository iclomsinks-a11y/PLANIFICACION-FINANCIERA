import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-iberfinancearchi-49a1181a-14cc-4240-8038-e43a57e424e1';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);

const baseGoogleProvider = new GoogleAuthProvider();
baseGoogleProvider.setCustomParameters({ prompt: 'select_account' });

const gmailGoogleProvider = new GoogleAuthProvider();
gmailGoogleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
gmailGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Token de acceso de Workspace en memoria únicamente (nunca en localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;
let isSigningIn = false;

export type FirestoreOperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: FirestoreOperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: FirestoreOperationType,
  path: string | null
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
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error(
        'No se pudo establecer conexión con Firestore (cliente sin conexión o configuración incorrecta).'
      );
      return false;
    }
    // Un error permission-denied sobre /test/connection confirma alcance real al backend
    return true;
  }
}

export function subscribeAuth(callback: (user: User | null, gmailToken: string | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedGmailAccessToken = null;
      callback(null, null);
      return;
    }
    if (!isSigningIn && !cachedGmailAccessToken) {
      callback(user, null);
      return;
    }
    callback(user, cachedGmailAccessToken);
  });
}

export async function googleSignIn(
  includeGmail = false
): Promise<{ user: User; accessToken: string | null }> {
  const provider = includeGmail ? gmailGoogleProvider : baseGoogleProvider;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (includeGmail && credential?.accessToken) {
      cachedGmailAccessToken = credential.accessToken;
    }
    return {
      user: result.user,
      accessToken: includeGmail ? cachedGmailAccessToken : null,
    };
  } finally {
    isSigningIn = false;
  }
}

export function clearCachedGmailToken(): void {
  cachedGmailAccessToken = null;
}

export function formatGoogleAuthError(
  err: unknown,
  requestedGmail = false
): { isCancelled: boolean; message: string } {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';

  if (
    code === 'auth/user-cancelled' ||
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request'
  ) {
    return {
      isCancelled: true,
      message: requestedGmail
        ? 'No se concedió el permiso de lectura de Gmail o se cerró la ventana antes de finalizar. Vuelve a intentarlo y marca la casilla de permiso de Gmail si deseas rastrear facturas.'
        : 'Se canceló el inicio de sesión con Google antes de completarse. Puedes volver a intentarlo cuando quieras.',
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      isCancelled: false,
      message:
        'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.',
    };
  }

  if (code === 'auth/unauthorized-domain') {
    return {
      isCancelled: false,
      message: 'Este dominio no está autorizado en la configuración de Firebase Auth.',
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err ?? '');
  return {
    isCancelled: false,
    message: rawMsg || 'No se pudo completar el inicio de sesión con Google.',
  };
}

export async function emailSignIn(email: string, password: string): Promise<User> {
  const res = await signInWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export async function emailRegister(email: string, password: string): Promise<User> {
  const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return res.user;
}

export function formatEmailAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code ?? '')
      : '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Correo o contraseña incorrectos.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Ese correo ya está registrado. Cambia a Iniciar sesión.';
  }
  if (code === 'auth/weak-password') {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (code === 'auth/invalid-email') {
    return 'Introduce un correo electrónico válido.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'El acceso con correo/contraseña no está habilitado en este proyecto; utiliza Google o entra directamente al espacio de trabajo.';
  }
  return err instanceof Error ? err.message : 'No se pudo completar la autenticación.';
}

export function getCachedGmailToken(): string | null {
  return cachedGmailAccessToken;
}

export async function firebaseLogout(): Promise<void> {
  cachedGmailAccessToken = null;
  await signOut(auth);
}
