import { useEffect, useMemo, useState } from 'react';
import type { Demand, Layout, Order, Phase, ResultKey, RunResult, SlotId } from './core/types';
import { ORIGINAL_LAYOUT, demandCounts, initialLayout, swapSlots } from './core/layout';
import { buildResult } from './core/results';
import { defaultState, loadState, saveState, type SavedState } from './core/storage';
import { usePickingGame } from './hooks/usePickingGame';
import { MapViewport } from './components/MapViewport';
import { Legend } from './components/Legend';
import { PickingPanel } from './components/PickingPanel';
import { OrderSetup } from './components/OrderSetup';
import { LayoutPanel } from './components/LayoutPanel';
import { ResultModal } from './components/ResultModal';
import { ComparisonView } from './components/ComparisonView';
import { fmtNum } from './components/format';

const PHASES: { key: Phase; label: string; sub: string }[] = [
  { key: 'pick1', label: 'Picking ban đầu', sub: 'Bố trí chưa hợp lý' },
  { key: 'layout', label: 'Tối ưu bố trí', sub: 'Kéo thả SKU' },
  { key: 'pick2', label: 'Picking lại', sub: 'Cùng đơn, bố trí mới' },
  { key: 'compare', label: 'So sánh', sub: 'Trước & sau' },
];

const DEMAND_COUNTS = demandCounts();

export default function App() {
  const [saved, setSaved] = useState<SavedState>(() => loadState() ?? defaultState());
  const { phase, order, results } = saved;
  const [showSetup, setShowSetup] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [modal, setModal] = useState<RunResult | null>(null);
  const [showPlayer, setShowPlayer] = useState(true);
  const [showOptimal, setShowOptimal] = useState(true);
  const [colorMode, setColorMode] = useState<'demand' | 'group'>('demand');
  const [focusDemand, setFocusDemand] = useState<Demand | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotId | null>(null);
  const [undoStack, setUndoStack] = useState<Layout[]>([]);
  const [runNonce, setRunNonce] = useState(0);

  useEffect(() => saveState(saved), [saved]);

  const isPick = phase === 'pick1' || phase === 'pick2';
  const resultKey: ResultKey = phase === 'pick2' ? 'after' : 'before';
  const playLayout: Layout = phase === 'pick1' ? ORIGINAL_LAYOUT : saved.optimizedLayout;

  const game = usePickingGame({
    order,
    layout: playLayout,
    active: isPick && !modal,
    resetKey: `${phase}|${order.id}|${runNonce}`,
    onFinish: (run) => {
      const r = buildResult(resultKey, run, order, playLayout);
      setSaved((s) => ({ ...s, results: { ...s.results, [resultKey]: r }, history: [r, ...s.history].slice(0, 20) }));
      setModal(r);
    },
  });
  const { run } = game;
  const runActive = run.status === 'running' || run.status === 'paused';

  const unlocked: Record<Phase, boolean> = {
    pick1: true,
    layout: !!results.before,
    pick2: !!results.before,
    compare: !!(results.before && results.after),
  };

  const goPhase = (p: Phase) => {
    if (!unlocked[p] || p === phase) return;
    if (isPick && runActive && !confirm('Lượt picking đang diễn ra sẽ bị hủy. Tiếp tục?')) return;
    setModal(null);
    setSelectedSlot(null);
    setHighlight(null);
    setShowSetup(false);
    setSaved((s) => ({ ...s, phase: p }));
  };

  const applyOrder = (o: Order) => {
    if ((results.before || results.after) && !confirm('Đổi đơn hàng sẽ xóa kết quả trước/sau hiện có. Tiếp tục?')) return;
    setSaved((s) => ({ ...s, order: o, results: { before: null, after: null } }));
    setShowSetup(false);
    setHighlight(null);
  };

  const restartAll = () => {
    if (!confirm('Bắt đầu workshop mới? Kết quả và bố trí đã chỉnh sẽ bị xóa (giữ lại đơn hàng hiện tại).')) return;
    setSaved({ ...defaultState(), order, history: saved.history });
    setUndoStack([]);
    setModal(null);
    setRunNonce((n) => n + 1);
  };

  const swap = (a: SlotId, b: SlotId) => {
    setUndoStack((u) => [...u.slice(-49), saved.optimizedLayout]);
    setSaved((s) => ({ ...s, optimizedLayout: swapSlots(s.optimizedLayout, a, b) }));
    setSelectedSlot(null);
  };

  const onEditSlotClick = (slot: SlotId) => {
    if (!selectedSlot) setSelectedSlot(slot);
    else if (selectedSlot === slot) setSelectedSlot(null);
    else swap(selectedSlot, slot);
  };

  const orderQty = useMemo(
    () => Object.fromEntries(order.lines.map((l) => [l.productId, { need: l.qty, got: run.picked[l.productId] ?? 0 }])),
    [order, run.picked],
  );

  const finishedResult = run.status === 'finished' ? results[resultKey] : null;
  const canEditOrder = phase === 'pick1' && run.status === 'ready';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">📦</div>
          <div>
            <h1>WAREHOUSE PICKING CHALLENGE</h1>
            <p>Thử thách tối ưu kho hàng · Mô hình kho chữ U (U-Flow) · 40 SKU</p>
          </div>
        </div>
        <nav className="stepper" aria-label="Các giai đoạn">
          {PHASES.map((p, i) => (
            <button
              key={p.key}
              className={`step ${phase === p.key ? 'current' : ''} ${unlocked[p.key] ? '' : 'locked'} ${
                (p.key === 'pick1' && results.before) || (p.key === 'pick2' && results.after) ? 'done' : ''
              }`}
              onClick={() => goPhase(p.key)}
              disabled={!unlocked[p.key]}
              title={unlocked[p.key] ? p.sub : 'Hoàn thành Giai đoạn 1 để mở khóa'}
            >
              <span className="step-num">{unlocked[p.key] ? i + 1 : '🔒'}</span>
              <span className="step-text">
                <b>{p.label}</b>
                <small>{p.sub}</small>
              </span>
            </button>
          ))}
        </nav>
        <button className="btn ghost light" onClick={restartAll}>
          ↺ Workshop mới
        </button>
      </header>

      {phase === 'compare' && results.before && results.after ? (
        <main className="main single">
          <ComparisonView
            before={results.before}
            after={results.after}
            order={order}
            currentLayout={saved.optimizedLayout}
            onEditLayout={() => goPhase('layout')}
            onReplayAfter={() => {
              setRunNonce((n) => n + 1);
              goPhase('pick2');
            }}
            onRestartAll={restartAll}
          />
        </main>
      ) : (
        <main className="main">
          <MapViewport
            layout={isPick ? playLayout : saved.optimizedLayout}
            mode={isPick ? 'play' : 'edit'}
            worker={isPick ? run.pos : null}
            playerPath={isPick ? run.path : undefined}
            showPlayerPath={showPlayer}
            optimalPath={finishedResult?.optimalPath}
            optimalStops={finishedResult && showOptimal ? finishedResult.optimalSequence : undefined}
            showOptimalPath={showOptimal}
            orderQty={isPick ? orderQty : undefined}
            highlightProductId={highlight}
            adjacentSlots={isPick ? game.adjacent : []}
            colorMode={isPick ? 'demand' : colorMode}
            focusDemand={focusDemand}
            selectedSlot={selectedSlot}
            showChanges={phase === 'layout' || phase === 'pick2'}
            onCellClick={game.walkTo}
            onSlotClick={isPick ? game.walkToSlot : onEditSlotClick}
            onSwap={swap}
            toolbar={
              <>
                <span className="map-title">
                  {phase === 'pick1' && 'Sơ đồ kho chữ U — bố trí ban đầu (cố ý chưa hợp lý)'}
                  {phase === 'layout' && 'Chế độ chỉnh bố trí — kéo thả để hoán đổi SKU'}
                  {phase === 'pick2' && 'Sơ đồ kho — bố trí sau tối ưu'}
                </span>
                {finishedResult && (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={showPlayer} onChange={(e) => setShowPlayer(e.target.checked)} /> Tuyến đã đi
                    </label>
                    <label className="check">
                      <input type="checkbox" checked={showOptimal} onChange={(e) => setShowOptimal(e.target.checked)} /> Tuyến tối ưu
                    </label>
                    <button className="btn small" onClick={() => setModal(finishedResult)}>
                      Xem kết quả
                    </button>
                  </>
                )}
              </>
            }
            footer={
              <Legend
                colorMode={isPick ? 'demand' : colorMode}
                focusDemand={focusDemand}
                onFocusDemand={setFocusDemand}
                counts={DEMAND_COUNTS}
                showPaths={isPick}
              />
            }
          />

          <aside className="sidebar">
            {isPick ? (
              <PickingPanel
                title={phase === 'pick1' ? 'Giai đoạn 1 · Picking' : 'Giai đoạn 3 · Picking lại'}
                subtitle={
                  phase === 'pick1'
                    ? 'Lấy đủ hàng theo phiếu rồi mang về khu đóng gói. Bạn tự chọn thứ tự và đường đi.'
                    : 'Cùng đơn hàng, cùng Start và khu đóng gói — trên bố trí bạn vừa tối ưu.'
                }
                order={order}
                layout={playLayout}
                run={run}
                elapsedMs={game.elapsedMs}
                adjacent={game.adjacent}
                message={game.message}
                highlight={highlight}
                onHighlight={setHighlight}
                onStart={game.start}
                onPause={game.pause}
                onReset={game.reset}
                onPick={game.pick}
                previous={results[resultKey]}
                onShowPrevious={() => results[resultKey] && setModal(results[resultKey])}
                orderSetup={
                  canEditOrder ? (
                    showSetup ? (
                      <OrderSetup current={order} onApply={applyOrder} onClose={() => setShowSetup(false)} />
                    ) : (
                      <button className="btn block" onClick={() => setShowSetup(true)}>
                        📋 Đổi đơn hàng (mẫu / ngẫu nhiên / tự tạo)
                      </button>
                    )
                  ) : phase === 'pick1' && run.status !== 'finished' ? (
                    <p className="muted small">Đơn hàng bị khóa khi lượt chơi đang diễn ra.</p>
                  ) : null
                }
              />
            ) : (
              <LayoutPanel
                layout={saved.optimizedLayout}
                order={order}
                colorMode={colorMode}
                onColorMode={setColorMode}
                selectedSlot={selectedSlot}
                canUndo={undoStack.length > 0}
                onUndo={() => {
                  const prev = undoStack[undoStack.length - 1];
                  if (!prev) return;
                  setUndoStack((u) => u.slice(0, -1));
                  setSaved((s) => ({ ...s, optimizedLayout: prev }));
                }}
                onReset={() => {
                  if (!confirm('Khôi phục toàn bộ 40 ô về bố trí ban đầu?')) return;
                  setUndoStack((u) => [...u, saved.optimizedLayout]);
                  setSaved((s) => ({ ...s, optimizedLayout: initialLayout() }));
                }}
                onContinue={() => goPhase('pick2')}
              />
            )}
            {isPick && saved.history.length > 0 && <History items={saved.history} onOpen={setModal} />}
          </aside>
        </main>
      )}

      {modal && (
        <ResultModal
          result={modal}
          onClose={() => setModal(null)}
          primary={
            modal.key === 'before'
              ? { label: 'Tiếp tục: Tối ưu bố trí kho →', onClick: () => goPhase('layout') }
              : results.before
                ? { label: 'Xem bảng so sánh →', onClick: () => goPhase('compare') }
                : undefined
          }
        />
      )}
    </div>
  );
}

function History({ items, onOpen }: { items: RunResult[]; onOpen: (r: RunResult) => void }) {
  return (
    <details className="card history">
      <summary>Lịch sử lượt chơi ({items.length})</summary>
      <ul>
        {items.map((r) => (
          <li key={r.finishedAt}>
            <button className="link" onClick={() => onOpen(r)}>
              {new Date(r.finishedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ·{' '}
              {r.key === 'before' ? 'Trước' : 'Sau'} · {r.orderName}
            </button>
            <span className="muted">
              {fmtNum(r.distance)} m / {fmtNum(r.timeSec, 1)} s · {r.score.total}đ
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
