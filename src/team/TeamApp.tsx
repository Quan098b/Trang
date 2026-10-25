import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Layout, ResultKey, RunResult, SlotId } from '../core/types';
import { ORIGINAL_LAYOUT, initialLayout, swapSlots, validateLayout } from '../core/layout';
import { buildResult } from '../core/results';
import { unitsPicked } from '../core/engine';
import { STAGE_INFO, roundKey, type WorkshopView } from '../shared/workshop';
import { get, loadJson, post, saveJson, useWorkshopStream, type ConnState } from '../net/api';
import { usePickingGame } from '../hooks/usePickingGame';
import { MapViewport } from '../components/MapViewport';
import { Legend } from '../components/Legend';
import { PickingPanel } from '../components/PickingPanel';
import { LayoutPanel } from '../components/LayoutPanel';
import { ResultModal } from '../components/ResultModal';
import { ComparisonView } from '../components/ComparisonView';
import { Leaderboard } from '../components/Leaderboard';
import { demandCounts } from '../core/layout';
import { fmtNum } from '../components/format';

interface Identity {
  id: string;
  token: string;
  name: string;
}

const ID_KEY = 'wpc-team-identity';
const DEMAND_COUNTS = demandCounts();

export function TeamApp() {
  const [me, setMe] = useState<Identity | null>(() => loadJson<Identity>(ID_KEY));

  const leave = () => {
    saveJson(ID_KEY, null);
    setMe(null);
  };

  if (!me)
    return (
      <JoinScreen
        onJoined={(i) => {
          saveJson(ID_KEY, i);
          setMe(i);
        }}
      />
    );
  return <TeamConnection me={me} onLeave={leave} />;
}

/* ---------------- Màn hình nhập tên đội ---------------- */

function JoinScreen({ onJoined }: { onJoined: (i: Identity) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onJoined(await post<Identity>('/join', { name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không kết nối được máy chủ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="join-logo">📦</div>
        <h1>WAREHOUSE PICKING CHALLENGE</h1>
        <p className="muted">Thử thách tối ưu kho hàng · Kho chữ U · 40 SKU</p>
        <form onSubmit={submit}>
          <label className="field big">
            <span>Tên đội của bạn</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="VD: Đội Kho Vận 1" />
          </label>
          {error && <div className="callout bad small">{error}</div>}
          <button className="btn primary lg block" disabled={busy || !name.trim()}>
            {busy ? 'Đang vào…' : 'Vào phòng chơi →'}
          </button>
        </form>
        <div className="join-links">
          <a href="#/solo">Chơi tự do trên một máy</a>
          <span>·</span>
          <a href="#/admin">Trang quản trò</a>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Kết nối ---------------- */

function TeamConnection({ me, onLeave }: { me: Identity; onLeave: () => void }) {
  const query = `role=team&teamId=${encodeURIComponent(me.id)}&token=${encodeURIComponent(me.token)}`;
  const { view, conn, clockOffset } = useWorkshopStream(query);

  // Mất kết nối: kiểm tra đội còn tồn tại không (bị quản trò loại hoặc ván đã xóa đội)
  useEffect(() => {
    if (conn !== 'error') return;
    const t = setTimeout(() => {
      get(`/me?teamId=${encodeURIComponent(me.id)}&token=${encodeURIComponent(me.token)}`).catch((e: Error) => {
        if (e.message.includes('Không tìm thấy')) onLeave();
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [conn, me, onLeave]);

  if (!view)
    return (
      <div className="join-page">
        <div className="join-card">
          <div className="join-logo spin">📦</div>
          <h2>Đang kết nối máy chủ…</h2>
          <p className="muted">Nếu chờ quá lâu, kiểm tra máy đang dùng chung mạng với máy quản trò.</p>
          <button className="btn" onClick={onLeave}>
            Đổi tên đội
          </button>
        </div>
      </div>
    );
  return <TeamSession key={view.gameId} me={me} view={view} conn={conn} clockOffset={clockOffset} onLeave={onLeave} />;
}

/* ---------------- Một ván chơi ---------------- */

interface SessionProps {
  me: Identity;
  view: WorkshopView;
  conn: ConnState;
  clockOffset: { current: number };
  onLeave: () => void;
}

function TeamSession({ me, view, conn, clockOffset, onLeave }: SessionProps) {
  const prefix = `wpc-team:${me.id}:${view.gameId}`;
  const { stage, order } = view;
  const key = roundKey(stage);

  const [layout, setLayout] = useState<Layout>(() => {
    const l = loadJson<Layout>(`${prefix}:layout`);
    return l && validateLayout(l) ? l : initialLayout();
  });
  const [results, setResults] = useState<Partial<Record<ResultKey, RunResult>>>(() => loadJson(`${prefix}:results`) ?? {});
  const [pending, setPending] = useState<RunResult | null>(() => loadJson(`${prefix}:pending`));
  const [modal, setModal] = useState<RunResult | null>(null);
  const [selected, setSelected] = useState<SlotId | null>(null);
  const [undo, setUndo] = useState<Layout[]>([]);
  const [colorMode, setColorMode] = useState<'demand' | 'group'>('demand');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => saveJson(`${prefix}:layout`, layout), [prefix, layout]);
  useEffect(() => saveJson(`${prefix}:results`, results), [prefix, results]);
  useEffect(() => saveJson(`${prefix}:pending`, pending), [prefix, pending]);

  const playLayout: Layout = key === 'after' ? layout : ORIGINAL_LAYOUT;
  // Chốt mốc bắt đầu (giờ máy này) một lần cho mỗi vòng để không dao động theo độ trễ mạng
  const startAt = useMemo(
    () => (view.stageStartedAt !== null ? view.stageStartedAt - clockOffset.current : null),
    [view.stageStartedAt], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const game = usePickingGame({
    order,
    layout: playLayout,
    active: key !== null,
    resetKey: `${view.gameId}|${stage}`,
    persistKey: key ? `${prefix}:run:${key}` : null,
    allowPause: false,
    readyHint: 'Chờ quản trò bấm bắt đầu…',
    onFinish: (run) => {
      if (!key) return;
      setPending(buildResult(key, run, order, playLayout));
    },
  });
  const { run } = game;
  const counting = key !== null && run.status === 'ready' && !results[key] && startAt !== null && now < startAt;
  const runRef = useRef(run);
  runRef.current = run;

  // Đồng hồ cho đếm ngược
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [counting]);

  // Tự bắt đầu khi hết đếm ngược
  useEffect(() => {
    if (!key || startAt === null || run.status !== 'ready' || results[key]) return;
    const wait = startAt - Date.now();
    if (wait <= 0) {
      game.start();
      return;
    }
    const t = setTimeout(() => {
      setNow(Date.now());
      game.start();
    }, wait);
    return () => clearTimeout(t);
  }, [key, startAt, run.status, results, game.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gửi kết quả (tự thử lại nếu lỗi mạng)
  useEffect(() => {
    if (!pending) return;
    let stop = false;
    const trySend = async () => {
      try {
        const res = await post<{ result: RunResult }>('/result', { teamId: me.id, token: me.token, key: pending.key, result: pending });
        if (stop) return;
        setResults((r) => ({ ...r, [pending.key]: res.result }));
        setPending(null);
      } catch (e) {
        if (!stop && e instanceof Error && /không hợp lệ|chưa bắt đầu/.test(e.message)) {
          game.flash(`Máy chủ từ chối kết quả: ${e.message}`, 'error');
          setPending(null);
        } else if (!stop) timer = setTimeout(trySend, 3000);
      }
    };
    let timer = setTimeout(trySend, 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pending, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Báo tiến độ trực tiếp cho quản trò (tối đa ~1,5 lần/giây)
  const lastSent = useRef(0);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!key || run.status !== 'running') {
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = null;
      return;
    }
    const send = () => {
      if (runRef.current.status !== 'running') return;
      lastSent.current = Date.now();
      sendTimer.current = null;
      const r = runRef.current;
      post('/progress', {
        teamId: me.id,
        token: me.token,
        key,
        progress: { status: r.status, distance: r.distance, units: unitsPicked(r), elapsedMs: game.elapsedMs, wrongPicks: r.wrongPicks, pos: r.pos },
      }).catch(() => undefined);
    };
    const wait = 700 - (Date.now() - lastSent.current);
    if (wait <= 0) send();
    else sendTimer.current ??= setTimeout(send, wait);
  }, [run, key, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đồng bộ bố trí lên máy chủ khi đang ở giai đoạn tối ưu
  useEffect(() => {
    if (stage !== 'layout') return;
    const t = setTimeout(() => post('/layout', { teamId: me.id, token: me.token, layout }).catch(() => undefined), 500);
    return () => clearTimeout(t);
  }, [layout, stage, me]);

  const swap = (a: SlotId, b: SlotId) => {
    setUndo((u) => [...u.slice(-49), layout]);
    setLayout((l) => swapSlots(l, a, b));
    setSelected(null);
  };

  const orderQty = useMemo(
    () => Object.fromEntries(order.lines.map((l) => [l.productId, { need: l.qty, got: run.picked[l.productId] ?? 0 }])),
    [order, run.picked],
  );
  const finishedCount = key ? view.teams.filter((t) => t.results[key]).length : 0;
  const myResult = key ? results[key] ?? null : null;
  const doneLocally = run.status === 'finished';

  const header = (
    <header className="topbar team-topbar">
      <div className="brand">
        <div className="brand-mark">📦</div>
        <div>
          <h1>WAREHOUSE PICKING CHALLENGE</h1>
          <p>
            {STAGE_INFO[stage].label} · {STAGE_INFO[stage].desc}
          </p>
        </div>
      </div>
      <div className="team-chip">
        <span className={`conn-dot ${conn}`} title={conn === 'open' ? 'Đã kết nối' : 'Mất kết nối — đang thử lại'} />
        Đội: <b>{me.name}</b>
      </div>
    </header>
  );

  /* ----- Phòng chờ ----- */
  if (stage === 'lobby') {
    return (
      <div className="app">
        {header}
        <main className="main">
          <MapViewport layout={ORIGINAL_LAYOUT} mode="view" toolbar={<span className="map-title">Sơ đồ kho — hãy quan sát trước!</span>} footer={<Legend counts={DEMAND_COUNTS} showPaths={false} />} />
          <aside className="sidebar">
            <div className="panel-stack">
              <section className="card lobby-card">
                <div className="pulse-dot" />
                <h2>Chờ quản trò bắt đầu…</h2>
                <p className="muted">
                  Khi quản trò bấm <b>Bắt đầu</b>, tất cả các đội sẽ đếm ngược 3 giây rồi cùng chơi. Phiếu lấy hàng sẽ hiện ra lúc đó.
                </p>
                <p className="hint">
                  Điều khiển: <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> / mũi tên để đi · <kbd>Space</kbd> nhặt hàng · hoặc nhấp chuột lên lối đi / kệ. Lấy đủ hàng rồi mang về khu{' '}
                  <b>SOẠN ĐƠN / ĐÓNG GÓI</b>. Đi càng ngắn, càng nhanh, càng ít nhặt sai thì điểm càng cao.
                </p>
              </section>
              <section className="card">
                <h3>Các đội đã vào ({view.teams.length})</h3>
                <ul className="team-list">
                  {view.teams.map((t) => (
                    <li key={t.id} className={t.id === me.id ? 'me' : ''}>
                      <span className={`conn-dot ${t.online ? 'open' : 'error'}`} /> {t.name}
                    </li>
                  ))}
                </ul>
                <button className="link small" onClick={onLeave}>
                  Rời phòng / đổi tên đội
                </button>
              </section>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  /* ----- Tổng kết ----- */
  if (stage === 'ended') {
    return (
      <div className="app">
        {header}
        <main className="main single">
          <div className="compare">
            <Leaderboard teams={view.teams} highlightId={me.id} />
            {results.before && results.after ? (
              <ComparisonView before={results.before} after={results.after} order={order} currentLayout={layout} title={`Kết quả: ${me.name}`} />
            ) : (
              <div className="callout warn">Đội chưa hoàn thành đủ hai vòng nên không có bảng so sánh trước/sau.</div>
            )}
          </div>
        </main>
        {modal && <ResultModal result={modal} onClose={() => setModal(null)} />}
      </div>
    );
  }

  /* ----- Tối ưu bố trí ----- */
  if (stage === 'layout') {
    const r1 = results.before;
    return (
      <div className="app">
        {header}
        <main className="main">
          <MapViewport
            layout={layout}
            mode="edit"
            colorMode={colorMode}
            selectedSlot={selected}
            showChanges
            onSwap={swap}
            onSlotClick={(s) => (!selected ? setSelected(s) : selected === s ? setSelected(null) : swap(selected, s))}
            toolbar={<span className="map-title">Kéo thả để hoán đổi SKU — bố trí của đội {me.name}</span>}
            footer={<Legend colorMode={colorMode} counts={DEMAND_COUNTS} showPaths={false} />}
          />
          <aside className="sidebar">
            <LayoutPanel
              layout={layout}
              order={order}
              colorMode={colorMode}
              onColorMode={setColorMode}
              selectedSlot={selected}
              canUndo={undo.length > 0}
              onUndo={() => {
                const prev = undo[undo.length - 1];
                if (!prev) return;
                setUndo((u) => u.slice(0, -1));
                setLayout(prev);
              }}
              onReset={() => {
                if (!confirm('Khôi phục toàn bộ 40 ô về bố trí ban đầu?')) return;
                setUndo((u) => [...u, layout]);
                setLayout(initialLayout());
              }}
              footer={
                <>
                  <section className="card">
                    <h3>Kết quả vòng 1 của đội</h3>
                    {r1 ? (
                      <>
                        <p>
                          Bạn đi <b>{fmtNum(r1.distance)} m</b> trong <b>{fmtNum(r1.timeSec, 1)} s</b> — tuyến tối ưu là{' '}
                          <b>{fmtNum(r1.optimalDistance)} m</b>. Điểm: <b>{r1.score.total}</b> ({r1.score.grade}).
                        </p>
                        <button className="btn small" onClick={() => setModal(r1)}>
                          Xem chi tiết & tuyến tối ưu
                        </button>
                      </>
                    ) : (
                      <p className="muted">{pending ? 'Đang gửi kết quả…' : 'Đội chưa hoàn thành vòng 1.'}</p>
                    )}
                  </section>
                  <div className="callout info">Bố trí được tự động gửi cho quản trò. Vòng 2 sẽ dùng bố trí này khi quản trò bấm bắt đầu.</div>
                </>
              }
            />
          </aside>
        </main>
        {modal && <ResultModal result={modal} onClose={() => setModal(null)} />}
      </div>
    );
  }

  /* ----- Vòng picking ----- */
  return (
    <div className="app">
      {header}
      <main className="main">
        <MapViewport
          layout={playLayout}
          mode="play"
          worker={run.pos}
          playerPath={run.path}
          orderQty={orderQty}
          highlightProductId={highlight}
          adjacentSlots={game.adjacent}
          showChanges={key === 'after'}
          onCellClick={game.walkTo}
          onSlotClick={game.walkToSlot}
          toolbar={<span className="map-title">{key === 'before' ? 'Vòng 1 — bố trí ban đầu' : 'Vòng 2 — bố trí của đội bạn'}</span>}
          footer={<Legend counts={DEMAND_COUNTS} />}
        />
        <aside className="sidebar">
          <PickingPanel
            competitive
            title={key === 'before' ? 'Vòng 1 · Picking' : 'Vòng 2 · Picking lại'}
            subtitle="Lấy đủ hàng theo phiếu rồi mang về khu đóng gói. Đội tự chọn thứ tự và đường đi."
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
            previous={null}
            onShowPrevious={() => undefined}
          />
          {doneLocally && (
            <div className="callout ok done-callout">
              <b>🎉 Đội đã hoàn thành!</b> {fmtNum(run.distance)} m · {fmtNum(run.elapsedMs / 1000, 1)} s
              <div className="small">
                {pending && !myResult ? 'Đang gửi kết quả…' : 'Đã gửi kết quả.'} Quãng đường tối ưu và điểm sẽ được công bố khi quản trò kết thúc vòng.
              </div>
              <div className="small">
                {finishedCount}/{view.teams.length} đội đã hoàn thành.
              </div>
            </div>
          )}
        </aside>
      </main>
      {counting && startAt !== null && (
        <div className="countdown">
          <div className="countdown-num">{Math.ceil((startAt - now) / 1000)}</div>
          <div className="countdown-text">Chuẩn bị…</div>
        </div>
      )}
    </div>
  );
}
