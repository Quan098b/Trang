import type { Order, OrderLine } from './types';
import { DEMAND_INFO, PRODUCTS, productAtOriginal } from '../data/products';

export const MAX_QTY = 7;

const line = (slot: string, qty: number): OrderLine => ({ productId: productAtOriginal(slot), qty });

export const SAMPLE_ORDERS: Order[] = [
  {
    id: 'mau-de',
    name: 'Đơn tắm gội',
    difficulty: 'Dễ',
    lines: [line('R2-01', 2), line('R1-04', 1), line('R3-07', 1)],
  },
  {
    id: 'mau-tb',
    name: 'Đơn thử nghiệm (ví dụ)',
    difficulty: 'Trung bình',
    lines: [line('R1-01', 1), line('R5-02', 3), line('R1-07', 2), line('R4-04', 7)],
  },
  {
    id: 'mau-kho',
    name: 'Đơn chăm sóc da',
    difficulty: 'Khó',
    lines: [line('R3-05', 2), line('R4-01', 1), line('R1-06', 1), line('R5-01', 3), line('R2-07', 2), line('R5-05', 1)],
  },
  {
    id: 'mau-ratkho',
    name: 'Đơn tổng hợp 8 SKU',
    difficulty: 'Rất khó',
    lines: [
      line('R1-01', 2),
      line('R5-02', 2),
      line('R3-04', 1),
      line('R2-03', 1),
      line('R3-01', 5),
      line('R4-07', 3),
      line('R2-04', 2),
      line('R4-08', 1),
    ],
  },
];

export const DEFAULT_ORDER = SAMPLE_ORDERS[1];

/** Gộp dòng trùng SKU bằng cách cộng dồn số lượng. */
export function mergeLines(lines: OrderLine[]): OrderLine[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    if (l.qty <= 0) continue;
    map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty);
  }
  return [...map].map(([productId, qty]) => ({ productId, qty }));
}

export type Rng = () => number;

/** PRNG có seed (mulberry32) — để bộ đơn đánh giá giống hệt nhau giữa các bố trí. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

/**
 * Đơn ngẫu nhiên 3–8 SKU khác nhau. Xác suất chọn theo trọng số giả định
 * Cao = 6, Trung bình = 3, Thấp = 1. Rút có trọng số; nếu rút trùng SKU thì cộng dồn số lượng (tối đa 7).
 */
export function generateRandomOrder(rng: Rng = Math.random, minSku = 3, maxSku = 8): Order {
  const k = randInt(rng, minSku, maxSku);
  const weights = PRODUCTS.map((p) => DEMAND_INFO[p.demand].weight);
  const total = weights.reduce((a, b) => a + b, 0);
  const lines: OrderLine[] = [];
  const chosen = new Set<string>();
  while (chosen.size < k) {
    let r = rng() * total;
    let idx = 0;
    while (r >= weights[idx]) r -= weights[idx++];
    const pid = PRODUCTS[Math.min(idx, PRODUCTS.length - 1)].id;
    const qty = randInt(rng, 1, MAX_QTY);
    if (chosen.has(pid)) {
      const l = lines.find((x) => x.productId === pid)!;
      l.qty = Math.min(MAX_QTY, l.qty + qty);
    } else {
      chosen.add(pid);
      lines.push({ productId: pid, qty });
    }
  }
  return {
    id: `random-${Date.now().toString(36)}-${Math.floor(rng() * 1e6)}`,
    name: `Đơn ngẫu nhiên ${k} SKU`,
    difficulty: 'Ngẫu nhiên',
    lines,
  };
}

let evalCache: Order[] | null = null;

/** Bộ 200 đơn ngẫu nhiên cố định (seed) để so sánh bố trí một cách khách quan. */
export function evaluationOrders(): Order[] {
  if (!evalCache) {
    const rng = seededRng(20240601);
    evalCache = Array.from({ length: 200 }, () => generateRandomOrder(rng));
  }
  return evalCache;
}

export function isValidOrder(o: unknown): o is Order {
  if (!o || typeof o !== 'object') return false;
  const x = o as Order;
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    Array.isArray(x.lines) &&
    x.lines.length > 0 &&
    x.lines.every((l) => PRODUCTS.some((p) => p.id === l.productId) && Number.isInteger(l.qty) && l.qty > 0) &&
    new Set(x.lines.map((l) => l.productId)).size === x.lines.length
  );
}
