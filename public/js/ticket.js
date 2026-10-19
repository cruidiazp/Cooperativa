import { api, formatDate, numberChips, LOGO_SVG } from "/js/common.js";

const id = location.pathname.split("/").filter(Boolean).pop();
const box = document.getElementById("ticket");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

try {
  const t = await api(`ticket/${encodeURIComponent(id)}`);
  document.title = `Ticket · ${t.config.title}`;
  document.getElementById("title").textContent = t.config.title;
  document.getElementById("date").textContent = t.config.drawDate ? `Sorteo: ${formatDate(t.config.drawDate)}` : "";

  box.replaceChildren();
  const logo = el("div", "logo");
  logo.style.margin = "0 auto 8px";
  logo.innerHTML = LOGO_SVG;
  const nums = el("div", "nums");
  nums.append(numberChips(t.numbers, t.released));

  box.append(
    logo,
    el("div", "code", t.id),
    el("div", "who", t.name),
    nums,
    el("div", "badge", t.numbers.length ? "NÚMEROS REGISTRADOS" : "SIN NÚMEROS ACTIVOS"),
    el("hr"),
    el("p", "small", `Registrado el ${formatDate(t.createdAt, true)}`),
  );
  if (t.released.length) {
    box.append(el("p", "small", "Los números tachados fueron liberados por el organizador."));
  }
  box.append(el("p", "small", "Este ticket solo comprueba los números elegidos. No incluye pagos."));
  if (t.config.contact) box.append(el("p", "small", `Contacto del organizador: ${t.config.contact}`));
  const print = document.getElementById("printBtn");
  print.hidden = false;
  print.addEventListener("click", () => window.print());
} catch (e) {
  box.replaceChildren(el("p", null, e.message));
}
