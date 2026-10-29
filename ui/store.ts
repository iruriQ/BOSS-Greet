import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import type { CardId, PanelModel, Preferences } from "./types";

const defaults: Preferences = {
  orderVersion: 1,
  expanded: false,
  windowBounds: null,
  settingsOrder: ["filters", "greeting"],
  insightOrder: ["logs"],
  layout: { settings: 60, insights: 40 },
};
export function normalizePreferences(value: Partial<Preferences> = {}): Preferences {
  const order = (input: unknown, fallback: CardId[]) => Array.isArray(input) && input.length === fallback.length &&
    new Set(input).size === fallback.length && input.every(id => fallback.includes(id)) ? input as CardId[] : [...fallback];
  const settings = Number(value.layout?.settings);
  return {
    orderVersion: defaults.orderVersion,
    expanded: value.expanded === true,
    windowBounds: value.windowBounds && [value.windowBounds.x, value.windowBounds.y, value.windowBounds.width, value.windowBounds.height]
      .every(n => typeof n === "number" && Number.isFinite(n)) && value.windowBounds.width > 0 && value.windowBounds.height > 0
      ? { ...value.windowBounds } : null,
    // Adopt the agreed workflow for layouts saved before navigation and content
    // order were synchronized, preserving all unrelated layout preferences.
    settingsOrder: value.orderVersion === defaults.orderVersion
      ? order(value.settingsOrder, defaults.settingsOrder) : [...defaults.settingsOrder],
    insightOrder: order(value.insightOrder, defaults.insightOrder),
    layout: Number.isFinite(settings) && settings >= 45 && settings <= 75
      ? { settings, insights: 100 - settings } : { ...defaults.layout },
  };
}
interface UIState {
  model: PanelModel | null;
  preferences: Preferences;
  activeNav: string;
  setModel: (model: PanelModel) => void;
  setNav: (nav: string) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  reorder: (active: CardId, over: CardId) => void;
}
let persistPreferences: (value: Preferences) => void = () => {};
export const usePanelStore = create<UIState>((set, get) => ({
  model: null,
  preferences: normalizePreferences(),
  activeNav: "filters",
  setModel: model => set({ model }),
  setNav: activeNav => set({ activeNav }),
  setPreferences: patch => {
    const preferences = normalizePreferences({ ...get().preferences, ...patch });
    if (JSON.stringify(preferences) === JSON.stringify(get().preferences)) return;
    set({ preferences });
    persistPreferences(preferences);
  },
  reorder: (active, over) => {
    const preferences = get().preferences;
    const list = preferences.settingsOrder.includes(active) ? "settingsOrder" : "insightOrder";
    const items = preferences[list];
    if (!items.includes(over) || active === over) return;
    get().setPreferences({ [list]: arrayMove(items, items.indexOf(active), items.indexOf(over)) });
  },
}));
export function initializeStore(preferences: Partial<Preferences>, persist: typeof persistPreferences) {
  persistPreferences = persist;
  usePanelStore.setState({ preferences: normalizePreferences(preferences) });
}
