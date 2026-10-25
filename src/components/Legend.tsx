import type { Demand } from '../core/types';
import { DEMAND_INFO, GROUP_INFO } from '../data/products';
import { DEMAND_COLORS } from './WarehouseMap';

interface Props {
  colorMode?: 'demand' | 'group';
  focusDemand?: Demand | null;
  onFocusDemand?: (d: Demand | null) => void;
  counts?: Record<Demand, number>;
  showPaths?: boolean;
}

export function Legend({ colorMode = 'demand', focusDemand, onFocusDemand, counts, showPaths = true }: Props) {
  return (
    <div className="legend">
      {colorMode === 'demand' || onFocusDemand
        ? (['C', 'TB', 'T'] as Demand[]).map((d) => (
            <button
              key={d}
              className={`legend-item ${onFocusDemand ? 'clickable' : ''} ${focusDemand === d ? 'active' : ''}`}
              onClick={() => onFocusDemand?.(focusDemand === d ? null : d)}
              disabled={!onFocusDemand}
              title={onFocusDemand ? 'Nhấp để làm nổi bật nhóm này' : undefined}
            >
              <span className="swatch" style={{ background: DEMAND_COLORS[d].fill, borderColor: DEMAND_COLORS[d].dot }} />
              {DEMAND_INFO[d].label}
              {counts && <b className="legend-count">{counts[d]}</b>}
            </button>
          ))
        : null}
      {colorMode === 'group' &&
        Object.values(GROUP_INFO).map((g) => (
          <span key={g.label} className="legend-item">
            <span className="swatch" style={{ background: g.color + '40', borderColor: g.color }} />
            {g.label}
          </span>
        ))}
      {showPaths && (
        <>
          <span className="legend-item">
            <span className="line-swatch player" /> Tuyến đã đi
          </span>
          <span className="legend-item">
            <span className="line-swatch optimal" /> Tuyến tối ưu
          </span>
        </>
      )}
      <span className="legend-item muted">Mỗi bước = 1 m · Nhặt hàng từ ô lối đi sát hai bên kệ</span>
    </div>
  );
}
