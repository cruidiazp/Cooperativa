// Lógica de la API del talonario. Recibe el "store" (Netlify Blobs en producción,
// un almacenamiento en memoria en las pruebas) para poder probarla sin Netlify.
import crypto from "node:crypto";

export const DEFAULT_CONFIG = {
  title: "Mi Talonario",
  description: "",
  imageUrl: "",
  drawDate: "",
  contact: "",
  minNumber: 0,
  maxNumber: 100,
  maxPerPurchase: 0, // 0 = sin límite
  isOpen: true,
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const numKey = (n) => `n/${String(n).padStart(3, "0")}`;
const keyToNum = (k) => parseInt(k.slice(2), 10);
const ticketKey = (id) => `t/${id}`;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// ---------- Autenticación del administrador ----------
function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest();
}
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}
function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token, secret) {
  if (typeof token !== "string") return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.role === "admin" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

// ---------- Validaciones ----------
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function parseNumbers(list, config) {
  if (!Array.isArray(list) || list.length === 0) throw new HttpError(400, "Elige al menos un número.");
  if (list.length > 1000) throw new HttpError(400, "Demasiados números.");
  const nums = [...new Set(list.map((n) => Number(n)))];
  for (const n of nums) {
    if (!Number.isInteger(n) || n < config.minNumber || n > config.maxNumber) {
      throw new HttpError(400, "Hay números fuera del rango permitido.");
    }
  }
  return nums.sort((a, b) => a - b);
}

function validateConfig(input, takenNumbers) {
  const c = {
    title: clean(input.title, 80),
    description: String(input.description ?? "").trim().slice(0, 600),
    imageUrl: clean(input.imageUrl, 500),
    drawDate: clean(input.drawDate, 40),
    contact: clean(input.contact, 120),
    minNumber: 0,
    maxNumber: Number(input.maxNumber),
    maxPerPurchase: Number(input.maxPerPurchase ?? 0),
    isOpen: Boolean(input.isOpen),
  };
  if (!c.title) throw new HttpError(400, "El título es obligatorio.");
  if (c.imageUrl && !/^https?:\/\//i.test(c.imageUrl)) {
    throw new HttpError(400, "La imagen debe ser una URL que empiece por http:// o https://");
  }
  if (c.drawDate && !/^\d{4}-\d{2}-\d{2}$/.test(c.drawDate)) {
    throw new HttpError(400, "La fecha del sorteo no es válida.");
  }
  if (!Number.isInteger(c.maxNumber) || c.maxNumber < 9 || c.maxNumber > 999) {
    throw new HttpError(400, "El número máximo debe estar entre 9 y 999.");
  }
  const highest = takenNumbers.length ? Math.max(...takenNumbers) : -1;
  if (c.maxNumber < highest) {
    throw new HttpError(400, `No puedes bajar el máximo a ${c.maxNumber}: el número ${highest} ya está tomado. Libéralo primero.`);
  }
  if (!Number.isInteger(c.maxPerPurchase) || c.maxPerPurchase < 0 || c.maxPerPurchase > 1000) {
    throw new HttpError(400, "El máximo por persona no es válido (0 = sin límite).");
  }
  return c;
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Petición inválida.");
  }
}

// Intenta crear el valor solo si la clave NO existe (operación atómica en Netlify Blobs).
async function claim(store, key, value) {
  const res = await store.setJSON(key, value, { onlyIfNew: true });
  return res?.modified !== false;
}

export function createHandler({ store, env = process.env }) {
  const secret = () => env.TOKEN_SECRET || env.ADMIN_PASSWORD;

  async function getConfig() {
    const saved = await store.get("config", { type: "json" });
    return { ...DEFAULT_CONFIG, ...(saved || {}) };
  }

  async function takenKeys() {
    const { blobs } = await store.list({ prefix: "n/" });
    return blobs.map((b) => b.key);
  }

  async function allEntries() {
    const keys = await takenKeys();
    const entries = await Promise.all(keys.map((k) => store.get(k, { type: "json" })));
    return entries.filter(Boolean).sort((a, b) => a.number - b.number);
  }

  function requireAdmin(req) {
    if (!secret()) throw new HttpError(503, "Falta configurar la variable ADMIN_PASSWORD en Netlify.");
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!verify(token, secret())) throw new HttpError(401, "Sesión no válida o vencida.");
  }

  const publicConfig = (c) => ({
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    drawDate: c.drawDate,
    contact: c.contact,
    minNumber: c.minNumber,
    maxNumber: c.maxNumber,
    maxPerPurchase: c.maxPerPurchase,
    isOpen: c.isOpen,
  });

  async function reserve({ name, phone, numbers, config, source }) {
    const createdAt = new Date().toISOString();
    const id = crypto.randomBytes(9).toString("base64url");
    const claimed = [];
    const conflicts = [];
    for (const n of numbers) {
      const ok = await claim(store, numKey(n), { number: n, name, phone, ticketId: id, createdAt, source });
      (ok ? claimed : conflicts).push(n);
    }
    if (conflicts.length) {
      await Promise.all(claimed.map((n) => store.delete(numKey(n))));
      throw new HttpError(
        409,
        conflicts.length === 1
          ? `El número ${String(conflicts[0]).padStart(2, "0")} acaba de ser tomado por otra persona.`
          : "Algunos números acaban de ser tomados por otra persona.",
        { conflicts },
      );
    }
    const ticket = { id, name, phone, numbers: claimed, createdAt };
    await store.setJSON(ticketKey(id), ticket);
    return ticket;
  }

  return async function handler(req) {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\/(\.netlify\/functions\/api|api)\/?/, "").replace(/\/$/, "");
      const method = req.method.toUpperCase();

      // ---------- Público ----------
      if (method === "GET" && path === "state") {
        const [config, keys] = await Promise.all([getConfig(), takenKeys()]);
        return json(200, { config: publicConfig(config), taken: keys.map(keyToNum).sort((a, b) => a - b) });
      }

      if (method === "POST" && path === "reserve") {
        const body = await readJson(req);
        const config = await getConfig();
        if (!config.isOpen) throw new HttpError(403, "El talonario está cerrado por ahora.");
        const name = clean(body.name, 60);
        const phone = clean(body.phone, 25);
        if (name.length < 2) throw new HttpError(400, "Escribe tu nombre.");
        if (phone.replace(/\D/g, "").length < 7) throw new HttpError(400, "Escribe un teléfono de contacto válido.");
        const numbers = parseNumbers(body.numbers, config);
        if (config.maxPerPurchase > 0 && numbers.length > config.maxPerPurchase) {
          throw new HttpError(400, `Solo puedes elegir hasta ${config.maxPerPurchase} números por persona.`);
        }
        const ticket = await reserve({ name, phone, numbers, config, source: "publico" });
        return json(201, { ticketId: ticket.id, numbers: ticket.numbers });
      }

      if (method === "GET" && path.startsWith("ticket/")) {
        const id = path.slice(7);
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) throw new HttpError(404, "Ticket no encontrado.");
        const ticket = await store.get(ticketKey(id), { type: "json" });
        if (!ticket) throw new HttpError(404, "Ticket no encontrado.");
        const config = await getConfig();
        // Solo cuenta los números que siguen siendo de este ticket (el admin pudo liberarlos).
        const current = await Promise.all(ticket.numbers.map((n) => store.get(numKey(n), { type: "json" })));
        const numbers = ticket.numbers.filter((_, i) => current[i]?.ticketId === id);
        return json(200, {
          id,
          name: ticket.name,
          createdAt: ticket.createdAt,
          numbers,
          released: ticket.numbers.filter((n) => !numbers.includes(n)),
          config: publicConfig(config),
        });
      }

      // ---------- Administración ----------
      if (method === "POST" && path === "admin/login") {
        if (!secret()) throw new HttpError(503, "Falta configurar la variable ADMIN_PASSWORD en Netlify.");
        const body = await readJson(req);
        if (!env.ADMIN_PASSWORD || !safeEqual(body.password ?? "", env.ADMIN_PASSWORD)) {
          await new Promise((r) => setTimeout(r, 800)); // frena la fuerza bruta
          throw new HttpError(401, "Contraseña incorrecta.");
        }
        const exp = Date.now() + TOKEN_TTL_MS;
        return json(200, { token: sign({ role: "admin", exp }, secret()), expiresAt: exp });
      }

      if (path.startsWith("admin/")) {
        requireAdmin(req);

        if (method === "GET" && path === "admin/data") {
          const [config, entries] = await Promise.all([getConfig(), allEntries()]);
          return json(200, { config, entries });
        }

        if (method === "POST" && path === "admin/config") {
          const body = await readJson(req);
          const taken = (await takenKeys()).map(keyToNum);
          const config = validateConfig(body, taken);
          await store.setJSON("config", config);
          return json(200, { config });
        }

        if (method === "POST" && path === "admin/assign") {
          const body = await readJson(req);
          const config = await getConfig();
          const name = clean(body.name, 60);
          const phone = clean(body.phone, 25);
          if (name.length < 2) throw new HttpError(400, "Escribe el nombre de la persona.");
          const numbers = parseNumbers(body.numbers, config);
          const ticket = await reserve({ name, phone, numbers, config, source: "admin" });
          return json(201, { ticketId: ticket.id, numbers: ticket.numbers });
        }

        if (method === "POST" && path === "admin/release") {
          const body = await readJson(req);
          const config = await getConfig();
          const numbers = parseNumbers(body.numbers, config);
          await Promise.all(numbers.map((n) => store.delete(numKey(n))));
          return json(200, { released: numbers });
        }

        if (method === "POST" && path === "admin/reset") {
          const body = await readJson(req);
          if (body.confirm !== "REINICIAR") throw new HttpError(400, "Confirmación incorrecta.");
          const [nums, tickets] = await Promise.all([
            store.list({ prefix: "n/" }),
            store.list({ prefix: "t/" }),
          ]);
          await Promise.all([...nums.blobs, ...tickets.blobs].map((b) => store.delete(b.key)));
          return json(200, { ok: true });
        }
      }

      throw new HttpError(404, "Ruta no encontrada.");
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message, ...err.extra });
      console.error(err);
      // "detail" ayuda a diagnosticar problemas de despliegue; es solo el mensaje técnico.
      return json(500, { error: "Error interno del servidor.", detail: `${err?.name || "Error"}: ${String(err?.message || err).slice(0, 300)}` });
    }
  };
}
