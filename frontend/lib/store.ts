import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AlignResponse, Correction, TranscribeResponse } from "./alignment";
import type { Pairing } from "./pairing";

export type PairingState = {
  pairing: Pairing;
  truthText: string;
  transcription?: TranscribeResponse;
  alignment?: AlignResponse;
  corrections: Record<string, Correction | undefined>;
  status: "idle" | "transcribing" | "aligning" | "ready" | "error";
  errorMsg?: string;
  view: "original" | "corrected";
};

export type Settings = {
  apiKey: string;
  language: string;
  prompt: string;
  medicalMode: boolean;
  whisperNormalize: boolean;
  ignoreDisfluencies: boolean;
  settingsCollapsed: boolean;
};

export type AppState = {
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;

  pairings: Record<string, PairingState>;
  pairingOrder: string[];
  activeId: string | null;

  setActive: (id: string | null) => void;
  upsertPairings: (items: { pairing: Pairing; truthText: string }[]) => void;
  removePairing: (id: string) => void;
  resetActive: () => void;
  clearAll: () => void;

  setPairingStatus: (id: string, patch: Partial<PairingState>) => void;
  setCorrection: (id: string, itemId: string, correction: Correction | null) => void;
  resetCorrections: (id: string) => void;
  setView: (id: string, view: "original" | "corrected") => void;
};

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  language: "auto",
  prompt: "",
  medicalMode: false,
  whisperNormalize: true,
  ignoreDisfluencies: true,
  settingsCollapsed: false,
};

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      pairings: {},
      pairingOrder: [],
      activeId: null,

      setActive: (id) => set({ activeId: id }),

      upsertPairings: (items) =>
        set((s) => {
          const pairings = { ...s.pairings };
          const order = [...s.pairingOrder];
          for (const { pairing, truthText } of items) {
            if (!pairings[pairing.id]) order.push(pairing.id);
            pairings[pairing.id] = {
              pairing,
              truthText,
              corrections: pairings[pairing.id]?.corrections ?? {},
              status: pairings[pairing.id]?.status ?? "idle",
              view: pairings[pairing.id]?.view ?? "corrected",
              transcription: pairings[pairing.id]?.transcription,
              alignment: pairings[pairing.id]?.alignment,
            };
          }
          return {
            pairings,
            pairingOrder: order,
            activeId: s.activeId ?? order[0] ?? null,
          };
        }),

      removePairing: (id) =>
        set((s) => {
          const pairings = { ...s.pairings };
          delete pairings[id];
          const order = s.pairingOrder.filter((x) => x !== id);
          const nextActive = s.activeId === id ? (order[0] ?? null) : s.activeId;
          return { pairings, pairingOrder: order, activeId: nextActive };
        }),

      resetActive: () =>
        set((s) => {
          if (!s.activeId) return {} as Partial<AppState>;
          const cur = s.pairings[s.activeId];
          if (!cur) return {} as Partial<AppState>;
          return {
            pairings: {
              ...s.pairings,
              [s.activeId]: {
                ...cur,
                transcription: undefined,
                alignment: undefined,
                corrections: {},
                status: "idle",
                errorMsg: undefined,
                view: "corrected",
              },
            },
          };
        }),

      clearAll: () =>
        set({ pairings: {}, pairingOrder: [], activeId: null }),

      setPairingStatus: (id, patch) =>
        set((s) => {
          const cur = s.pairings[id];
          if (!cur) return {} as Partial<AppState>;
          return { pairings: { ...s.pairings, [id]: { ...cur, ...patch } } };
        }),

      setCorrection: (id, itemId, correction) =>
        set((s) => {
          const cur = s.pairings[id];
          if (!cur) return {} as Partial<AppState>;
          const corrections = { ...cur.corrections };
          if (correction === null) delete corrections[itemId];
          else corrections[itemId] = correction;
          return { pairings: { ...s.pairings, [id]: { ...cur, corrections } } };
        }),

      resetCorrections: (id) =>
        set((s) => {
          const cur = s.pairings[id];
          if (!cur) return {} as Partial<AppState>;
          return {
            pairings: { ...s.pairings, [id]: { ...cur, corrections: {} } },
          };
        }),

      setView: (id, view) =>
        set((s) => {
          const cur = s.pairings[id];
          if (!cur) return {} as Partial<AppState>;
          return { pairings: { ...s.pairings, [id]: { ...cur, view } } };
        }),
    }),
    {
      name: "tfc-app",
      partialize: (s) => ({ settings: s.settings }) as Partial<AppState>,
    },
  ),
);

export function useActivePairing(): PairingState | null {
  return useApp((s) => (s.activeId ? (s.pairings[s.activeId] ?? null) : null));
}
