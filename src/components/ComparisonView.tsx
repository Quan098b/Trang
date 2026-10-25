import { useMemo, useState } from 'react';
import type { Layout, Order, RunResult } from '../core/types';
import { SLOT_IDS } from '../core/warehouse';
import { reductionPct } from '../core/results';
import { computeLayoutMetrics } from './LayoutPanel';
import { WarehouseMap } from './WarehouseMap';
import { changeLabel, fmtNum } from './format';

interface Props {
  before: RunResult;
  after: RunResult;
  order: Order;
  currentLayout: Layout;
  onReplayAfter?: () => void;
  onEditLayout?: () => void;
  onRestartAll?: () => void;
  title?: string;
}

export function ComparisonView({ before, after, order, currentLayout, onReplayAfter, onEditLayout, onRestartAll, title }: Props) {
  const [showOptimal, setShowOptimal] = useState(true);
  const mBefore = useMemo(() => computeLayoutMetrics(before.layout, order), [before, order]);
  const mAfter = useMemo(() => computeLayoutMetrics(after.layout, order), [after, order]);
  const stale = SLOT_IDS.some((s) => currentLayout[s] !== after.layout[s]);

  const rows: { label: string; a: string; b: string; pct?: number; lowerIsBetter?: boolean }[] = [
    { label: 'Quãng đường người chơi', a: `${fmtNum(before.distance)} m`, b: `${fmtNum(after.distance)} m`, pct: reductionPct(before.distance, after.distance) },
    { label: 'Thời gian hoàn thành', a: `${fmtNum(before.timeSec, 1)} giây`, b: `${fmtNum(after.timeSec, 1)} giây`, pct: reductionPct(before.timeSec, after.timeSec) },
    {
      label: 'Quãng đường tối ưu lý thuyết',
      a: `${fmtNum(before.optimalDistance)} m${before.optimalExact ? '' : ' (ước lượng)'}`,
      b: `${fmtNum(after.optimalDistance)} m${after.optimalExact ? '' : ' (ước lượng)'}`,
      pct: reductionPct(before.optimalDistance, after.optimalDistance),
    },
    {
      label: 'Chênh lệch so với tối ưu',
      a: `${fmtNum(before.distance - before.optimalDistance)} m`,
      b: `${fmtNum(after.distance - after.optimalDistance)} m`,
    },
    { label: 'Số SKU lấy đúng', a: `${before.correctLines}/${before.totalLines}`, b: `${after.correctLines}/${after.totalLines}` },
    { label: 'Số lần nhặt sai', a: String(before.wrongPicks), b: String(after.wrongPicks) },
    { label: 'Số lần quay đầu', a: String(before.turnarounds), b: String(after.turnarounds) },
    { label: 'Điểm kỹ năng đi tuyến', a: `${before.score.total} (${before.score.grade})`, b: `${after.score.total} (${after.score.grade})` },
  ];

  const routeGapBefore = reductionPct(before.distance, before.optimalDistance);
  const routeGapAfter = reductionPct(after.distance, after.optimalDistance);
  const layoutOrderPct = reductionPct(before.optimalDistance, after.optimalDistance);
  const layoutAvgPct = reductionPct(mBefore.avgOptimal, mAfter.avgOptimal);
  const playerPct = reductionPct(before.distance, after.distance);

  let verdict: { tone: 'good' | 'warn' | 'bad'; text: string };
  if (layoutAvgPct >= 1 && layoutOrderPct >= 0)
    verdict = {
      tone: 'good',
      text: `Bố trí mới hiệu quả hơn về mặt lý thuyết: quãng đường tối ưu giảm ${fmtNum(layoutOrderPct, 1)}% cho đơn thử nghiệm và ${fmtNum(layoutAvgPct, 1)}% trung bình trên 200 đơn ngẫu nhiên.`,
    };
  else if (layoutOrderPct > 0 && layoutAvgPct < 1)
    verdict = {
      tone: 'warn',
      text: `Bố trí mới chỉ giúp đơn thử nghiệm (−${fmtNum(layoutOrderPct, 1)}%) nhưng gần như không cải thiện cho 200 đơn ngẫu nhiên (${changeLabel(layoutAvgPct).text.toLowerCase()}). Có thể đang “tối ưu theo một đơn”.`,
    };
  else
    verdict = {
      tone: 'bad',
      text: `Bố trí mới chưa giảm quãng đường tối ưu lý thuyết (${changeLabel(layoutOrderPct).text.toLowerCase()} cho đơn thử nghiệm, ${changeLabel(layoutAvgPct).text.toLowerCase()} trên 200 đơn).`,
    };

  return (
    <div className="compare">
      <div className="compare-head">
        <div>
          <div className="eyebrow">Kết quả workshop</div>
          <h2>{title ?? 'So sánh trước và sau tối ưu'}</h2>
          <p className="muted">
            Đơn hàng: <b>{order.name}</b> — cùng điểm Start và cùng khu đóng gói ở cả hai lượt.
          </p>
        </div>
        <div className="row-actions">
          {onEditLayout && (
            <button className="btn" onClick={onEditLayout}>
              Chỉnh lại bố trí
            </button>
          )}
          {onReplayAfter && (
            <button className="btn" onClick={onReplayAfter}>
              Chơi lại Giai đoạn 3
            </button>
          )}
          {onRestartAll && (
            <button className="btn danger-outline" onClick={onRestartAll}>
              Bắt đầu workshop mới
            </button>
          )}
        </div>
      </div>
      {stale && (
        <div className="callout warn">Bố trí hiện tại đã thay đổi sau lượt picking lại. Bảng dưới đây dùng bố trí tại thời điểm chơi Giai đoạn 3.</div>
      )}

      <div className="compare-grid">
        <section className="card">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Chỉ tiêu</th>
                <th className="num">Trước tối ưu</th>
                <th className="num">Sau tối ưu</th>
                <th className="num">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = r.pct !== undefined ? changeLabel(r.pct) : null;
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">{r.a}</td>
                    <td className="num">
                      <b>{r.b}</b>
                    </td>
                    <td className="num">{c && <span className={`tag ${c.tone}`}>{c.text}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="insight-col">
          <section className="card insight route">
            <div className="insight-num">1</div>
            <h3>Tối ưu tuyến đường picking</h3>
            <p className="muted small">Thay đổi thứ tự / đường đi khi bố trí không đổi. Đo bằng khoảng cách giữa tuyến bạn đi và tuyến tối ưu trên cùng bố trí.</p>
            <div className="insight-rows">
              <div>
                <span>Trước tối ưu</span>
                <b>
                  {fmtNum(before.distance)} m vs {fmtNum(before.optimalDistance)} m
                </b>
                <span className="muted small">có thể tiết kiệm {fmtNum(routeGapBefore, 1)}%</span>
              </div>
              <div>
                <span>Sau tối ưu</span>
                <b>
                  {fmtNum(after.distance)} m vs {fmtNum(after.optimalDistance)} m
                </b>
                <span className="muted small">có thể tiết kiệm {fmtNum(routeGapAfter, 1)}%</span>
              </div>
            </div>
          </section>

          <section className="card insight layout">
            <div className="insight-num">2</div>
            <h3>Tối ưu vị trí lưu trữ</h3>
            <p className="muted small">Thay đổi cách phân bổ SKU. Đo bằng quãng đường tối ưu lý thuyết — không phụ thuộc người chơi đi khéo hay vụng.</p>
            <div className="insight-rows">
              <div>
                <span>QĐ tối ưu – đơn thử nghiệm</span>
                <b>
                  {fmtNum(before.optimalDistance)} → {fmtNum(after.optimalDistance)} m
                </b>
                <Tag pct={layoutOrderPct} />
              </div>
              <div>
                <span>QĐ tối ưu TB – 200 đơn ngẫu nhiên</span>
                <b>
                  {fmtNum(mBefore.avgOptimal, 1)} → {fmtNum(mAfter.avgOptimal, 1)} m
                </b>
                <Tag pct={layoutAvgPct} />
              </div>
              <div>
                <span>Chỉ số tiếp cận theo nhu cầu</span>
                <b>
                  {fmtNum(mBefore.access, 1)} → {fmtNum(mAfter.access, 1)} m
                </b>
                <Tag pct={reductionPct(mBefore.access, mAfter.access)} />
              </div>
              <div>
                <span>Độ phân tán nhóm hàng</span>
                <b>
                  {fmtNum(mBefore.spread, 1)} → {fmtNum(mAfter.spread, 1)} m
                </b>
                <Tag pct={reductionPct(mBefore.spread, mAfter.spread)} />
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className={`callout verdict ${verdict.tone}`}>
        <b>Kết luận về bố trí:</b> {verdict.text}
        <div className="small">
          Quãng đường người chơi {changeLabel(playerPct).text.toLowerCase()}, thời gian hoàn thành{' '}
          {changeLabel(reductionPct(before.timeSec, after.timeSec)).text.toLowerCase()} — nhưng kết quả này còn chịu ảnh hưởng của việc người chơi đã quen đơn hàng ở lượt hai và kỹ năng chọn tuyến — nên <b>không</b> được dùng làm bằng chứng
          duy nhất cho thấy bố trí mới tốt hơn.
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>Tuyến đường trên hai bố trí</h3>
          <label className="check">
            <input type="checkbox" checked={showOptimal} onChange={(e) => setShowOptimal(e.target.checked)} /> Hiện tuyến tối ưu
          </label>
        </div>
        <div className="mini-maps">
          {[before, after].map((r) => (
            <div key={r.key} className="mini">
              <div className="mini-title">
                {r.key === 'before' ? 'Trước tối ưu (bố trí ban đầu)' : 'Sau tối ưu (bố trí mới)'} — bạn {fmtNum(r.distance)} m · tối ưu{' '}
                {fmtNum(r.optimalDistance)} m
              </div>
              <WarehouseMap
                layout={r.layout}
                mode="view"
                zoom={0.5}
                playerPath={r.playerPath}
                optimalPath={r.optimalPath}
                showOptimalPath={showOptimal}
                optimalStops={showOptimal ? r.optimalSequence : undefined}
                orderQty={Object.fromEntries(order.lines.map((l) => [l.productId, { need: l.qty, got: l.qty }]))}
                showChanges={r.key === 'after'}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Tag({ pct }: { pct: number }) {
  const c = changeLabel(pct);
  return <span className={`tag ${c.tone}`}>{c.text}</span>;
}
