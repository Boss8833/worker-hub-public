import { useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Hexagon, MoreHorizontal, Search, Bell, Languages, Rocket } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useMock } from '../../lib/mock';
import { useApi } from '../../hooks/useApi';
import type { Provider } from '../../lib/types';
import { Dialog } from '../ui/Controls';
import { Badge, StatusDot } from '../ui/Glass';
import { NAV, BOTTOM } from './nav';

function Logo() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent shadow-[0_0_24px_rgba(139,92,246,.5)]"><Hexagon className="h-5 w-5" /></div>
      <div className="hidden leading-tight lg:block"><div className="font-extrabold">{t('app.name')}</div><div className="text-xs text-muted">{t('app.tagline')}</div></div>
    </div>
  );
}

function Sidebar() {
  const { t } = useI18n();
  return (
    <aside className="hidden w-[76px] shrink-0 flex-col gap-4 border-e border-white/10 p-3 md:flex lg:w-[260px] lg:p-4">
      <Logo />
      <nav className="flex-1 space-y-4 overflow-y-auto no-scrollbar">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1 hidden px-3 text-[10px] font-bold tracking-widest text-muted lg:block">{t(g.group)}</div>
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.to === '/'} title={t(i.key)}
                className={({ isActive }) => `relative my-0.5 flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm transition ${isActive ? 'bg-white/10 font-semibold shadow-[0_0_20px_rgba(139,92,246,.25)] before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-brand' : 'text-muted hover:bg-white/5 hover:text-white'}`}>
                <i.icon className="h-5 w-5 shrink-0" /><span className="hidden lg:inline">{t(i.key)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="glass hidden p-3 text-center lg:block">
        <Rocket className="mx-auto mb-2 h-8 w-8 text-accent" />
        <Link to="/worker" className="block rounded-xl bg-gradient-to-br from-brand to-blue-500 px-3 py-2 text-sm font-semibold">{t('nav.worker')}</Link>
      </div>
    </aside>
  );
}

function TopBar() {
  const { t, lang, setLang } = useI18n();
  const worker = useApi<{ state: string }>('/api/worker/status');
  const ai = useApi<Provider[]>('/api/ai/providers');
  const active = ai.data?.find((p) => p.enabled);
  return (
    <header className="flex items-center gap-2 p-3 md:p-4 md:pb-2">
      <div className="md:hidden"><Logo /></div>
      <div className="relative hidden max-w-sm flex-1 md:block">
        <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted" />
        <input aria-label={t('top.search')} placeholder={t('top.search')} className="min-h-[44px] w-full rounded-xl border border-white/10 bg-white/5 ps-9 pe-3 text-sm outline-none focus:border-brand/60" />
      </div>
      <div className="ms-auto flex items-center gap-2">
        <span className="hidden sm:block"><Badge tone={worker.data?.state === 'ERROR' ? 'bad' : 'muted'}><StatusDot tone="muted" />{t('top.worker')}: {worker.data?.state ?? '…'}</Badge></span>
        <span className="hidden md:block"><Badge tone={active ? 'ok' : 'warn'}><StatusDot tone={active ? 'ok' : 'warn'} />{t('top.ai')}: {active ? active.name : t('top.notConfigured')}</Badge></span>
        <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label="language" className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-sm hover:bg-white/10"><Languages className="h-4 w-4" />{lang === 'ar' ? 'EN' : 'AR'}</button>
        <button aria-label="notifications" className="relative grid min-h-[44px] min-w-[44px] place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10"><Bell className="h-4 w-4" /></button>
        <div className="hidden items-center gap-2 lg:flex"><div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-sm font-bold">W</div><div className="text-xs leading-tight"><div className="font-semibold">{t('top.operator')}</div><div className="text-muted">{t('top.role')}</div></div></div>
      </div>
    </header>
  );
}

function BottomNav() {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const all = NAV.flatMap((g) => g.items);
  const main = all.filter((i) => BOTTOM.includes(i.to));
  const rest = all.filter((i) => !BOTTOM.includes(i.to));
  return (
    <>
      <nav className="glass safe-bottom fixed inset-x-2 bottom-2 z-40 flex !rounded-2xl p-1 md:hidden">
        {main.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] ${isActive ? 'bg-white/10 text-white' : 'text-muted'}`}>
            <i.icon className="h-5 w-5" />{t(i.key)}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] text-muted"><MoreHorizontal className="h-5 w-5" />{t('nav.more')}</button>
      </nav>
      <Dialog open={more} onClose={() => setMore(false)} title={t('nav.more')}>
        <div className="grid grid-cols-2 gap-2">
          {rest.map((i) => (
            <Link key={i.to} to={i.to} onClick={() => setMore(false)} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 text-sm"><i.icon className="h-5 w-5 text-accent" />{t(i.key)}</Link>
          ))}
        </div>
      </Dialog>
    </>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const { mock } = useMock();
  const loc = useLocation();
  return (
    <div className="app-bg">
      <div className="relative mx-auto max-w-[1500px] md:p-5">
        <div className="window flex min-h-screen md:min-h-[calc(100vh-2.5rem)]">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            {mock && (
              <div className="mx-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn md:mx-4">
                {t('mock.banner')} <Link to="/settings" className="underline">{t('mock.manage')}</Link>
              </div>
            )}
            <main key={loc.pathname} className="page-enter min-w-0 flex-1 p-3 pb-28 md:p-4 md:pb-6"><Outlet /></main>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
