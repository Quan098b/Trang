import type { Cell } from './types';
import { GRID_H, GRID_W, PACKING_CELLS, isWalkable } from './warehouse';

/** Tìm đường bằng BFS trên lưới 4 hướng; chỉ đi qua ô lối đi/khu vực đi lại được. */

export const cellIndex = (c: Cell) => c.y * GRID_W + c.x;
export const indexCell = (i: number): Cell => ({ x: i % GRID_W, y: Math.floor(i / GRID_W) });

const STEPS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;

export interface BfsResult {
  dist: Int32Array;
  prev: Int32Array;
}

export function bfs(sources: Cell[]): BfsResult {
  const n = GRID_W * GRID_H;
  const dist = new Int32Array(n).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const queue: number[] = [];
  for (const s of sources) {
    if (!isWalkable(s.x, s.y)) continue;
    const i = cellIndex(s);
    if (dist[i] === 0) continue;
    dist[i] = 0;
    queue.push(i);
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % GRID_W;
    const y = (i - x) / GRID_W;
    for (const [dx, dy] of STEPS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(nx, ny)) continue;
      const j = ny * GRID_W + nx;
      if (dist[j] !== -1) continue;
      dist[j] = dist[i] + 1;
      prev[j] = i;
      queue.push(j);
    }
  }
  return { dist, prev };
}

const cache = new Map<number, BfsResult>();

export function bfsFrom(c: Cell): BfsResult {
  const k = cellIndex(c);
  let r = cache.get(k);
  if (!r) {
    r = bfs([c]);
    cache.set(k, r);
  }
  return r;
}

/** Số bước ngắn nhất giữa hai ô (−1 nếu không tới được). */
export function gridDistance(a: Cell, b: Cell): number {
  return bfsFrom(a).dist[cellIndex(b)];
}

/** Đường đi ngắn nhất từ a đến b (bao gồm cả hai đầu), hoặc null. */
export function pathBetween(a: Cell, b: Cell): Cell[] | null {
  const { dist, prev } = bfsFrom(a);
  let i = cellIndex(b);
  if (dist[i] < 0) return null;
  const out: Cell[] = [];
  while (i !== -1) {
    out.push(indexCell(i));
    i = prev[i];
  }
  return out.reverse();
}

let packingBfs: BfsResult | null = null;
const toPacking = () => (packingBfs ??= bfs(PACKING_CELLS));

/** Khoảng cách từ ô c tới ô đóng gói gần nhất. */
export function distanceToPacking(c: Cell): number {
  return toPacking().dist[cellIndex(c)];
}

/** Đường đi từ c tới ô đóng gói gần nhất (c là phần tử đầu tiên). */
export function pathToPacking(c: Cell): Cell[] | null {
  const { dist, prev } = toPacking();
  let i = cellIndex(c);
  if (dist[i] < 0) return null;
  const out: Cell[] = [];
  while (i !== -1) {
    out.push(indexCell(i));
    i = prev[i];
  }
  return out;
}

/** Kiểm tra mọi bước của đường đi đều hợp lệ (liền kề, không xuyên kệ/tường). */
export function isValidPath(path: Cell[]): boolean {
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (!isWalkable(c.x, c.y)) return false;
    if (i > 0) {
      const p = path[i - 1];
      if (Math.abs(p.x - c.x) + Math.abs(p.y - c.y) !== 1) return false;
    }
  }
  return true;
}

/** Nối các đoạn đường, bỏ ô trùng tại điểm nối. */
export function joinPaths(segments: Cell[][]): Cell[] {
  const out: Cell[] = [];
  for (const seg of segments) {
    for (const c of seg) {
      const last = out[out.length - 1];
      if (last && last.x === c.x && last.y === c.y) continue;
      out.push(c);
    }
  }
  return out;
}
