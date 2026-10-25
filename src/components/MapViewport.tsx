import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAP_H, MAP_W, WarehouseMap, type WarehouseMapProps } from './WarehouseMap';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

interface Props extends Omit<WarehouseMapProps, 'zoom'> {
  toolbar?: ReactNode;
  footer?: ReactNode;
}

export function MapViewport({ toolbar, footer, ...mapProps }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [autoFit, setAutoFit] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || !autoFit) return;
    const fit = () => {
      const z = Math.min((el.clientWidth - 8) / MAP_W, (el.clientHeight - 8) / MAP_H);
      setZoom(clamp(z));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setAutoFit(false);
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    setAutoFit(false);
    setZoom((z) => clamp(z * f));
  };

  return (
    <div className="map-card">
      <div className="map-toolbar">
        <div className="map-toolbar-left">{toolbar}</div>
        <div className="zoom-controls" role="group" aria-label="Phóng to thu nhỏ">
          <button className="btn icon" onClick={() => zoomBy(1 / 1.15)} title="Thu nhỏ">
            −
          </button>
          <span className="zoom-val">{Math.round(zoom * 100)}%</span>
          <button className="btn icon" onClick={() => zoomBy(1.15)} title="Phóng to">
            +
          </button>
          <button className={`btn small ${autoFit ? 'active' : ''}`} onClick={() => setAutoFit(true)} title="Vừa khung hình">
            Vừa khung
          </button>
        </div>
      </div>
      <div className="map-viewport" ref={ref}>
        <WarehouseMap {...mapProps} zoom={zoom} />
      </div>
      {footer}
    </div>
  );
}
