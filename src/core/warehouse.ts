import type { Cell, SlotId } from './types';

/*
 * Lưới kho chữ U (mỗi ô lưới = 1 mét):
 *
 *   x:  0  1  2  3  4  5  6  7  8  9 10 11 12
 *   y0  #  #  #  #  #  #  #  #  #  #  #  #  #   tường
 *   y1  #  .  .  .  .  .  .  .  .  .  .  .  #   hành lang trên
 *   y2  #  . R1  . R2  . R3  . R4  . R5  .  #   ô 01
 *   ..                                          ...
 *   y9  #  . R1  . R2  . R3  . R4  . R5  .  #   ô 08
 *   y10 #  .  .  .  .  .  .  .  .  .  .  .  #   hành lang dưới
 *   y11 #  N  N  N  .  .  .  .  .  P  P  P  #   N = nhập hàng, P = đóng gói
 *   y12 #  S  N  N  .  .  .  .  .  P  P  P  #   S = Start
 *   y13 #  #  #  #  #  #  #  #  #  X  X  X  #   X = xuất hàng (không đi vào)
 */

export const GRID_W = 13;
export const GRID_H = 14;
export const RACK_COUNT = 5;
export const SLOTS_PER_RACK = 8;
export const SHELF_TOP_Y = 2;
export const TOP_CORRIDOR_Y = 1;
export const BOTTOM_CORRIDOR_Y = SHELF_TOP_Y + SLOTS_PER_RACK; // 10

export const START: Cell = { x: 1, y: 12 };

export type CellType = 'wall' | 'floor' | 'shelf' | 'receiving' | 'packing' | 'shipping';

export const RACK_IDS = Array.from({ length: RACK_COUNT }, (_, i) => `R${i + 1}`);

export const rackX = (rack: number) => 2 + rack * 2;

export function makeSlotId(rack: number, level: number): SlotId {
  return `R${rack + 1}-${String(level + 1).padStart(2, '0')}`;
}

export const SLOT_IDS: SlotId[] = RACK_IDS.flatMap((_, r) =>
  Array.from({ length: SLOTS_PER_RACK }, (_, l) => makeSlotId(r, l)),
);

export function parseSlot(id: SlotId): { rack: number; level: number } {
  const m = /^R(\d)-(\d\d)$/.exec(id);
  if (!m) throw new Error(`Mã ô không hợp lệ: ${id}`);
  return { rack: Number(m[1]) - 1, level: Number(m[2]) - 1 };
}

export function slotCell(id: SlotId): Cell {
  const { rack, level } = parseSlot(id);
  return { x: rackX(rack), y: SHELF_TOP_Y + level };
}

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

function computeType(x: number, y: number): CellType {
  if (y === GRID_H - 1) return x >= 9 && x <= 11 ? 'shipping' : 'wall';
  if (x === 0 || x === GRID_W - 1 || y === 0) return 'wall';
  if (y >= SHELF_TOP_Y && y < BOTTOM_CORRIDOR_Y && x >= 2 && x <= rackX(RACK_COUNT - 1) && x % 2 === 0) return 'shelf';
  if (y > BOTTOM_CORRIDOR_Y && x <= 3) return 'receiving';
  if (y > BOTTOM_CORRIDOR_Y && x >= 9) return 'packing';
  return 'floor';
}

const TYPES: CellType[] = [];
for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) TYPES.push(computeType(x, y));

export function cellType(x: number, y: number): CellType {
  return inBounds(x, y) ? TYPES[y * GRID_W + x] : 'wall';
}

export function isWalkable(x: number, y: number): boolean {
  const t = cellType(x, y);
  return t === 'floor' || t === 'receiving' || t === 'packing';
}

export const isPacking = (c: Cell) => cellType(c.x, c.y) === 'packing';

function cellsOf(type: CellType): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (cellType(x, y) === type) out.push({ x, y });
  return out;
}

export const PACKING_CELLS = cellsOf('packing');
export const RECEIVING_CELLS = cellsOf('receiving');
export const SHIPPING_CELLS = cellsOf('shipping');

export function slotAt(x: number, y: number): SlotId | null {
  if (cellType(x, y) !== 'shelf') return null;
  return makeSlotId((x - 2) / 2, y - SHELF_TOP_Y);
}

/** Ô lối đi mà nhân viên phải đứng để lấy hàng (hai mặt trái/phải của kệ). */
export function accessCells(id: SlotId): Cell[] {
  const c = slotCell(id);
  return [
    { x: c.x - 1, y: c.y },
    { x: c.x + 1, y: c.y },
  ].filter((a) => isWalkable(a.x, a.y));
}

/** Các ô kệ có thể lấy hàng khi đứng tại ô `c`. */
export function adjacentSlots(c: Cell): SlotId[] {
  if (!isWalkable(c.x, c.y)) return [];
  const out: SlotId[] = [];
  for (const dx of [-1, 1]) {
    const s = slotAt(c.x + dx, c.y);
    if (s) out.push(s);
  }
  return out;
}

export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
