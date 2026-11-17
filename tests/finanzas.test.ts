import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { movimientosCSV } from "../lib/csv";
import { addMonths, monthsDiff, nextBusinessDay } from "../lib/dates";
import { abonadoDesdeCorte, comprasDesdeCorte, deudaActual, msiInfo, msiPagoEnCorte, totalCompras } from "../lib/finance";
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
