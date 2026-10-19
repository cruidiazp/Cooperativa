import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../netlify/functions/lib/handler.mjs";

// Almacenamiento en memoria con la misma interfaz que Netlify Blobs.
function memoryStore() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? JSON.parse(m.get(k)) : null;
    },
    async setJSON(k, v, opts = {}) {
      if (opts.onlyIfNew && m.has(k)) return { modified: false };
      m.set(k, JSON.stringify(v));
      return { modified: true };
    },
    async delete(k) {
      m.delete(k);
    },
    async list({ prefix = "" } = {}) {
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

function setup() {
  const handler = createHandler({ store: memoryStore(), env: { ADMIN_PASSWORD: "secreta" } });
  const call = async (method, path, body, token) => {
    const res = await handler(
      new Request(`http://localhost/api/${path}`, {
        method,
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    return { status: res.status, data: await res.json() };
  };
  return { call };
}

test("estado inicial: rango 0-100 y nada tomado", async () => {
  const { call } = setup();
  const { status, data } = await call("GET", "state");
  assert.equal(status, 200);
  assert.equal(data.config.maxNumber, 100);
  assert.deepEqual(data.taken, []);
});

test("elegir números y generar ticket", async () => {
  const { call } = setup();
  const r = await call("POST", "reserve", { name: "Ana Pérez", phone: "3001234567", numbers: [7, 0, 100] });
  assert.equal(r.status, 201);
  assert.deepEqual(r.data.numbers, [0, 7, 100]);
  const state = await call("GET", "state");
  assert.deepEqual(state.data.taken, [0, 7, 100]);
  const t = await call("GET", `ticket/${r.data.ticketId}`);
  assert.equal(t.data.name, "Ana Pérez");
  assert.deepEqual(t.data.numbers, [0, 7, 100]);
});

test("no permite elegir un número ya tomado y no deja números a medias", async () => {
  const { call } = setup();
  await call("POST", "reserve", { name: "Ana", phone: "3001234567", numbers: [5] });
  const r = await call("POST", "reserve", { name: "Luis", phone: "3007654321", numbers: [4, 5, 6] });
  assert.equal(r.status, 409);
  assert.deepEqual(r.data.conflicts, [5]);
  const state = await call("GET", "state");
  assert.deepEqual(state.data.taken, [5]); // 4 y 6 se revirtieron
});

test("validaciones: rango, nombre y teléfono", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "reserve", { name: "Ana", phone: "3001234567", numbers: [101] })).status, 400);
  assert.equal((await call("POST", "reserve", { name: "A", phone: "3001234567", numbers: [1] })).status, 400);
  assert.equal((await call("POST", "reserve", { name: "Ana", phone: "123", numbers: [1] })).status, 400);
  assert.equal((await call("POST", "reserve", { name: "Ana", phone: "3001234567", numbers: [] })).status, 400);
});

test("el admin requiere contraseña", async () => {
  const { call } = setup();
  assert.equal((await call("GET", "admin/data")).status, 401);
  assert.equal((await call("GET", "admin/data", null, "token.falso")).status, 401);
  const bad = await call("POST", "admin/login", { password: "mala" });
  assert.equal(bad.status, 401);
});

test("flujo de administración: login, ver, asignar, liberar, configurar, reiniciar", async () => {
  const { call } = setup();
  const login = await call("POST", "admin/login", { password: "secreta" });
  assert.equal(login.status, 200);
  const token = login.data.token;

  await call("POST", "reserve", { name: "Ana", phone: "3001234567", numbers: [1, 2] });
  const asg = await call("POST", "admin/assign", { name: "Pedro", phone: "", numbers: [10] }, token);
  assert.equal(asg.status, 201);

  let data = await call("GET", "admin/data", null, token);
  assert.equal(data.data.entries.length, 3);
  assert.equal(data.data.entries[0].name, "Ana");

  // Liberar y comprobar que el ticket ya no lo cuenta
  const ticketId = data.data.entries[0].ticketId;
  await call("POST", "admin/release", { numbers: [2] }, token);
  const t = await call("GET", `ticket/${ticketId}`);
  assert.deepEqual(t.data.numbers, [1]);
  assert.deepEqual(t.data.released, [2]);

  // No se puede bajar el máximo por debajo de un número tomado
  const cfg = { ...data.data.config, maxNumber: 5 };
  assert.equal((await call("POST", "admin/config", cfg, token)).status, 400);
  const ok = await call("POST", "admin/config", { ...cfg, maxNumber: 50, maxPerPurchase: 2, title: "Rifa 1" }, token);
  assert.equal(ok.status, 200);

  // Límite por persona
  const lim = await call("POST", "reserve", { name: "Luis", phone: "3007654321", numbers: [20, 21, 22] });
  assert.equal(lim.status, 400);

  // Cerrar
  await call("POST", "admin/config", { ...ok.data.config, isOpen: false }, token);
  assert.equal((await call("POST", "reserve", { name: "Luis", phone: "3007654321", numbers: [30] })).status, 403);

  // Reiniciar
  assert.equal((await call("POST", "admin/reset", { confirm: "no" }, token)).status, 400);
  assert.equal((await call("POST", "admin/reset", { confirm: "REINICIAR" }, token)).status, 200);
  assert.deepEqual((await call("GET", "state")).data.taken, []);
});

test("sin ADMIN_PASSWORD el admin queda deshabilitado", async () => {
  const handler = createHandler({ store: memoryStore(), env: {} });
  const res = await handler(
    new Request("http://localhost/api/admin/login", { method: "POST", body: JSON.stringify({ password: "x" }) }),
  );
  assert.equal(res.status, 503);
});
