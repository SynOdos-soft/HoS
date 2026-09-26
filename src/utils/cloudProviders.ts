/**
 * Pluggable cloud storage providers.
 *
 * The app's data always lives locally (IndexedDB + localStorage). A provider
 * is an OPTIONAL add-on that layers two capabilities on top:
 *   1. backup  — a restorable copy of all data in the user's cloud
 *   2. sync    — device-to-device merging through that cloud
 *
 * Google Drive is the first provider; AWS S3 / Dropbox / others implement the
 * same tiny surface and register themselves below.
 */

import type { WeeklyLog, Preferences } from '../types';

export interface CloudProviderSnapshot {
  weeks: Record<string, string>;   // weekId -> updatedAt
  deleted: Record<string, string>; // tombstones
  prefsUpdatedAt?: string;
}

export interface CloudProvider {
  /** Stable id used in storage/meta keys. */
  readonly id: string;
  /** Human name for UI. */
  readonly label: string;

  /** Is this provider authorized right now (tokens valid server/client-side)? */
  isConnected(): Promise<boolean>;
  /** Start the provider's authorization flow (redirect or popup). */
  connect(): Promise<void> | void;
  /** Revoke authorization and forget tokens where possible. */
  disconnect(): Promise<void>;

  // -- Snapshot metadata (cheap; used to decide what to transfer) --
  readSnapshot(): Promise<CloudProviderSnapshot | null>;
  writeSnapshot(s: CloudProviderSnapshot): Promise<void>;

  // -- Data transfer --
  readWeek(weekId: string): Promise<WeeklyLog | null>;
  writeWeek(log: WeeklyLog): Promise<void>;
  deleteWeek(weekId: string): Promise<void>;

  readPreferences(): Promise<{ data: Partial<Preferences>; updatedAt: string } | null>;
  writePreferences(p: Preferences): Promise<void>;

  // -- Health (optional display data for the Account hub) --
  getHealth?(): Promise<Record<string, unknown>>;
}

const registry = new Map<string, CloudProvider>();

export const registerProvider = (p: CloudProvider) => {
  registry.set(p.id, p);
};

export const getProvider = (id: string): CloudProvider | undefined => registry.get(id);

export const listProviders = (): CloudProvider[] => Array.from(registry.values());

/** localStorage key holding the id of the user's chosen provider, if any. */
export const ACTIVE_PROVIDER_KEY = 'hos-active-cloud-provider';

export const getActiveProviderId = (): string | null =>
  localStorage.getItem(ACTIVE_PROVIDER_KEY);

export const setActiveProviderId = (id: string | null) => {
  if (id) localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
  else localStorage.removeItem(ACTIVE_PROVIDER_KEY);
};

/** The provider currently in use, if connected. */
export const getActiveProvider = (): CloudProvider | null => {
  const id = getActiveProviderId();
  return id ? registry.get(id) || null : null;
};
