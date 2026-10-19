import { api, pad, toast, formatDate, numberChips, LOGO_SVG } from "/js/common.js";

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "tal_admin_token";
const S = { token: null, config: null, entries: [] };

$("logo").innerHTML = LOGO_SVG;

const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* sin storage */ } };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function call(path, opts = {}) {
  try {
    return await api(path, { ...opts, token: S.token });
  } catch (e) {
    if (e.status === 401 && S.token) { logout("Tu sesión venció. Entra de nuevo."); }
    throw e;
  }
}

// ---------- Sesión ----------
function logout(msg) {
  S.token = null;
  setToken(null);
  $("appView").hidden = true;
  $("loginView").hidden = false;
  if (msg) $("loginErr").textContent = msg;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginErr").textContent = "";
  try {
    const r = await api("admin/login", { method: "POST", body: { password: $("pw").value } });
    S.token = r.token;
    setToken(r.token);
    $("pw").value = "";
    await start();
  } catch (err) {
    $("loginErr").textContent = err.message;
  }
});
$("logoutBtn").addEventListener("click", () => logout());

async function start() {
  await refresh();
  $("loginView").hidden = true;
  $("appView").hidden = false;
}

async function refresh() {
  const data = await call("admin/data");
  S.config = data.config;
  S.entries = data.entries;
  render();
}

// ---------- Render ----------
function render() {
  const c = S.config;
  const total = c.maxNumber - c.minNumber + 1;
  $("adminTitle").textContent = c.title;
  document.title = `Admin · ${c.title}`;
  $("aTotal").textContent = total;
  $("aTaken").textContent = S.entries.length;
  $("aFree").textContent = total - S.entries.length;
  $("aPeople").textContent = groups().length;
  renderGrid();
  renderPeople();
  fillSettings();
}

function renderGrid() {
  const taken = new Map(S.entries.map((e) => [e.number, e]));
  const grid = $("adminGrid");
  grid.replaceChildren();
  for (let n = S.config.minNumber; n <= S.config.maxNumber; n++) {
    const b = el("button", "num" + (taken.has(n) ? " taken" : ""), pad(n));
    b.type = "button";
    b.dataset.n = n;
    if (taken.has(n)) b.title = taken.get(n).name;
    grid.append(b);
  }
}

function groups() {
  const map = new Map();
  for (const e of S.entries) {
    const key = e.ticketId || `${e.name}|${e.phone}`;
    if (!map.has(key)) map.set(key, { key, ticketId: e.ticketId, name: e.name, phone: e.phone, createdAt: e.createdAt, source: e.source, numbers: [] });
    map.get(key).numbers.push(e.number);
  }
  return [...map.values()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function renderPeople() {
  const q = $("search").value.trim().toLowerCase();
  const list = groups().filter((g) =>
    !q || g.name.toLowerCase().includes(q) || (g.phone || "").toLowerCase().includes(q) || g.numbers.some((n) => pad(n) === q || String(n) === q));
  const body = $("peopleBody");
  body.replaceChildren();
  $("peopleEmpty").hidden = list.length > 0;
  for (const g of list) {
    const tr = el("tr");
    tr.append(el("td", null, g.name), el("td", null, g.phone || "—"));
    const tdN = el("td");
    const nums = el("div", "nums");
    nums.append(numberChips(g.numbers.sort((a, b) => a - b)));
    tdN.append(nums);
    tr.append(tdN, el("td", null, g.createdAt ? formatDate(g.createdAt, true) : ""));
    const tdA = el("td");
    const act = el("div", "row-actions");
    if (g.ticketId) {
      const a = el("a", "btn ghost small", "Ticket");
      a.href = `/ticket/${g.ticketId}`; a.target = "_blank"; a.rel = "noopener"; a.style.textDecoration = "none";
      act.append(a);
    }
    const rel = el("button", "btn danger small", "Liberar");
    rel.addEventListener("click", () => releaseNumbers(g.numbers, `¿Liberar los números de ${g.name} (${g.numbers.map(pad).join(", ")})?`));
    act.append(rel);
    tdA.append(act);
    tr.append(tdA);
    body.append(tr);
  }
}
$("search").addEventListener("input", renderPeople);

function fillSettings() {
  const c = S.config;
  $("cTitle").value = c.title;
  $("cDesc").value = c.description;
  $("cImg").value = c.imageUrl;
  $("cDate").value = c.drawDate;
  $("cContact").value = c.contact;
  $("cMax").value = c.maxNumber;
  $("cPer").value = c.maxPerPurchase;
  $("cOpen").checked = c.isOpen;
}

// ---------- Pestañas ----------
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
    ["numbers", "people", "settings"].forEach((n) => ($(`tab-${n}`).hidden = n !== t.dataset.tab));
  }));

// ---------- Acciones ----------
async function releaseNumbers(numbers, question) {
  if (!confirm(question)) return;
  try {
    await call("admin/release", { method: "POST", body: { numbers } });
    toast("Números liberados.");
    $("dlg").close();
    await refresh();
  } catch (e) { toast(e.message, true); }
}

$("adminGrid").addEventListener("click", (e) => {
  const b = e.target.closest(".num");
  if (!b) return;
  const n = Number(b.dataset.n);
  const entry = S.entries.find((x) => x.number === n);
  const body = $("dlgBody");
  body.replaceChildren();

  const head = el("div", "dlg-head");
  const close = el("button", "x", "×"); close.type = "button"; close.addEventListener("click", () => $("dlg").close());
  head.append(el("h3", null, entry ? "Número tomado" : "Asignar número"), close);
  body.append(head, el("div", "picked", "#" + pad(n)));

  if (entry) {
    body.append(el("p", null, `Nombre: ${entry.name}`), el("p", null, `Teléfono: ${entry.phone || "—"}`),
      el("p", "fine", `Elegido el ${formatDate(entry.createdAt, true)}${entry.source === "admin" ? " · asignado por el admin" : ""}`));
    const rel = el("button", "btn danger block", "Liberar este número");
    rel.addEventListener("click", () => releaseNumbers([n], `¿Liberar el número ${pad(n)}?`));
    body.append(rel);
  } else {
    const form = el("form");
    form.innerHTML = `<label>Nombre</label><input type="text" name="name" maxlength="60" required>
      <label>Teléfono (opcional)</label><input type="tel" name="phone" maxlength="25">
      <div class="error"></div>`;
    const ok = el("button", "btn block", "Asignar"); ok.type = "submit";
    form.append(ok);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      try {
        await call("admin/assign", { method: "POST", body: { name: fd.get("name"), phone: fd.get("phone"), numbers: [n] } });
        toast(`Número ${pad(n)} asignado.`);
        $("dlg").close();
        await refresh();
      } catch (err) { form.querySelector(".error").textContent = err.message; }
    });
    body.append(form);
  }
  $("dlg").showModal();
});

$("cfgForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("cfgErr").textContent = "";
  try {
    await call("admin/config", {
      method: "POST",
      body: {
        title: $("cTitle").value, description: $("cDesc").value, imageUrl: $("cImg").value,
        drawDate: $("cDate").value, contact: $("cContact").value, maxNumber: $("cMax").value,
        maxPerPurchase: $("cPer").value, isOpen: $("cOpen").checked,
      },
    });
    toast("Configuración guardada.");
    await refresh();
  } catch (err) { $("cfgErr").textContent = err.message; }
});

$("resetBtn").addEventListener("click", async () => {
  const word = prompt("Esto borra TODOS los números tomados. Escribe REINICIAR para confirmar:");
  if (word !== "REINICIAR") return;
  try {
    await call("admin/reset", { method: "POST", body: { confirm: "REINICIAR" } });
    toast("Talonario reiniciado.");
    await refresh();
  } catch (err) { toast(err.message, true); }
});

$("csvBtn").addEventListener("click", () => {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Número", "Nombre", "Teléfono", "Fecha", "Origen"]];
  S.entries.forEach((e) => rows.push([pad(e.number), e.name, e.phone, e.createdAt, e.source === "admin" ? "Admin" : "Público"]));
  // BOM para que Excel respete las tildes
  const csv = "﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `talonario-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Inicio ----------
S.token = getToken();
if (S.token) start().catch(() => logout());
