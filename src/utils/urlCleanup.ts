/**
 * Address-bar hygiene.
 *
 * Supabase's auth-js runs `detectSessionInUrl` on every boot to pick the OAuth
 * tokens out of the redirect fragment, and its cleanup step is literally
 * `window.location.hash = ''`. In Chromium that does NOT remove the fragment —
 * it sets an empty fragment, so a driver who signed in with Google lands on
 *
 *     https://hos.synodos.app/#
 *
 * with a bare "#" that then sits in the address bar, in screenshots, in bug
 * reports and in anything the driver copies out of the app. The tokens are gone
 * (that part works); only the stray character is left behind.
 *
 * Assigning `hash` is the wrong tool. `history.replaceState` rewrites the URL
 * without the fragment and, unlike assigning `location.hash`, does not push a
 * history entry or fire hashchange — so the driver cannot Back into the token-
 * bearing URL and nothing re-renders.
 */

/** True when the URL ends in an empty fragment (a bare trailing "#"). */
export const hasBareHash = (href: string): boolean => {
  const at = href.indexOf('#');
  return at !== -1 && at === href.length - 1;
};

/**
 * Remove a leftover empty fragment from the address bar.
 *
 * Only acts on a URL whose fragment is already empty, so a real fragment (the
 * legacy `#/officer/<token>` handoff links, still supported) is never touched.
 * Safe to call more than once.
 *
 * @returns true when the URL was rewritten.
 */
export const stripBareHash = (): boolean => {
  if (typeof window === 'undefined') return false;
  const { href, pathname, search } = window.location;
  if (!hasBareHash(href)) return false;
  window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  return true;
};

/**
 * Run `stripBareHash` now and keep watching briefly.
 *
 * supabase-js clears the fragment asynchronously, when its session
 * initialization settles, so a single call at module load races it. The
 * authoritative cleanup lives in `AuthProvider` (on the auth event that fires
 * once auth-js has processed the URL); these passes only cover the case where
 * that event never arrives, e.g. an offline boot.
 */
export const scheduleBareHashCleanup = (): void => {
  stripBareHash();
  if (typeof window === 'undefined') return;
  window.setTimeout(stripBareHash, 0);
  window.setTimeout(stripBareHash, 250);
  window.setTimeout(stripBareHash, 1000);
};