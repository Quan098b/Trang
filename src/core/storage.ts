import type { Layout, Order, Phase, RunResult } from './types';
import { initialLayout, validateLayout } from './layout';
import { DEFAULT_ORDER, isValidOrder } from './orders';

export interface SavedState {
  version: 1;
  order: Order;
  phase: Phase;
  optimizedLayout: Layout;
  /** Kết quả trước/sau tối ưu được lưu độc lập với nhau */
  results: { before: RunResult | null; after: RunResult | null };
  history: RunResult[];
}

const KEY = 'warehouse-picking-challenge:v1';

export function defaultState(): SavedState {
  return {
    version: 1,
    order: DEFAULT_ORDER,
    phase: 'pick1',
    optimizedLayout: initialLayout(),
    results: { before: null, after: null },
    history: [],
  };
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedState;
    if (s.version !== 1 || !isValidOrder(s.order) || !validateLayout(s.optimizedLayout)) return null;
    const results = { before: s.results?.before ?? null, after: s.results?.after ?? null };
    let phase = s.phase;
    if ((phase === 'layout' || phase === 'pick2') && !results.before) phase = 'pick1';
    if (phase === 'compare' && !(results.before && results.after)) phase = results.before ? 'layout' : 'pick1';
    return { ...s, phase, results, history: Array.isArray(s.history) ? s.history : [] };
  } catch {
    return null;
  }
}

export function saveState(s: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* bộ nhớ trình duyệt không khả dụng — bỏ qua */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
