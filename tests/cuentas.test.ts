import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { disponibleCuenta, efectoEnCuenta, mesesDesde, movimientosCuenta } from "../lib/cuentas";
import type { Card, Transaction } from "../lib/types";

const debito: Card = { id: "d1", tipo: "debito", banco: "BBVA", nombre: "Nómina", diaCorte: 0, statements: [], saldo: { monto: 1000, fecha: "2026-11-10", hora: "09:00" } };
const otra: Card = { ...debito, id: "d2", nombre: "Ahorro", saldo: { monto: 0, fecha: "2026-11-01", hora: "08:00" } };
const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), fecha: "2026-11-12", hora: "12:00", tipo: "gasto", monto: 100, categoria: "Otros", ...p });

describe("saldo de tarjetas de débito", () => {
  it("suma ingresos y resta gastos de esa tarjeta después del ajuste", () => {
    const txs = [tx({ tipo: "ingreso", monto: 500, metodo: "d1" }), tx({ monto: 200, metodo: "d1" }), tx({ monto: 50 })];
    assert.equal(disponibleCuenta(debito, txs, "2026-11-16"), 1300);
  });

  it("ignora lo pagado con crédito o en efectivo", () => {
    const txs = [tx({ monto: 999, metodo: "c1" }), tx({ monto: 999 })];
    assert.equal(disponibleCuenta(debito, txs, "2026-11-16"), 1000);
  });

  it("el mismo día del ajuste solo cuenta lo registrado después de la hora capturada", () => {
    const txs = [tx({ fecha: "2026-11-10", hora: "08:59", monto: 100, metodo: "d1" }), tx({ fecha: "2026-11-10", hora: "09:01", monto: 40, metodo: "d1" })];
    assert.equal(disponibleCuenta(debito, txs, "2026-11-16"), 960);
  });

  it("no cuenta movimientos con fecha futura", () => {
    assert.equal(disponibleCuenta(debito, [tx({ fecha: "2026-11-20", monto: 300, metodo: "d1" })], "2026-11-16"), 1000);
  });

  it("una transferencia resta al origen y suma al destino, sin cambiar el total", () => {
    const t = tx({ tipo: "transferencia", monto: 300, metodo: "d1", destinoId: "d2", categoria: "Transferencia" });
    assert.equal(efectoEnCuenta(t, "d1"), -300);
    assert.equal(efectoEnCuenta(t, "d2"), 300);
    assert.equal(disponibleCuenta(debito, [t], "2026-11-16") + disponibleCuenta(otra, [t], "2026-11-16"), 1000);
    assert.equal(movimientosCuenta(otra, [t], "2026-11-16").length, 1);
  });

  it("un retiro de efectivo solo resta a la tarjeta", () => {
    const t = tx({ tipo: "transferencia", monto: 250, metodo: "d1", categoria: "Transferencia" });
    assert.equal(disponibleCuenta(debito, [t], "2026-11-16"), 750);
  });

  it("lee los meses desde el saldo capturado más antiguo", () => {
    assert.deepEqual(mesesDesde([debito, otra], "2026-12-03"), ["2026-11", "2026-12"]);
  });
});
