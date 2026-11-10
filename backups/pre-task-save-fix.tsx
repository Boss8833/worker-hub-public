import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useMock } from '../lib/mock';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { demoTasks } from '../lib/demo';
import { money, shortDate } from '../lib/format';
import type { TaskRow } from '../lib/types';
import { GlassCard, PageHeader, Badge, DemoBadge, EmptyState, ErrorState, Skeleton } from '../components/ui/Glass';
import { Button, Input, Select, DataTable, Dialog, Field } from '../components/ui/Controls';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'muted'> = {
  completed: 'ok', submitted: 'info', failed: 'bad', rejected: 'bad', awaiting_approval: 'warn', queued: 'info', executing: 'info',
  validating: 'info', eligible: 'ok', ineligible: 'muted', discovered: 'muted',
};
const AVAILABLE = ['discovered', 'eligible', 'ineligible', 'queued', 'executing', 'validating', 'awaiting_approval'];

function TaskList({ statuses }: { statuses: string[] }) {
  const { t } = useI18n();
  const { mock } = useMock();
  const nav = useNavigate();
  const real = useApi<TaskRow[]>(`/api/tasks?status=${statuses.join(',')}`);
  const [q, setQ] = useState('');
  const [min, setMin] = useState('');
  const [sort, setSort] = useState('new');

  const rows = useMemo(() => {
    let r = [...(real.data ?? []), ...(mock ? demoTasks.filter((x) => statuses.includes(x.status)) : [])];
    if (q) r = r.filter((x) => (x.title + x.platformName).toLowerCase().includes(q.toLowerCase()));
    if (min) r = r.filter((x) => x.reward >= Number(min));
    if (sort === 'reward') r.sort((a, b) => b.reward - a.reward);
    if (sort === 'deadline') r.sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'));
    return r;
  }, [real.data, mock, q, min, sort, statuses]);

  return (
    <GlassCard className="p-4">
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="number" min="0" placeholder={t('tasks.minReward')} value={min} onChange={(e) => setMin(e.target.value)} />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('tasks.sort')}>
          <option value="new">{t('tasks.sortNew')}</option><option value="reward">{t('tasks.sortReward')}</option><option value="deadline">{t('tasks.sortDeadline')}</option>
        </Select>
      </div>
      {real.error && <ErrorState message={real.error} onRetry={real.reload} />}
      {real.loading && !real.data && <Skeleton className="h-24" />}
      {!real.loading && !rows.length && <EmptyState title={t('tasks.empty')} text={t('tasks.emptyText')} />}
      {rows.length > 0 && (
        <DataTable rows={rows} rowKey={(r) => r.id} onRowClick={(r) => nav(`/tasks/${r.id}`)} columns={[
          { key: 't', header: t('tasks.title'), render: (r) => <span className="font-medium">{r.title} {r.demo && <DemoBadge />}</span> },
          { key: 'p', header: t('common.platform'), render: (r) => r.platformName },
          { key: 'r', header: t('common.reward'), render: (r) => money(r.reward, r.currency) },
          { key: 'd', header: t('common.deadline'), render: (r) => (r.deadline ? shortDate(r.deadline) : '—') },
          { key: 'a', header: t('tasks.ai'), render: (r) => r.aiSuitability ?? '—' },
          { key: 's', header: t('common.status'), render: (r) => <Badge tone={TONE[r.status] ?? 'muted'}>{r.status}</Badge> },
        ]} />
      )}
    </GlassCard>
  );
}

type PlatformOption = { id: number; name: string };
type NewTaskForm = {
  platformId: string; externalId: string; title: string;
  description: string; requirements: string; reward: string;
  currency: string; deadline: string; aiSuitability: string;
};

const NEW_TASK: NewTaskForm = {
  platformId: '', externalId: '', title: '', description: '',
  requirements: '', reward: '0', currency: 'USD',
  deadline: '', aiSuitability: '',
};

export function TasksPage() {
  const { t } = useI18n();
  const toast = useToast();
  const platforms = useApi<PlatformOption[]>('/api/platforms');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(NEW_TASK);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const save = async () => {
    if (!form.platformId || !form.externalId.trim() || form.title.trim().length < 2) return;
    setBusy(true);
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          platformId: Number(form.platformId),
          externalId: form.externalId.trim(),
          title: form.title.trim(),
          description: form.description.trim() || null,
          requirements: form.requirements.trim() || null,
          reward: Number(form.reward || 0),
          currency: form.currency.trim().toUpperCase(),
          deadline: form.deadline || null,
          aiSuitability: form.aiSuitability.trim() || null,
        },
      });
      toast(t('tasks.created'));
      setOpen(false);
      setForm(NEW_TASK);
      setRefresh((v) => v + 1);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <PageHeader title={t('tasks.title')} actions={
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />{t('tasks.add')}
      </Button>
    } />
    {platforms.error && <ErrorState message={platforms.error} onRetry={platforms.reload} />}
    <TaskList key={refresh} statuses={AVAILABLE} />
    <Dialog open={open} onClose={() => setOpen(false)} title={t('tasks.add')}>
      <div className="space-y-3">
        <Field label={t('common.platform')}>
          <Select value={form.platformId} onChange={(e) => setForm({ ...form, platformId: e.target.value })}>
            <option value="">{t('tasks.choosePlatform')}</option>
            {platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label={t('tasks.externalId')} hint={t('tasks.externalIdHint')}>
          <Input dir="ltr" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} />
        </Field>
        <Field label={t('tasks.titleField')}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={t('task.instructions')}>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label={t('task.requirements')}>
          <Input value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.reward')}>
            <Input dir="ltr" type="number" min="0" step="0.01" value={form.reward}
              onChange={(e) => setForm({ ...form, reward: e.target.value })} />
          </Field>
          <Field label={t('tasks.currency')}>
            <Input dir="ltr" maxLength={8} value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </Field>
        </div>
        <Field label={t('common.deadline')}>
          <Input dir="ltr" type="date" value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        </Field>
        <Field label={t('tasks.ai')}>
          <Input value={form.aiSuitability}
            onChange={(e) => setForm({ ...form, aiSuitability: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy}
            disabled={!form.platformId || !form.externalId.trim() ||
              form.title.trim().length < 2 ||
              !/^[A-Z]{3,8}$/.test(form.currency.trim().toUpperCase()) ||
              Number(form.reward) < 0 || !Number.isFinite(Number(form.reward)) ||
              !platforms.data?.length}
            onClick={save}>{t('common.save')}</Button>
        </div>
      </div>
    </Dialog>
  </div>;
}

const GROUPS: Record<string, string[]> = {
  completed: ['completed', 'submitted'], failed: ['failed'], rejected: ['rejected'], pending: ['queued', 'executing', 'validating', 'awaiting_approval'],
};
export function HistoryPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('completed');
  return (
    <div>
      <PageHeader title={t('nav.history')} />
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {Object.keys(GROUPS).map((k) => <Button key={k} variant={tab === k ? 'primary' : 'secondary'} onClick={() => setTab(k)}>{t(`hist.${k}`)}</Button>)}
      </div>
      <TaskList key={tab} statuses={GROUPS[tab]} />
    </div>
  );
}

const STEPS = ['discovered', 'eligible', 'queued', 'executing', 'validating', 'awaiting_approval', 'submitted', 'completed'];

type TaskDetailsData = TaskRow & {
  platformId?: number;
  externalId?: string;
  createdAt?: string;
  executions?: Array<{
    id: number; state: string; attempt: number; error: string | null;
    startedAt: string | null; finishedAt: string | null;
  }>;
  validations?: Array<{
    id: number; passed: number | boolean; details: string | null; createdAt: string;
  }>;
  submissions?: Array<{
    id: number; status: string; submittedAt: string | null;
  }>;
};

export function TaskDetails() {
  const { t } = useI18n();
  const { mock } = useMock();
  const { id } = useParams();
  const isDemo = String(id).startsWith('demo-');
  const real = useApi<TaskDetailsData>(isDemo ? null : `/api/tasks/${id}`);
  const task = isDemo ? (mock ? demoTasks.find((x) => x.id === id) : undefined) : real.data;
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', requirements: '', reward: '0',
    currency: 'USD', deadline: '', aiSuitability: '',
  });
  const toast = useToast();

  const openEdit = () => {
    if (!task) return;
    setForm({
      title: task.title,
      description: task.description ?? '',
      requirements: task.requirements ?? '',
      reward: String(task.reward),
      currency: task.currency,
      deadline: task.deadline ?? '',
      aiSuitability: task.aiSuitability ?? '',
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!task || isDemo) return;
    const reward = Number(form.reward);
    if (form.title.trim().length < 2 ||
        !/^[A-Z]{3,8}$/.test(form.currency.trim().toUpperCase()) ||
        !Number.isFinite(reward) || reward < 0) {
      toast(t('tasks.invalidForm'), 'bad');
      return;
    }

    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description || null,
          requirements: form.requirements || null,
          reward,
          currency: form.currency.trim().toUpperCase(),
          deadline: form.deadline || null,
          aiSuitability: form.aiSuitability || null,
        }),
      });
      setEditOpen(false);
      await real.reload();
      toast(t('tasks.updateSuccess'), 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : t('tasks.updateFailed'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!isDemo && real.loading) return <Skeleton className="h-40" />;
  if (!task) return <GlassCard><ErrorState message={real.error ?? 'Task not found'} /></GlassCard>;

  const detail = task as TaskDetailsData;
  const executions = detail.executions ?? [];
  const validations = detail.validations ?? [];
  const submissions = detail.submissions ?? [];
  const idx = STEPS.indexOf(task.status);

  return (
    <div className="space-y-4">
      <PageHeader
        title={task.title}
        subtitle={`${task.platformName} · ${money(task.reward, task.currency)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isDemo && <Button variant="secondary" onClick={openEdit}>{t('tasks.edit')}</Button>}
            {task.demo && <DemoBadge />}
            <Badge tone={TONE[task.status] ?? 'muted'}>{task.status}</Badge>
          </div>
        }
      />

      <Dialog open={editOpen} onClose={() => !busy && setEditOpen(false)} title={t('tasks.edit')}>
        <div className="space-y-3">
          <Field label={t('tasks.titleField')}>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t('task.instructions')}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label={t('task.requirements')}>
            <Input value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.reward')}>
              <Input dir="ltr" type="number" min="0" step="0.01" value={form.reward}
                onChange={(e) => setForm({ ...form, reward: e.target.value })} />
            </Field>
            <Field label={t('tasks.currency')}>
              <Input dir="ltr" maxLength={8} value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
            </Field>
          </div>
          <Field label={t('common.deadline')}>
            <Input dir="ltr" type="date" value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
          </Field>
          <Field label={t('tasks.ai')}>
            <Input value={form.aiSuitability}
              onChange={(e) => setForm({ ...form, aiSuitability: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button disabled={busy} onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy}
              disabled={form.title.trim().length < 2 ||
                !/^[A-Z]{3,8}$/.test(form.currency.trim().toUpperCase()) ||
                !Number.isFinite(Number(form.reward)) || Number(form.reward) < 0}
              onClick={saveEdit}>{t('common.save')}</Button>
          </div>
        </div>
      </Dialog>

      <GlassCard className="p-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {STEPS.map((s, i) => <Badge key={s} tone={i <= idx ? 'brand' : 'muted'}>{s}</Badge>)}
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="space-y-4 p-4">
          <h3 className="font-semibold">{t('task.details')}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><div className="text-xs text-muted">{t('task.taskId')}</div><p className="break-all">{String(task.id)}</p></div>
            <div><div className="text-xs text-muted">{t('task.externalId')}</div><p className="break-all">{detail.externalId ?? '—'}</p></div>
            <div><div className="text-xs text-muted">{t('task.platform')}</div><p>{task.platformName}</p></div>
            <div><div className="text-xs text-muted">{t('common.reward')}</div><p>{money(task.reward, task.currency)}</p></div>
            <div><div className="text-xs text-muted">{t('common.deadline')}</div><p>{task.deadline ? shortDate(task.deadline) : '—'}</p></div>
            <div><div className="text-xs text-muted">{t('task.createdAt')}</div><p>{detail.createdAt ? shortDate(detail.createdAt) : '—'}</p></div>
            <div className="col-span-2"><div className="text-xs text-muted">{t('task.aiSuitability')}</div><p>{task.aiSuitability ?? '—'}</p></div>
          </div>
          <div className="border-t border-white/10 pt-3">
            <div className="mb-1 text-xs text-muted">{t('task.instructions')}</div>
            <p className="whitespace-pre-wrap text-sm">{task.description ?? '—'}</p>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">{t('task.requirements')}</div>
            <p className="whitespace-pre-wrap text-sm">{task.requirements ?? '—'}</p>
          </div>
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <h3 className="font-semibold">{t('task.exec')}</h3>
          <div className="text-sm">
            <div className="text-xs text-muted">{t('common.status')}</div>
            <Badge tone={TONE[task.status] ?? 'muted'}>{task.status}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
            {['execute', 'approve', 'submit'].map((a) => (
              <Button key={a} disabled title={t('task.phase')}>{t(`task.${a}`)}</Button>
            ))}
          </div>
          <p className="text-xs text-muted">{t('task.phase')}</p>
        </GlassCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{t('task.executionHistory')}</h3>
            <Badge>{executions.length}</Badge>
          </div>
          {!executions.length && <p className="text-sm text-muted">{t('task.noExecutions')}</p>}
          {executions.map((item) => (
            <div key={item.id} className="space-y-1 border-t border-white/10 pt-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={TONE[item.state] ?? 'muted'}>{item.state}</Badge>
                <span className="text-xs text-muted">{t('task.attempt')}: {item.attempt}</span>
              </div>
              <p className="text-xs text-muted">{t('task.startedAt')}: {item.startedAt ? shortDate(item.startedAt) : '—'}</p>
              <p className="text-xs text-muted">{t('task.finishedAt')}: {item.finishedAt ? shortDate(item.finishedAt) : '—'}</p>
              {item.error && <p className="break-words text-xs text-red-400">{t('task.error')}: {item.error}</p>}
            </div>
          ))}
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{t('task.validationHistory')}</h3>
            <Badge>{validations.length}</Badge>
          </div>
          {!validations.length && <p className="text-sm text-muted">{t('task.noValidations')}</p>}
          {validations.map((item) => (
            <div key={item.id} className="space-y-1 border-t border-white/10 pt-3 text-sm">
              <Badge tone={item.passed ? 'ok' : 'bad'}>{item.passed ? t('task.passed') : t('task.failed')}</Badge>
              <p className="text-xs text-muted">{item.createdAt ? shortDate(item.createdAt) : '—'}</p>
              {item.details && <p className="whitespace-pre-wrap break-words text-xs">{item.details}</p>}
            </div>
          ))}
        </GlassCard>

        <GlassCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{t('task.submissionHistory')}</h3>
            <Badge>{submissions.length}</Badge>
          </div>
          {!submissions.length && <p className="text-sm text-muted">{t('task.noSubmissions')}</p>}
          {submissions.map((item) => (
            <div key={item.id} className="space-y-1 border-t border-white/10 pt-3 text-sm">
              <Badge tone={TONE[item.status] ?? 'muted'}>{item.status}</Badge>
              <p className="text-xs text-muted">{t('task.submittedAt')}: {item.submittedAt ? shortDate(item.submittedAt) : '—'}</p>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  );
}
