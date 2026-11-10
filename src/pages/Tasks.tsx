import { useMemo, useState } from 'react';
import { Plus, CheckCircle2, XCircle, Instagram, Youtube, Twitter, Globe } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useMock } from '../lib/mock';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { demoTasks } from '../lib/demo';
import { money, shortDate } from '../lib/format';
import type { TaskRow, Platform } from '../lib/types';
import { GlassCard, PageHeader, Badge, DemoBadge, EmptyState, ErrorState, Skeleton } from '../components/ui/Glass';
import { Button, Input, Select, DataTable, Dialog, Field } from '../components/ui/Controls';

const TONE: Record<string, 'ok' | 'warn' | 'bad' | 'info' | 'muted'> = {
  completed: 'ok', submitted: 'info', failed: 'bad', rejected: 'bad', awaiting_approval: 'warn',
  queued: 'info', executing: 'info', validating: 'info', eligible: 'ok', ineligible: 'muted', discovered: 'muted',
};

const MAIN_TABS = {
  all: ['discovered', 'eligible', 'ineligible', 'queued', 'executing', 'validating', 'awaiting_approval'],
  approval: ['awaiting_approval'],
  active: ['queued', 'executing', 'validating'],
  done: ['submitted', 'completed'],
};

function getPlatformIcon(slug: string, name: string) {
  const s = slug.toLowerCase();
  if (s.includes('insta')) return <Instagram className="h-5 w-5" />;
  if (s.includes('you') || s.includes('video')) return <Youtube className="h-5 w-5" />;
  if (s.includes('twit') || s.includes('x')) return <Twitter className="h-5 w-5" />;
  const initials = name.substring(0, 2).toUpperCase();
  return <span className="text-sm font-bold text-white/90">{initials}</span>;
}

function TaskList({ statuses, platformId }: { statuses: string[]; platformId?: number | 'all' }) {
  const { t } = useI18n();
  const { mock } = useMock();
  const nav = useNavigate();
  const real = useApi<TaskRow[]>(`/api/tasks?status=${statuses.join(',')}`);
  const [q, setQ] = useState('');
  const [min, setMin] = useState('');
  const [sort, setSort] = useState('new');

  const rows = useMemo(() => {
    let r = [...(real.data ?? []), ...(mock ? demoTasks.filter((x) => statuses.includes(x.status)) : [])];
    
    // فلترة المنصة
    if (platformId && platformId !== 'all') {
      r = r.filter((x: any) => x.platformId === platformId || x.platformName === (real.data?.find((t: any) => t.platformId === platformId)?.platformName));
    }
    if (q) r = r.filter((x) => (x.title + x.platformName).toLowerCase().includes(q.toLowerCase()));
    if (min) r = r.filter((x) => x.reward >= Number(min));
    if (sort === 'reward') r.sort((a, b) => b.reward - a.reward);
    if (sort === 'deadline') r.sort((a, b) => (a.deadline ?? '9').localeCompare(b.deadline ?? '9'));
    return r;
  }, [real.data, mock, q, min, sort, statuses, platformId]);

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Input type="number" min="0" placeholder={t('tasks.minReward')} value={min} onChange={(e) => setMin(e.target.value)} />
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('tasks.sort')}>
          <option value="new">{t('tasks.sortNew')}</option>
          <option value="reward">{t('tasks.sortReward')}</option>
          <option value="deadline">{t('tasks.sortDeadline')}</option>
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
    </div>
  );
}

export function TasksPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const platforms = useApi<Platform[]>('/api/platforms');
  const [mainTab, setMainTab] = useState<keyof typeof MAIN_TABS>('all');
  const [selectedPlatform, setSelectedPlatform] = useState<number | 'all'>('all');
  const [form, setForm] = useState({ platformId: '', title: '', description: '', requirements: '', reward: '', currency: 'USD', deadline: '', aiSuitability: '' });

  const save = async () => {
    try {
      const body = { ...form, platformId: Number(form.platformId), reward: Number(form.reward), deadline: form.deadline || null };
      await api('/api/tasks', { method: 'POST', body });
      toast(t('common.saved'));
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('tasks.title')}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />{t('tasks.add')}
          </Button>
        }
      />

      {/* 1. شريط التابات */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {(Object.keys(MAIN_TABS) as (keyof typeof MAIN_TABS)[]).map((k) => (
          <button
            key={k}
            onClick={() => setMainTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${mainTab === k ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            {k === 'all' ? 'الكل' : k === 'approval' ? 'انتظار موافقة' : k === 'active' ? 'قيد التنفيذ' : 'مكتملة'}
          </button>
        ))}
      </div>

      {/* 2. شريط المنصات */}
      <div className="no-scrollbar mb-4 flex gap-3 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedPlatform('all')}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all ${selectedPlatform === 'all' ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
          <span className="text-xs font-bold">الكل</span>
        </button>
        {platforms.data?.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedPlatform(p.id)}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all ${selectedPlatform === p.id ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
            title={p.name}
          >
            {getPlatformIcon(p.slug, p.name)}
          </button>
        ))}
      </div>

      {/* 3. قائمة المهام */}
      <TaskList key={`${refresh}-${mainTab}-${selectedPlatform}`} statuses={MAIN_TABS[mainTab]} platformId={selectedPlatform} />

      {/* نافذة إضافة مهمة */}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('tasks.add')}>
        <div className="space-y-3">
          <Field label={t('common.platform')}>
            <Select value={form.platformId} onChange={(e) => setForm({ ...form, platformId: e.target.value })}>
              <option value="">{t('tasks.choosePlatform')}</option>
              {platforms.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label={t('tasks.titleField')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label={t('task.instructions')}><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label={t('task.requirements')}><Input value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.reward')}><Input dir="ltr" type="number" min="0" step="0.01" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} /></Field>
            <Field label={t('tasks.currency')}><Input dir="ltr" maxLength={8} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label={t('common.deadline')}><Input dir="ltr" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
          <Field label={t('tasks.ai')}><Input value={form.aiSuitability} onChange={(e) => setForm({ ...form, aiSuitability: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={save}>{t('common.save')}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}


export function HistoryPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState('completed');
  const GROUPS = {
    completed: ['submitted', 'completed'],
    failed: ['failed', 'rejected'],
  };
  return (
    <div>
      <PageHeader title={t('nav.history')} />
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        {Object.keys(GROUPS).map((k) => (
          <Button key={k} variant={tab === k ? 'primary' : 'secondary'} onClick={() => setTab(k)}>{t(`hist.${k}`)}</Button>
        ))}
      </div>
      <TaskList key={tab} statuses={GROUPS[tab as keyof typeof GROUPS]} />
    </div>
  );
}

const STEPS = ['discovered', 'eligible', 'queued', 'executing', 'validating', 'awaiting_approval', 'submitted', 'completed'];

export function TaskDetails() {
  const { id } = useParams();
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const detail = useApi<any>(`/api/tasks/${id}`);

  if (detail.error) return <ErrorState message={detail.error} onRetry={detail.reload} />;
  if (!detail.data) return <Skeleton className="h-48" />;

  const task = detail.data;
  const isDemo = task.demo;
  const idx = STEPS.indexOf(task.status);

  const handleAction = async (action: string) => {
    if (isDemo) { toast('دي مهمة تجريبية للعرض بس', 'bad'); return; }
    try {
      await api(`/api/tasks/${task.id}/${action}`, { method: 'POST' });
      toast('تم بنجاح', 'ok');
      detail.reload();
      setRefresh(r => r + 1);
    } catch (e) { toast((e as Error).message, 'bad'); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={task.title}
        subtitle={`${task.platformName} · ${money(task.reward, task.currency)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {task.demo && <DemoBadge />}
            <Badge tone={TONE[task.status] ?? 'muted'}>{task.status}</Badge>
            {task.status === 'awaiting_approval' && (
              <div className="flex gap-2">
                <button onClick={() => handleAction('approve')} className="btn-holo-approve">
                  <CheckCircle2 className="h-4 w-4" /> موافقة
                </button>
                <button onClick={() => handleAction('reject')} className="btn-holo-reject">
                  <XCircle className="h-4 w-4" /> رفض
                </button>
              </div>
            )}
          </div>
        }
      />
      <GlassCard className="p-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {STEPS.map((s, i) => <Badge key={s} tone={i <= idx ? 'brand' : 'muted'}>{s}</Badge>)}
        </div>
      </GlassCard>
      <GlassCard className="p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span>المنصة</span><span>{task.platformName}</span></div>
        <div className="flex justify-between"><span>المكافأة</span><span>{money(task.reward, task.currency)}</span></div>
        <div className="flex justify-between"><span>الحالة</span><span>{task.status}</span></div>
        <div className="pt-4 border-t border-white/10">
          <div className="font-bold mb-1">التعليمات:</div>
          <p className="text-gray-400">{task.description || 'لا يوجد'}</p>
        </div>
        {task.executions && task.executions.length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <div className="font-bold mb-1">نتيجة الـ AI:</div>
            <div className="bg-black/30 p-2 rounded text-xs whitespace-pre-wrap">{task.executions[0].output}</div>
          </div>
        )}
      </GlassCard>
      <Button onClick={() => nav(-1)}>رجوع</Button>
    </div>
  );
}

