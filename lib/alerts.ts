import { addMonths, daysBetween } from "./dates";
import { abonadoDesdeCorte, latestStatement } from "./finance";
import { loanSummary } from "./loan";
import { mxn } from "./money";
import { buildPlan } from "./plan";
import type { DB, ISODate } from "./types";
import { fdate } from "./dates";

export interface Alert {
  nivel: "rojo" | "ambar" | "info";
  titulo: string;
  detalle: string;
  href: string;
}

function cuando(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias < 0) return `hace ${-dias} día${dias === -1 ? "" : "s"}`;
  return `en ${dias} días`;
}

export function buildAlerts(db: DB, today: ISODate): Alert[] {
  const out: Alert[] = [];

  for (const card of db.cards) {
    const st = latestStatement(card);
    const nombre = `${card.banco} ${card.nombre}`;
    if (!st) {
      out.push({ nivel: "info", titulo: `${nombre} · sin estado de cuenta`, detalle: "Sube el PDF para ver fechas y pagos", href: `/tarjetas/${card.id}` });
      continue;
    }
    if (today > addMonths(st.fechaCorte, 1)) {
      out.push({ nivel: "ambar", titulo: `${nombre} · nuevo corte`, detalle: `Sube el estado de cuenta posterior al ${fdate(st.fechaCorte)}`, href: `/tarjetas/${card.id}` });
    }
    const abonado = abonadoDesdeCorte(card, db.payments, st);
    const faltante = Math.max(0, Math.round((st.pagoNoIntereses - abonado) * 100) / 100);
    const dias = daysBetween(today, st.fechaLimite);
    if (faltante > 0) {
      const nivel = dias < 0 ? "rojo" : dias <= 7 ? "ambar" : "info";
      out.push({
        nivel,
        titulo: `${nombre} · faltan ${mxn(faltante)}`,
        detalle: dias < 0
          ? `Venció el ${fdate(st.fechaLimite)} (${cuando(dias)})`
          : `Límite ${fdate(st.fechaLimite)} · ${cuando(dias)} · llevas ${mxn(abonado)}`,
        href: `/tarjetas/${card.id}`,
      });
    }
  }

  for (const loan of db.loans) {
    const s = loanSummary(loan);
    if (!s.proximo) continue;
    const dias = daysBetween(today, s.proximo.fecha);
    if (dias <= 7) {
      out.push({
        nivel: dias < 0 ? "rojo" : "ambar",
        titulo: `${loan.nombre} · pago de ${mxn(s.proximo.pago)}`,
        detalle: `Pago ${s.proximo.n} de ${loan.plazoMeses} · ${dias < 0 ? "venció" : "vence"} el ${fdate(s.proximo.fecha)} (${cuando(dias)})`,
        href: "/prestamos",
      });
    }
  }

  if (db.plan) {
    const card = db.cards.find((c) => c.id === db.plan!.cardId);
    if (card) {
      const r = buildPlan(db.plan, card, db.msi, db.payments, today);
      const w = r.weeks.find((x) => x.domingo >= today && x.pendiente > 0 && daysBetween(today, x.lunes) <= 42);
      if (w) {
        out.push({
          nivel: "ambar",
          titulo: `Plan de abonos · faltarían ${mxn(w.pendiente)}`,
          detalle: `Semana del ${fdate(w.lunes)} vencen ${mxn(w.vence)}`,
          href: "/plan",
        });
      }
    }
  }

  const orden = { rojo: 0, ambar: 1, info: 2 } as const;
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
