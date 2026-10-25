import { useState } from 'react';
import type { Order, OrderLine } from '../core/types';
import { MAX_QTY, SAMPLE_ORDERS, generateRandomOrder, mergeLines } from '../core/orders';
import { EXACT_LIMIT } from '../core/routing';
import { DEMAND_INFO, PRODUCTS, PRODUCT_BY_ID } from '../data/products';

interface Props {
  current: Order;
  onApply: (o: Order) => void;
  onClose: () => void;
}

type Tab = 'sample' | 'random' | 'custom';
const MAX_CUSTOM_LINES = 12;

export function OrderSetup({ current, onApply, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('sample');
  const [random, setRandom] = useState<Order>(() => generateRandomOrder());
  const [lines, setLines] = useState<OrderLine[]>(() => (current.difficulty === 'Tùy chỉnh' ? current.lines : []));
  const [pid, setPid] = useState(PRODUCTS[0].id);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('Đơn của giáo viên');

  const addLine = () => {
    const q = Math.max(1, Math.min(99, Math.floor(qty) || 1));
    setLines((ls) => mergeLines([...ls, { productId: pid, qty: q }]));
  };

  return (
    <div className="order-setup">
      <div className="tabs">
        {(
          [
            ['sample', 'Đơn mẫu'],
            ['random', 'Ngẫu nhiên'],
            ['custom', 'Tự tạo'],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
        <button className="tab close" onClick={onClose} title="Đóng">
          ✕
        </button>
      </div>

      {tab === 'sample' && (
        <div className="sample-list">
          {SAMPLE_ORDERS.map((o) => (
            <button key={o.id} className={`sample ${current.id === o.id ? 'active' : ''}`} onClick={() => onApply(o)}>
              <span className={`diff diff-${o.difficulty.replace(/\s/g, '')}`}>{o.difficulty}</span>
              <b>{o.name}</b>
              <span className="muted">
                {o.lines.length} SKU · {o.lines.reduce((a, l) => a + l.qty, 0)} đơn vị
              </span>
              <span className="sample-items">{o.lines.map((l) => `${PRODUCT_BY_ID[l.productId].name} ×${l.qty}`).join(', ')}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'random' && (
        <div>
          <p className="muted small">
            3–8 SKU khác nhau, mỗi SKU 1–{MAX_QTY} đơn vị. Xác suất xuất hiện theo trọng số giả định: Cao = {DEMAND_INFO.C.weight}, Trung bình ={' '}
            {DEMAND_INFO.TB.weight}, Thấp = {DEMAND_INFO.T.weight} (không phải dữ liệu bán hàng thực tế).
          </p>
          <ul className="line-list">
            {random.lines.map((l) => (
              <li key={l.productId}>
                <span>
                  {PRODUCT_BY_ID[l.productId].icon} {PRODUCT_BY_ID[l.productId].name}{' '}
                  <span className="muted">({DEMAND_INFO[PRODUCT_BY_ID[l.productId].demand].short})</span>
                </span>
                <b>×{l.qty}</b>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button className="btn" onClick={() => setRandom(generateRandomOrder())}>
              🎲 Tạo đơn khác
            </button>
            <button className="btn primary" onClick={() => onApply(random)}>
              Dùng đơn này
            </button>
          </div>
        </div>
      )}

      {tab === 'custom' && (
        <div>
          <label className="field">
            <span>Tên đơn</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </label>
          <div className="custom-add">
            <select value={pid} onChange={(e) => setPid(e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({DEMAND_INFO[p.demand].short})
                </option>
              ))}
            </select>
            <input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            <button className="btn" onClick={addLine} disabled={lines.length >= MAX_CUSTOM_LINES && !lines.some((l) => l.productId === pid)}>
              + Thêm
            </button>
          </div>
          {lines.length === 0 ? (
            <p className="muted small">Chưa có sản phẩm. Thêm trùng sản phẩm sẽ được cộng dồn số lượng.</p>
          ) : (
            <ul className="line-list">
              {lines.map((l) => (
                <li key={l.productId}>
                  <span>
                    {PRODUCT_BY_ID[l.productId].icon} {PRODUCT_BY_ID[l.productId].name}
                  </span>
                  <span>
                    <b>×{l.qty}</b>{' '}
                    <button className="link danger" onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}>
                      xóa
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {lines.length > EXACT_LIMIT && (
            <p className="callout warn small">
              Đơn có hơn {EXACT_LIMIT} SKU: tuyến tham chiếu sẽ tính bằng thuật toán gần đúng và được ghi rõ là “ước lượng”.
            </p>
          )}
          <div className="row-actions">
            <button
              className="btn primary"
              disabled={lines.length === 0}
              onClick={() =>
                onApply({ id: `custom-${Date.now().toString(36)}`, name: name.trim() || 'Đơn tùy chỉnh', difficulty: 'Tùy chỉnh', lines })
              }
            >
              Áp dụng đơn ({lines.length} SKU)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
