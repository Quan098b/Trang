import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Cell, Demand, Layout, SlotId } from '../core/types';
import { DEMAND_INFO, GROUP_INFO, PRODUCT_BY_ID } from '../data/products';
import {
  GRID_H,
  GRID_W,
  PACKING_CELLS,
  RACK_COUNT,
  RACK_IDS,
  RECEIVING_CELLS,
  SHIPPING_CELLS,
  SHELF_TOP_Y,
  SLOTS_PER_RACK,
  SLOT_IDS,
  START,
  cellType,
  isWalkable,
  rackX,
  slotCell,
} from '../core/warehouse';
import { ORIGINAL_LAYOUT } from '../core/layout';

/* ---------- Hình học: cột kệ rộng để hiện tên SKU, lối đi hẹp hơn ---------- */
const WALL = 18;
const SHELF_W = 132;
const AISLE_W = 60;
const ROW_H = 54;
const SHIP_H = 58;

const colW = (x: number) => (x === 0 || x === GRID_W - 1 ? WALL : cellType(x, SHELF_TOP_Y) === 'shelf' ? SHELF_W : AISLE_W);
const rowH = (y: number) => (y === 0 ? WALL : y === GRID_H - 1 ? SHIP_H : ROW_H);
const COL_X: number[] = [0];
for (let x = 0; x < GRID_W; x++) COL_X.push(COL_X[x] + colW(x));
const ROW_Y: number[] = [0];
for (let y = 0; y < GRID_H; y++) ROW_Y.push(ROW_Y[y] + rowH(y));
export const MAP_W = COL_X[GRID_W];
export const MAP_H = ROW_Y[GRID_H];

const cx = (c: Cell) => COL_X[c.x] + colW(c.x) / 2;
const cy = (c: Cell) => ROW_Y[c.y] + rowH(c.y) / 2;

function rectOf(cells: Cell[]) {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { x: COL_X[x0], y: ROW_Y[y0], w: COL_X[x1 + 1] - COL_X[x0], h: ROW_Y[y1 + 1] - ROW_Y[y0] };
}

export const DEMAND_COLORS: Record<Demand, { fill: string; stroke: string; dot: string; badge: string }> = {
  C: { fill: '#fde2e2', stroke: '#f2a5a5', dot: '#e5484d', badge: '#b42318' },
  TB: { fill: '#fff1c7', stroke: '#f0cf6a', dot: '#e6a700', badge: '#a15c00' },
  T: { fill: '#dcf5e3', stroke: '#93d6a8', dot: '#2fa35a', badge: '#1d6b3a' },
};

function wrapName(name: string, max = 15): string[] {
  const words = name.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

const pointsOf = (path: Cell[]) => path.map((c) => `${cx(c)},${cy(c)}`).join(' ');

export interface WarehouseMapProps {
  layout: Layout;
  mode: 'play' | 'edit' | 'view';
  zoom: number;
  worker?: Cell | null;
  playerPath?: Cell[];
  optimalPath?: Cell[];
  showPlayerPath?: boolean;
  showOptimalPath?: boolean;
  /** productId → số lượng cần lấy / đã lấy */
  orderQty?: Record<string, { need: number; got: number }>;
  highlightProductId?: string | null;
  adjacentSlots?: SlotId[];
  colorMode?: 'demand' | 'group';
  focusDemand?: Demand | null;
  selectedSlot?: SlotId | null;
  showChanges?: boolean;
  optimalStops?: SlotId[];
  /** Vị trí trực tiếp của các đội (màn hình quản trò) */
  markers?: { id: string; cell: Cell; label: string; color: string; done?: boolean }[];
  onCellClick?: (c: Cell) => void;
  onSlotClick?: (s: SlotId) => void;
  onSwap?: (a: SlotId, b: SlotId) => void;
}

export function WarehouseMap(props: WarehouseMapProps) {
  const {
    layout,
    mode,
    zoom,
    worker,
    playerPath,
    optimalPath,
    showPlayerPath = true,
    showOptimalPath = true,
    orderQty,
    highlightProductId,
    adjacentSlots = [],
    colorMode = 'demand',
    focusDemand = null,
    selectedSlot,
    showChanges,
    optimalStops,
  } = props;

  const [hover, setHover] = useState<{ slot: SlotId; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ from: SlotId; over: SlotId | null; x: number; y: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const propsRef = useRef(props);
  propsRef.current = props;

  // Kéo thả bằng Pointer Events (hoạt động cả chuột và cảm ứng)
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]');
      const over = el?.getAttribute('data-slot') ?? null;
      setDrag((d) => (d ? { ...d, over, x: e.clientX, y: e.clientY, moved: d.moved || over !== d.from } : d));
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      // Lấy ô đích theo vị trí thả thực tế (trạng thái `over` có thể chưa kịp cập nhật khi thả nhanh)
      const el = e.type === 'pointerup' ? document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]') : null;
      const over = el?.getAttribute('data-slot') ?? (e.type === 'pointerup' ? null : d.over);
      const p = propsRef.current;
      if (over && over !== d.from) p.onSwap?.(d.from, over);
      else if (!d.moved && over === d.from) p.onSlotClick?.(d.from);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [drag !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSlotPointerDown = (slot: SlotId, e: RPointerEvent) => {
    if (mode !== 'edit') return;
    e.preventDefault();
    setHover(null);
    setDrag({ from: slot, over: slot, x: e.clientX, y: e.clientY, moved: false });
  };

  const stopNumbers = useMemo(() => {
    const m: Record<string, number> = {};
    optimalStops?.forEach((s, i) => {
      if (!(s in m)) m[s] = i + 1;
    });
    return m;
  }, [optimalStops]);

  const walkCells = useMemo(() => {
    const out: Cell[] = [];
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (isWalkable(x, y)) out.push({ x, y });
    return out;
  }, []);

  const rec = rectOf(RECEIVING_CELLS);
  const pack = rectOf(PACKING_CELLS);
  const ship = rectOf(SHIPPING_CELLS);
  const floor = { x: COL_X[1], y: ROW_Y[1], w: COL_X[GRID_W - 1] - COL_X[1], h: ROW_Y[GRID_H - 1] - ROW_Y[1] };
  const hoverProduct = hover ? PRODUCT_BY_ID[layout[hover.slot]] : null;
  const dragProduct = drag && drag.moved ? PRODUCT_BY_ID[layout[drag.from]] : null;

  return (
    <div className={`map-wrap mode-${mode}`}>
      <svg
        className="warehouse-svg"
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        width={MAP_W * zoom}
        height={MAP_H * zoom}
        role="img"
        aria-label="Sơ đồ kho chữ U"
      >
        <defs>
          <pattern id="aisle-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#dbe5f1" strokeWidth="3" />
          </pattern>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#93b4e0" />
          </marker>
          <filter id="worker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.35" />
          </filter>
        </defs>

        {/* Tường & sàn */}
        <rect x={0} y={0} width={MAP_W} height={ROW_Y[GRID_H - 1]} rx={10} fill="#334155" />
        <rect x={floor.x} y={floor.y} width={floor.w} height={floor.h} fill="#f4f8fc" />
        {/* Lối đi dọc giữa các dãy */}
        {Array.from({ length: RACK_COUNT + 1 }, (_, i) => {
          const x = 1 + i * 2;
          return (
            <rect
              key={x}
              x={COL_X[x]}
              y={ROW_Y[SHELF_TOP_Y]}
              width={AISLE_W}
              height={ROW_Y[SHELF_TOP_Y + SLOTS_PER_RACK] - ROW_Y[SHELF_TOP_Y]}
              fill="url(#aisle-hatch)"
              opacity={0.7}
            />
          );
        })}
        {/* Hành lang trên/dưới */}
        <rect x={floor.x} y={ROW_Y[1]} width={floor.w} height={ROW_H} fill="#e8f0fa" />
        <rect x={floor.x} y={ROW_Y[10]} width={floor.w} height={ROW_H} fill="#e8f0fa" />
        <text x={floor.x + floor.w / 2} y={ROW_Y[1] + ROW_H / 2 + 5} className="corridor-label">
          HÀNH LANG TRÊN
        </text>
        <text x={floor.x + floor.w / 2} y={ROW_Y[10] + ROW_H / 2 + 5} className="corridor-label">
          HÀNH LANG DƯỚI
        </text>
        {Array.from({ length: RACK_COUNT - 1 }, (_, i) => {
          const x = 3 + i * 2;
          return (
            <text
              key={x}
              className="aisle-label"
              transform={`translate(${COL_X[x] + AISLE_W / 2 + 4}, ${ROW_Y[6]}) rotate(-90)`}
            >
              LỐI {i + 1}
            </text>
          );
        })}

        {/* Mũi tên luồng chữ U (minh họa, không bắt buộc đi một chiều) */}
        <g opacity={0.55} pointerEvents="none">
          <line x1={cx({ x: 1, y: 11 })} y1={ROW_Y[11]} x2={cx({ x: 1, y: 2 })} y2={ROW_Y[2] + 10} stroke="#93b4e0" strokeWidth={3} markerEnd="url(#arrow-flow)" strokeDasharray="2 8" strokeLinecap="round" />
          <line x1={cx({ x: 2, y: 1 })} y1={cy({ x: 1, y: 1 }) - 16} x2={cx({ x: 10, y: 1 })} y2={cy({ x: 1, y: 1 }) - 16} stroke="#93b4e0" strokeWidth={3} markerEnd="url(#arrow-flow)" strokeDasharray="2 8" strokeLinecap="round" />
          <line x1={cx({ x: 11, y: 2 })} y1={ROW_Y[2] + 10} x2={cx({ x: 11, y: 10 })} y2={ROW_Y[11] - 4} stroke="#93b4e0" strokeWidth={3} markerEnd="url(#arrow-flow)" strokeDasharray="2 8" strokeLinecap="round" />
        </g>

        {/* Khu chức năng */}
        <g className="zone zone-receiving">
          <rect x={rec.x + 4} y={rec.y + 4} width={rec.w - 8} height={rec.h - 8} rx={10} />
          <text x={rec.x + rec.w / 2 + 14} y={rec.y + 26} className="zone-title">NHẬP HÀNG</text>
          <text x={rec.x + rec.w / 2 + 14} y={rec.y + 44} className="zone-sub">Receiving</text>
        </g>
        <g className="zone zone-packing">
          <rect x={pack.x + 4} y={pack.y + 4} width={pack.w - 8} height={pack.h - 8} rx={10} />
          <text x={pack.x + pack.w / 2} y={pack.y + pack.h / 2 - 4} className="zone-title">SOẠN ĐƠN / ĐÓNG GÓI</text>
          <text x={pack.x + pack.w / 2} y={pack.y + pack.h / 2 + 15} className="zone-sub">Packing — điểm kết thúc</text>
        </g>
        <g className="zone zone-shipping">
          <rect x={ship.x + 4} y={ship.y + 4} width={ship.w - 8} height={ship.h - 8} rx={8} />
          <text x={ship.x + ship.w / 2} y={ship.y + ship.h / 2 + 6} className="zone-title">XUẤT HÀNG ⇣</text>
        </g>
        <g className="start-marker">
          <circle cx={cx(START)} cy={cy(START)} r={17} />
          <text x={cx(START)} y={cy(START) + 4}>START</text>
        </g>

        {/* Ô sàn có thể nhấp để đi tới */}
        {mode === 'play' &&
          walkCells.map((c) => (
            <rect
              key={`f${c.x}-${c.y}`}
              className="floor-hit"
              x={COL_X[c.x]}
              y={ROW_Y[c.y]}
              width={colW(c.x)}
              height={rowH(c.y)}
              onClick={() => props.onCellClick?.(c)}
            />
          ))}

        {/* Dãy kệ */}
        {RACK_IDS.map((r, i) => {
          const x = rackX(i);
          return (
            <g key={r}>
              <rect
                x={COL_X[x] - 3}
                y={ROW_Y[SHELF_TOP_Y] - 3}
                width={SHELF_W + 6}
                height={ROW_Y[SHELF_TOP_Y + SLOTS_PER_RACK] - ROW_Y[SHELF_TOP_Y] + 6}
                rx={6}
                fill="#5b6b82"
              />
              <rect x={COL_X[x] + 20} y={ROW_Y[SHELF_TOP_Y] - 20} width={SHELF_W - 40} height={18} rx={5} fill="#1e3a5f" />
              <text x={COL_X[x] + SHELF_W / 2} y={ROW_Y[SHELF_TOP_Y] - 7} className="rack-label">
                DÃY {r}
              </text>
            </g>
          );
        })}

        {SLOT_IDS.map((slot) => {
          const c = slotCell(slot);
          const p = PRODUCT_BY_ID[layout[slot]];
          const x = COL_X[c.x];
          const y = ROW_Y[c.y];
          const col = DEMAND_COLORS[p.demand];
          const need = orderQty?.[p.id];
          const inOrder = !!need;
          const done = need && need.got >= need.need;
          const isAdj = adjacentSlots.includes(slot) && inOrder && !done;
          const hl = highlightProductId === p.id;
          const dim = focusDemand !== null && p.demand !== focusDemand;
          const changed = showChanges && ORIGINAL_LAYOUT[slot] !== p.id;
          const isDragFrom = drag?.moved && drag.from === slot;
          const isDragOver = drag?.moved && drag.over === slot && drag.from !== slot;
          const fill = colorMode === 'group' ? GROUP_INFO[p.group].color + '40' : col.fill;
          const lines = wrapName(p.name);
          const stopNo = stopNumbers[slot];
          return (
            <g
              key={slot}
              data-slot={slot}
              className={`slot ${hl ? 'is-hl' : ''} ${isAdj ? 'is-adj' : ''} ${selectedSlot === slot ? 'is-selected' : ''} ${isDragOver ? 'is-drop' : ''} ${isDragFrom ? 'is-dragfrom' : ''}`}
              opacity={dim ? 0.25 : 1}
              onPointerDown={(e) => onSlotPointerDown(slot, e)}
              onClick={() => mode === 'play' && props.onSlotClick?.(slot)}
              onPointerEnter={(e) => !drag && setHover({ slot, x: e.clientX, y: e.clientY })}
              onPointerMove={(e) => !drag && setHover({ slot, x: e.clientX, y: e.clientY })}
              onPointerLeave={() => setHover((h) => (h?.slot === slot ? null : h))}
            >
              <rect className="slot-bg" x={x + 3} y={y + 3} width={SHELF_W - 6} height={ROW_H - 6} rx={5} fill={fill} stroke={colorMode === 'group' ? GROUP_INFO[p.group].color : col.stroke} strokeWidth={1.5} />
              {colorMode === 'group' && <rect x={x + 3} y={y + 3} width={6} height={ROW_H - 6} rx={2} fill={col.dot} />}
              <rect x={x + 8} y={y + 7} width={40} height={14} rx={3} fill={col.badge} />
              <text x={x + 28} y={y + 17.5} className="slot-code">
                {slot}
              </text>
              {!inOrder && (
                <>
                  <circle cx={x + SHELF_W - 14} cy={y + 14} r={5} fill={col.dot} />
                  <text x={x + SHELF_W - 30} y={y + 19} className="slot-icon">
                    {p.icon}
                  </text>
                </>
              )}
              {lines.map((ln, i) => (
                <text key={i} x={x + SHELF_W / 2} y={y + (lines.length === 1 ? 38 : 33) + i * 12} className="slot-name">
                  {ln}
                </text>
              ))}
              {inOrder && (
                <g className={`order-badge ${done ? 'done' : ''}`}>
                  <rect x={x + SHELF_W - 50} y={y + 6} width={44} height={16} rx={8} />
                  <text x={x + SHELF_W - 28} y={y + 17.5}>
                    {done ? '✓' : `${need!.got}/${need!.need}`}
                  </text>
                </g>
              )}
              {stopNo !== undefined && (
                <g className="stop-badge">
                  <circle cx={x + 10} cy={y + ROW_H - 12} r={9} />
                  <text x={x + 10} y={y + ROW_H - 8}>
                    {stopNo}
                  </text>
                </g>
              )}
              {changed && stopNo === undefined && <circle cx={x + 10} cy={y + ROW_H - 12} r={4} fill="#2563eb" />}
              {hl && <rect className="hl-ring" x={x} y={y} width={SHELF_W} height={ROW_H} rx={7} />}
            </g>
          );
        })}

        {/* Tuyến tối ưu (cam, nét đứt) và tuyến người chơi (xanh) */}
        {showOptimalPath && optimalPath && optimalPath.length > 1 && (
          <polyline className="path-optimal" points={pointsOf(optimalPath)} />
        )}
        {showPlayerPath && playerPath && playerPath.length > 1 && <polyline className="path-player" points={pointsOf(playerPath)} />}

        {props.markers?.map((m, i) => {
          const same = props.markers!.slice(0, i).filter((o) => o.cell.x === m.cell.x && o.cell.y === m.cell.y).length;
          return (
            <g key={m.id} className="team-marker" style={{ transform: `translate(${cx(m.cell) + same * 9}px, ${cy(m.cell) - same * 9}px)` }}>
              <circle r={14} fill={m.color} opacity={m.done ? 0.45 : 1} />
              <text y={4.5}>{m.label}</text>
            </g>
          );
        })}

        {worker && (
          <g className="worker" style={{ transform: `translate(${cx(worker)}px, ${cy(worker)}px)` }} filter="url(#worker-shadow)">
            <circle r={17} className="worker-body" />
            <text y={6} className="worker-icon">
              👷
            </text>
          </g>
        )}
      </svg>

      {hover && hoverProduct && !drag && (
        <div className="tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="tt-title">
            {hoverProduct.icon} {hoverProduct.name}
          </div>
          <div className="tt-row">
            <span>Vị trí</span>
            <b>{hover.slot}</b>
          </div>
          <div className="tt-row">
            <span>Nhu cầu</span>
            <b style={{ color: DEMAND_COLORS[hoverProduct.demand].badge }}>{DEMAND_INFO[hoverProduct.demand].short}</b>
          </div>
          <div className="tt-row">
            <span>Nhóm</span>
            <b>{GROUP_INFO[hoverProduct.group].label}</b>
          </div>
          {hoverProduct.originalSlot !== hover.slot && (
            <div className="tt-row">
              <span>Vị trí ban đầu</span>
              <b>{hoverProduct.originalSlot}</b>
            </div>
          )}
          {orderQty?.[hoverProduct.id] && (
            <div className="tt-row tt-order">
              <span>Trong đơn</span>
              <b>
                {orderQty[hoverProduct.id].got}/{orderQty[hoverProduct.id].need}
              </b>
            </div>
          )}
          {mode === 'edit' && <div className="tt-hint">Kéo thả sang ô khác để hoán đổi</div>}
        </div>
      )}
      {dragProduct && drag && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {dragProduct.icon} {dragProduct.name}
          {drag.over && drag.over !== drag.from && <span> ⇄ {PRODUCT_BY_ID[layout[drag.over]].name}</span>}
        </div>
      )}
    </div>
  );
}
