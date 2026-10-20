import { getStore } from "@netlify/blobs";
import { createHandler } from "./lib/handler.mjs";

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

// IMPORTANTE: la conexión a Blobs se crea en CADA petición. Netlify entrega un token
// temporal por invocación; si se guardara al arrancar, vencería ("Token expired").
export default async (req) => {
  // "strong" asegura que, justo después de elegir un número, todos lo vean ocupado.
  const store = getStore({ name: "talonario", consistency: "strong" });
  return createHandler({ store, env })(req);
};

export const config = { path: "/api/*" };

