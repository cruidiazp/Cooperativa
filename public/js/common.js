export const pad = (n) => String(n).padStart(2, "0");

export const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 20a5 5 0 0 1 5-5h38a5 5 0 0 1 5 5v7a6 6 0 0 0 0 12v7a5 5 0 0 1-5 5H13a5 5 0 0 1-5-5v-7a6 6 0 0 0 0-12z" fill="#009688"/><path d="M26 19v26" stroke="#e0f2f0" stroke-width="3" stroke-dasharray="4 4"/></svg>`;

export async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* respuesta vacía */ }
  if (!res.ok) {
    const err = new Error(data.error || "Ocurrió un error. Intenta de nuevo.");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function toast(message, isError = false) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.append(wrap);
  }
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " err" : "");
  t.textContent = message;
  wrap.append(t);
  setTimeout(() => t.remove(), 3800);
}

export function formatDate(iso, withTime = false) {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00") : new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-CO", withTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "long", year: "numeric" });
}

export function numberChips(numbers, offList = []) {
  const frag = document.createDocumentFragment();
  numbers.forEach((n) => {
    const s = document.createElement("span");
    s.textContent = pad(n);
    frag.append(s);
  });
  offList.forEach((n) => {
    const s = document.createElement("span");
    s.className = "off";
    s.textContent = pad(n);
    frag.append(s);
  });
  return frag;
}
