import { useState } from 'react';
import { Plus, Trash2, Info } from 'lucide-react';
import { useI18n } from '../i18n';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { money, shortDate } from '../lib/format';
import { GlassCard, PageHeader, Badge, EmptyState, ErrorState } from '../components/ui/Glass';
import { Button, Dialog, Field, Input, Select, DataTable } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

type Method = { id: number; kind: 'usdt' | 'usdc' | 'paypal' | 'visa'; label: string; network: string | null; token: string | null; address: string | null; email: string | null; verified: number; maskedCard: string | null };
type Req = { id: number; amount: number; fee: number; currency: string; status: string; txReference: string | null; createdAt: string; methodLabel: string };
const EMPTY = { kind: 'usdt', label: '', network: '', token: '', address: '', email: '', cardLast4: '' };

export default function Withdrawals() {
  const { t } = useI18n();
  const toast = useToast();
  const methods = useApi<Method[]>('/api/withdrawals/methods');
  const reqs = useApi<Req[]>('/api/withdrawals');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const crypto = f.kind === 'usdt' || f.kind === 'usdc';

  const save = async () => {
    const body: Record<string, string> = { kind: f.kind, label: f.label };
    if (crypto) { if (f.network) body.network = f.network; body.token = f.kind.toUpperCase(); if (f.address) body.address = f.address; }
    if (f.kind === 'paypal' && f.email) body.email = f.email;
    if (f.kind === 'visa' && f.cardLast4) body.cardLast4 = f.cardLast4;
    try { await api('/api/withdrawals/methods', { method: 'POST', body }); setOpen(false); setF(EMPTY); methods.reload(); }
    catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('wd.title')} actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{t('wd.add')}</Button>} />
      <GlassCard className="flex gap-3 border-info/30 p-4 text-sm"><Info className="h-5 w-5 shrink-0 text-info" /><div><div className="font-bold">{t('wd.manual')}</div><p className="text-muted">{t('wd.manualText')}</p></div></GlassCard>
      <GlassCard className="p-4">
        <h2 className="mb-3 font-bold">{t('wd.methods')}</h2>
        {methods.error && <ErrorState message={methods.error} onRetry={methods.reload} />}
        {methods.data && !methods.data.length && <EmptyState title={t('common.noData')} />}
        <div className="grid gap-2 md:grid-cols-2">
          {methods.data?.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
              <div className="min-w-0"><div className="font-medium">{m.label} <Badge tone="info">{m.kind.toUpperCase()}</Badge></div>
                <div dir="ltr" className="truncate text-xs text-muted">{[m.network, m.address, m.email, m.maskedCard].filter(Boolean).join(' · ') || '—'}</div></div>
              <Button variant="danger" aria-label={t('common.delete')} onClick={async () => { try { await api(`/api/withdrawals/methods/${m.id}`, { method: 'DELETE' }); methods.reload(); } catch (e) { toast((e as Error).message, 'bad'); } }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <h2 className="mb-3 font-bold">{t('wd.history')}</h2>
        {reqs.data?.length ? (
          <DataTable rows={reqs.data} rowKey={(r) => r.id} columns={[
            { key: 'm', header: t('wd.methods'), render: (r) => r.methodLabel }, { key: 'a', header: t('common.reward'), render: (r) => money(r.amount, r.currency) },
            { key: 'f', header: 'Fee', render: (r) => money(r.fee, r.currency) }, { key: 's', header: t('common.status'), render: (r) => <Badge>{r.status}</Badge> },
            { key: 'x', header: 'Ref', render: (r) => r.txReference ?? '—' }, { key: 'd', header: '', render: (r) => shortDate(r.createdAt) },
          ]} />
        ) : <EmptyState title={t('common.noData')} />}
      </GlassCard>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('wd.add')}>
        <div className="space-y-3">
          <Field label={t('wd.methods')}><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="usdt">USDT</option><option value="usdc">USDC</option><option value="paypal">PayPal</option><option value="visa">Visa</option></Select></Field>
          <Field label={t('common.name')}><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
          {crypto && <><Field label={t('wd.network')}><Input dir="ltr" value={f.network} onChange={(e) => setF({ ...f, network: e.target.value })} placeholder="e.g. TRC20" /></Field><Field label={t('wd.address')}><Input dir="ltr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field></>}
          {f.kind === 'paypal' && <Field label={t('wd.email')}><Input dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>}
          {f.kind === 'visa' && <Field label={t('wd.last4')} hint={t('wd.cardNote')}><Input dir="ltr" inputMode="numeric" maxLength={4} value={f.cardLast4} onChange={(e) => setF({ ...f, cardLast4: e.target.value.replace(/\D/g, '') })} /></Field>}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={f.label.trim().length < 2} onClick={save}>{t('common.save')}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
