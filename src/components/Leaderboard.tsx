import type { TeamView } from '../shared/workshop';
import { reductionPct } from '../core/results';
import { changeLabel, fmtNum } from './format';

export const TEAM_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#b45309', '#0d9488', '#be123c'];
export const teamColor = (i: number) => TEAM_COLORS[i % TEAM_COLORS.length];

export interface RankedTeam {
  team: TeamView;
  index: number;
  total: number;
  time: number;
}

/** Xếp hạng theo tổng điểm kỹ năng đi tuyến 2 vòng; hòa điểm thì ai tổng thời gian ít hơn đứng trên. */
export function rankTeams(teams: TeamView[]): RankedTeam[] {
  return teams
    .map((team, index) => ({
      team,
      index,
      total: (team.results.before?.score ?? 0) + (team.results.after?.score ?? 0),
      time: (team.results.before?.timeSec ?? 9999) + (team.results.after?.timeSec ?? 9999),
    }))
    .sort((a, b) => b.total - a.total || a.time - b.time);
}

export function Leaderboard({ teams, highlightId }: { teams: TeamView[]; highlightId?: string }) {
  const ranked = rankTeams(teams);
  return (
    <section className="card leaderboard">
      <h3>🏆 Bảng xếp hạng</h3>
      <p className="muted small">
        Xếp theo tổng điểm kỹ năng đi tuyến của hai vòng (hòa điểm → tổng thời gian ít hơn). Cột “Hiệu quả bố trí” cho biết bố trí của đội giảm bao
        nhiêu quãng đường tối ưu lý thuyết — đánh giá riêng, không cộng vào điểm.
      </p>
      <div className="table-scroll">
        <table className="compare-table lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Đội</th>
              <th className="num">V1 quãng đường</th>
              <th className="num">V1 thời gian</th>
              <th className="num">V1 điểm</th>
              <th className="num">V2 quãng đường</th>
              <th className="num">V2 thời gian</th>
              <th className="num">V2 điểm</th>
              <th className="num">Hiệu quả bố trí</th>
              <th className="num">Tổng điểm</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const b = r.team.results.before;
              const a = r.team.results.after;
              const layoutPct = b?.optimalDistance && a?.optimalDistance ? reductionPct(b.optimalDistance, a.optimalDistance) : null;
              const c = layoutPct !== null ? changeLabel(layoutPct) : null;
              return (
                <tr key={r.team.id} className={r.team.id === highlightId ? 'me' : ''}>
                  <td className="rank">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td>
                    <span className="dot" style={{ background: teamColor(r.index) }} />
                    <b>{r.team.name}</b>
                  </td>
                  <td className="num">{b ? `${fmtNum(b.distance)} m` : '—'}</td>
                  <td className="num">{b ? `${fmtNum(b.timeSec, 1)} s` : '—'}</td>
                  <td className="num">{b?.score ?? '—'}</td>
                  <td className="num">{a ? `${fmtNum(a.distance)} m` : '—'}</td>
                  <td className="num">{a ? `${fmtNum(a.timeSec, 1)} s` : '—'}</td>
                  <td className="num">{a?.score ?? '—'}</td>
                  <td className="num">{c ? <span className={`tag ${c.tone}`}>{c.text}</span> : '—'}</td>
                  <td className="num">
                    <b className="lb-total">{r.total}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
