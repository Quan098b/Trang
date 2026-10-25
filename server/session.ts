import { randomBytes } from 'node:crypto';
import type { Layout, Order, ResultKey, RunResult } from '../src/core/types';
import { ORIGINAL_LAYOUT, initialLayout, orderSlots, validateLayout } from '../src/core/layout';
import { DEFAULT_ORDER, isValidOrder } from '../src/core/orders';
import { isValidPath } from '../src/core/pathfinding';
import { solveRoute, targetsForSlots } from '../src/core/routing';
import { computeScore } from '../src/core/scoring';
import { START, isPacking } from '../src/core/warehouse';
import {
  COUNTDOWN_MS,
  STAGES,
  roundKey,
  summarize,
  type Stage,
  type TeamProgress,
  type TeamView,
  type WorkshopView,
} from '../src/shared/workshop';

export interface TeamRecord {
  id: string;
  token: string;
  name: string;
  joinedAt: number;
  progress: Partial<Record<ResultKey, TeamProgress>>;
  results: Partial<Record<ResultKey, RunResult>>;
  layout: Layout;
}

export interface StoreData {
  gameId: number;
  stage: Stage;
  stageStartedAt: number | null;
  order: Order;
  teams: TeamRecord[];
}

export type Outcome<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const fail = (error: string): Outcome<never> => ({ ok: false, error });

const MAX_TEAMS = 40;
const ROUND_STAGE: Record<ResultKey, Stage> = { before: 'round1', after: 'round2' };

export function emptyData(): StoreData {
  return { gameId: 1, stage: 'lobby', stageStartedAt: null, order: DEFAULT_ORDER, teams: [] };
}

const newId = (bytes: number) => randomBytes(bytes).toString('hex');
const normName = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Trạng thái ván chơi nhiều đội; mọi thay đổi đi qua các phương thức này. */
export class WorkshopStore {
  data: StoreData;

  constructor(data?: StoreData | null) {
    this.data = data && isValidOrder(data.order) && STAGES.includes(data.stage) && Array.isArray(data.teams) ? data : emptyData();
  }

  auth(teamId: unknown, token: unknown): TeamRecord | null {
    return this.data.teams.find((t) => t.id === teamId && t.token === token) ?? null;
  }

  join(rawName: unknown): Outcome<TeamRecord> {
    if (typeof rawName !== 'string') return fail('Thiếu tên đội.');
    const name = normName(rawName);
    if (name.length < 1 || name.length > 30) return fail('Tên đội dài 1–30 ký tự.');
    if (this.data.teams.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      return fail('Tên đội đã có người dùng — hãy chọn tên khác.');
    if (this.data.teams.length >= MAX_TEAMS) return fail('Phòng đã đủ đội.');
    const team: TeamRecord = { id: newId(6), token: newId(16), name, joinedAt: Date.now(), progress: {}, results: {}, layout: initialLayout() };
    this.data.teams.push(team);
    return ok(team);
  }

  progress(team: TeamRecord, key: ResultKey, p: TeamProgress): Outcome {
    if (roundKey(this.data.stage) !== key) return fail('Vòng chơi này không còn diễn ra.');
    if (team.results[key]) return fail('Đội đã hoàn thành vòng này.');
    team.progress[key] = {
      status: p.status,
      distance: Math.max(0, Math.floor(Number(p.distance) || 0)),
      units: Math.max(0, Math.floor(Number(p.units) || 0)),
      elapsedMs: Math.max(0, Number(p.elapsedMs) || 0),
      wrongPicks: Math.max(0, Math.floor(Number(p.wrongPicks) || 0)),
      pos: { x: Math.floor(Number(p.pos?.x) || 0), y: Math.floor(Number(p.pos?.y) || 0) },
    };
    return ok(undefined);
  }

  /**
   * Nhận kết quả từ đội. Máy chủ kiểm tra lại tuyến đi (liền mạch, không xuyên kệ,
   * từ Start tới khu đóng gói) và TỰ TÍNH LẠI quãng đường tối ưu cùng điểm số.
   */
  submitResult(team: TeamRecord, key: ResultKey, r: RunResult): Outcome<RunResult> {
    const stageIdx = STAGES.indexOf(this.data.stage);
    if (stageIdx < STAGES.indexOf(ROUND_STAGE[key])) return fail('Vòng này chưa bắt đầu.');
    if (team.results[key]) return ok(team.results[key]!);
    if (!r || !Array.isArray(r.playerPath) || r.playerPath.length < 2) return fail('Kết quả không hợp lệ.');
    const path = r.playerPath.map((c) => ({ x: Number(c.x), y: Number(c.y) }));
    if (!isValidPath(path) || path[0].x !== START.x || path[0].y !== START.y || !isPacking(path[path.length - 1]))
      return fail('Tuyến đường không hợp lệ.');
    const layout = key === 'before' ? { ...ORIGINAL_LAYOUT } : r.layout;
    if (!validateLayout(layout)) return fail('Bố trí kho không hợp lệ.');
    if (key === 'after') team.layout = layout;

    const order = this.data.order;
    const route = solveRoute(targetsForSlots(orderSlots(order, layout)));
    const timeSec = Math.max(0, Number(r.timeSec) || 0);
    const wrongPicks = Math.max(0, Math.floor(Number(r.wrongPicks) || 0));
    const distance = path.length - 1;
    const result: RunResult = {
      key,
      orderId: order.id,
      orderName: order.name,
      layout,
      distance,
      timeSec,
      optimalDistance: route.distance,
      optimalExact: route.exact,
      optimalSequence: route.stops.map((s) => s.slot),
      optimalPath: route.path,
      playerPath: path,
      correctLines: Math.min(order.lines.length, Math.max(0, Math.floor(Number(r.correctLines) || 0))),
      totalLines: order.lines.length,
      unitsPicked: Math.max(0, Math.floor(Number(r.unitsPicked) || 0)),
      wrongPicks,
      turnarounds: Math.max(0, Math.floor(Number(r.turnarounds) || 0)),
      score: computeScore({ playerDistance: distance, optimalDistance: route.distance, timeSec, wrongPicks, lines: order.lines.length }),
      finishedAt: new Date().toISOString(),
    };
    team.results[key] = result;
    delete team.progress[key];
    return ok(result);
  }

  setLayout(team: TeamRecord, layout: unknown): Outcome {
    if (this.data.stage !== 'layout') return fail('Chỉ chỉnh bố trí trong giai đoạn tối ưu.');
    if (!validateLayout(layout)) return fail('Bố trí kho không hợp lệ.');
    team.layout = { ...layout };
    return ok(undefined);
  }

  /* ---------- Quản trò ---------- */

  setOrder(order: unknown): Outcome {
    if (this.data.stage !== 'lobby') return fail('Chỉ đổi đơn hàng khi đang ở phòng chờ.');
    if (!isValidOrder(order)) return fail('Đơn hàng không hợp lệ.');
    this.data.order = order;
    return ok(undefined);
  }

  /** Chuyển sang bước kế tiếp (không cho nhảy cóc hoặc quay lui). */
  setStage(stage: unknown, now = Date.now()): Outcome {
    const cur = STAGES.indexOf(this.data.stage);
    const next = STAGES.indexOf(stage as Stage);
    if (next !== cur + 1) return fail('Chỉ có thể chuyển sang bước kế tiếp.');
    if (stage === 'round1' && this.data.teams.length === 0) return fail('Chưa có đội nào tham gia.');
    this.data.stage = stage as Stage;
    this.data.stageStartedAt = roundKey(stage as Stage) ? now + COUNTDOWN_MS : null;
    return ok(undefined);
  }

  reset(keepTeams: boolean): void {
    const teams = keepTeams
      ? this.data.teams.map((t) => ({ ...t, progress: {}, results: {}, layout: initialLayout() }))
      : [];
    this.data = { ...emptyData(), gameId: this.data.gameId + 1, order: this.data.order, teams };
  }

  kick(teamId: unknown): Outcome {
    const before = this.data.teams.length;
    this.data.teams = this.data.teams.filter((t) => t.id !== teamId);
    return this.data.teams.length < before ? ok(undefined) : fail('Không tìm thấy đội.');
  }

  /** Ảnh chụp trạng thái gửi cho client. Đội KHÔNG thấy đáp án tối ưu/điểm của vòng đang chơi. */
  view(role: 'admin' | 'team', online: Set<string>, joinUrls: string[], now = Date.now()): WorkshopView {
    const active = roundKey(this.data.stage);
    const teams: TeamView[] = this.data.teams.map((t) => {
      const results: TeamView['results'] = {};
      for (const k of ['before', 'after'] as ResultKey[]) {
        const r = t.results[k];
        if (r) results[k] = summarize(r, role === 'team' && active === k);
      }
      return {
        id: t.id,
        name: t.name,
        online: online.has(t.id),
        joinedAt: t.joinedAt,
        progress: t.progress,
        results,
        ...(role === 'admin' ? { layout: t.layout } : {}),
      };
    });
    return {
      role,
      gameId: this.data.gameId,
      stage: this.data.stage,
      stageStartedAt: this.data.stageStartedAt,
      order: this.data.order,
      teams,
      joinUrls,
      serverNow: now,
    };
  }
}
