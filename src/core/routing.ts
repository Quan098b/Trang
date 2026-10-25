import type { Cell, SlotId } from './types';
import { distanceToPacking, gridDistance, joinPaths, pathBetween, pathToPacking } from './pathfinding';
import { START, accessCells } from './warehouse';

/** Số vị trí tối đa giải chính xác bằng Held–Karp. */
export const EXACT_LIMIT = 8;

export interface RouteTarget {
  slot: SlotId;
  access: Cell[];
}

export interface RouteResult {
  distance: number;
  /** Thứ tự ghé các vị trí và ô đứng lấy hàng */
  stops: { slot: SlotId; cell: Cell }[];
  path: Cell[];
  /** true = tối ưu tuyệt đối (Held–Karp); false = ước lượng heuristic */
  exact: boolean;
  method: string;
}

export function targetsForSlots(slots: SlotId[]): RouteTarget[] {
  return [...new Set(slots)].map((slot) => ({ slot, access: accessCells(slot) }));
}

interface Node {
  t: number;
  cell: Cell;
}

function buildNodes(targets: RouteTarget[]): Node[] {
  return targets.flatMap((tg, t) => tg.access.map((cell) => ({ t, cell })));
}

/**
 * Held–Karp (quy hoạch động trên tập con) mở rộng cho trường hợp mỗi SKU có
 * nhiều ô đứng lấy hàng: trạng thái = (tập SKU đã lấy, ô đứng cuối cùng).
 * Xuất phát tại START, kết thúc tại ô đóng gói gần nhất.
 */
function heldKarp(targets: RouteTarget[], start: Cell) {
  const nodes = buildNodes(targets);
  const n = targets.length;
  const m = nodes.length;
  const full = (1 << n) - 1;
  const dp = new Float64Array((full + 1) * m).fill(Infinity);
  const parent = new Int32Array((full + 1) * m).fill(-1);
  const d = nodes.map((a) => nodes.map((b) => gridDistance(a.cell, b.cell)));

  nodes.forEach((v, i) => {
    dp[(1 << v.t) * m + i] = gridDistance(start, v.cell);
  });

  for (let mask = 1; mask <= full; mask++) {
    for (let i = 0; i < m; i++) {
      if (!(mask & (1 << nodes[i].t))) continue;
      const cur = dp[mask * m + i];
      if (cur === Infinity) continue;
      for (let j = 0; j < m; j++) {
        const bit = 1 << nodes[j].t;
        if (mask & bit) continue;
        const nm = mask | bit;
        const val = cur + d[i][j];
        if (val < dp[nm * m + j]) {
          dp[nm * m + j] = val;
          parent[nm * m + j] = i;
        }
      }
    }
  }

  let best = Infinity;
  let bestEnd = -1;
  for (let i = 0; i < m; i++) {
    const val = dp[full * m + i] + distanceToPacking(nodes[i].cell);
    if (val < best) {
      best = val;
      bestEnd = i;
    }
  }

  const seq: Node[] = [];
  let mask = full;
  let i = bestEnd;
  while (i !== -1) {
    seq.push(nodes[i]);
    const p = parent[mask * m + i];
    mask &= ~(1 << nodes[i].t);
    i = p;
  }
  seq.reverse();
  return { distance: best, seq };
}

/** Với thứ tự SKU cố định, chọn ô đứng lấy hàng tốt nhất cho từng SKU (Viterbi). */
function bestCellsForOrder(targets: RouteTarget[], order: number[], start: Cell) {
  if (order.length === 0) return { cost: distanceToPacking(start), cells: [] as Cell[] };
  let costs = targets[order[0]].access.map((c) => gridDistance(start, c));
  const back: number[][] = [];
  for (let k = 1; k < order.length; k++) {
    const prevCells = targets[order[k - 1]].access;
    const curCells = targets[order[k]].access;
    const next: number[] = [];
    const bk: number[] = [];
    for (const c of curCells) {
      let bv = Infinity;
      let bi = 0;
      prevCells.forEach((p, pi) => {
        const v = costs[pi] + gridDistance(p, c);
        if (v < bv) {
          bv = v;
          bi = pi;
        }
      });
      next.push(bv);
      bk.push(bi);
    }
    costs = next;
    back.push(bk);
  }
  const last = targets[order[order.length - 1]].access;
  let bv = Infinity;
  let bi = 0;
  last.forEach((c, i) => {
    const v = costs[i] + distanceToPacking(c);
    if (v < bv) {
      bv = v;
      bi = i;
    }
  });
  const idx = [bi];
  for (let k = back.length - 1; k >= 0; k--) idx.push(back[k][idx[idx.length - 1]]);
  idx.reverse();
  return { cost: bv, cells: idx.map((ci, k) => targets[order[k]].access[ci]) };
}

/** Heuristic cho đơn > 8 vị trí: láng giềng gần nhất + cải thiện 2-opt. Kết quả là ƯỚC LƯỢNG. */
function heuristic(targets: RouteTarget[], start: Cell) {
  const remaining = new Set(targets.map((_, i) => i));
  const order: number[] = [];
  let pos = start;
  while (remaining.size) {
    let best = -1;
    let bestD = Infinity;
    let bestCell = pos;
    for (const t of remaining) {
      for (const c of targets[t].access) {
        const dd = gridDistance(pos, c);
        if (dd < bestD) {
          bestD = dd;
          best = t;
          bestCell = c;
        }
      }
    }
    order.push(best);
    remaining.delete(best);
    pos = bestCell;
  }
  let cur = bestCellsForOrder(targets, order, start);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        const r = bestCellsForOrder(targets, cand, start);
        if (r.cost < cur.cost) {
          order.splice(0, order.length, ...cand);
          cur = r;
          improved = true;
        }
      }
    }
  }
  return { distance: cur.cost, seq: order.map((t, k) => ({ t, cell: cur.cells[k] })) };
}

/** Tìm tuyến lấy hàng ngắn nhất: START → mọi vị trí → khu đóng gói. */
export function solveRoute(targets: RouteTarget[], opts: { withPath?: boolean; start?: Cell } = {}): RouteResult {
  const start = opts.start ?? START;
  const exact = targets.length <= EXACT_LIMIT;
  const { distance, seq } =
    targets.length === 0
      ? { distance: distanceToPacking(start), seq: [] as Node[] }
      : exact
        ? heldKarp(targets, start)
        : heuristic(targets, start);

  const stops = seq.map((s) => ({ slot: targets[s.t].slot, cell: s.cell }));
  let path: Cell[] = [];
  if (opts.withPath !== false) {
    const segs: Cell[][] = [];
    let pos = start;
    for (const s of stops) {
      segs.push(pathBetween(pos, s.cell) ?? []);
      pos = s.cell;
    }
    segs.push(pathToPacking(pos) ?? []);
    path = joinPaths(segs);
  }
  return {
    distance,
    stops,
    path,
    exact,
    method: exact ? 'Held–Karp (quy hoạch động, tối ưu chính xác)' : 'Láng giềng gần nhất + 2-opt (ước lượng)',
  };
}

/** Chỉ tính quãng đường (nhanh, dùng để đánh giá hàng loạt). */
export function routeDistance(slots: SlotId[]): number {
  return solveRoute(targetsForSlots(slots), { withPath: false }).distance;
}
