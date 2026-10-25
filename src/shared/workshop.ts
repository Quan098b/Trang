import type { Cell, Layout, Order, ResultKey, RunResult } from '../core/types';
import type { RunStatus } from '../core/engine';

/** Các bước của một ván chơi nhiều đội do quản trò điều khiển. */
export type Stage = 'lobby' | 'round1' | 'layout' | 'round2' | 'ended';

export const STAGES: Stage[] = ['lobby', 'round1', 'layout', 'round2', 'ended'];

export const STAGE_INFO: Record<Stage, { label: string; desc: string }> = {
  lobby: { label: 'Phòng chờ', desc: 'Các đội nhập tên để tham gia' },
  round1: { label: 'Vòng 1 · Picking', desc: 'Bố trí ban đầu' },
  layout: { label: 'Tối ưu bố trí', desc: 'Các đội sắp xếp lại kho' },
  round2: { label: 'Vòng 2 · Picking lại', desc: 'Trên bố trí của từng đội' },
  ended: { label: 'Tổng kết', desc: 'Bảng xếp hạng' },
};

export const roundKey = (s: Stage): ResultKey | null => (s === 'round1' ? 'before' : s === 'round2' ? 'after' : null);

/** Thời gian đếm ngược trước khi một vòng bắt đầu (ms). */
export const COUNTDOWN_MS = 3000;

export interface TeamProgress {
  status: RunStatus;
  distance: number;
  units: number;
  elapsedMs: number;
  wrongPicks: number;
  pos: Cell;
}

export interface ResultSummary {
  distance: number;
  timeSec: number;
  /** null = đang ẩn với các đội cho tới khi vòng kết thúc */
  optimalDistance: number | null;
  optimalExact: boolean;
  score: number | null;
  grade: string | null;
  wrongPicks: number;
  correctLines: number;
  totalLines: number;
  turnarounds: number;
  finishedAt: string;
}

export interface TeamView {
  id: string;
  name: string;
  online: boolean;
  joinedAt: number;
  progress: Partial<Record<ResultKey, TeamProgress>>;
  results: Partial<Record<ResultKey, ResultSummary>>;
  /** Chỉ gửi cho quản trò */
  layout?: Layout;
}

export interface WorkshopView {
  role: 'admin' | 'team';
  gameId: number;
  stage: Stage;
  /** Mốc thời gian (giờ máy chủ) vòng hiện tại bắt đầu, sau đếm ngược */
  stageStartedAt: number | null;
  order: Order;
  teams: TeamView[];
  joinUrls: string[];
  serverNow: number;
}

export function summarize(r: RunResult, hideAnswer: boolean): ResultSummary {
  return {
    distance: r.distance,
    timeSec: r.timeSec,
    optimalDistance: hideAnswer ? null : r.optimalDistance,
    optimalExact: r.optimalExact,
    score: hideAnswer ? null : r.score.total,
    grade: hideAnswer ? null : r.score.grade,
    wrongPicks: r.wrongPicks,
    correctLines: r.correctLines,
    totalLines: r.totalLines,
    turnarounds: r.turnarounds,
    finishedAt: r.finishedAt,
  };
}
