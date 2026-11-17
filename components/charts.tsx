"use client";
import { mxn } from "@/lib/money";

const W = 320;
const H = 150;
const PAD = { l: 6, r: 6, t: 14, b: 20 };
// Colores de Discord (blurple, menta del logo, amarillo, fucsia, verde, gris)
export const PALETA = ["#5865f2", "#5ee6c2", "#f0b232", "#eb459e", "#3ccf7c", "#80848e"];

const corto = (n: number) => (n >= 100000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

function nice(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / p) * p;
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>)}
    </div>
  );
}

/** Barras agrupadas (hasta 2 series) por periodo. */
export function GroupedBars({ data, labels, colors, aria }: { data: number[][]; labels: string[]; colors: string[]; aria: string }) {
  const max = nice(Math.max(...data.flat(), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / labels.length;
  const bw = Math.min(26, (slot - 10) / data.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="w-full">
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--border)" />
      {labels.map((l, i) => {
        const x0 = PAD.l + i * slot + (slot - bw * data.length) / 2;
        return (
          <g key={l + i}>
            {data.map((serie, s) => {
              const h = (serie[i] / max) * ih;
              const x = x0 + s * bw;
              return (
                <g key={s}>
                  <rect x={x + 1} y={H - PAD.b - h} width={bw - 2} height={Math.max(h, serie[i] > 0 ? 1 : 0)} rx={3} fill={colors[s]}><title>{`${l}: ${mxn(serie[i])}`}</title></rect>
                  {serie[i] > 0 && <text x={x + bw / 2} y={H - PAD.b - h - 3} textAnchor="middle" fontSize="8" fill="var(--muted)">{corto(serie[i])}</text>}
                </g>
              );
            })}
            <text x={PAD.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">{l}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barras de una serie; `resaltar` marca el índice actual. */
export function Bars({ data, labels, color = "var(--accent)", aria }: { data: number[]; labels: string[]; color?: string; aria: string }) {
  return <GroupedBars data={[data]} labels={labels} colors={[color]} aria={aria} />;
}

/** Dona con leyenda. */
export function Donut({ items, aria }: { items: { label: string; value: number }[]; aria: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  const arcos = items.reduce<{ len: number; off: number }[]>((a, it) => {
    const len = total > 0 ? (it.value / total) * c : 0;
    return [...a, { len, off: a.length ? a[a.length - 1].off + a[a.length - 1].len : 0 }];
  }, []);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 120 120" role="img" aria-label={aria} className="size-36 shrink-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {items.map((it, i) => (
          <circle key={it.label} cx="60" cy="60" r={r} fill="none" stroke={PALETA[i % PALETA.length]} strokeWidth="16" strokeDasharray={`${arcos[i].len} ${c - arcos[i].len}`} strokeDashoffset={-arcos[i].off}><title>{`${it.label}: ${mxn(it.value)}`}</title></circle>
        ))}
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={it.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETA[i % PALETA.length] }} />
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            <span className="num text-muted">{total > 0 ? Math.round((it.value / total) * 100) : 0}%</span>
            <span className="num w-24 text-right">{mxn(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Línea con área (por ejemplo, deuda a lo largo del tiempo). */
export function LineArea({ values, labels, aria }: { values: number[]; labels: string[]; aria: string }) {
  if (values.length < 2) return null;
  const max = nice(Math.max(...values, 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const pts = values.map((v, i) => [PAD.l + (i / (values.length - 1)) * iw, PAD.t + ih - (v / max) * ih] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${H - PAD.b} L${pts[0][0]},${H - PAD.b} Z`;
  const marks = [0, Math.floor((values.length - 1) / 2), values.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="w-full">
      <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="var(--border)" />
      <path d={area} fill="var(--accent)" opacity="0.15" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {marks.map((i) => (
        <g key={i}>
          <circle cx={pts[i][0]} cy={pts[i][1]} r="3" fill="var(--accent)" />
          <text x={Math.min(Math.max(pts[i][0], 22), W - 22)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)">{labels[i]}</text>
          <text x={Math.min(Math.max(pts[i][0], 22), W - 22)} y={Math.max(pts[i][1] - 6, 9)} textAnchor="middle" fontSize="8" fill="var(--fg)">{corto(values[i])}</text>
        </g>
      ))}
    </svg>
  );
}
