// ─────────────────────────────────────────────
// MTG Draft Forge — Firebase / Firestore
// Real-time room sync across iOS + Android
// ─────────────────────────────────────────────

import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  signInAnonymously as firebaseSignInAnonymously,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DraftRoom } from '../utils/types';

const firebaseConfig = {
  apiKey:            "AIzaSyCo-IgsBOxJUaPe36uTb4Vpe4bt7utb8f0",
  authDomain:        "mtgdraftforge.firebaseapp.com",
  projectId:         "mtgdraftforge",
  storageBucket:     "mtgdraftforge.firebasestorage.app",
  messagingSenderId: "911755121842",
  appId:             "1:911755121842:web:6d53b455f566da274aa5ab",
  measurementId:     "G-H58LLHCWJF",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ignoreUndefinedProperties: Firestore rejects docs with undefined values by default.
// Our room objects have optional fields (e.g. bracket match result, seating) that are
// undefined until set — this tells Firestore to silently drop those fields instead.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

// Use AsyncStorage persistence so the anonymous auth session survives app restarts.
// initializeAuth can only be called once per Firebase app instance. On Metro
// hot-reload the app object persists, so we fall back to getAuth() if auth
// was already initialized (avoids "auth/already-initialized" error).
let _auth: ReturnType<typeof getAuth>;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}
export const auth = _auth;

/**
 * Sign the device in anonymously with Firebase Auth.
 * Returns the Firebase User (uid is stable across app restarts on the same device).
 * Must be called once on app startup before any Firestore reads/writes.
 */
export async function signInAnonymously(): Promise<User> {
  // If already signed in (e.g. app restart), just return the current user.
  if (auth.currentUser) return auth.currentUser;
  const { user } = await firebaseSignInAnonymously(auth);
  return user;
}

/**
 * Subscribe to auth state. Resolves once we know the auth status.
 */
export function onAuthReady(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

const ROOMS_COLLECTION = 'rooms';
const CRASHES_COLLECTION = 'crashReports';

/**
 * Log a JS crash or unhandled error to Firestore.
 * Documents land in crashReports/{auto-id} and are viewable in the
 * Firebase console under Firestore → crashReports.
 *
 * Fields written:
 *   message      – error.message
 *   stack        – error.stack (truncated to 3000 chars)
 *   context      – caller-supplied label, e.g. 'ErrorBoundary' or 'UnhandledPromise'
 *   uid          – Firebase anonymous UID (links crashes to a device session)
 *   appVersion   – from package.json (injected at build time via __DEV__)
 *   platform     – 'ios' | 'android'
 *   _createdAt   – Firestore server timestamp
 */
export async function logCrashToFirestore(
  error: unknown,
  context = 'unknown',
): Promise<void> {
  // Never throw from a crash logger
  try {
    const { Platform } = require('react-native');
    const err = error instanceof Error ? error : new Error(String(error));
    await addDoc(collection(db, CRASHES_COLLECTION), {
      message: err.message.slice(0, 500),
      stack: (err.stack ?? '').slice(0, 3000),
      context,
      uid: auth.currentUser?.uid ?? null,
      platform: Platform.OS,
      isDev: __DEV__,
      _createdAt: serverTimestamp(),
    });
  } catch {
    // Silently swallow — logging must never cause another crash
  }
}

/**
 * Delete a room document from Firestore.
 * Called when the host deletes a room so all other devices get notified
 * via their onSnapshot listener (snap.exists() === false → onDeleted callback).
 */
export async function deleteRoomFromFirestore(roomId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, ROOMS_COLLECTION, roomId));
  } catch (err) {
    console.warn('[Firebase] deleteRoomFromFirestore error:', err);
  }
}

/**
 * Write a room to Firestore (create or overwrite).
 * Called after any local state change that affects a room.
 *
 * Uses updateDoc so concurrent writes from different players don't clobber
 * each other's data. rrResults is expanded to dot-notation field paths so
 * each player only writes their own match key. Falls back to setDoc when the
 * document doesn't exist yet (first write).
 */
export async function syncRoomToFirestore(room: DraftRoom): Promise<void> {
  try {
    const docRef = doc(db, ROOMS_COLLECTION, room.id);
    const { rrResults, ...rest } = room;

    // Build update object. rrResults is expanded to dot-notation paths so
    // concurrent writes from different players don't overwrite each other's
    // results — each player only writes their own match key.
    const update: Record<string, unknown> = {
      ...rest,
      _updatedAt: serverTimestamp(),
    };
    if (rrResults) {
      Object.entries(rrResults).forEach(([key, value]) => {
        update[`rrResults.${key}`] = value;
      });
    }

    try {
      await updateDoc(docRef, update);
    } catch (err: any) {
      if (err?.code === 'not-found') {
        // First write — document doesn't exist yet
        await setDoc(docRef, { ...room, _updatedAt: serverTimestamp() });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.warn('[Firebase] syncRoomToFirestore error:', err);
  }
}

/**
 * Patch specific fields in a room document without overwriting others.
 * Use dot-notation keys (e.g. 'rrResults.key') for nested field updates.
 */
export async function patchRoomInFirestore(
  roomId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    await updateDoc(doc(db, ROOMS_COLLECTION, roomId), {
      ...patch,
      _updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('[Firebase] patchRoomInFirestore error:', err);
  }
}

/**
 * Subscribe to live Firestore updates for a room.
 * Returns an unsubscribe function — call it on cleanup.
 *
 * onUpdate   – called when the room doc exists and has changed
 * onDeleted  – called when the room doc is deleted from Firestore
 *              (e.g. the host deleted it from another device)
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (room: DraftRoom) => void,
  onDeleted?: () => void,
): () => void {
  // Track whether we've ever seen this document exist in Firestore.
  // A newly-created room is written with a 500ms debounce, so the first
  // snapshot often fires before the write completes (snap.exists() === false).
  // Only call onDeleted if the doc existed previously — otherwise we'd
  // incorrectly delete the room before it's been synced.
  let seenExisting = false;
  return onSnapshot(
    doc(db, ROOMS_COLLECTION, roomId),
    (snap) => {
      if (snap.exists()) {
        seenExisting = true;
        onUpdate(snap.data() as DraftRoom);
      } else if (seenExisting) {
        onDeleted?.();
      }
    },
    (err) => console.warn('[Firebase] subscribeToRoom error:', err),
  );
}

/**
 * Look up a room by its 6-character invite code.
 * Used by the join flow on devices that don't have the room locally.
 */
export async function findRoomByCode(inviteCode: string): Promise<DraftRoom | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, ROOMS_COLLECTION),
        where('inviteCode', '==', inviteCode.toUpperCase().trim()),
      ),
    );
    return snap.empty ? null : (snap.docs[0].data() as DraftRoom);
  } catch (err) {
    console.warn('[Firebase] findRoomByCode error:', err);
    return null;
  }
}
