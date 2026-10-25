import { useEffect, useRef, useState } from 'react';
import type { WorkshopView } from '../shared/workshop';

export async function post<T = { ok: true }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Máy chủ không phản hồi.' }));
  if (!res.ok) throw new Error(data.error ?? `Lỗi ${res.status}`);
  return data as T;
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({ error: 'Máy chủ không phản hồi.' }));
  if (!res.ok) throw new Error(data.error ?? `Lỗi ${res.status}`);
  return data as T;
}

export type ConnState = 'connecting' | 'open' | 'error';

/**
 * Nhận trạng thái ván chơi theo thời gian thực (Server-Sent Events, tự kết nối lại).
 * `clockOffset` = giờ máy chủ − giờ máy này, để đếm ngược đồng bộ giữa các đội.
 */
export function useWorkshopStream(query: string | null) {
  const [view, setView] = useState<WorkshopView | null>(null);
  const [conn, setConn] = useState<ConnState>('connecting');
  const offset = useRef(0);

  useEffect(() => {
    if (!query) return;
    setConn('connecting');
    const es = new EventSource(`/api/events?${query}`);
    es.onopen = () => setConn('open');
    es.onerror = () => setConn('error');
    es.onmessage = (e) => {
      const v = JSON.parse(e.data) as WorkshopView;
      offset.current = v.serverNow - Date.now();
      setConn('open');
      setView(v);
    };
    return () => es.close();
  }, [query]);

  return { view, conn, serverNow: () => Date.now() + offset.current, clockOffset: offset };
}

export function loadJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* bỏ qua */
  }
}
