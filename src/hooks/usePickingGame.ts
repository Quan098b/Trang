import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cell, Layout, Order, SlotId } from '../core/types';
import {
  createRun,
  elapsed,
  finishRun,
  isOrderComplete,
  moveStep,
  moveToAdjacent,
  pauseRun,
  pickAt,
  remainingQty,
  startRun,
  canFinish,
  type Dir,
  type RunState,
} from '../core/engine';
import { bfsFrom, cellIndex, pathBetween } from '../core/pathfinding';
import { accessCells, adjacentSlots, isPacking, isWalkable, sameCell } from '../core/warehouse';
import { PRODUCT_BY_ID } from '../data/products';

export type Tone = 'info' | 'ok' | 'warn' | 'error';
export interface GameMessage {
  id: number;
  text: string;
  tone: Tone;
}

const STEP_INTERVAL_MS = 85;
const WALK_INTERVAL_MS = 75;

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

interface Options {
  order: Order;
  layout: Layout;
  active: boolean;
  resetKey: string;
  onFinish: (run: RunState) => void;
  /** Lưu lượt chơi vào localStorage để tải lại trang không làm mất/đặt lại lượt */
  persistKey?: string | null;
  /** Chế độ thi đấu nhiều đội không cho tạm dừng */
  allowPause?: boolean;
  /** Thông báo khi người chơi bấm phím lúc lượt chưa bắt đầu */
  readyHint?: string;
}

function loadRun(key: string): RunState | null {
  try {
    const r = JSON.parse(localStorage.getItem(key) ?? 'null') as RunState | null;
    return r && Array.isArray(r.path) && r.pos && typeof r.distance === 'number' ? r : null;
  } catch {
    return null;
  }
}

export function usePickingGame(opts: Options) {
  const [run, setRun] = useState<RunState>(createRun);
  const runRef = useRef(run);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const walkQueue = useRef<Cell[]>([]);
  const [walking, setWalking] = useState(false);
  const lastStepAt = useRef(0);
  const [message, setMessage] = useState<GameMessage | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const commit = useCallback((next: RunState) => {
    runRef.current = next;
    setRun(next);
    const key = optsRef.current.persistKey;
    if (key) {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
    }
  }, []);

  const flash = useCallback((text: string, tone: Tone = 'info') => {
    setMessage({ id: Date.now() + Math.random(), text, tone });
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(t);
  }, [message]);

  const stopWalking = useCallback(() => {
    walkQueue.current = [];
    setWalking(false);
  }, []);

  // Đổi pha / đổi đơn → tạo lượt mới
  useEffect(() => {
    stopWalking();
    const key = optsRef.current.persistKey;
    commit((key && loadRun(key)) || createRun());
    setMessage(null);
  }, [opts.resetKey, commit, stopWalking]);

  // Đồng hồ
  useEffect(() => {
    if (run.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [run.status]);

  /** Xử lý sau mỗi bước: kiểm tra đến khu đóng gói. */
  const applyMove = useCallback(
    (prev: RunState, next: RunState) => {
      const { order } = optsRef.current;
      if (isPacking(next.pos)) {
        if (canFinish(next, order)) {
          const done = finishRun(next, order, Date.now());
          commit(done);
          stopWalking();
          flash('Hoàn thành đơn hàng! 🎉', 'ok');
          optsRef.current.onFinish(done);
          return;
        }
        if (!isPacking(prev.pos)) flash('Chưa lấy đủ hàng — chưa thể đóng gói đơn này.', 'warn');
      }
      commit(next);
    },
    [commit, flash, stopWalking],
  );

  /** Nhắc người chơi khi lượt chưa chạy; trả về true nếu đang chạy. */
  const ensureRunning = useCallback(() => {
    const s = runRef.current.status;
    if (s === 'ready') flash(optsRef.current.readyHint ?? 'Nhấn “Bắt đầu” để tính giờ và di chuyển.', 'info');
    else if (s === 'paused') flash('Đang tạm dừng — nhấn “Tiếp tục”.', 'info');
    return s === 'running';
  }, [flash]);

  const step = useCallback(
    (dir: Dir) => {
      if (!ensureRunning()) return;
      const cur = runRef.current;
      const next = moveStep(cur, dir);
      if (next) applyMove(cur, next);
    },
    [applyMove, ensureRunning],
  );

  // Tự đi theo đường ngắn nhất khi nhấp chuột vào điểm đến
  useEffect(() => {
    if (!walking) return;
    const t = setInterval(() => {
      const cur = runRef.current;
      const nextCell = walkQueue.current.shift();
      if (!nextCell || cur.status !== 'running') {
        stopWalking();
        return;
      }
      const next = moveToAdjacent(cur, nextCell);
      if (!next) {
        stopWalking();
        return;
      }
      applyMove(cur, next);
      if (!walkQueue.current.length) setWalking(false);
    }, WALK_INTERVAL_MS);
    return () => clearInterval(t);
  }, [walking, applyMove, stopWalking]);

  const walkTo = useCallback(
    (target: Cell) => {
      if (!ensureRunning()) return;
      const cur = runRef.current;
      if (!isWalkable(target.x, target.y) || sameCell(cur.pos, target)) return;
      const path = pathBetween(cur.pos, target);
      if (!path) return;
      walkQueue.current = path.slice(1);
      setWalking(true);
    },
    [ensureRunning],
  );

  /** Nhấp vào ô kệ → đi tới ô lối đi gần nhất cạnh kệ đó. */
  const walkToSlot = useCallback(
    (slot: SlotId) => {
      if (!ensureRunning()) return;
      const dist = bfsFrom(runRef.current.pos).dist;
      const best = accessCells(slot).sort((a, b) => dist[cellIndex(a)] - dist[cellIndex(b)])[0];
      if (best) walkTo(best);
    },
    [walkTo, ensureRunning],
  );

  const pick = useCallback(
    (slot: SlotId, qty = 1) => {
      const { order, layout } = optsRef.current;
      const cur = runRef.current;
      const res = pickAt(cur, order, layout, slot, qty);
      const name = PRODUCT_BY_ID[layout[slot]]?.name ?? slot;
      switch (res.outcome) {
        case 'ok': {
          commit(res.run);
          const left = remainingQty(res.run, order, layout[slot]);
          if (isOrderComplete(res.run, order)) flash('Đã lấy đủ hàng! Mang đến khu ĐÓNG GÓI để hoàn tất.', 'ok');
          else flash(`+${res.amount} ${name}${left ? ` (còn ${left})` : ' ✓ đủ'}`, 'ok');
          break;
        }
        case 'wrong':
          commit(res.run);
          flash(`Nhặt sai: “${name}” không có trong đơn hàng (−5 điểm).`, 'error');
          break;
        case 'full':
          flash(`Đã lấy đủ ${name}.`, 'info');
          break;
        case 'not-adjacent':
          flash('Phải đứng ở ô lối đi sát kệ mới nhặt được.', 'warn');
          break;
        case 'not-running':
          flash('Nhấn “Bắt đầu” trước khi nhặt hàng.', 'info');
          break;
      }
    },
    [commit, flash],
  );

  const start = useCallback(() => {
    const cur = runRef.current;
    if (cur.status === 'finished') return;
    commit(startRun(cur, Date.now()));
    setNow(Date.now());
  }, [commit]);

  const pause = useCallback(() => {
    stopWalking();
    commit(pauseRun(runRef.current, Date.now()));
  }, [commit, stopWalking]);

  const reset = useCallback(() => {
    stopWalking();
    commit(createRun());
  }, [commit, stopWalking]);

  // Bàn phím: WASD / mũi tên để đi; Space / E / Enter để nhặt 1 đơn vị; P để tạm dừng
  useEffect(() => {
    if (!opts.active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEY_DIR[e.key] ?? KEY_DIR[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        stopWalking();
        const t = performance.now();
        // Giữ phím (lặp tự động) bị giới hạn tốc độ; mỗi lần nhấn riêng lẻ luôn được tính
        if (e.repeat && t - lastStepAt.current < STEP_INTERVAL_MS) return;
        lastStepAt.current = t;
        step(dir);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'e' || k === 'enter') {
        if (el && el.tagName === 'BUTTON' && k !== 'e') return;
        e.preventDefault();
        const cur = runRef.current;
        const { order, layout } = optsRef.current;
        const slot = adjacentSlots(cur.pos).find((s) => remainingQty(cur, order, layout[s]) > 0);
        if (slot) pick(slot, 1);
        else if (cur.status === 'running') flash('Không có hàng cần lấy ở kệ cạnh bạn.', 'info');
      } else if (k === 'p' && optsRef.current.allowPause !== false) {
        const cur = runRef.current;
        if (cur.status === 'running') pause();
        else if (cur.status === 'paused' || cur.status === 'ready') start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.active, step, pick, pause, start, stopWalking, flash]);

  return {
    run,
    elapsedMs: elapsed(run, now),
    walking,
    message,
    adjacent: adjacentSlots(run.pos),
    start,
    pause,
    reset,
    step,
    walkTo,
    walkToSlot,
    pick,
    flash,
  };
}
