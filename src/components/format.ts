export function fmtTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export const fmtNum = (n: number, digits = 0) =>
  n.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Mô tả thay đổi: dương = giảm (tốt). */
export function changeLabel(pct: number): { text: string; tone: 'good' | 'bad' | 'neutral' } {
  if (Math.abs(pct) < 0.05) return { text: 'Không đổi', tone: 'neutral' };
  return pct > 0
    ? { text: `Giảm ${fmtNum(pct, 1)}%`, tone: 'good' }
    : { text: `Tăng ${fmtNum(-pct, 1)}%`, tone: 'bad' };
}
