import type { Cell, Layout, Order, SlotId } from './types';
import { START, adjacentSlots, isPacking, isWalkable } from './warehouse';

/** Trạng thái một lượt picking — các hàm ở đây là hàm thuần (không side effect) để dễ kiểm thử. */

export type RunStatus = 'ready' | 'running' | 'paused' | 'finished';
export type Dir = 'up' | 'down' | 'left' | 'right';

export const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export interface RunState {
  status: RunStatus;
  pos: Cell;
  path: Cell[];
  distance: number;
  turnarounds: number;
  lastDir: Dir | null;
  picked: Record<string, number>;
  wrongPicks: number;
  elapsedMs: number;
  resumedAt: number | null;
}

export function createRun(): RunState {
  return {
    status: 'ready',
    pos: START,
    path: [START],
    distance: 0,
    turnarounds: 0,
    lastDir: null,
    picked: {},
    wrongPicks: 0,
    elapsedMs: 0,
    resumedAt: null,
  };
}

export function startRun(run: RunState, now: number): RunState {
  if (run.status !== 'ready' && run.status !== 'paused') return run;
  return { ...run, status: 'running', resumedAt: now };
}

export function pauseRun(run: RunState, now: number): RunState {
  if (run.status !== 'running') return run;
  return { ...run, status: 'paused', elapsedMs: elapsed(run, now), resumedAt: null };
}

export function elapsed(run: RunState, now: number): number {
  return run.elapsedMs + (run.status === 'running' && run.resumedAt !== null ? now - run.resumedAt : 0);
}

export function dirBetween(a: Cell, b: Cell): Dir | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
}

/** Di chuyển 1 ô (1 m). Trả về null nếu bị chặn bởi kệ/tường hoặc lượt chưa chạy. */
export function moveStep(run: RunState, dir: Dir): RunState | null {
  if (run.status !== 'running') return null;
  const { dx, dy } = DIR_VEC[dir];
  const next = { x: run.pos.x + dx, y: run.pos.y + dy };
  if (!isWalkable(next.x, next.y)) return null;
  const turned = run.lastDir !== null && OPPOSITE[run.lastDir] === dir;
  return {
    ...run,
    pos: next,
    path: [...run.path, next],
    distance: run.distance + 1,
    turnarounds: run.turnarounds + (turned ? 1 : 0),
    lastDir: dir,
  };
}

export function moveToAdjacent(run: RunState, cell: Cell): RunState | null {
  const d = dirBetween(run.pos, cell);
  return d ? moveStep(run, d) : null;
}

export function requiredQty(order: Order, productId: string): number {
  return order.lines.find((l) => l.productId === productId)?.qty ?? 0;
}

export function remainingQty(run: RunState, order: Order, productId: string): number {
  return Math.max(0, requiredQty(order, productId) - (run.picked[productId] ?? 0));
}

export function isOrderComplete(run: RunState, order: Order): boolean {
  return order.lines.every((l) => (run.picked[l.productId] ?? 0) >= l.qty);
}

export function unitsPicked(run: RunState): number {
  return Object.values(run.picked).reduce((a, b) => a + b, 0);
}

export function correctLines(run: RunState, order: Order): number {
  return order.lines.filter((l) => (run.picked[l.productId] ?? 0) === l.qty).length;
}

export type PickOutcome = 'ok' | 'wrong' | 'full' | 'not-adjacent' | 'not-running';

/**
 * Nhặt hàng tại ô kệ `slot` khi nhân viên đứng ở ô lối đi tiếp giáp.
 * - Sản phẩm không thuộc đơn → tính 1 lần nhặt sai, không cộng vào giỏ.
 * - Không cho lấy vượt số lượng yêu cầu.
 */
export function pickAt(
  run: RunState,
  order: Order,
  layout: Layout,
  slot: SlotId,
  qty = 1,
): { run: RunState; outcome: PickOutcome; amount: number } {
  if (run.status !== 'running') return { run, outcome: 'not-running', amount: 0 };
  if (!adjacentSlots(run.pos).includes(slot)) return { run, outcome: 'not-adjacent', amount: 0 };
  const pid = layout[slot];
  if (requiredQty(order, pid) === 0) {
    return { run: { ...run, wrongPicks: run.wrongPicks + 1 }, outcome: 'wrong', amount: 0 };
  }
  const amount = Math.min(Math.max(1, Math.floor(qty)), remainingQty(run, order, pid));
  if (amount === 0) return { run, outcome: 'full', amount: 0 };
  return {
    run: { ...run, picked: { ...run.picked, [pid]: (run.picked[pid] ?? 0) + amount } },
    outcome: 'ok',
    amount,
  };
}

export function canFinish(run: RunState, order: Order): boolean {
  return run.status === 'running' && isPacking(run.pos) && isOrderComplete(run, order);
}

export function finishRun(run: RunState, order: Order, now: number): RunState {
  if (!canFinish(run, order)) return run;
  return { ...run, status: 'finished', elapsedMs: elapsed(run, now), resumedAt: null };
}
