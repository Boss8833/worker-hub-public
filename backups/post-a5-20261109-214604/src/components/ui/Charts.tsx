import type { ReactNode } from 'react';

export function Sparkline({ data, color = '#22D3EE' }: { data: number[]; color?: string }) {
  const w = 120, h = 36;
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 6) - 3}`).join(' ');
  return <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Gauge({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  const L = Math.PI * 40;
  return (
    <svg viewBox="0 0 100 62" className="h-16 w-28" aria-label={`${v}%`}>
      <defs><linearGradient id="gaugeGrad" x1="0" x2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#22D3EE" /></linearGradient></defs>
      <path d="M10 52 A40 40 0 0 1 90 52" stroke="rgba(255,255,255,.12)" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M10 52 A40 40 0 0 1 90 52" stroke="url(#gaugeGrad)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={`${(L * v) / 100} ${L}`} />
      <text x="50" y="50" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">{v}%</text>
    </svg>
  );
}

export function ColorBars({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-44 items-stretch justify-between gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] text-muted">{d.value}</span>
          <div className="flex w-full flex-1 items-end justify-center">
            <div className="w-full max-w-[26px] rounded-full shadow-lg" style={{ height: `${(d.value / max) * 100}%`, background: `linear-gradient(180deg, ${d.color}, ${d.color}66)` }} />
          </div>
          <span className="text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = 60, C = 2 * Math.PI * r;
  const ring = (dy: number, dim: boolean) => {
    let acc = 0;
    return data.map((d) => {
      const len = (d.value / total) * C;
      const el = <circle key={d.name + dy} cx="90" cy={90 + dy} r={r} fill="none" stroke={d.color} strokeWidth="26" opacity={dim ? 0.4 : 1}
        strokeDasharray={`${Math.max(len - 2, 0)} ${C - len + 2}`} strokeDashoffset={-acc} transform={`rotate(-90 90 ${90 + dy})`} style={dim ? { filter: 'brightness(.45)' } : undefined} />;
      acc += len;
      return el;
    });
  };
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 180 190" className="h-40 w-40 shrink-0" aria-hidden>{ring(9, true)}{ring(0, false)}</svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => <li key={d.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}<span className="text-muted">{Math.round((d.value / total) * 100)}%</span></li>)}
      </ul>
    </div>
  );
}

type FNode = { id: string; col: 0 | 1 | 2; label: string; color: string };
type FLink = { from: string; to: string; value: number };

export function FlowChart({ nodes, links }: { nodes: FNode[]; links: FLink[] }) {
  const W = 600, H = 240, NW = 12, GAP = 10;
  const colX = [0, (W - NW) / 2, W - NW];
  const val = (id: string) => Math.max(links.filter((l) => l.from === id).reduce((a, l) => a + l.value, 0), links.filter((l) => l.to === id).reduce((a, l) => a + l.value, 0));
  const cols = [0, 1, 2].map((c) => nodes.filter((n) => n.col === c));
  const scale = Math.min(...cols.map((ns) => (H - GAP * (ns.length - 1)) / (ns.reduce((a, n) => a + val(n.id), 0) || 1)));
  const pos: Record<string, { x: number; y: number; h: number }> = {};
  cols.forEach((ns, c) => {
    const used = ns.reduce((a, n) => a + val(n.id) * scale, 0) + GAP * (ns.length - 1);
    let y = (H - used) / 2;
    ns.forEach((n) => { const h = val(n.id) * scale; pos[n.id] = { x: colX[c], y, h }; y += h + GAP; });
  });
  const outOff: Record<string, number> = {}, inOff: Record<string, number> = {};
  const color = (id: string) => nodes.find((n) => n.id === id)!.color;
  const ribbons: ReactNode[] = links.map((l, i) => {
    const h = l.value * scale;
    const a = pos[l.from], b = pos[l.to];
    const y0 = a.y + (outOff[l.from] ?? 0) + h / 2, y1 = b.y + (inOff[l.to] ?? 0) + h / 2;
    outOff[l.from] = (outOff[l.from] ?? 0) + h; inOff[l.to] = (inOff[l.to] ?? 0) + h;
    const x0 = a.x + NW, x1 = b.x, mx = (x0 + x1) / 2;
    return <path key={i} d={`M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`} fill="none" stroke={color(l.from)} strokeOpacity="0.4" strokeWidth={Math.max(h, 1)} />;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="flow chart">
      {ribbons}
      {nodes.map((n) => <g key={n.id}><rect x={pos[n.id].x} y={pos[n.id].y} width={NW} height={Math.max(pos[n.id].h, 2)} rx="4" fill={n.color} />
        {n.col !== 1 && <text x={n.col === 0 ? pos[n.id].x + NW + 6 : pos[n.id].x - 6} y={pos[n.id].y + pos[n.id].h / 2 + 4} textAnchor={n.col === 0 ? 'start' : 'end'} fontSize="11" fill="#CBD5E1">{n.label}</text>}</g>)}
    </svg>
  );
}
