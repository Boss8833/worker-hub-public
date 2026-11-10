import { useState } from 'react';
import { useI18n } from '../i18n';
import { useMock } from '../lib/mock';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import type { Health } from '../lib/types';
import { GlassCard, PageHeader, Badge } from '../components/ui/Glass';
import { Button, Field, Input, Toggle } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { mock, setMock } = useMock();
  const toast = useToast();
  const health = useApi<Health>('/api/health');
  const app = useApi<{ notifications: boolean }>('/api/settings');
  const backups = useApi<{ file: string; bytes: number }[]>('/api/settings/backups');
  const [token, setToken] = useState(sessionStorage.getItem('wh_token') ?? '');
  const row = (label: string, sub: string | null, el: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2"><div><div className="text-sm">{label}</div>{sub && <div className="text-xs text-muted">{sub}</div>}</div>{el}</div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t('set.title')} />
      <GlassCard className="p-4">
        {row(t('set.language'), null, <div className="flex gap-2">{(['ar', 'en'] as const).map((l) => <Button key={l} variant={lang === l ? 'primary' : 'secondary'} onClick={() => setLang(l)}>{l === 'ar' ? 'العربية' : 'English'}</Button>)}</div>)}
        {row(t('set.mock'), t('set.mockText'), <Toggle checked={mock} onChange={setMock} label={t('set.mock')} />)}
        {row(t('set.notifications'), null, <Toggle checked={app.data?.notifications ?? true} onChange={async (v) => { try { await api('/api/settings', { method: 'PUT', body: { notifications: v } }); app.reload(); } catch (e) { toast((e as Error).message, 'bad'); } }} label={t('set.notifications')} />)}
      </GlassCard>
      <GlassCard className="space-y-3 p-4">
        <h2 className="font-bold">{t('set.security')}</h2>
        <p className="text-sm text-muted">{t('set.assume')}</p>
        <div className="flex items-center justify-between text-sm"><span>{t('set.encryption')}</span><Badge tone={health.data?.encryptionConfigured ? 'ok' : 'warn'}>{health.data?.encryptionConfigured ? t('set.on') : t('set.off')}</Badge></div>
        <Field label={t('set.token')} hint={t('set.tokenText')}>
          <div className="flex gap-2"><Input dir="ltr" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
            <Button onClick={() => { if (token) sessionStorage.setItem('wh_token', token); else sessionStorage.removeItem('wh_token'); toast(t('common.saved')); }}>{t('common.save')}</Button></div>
        </Field>
      </GlassCard>
      <GlassCard className="space-y-3 p-4">
        <h2 className="font-bold">{t('set.backup')}</h2>
        <Button onClick={async () => { try { const r = await api<{ file: string }>('/api/settings/backup', { method: 'POST' }); toast(r.file); backups.reload(); } catch (e) { toast((e as Error).message, 'bad'); } }}>{t('set.backupNow')}</Button>
        <ul className="space-y-1 text-xs text-muted" dir="ltr">{backups.data?.map((b) => <li key={b.file}>{b.file} · {(b.bytes / 1024).toFixed(0)} KB</li>)}</ul>
      </GlassCard>
      <GlassCard className="p-4 text-sm">
        <h2 className="mb-2 font-bold">{t('set.about')}</h2>
        <div dir="ltr" className="space-y-1 text-muted"><div>Worker Hub v{health.data?.version ?? '…'}</div><div>Node {health.data?.node ?? '…'}</div></div>
      </GlassCard>
    </div>
  );
}
