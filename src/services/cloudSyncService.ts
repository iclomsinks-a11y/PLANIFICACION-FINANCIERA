import { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import { SavedSupuesto, SupuestosWorkspaceStore } from '../types/economy';

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefinedDeep(val);
      }
    }
    return cleaned as T;
  }
  return value;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export async function loadUserCloudWorkspace(uid: string): Promise<{
  store: SupuestosWorkspaceStore | null;
  dismissedGmailIds: string[];
}> {
  const userPath = `users/${uid}`;
  const supuestosPath = `users/${uid}/supuestos`;

  let userData: Record<string, unknown> | undefined;
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined;
  } catch (error) {
    handleFirestoreError(error, 'get', userPath);
  }

  let supuestos: SavedSupuesto[] = [];
  try {
    const listSnap = await getDocs(collection(db, 'users', uid, 'supuestos'));
    supuestos = listSnap.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          id: String(raw.id ?? d.id),
          numero: Number(raw.numero ?? 1),
          nombre: String(raw.nombre ?? 'Supuesto 1'),
          updatedAt: timestampToIso(raw.updatedAt),
          state: raw.state as SavedSupuesto['state'],
        };
      })
      .sort((a, b) => a.numero - b.numero);
  } catch (error) {
    handleFirestoreError(error, 'list', supuestosPath);
  }

  const dismissedGmailIds = Array.isArray(userData?.dismissedGmailIds)
    ? (userData?.dismissedGmailIds as string[])
    : [];

  if (supuestos.length === 0) {
    return { store: null, dismissedGmailIds };
  }

  const activeSupuestoId =
    typeof userData?.activeSupuestoId === 'string' &&
    supuestos.some((s) => s.id === userData?.activeSupuestoId)
      ? userData.activeSupuestoId
      : supuestos[0].id;

  const maxNum = Math.max(...supuestos.map((s) => s.numero), 1);
  const nextSupuestoNumber =
    typeof userData?.nextSupuestoNumber === 'number'
      ? Math.max(userData.nextSupuestoNumber, maxNum + 1)
      : maxNum + 1;

  return {
    store: {
      activeSupuestoId,
      nextSupuestoNumber,
      supuestos,
    },
    dismissedGmailIds,
  };
}

export async function saveUserWorkspaceMeta(
  user: User,
  activeSupuestoId: string,
  nextSupuestoNumber: number,
  dismissedGmailIds: string[]
): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const payload = stripUndefinedDeep({
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      activeSupuestoId,
      nextSupuestoNumber: Math.max(1, Math.floor(nextSupuestoNumber)),
      dismissedGmailIds: dismissedGmailIds.slice(-500),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, 'write', path);
  }
}

export async function saveSupuestoToCloud(uid: string, supuesto: SavedSupuesto): Promise<void> {
  const safeId = supuesto.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `users/${uid}/supuestos/${safeId}`;
  try {
    const payload = stripUndefinedDeep({
      id: safeId,
      ownerUid: uid,
      numero: Math.max(1, Math.floor(supuesto.numero)),
      nombre: (supuesto.nombre || `Supuesto ${supuesto.numero}`).slice(0, 120),
      updatedAt: serverTimestamp(),
      state: supuesto.state,
    });
    await setDoc(doc(db, 'users', uid, 'supuestos', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, 'write', path);
  }
}

export async function deleteSupuestoFromCloud(uid: string, supuestoId: string): Promise<void> {
  const safeId = supuestoId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `users/${uid}/supuestos/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'supuestos', safeId));
  } catch (error) {
    handleFirestoreError(error, 'delete', path);
  }
}
