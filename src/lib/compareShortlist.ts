import { useSyncExternalStore } from "react";
import { MAX_COMPARE_RECIPIENTS } from "@/lib/quoteRequestFields";

export interface ShortlistContractor {
  id: string;
  name: string;
  tsCode?: string | null;
  avatarUrl?: string | null;
}

// Module-level store, not a Context — the directory grid and a contractor's
// public profile page are separate routes with no shared ancestor worth
// wiring a Provider through just for this. sessionStorage-backed so a
// mid-build page refresh doesn't silently drop the shortlist; cleared
// entirely once a comparison enquiry is actually sent (see clear()).
const STORAGE_KEY = "compare_shortlist_v1";

function readStored(): ShortlistContractor[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let state: ShortlistContractor[] = typeof window !== "undefined" ? readStored() : [];
const listeners = new Set<() => void>();

function notify() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode, quota) — in-memory state
    // still works for the rest of this session, just doesn't survive a reload.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ShortlistContractor[] {
  return state;
}

export function addToShortlist(contractor: ShortlistContractor): { ok: boolean; reason?: string } {
  if (state.some((c) => c.id === contractor.id)) return { ok: true };
  if (state.length >= MAX_COMPARE_RECIPIENTS) {
    return { ok: false, reason: `You can compare up to ${MAX_COMPARE_RECIPIENTS} contractors at once.` };
  }
  state = [...state, contractor];
  notify();
  return { ok: true };
}

export function removeFromShortlist(contractorId: string): void {
  state = state.filter((c) => c.id !== contractorId);
  notify();
}

export function toggleShortlist(contractor: ShortlistContractor): { ok: boolean; reason?: string } {
  if (state.some((c) => c.id === contractor.id)) {
    removeFromShortlist(contractor.id);
    return { ok: true };
  }
  return addToShortlist(contractor);
}

export function clearShortlist(): void {
  state = [];
  notify();
}

export function useCompareShortlist(): {
  shortlist: ShortlistContractor[];
  add: typeof addToShortlist;
  remove: typeof removeFromShortlist;
  toggle: typeof toggleShortlist;
  clear: typeof clearShortlist;
  isSelected: (id: string) => boolean;
} {
  const shortlist = useSyncExternalStore(subscribe, getSnapshot, () => []);
  return {
    shortlist,
    add: addToShortlist,
    remove: removeFromShortlist,
    toggle: toggleShortlist,
    clear: clearShortlist,
    isSelected: (id: string) => shortlist.some((c) => c.id === id),
  };
}
