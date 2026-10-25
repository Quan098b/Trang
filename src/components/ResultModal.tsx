import type { RunResult } from '../core/types';
import { reductionPct } from '../core/results';
import { PRODUCT_BY_ID } from '../data/products';
import { ScoringInfo } from './ScoringInfo';
import { fmtNum } from './format';

interface Props {
  result: RunResult;
  onClose: () => void;
  primary?: { label: string; onClick: () => void };
}

export function ResultModal({ result: r, onClose, primary }: Props) {
  const gap = r.distance - r.optimalDistance;
  const saving = reductionPct(r.distance, r.optimalDistance);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <div className="eyebrow">{r.key === 'before' ? 'Giai đoạn 1 · Bố trí ban đầu' : 'Giai đoạn 3 · Bố trí sau tối ưu'}</div>
            <h2>Hoàn thành đơn hàng!</h2>
            <p className="muted">{r.orderName}</p>
          </div>
          <div className={`score-ring grade-${r.score.grade.replace(/\s/g, '')}`}>
            <span className="score-num">{r.score.total}</span>
            <span className="score-grade">{r.score.grade}</span>
          </div>
        </div>

        <div className="result-grid">
          <Kpi label="Quãng đường của bạn" value={`${fmtNum(r.distance)} m`} tone="player" />
          <Kpi
            label={r.optimalExact ? 'Quãng đường tối ưu' : 'Quãng đường tham chiếu (ước lượng)'}
            value={`${fmtNum(r.optimalDistance)} m`}
            tone="optimal"
          />
          <Kpi label="Chênh lệch" value={`${gap > 0 ? '+' : ''}${fmtNum(gap)} m`} sub={`Hiệu suất tuyến ${fmtNum((r.optimalDistance / Math.max(1, r.distance)) * 100)}%`} />
          <Kpi label="Tiết kiệm nếu đi tối ưu" value={`${fmtNum(saving, 1)}%`} />
          <Kpi label="Thời gian" value={`${fmtNum(r.timeSec, 1)} s`} sub={`Chuẩn ${r.score.refTimeSec} s`} />
          <Kpi label="SKU lấy đúng" value={`${r.correctLines}/${r.totalLines}`} sub={`${r.unitsPicked} đơn vị`} />
          <Kpi label="Nhặt sai" value={String(r.wrongPicks)} />
          <Kpi label="Số lần quay đầu" value={String(r.turnarounds)} />
        </div>

        <div className="callout info">
          <b>Thứ tự lấy hàng tối ưu{r.optimalExact ? '' : ' (ước lượng)'}:</b> START →{' '}
          {r.optimalSequence.map((s) => `${s} (${PRODUCT_BY_ID[r.layout[s]].name})`).join(' → ')} → ĐÓNG GÓI
          <div className="muted small">
            {r.optimalExact
              ? 'Tính bằng BFS trên lưới lối đi + quy hoạch động Held–Karp — tối ưu chính xác. Tuyến cam nét đứt trên sơ đồ.'
              : 'Đơn có hơn 8 SKU: dùng láng giềng gần nhất + 2-opt, KHÔNG đảm bảo tối ưu tuyệt đối.'}
          </div>
        </div>

        <div className="breakdown">
          <div className="bd-row">
            <span>Điểm khởi đầu</span>
            <b>100</b>
          </div>
          <div className="bd-row">
            <span>Phạt quãng đường (tỷ lệ {fmtNum(r.score.ratio, 2)}× tối ưu)</span>
            <b className="neg">−{r.score.routePenalty}</b>
          </div>
          <div className="bd-row">
            <span>Phạt thời gian (vượt chuẩn {Math.max(0, Math.round(r.timeSec - r.score.refTimeSec))} s)</span>
            <b className="neg">−{r.score.timePenalty}</b>
          </div>
          <div className="bd-row">
            <span>Phạt nhặt sai ({r.wrongPicks} lần)</span>
            <b className="neg">−{r.score.wrongPenalty}</b>
          </div>
          <div className="bd-row total">
            <span>Tổng điểm</span>
            <b>{r.score.total}</b>
          </div>
        </div>
        <ScoringInfo />

        <div className="modal-actions">
          <button className="btn lg" onClick={onClose}>
            Xem tuyến trên sơ đồ
          </button>
          {primary && (
            <button className="btn primary lg" onClick={primary.onClick}>
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'player' | 'optimal' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
