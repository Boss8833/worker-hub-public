import { useState } from 'react';
import { KeyRound, Trash2, ShieldAlert } from 'lucide-react';
import { useI18n } from '../i18n';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import type { Health, Platform } from '../lib/types';
import { GlassCard, PageHeader, Badge, ErrorState, Skeleton } from '../components/ui/Glass';
import { Button, Dialog, Field, Input } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

export default function ApiManager() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Platform[]>('/api/platforms');
  const health = useApi<Health>('/api/health');
  const [target, setTarget] = useState<Platform | null>(null);
  const [secret, setSecret] = useState('');
  const [header, setHeader] = useState('X-API-Key');
  const [busy, setBusy] = useState(false);
  const keyMissing = health.data && !health.data.encryptionConfigured;

  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/platforms/${target.id}/credentials`, { method: 'PUT', body: { secret, ...(target.authType === 'api_key' ? { headerName: header } : {}) } });
      toast(t('common.saved')); setTarget(null); setSecret(''); reload();
    } catch (e) { toast((e as Error).message, 'bad'); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('api.title')} subtitle={t('api.writeOnly')} />
      {keyMissing && <GlassCard className="flex gap-3 border-warn/40 p-4 text-sm text-warn"><ShieldAlert className="h-5 w-5 shrink-0" />{t('api.noKey')}</GlassCard>}
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-32" />}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.filter((p) => !p.archivedAt).map((p) => (
          <GlassCard key={p.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2"><div className="font-bold">{p.name}</div><Badge tone={p.hasCredential ? 'ok' : 'muted'}>{p.hasCredential ? t('plat.hasCred') : t('plat.noCred')}</Badge></div>
            <div className="text-xs text-muted">{p.authType === 'bearer' ? 'Bearer Token' : p.authType === 'api_key' ? 'API Key' : 'Custom'} · {p.baseUrl ?? '—'}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!!keyMissing} onClick={() => { setTarget(p); setSecret(''); }}><KeyRound className="h-4 w-4" />{t('api.setCreds')}</Button>
              {p.hasCredential && <Button variant="danger" onClick={async () => { try { await api(`/api/platforms/${p.id}/credentials`, { method: 'DELETE' }); toast(t('common.saved')); reload(); } catch (e) { toast((e as Error).message, 'bad'); } }}><Trash2 className="h-4 w-4" />{t('api.deleteCreds')}</Button>}
            </div>
          </GlassCard>
        ))}
      </div>
      <Dialog open={!!target} onClose={() => setTarget(null)} title={target?.name ?? ''}>
        <div className="space-y-3">
          <Field label={t('api.secret')} hint={t('api.writeOnly')}><Input dir="ltr" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
          {target?.authType === 'api_key' && <Field label={t('api.header')}><Input dir="ltr" value={header} onChange={(e) => setHeader(e.target.value)} /></Field>}
          <div className="flex justify-end gap-2"><Button onClick={() => setTarget(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} disabled={secret.length < 8} onClick={save}>{t('common.save')}</Button></div>
        </div>
      </Dialog>
    </div>
  );
}
