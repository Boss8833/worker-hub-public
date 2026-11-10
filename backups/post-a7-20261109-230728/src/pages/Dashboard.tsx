import { Link } from 'react-router-dom';
import { Download, Filter } from 'lucide-react';
import { useI18n } from '../i18n';
import { useMock } from '../lib/mock';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { demo } from '../lib/demo';
import { money, shortDate } from '../lib/format';
import type { EarningTotals, Platform } from '../lib/types';
import { GlassCard, DemoBadge, PageHeader, Badge, StatusDot, EmptyState, ErrorState, Skeleton } from '../components/ui/Glass';
import { Toggle } from '../components/ui/Controls';
import { Sparkline, Gauge, ColorBars, Donut, FlowChart } from '../components/ui/Charts';
import { useToast } from '../components/ui/Toast';

type Dash = {
  earnings: { totals: EarningTotals[]; byPlatform: { name: string; currency: string; amount: number }[] };
  tasks: { completed: number; active: number; failed: number };
  platforms: { total: number; connected: number; enabled: number };
  worker: { state: string };
  ai: { configured: boolean; provider: string | null; model: string | null };
  recentTasks: { id: number; title: string; status: string; reward: number; currency: string; platformName: string }[];
  recentTransactions: { id: number; kind: string; amount: number; currency: string; reference: string | null; createdAt: string }[];
};

const PALETTE = ['#8B5CF6', '#22D3EE', '#FACC15', '#34D399', '#F472B6', '#FB923C'];

function Kpi({ title, value, children, demo: isDemo }: { title: string; value: string; children?: React.ReactNode; demo: boolean }) {
  return (
    <GlassCard className="min-w-[82%] snap-center p-4 md:min-w-0">
      <div className="mb-2 flex items-center justify-between text-sm text-muted"><span>{title}</span>{isDemo && <DemoBadge />}</div>
      <div className="flex items-end justify-between gap-3"><div className="text-3xl font-extrabold">{value}</div><div className="w-28">{children}</div></div>
    </GlassCard>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { mock } = useMock();
  const toast = useToast();
  const d = useApi<Dash>('/api/dashboard');
  const plats = useApi<Platform[]>('/api/platforms');

  if (d.error) return <ErrorState message={d.error} onRetry={d.reload} />;
  if (d.loading || !d.data) return <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>;

  const real = d.data;
  const cur = real.earnings.totals[0];
  const k = mock
    ? { total: demo.kpis.total.value, available: demo.kpis.available.value, pending: demo.kpis.pending.value, cur: 'USD', ratio: demo.kpis.available.ratio }
    : { total: cur?.total ?? 0, available: cur?.available ?? 0, pending: cur?.pending ?? 0, cur: cur?.currency ?? 'USD', ratio: cur && cur.available + cur.pending > 0 ? Math.round((cur.available / (cur.available + cur.pending)) * 100) : 0 };
  const counters = mock ? demo.counters : real.tasks;
  const donut = mock ? demo.donut : real.earnings.byPlatform.map((p, i) => ({ name: p.name, value: p.amount, color: PALETTE[i % PALETTE.length] }));

  const togglePlatform = async (p: Platform, v: boolean) => {
    try { await api(`/api/platforms/${p.id}`, { method: 'PATCH', body: { enabled: v } }); plats.reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.dashboard')} actions={<>
        <span className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted sm:flex"><Filter className="h-3.5 w-3.5" />Monthly</span>
        <span className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted sm:flex"><Download className="h-3.5 w-3.5" />Export</span>
      </>} />

      <div className="no-scrollbar -mx-3 flex snap-x gap-3 overflow-x-auto px-3 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
        <Kpi title={t('dash.total')} value={money(k.total, k.cur)} demo={mock}>{mock && <Sparkline data={demo.kpis.total.series} color="#A78BFA" />}</Kpi>
        <Kpi title={t('dash.available')} value={money(k.available, k.cur)} demo={mock}><Gauge value={k.ratio} /></Kpi>
        <Kpi title={t('dash.pending')} value={money(k.pending, k.cur)} demo={mock}>{mock && <Sparkline data={demo.kpis.pending.series} color="#FBBF24" />}</Kpi>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassCard className="p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{t('dash.flow')}</h2>{mock && <DemoBadge />}</div>
          {mock ? <FlowChart nodes={demo.flowNodes} links={demo.flowLinks} /> : <EmptyState title={t('common.noData')} text={t('dash.empty')} />}
        </GlassCard>
        <GlassCard className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{t('dash.weekly')}</h2>{mock && <DemoBadge />}</div>
          {mock ? <ColorBars data={demo.weekly} /> : <EmptyState title={t('common.noData')} />}
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassCard className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{t('dash.byPlatform')}</h2>{mock && <DemoBadge />}</div>
          {donut.length ? <Donut data={donut} /> : <EmptyState title={t('common.noData')} />}
        </GlassCard>
        <GlassCard className="p-4 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{t('dash.connections')}</h2><Link to="/platforms" className="text-xs text-accent">{t('dash.seeAll')}</Link></div>
          <div className="space-y-2">
            {plats.data?.filter((p) => !p.archivedAt).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{p.name}</div><div className="truncate text-xs text-muted">{t('dash.lastSync')}: {p.lastSyncAt ? shortDate(p.lastSyncAt) : '—'}</div></div>
                <Badge tone={p.status === 'connected' ? 'ok' : p.status === 'error' ? 'bad' : p.status === 'configured' ? 'info' : 'muted'}><StatusDot tone={p.status === 'connected' ? 'ok' : 'muted'} />{p.status}</Badge>
                <Toggle checked={p.enabled} onChange={(v) => togglePlatform(p, v)} label={p.name} />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[['dash.completed', counters.completed, 'text-ok'], ['dash.active', counters.active, 'text-info'], ['dash.failed', counters.failed, 'text-bad']].map(([key, n, c]) => (
          <GlassCard key={key as string} className="p-4"><div className="text-sm text-muted">{t(key as string)}</div><div className={`text-3xl font-extrabold ${c}`}>{n as number}</div></GlassCard>
        ))}
        <GlassCard className="p-4"><div className="text-sm text-muted">{t('dash.connected')}</div><div className="text-3xl font-extrabold">{real.platforms.connected}<span className="text-base text-muted"> / {real.platforms.total}</span></div></GlassCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-4">
          <h2 className="mb-2 font-bold">{t('dash.worker')}</h2>
          <Badge tone="muted"><StatusDot />{real.worker.state}</Badge>
          <p className="mt-2 text-xs text-muted">{t('dash.engineNote')}</p>
          <h2 className="mb-2 mt-4 font-bold">{t('dash.aiEngine')}</h2>
          {real.ai.configured ? <Badge tone="ok">{real.ai.provider}{real.ai.model ? ` · ${real.ai.model}` : ''}</Badge> : <Link to="/ai"><Badge tone="warn">{t('top.notConfigured')}</Badge></Link>}
        </GlassCard>
        <GlassCard className="p-4">
          <h2 className="mb-2 font-bold">{t('dash.recentTasks')}</h2>
          {real.recentTasks.length ? real.recentTasks.map((x) => <Link key={x.id} to={`/tasks/${x.id}`} className="flex justify-between border-t border-white/10 py-2 text-sm"><span className="truncate">{x.title}</span><Badge>{x.status}</Badge></Link>) : <p className="text-sm text-muted">{t('dash.noTasks')}</p>}
          <h2 className="mb-2 mt-4 font-bold">{t('dash.recentTx')}</h2>
          {mock
            ? demo.transactions.map((x) => <div key={x.id} className="flex items-center justify-between border-t border-white/10 py-2 text-sm"><span>{x.reference} <DemoBadge /></span><span>{money(x.amount, x.currency)}</span></div>)
            : real.recentTransactions.length ? real.recentTransactions.map((x) => <div key={x.id} className="flex justify-between border-t border-white/10 py-2 text-sm"><span>{x.kind}</span><span>{money(x.amount, x.currency)}</span></div>) : <p className="text-sm text-muted">{t('dash.noTx')}</p>}
        </GlassCard>
      </div>
    </div>
  );
}
