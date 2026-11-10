// ALL values here are SIMULATED for visual testing. They are never real earnings, balances or tasks.
import type { TaskRow } from './types';

export const demo = {
  kpis: {
    total: { value: 1284.5, trend: '+12.4%', series: [3, 5, 4, 7, 6, 9, 8, 11, 10, 13] },
    available: { value: 742.2, ratio: 78, series: [2, 3, 3, 5, 4, 6, 7, 6, 8, 9] },
    pending: { value: 96.8, series: [4, 3, 5, 4, 6, 5, 4, 6, 5, 7] },
  },
  counters: { completed: 128, active: 3, failed: 7 },
  weekly: [
    { label: 'Sun', value: 12, color: '#A78BFA' }, { label: 'Mon', value: 18, color: '#60A5FA' }, { label: 'Tue', value: 15, color: '#2DD4BF' },
    { label: 'Wed', value: 22, color: '#A3E635' }, { label: 'Thu', value: 17, color: '#FACC15' }, { label: 'Fri', value: 9, color: '#FB923C' },
    { label: 'Sat', value: 13, color: '#F472B6' },
  ],
  flowNodes: [
    { id: 'a', col: 0 as const, label: 'Demo A', color: '#A78BFA' }, { id: 'b', col: 0 as const, label: 'Demo B', color: '#60A5FA' },
    { id: 'c', col: 0 as const, label: 'Demo C', color: '#2DD4BF' },
    { id: 'x', col: 1 as const, label: 'Text', color: '#22D3EE' }, { id: 'y', col: 1 as const, label: 'Data', color: '#8B5CF6' },
    { id: 'p', col: 2 as const, label: 'Paid', color: '#34D399' }, { id: 'q', col: 2 as const, label: 'Pending', color: '#FBBF24' },
  ],
  flowLinks: [
    { from: 'a', to: 'x', value: 30 }, { from: 'a', to: 'y', value: 12 }, { from: 'b', to: 'x', value: 18 }, { from: 'b', to: 'y', value: 20 },
    { from: 'c', to: 'y', value: 14 }, { from: 'x', to: 'p', value: 38 }, { from: 'x', to: 'q', value: 10 }, { from: 'y', to: 'p', value: 36 }, { from: 'y', to: 'q', value: 10 },
  ],
  donut: [
    { name: 'Demo A', value: 42, color: '#8B5CF6' }, { name: 'Demo B', value: 38, color: '#22D3EE' }, { name: 'Demo C', value: 20, color: '#FACC15' },
  ],
  transactions: [
    { id: 'd1', kind: 'reward', amount: 12.5, currency: 'USD', reference: 'DEMO-001' },
    { id: 'd2', kind: 'reward', amount: 8, currency: 'USD', reference: 'DEMO-002' },
    { id: 'd3', kind: 'withdrawal', amount: -50, currency: 'USD', reference: 'DEMO-003' },
  ],
};

export const demoTasks: TaskRow[] = [
  { id: 'demo-1', platformName: 'Demo A', title: 'Summarize an English article', description: 'Write a 120-word summary of the provided article.', requirements: 'Neutral tone. 100-140 words. No copied sentences.', reward: 2.5, currency: 'USD', deadline: '2030-01-01T12:00:00Z', status: 'eligible', aiSuitability: 'high', demo: true },
  { id: 'demo-2', platformName: 'Demo B', title: 'Label 20 product images', description: 'Pick the correct category for each image.', requirements: 'Accuracy above 90%.', reward: 4, currency: 'USD', deadline: '2030-01-02T12:00:00Z', status: 'awaiting_approval', aiSuitability: 'medium', demo: true },
  { id: 'demo-3', platformName: 'Demo C', title: 'Translate 5 short sentences', description: 'English to Arabic.', requirements: 'Natural phrasing.', reward: 1.2, currency: 'USD', deadline: null, status: 'queued', aiSuitability: 'high', demo: true },
  { id: 'demo-4', platformName: 'Demo A', title: 'Proofread a short paragraph', description: 'Fix grammar only.', requirements: null, reward: 1.8, currency: 'USD', deadline: null, status: 'completed', aiSuitability: 'high', demo: true },
  { id: 'demo-5', platformName: 'Demo B', title: 'Extract data from a table', description: 'Return JSON.', requirements: 'Valid JSON.', reward: 3.1, currency: 'USD', deadline: null, status: 'failed', aiSuitability: 'low', demo: true },
  { id: 'demo-6', platformName: 'Demo C', title: 'Write a product description', description: '50 words.', requirements: null, reward: 2, currency: 'USD', deadline: null, status: 'rejected', aiSuitability: 'medium', demo: true },
];
