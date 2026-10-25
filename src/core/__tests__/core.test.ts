import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../../data/products';
import { createRun, isOrderComplete, moveStep, pickAt, startRun, canFinish, finishRun, type Dir, type RunState } from '../engine';
import { ORIGINAL_LAYOUT, initialLayout, orderSlots, swapSlots, validateLayout } from '../layout';
import { DEFAULT_ORDER, SAMPLE_ORDERS, generateRandomOrder, mergeLines, seededRng } from '../orders';
import { gridDistance, isValidPath, pathBetween } from '../pathfinding';
import { solveRoute, targetsForSlots } from '../routing';
import { buildResult } from '../results';
import { computeScore } from '../scoring';
import { SLOT_IDS, START, accessCells, cellType, isPacking, isWalkable, slotCell } from '../warehouse';
import type { Cell, Order } from '../types';

function walk(run: RunState, path: Cell[]): RunState {
  let r = run;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const dir: Dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
    const next = moveStep(r, dir);
    if (!next) throw new Error('bị chặn');
    r = next;
  }
  return r;
}

const go = (run: RunState, to: Cell) => walk(run, pathBetween(run.pos, to)!);

describe('Dữ liệu kho', () => {
  it('có đúng 40 SKU, 40 ô, không trùng ô', () => {
    expect(PRODUCTS).toHaveLength(40);
    expect(SLOT_IDS).toHaveLength(40);
    expect(new Set(SLOT_IDS).size).toBe(40);
    expect(new Set(PRODUCTS.map((p) => p.originalSlot)).size).toBe(40);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(40);
    expect(validateLayout(initialLayout())).toBe(true);
  });

  it('12 cao, 16 trung bình, 12 thấp', () => {
    const c = (d: string) => PRODUCTS.filter((p) => p.demand === d).length;
    expect([c('C'), c('TB'), c('T')]).toEqual([12, 16, 12]);
  });

  it('bố trí ban đầu giữ nguyên theo bảng (không tự sắp ABC)', () => {
    const name = (slot: string) => PRODUCTS.find((p) => p.id === ORIGINAL_LAYOUT[slot])!.name;
    expect(name('R1-01')).toBe('Bàn chải đánh răng');
    expect(name('R5-02')).toBe('Kem đánh răng');
    expect(name('R4-04')).toBe('Bông tắm');
    expect(name('R5-08')).toBe('Gương trang điểm');
  });

  it('mọi vị trí đều tiếp cận được từ Start và khu đóng gói', () => {
    for (const s of SLOT_IDS) {
      const acc = accessCells(s);
      expect(acc.length).toBeGreaterThan(0);
      expect(acc.some((c) => gridDistance(START, c) > 0)).toBe(true);
      expect(cellType(slotCell(s).x, slotCell(s).y)).toBe('shelf');
    }
  });
});

describe('Di chuyển', () => {
  it('không thể đi xuyên kệ hoặc tường', () => {
    let r = startRun(createRun(), 0);
    expect(moveStep(r, 'left')).toBeNull(); // tường bên trái Start
    expect(moveStep(r, 'down')).toBeNull(); // tường dưới
    r = go(r, { x: 1, y: 5 });
    expect(moveStep(r, 'right')).toBeNull(); // kệ R1
    expect(isWalkable(2, 5)).toBe(false);
  });

  it('không di chuyển khi chưa bắt đầu', () => {
    expect(moveStep(createRun(), 'up')).toBeNull();
  });

  it('tổng quãng đường = số bước, đếm quay đầu', () => {
    let r = startRun(createRun(), 0);
    r = moveStep(r, 'up')!;
    r = moveStep(r, 'up')!;
    r = moveStep(r, 'down')!;
    r = moveStep(r, 'right')!;
    expect(r.distance).toBe(4);
    expect(r.path).toHaveLength(5);
    expect(r.turnarounds).toBe(1);
    expect(isValidPath(r.path)).toBe(true);
  });
});

describe('Nhặt hàng & hoàn thành', () => {
  const order = DEFAULT_ORDER;
  const layout = initialLayout();

  it('cập nhật đúng số lượng, không vượt yêu cầu', () => {
    let r = startRun(createRun(), 0);
    r = go(r, accessCells('R5-02')[0]);
    let res = pickAt(r, order, layout, 'R5-02', 1);
    expect(res.outcome).toBe('ok');
    r = res.run;
    res = pickAt(r, order, layout, 'R5-02', 99);
    expect(res.amount).toBe(2);
    r = res.run;
    expect(r.picked[layout['R5-02']]).toBe(3);
    expect(pickAt(r, order, layout, 'R5-02', 1).outcome).toBe('full');
  });

  it('nhặt hàng không thuộc đơn = nhặt sai; không nhặt được khi không đứng cạnh', () => {
    let r = startRun(createRun(), 0);
    expect(pickAt(r, order, layout, 'R1-01').outcome).toBe('not-adjacent');
    r = go(r, accessCells('R1-02')[0]);
    const res = pickAt(r, order, layout, 'R1-02');
    expect(res.outcome).toBe('wrong');
    expect(res.run.wrongPicks).toBe(1);
  });

  it('không thể hoàn thành khi còn thiếu hàng', () => {
    let r = startRun(createRun(), 0);
    r = go(r, accessCells('R1-01')[0]);
    r = pickAt(r, order, layout, 'R1-01').run;
    r = go(r, { x: 10, y: 11 });
    expect(isPacking(r.pos)).toBe(true);
    expect(isOrderComplete(r, order)).toBe(false);
    expect(canFinish(r, order)).toBe(false);
    expect(finishRun(r, order, 1000).status).toBe('running');
  });

  it('hoàn thành đơn đầy đủ và tính kết quả', () => {
    let r = startRun(createRun(), 0);
    for (const slot of orderSlots(order, layout)) {
      r = go(r, accessCells(slot)[0]);
      r = pickAt(r, order, layout, slot, 99).run;
    }
    r = go(r, { x: 10, y: 11 });
    expect(canFinish(r, order)).toBe(true);
    r = finishRun(r, order, 60_000);
    expect(r.status).toBe('finished');
    const result = buildResult('before', r, order, layout);
    expect(result.distance).toBe(r.path.length - 1);
    expect(result.correctLines).toBe(order.lines.length);
    expect(result.distance).toBeGreaterThanOrEqual(result.optimalDistance);
    expect(result.timeSec).toBe(60);
  });
});

describe('Tuyến tối ưu', () => {
  it('không đi xuyên chướng ngại, bắt đầu ở Start, kết thúc ở đóng gói', () => {
    for (const o of SAMPLE_ORDERS) {
      const route = solveRoute(targetsForSlots(orderSlots(o, ORIGINAL_LAYOUT)));
      expect(route.exact).toBe(true);
      expect(isValidPath(route.path)).toBe(true);
      expect(route.path[0]).toEqual(START);
      expect(isPacking(route.path[route.path.length - 1])).toBe(true);
      expect(route.path.length - 1).toBe(route.distance);
      // đi qua ô lấy hàng của mọi SKU
      for (const slot of orderSlots(o, ORIGINAL_LAYOUT)) {
        const acc = accessCells(slot);
        expect(route.path.some((c) => acc.some((a) => a.x === c.x && a.y === c.y))).toBe(true);
      }
    }
  });

  it('Held–Karp khớp với vét cạn mọi hoán vị', () => {
    const rng = seededRng(7);
    for (let t = 0; t < 15; t++) {
      const o = generateRandomOrder(rng, 3, 5);
      const slots = orderSlots(o, ORIGINAL_LAYOUT);
      const hk = solveRoute(targetsForSlots(slots), { withPath: false }).distance;
      expect(hk).toBe(bruteForce(slots));
    }
  });

  it('đơn > 8 SKU được đánh dấu là ước lượng', () => {
    const slots = SLOT_IDS.slice(0, 10);
    const r = solveRoute(targetsForSlots(slots));
    expect(r.exact).toBe(false);
    expect(isValidPath(r.path)).toBe(true);
  });
});

function bruteForce(slots: string[]): number {
  const acc = slots.map(accessCells);
  let best = Infinity;
  const perm = (rest: number[], pos: Cell, cost: number) => {
    if (cost >= best) return;
    if (!rest.length) {
      const toPack = Math.min(...[{ x: 9, y: 11 }, { x: 9, y: 12 }, { x: 10, y: 11 }].map((p) => gridDistance(pos, p)));
      best = Math.min(best, cost + toPack);
      return;
    }
    for (const i of rest) for (const c of acc[i]) perm(rest.filter((x) => x !== i), c, cost + gridDistance(pos, c));
  };
  perm(slots.map((_, i) => i), START, 0);
  return best;
}

describe('Bố trí & đơn hàng', () => {
  it('hoán đổi SKU không làm mất hoặc nhân đôi mặt hàng', () => {
    let l = initialLayout();
    const rng = seededRng(42);
    for (let i = 0; i < 500; i++) {
      const a = SLOT_IDS[Math.floor(rng() * 40)];
      const b = SLOT_IDS[Math.floor(rng() * 40)];
      l = swapSlots(l, a, b);
      expect(validateLayout(l)).toBe(true);
    }
    const a = initialLayout();
    const b = swapSlots(a, 'R1-01', 'R5-08');
    expect(b['R1-01']).toBe(a['R5-08']);
    expect(b['R5-08']).toBe(a['R1-01']);
    expect(a['R1-01']).toBe(ORIGINAL_LAYOUT['R1-01']); // bất biến
  });

  it('đơn ngẫu nhiên: 3–8 SKU khác nhau, số lượng 1–7', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 300; i++) {
      const o = generateRandomOrder(rng);
      expect(o.lines.length).toBeGreaterThanOrEqual(3);
      expect(o.lines.length).toBeLessThanOrEqual(8);
      expect(new Set(o.lines.map((l) => l.productId)).size).toBe(o.lines.length);
      for (const l of o.lines) expect(l.qty >= 1 && l.qty <= 7).toBe(true);
    }
  });

  it('gộp dòng trùng SKU bằng cộng dồn', () => {
    expect(mergeLines([{ productId: 'P01', qty: 2 }, { productId: 'P01', qty: 3 }, { productId: 'P02', qty: 1 }])).toEqual([
      { productId: 'P01', qty: 5 },
      { productId: 'P02', qty: 1 },
    ]);
  });

  it('kết quả trước và sau độc lập (layout được sao chép)', () => {
    const order: Order = DEFAULT_ORDER;
    const layout = initialLayout();
    const r = { ...startRun(createRun(), 0), status: 'finished' as const };
    const before = buildResult('before', r, order, layout);
    const changed = swapSlots(swapSlots(layout, 'R1-01', 'R1-08'), 'R5-02', 'R5-08');
    const after = buildResult('after', r, order, changed);
    expect(before.layout['R1-01']).toBe(ORIGINAL_LAYOUT['R1-01']);
    expect(after.layout['R1-01']).toBe(ORIGINAL_LAYOUT['R1-08']);
    expect(after.optimalDistance).toBeLessThan(before.optimalDistance);
  });

  it('điểm số theo công thức', () => {
    const s = computeScore({ playerDistance: 60, optimalDistance: 50, timeSec: 40, wrongPicks: 1, lines: 4 });
    expect(s.routePenalty).toBe(10);
    expect(s.refTimeSec).toBe(37);
    expect(s.timePenalty).toBe(1);
    expect(s.wrongPenalty).toBe(5);
    expect(s.total).toBe(84);
  });
});
