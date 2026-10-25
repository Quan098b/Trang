import type { ScoreBreakdown } from './types';

/**
 * CÔNG THỨC CHẤM ĐIỂM (điểm khởi đầu 100) — chỉ đánh giá KỸ NĂNG ĐI TUYẾN trên
 * chính bố trí kho của lượt đó, nên không trộn lẫn với hiệu quả của việc đổi layout:
 *
 *  1. Phạt quãng đường: 50 × (QĐ người chơi / QĐ tối ưu − 1), tối đa 50 điểm.
 *  2. Phạt thời gian: thời gian chuẩn = 0,5 s/m × QĐ tối ưu + 3 s × số SKU;
 *     cứ chậm hơn chuẩn 3 giây trừ 1 điểm, tối đa 20 điểm.
 *  3. Phạt nhặt sai: 5 điểm mỗi lần nhặt sản phẩm không có trong đơn, tối đa 20 điểm.
 *  Điểm tối thiểu là 0. Chỉ chấm khi đơn đã lấy đủ và mang về khu đóng gói.
 */
export const SCORE_RULES = {
  routeWeight: 50,
  routeMax: 50,
  secPerMeter: 0.5,
  secPerLine: 3,
  secPerTimePoint: 3,
  timeMax: 20,
  wrongEach: 5,
  wrongMax: 20,
};

export function gradeOf(score: number): string {
  if (score >= 90) return 'Xuất sắc';
  if (score >= 75) return 'Tốt';
  if (score >= 60) return 'Đạt';
  return 'Cần cải thiện';
}

export function computeScore(input: {
  playerDistance: number;
  optimalDistance: number;
  timeSec: number;
  wrongPicks: number;
  lines: number;
}): ScoreBreakdown {
  const R = SCORE_RULES;
  const ratio = input.optimalDistance > 0 ? input.playerDistance / input.optimalDistance : 1;
  const routePenalty = Math.min(R.routeMax, Math.max(0, Math.round(R.routeWeight * (ratio - 1))));
  const refTimeSec = Math.ceil(R.secPerMeter * input.optimalDistance + R.secPerLine * input.lines);
  const over = Math.max(0, input.timeSec - refTimeSec);
  const timePenalty = Math.min(R.timeMax, Math.floor(over / R.secPerTimePoint));
  const wrongPenalty = Math.min(R.wrongMax, R.wrongEach * input.wrongPicks);
  const total = Math.max(0, 100 - routePenalty - timePenalty - wrongPenalty);
  return { total, routePenalty, timePenalty, wrongPenalty, ratio, refTimeSec, grade: gradeOf(total) };
}
