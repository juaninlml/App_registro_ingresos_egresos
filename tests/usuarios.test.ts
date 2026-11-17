import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DB_KEYS } from "../lib/types";
import { EMAIL, llaveAuth, llaveDato, normalizarEmail, OWNER_ID, prefijoDatos } from "../lib/usuarios";

const llaves = [...DB_KEYS, "tx:2026-11"];

describe("datos separados por usuario", () => {
  it("la cuenta original conserva sus llaves de siempre (sus datos no se mueven)", () => {
    assert.equal(llaveDato(OWNER_ID, "cards"), "fin:cards");
    assert.equal(llaveDato(OWNER_ID, "tx:2026-11"), "fin:tx:2026-11");
    assert.equal(llaveAuth(OWNER_ID, "totp"), "fin:auth:totp");
    assert.equal(llaveAuth(OWNER_ID, "recovery"), "fin:auth:recovery");
  });

  it("cada cuenta nueva tiene su propio prefijo", () => {
    assert.equal(llaveDato("abc", "cards"), "fin:u:abc:cards");
    assert.equal(llaveAuth("abc", "totp"), "fin:auth:u:abc:totp");
  });

  it("ninguna llave de datos de un usuario coincide con la de otro", () => {
    const usuarios = [OWNER_ID, "abc", "abd", "a"];
    const todas = usuarios.flatMap((u) => llaves.map((k) => llaveDato(u, k)));
    assert.equal(new Set(todas).size, todas.length);
  });

  it("los datos de la cuenta original nunca caen dentro del prefijo de otra cuenta (al borrarla no se tocan)", () => {
    for (const k of llaves) {
      for (const otro of ["abc", "a", "u"]) assert.ok(!llaveDato(OWNER_ID, k).startsWith(prefijoDatos(otro)));
    }
  });

  it("las llaves de datos nunca pisan las de acceso", () => {
    for (const u of [OWNER_ID, "abc"]) for (const k of llaves) assert.ok(!llaveDato(u, k).startsWith("fin:auth:"));
  });
});

describe("correos", () => {
  it("se comparan sin mayúsculas ni espacios", () => {
    assert.equal(normalizarEmail("  Ana@Correo.MX "), "ana@correo.mx");
    assert.equal(normalizarEmail(42), "");
  });
  it("valida la forma", () => {
    assert.ok(EMAIL.test("ana@correo.mx"));
    assert.ok(!EMAIL.test("ana@correo"));
  });
});
