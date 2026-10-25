import { useEffect, useState } from 'react';
import App from './App';
import { TeamApp } from './team/TeamApp';
import { AdminApp } from './admin/AdminApp';

/** Định tuyến theo hash: #/ = đội chơi, #/admin = quản trò, #/solo = chơi tự do một máy. */
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return h.startsWith('admin') ? 'admin' : h.startsWith('solo') ? 'solo' : 'team';
}

export function Root() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const on = () => setRoute(currentRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (route === 'admin') return <AdminApp />;
  if (route === 'solo') return <App />;
  return <TeamApp />;
}
