import { createContext, useContext, useState, type ReactNode } from 'react';

// UI preference only (not data): whether clearly-labeled demo figures are shown.
type Ctx = { mock: boolean; setMock: (v: boolean) => void };
const MockCtx = createContext<Ctx>({ mock: true, setMock: () => {} });

export function MockProvider({ children }: { children: ReactNode }) {
  const [mock, set] = useState<boolean>(() => localStorage.getItem('wh_mock') !== '0');
  const setMock = (v: boolean) => { localStorage.setItem('wh_mock', v ? '1' : '0'); set(v); };
  return <MockCtx.Provider value={{ mock, setMock }}>{children}</MockCtx.Provider>;
}
export const useMock = () => useContext(MockCtx);
