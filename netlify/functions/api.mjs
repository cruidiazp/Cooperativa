import { getStore } from "@netlify/blobs";
import { createHandler } from "./lib/handler.mjs";

// "strong" asegura que, justo después de elegir un número, todos lo vean ocupado.
const store = getStore({ name: "talonario", consistency: "strong" });

// Lee las variables de entorno de Netlify de las dos formas posibles
// (Netlify.env en funciones modernas, process.env como respaldo).
const read = (name) => {
  try {
    const v = globalThis.Netlify?.env?.get(name);
    if (v) return v.trim();
  } catch { /* sin Netlify.env */ }
  return process.env[name]?.trim();
};

const env = {
  get ADMIN_PASSWORD() { return read("ADMIN_PASSWORD"); },
  get TOKEN_SECRET() { return read("TOKEN_SECRET"); },
};

export default createHandler({ store, env });

export const config = { path: "/api/*" };
