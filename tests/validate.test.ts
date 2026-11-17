import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "../lib/types";
import { validateValue } from "../lib/validate";

const base = { id: "t1", fecha: "2026-11-02", monto: 100, categoria: "Otros" };

describe("validación del servidor", () => {
  it("acepta gastos, ingresos y transferencias del mes correcto", () => {
    assert.ok(validateValue("tx:2026-11", [{ ...base, tipo: "gasto" }, { ...base, id: "t2", tipo: "ingreso" }]));
    assert.ok(validateValue("tx:2026-11", [{ ...base, tipo: "transferencia", metodo: "d1", destinoId: "d2" }]));
  });
  it("rechaza una transferencia a la misma cuenta", () => {
    assert.equal(validateValue("tx:2026-11", [{ ...base, tipo: "transferencia", metodo: "d1", destinoId: "d1" }]), false);
    assert.equal(validateValue("tx:2026-11", [{ ...base, tipo: "transferencia" }]), false); // efectivo → efectivo
  });
  it("rechaza movimientos guardados en otro mes o con tipo desconocido", () => {
    assert.equal(validateValue("tx:2026-10", [{ ...base, tipo: "gasto" }]), false);
    assert.equal(validateValue("tx:2026-11", [{ ...base, tipo: "regalo" }]), false);
  });
  it("valida presupuesto, meta y notas del mes en los ajustes", () => {
    assert.ok(validateValue("settings", { ...DEFAULT_SETTINGS, presupuestos: { Renta: 9500 }, metaAhorro: 3000, notasMes: { "2026-11": "Gasté menos en comida" } }));
    assert.equal(validateValue("settings", { ...DEFAULT_SETTINGS, presupuestos: { Renta: -1 } }), false);
    assert.equal(validateValue("settings", { ...DEFAULT_SETTINGS, notasMes: { noviembre: "x" } }), false);
  });
  it("valida gastos e ingresos fijos", () => {
    assert.ok(validateValue("fijos", [{ id: "f", tipo: "ingreso", nombre: "Sueldo", monto: 18500, dia: 15, categoria: "Sueldo" }]));
    assert.equal(validateValue("fijos", [{ id: "f", nombre: "Renta", monto: 9500, dia: 32, categoria: "Renta" }]), false);
  });
});

describe("perfil", () => {
  it("acepta nombre, correo y foto válidos, o perfil vacío", () => {
    assert.ok(validateValue("perfil", null));
    assert.ok(validateValue("perfil", { nombre: "Ana", correo: "ana@correo.mx", foto: "data:image/webp;base64,UklGRg==" }));
  });
  it("rechaza correos mal formados, fotos que no son imagen y campos extra", () => {
    assert.equal(validateValue("perfil", { correo: "ana@correo" }), false);
    assert.equal(validateValue("perfil", { foto: "https://ejemplo.com/foto.jpg" }), false);
    assert.equal(validateValue("perfil", { foto: "data:image/svg+xml;base64,PHN2Zz4=" }), false);
    assert.equal(validateValue("perfil", { nombre: "Ana", admin: true }), false);
  });
});
