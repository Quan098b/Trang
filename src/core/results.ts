import type { Layout, Order, ResultKey, RunResult } from './types';
import type { RunState } from './engine';
import { correctLines, unitsPicked } from './engine';
import { orderSlots } from './layout';
import { solveRoute, targetsForSlots } from './routing';
import { computeScore } from './scoring';

export function buildResult(key: ResultKey, run: RunState, order: Order, layout: Layout): RunResult {
  const route = solveRoute(targetsForSlots(orderSlots(order, layout)));
  const timeSec = Math.round(run.elapsedMs / 100) / 10;
  return {
    key,
    orderId: order.id,
    orderName: order.name,
    layout: { ...layout },
    distance: run.distance,
    timeSec,
    optimalDistance: route.distance,
    optimalExact: route.exact,
    optimalSequence: route.stops.map((s) => s.slot),
    optimalPath: route.path,
    playerPath: run.path,
    correctLines: correctLines(run, order),
    totalLines: order.lines.length,
    unitsPicked: unitsPicked(run),
    wrongPicks: run.wrongPicks,
    turnarounds: run.turnarounds,
    score: computeScore({
      playerDistance: run.distance,
      optimalDistance: route.distance,
      timeSec,
      wrongPicks: run.wrongPicks,
      lines: order.lines.length,
    }),
    finishedAt: new Date().toISOString(),
  };
}

/** % giảm từ a xuống b (dương = giảm). */
export function reductionPct(a: number, b: number): number {
  return a > 0 ? ((a - b) / a) * 100 : 0;
}
