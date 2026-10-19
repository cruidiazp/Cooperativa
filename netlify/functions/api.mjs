import { getStore } from "@netlify/blobs";
import { createHandler } from "./lib/handler.mjs";

// "strong" asegura que, justo después de elegir un número, todos lo vean ocupado.
const store = getStore({ name: "talonario", consistency: "strong" });

export default createHandler({ store });

export const config = { path: "/api/*" };
