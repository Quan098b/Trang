import type { ReactNode } from 'react';
import type { Layout, Order, RunResult, SlotId } from '../core/types';
import type { RunState } from '../core/engine';
import { isOrderComplete, remainingQty, unitsPicked } from '../core/engine';
import { slotOfProduct } from '../core/layout';
import { DEMAND_INFO, PRODUCT_BY_ID } from '../data/products';
import type { GameMessage } from '../hooks/usePickingGame';
import { DEMAND_COLORS } from './WarehouseMap';
import { fmtNum, fmtTime } from './format';

interface Props {
  title: string;
  subtitle: string;
  order: Order;
  layout: Layout;
  run: RunState;
  elapsedMs: number;
  adjacent: SlotId[];
  message: GameMessage | null;
  highlight: string | null;
  onHighlight: (pid: string | null) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onPick: (slot: SlotId, qty: number) => void;
  previous: RunResult | null;
  onShowPrevious: () => void;
  orderSetup?: ReactNode;
  /** Chế độ thi đấu: quản trò bắt đầu, không có tạm dừng / chơi lại */
  competitive?: boolean;
}

export function PickingPanel(p: Props) {
  const { order, layout, run } = p;
  const inv = slotOfProduct(layout);
  const totalUnits = order.lines.reduce((a, l) => a + l.qty, 0);
  const complete = isOrderComplete(run, order);
  const linesDone = order.lines.filter((l) => remainingQty(run, order, l.productId) === 0).length;

  return (
    <div className="panel-stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{p.title}</h2>
            <p className="muted">{p.subtitle}</p>
          </div>
          <StatusPill status={run.status} />
        </div>

        <div className="stats-grid">
          <Stat label="Thời gian" value={fmtTime(p.elapsedMs)} big />
          <Stat label="Quãng đường" value={`${fmtNum(run.distance)} m`} big />
          <Stat label="Đã nhặt" value={`${unitsPicked(run)}/${totalUnits}`} sub={`${linesDone}/${order.lines.length} SKU đủ`} />
          <Stat label="Nhặt sai" value={String(run.wrongPicks)} warn={run.wrongPicks > 0} />
          <Stat label="Quay đầu" value={String(run.turnarounds)} />
        </div>

        {!p.competitive && <div className="controls">
          {run.status === 'ready' && (
            <button className="btn primary lg" onClick={p.onStart}>
              ▶ Bắt đầu
            </button>
          )}
          {run.status === 'running' && (
            <button className="btn warn lg" onClick={p.onPause}>
              ❚❚ Tạm dừng
            </button>
          )}
          {run.status === 'paused' && (
            <button className="btn primary lg" onClick={p.onStart}>
              ▶ Tiếp tục
            </button>
          )}
          <button className="btn lg" onClick={p.onReset} disabled={run.status === 'ready'}>
            ↺ Chơi lại
          </button>
        </div>}
        {run.status === 'ready' && (
          <p className="hint">
            {p.competitive && <b>Chờ quản trò bấm bắt đầu… </b>}
            Điều khiển: <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> / phím mũi tên · <kbd>Space</kbd> nhặt 1 · {!p.competitive && <><kbd>P</kbd> tạm dừng · </>}hoặc nhấp chuột vào lối đi/kệ để tự đi đường
            ngắn nhất tới đó.
          </p>
        )}
        {p.message && (
          <div key={p.message.id} className={`toast tone-${p.message.tone}`}>
            {p.message.text}
          </div>
        )}
      </section>

      {run.status !== 'finished' && (
        <AdjacentPick {...p} />
      )}

      {complete && run.status === 'running' && (
        <div className="callout ok">📦 Đã lấy đủ hàng — đi đến khu <b>SOẠN ĐƠN / ĐÓNG GÓI</b> (góc dưới bên phải) để hoàn tất.</div>
      )}

      <section className="card">
        <div className="card-head">
          <div>
            <h3>Phiếu lấy hàng</h3>
            <p className="muted">
              {order.name} · {order.difficulty}
            </p>
          </div>
        </div>
        <table className="order-table">
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Vị trí</th>
              <th className="num">Đã lấy</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => {
              const prod = PRODUCT_BY_ID[l.productId];
              const got = run.picked[l.productId] ?? 0;
              const done = got >= l.qty;
              return (
                <tr
                  key={l.productId}
                  className={`${done ? 'done' : ''} ${p.highlight === l.productId ? 'hl' : ''}`}
                  onClick={() => p.onHighlight(p.highlight === l.productId ? null : l.productId)}
                  title="Nhấp để làm nổi bật vị trí trên sơ đồ"
                >
                  <td>
                    <span className="dot" style={{ background: DEMAND_COLORS[prod.demand].dot }} title={DEMAND_INFO[prod.demand].label} />
                    {prod.icon} {prod.name}
                  </td>
                  <td>
                    <code>{inv[l.productId]}</code>
                  </td>
                  <td className="num">
                    <div className="qty-cell">
                      <span>
                        {got}/{l.qty}
                      </span>
                      <div className="mini-bar">
                        <div style={{ width: `${(got / l.qty) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.orderSetup}
      </section>

      {p.previous && run.status === 'ready' && (
        <div className="callout info">
          Đã có kết quả lượt này: <b>{fmtNum(p.previous.distance)} m</b> · {fmtNum(p.previous.timeSec, 1)} s · {p.previous.score.total} điểm.{' '}
          <button className="link" onClick={p.onShowPrevious}>
            Xem lại
          </button>
          <br />
          <span className="muted">Chơi lại sẽ ghi đè kết quả này.</span>
        </div>
      )}
    </div>
  );
}

function AdjacentPick(p: Props) {
  const { order, layout, run } = p;
  if (run.status !== 'running' || p.adjacent.length === 0) return null;
  return (
    <section className="card adjacent-card">
      <h3>Kệ cạnh bạn</h3>
      {p.adjacent.map((slot) => {
        const prod = PRODUCT_BY_ID[layout[slot]];
        const inOrder = order.lines.some((l) => l.productId === prod.id);
        const left = remainingQty(run, order, prod.id);
        return (
          <div key={slot} className={`adj-row ${inOrder && left > 0 ? 'wanted' : ''}`}>
            <div className="adj-info">
              <code>{slot}</code>
              <span>
                {prod.icon} {prod.name}
              </span>
              {inOrder ? (
                left > 0 ? (
                  <span className="tag good">Cần thêm {left}</span>
                ) : (
                  <span className="tag">Đã đủ</span>
                )
              ) : (
                <span className="tag muted">Không có trong đơn</span>
              )}
            </div>
            <div className="adj-actions">
              {inOrder ? (
                <>
                  <button className="btn primary" disabled={left === 0} onClick={() => p.onPick(slot, 1)}>
                    Nhặt hàng (+1)
                  </button>
                  <button className="btn" disabled={left <= 1} onClick={() => p.onPick(slot, left)}>
                    Nhặt đủ ({left})
                  </button>
                </>
              ) : (
                <button className="btn ghost danger" onClick={() => p.onPick(slot, 1)} title="Nhặt nhầm sẽ bị trừ điểm">
                  Nhặt
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function StatusPill({ status }: { status: RunState['status'] }) {
  const map = {
    ready: ['Sẵn sàng', 'neutral'],
    running: ['Đang chạy', 'running'],
    paused: ['Tạm dừng', 'paused'],
    finished: ['Hoàn thành', 'done'],
  } as const;
  const [label, tone] = map[status];
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function Stat({ label, value, sub, big, warn }: { label: string; value: string; sub?: string; big?: boolean; warn?: boolean }) {
  return (
    <div className={`stat ${big ? 'big' : ''} ${warn ? 'warn' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
