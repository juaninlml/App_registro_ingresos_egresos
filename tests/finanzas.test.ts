import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { movimientosCSV } from "../lib/csv";
import { addMonths, monthsDiff, nextBusinessDay } from "../lib/dates";
import { abonadoDesdeCorte, comprasDesdeCorte, creditoMsi, deudaActual, esCompraMsi, msiInfo, msiPagoEnCorte, projectCuts, proximoPago, totalCompras } from "../lib/finance";
import { loanSchedule, pagoCalculado } from "../lib/loan";
import { normalizar } from "../lib/recovery";
import type { Card, Loan, Msi, Payment, Transaction } from "../lib/types";

const card: Card = {
  id: "c1", banco: "Santander", nombre: "LikeU", diaCorte: 5,
  statements: [{ fechaCorte: "2026-11-05", fechaLimite: "2026-11-25", saldoTotal: 38450.2, pagoNoIntereses: 9870.5 }],
};
const st = card.statements[0];

describe("fechas", () => {
  it("sumar meses funciona como EDATE de Excel", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2026-11-15", 2), "2027-01-15");
    assert.equal(monthsDiff("2026-11-30", "2027-02-01"), 3);
  });
  it("el siguiente día hábil salta el fin de semana", () => {
    assert.equal(nextBusinessDay("2026-11-13"), "2026-11-16"); // viernes → lunes
  });
});

describe("deuda de tarjeta de crédito", () => {
  const pagos: Payment[] = [
    { id: "p1", fecha: "2026-11-08", monto: 2500, destino: "card", targetId: "c1" },
    { id: "p0", fecha: "2026-11-01", monto: 999, destino: "card", targetId: "c1" }, // antes del corte: ya viene en el saldo
    { id: "p2", fecha: "2026-11-10", monto: 777, destino: "loan", targetId: "c1" },
  ];
  const txs: Transaction[] = [
    { id: "a", fecha: "2026-11-08", tipo: "gasto", monto: 346, categoria: "Comida", metodo: "c1" },
    { id: "b", fecha: "2026-11-04", tipo: "gasto", monto: 500, categoria: "Comida", metodo: "c1" }, // antes del corte
    { id: "c", fecha: "2026-11-12", tipo: "gasto", monto: 100, categoria: "Comida", metodo: "d1" }, // otra tarjeta
    { id: "d", fecha: "2026-11-20", tipo: "gasto", monto: 50, categoria: "Comida", metodo: "c1" }, // futuro
  ];

  it("solo cuenta abonos a esta tarjeta después del corte", () => {
    assert.equal(abonadoDesdeCorte(card, pagos, st), 2500);
  });
  it("suma las compras con la tarjeta registradas después del corte y hasta hoy", () => {
    const compras = comprasDesdeCorte(card, txs, st, "2026-11-16");
    assert.deepEqual(compras.map((t) => t.id), ["a"]);
    assert.equal(deudaActual(card, pagos, st, totalCompras(compras)), 36296.2);
  });
  it("la deuda nunca es negativa", () => {
    assert.equal(deudaActual(card, [{ id: "x", fecha: "2026-11-06", monto: 99999, destino: "card", targetId: "c1" }], st), 0);
  });
});

describe("meses sin intereses", () => {
  const msi: Msi = { id: "m", cardId: "c1", descripcion: "Laptop", fechaOperacion: "2026-06-10", montoOriginal: 24000, pagoMensual: 2000, totalPagos: 12, primerCorte: "2026-07-05" };
  it("sabe qué pago cae en cada corte", () => {
    assert.equal(msiPagoEnCorte(msi, "2026-07-05"), 1);
    assert.equal(msiPagoEnCorte(msi, "2026-11-05"), 5);
    assert.equal(msiPagoEnCorte(msi, "2027-07-05"), 0);
  });
  it("calcula lo pendiente al corte", () => {
    const i = msiInfo(msi, "2026-11-05");
    assert.equal(i.restantes, 7);
    assert.equal(i.saldoPendiente, 14000);
    assert.equal(i.fechaTermino, "2027-06-05");
  });
});

describe("créditos personales", () => {
  const loan: Loan = { id: "l", nombre: "Personal", banco: "Banorte", montoOriginal: 10000, tasaAnual: 12, plazoMeses: 12, primerPago: "2026-01-15", pagosHechos: 0 };
  it("calcula el pago nivelado (sistema francés)", () => {
    assert.equal(pagoCalculado(loan), 888.49);
  });
  it("la tabla de amortización termina en cero", () => {
    const rows = loanSchedule(loan);
    assert.equal(rows.length, 12);
    assert.equal(rows.at(-1)!.saldo, 0);
  });
  it("con IVA sobre intereses el pago es mayor", () => {
    assert.ok(pagoCalculado({ ...loan, ivaPct: 16 }) > pagoCalculado(loan));
  });
});

describe("exportar CSV", () => {
  it("pone signo, escapa comas y comillas, y empieza con BOM para Excel", () => {
    const csv = movimientosCSV(
      [
        { id: "1", fecha: "2026-11-02", hora: "10:00", tipo: "gasto", monto: 120.5, categoria: "Comidas fuera", nota: 'Tacos, "al pastor"', metodo: "c1" },
        { id: "2", fecha: "2026-11-01", hora: "09:00", tipo: "ingreso", monto: 1000, categoria: "Sueldo" },
      ],
      [card],
    );
    assert.ok(csv.startsWith("﻿Fecha,"));
    const filas = csv.slice(1).split("\r\n");
    assert.equal(filas[1], "2026-11-01,09:00,Ingreso,Sueldo,1000.00,Efectivo,,,");
    assert.equal(filas[2], '2026-11-02,10:00,Gasto,Comidas fuera,-120.50,Santander LikeU,,,"Tacos, ""al pastor"""');
  });
});

describe("códigos de recuperación", () => {
  it("acepta el código con o sin guion, en minúsculas o con espacios", () => {
    assert.equal(normalizar("abcde 23456"), "ABCDE-23456");
    assert.equal(normalizar("ABCDE-23456"), "ABCDE-23456");
  });
  it("rechaza longitudes o caracteres ambiguos", () => {
    assert.equal(normalizar("ABCD-2345"), null);
    assert.equal(normalizar("ABCDE-2345O"), null); // la O se confunde con 0 y no existe en el alfabeto
    assert.equal(normalizar(12345), null);
  });
});

describe("próximo pago y crédito ocupado por MSI", () => {
  const laptop: Msi = { id: "m1", cardId: "c1", descripcion: "Laptop", fechaOperacion: "2026-06-10", montoOriginal: 24000, pagoMensual: 2000, totalPagos: 12, primerCorte: "2026-07-05" };
  const tele: Msi = { id: "m2", cardId: "c1", descripcion: "Pantalla", fechaOperacion: "2026-11-08", montoOriginal: 6000, pagoMensual: 1000, totalPagos: 6, primerCorte: "2026-12-05" };
  const viejo: Msi = { id: "m3", cardId: "c1", descripcion: "Celular", fechaOperacion: "2025-01-10", montoOriginal: 3000, pagoMensual: 1000, totalPagos: 3, primerCorte: "2025-02-05" };
  const otraTarjeta: Msi = { ...laptop, id: "m4", cardId: "c9" };
  const compras: Transaction[] = [
    { id: "a", fecha: "2026-11-07", tipo: "gasto", monto: 500, categoria: "Súper", metodo: "c1" },
    { id: "b", fecha: "2026-11-08", tipo: "gasto", monto: 6000, categoria: "Hogar", metodo: "c1" }, // es la pantalla a MSI
    { id: "c", fecha: "2026-12-07", tipo: "gasto", monto: 300, categoria: "Súper", metodo: "c1" }, // después del corte
  ];

  it("reconoce la compra que en realidad es un MSI", () => {
    assert.equal(esCompraMsi(compras[1], [laptop, tele]), true);
    assert.equal(esCompraMsi(compras[0], [laptop, tele]), false);
  });

  it("el próximo pago suma las mensualidades del corte y las compras antes del corte", () => {
    const p = proximoPago(card, [laptop, tele, viejo, otraTarjeta], compras, st);
    assert.equal(p.corte, "2026-12-05");
    assert.equal(p.limite, "2026-12-25"); // mismos 20 días que el último estado de cuenta
    assert.deepEqual(p.msi.map((x) => [x.m.id, x.k]), [["m1", 6], ["m2", 1]]);
    assert.equal(p.msiTotal, 3000);
    assert.deepEqual(p.compras.map((t) => t.id), ["a"]); // sin la pantalla (ya va en MSI) ni la compra posterior al corte
    assert.equal(p.total, 3500);
  });

  it("reparte el límite entre lo que ocupan los MSI y lo liberado (siempre suma el límite)", () => {
    const c = creditoMsi([laptop, tele, viejo], "2026-11-05", 60000);
    assert.equal(c.activos, 2); // el celular ya se liquidó
    assert.equal(c.total, 30000); // 24,000 + 6,000
    assert.equal(c.pagado, 10000); // 5 mensualidades de la laptop ya cobradas
    assert.equal(c.ocupado, 20000); // laptop: 7 × 2,000 · pantalla: 6 × 1,000
    assert.equal(c.liberado, 40000); // 60,000 − 20,000
    assert.equal(c.ocupado + (c.liberado ?? 0), 60000);
    assert.equal(c.liberaProximo, 3000);
    assert.equal(c.excede, false);
  });

  it("lo liberado nunca supera el límite ni queda negativo aunque los MSI pasen del límite", () => {
    const c = creditoMsi([laptop, tele], "2026-11-05", 15000);
    assert.equal(c.ocupado, 15000); // se topa en el límite
    assert.equal(c.liberado, 0);
    assert.equal(c.excede, true);
  });

  it("sin límite capturado no inventa lo liberado", () => {
    const c = creditoMsi([laptop], "2026-11-05");
    assert.equal(c.liberado, null);
    assert.equal(c.ocupado, 14000);
  });

  it("la proyección del siguiente corte usa lo ya comprado si supera el estimado", () => {
    const filas = projectCuts(card, [laptop], 200, 3, 500);
    assert.equal(filas[1].compras, 500);
    assert.equal(filas[1].total, 2500);
    assert.equal(filas[2].compras, 200); // los cortes siguientes siguen con el estimado
  });
});
