import { useState } from 'react';
import { Plus, FlaskConical, Trash2, KeyRound, ShieldCheck, Send } from 'lucide-react';
import { useI18n } from '../i18n';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import type { Provider } from '../lib/types';
import { GlassCard, PageHeader, Badge, EmptyState, ErrorState, Skeleton } from '../components/ui/Glass';
import { Button, Dialog, Field, Input, Select } from '../components/ui/Controls';
import { useToast } from '../components/ui/Toast';

const EMPTY = {
  name: '',
  kind: 'ollama' as Provider['kind'],
  endpoint: 'http://127.0.0.1:11434',
  timeoutMs: '60000',
  retries: '2',
};

export default function AiEngine() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Provider[]>('/api/ai/providers');

  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState<number | 'add' | 'credential' | null>(null);
  const [result, setResult] = useState<Record<number, string>>({});
  const [credentialProvider, setCredentialProvider] = useState<Provider | null>(null);
  const [secret, setSecret] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<{ text: string; model: string; provider: string; usage?: { cost?: number } } | null>(null);

  const add = async () => {
    setBusy('add');
    try {
      await api('/api/ai/providers', {
        method: 'POST',
        body: {
          name: f.name,
          kind: f.kind,
          endpoint: f.endpoint,
          timeoutMs: Number(f.timeoutMs),
          retries: Number(f.retries),
        },
      });
      setOpen(false);
      setF(EMPTY);
      reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setBusy(null);
  };

  const test = async (p: Provider) => {
    setBusy(p.id);
    try {
      const r = await api<{ ok: boolean; message: string }>('/api/ai/test', {
        method: 'POST',
        body: {
          providerId: p.id,
          kind: p.kind,
          endpoint: p.endpoint,
          timeoutMs: Math.min(p.timeoutMs, 60000),
        },
      });
      setResult((x) => ({ ...x, [p.id]: r.message }));
      reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setBusy(null);
  };

  const patch = async (p: Provider, body: object) => {
    try {
      await api(`/api/ai/providers/${p.id}`, { method: 'PATCH', body });
      reload();
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  const saveCredential = async () => {
    if (!credentialProvider || secret.trim().length < 8) return;

    setBusy('credential');
    try {
      await api(`/api/ai/providers/${credentialProvider.id}/credentials`, {
        method: 'PUT',
        body: { secret: secret.trim() },
      });

      setSecret('');
      setCredentialProvider(null);
      reload();
      toast(t('ai.keySavedMessage'), 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setBusy(null);
  };

  const deleteCredential = async (p: Provider) => {
    setBusy('credential');
    try {
      await api(`/api/ai/providers/${p.id}/credentials`, {
        method: 'DELETE',
      });
      reload();
      toast(t('ai.keyDeletedMessage'), 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
    setBusy(null);
  };

  const generate = async () => {
    if (prompt.trim().length < 2 || generating) return;
    setGenerating(true);
    try {
      const r = await api<{ text: string; model: string; provider: string; usage?: { cost?: number } }>('/api/ai/generate', {
        method: 'POST',
        body: { prompt: prompt.trim(), maxTokens: 1200, temperature: 0.2 },
      });
      setGenerated(r);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('ai.title')}
        subtitle={t('ai.usage')}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('ai.add')}
          </Button>
        }
      />

      <GlassCard className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">{t('ai.chatTitle')}</h2>
          <Badge tone="info">{t('ai.chatReady')}</Badge>
        </div>
        <p className="text-xs text-muted">{t('ai.chatHelp')}</p>
        <textarea
          dir="auto"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('ai.chatPlaceholder')}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 p-3 text-sm outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/20 placeholder:text-muted/60"
        />
        <div className="flex justify-end">
          <Button variant="primary" loading={generating} disabled={prompt.trim().length < 2} onClick={generate}>
            <Send className="h-4 w-4" />
            {t('ai.send')}
          </Button>
        </div>
        {generated && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="whitespace-pre-wrap break-words text-sm leading-7" dir="auto">{generated.text}</div>
            <div className="border-t border-white/10 pt-2 text-xs text-muted" dir="ltr">
              {generated.provider} · {generated.model}
              {generated.usage?.cost !== undefined && <span> · ${generated.usage.cost.toFixed(6)}</span>}
            </div>
          </div>
        )}
      </GlassCard>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <Skeleton className="h-32" />}

      {data && !data.length && (
        <GlassCard>
          <EmptyState title={t('ai.empty')} text={t('ai.emptyText')} />
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((p) => (
          <GlassCard key={p.id} className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">{p.name}</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="info">{p.kind}</Badge>
                {!p.isLocal && <Badge tone="warn">{t('ai.notLocal')}</Badge>}
              </div>
            </div>

            <div dir="ltr" className="truncate text-xs text-muted">
              {p.endpoint}
            </div>

            {p.kind === 'openai_compatible' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="h-4 w-4 text-muted" />
                  <span className="text-muted">
                    {p.hasCredential ? t('ai.keySaved') : t('ai.noKey')}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setSecret('');
                      setCredentialProvider(p);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    {t('ai.setKey')}
                  </Button>

                  {p.hasCredential && (
                    <Button
                      variant="danger"
                      loading={busy === 'credential'}
                      onClick={() => deleteCredential(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('ai.deleteKey')}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {p.kind === 'ollama' && (
              <p className="text-xs text-muted">{t('ai.ollamaNoKey')}</p>
            )}

            <Field label={t('ai.pickModel')}>
              <Select
                value={p.model ?? ''}
                onChange={(e) => patch(p, { model: e.target.value || null })}
              >
                <option value="">—</option>
                {p.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>

            {result[p.id] && (
              <p className="text-xs text-muted">{result[p.id]}</p>
            )}

            <div className="flex gap-2">
              <Button loading={busy === p.id} onClick={() => test(p)}>
                <FlaskConical className="h-4 w-4" />
                {t('ai.test')}
              </Button>

              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api(`/api/ai/providers/${p.id}`, { method: 'DELETE' });
                    reload();
                  } catch (e) {
                    toast((e as Error).message, 'bad');
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t('common.delete')}
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title={t('ai.add')}>
        <div className="space-y-3">
          <Field label={t('common.name')}>
            <Input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </Field>

          <Field label={t('ai.kind')}>
            <Select
              value={f.kind}
              onChange={(e) =>
                setF({
                  ...f,
                  kind: e.target.value as Provider['kind'],
                  endpoint: e.target.value === 'ollama'
                    ? 'http://127.0.0.1:11434'
                    : 'http://127.0.0.1:8080',
                })
              }
            >
              <option value="ollama">Ollama</option>
              <option value="openai_compatible">OpenAI-compatible</option>
            </Select>
          </Field>

          <Field label={t('ai.endpoint')}>
            <Input
              dir="ltr"
              value={f.endpoint}
              onChange={(e) => setF({ ...f, endpoint: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('ai.timeout')}>
              <Input
                type="number"
                value={f.timeoutMs}
                onChange={(e) => setF({ ...f, timeoutMs: e.target.value })}
              />
            </Field>

            <Field label={t('ai.retries')}>
              <Input
                type="number"
                value={f.retries}
                onChange={(e) => setF({ ...f, retries: e.target.value })}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              loading={busy === 'add'}
              disabled={f.name.trim().length < 2}
              onClick={add}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!credentialProvider}
        onClose={() => {
          setCredentialProvider(null);
          setSecret('');
        }}
        title={t('ai.setKey')}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('ai.keyHelp')}</p>

          <Field label={t('ai.apiKey')}>
            <Input
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="API key"
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setCredentialProvider(null);
                setSecret('');
              }}
            >
              {t('common.cancel')}
            </Button>

            <Button
              variant="primary"
              loading={busy === 'credential'}
              disabled={secret.trim().length < 8}
              onClick={saveCredential}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
