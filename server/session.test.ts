import { describe, expect, it } from 'vitest';
import { WorkshopStore } from './session';
import { createRun, finishRun, moveStep, pickAt, startRun, type Dir, type RunState } from '../src/core/engine';
import { ORIGINAL_LAYOUT, initialLayout, orderSlots, swapSlots } from '../src/core/layout';
import { DEFAULT_ORDER } from '../src/core/orders';
import { pathBetween } from '../src/core/pathfinding';
import { buildResult } from '../src/core/results';
import { accessCells } from '../src/core/warehouse';
import type { Cell, Layout } from '../src/core/types';

function playOrder(layout: Layout): RunState {
  const go = (r: RunState, to: Cell) => {
    const p = pathBetween(r.pos, to)!;
    for (let i = 1; i < p.length; i++) {
      const dx = p[i].x - p[i - 1].x;
      const dy = p[i].y - p[i - 1].y;
      r = moveStep(r, (dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up') as Dir)!;
    }
    return r;
  };
  let r = startRun(createRun(), 0);
  for (const s of orderSlots(DEFAULT_ORDER, layout)) {
    r = go(r, accessCells(s)[0]);
    r = pickAt(r, DEFAULT_ORDER, layout, s, 99).run;
  }
  r = go(r, { x: 10, y: 11 });
  return finishRun(r, DEFAULT_ORDER, 50_000);
}

const store = () => new WorkshopStore(null);

describe('Phòng chơi nhiều đội', () => {
  it('tham gia: tên hợp lệ, không trùng (không phân biệt hoa thường)', () => {
    const s = store();
    expect(s.join('  Đội  A ').ok).toBe(true);
    expect(s.join('đội a').ok).toBe(false);
    expect(s.join('').ok).toBe(false);
    expect(s.data.teams[0].name).toBe('Đội A');
  });

  it('chỉ chuyển sang bước kế tiếp, cần ít nhất một đội để bắt đầu', () => {
    const s = store();
    expect(s.setStage('round1').ok).toBe(false);
    s.join('A');
    expect(s.setStage('layout').ok).toBe(false);
    expect(s.setStage('round1', 1000).ok).toBe(true);
    expect(s.data.stageStartedAt).toBe(4000); // đếm ngược 3 s
    expect(s.setOrder(DEFAULT_ORDER).ok).toBe(false); // khóa đơn sau khi bắt đầu
  });

  it('đội không thấy đáp án tối ưu của vòng đang chơi; quản trò thì thấy', () => {
    const s = store();
    const team = (s.join('A') as { value: { id: string } & Parameters<WorkshopStore['submitResult']>[0] }).value;
    s.setStage('round1');
    const run = playOrder(ORIGINAL_LAYOUT);
    expect(s.submitResult(team, 'before', buildResult('before', run, DEFAULT_ORDER, ORIGINAL_LAYOUT)).ok).toBe(true);
    const tv = s.view('team', new Set(), []).teams[0].results.before!;
    const av = s.view('admin', new Set(), []).teams[0].results.before!;
    expect(tv.optimalDistance).toBeNull();
    expect(tv.score).toBeNull();
    expect(av.optimalDistance).toBe(29);
    s.setStage('layout');
    expect(s.view('team', new Set(), []).teams[0].results.before!.optimalDistance).toBe(29);
    expect(s.view('team', new Set(), []).teams[0].layout).toBeUndefined();
  });

  it('máy chủ từ chối tuyến không hợp lệ và tự tính lại điểm', () => {
    const s = store();
    const team = (s.join('A') as { value: Parameters<WorkshopStore['submitResult']>[0] }).value;
    s.setStage('round1');
    const good = buildResult('before', playOrder(ORIGINAL_LAYOUT), DEFAULT_ORDER, ORIGINAL_LAYOUT);
    const teleport = { ...good, playerPath: [good.playerPath[0], { x: 10, y: 11 }] };
    expect(s.submitResult(team, 'before', teleport).ok).toBe(false);
    const cheat = { ...good, optimalDistance: 999, score: { ...good.score, total: 100 }, distance: 1 };
    const r = s.submitResult(team, 'before', cheat);
    expect(r.ok && r.value.distance).toBe(good.playerPath.length - 1);
    expect(r.ok && r.value.optimalDistance).toBe(29);
    expect(r.ok && r.value.score.total).toBe(good.score.total);
  });

  it('vòng 2 dùng bố trí của đội; chỉ chỉnh bố trí trong giai đoạn tối ưu', () => {
    const s = store();
    const team = (s.join('A') as { value: Parameters<WorkshopStore['submitResult']>[0] }).value;
    const layout = swapSlots(swapSlots(initialLayout(), 'R1-01', 'R1-08'), 'R5-02', 'R5-08');
    expect(s.setLayout(team, layout).ok).toBe(false);
    s.setStage('round1');
    s.setStage('layout');
    expect(s.setLayout(team, { ...layout, 'R1-02': layout['R1-01'] }).ok).toBe(false); // trùng SKU
    expect(s.setLayout(team, layout).ok).toBe(true);
    s.setStage('round2');
    const r = s.submitResult(team, 'after', buildResult('after', playOrder(layout), DEFAULT_ORDER, layout));
    expect(r.ok && r.value.optimalDistance).toBe(25);
  });

  it('ván mới giữ đội nhưng xóa kết quả', () => {
    const s = store();
    s.join('A');
    s.setStage('round1');
    s.reset(true);
    expect(s.data.stage).toBe('lobby');
    expect(s.data.gameId).toBe(2);
    expect(s.data.teams).toHaveLength(1);
    s.reset(false);
    expect(s.data.teams).toHaveLength(0);
  });
});
