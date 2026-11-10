import { useState } from 'react';
import { Plus, Pencil, Archive, RotateCcw, FlaskConical } from 'lucide-react';
import { useI18n } from '../i18n';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import type { Platform } from '../lib/types';
import { GlassCard, PageHeader, Badge, ErrorState, Skeleton, EmptyState } from '../components/ui/Glass';
import { Button, Dialog, Field, Input, Select, Toggle } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

type Form = { name: string; baseUrl: string; authType: Platform['authType']; submissionPolicy: Platform['submissionPolicy']; minReward: string };
const EMPTY: Form = { name: '', baseUrl: '', authType: 'bearer', submissionPolicy: 'both', minReward: '0' };

export default function Platforms() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Platform[]>('/api/platforms');
  const [editing, setEditing] = useState<Platform | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState<number | 'save' | null>(null);
  const [archiving, setArchiving] = useState<Platform | null>(null);

  const open = (p: Platform | 'new') => {
    setForm(p === 'new' ? EMPTY : { name: p.name, baseUrl: p.baseUrl ?? '', authType: p.authType, submissionPolicy: p.submissionPolicy, minReward: String(p.minReward) });
    setEditing(p);
  };
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast(ok); reload(); } catch (e) { toast((e as Error).message, 'bad'); }
  };
  const save = async () => {
    setBusy('save');
    await run(async () => {
      const body = { name: form.name, baseUrl: form.baseUrl.trim() || null, authType: form.authType };
      if (editing === 'new') await api('/api/platforms', { method: 'POST', body });
      else if (editing) await api(`/api/platforms/${editing.id}`, { method: 'PATCH', body: { ...body, submissionPolicy: form.submissionPolicy, minReward: Number(form.minReward) || 0 } });
      setEditing(null);
    }, t('common.saved'));
    setBusy(null);
  };
  const test = async (p: Platform) => { setBusy(p.id); await run(() => api(`/api/platforms/${p.id}/test`, { method: 'POST' })); setBusy(null); };

  return (
    <div>
      <PageHeader title={t('nav.platforms')} subtitle={t('plat.docsNote')} actions={<Button variant="primary" onClick={() => open('new')}><Plus className="h-4 w-4" />{t('plat.add')}</Button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-40" />}
      {data && !data.length && <GlassCard><EmptyState title={t('common.noData')} /></GlassCard>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((p) => (
          <GlassCard key={p.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="truncate text-lg font-bold">{p.name}</div><div className="truncate text-xs text-muted">{p.baseUrl ?? '—'}</div></div>
              {!p.archivedAt && <Toggle checked={p.enabled} onChange={(v) => run(() => api(`/api/platforms/${p.id}`, { method: 'PATCH', body: { enabled: v } }))} label={t('common.enabled')} />}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={p.status === 'connected' ? 'ok' : p.status === 'error' ? 'bad' : 'muted'}>{p.status}</Badge>
              {p.archivedAt && <Badge tone="warn">{t('plat.archived')}</Badge>}
              {!p.implemented && <Badge tone="warn">{t('plat.template')}</Badge>}
              <Badge tone={p.hasCredential ? 'info' : 'muted'}>{p.hasCredential ? t('plat.hasCred') : t('plat.noCred')}</Badge>
            </div>
            {p.lastTest && <p className={`text-xs ${p.lastTest.ok ? 'text-ok' : 'text-bad'}`}>{t('plat.lastTest')}: {p.lastTest.message}</p>}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">{t('plat.caps')}</summary>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {Object.entries(p.capabilities).map(([k, v]) => <div key={k} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1 text-xs"><span>{t(`cap.${k}`)}</span><Badge tone={v === 'supported' ? 'ok' : v === 'unsupported' ? 'bad' : 'muted'}>{t(`capState.${v}`)}</Badge></div>)}
              </div>
            </details>
            <div className="flex flex-wrap gap-2">
              {!p.archivedAt && <Button onClick={() => test(p)} loading={busy === p.id}><FlaskConical className="h-4 w-4" />{t('common.test')}</Button>}
              {!p.archivedAt && <Button onClick={() => open(p)}><Pencil className="h-4 w-4" />{t('common.edit')}</Button>}
              {p.archivedAt
                ? <Button onClick={() => run(() => api(`/api/platforms/${p.id}/restore`, { method: 'POST' }), t('plat.restored'))}><RotateCcw className="h-4 w-4" />{t('plat.restore')}</Button>
                : <Button variant="danger" onClick={() => setArchiving(p)}><Archive className="h-4 w-4" />{t('plat.archive')}</Button>}
            </div>
          </GlassCard>
        ))}
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('plat.add') : t('plat.edit')}>
        <div className="space-y-3">
          <Field label={t('common.name')}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('plat.baseUrl')} hint="https://…"><Input dir="ltr" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://" /></Field>
          <Field label={t('plat.auth')}>
            <Select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value as Platform['authType'] })}>
              <option value="bearer">Bearer Token</option><option value="api_key">API Key</option><option value="custom">Custom (adapter)</option>
            </Select>
          </Field>
          {editing !== 'new' && <>
            <Field label={t('plat.policy')}>
              <Select value={form.submissionPolicy} onChange={(e) => setForm({ ...form, submissionPolicy: e.target.value as Platform['submissionPolicy'] })}>
                <option value="both">BOTH</option><option value="auto">AUTO</option><option value="manual">MANUAL</option>
              </Select>
            </Field>
            <Field label={t('plat.minReward')}><Input type="number" min="0" step="0.01" value={form.minReward} onChange={(e) => setForm({ ...form, minReward: e.target.value })} /></Field>
          </>}
          <div className="flex justify-end gap-2 pt-2"><Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy === 'save'} disabled={form.name.trim().length < 2} onClick={save}>{t('common.save')}</Button></div>
        </div>
      </Dialog>

      <Dialog open={!!archiving} onClose={() => setArchiving(null)} title={archiving?.name ?? ''}>
        <p className="mb-4 text-sm text-muted">{t('plat.archiveConfirm')}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setArchiving(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={async () => { const p = archiving!; setArchiving(null); await run(() => api(`/api/platforms/${p.id}`, { method: 'DELETE' }), t('plat.archived')); }}>
            <Archive className="h-4 w-4" />{t('plat.archive')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
