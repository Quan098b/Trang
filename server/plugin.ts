import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import type { ResultKey } from '../src/core/types';
import { WorkshopStore, type StoreData } from './session';

/**
 * Máy chủ chơi nhiều đội gắn vào Vite (dev & preview) dưới đường dẫn /api.
 * Đẩy trạng thái tới client bằng Server-Sent Events; lưu trạng thái ra file để
 * khởi động lại máy chủ không mất kết quả.
 */

const STATE_FILE = resolve(process.cwd(), '.workshop', 'state.json');
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const BODY_LIMIT = 1_000_000;

interface Client {
  res: ServerResponse;
  role: 'admin' | 'team';
  teamId?: string;
}

function loadData(): StoreData | null {
  try {
    return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as StoreData) : null;
  } catch {
    return null;
  }
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        rej(new Error('Dữ liệu quá lớn'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        res(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        rej(new Error('JSON không hợp lệ'));
      }
    });
    req.on('error', rej);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function workshopPlugin(): Plugin {
  const store = new WorkshopStore(loadData());
  const clients = new Set<Client>();
  let joinUrls: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const online = () => new Set([...clients].filter((c) => c.teamId).map((c) => c.teamId!));

  const push = (c: Client) => {
    c.res.write(`data: ${JSON.stringify(store.view(c.role, online(), joinUrls))}\n\n`);
  };

  /** Gộp nhiều thay đổi liên tiếp thành một lần phát (tối đa ~4 lần/giây). */
  const changed = () => {
    flushTimer ??= setTimeout(() => {
      flushTimer = null;
      for (const c of clients) push(c);
    }, 250);
    saveTimer ??= setTimeout(() => {
      saveTimer = null;
      try {
        mkdirSync(dirname(STATE_FILE), { recursive: true });
        writeFileSync(STATE_FILE, JSON.stringify(store.data));
      } catch (e) {
        console.error('[workshop] Không lưu được trạng thái:', e);
      }
    }, 1000);
  };

  setInterval(() => {
    for (const c of clients) c.res.write(': ping\n\n');
  }, 15000).unref();

  const isAdmin = (pin: unknown) => typeof pin === 'string' && pin === ADMIN_PIN;

  async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const url = new URL(req.url ?? '/', 'http://x');
    const route = `${req.method} ${url.pathname}`;
    const q = url.searchParams;
    try {
      if (route === 'GET /events') {
        const role = q.get('role') === 'admin' ? 'admin' : 'team';
        if (role === 'admin' && !isAdmin(q.get('pin'))) return send(res, 401, { error: 'Sai mã PIN.' });
        const team = role === 'team' ? store.auth(q.get('teamId'), q.get('token')) : null;
        if (role === 'team' && !team) return send(res, 401, { error: 'Đội không tồn tại.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        const client: Client = { res, role, teamId: team?.id };
        clients.add(client);
        push(client);
        if (team) changed(); // báo trạng thái online
        req.on('close', () => {
          clients.delete(client);
          if (team) changed();
        });
        return;
      }

      if (route === 'GET /me') {
        const t = store.auth(q.get('teamId'), q.get('token'));
        return t ? send(res, 200, { id: t.id, name: t.name, gameId: store.data.gameId, layout: t.layout }) : send(res, 404, { error: 'Không tìm thấy đội.' });
      }

      if (req.method !== 'POST') return next();
      const body = await readBody(req);

      if (url.pathname === '/join') {
        const r = store.join(body.name);
        if (!r.ok) return send(res, 400, { error: r.error });
        changed();
        return send(res, 200, { id: r.value.id, token: r.value.token, name: r.value.name });
      }

      if (url.pathname.startsWith('/admin/')) {
        if (!isAdmin(body.pin)) return send(res, 401, { error: 'Sai mã PIN.' });
        let r: { ok: boolean; error?: string } = { ok: true };
        switch (url.pathname) {
          case '/admin/login':
            return send(res, 200, { ok: true });
          case '/admin/order':
            r = store.setOrder(body.order);
            break;
          case '/admin/stage':
            r = store.setStage(body.stage);
            break;
          case '/admin/reset':
            store.reset(body.keepTeams === true);
            break;
          case '/admin/kick':
            r = store.kick(body.teamId);
            break;
          case '/admin/team': {
            const t = store.data.teams.find((x) => x.id === body.teamId);
            return t ? send(res, 200, { name: t.name, results: t.results, layout: t.layout }) : send(res, 404, { error: 'Không tìm thấy đội.' });
          }
          default:
            return next();
        }
        if (!r.ok) return send(res, 400, { error: r.error });
        changed();
        return send(res, 200, { ok: true });
      }

      const team = store.auth(body.teamId, body.token);
      if (!team) return send(res, 401, { error: 'Đội không tồn tại.' });
      const key = body.key === 'after' ? 'after' : ('before' as ResultKey);
      let r: { ok: boolean; error?: string; value?: unknown };
      switch (url.pathname) {
        case '/progress':
          r = store.progress(team, key, body.progress as never);
          break;
        case '/result':
          r = store.submitResult(team, key, body.result as never);
          break;
        case '/layout':
          r = store.setLayout(team, body.layout);
          break;
        default:
          return next();
      }
      if (!r.ok) return send(res, 400, { error: r.error });
      changed();
      return send(res, 200, { ok: true, result: url.pathname === '/result' ? r.value : undefined });
    } catch (e) {
      return send(res, 400, { error: e instanceof Error ? e.message : 'Lỗi máy chủ' });
    }
  }

  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/api', (req, res, next) => void handle(req, res, next));
    server.httpServer?.once('listening', () => {
      setTimeout(() => {
        const urls = server.resolvedUrls;
        joinUrls = (urls?.network?.length ? urls.network : urls?.local ?? []).map((u) => u.replace(/\/$/, ''));
        const base = joinUrls[0] ?? 'http://localhost:5173';
        console.log('\n  🎮 Chế độ nhiều đội');
        console.log(`     Các đội vào:  ${joinUrls.join('  |  ') || base}`);
        console.log(`     Quản trò:     ${base}/#/admin   (mã PIN: ${ADMIN_PIN})\n`);
      }, 50);
    });
  };

  return {
    name: 'warehouse-workshop-server',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
