import type { Demand, GroupId, Layout, Order, SlotId } from './types';
import { DEMAND_INFO, PRODUCTS, PRODUCT_BY_ID } from '../data/products';
import { distanceToPacking, gridDistance } from './pathfinding';
import { routeDistance } from './routing';
import { START, SLOT_IDS, accessCells, parseSlot } from './warehouse';

/** Bố trí ban đầu: giữ nguyên vị trí theo bảng dữ liệu, KHÔNG sắp xếp lại. */
export function initialLayout(): Layout {
  return Object.fromEntries(PRODUCTS.map((p) => [p.originalSlot, p.id]));
}

export const ORIGINAL_LAYOUT: Readonly<Layout> = Object.freeze(initialLayout());

export function swapSlots(layout: Layout, a: SlotId, b: SlotId): Layout {
  if (a === b || !(a in layout) || !(b in layout)) return layout;
  return { ...layout, [a]: layout[b], [b]: layout[a] };
}

/** 40 ô, mỗi ô một sản phẩm, không mất và không trùng SKU. */
export function validateLayout(layout: unknown): layout is Layout {
  if (!layout || typeof layout !== 'object') return false;
  const l = layout as Record<string, unknown>;
  if (Object.keys(l).length !== SLOT_IDS.length) return false;
  const seen = new Set<string>();
  for (const s of SLOT_IDS) {
    const pid = l[s];
    if (typeof pid !== 'string' || !PRODUCT_BY_ID[pid] || seen.has(pid)) return false;
    seen.add(pid);
  }
  return seen.size === PRODUCTS.length;
}

export function slotOfProduct(layout: Layout): Record<string, SlotId> {
  const out: Record<string, SlotId> = {};
  for (const [slot, pid] of Object.entries(layout)) out[pid] = slot;
  return out;
}

export function orderSlots(order: Order, layout: Layout): SlotId[] {
  const inv = slotOfProduct(layout);
  return order.lines.map((l) => inv[l.productId]);
}

export function changedSlots(layout: Layout): SlotId[] {
  return SLOT_IDS.filter((s) => layout[s] !== ORIGINAL_LAYOUT[s]);
}

/** Chi phí một chuyến lấy riêng SKU ở ô này: Start → ô → Đóng gói (m). */
export function slotTripCost(slot: SlotId): number {
  return Math.min(...accessCells(slot).map((c) => gridDistance(START, c) + distanceToPacking(c)));
}

export type Zone = 'near' | 'mid' | 'far';
export const ZONE_INFO: Record<Zone, { label: string; desc: string }> = {
  near: { label: 'Vùng gần', desc: 'Ô 06–08, sát hành lang dưới' },
  mid: { label: 'Vùng giữa', desc: 'Ô 03–05' },
  far: { label: 'Vùng xa', desc: 'Ô 01–02, sát hành lang trên' },
};

export function slotZone(slot: SlotId): Zone {
  const { level } = parseSlot(slot);
  return level >= 5 ? 'near' : level >= 2 ? 'mid' : 'far';
}

export function zoneDemandMatrix(layout: Layout): Record<Zone, Record<Demand, number>> {
  const m: Record<Zone, Record<Demand, number>> = {
    near: { C: 0, TB: 0, T: 0 },
    mid: { C: 0, TB: 0, T: 0 },
    far: { C: 0, TB: 0, T: 0 },
  };
  for (const s of SLOT_IDS) m[slotZone(s)][PRODUCT_BY_ID[layout[s]].demand]++;
  return m;
}

export function demandCounts(): Record<Demand, number> {
  const c: Record<Demand, number> = { C: 0, TB: 0, T: 0 };
  for (const p of PRODUCTS) c[p.demand]++;
  return c;
}

/** Chỉ số tiếp cận theo trọng số nhu cầu: trung bình có trọng số của chi phí chuyến đơn lẻ. Càng nhỏ càng tốt. */
export function weightedAccessIndex(layout: Layout): number {
  let sum = 0;
  let w = 0;
  for (const s of SLOT_IDS) {
    const weight = DEMAND_INFO[PRODUCT_BY_ID[layout[s]].demand].weight;
    sum += weight * slotTripCost(s);
    w += weight;
  }
  return sum / w;
}

function slotPairDistance(a: SlotId, b: SlotId): number {
  let best = Infinity;
  for (const ca of accessCells(a)) for (const cb of accessCells(b)) best = Math.min(best, gridDistance(ca, cb));
  return best;
}

/** Độ phân tán trung bình (m) giữa các SKU cùng nhóm — càng nhỏ, hàng mua cùng nhau càng gần nhau. */
export function groupSpread(layout: Layout): { byGroup: Record<GroupId, number>; average: number } {
  const inv = slotOfProduct(layout);
  const groups = new Map<GroupId, SlotId[]>();
  for (const p of PRODUCTS) {
    const list = groups.get(p.group) ?? [];
    list.push(inv[p.id]);
    groups.set(p.group, list);
  }
  const byGroup = {} as Record<GroupId, number>;
  let total = 0;
  let pairs = 0;
  for (const [g, slots] of groups) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) {
        s += slotPairDistance(slots[i], slots[j]);
        n++;
      }
    byGroup[g] = n ? s / n : 0;
    total += s;
    pairs += n;
  }
  return { byGroup, average: pairs ? total / pairs : 0 };
}

/** Quãng đường tối ưu trung bình trên một bộ đơn hàng (dùng cùng bộ đơn cho mọi bố trí). */
export function averageOptimalDistance(layout: Layout, orders: Order[]): number {
  if (!orders.length) return 0;
  let sum = 0;
  for (const o of orders) sum += routeDistance(orderSlots(o, layout));
  return sum / orders.length;
}
