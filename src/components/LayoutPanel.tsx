import { useMemo, type ReactNode } from 'react';
import type { Demand, Layout, Order } from '../core/types';
import {
  ORIGINAL_LAYOUT,
  ZONE_INFO,
  averageOptimalDistance,
  changedSlots,
  groupSpread,
  orderSlots,
  weightedAccessIndex,
  zoneDemandMatrix,
  type Zone,
} from '../core/layout';
import { evaluationOrders } from '../core/orders';
import { routeDistance } from '../core/routing';
import { reductionPct } from '../core/results';
import { DEMAND_INFO } from '../data/products';
import { DEMAND_COLORS } from './WarehouseMap';
import { changeLabel, fmtNum } from './format';

interface Props {
  layout: Layout;
  order: Order;
  colorMode: 'demand' | 'group';
  onColorMode: (m: 'demand' | 'group') => void;
  selectedSlot: string | null;
  onUndo: () => void;
  canUndo: boolean;
  onReset: () => void;
  onContinue?: () => void;
  footer?: ReactNode;
}

export interface LayoutMetrics {
  access: number;
  spread: number;
  avgOptimal: number;
  orderOptimal: number;
}

export function computeLayoutMetrics(layout: Layout, order: Order): LayoutMetrics {
  return {
    access: weightedAccessIndex(layout),
    spread: groupSpread(layout).average,
    avgOptimal: averageOptimalDistance(layout, evaluationOrders()),
    orderOptimal: routeDistance(orderSlots(order, layout)),
  };
}

let originalCache: { orderId: string; m: LayoutMetrics } | null = null;
export function originalMetrics(order: Order): LayoutMetrics {
  if (originalCache?.orderId !== order.id) originalCache = { orderId: order.id, m: computeLayoutMetrics(ORIGINAL_LAYOUT, order) };
  return originalCache.m;
}

export function LayoutPanel(p: Props) {
  const before = originalMetrics(p.order);
  const now = useMemo(() => computeLayoutMetrics(p.layout, p.order), [p.layout, p.order]);
  const zones = useMemo(() => zoneDemandMatrix(p.layout), [p.layout]);
  const zonesBefore = useMemo(() => zoneDemandMatrix(ORIGINAL_LAYOUT), []);
  const changed = changedSlots(p.layout).length;

  return (
    <div className="panel-stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Giai đoạn 2 · Tối ưu bố trí kho</h2>
            <p className="muted">Chỉ thay đổi vị trí SKU giữa 40 ô — kho, dãy kệ, lối đi và các khu chức năng giữ nguyên.</p>
          </div>
        </div>
        <ul className="howto">
          <li>
            <b>Kéo thả</b> một ô kệ sang ô khác để <b>hoán đổi</b> hai sản phẩm (hoặc nhấp ô thứ nhất rồi ô thứ hai).
          </li>
          <li>Đưa hàng nhu cầu cao về gần hành lang dưới — gần Start và khu đóng gói.</li>
          <li>Đặt hàng hay mua cùng nhau gần nhau (bật chế độ màu “Nhóm sản phẩm”). Hai kệ đối diện qua một lối đi có chung ô đứng lấy hàng.</li>
        </ul>
        {p.selectedSlot && <div className="callout info small">Đã chọn ô <b>{p.selectedSlot}</b> — nhấp ô khác để hoán đổi, nhấp lại để bỏ chọn.</div>}
        <div className="row-actions">
          <div className="seg">
            <button className={p.colorMode === 'demand' ? 'active' : ''} onClick={() => p.onColorMode('demand')}>
              Màu theo nhu cầu
            </button>
            <button className={p.colorMode === 'group' ? 'active' : ''} onClick={() => p.onColorMode('group')}>
              Nhóm sản phẩm
            </button>
          </div>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={p.onUndo} disabled={!p.canUndo}>
            ↶ Hoàn tác
          </button>
          <button className="btn danger-outline" onClick={p.onReset} disabled={changed === 0}>
            Khôi phục bố trí ban đầu
          </button>
        </div>
        <p className="muted small">{changed} / 40 ô đã thay đổi so với ban đầu.</p>
      </section>

      <section className="card">
        <h3>Phân bổ nhu cầu theo vùng</h3>
        <table className="zone-table">
          <thead>
            <tr>
              <th>Vùng</th>
              {(['C', 'TB', 'T'] as Demand[]).map((d) => (
                <th key={d} className="num">
                  <span className="dot" style={{ background: DEMAND_COLORS[d].dot }} />
                  {DEMAND_INFO[d].short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['near', 'mid', 'far'] as Zone[]).map((z) => (
              <tr key={z}>
                <td>
                  <b>{ZONE_INFO[z].label}</b>
                  <div className="muted small">{ZONE_INFO[z].desc}</div>
                </td>
                {(['C', 'TB', 'T'] as Demand[]).map((d) => {
                  const diff = zones[z][d] - zonesBefore[z][d];
                  return (
                    <td key={d} className="num">
                      <b>{zones[z][d]}</b>
                      {diff !== 0 && <span className={`delta ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? `+${diff}` : diff}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="total-row">
              <td>Tổng</td>
              <td className="num">12</td>
              <td className="num">16</td>
              <td className="num">12</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Chỉ số bố trí (ban đầu → hiện tại)</h3>
        <MetricRow
          label="QĐ tối ưu – đơn đang chơi"
          hint="Tuyến ngắn nhất lý thuyết cho đúng đơn hàng ở Giai đoạn 1"
          a={before.orderOptimal}
          b={now.orderOptimal}
          unit="m"
        />
        <MetricRow
          label="QĐ tối ưu TB – 200 đơn ngẫu nhiên"
          hint="Cùng một bộ 200 đơn (seed cố định) cho mọi bố trí — tránh tối ưu “học tủ” một đơn"
          a={before.avgOptimal}
          b={now.avgOptimal}
          unit="m"
          digits={1}
        />
        <MetricRow
          label="Chỉ số tiếp cận theo nhu cầu"
          hint="Trung bình có trọng số (6/3/1) của chuyến Start → ô → Đóng gói"
          a={before.access}
          b={now.access}
          unit="m"
          digits={1}
        />
        <MetricRow
          label="Độ phân tán nhóm hàng"
          hint="Khoảng cách đi bộ trung bình giữa các SKU cùng nhóm"
          a={before.spread}
          b={now.spread}
          unit="m"
          digits={1}
        />
      </section>

      {p.onContinue && (
        <button className="btn primary lg block" onClick={p.onContinue}>
          Tiếp tục: Picking lại trên bố trí mới →
        </button>
      )}
      {p.footer}
    </div>
  );
}

function MetricRow({ label, hint, a, b, unit, digits = 0 }: { label: string; hint: string; a: number; b: number; unit: string; digits?: number }) {
  const c = changeLabel(reductionPct(a, b));
  return (
    <div className="metric-row" title={hint}>
      <div>
        <div className="metric-label">{label}</div>
        <div className="muted small">{hint}</div>
      </div>
      <div className="metric-vals">
        <span className="muted">
          {fmtNum(a, digits)} → <b className="metric-now">{fmtNum(b, digits)}</b> {unit}
        </span>
        <span className={`tag ${c.tone}`}>{c.text}</span>
      </div>
    </div>
  );
}
