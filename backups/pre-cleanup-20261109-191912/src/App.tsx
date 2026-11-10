import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Platforms from './pages/Platforms';
import ApiManager from './pages/ApiManager';
import { TasksPage, HistoryPage, TaskDetails } from './pages/Tasks';
import Worker from './pages/Worker';
import AiEngine from './pages/AiEngine';
import Earnings from './pages/Earnings';
import Withdrawals from './pages/Withdrawals';
import Settings from './pages/Settings';
import { EmptyState } from './components/ui/Glass';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="platforms" element={<Platforms />} />
        <Route path="api-manager" element={<ApiManager />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskDetails />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="worker" element={<Worker />} />
        <Route path="ai" element={<AiEngine />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="withdrawals" element={<Withdrawals />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<EmptyState title="404" />} />
      </Route>
    </Routes>
  );
}
