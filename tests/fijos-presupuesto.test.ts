import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fechaFijo, fijosDelMes, porCobrar, porPagar } from "../lib/fijos";
import { gastadoPorCategoria, libreParaGastar, nivelPresupuesto } from "../lib/presupuesto";
import type { Card, GastoFijo, Transaction } from "../lib/types";

const cards: Card[] = [
  { id: "c1", banco: "Santander", nombre: "LikeU", diaCorte: 5, statements: [] },
  { id: "d1", tipo: "debito", banco: "BBVA", nombre: "Nómina", diaCorte: 0, statements: [] },
];
const renta: GastoFijo = { id: "f1", nombre: "Renta", monto: 9500, dia: 1, categoria: "Renta", metodo: "d1" };
const netflix: GastoFijo = { id: "f2", nombre: "Netflix", monto: 299, dia: 31, categoria: "Suscripciones", metodo: "c1" };
const sueldo: GastoFijo = { id: "f3", tipo: "ingreso", nombre: "Sueldo", monto: 18500, dia: 15, categoria: "Sueldo", metodo: "d1" };

describe("gastos e ingresos fijos", () => {
  it("usa el último día si el mes es más corto", () => {
    assert.equal(fechaFijo(netflix, "2026-02"), "2026-02-28");
    assert.equal(fechaFijo(netflix, "2028-02"), "2028-02-29");
  });

  it("marca como pagado el fijo que ya tiene su movimiento y calcula pendientes", () => {
    const pagoRenta: Transaction = { id: "t", fecha: "2026-11-01", tipo: "gasto", monto: 9500, categoria: "Renta", fijoId: "f1" };
    const lista = fijosDelMes([renta, netflix, sueldo], [pagoRenta], "2026-11", "2026-11-16", cards);
    assert.deepEqual(lista.map((x) => [x.fijo.id, x.estado]), [["f1", "pagado"], ["f3", "vencido"], ["f2", "proximo"]]);
    assert.equal(porPagar(lista), 299); // la renta ya se pagó; el sueldo no es gasto
    assert.equal(porPagar(lista, true), 0); // Netflix va con crédito: no sale de tu dinero
    assert.equal(porCobrar(lista), 18500);
  });

  it("no aplica un fijo antes de su mes de inicio", () => {
    assert.equal(fijosDelMes([{ ...renta, desde: "2026-12" }], [], "2026-11", "2026-11-16", cards).length, 0);
  });
});

describe("presupuesto", () => {
  const txs: Transaction[] = [
    { id: "a", fecha: "2026-11-02", tipo: "gasto", monto: 300, categoria: "Comidas fuera" },
    { id: "b", fecha: "2026-11-03", tipo: "gasto", monto: 2000, categoria: "Pago de tarjeta", tarjetaId: "c1" },
    { id: "c", fecha: "2026-11-04", tipo: "ingreso", monto: 500, categoria: "Freelance" },
  ];

  it("suma lo registrado y los fijos pendientes, sin contar pagos de tarjeta", () => {
    const fijos = fijosDelMes([netflix, sueldo], [], "2026-11", "2026-11-16", cards);
    assert.deepEqual(gastadoPorCategoria(txs, fijos), { "Comidas fuera": 300, Suscripciones: 299 });
  });

  it("verde hasta 80 %, ámbar hasta 100 %, rojo al pasarse", () => {
    assert.equal(nivelPresupuesto(700, 1000).nivel, "ok");
    assert.equal(nivelPresupuesto(800, 1000).nivel, "warn");
    assert.equal(nivelPresupuesto(1000, 1000).nivel, "warn");
    assert.equal(nivelPresupuesto(1001, 1000).nivel, "danger");
    assert.equal(nivelPresupuesto(1200, 1000).restante, -200);
  });

  it("lo libre para gastar descuenta la meta de ahorro", () => {
    assert.equal(libreParaGastar(20000, 15000, 3000), 2000);
  });
});
