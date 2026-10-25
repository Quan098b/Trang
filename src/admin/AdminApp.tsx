import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Layout, ResultKey, RunResult } from '../core/types';
import { ORIGINAL_LAYOUT, demandCounts, orderSlots } from '../core/layout';
import { routeDistance, solveRoute, targetsForSlots } from '../core/routing';
import { PRODUCT_BY_ID } from '../data/products';
import { STAGES, STAGE_INFO, roundKey, type Stage, type TeamView, type WorkshopView } from '../shared/workshop';
import { post, useWorkshopStream } from '../net/api';
import { MapViewport } from '../components/MapViewport';
import { WarehouseMap } from '../components/WarehouseMap';
import { Legend } from '../components/Legend';
import { OrderSetup } from '../components/OrderSetup';
import { Leaderboard, teamColor } from '../components/Leaderboard';
import { fmtNum, fmtTime } from '../components/format';

const PIN_KEY = 'wpc-admin-pin';
const DEMAND_COUNTS = demandCounts();

function readPin(): string | null {
  try {
    return sessionStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function AdminApp() {
  const [pin, setPin] = useState<string | null>(readPin);
  if (!pin) return <PinGate onOk={setPin} />;
  return (
    <AdminConsole
      pin={pin}
      onLogout={() => {
        try {
          sessionStorage.removeItem(PIN_KEY);
        } catch {
          /* bỏ qua */
        }
        setPin(null);
      }}
    />
  );
}

function PinGate({ onOk }: { onOk: (pin: string) => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await post('/admin/login', { pin });
      try {
        sessionStorage.setItem(PIN_KEY, pin);
      } catch {
        /* bỏ qua */
      }
      onOk(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối.');
    }
  };
  return (
    <div className="join-page">
      <form className="join-card" onSubmit={submit}>
        <div className="join-logo">🧑‍🏫</div>
        <h1>Trang quản trò</h1>
        <p className="muted">Nhập mã PIN quản trò (hiện trong cửa sổ terminal khi chạy npm run dev).</p>
        <label className="field big">
          <span>Mã PIN</span>
          <input autoFocus type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
        </label>
        {error && <div className="callout bad small">{error}</div>}
        <button className="btn primary lg block" disabled={!pin}>
          Đăng nhập
        </button>
        <div className="join-links">
          <a href="#/">← Trang của đội chơi</a>
        </div>
      </form>
    </div>
  );
}

const NEXT_ACTION: Partial<Record<Stage, { to: Stage; label: string; tone: string }>> = {
  lobby: { to: 'round1', label: '▶ Bắt đầu vòng 1', tone: 'primary' },
  round1: { to: 'layout', label: '■ Kết thúc vòng 1 → Tối ưu bố trí', tone: 'warn' },
  layout: { to: 'round2', label: '▶ Bắt đầu vòng 2', tone: 'primary' },
  round2: { to: 'ended', label: '■ Kết thúc vòng 2 → Tổng kết', tone: 'warn' },
};

function AdminConsole({ pin, onLogout }: { pin: string; onLogout: () => void }) {
  const { view, conn, serverNow } = useWorkshopStream(`role=admin&pin=${encodeURIComponent(pin)}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editOrder, setEditOrder] = useState(false);
  const [hideAnswer, setHideAnswer] = useState(false);
  const [detail, setDetail] = useState<TeamView | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const call = async (path: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    setError('');
    try {
      await post(`/admin/${path}`, { pin, ...body });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi';
      if (msg.includes('PIN')) onLogout();
      setError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const baseRoute = useMemo(() => (view ? solveRoute(targetsForSlots(orderSlots(view.order, ORIGINAL_LAYOUT))) : null), [view?.order]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view || !baseRoute)
    return (
      <div className="join-page">
        <div className="join-card">
          <div className="join-logo spin">📦</div>
          <h2>{conn === 'error' ? 'Mất kết nối máy chủ — đang thử lại…' : 'Đang kết nối…'}</h2>
        </div>
      </div>
    );

  const { stage, order, teams } = view;
  const key = roundKey(stage);
  const next = NEXT_ACTION[stage];
  const startAt = view.stageStartedAt;
  const nowServer = serverNow();
  const countdown = key && startAt && nowServer < startAt ? Math.ceil((startAt - nowServer) / 1000) : 0;
  const roundElapsed = key && startAt && nowServer >= startAt ? nowServer - startAt : 0;
  const finished = key ? teams.filter((t) => t.results[key]).length : 0;

  const advance = async () => {
    if (!next) return;
    if (key && finished < teams.length && !confirm(`Còn ${teams.length - finished} đội chưa hoàn thành. Vẫn kết thúc vòng?`)) return;
    await call('stage', { stage: next.to });
  };

  const markers = key
    ? teams.flatMap((t, i) => {
        const p = t.progress[key];
        if (!p) return [];
        return [{ id: t.id, cell: p.pos, label: String(i + 1), color: teamColor(i) }];
      })
    : [];

  return (
    <div className="app admin-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">🧑‍🏫</div>
          <div>
            <h1>BẢNG QUẢN TRÒ</h1>
            <p>Warehouse Picking Challenge · ván #{view.gameId}</p>
          </div>
        </div>
        <nav className="stepper">
          {STAGES.map((s, i) => (
            <div key={s} className={`step ${s === stage ? 'current' : ''} ${STAGES.indexOf(stage) > i ? 'done' : ''}`}>
              <span className="step-num">{i + 1}</span>
              <span className="step-text">
                <b>{STAGE_INFO[s].label}</b>
              </span>
            </div>
          ))}
        </nav>
        <span className={`conn-dot ${conn}`} title={conn} />
        <button className="btn ghost light" onClick={onLogout}>
          Đăng xuất
        </button>
      </header>

      <main className="admin-main">
        <div className="admin-left">
          <section className="card join-banner">
            <div>
              <div className="eyebrow">Các đội truy cập</div>
              <div className="join-urls">
                {view.joinUrls.length ? view.joinUrls.map((u) => <code key={u}>{u}</code>) : <code>{location.origin}</code>}
              </div>
              <div className="muted small">Cùng mạng Wi-Fi/LAN với máy này → nhập tên đội → chờ bắt đầu.</div>
            </div>
            <div className="stage-box">
              <div className="stage-label">{STAGE_INFO[stage].label}</div>
              {countdown > 0 ? (
                <div className="stage-timer">Bắt đầu sau {countdown}…</div>
              ) : key ? (
                <div className="stage-timer">⏱ {fmtTime(roundElapsed)}</div>
              ) : (
                <div className="muted small">{STAGE_INFO[stage].desc}</div>
              )}
              {key && (
                <div className="small">
                  Hoàn thành: <b>{finished}</b>/{teams.length} đội
                </div>
              )}
            </div>
          </section>

          {stage === 'ended' && <Leaderboard teams={teams} />}

          <div className="admin-map">
            <MapViewport
              layout={ORIGINAL_LAYOUT}
              mode="view"
              optimalPath={hideAnswer ? undefined : baseRoute.path}
              optimalStops={hideAnswer ? undefined : baseRoute.stops.map((s) => s.slot)}
              orderQty={Object.fromEntries(order.lines.map((l) => [l.productId, { need: l.qty, got: 0 }]))}
              markers={markers}
              toolbar={
                <>
                  <span className="map-title">{key === 'after' ? 'Vị trí các đội (bố trí ban đầu để tham chiếu)' : 'Bố trí ban đầu · vị trí các đội trực tiếp'}</span>
                  <label className="check">
                    <input type="checkbox" checked={hideAnswer} onChange={(e) => setHideAnswer(e.target.checked)} /> Ẩn đáp án (khi trình chiếu)
                  </label>
                </>
              }
              footer={<Legend counts={DEMAND_COUNTS} />}
            />
          </div>

          <TeamsTable view={view} hideAnswer={hideAnswer} onDetail={setDetail} onKick={(t) => confirm(`Loại đội “${t.name}”?`) && call('kick', { teamId: t.id })} />
        </div>

        <aside className="admin-right">
          <section className="card">
            <h3>Điều khiển</h3>
            {next && (
              <button className={`btn ${next.tone} lg block`} disabled={busy || (stage === 'lobby' && teams.length === 0)} onClick={advance}>
                {next.label}
              </button>
            )}
            {stage === 'lobby' && teams.length === 0 && <p className="muted small">Chờ ít nhất một đội vào phòng.</p>}
            {error && <div className="callout bad small">{error}</div>}
            <div className="row-actions">
              <button className="btn small" disabled={busy} onClick={() => confirm('Bắt đầu ván mới, giữ nguyên các đội? Kết quả hiện tại sẽ bị xóa.') && call('reset', { keepTeams: true })}>
                ↺ Ván mới (giữ đội)
              </button>
              <button className="btn small danger-outline" disabled={busy} onClick={() => confirm('Xóa tất cả các đội và bắt đầu lại?') && call('reset', { keepTeams: false })}>
                Xóa hết đội
              </button>
            </div>
          </section>

          <section className="card answer-card">
            <div className="card-head">
              <h3>🔑 Quãng đường tối ưu</h3>
              <span className="tag">Chỉ quản trò</span>
            </div>
            {hideAnswer ? (
              <p className="muted">Đang ẩn đáp án.</p>
            ) : (
              <>
                <div className="answer-big">
                  {fmtNum(baseRoute.distance)} <span>m</span>
                </div>
                <p className="muted small">
                  Bố trí ban đầu (vòng 1) · {baseRoute.exact ? 'Held–Karp — tối ưu chính xác' : 'ƯỚC LƯỢNG (đơn > 8 SKU)'}
                </p>
                <ol className="answer-seq">
                  <li>START (nhập hàng)</li>
                  {baseRoute.stops.map((s) => (
                    <li key={s.slot}>
                      <code>{s.slot}</code> {PRODUCT_BY_ID[ORIGINAL_LAYOUT[s.slot]].name}
                    </li>
                  ))}
                  <li>ĐÓNG GÓI</li>
                </ol>
                {(stage === 'layout' || stage === 'round2' || stage === 'ended') && (
                  <p className="muted small">Vòng 2: mỗi đội có bố trí riêng — quãng đường tối ưu của từng đội ở cột “Tối ưu V2” trong bảng các đội.</p>
                )}
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Phiếu lấy hàng</h3>
              {stage === 'lobby' && !editOrder && (
                <button className="btn small" onClick={() => setEditOrder(true)}>
                  Đổi đơn
                </button>
              )}
            </div>
            <p className="muted small">
              {order.name} · {order.difficulty}
            </p>
            <ul className="line-list">
              {order.lines.map((l) => (
                <li key={l.productId}>
                  <span>
                    {PRODUCT_BY_ID[l.productId].icon} {PRODUCT_BY_ID[l.productId].name}
                  </span>
                  <b>×{l.qty}</b>
                </li>
              ))}
            </ul>
            {stage === 'lobby' && editOrder && (
              <OrderSetup
                current={order}
                onApply={async (o) => {
                  if (await call('order', { order: o })) setEditOrder(false);
                }}
                onClose={() => setEditOrder(false)}
              />
            )}
            {stage !== 'lobby' && <p className="muted small">Đơn hàng bị khóa sau khi ván bắt đầu.</p>}
          </section>
        </aside>
      </main>

      {detail && <TeamDetail pin={pin} team={detail} order={view.order} onClose={() => setDetail(null)} />}
    </div>
  );
}

function TeamsTable({
  view,
  hideAnswer,
  onDetail,
  onKick,
}: {
  view: WorkshopView;
  hideAnswer: boolean;
  onDetail: (t: TeamView) => void;
  onKick: (t: TeamView) => void;
}) {
  const { teams, order } = view;
  const opt2 = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of teams) if (t.layout) m[t.id] = routeDistance(orderSlots(order, t.layout));
    return m;
  }, [teams, order]);
  const totalUnits = order.lines.reduce((a, l) => a + l.qty, 0);

  const cell = (t: TeamView, k: ResultKey) => {
    const r = t.results[k];
    if (r)
      return (
        <>
          <b>{fmtNum(r.distance)} m</b> · {fmtNum(r.timeSec, 1)} s
          <div className="small">
            {!hideAnswer && r.optimalDistance !== null && (
              <span className={r.distance === r.optimalDistance ? 'good-text' : 'muted'}>
                +{fmtNum(r.distance - r.optimalDistance)} m so với tối ưu ·{' '}
              </span>
            )}
            <b>{r.score ?? '—'}đ</b>
            {r.wrongPicks > 0 && <span className="bad-text"> · sai {r.wrongPicks}</span>}
          </div>
        </>
      );
    const p = t.progress[k];
    if (p)
      return (
        <span className="live">
          ● {fmtNum(p.distance)} m · {p.units}/{totalUnits} · {fmtTime(p.elapsedMs)}
        </span>
      );
    return <span className="muted">—</span>;
  };

  return (
    <section className="card">
      <h3>Các đội ({teams.length})</h3>
      {teams.length === 0 ? (
        <p className="muted">Chưa có đội nào. Đưa địa chỉ truy cập ở trên cho các đội.</p>
      ) : (
        <div className="table-scroll">
          <table className="compare-table admin-teams">
            <thead>
              <tr>
                <th>#</th>
                <th>Đội</th>
                <th>Vòng 1</th>
                <th className="num">Tối ưu V2</th>
                <th>Vòng 2</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.id}>
                  <td>
                    <span className="team-badge" style={{ background: teamColor(i) }}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <span className={`conn-dot ${t.online ? 'open' : 'error'}`} title={t.online ? 'Đang kết nối' : 'Mất kết nối'} /> <b>{t.name}</b>
                  </td>
                  <td>{cell(t, 'before')}</td>
                  <td className="num">{hideAnswer ? '•••' : opt2[t.id] !== undefined ? `${fmtNum(opt2[t.id])} m` : '—'}</td>
                  <td>{cell(t, 'after')}</td>
                  <td className="num nowrap">
                    <button className="btn small" onClick={() => onDetail(t)} disabled={!t.results.before && !t.results.after}>
                      Xem tuyến
                    </button>{' '}
                    <button className="btn small danger-outline" onClick={() => onKick(t)} title="Loại đội">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TeamDetail({ pin, team, order, onClose }: { pin: string; team: TeamView; order: WorkshopView['order']; onClose: () => void }) {
  const [data, setData] = useState<{ results: Partial<Record<ResultKey, RunResult>>; layout: Layout } | null>(null);
  const [k, setK] = useState<ResultKey>(team.results.before ? 'before' : 'after');
  const [error, setError] = useState('');
  useEffect(() => {
    post<{ results: Partial<Record<ResultKey, RunResult>>; layout: Layout }>('/admin/team', { pin, teamId: team.id })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [pin, team.id]);
  const r = data?.results[k];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Chi tiết đội</div>
            <h2>{team.name}</h2>
          </div>
          <div className="seg">
            {(['before', 'after'] as ResultKey[]).map((x) => (
              <button key={x} className={k === x ? 'active' : ''} onClick={() => setK(x)} disabled={!team.results[x]}>
                {x === 'before' ? 'Vòng 1' : 'Vòng 2'}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="callout bad">{error}</div>}
        {r ? (
          <>
            <p>
              Đội đi <b>{fmtNum(r.distance)} m</b> / {fmtNum(r.timeSec, 1)} s — tối ưu <b>{fmtNum(r.optimalDistance)} m</b>
              {r.optimalExact ? '' : ' (ước lượng)'} · điểm <b>{r.score.total}</b> ({r.score.grade}) · nhặt sai {r.wrongPicks} · quay đầu {r.turnarounds}
            </p>
            <div className="detail-map">
              <WarehouseMap
                layout={r.layout}
                mode="view"
                zoom={0.75}
                playerPath={r.playerPath}
                optimalPath={r.optimalPath}
                optimalStops={r.optimalSequence}
                orderQty={Object.fromEntries(order.lines.map((l) => [l.productId, { need: l.qty, got: l.qty }]))}
                showChanges={k === 'after'}
              />
            </div>
            <Legend />
          </>
        ) : (
          !error && <p className="muted">{data ? 'Đội chưa có kết quả vòng này.' : 'Đang tải…'}</p>
        )}
        <div className="modal-actions">
          <button className="btn lg" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
