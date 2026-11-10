import { LayoutDashboard, Plug, ListChecks, History, Bot, Cpu, KeyRound, Wallet, ArrowDownToLine, Settings } from 'lucide-react';

export const NAV = [
  { group: 'nav.general', items: [
    { to: '/', key: 'nav.dashboard', icon: LayoutDashboard }, { to: '/platforms', key: 'nav.platforms', icon: Plug },
    { to: '/tasks', key: 'nav.tasks', icon: ListChecks }, { to: '/history', key: 'nav.history', icon: History } ] },
  { group: 'nav.tools', items: [
    { to: '/worker', key: 'nav.worker', icon: Bot }, { to: '/ai', key: 'nav.ai', icon: Cpu }, { to: '/api-manager', key: 'nav.api', icon: KeyRound } ] },
  { group: 'nav.finance', items: [
    { to: '/earnings', key: 'nav.earnings', icon: Wallet }, { to: '/withdrawals', key: 'nav.withdrawals', icon: ArrowDownToLine } ] },
  { group: 'nav.support', items: [{ to: '/settings', key: 'nav.settings', icon: Settings }] },
];
export const BOTTOM = ['/', '/tasks', '/worker', '/earnings'];
