import { api, pad, toast, formatDate, LOGO_SVG } from "/js/common.js";

const $ = (id) => document.getElementById(id);
const state = { config: null, taken: new Set(), selected: new Set(), busy: false };

$("logo").innerHTML = LOGO_SVG;

function renderInfo() {
  const c = state.config;
  document.title = c.title;
  $("title").textContent = c.title;
  $("heroTitle").textContent = c.title;
  $("heroDesc").textContent = c.description;
  $("heroDesc").hidden = !c.description;
  $("date").textContent = c.drawDate ? `Sorteo: ${formatDate(c.drawDate)}` : "";
  $("sDraw").textContent = c.drawDate ? formatDate(c.drawDate).replace(/ de \d{4}$/, "").replace(" de ", " ") : "Por definir";
  const img = $("heroImg");
  if (c.imageUrl) { img.src = c.imageUrl; img.hidden = false; } else { img.hidden = true; }
  const chips = $("chips");
  chips.replaceChildren();
  const add = (text) => { const s = document.createElement("span"); s.className = "chip"; s.textContent = text; chips.append(s); };
  if (c.maxPerPurchase > 0) add(`Máximo ${c.maxPerPurchase} números por persona`);
  if (c.contact) add(`Contacto: ${c.contact}`);
  $("closed").hidden = c.isOpen;
}

function renderGrid() {
  const c = state.config;
  const grid = $("grid");
  grid.replaceChildren();
  for (let n = c.minNumber; n <= c.maxNumber; n++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "num";
    b.textContent = pad(n);
    b.dataset.n = n;
    const taken = state.taken.has(n);
    if (taken) { b.classList.add("taken"); b.disabled = true; b.title = "Número tomado"; }
    else if (state.selected.has(n)) b.classList.add("selected");
    if (!c.isOpen) b.disabled = true;
    grid.append(b);
  }
}

function renderStats() {
  const total = state.config.maxNumber - state.config.minNumber + 1;
  const taken = state.taken.size;
  $("sFree").textContent = total - taken;
  $("sTaken").textContent = taken;
  const pct = Math.round((taken / total) * 100);
  $("pct").textContent = `${pct}%`;
  $("barFill").style.width = `${pct}%`;
}

function renderActions() {
  const n = state.selected.size;
  $("takeBtn").textContent = `Tomar números (${n})`;
  $("takeBtn").disabled = n === 0 || !state.config.isOpen;
  $("clearBtn").hidden = n === 0;
  $("randomBtn").disabled = !state.config.isOpen;
}

function renderAll() { renderInfo(); renderGrid(); renderStats(); renderActions(); }

async function load(initial = false) {
  try {
    const data = await api("state");
    state.config = data.config;
    state.taken = new Set(data.taken);
    const lost = [...state.selected].filter((n) => state.taken.has(n) || n > data.config.maxNumber);
    lost.forEach((n) => state.selected.delete(n));
    renderAll();
    if (lost.length && !initial) toast(`Alguien tomó antes: ${lost.map(pad).join(", ")}. Lo quitamos de tu selección.`, true);
  } catch (e) {
    if (initial) { $("title").textContent = "No se pudo cargar"; toast(e.message, true); }
  }
}

function limitReached() {
  const max = state.config.maxPerPurchase;
  return max > 0 && state.selected.size >= max;
}

$("grid").addEventListener("click", (e) => {
  const b = e.target.closest(".num");
  if (!b || b.disabled) return;
  const n = Number(b.dataset.n);
  if (state.selected.has(n)) {
    state.selected.delete(n);
    b.classList.remove("selected");
  } else {
    if (limitReached()) return toast(`Solo puedes elegir hasta ${state.config.maxPerPurchase} números.`, true);
    state.selected.add(n);
    b.classList.add("selected");
  }
  renderActions();
});

$("randomBtn").addEventListener("click", () => {
  const c = state.config;
  const free = [];
  for (let n = c.minNumber; n <= c.maxNumber; n++) if (!state.taken.has(n) && !state.selected.has(n)) free.push(n);
  if (!free.length) return toast("No quedan números disponibles.", true);
  if (limitReached()) return toast(`Solo puedes elegir hasta ${c.maxPerPurchase} números.`, true);
  const pick = free[Math.floor(Math.random() * free.length)];
  state.selected.add(pick);
  renderGrid();
  renderActions();
  $("grid").querySelector(`[data-n="${pick}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
});

$("clearBtn").addEventListener("click", () => { state.selected.clear(); renderGrid(); renderActions(); });

const dlg = $("dlg");
$("takeBtn").addEventListener("click", () => {
  $("picked").textContent = [...state.selected].sort((a, b) => a - b).map((n) => "#" + pad(n)).join("  ");
  $("err").textContent = "";
  try { $("name").value = localStorage.getItem("tal_name") || ""; $("phone").value = localStorage.getItem("tal_phone") || ""; } catch { /* sin storage */ }
  dlg.showModal();
});
$("closeDlg").addEventListener("click", () => dlg.close());

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  $("submitBtn").disabled = true;
  $("err").textContent = "";
  try {
    const name = $("name").value.trim();
    const phone = $("phone").value.trim();
    const res = await api("reserve", { method: "POST", body: { name, phone, numbers: [...state.selected] } });
    try { localStorage.setItem("tal_name", name); localStorage.setItem("tal_phone", phone); } catch { /* sin storage */ }
    location.href = `/ticket/${res.ticketId}`;
  } catch (err) {
    $("err").textContent = err.message;
    if (err.status === 409) {
      (err.data.conflicts || []).forEach((n) => state.selected.delete(n));
      dlg.close();
      await load();
      toast(err.message, true);
    }
  } finally {
    state.busy = false;
    $("submitBtn").disabled = false;
  }
});

load(true);
setInterval(() => { if (!dlg.open && !document.hidden) load(); }, 15000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !dlg.open) load(); });
