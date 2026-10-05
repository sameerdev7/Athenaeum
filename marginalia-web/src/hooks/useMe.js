import { useEffect, useSyncExternalStore } from "react";
import { getMe } from "../api/users";

/**
 * The logged-in user, shared app-wide. `/me` is the only endpoint that
 * returns the email (UserPrivate), so it doubles as the session check after
 * a page refresh.
 *
 * One module-level copy rather than per-component state: the navbar stays
 * mounted while the profile page edits the user, so a per-component copy
 * left the navbar avatar stale until a full reload. Anything that changes
 * the user calls `setMe`; sign-in/out call `loadMe`/`clearMe`.
 */
let current = null;
let ready = false;
let inflight = null;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function setMe(user) {
  current = user;
  ready = true;
  emit();
}

export function clearMe() {
  current = null;
  ready = true;
  inflight = null;
  emit();
}

export function loadMe() {
  if (!localStorage.getItem("token")) {
    clearMe();
    return Promise.resolve();
  }
  inflight = getMe()
    .then((user) => setMe(user))
    .catch(() => setMe(null));
  return inflight;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMe() {
  const me = useSyncExternalStore(subscribe, () => current);
  const isReady = useSyncExternalStore(subscribe, () => ready);

  useEffect(() => {
    if (!ready && !inflight) loadMe();
  }, []);

  return { me, ready: isReady };
}
