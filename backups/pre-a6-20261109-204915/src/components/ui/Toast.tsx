import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Tone = 'ok' | 'bad' | 'info';
type Item = { id: number; msg: string; tone: Tone };
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const push = useCallback((msg: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4500);
  }, []);
  const color = { ok: 'border-ok/40', bad: 'border-bad/40', info: 'border-info/40' };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
        {items.map((i) => <div key={i.id} role="status" className={`glass page-enter pointer-events-auto max-w-md border px-4 py-3 text-sm ${color[i.tone]}`}>{i.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
