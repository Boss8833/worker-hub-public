import { useI18n } from '../i18n';
import { useMock } from '../lib/mock';
import { useApi } from '../hooks/useApi';
import { demo } from '../lib/demo';
import { money, shortDate } from '../lib/format';
import type { EarningTotals } from '../lib/types';
import { GlassCard, PageHeader, DemoBadge, EmptyState, ErrorState, Skeleton } from '../components/ui/Glass';
import { DataTable } from '../components/ui/Controls';

type Tx = { id: number | string; kind: string; amount: number; currency: string; reference: string | null; createdAt?: string; platformName?: string | null; demo?: boolean };

export default function Earnings() {
  const { t } = useI18n();
  const { mock } = useMock();
  const e = useApi<{ totals: EarningTotals[]; byPlatform: { name: string; currency: string; amount: number }[] }>('/api/earnings');
  const tx = useApi<Tx[]>('/api/transactions');
  if (e.error) return <ErrorState message={e.error} onRetry={e.reload} />;
  if (!e.data) return <Skeleton className="h-40" />;

  const totals: EarningTotals[] = mock ? [{ currency: 'USD', total: demo.kpis.total.value, available: demo.kpis.available.value, pending: demo.kpis.pending.value, withdrawn: 541.9 }] : e.data.totals;
  const rows: Tx[] = mock ? demo.transactions.map((x) => ({ ...x, demo: true })) : tx.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={t('earn.title')} subtitle={t('earn.rule')} />
      {!totals.length && <GlassCard><EmptyState title={t('common.noData')} text={t('dash.empty')} /></GlassCard>}
      {totals.map((x) => (
        <div key={x.currency} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[['dash.total', x.total], ['dash.available', x.available], ['dash.pending', x.pending], ['earn.withdrawn', x.withdrawn]].map(([k, v]) => (
            <GlassCard key={k as string} className="p-4"><div className="flex items-center justify-between text-sm text-muted">{t(k as string)}{mock && <DemoBadge />}</div><div className="text-2xl font-extrabold">{money(v as number, x.currency)}</div></GlassCard>
          ))}
        </div>
      ))}
      <GlassCard className="p-4">
        <h2 className="mb-3 font-bold">{t('earn.tx')}</h2>
        {rows.length ? (
          <DataTable rows={rows} rowKey={(r) => r.id} columns={[
            { key: 'k', header: t('common.name'), render: (r) => <span>{r.kind} {r.demo && <DemoBadge />}</span> },
            { key: 'r', header: 'Ref', render: (r) => r.reference ?? '—' },
            { key: 'a', header: t('common.reward'), render: (r) => money(r.amount, r.currency) },
            { key: 'd', header: '', render: (r) => (r.createdAt ? shortDate(r.createdAt) : '—') },
          ]} />
        ) : <EmptyState title={t('dash.noTx')} />}
      </GlassCard>
    </div>
  );
}
