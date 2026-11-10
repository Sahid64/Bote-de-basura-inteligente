const CONFIG = {
  titulo: "Bote Inteligente",
  deviceIdDefault: "3f0036000947313037363132",
  caidaVaciado: 25,
  umbrales: { medio: 50, casiLleno: 70, lleno: 80 },
  // Solo se usa si no hay ubicación guardada ni permiso de geolocalización
  ubicacionBase: { lat: 19.4326, lng: -99.1332 },
  // Base de recolección (inicio y fin de la ruta), relativa al Bote 1
  base: { dLat: -0.0012, dLng: -0.0009 },
  compartimentos: [
    { id: 1, nombre: "Orgánico", icono: "leaf", colorHex: "#4ade80", colorVar: "--organico" },
    { id: 2, nombre: "Reciclable", icono: "recycle", colorHex: "#38bdf8", colorVar: "--reciclable" },
    { id: 3, nombre: "Inorgánico", icono: "trash", colorHex: "#f59e0b", colorVar: "--inorganico" }
  ],
  // Botes simulados: posición relativa al Bote 1 y nivel inicial [org, rec, inorg]
  botesSim: [
    { id: 2, nombre: "Bote 2 · Entrada",        dLat:  0.0022, dLng:  0.0016, nivel: [78, 52, 85] },
    { id: 3, nombre: "Bote 3 · Cafetería",      dLat: -0.0015, dLng:  0.0030, nivel: [35, 60, 20] },
    { id: 4, nombre: "Bote 4 · Biblioteca",     dLat:  0.0008, dLng: -0.0028, nivel: [88, 74, 66] },
    { id: 5, nombre: "Bote 5 · Estacionamiento", dLat: -0.0030, dLng: -0.0012, nivel: [12, 25, 40] }
  ]
};

const CALIB_DEFAULT = { vacio: [27, 27, 27], lleno: [3, 3, 3] };

const NAV_OFF = "nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all";
const NAV_ON = "nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all bg-blue-600/15 text-blue-400 border border-blue-500/30";
const TITULOS = {
  map: "Mapa de Botes",
  dashboard: "Dashboard",
  history: "Historial y Eventos",
  alerts: "Alertas y Reglas",
  device: "Salud del Dispositivo",
  calibration: "Calibración"
};

function leerJSON(k, def) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_) { return def; }
}

function calibInicial() {
  const c = leerJSON("bote_calib", null);
  if (c && Array.isArray(c.vacio) && Array.isArray(c.lleno) && c.vacio.length === 3 && c.lleno.length === 3) return c;
  const viejo = leerJSON("bote_depths", null); // versión anterior: solo profundidad
  return {
    vacio: Array.isArray(viejo) && viejo.length === 3 ? viejo : [...CALIB_DEFAULT.vacio],
    lleno: [...CALIB_DEFAULT.lleno]
  };
}

let state = {
  demoMode: !sessionStorage.getItem("pt"),
  token: sessionStorage.getItem("pt") || "",
  deviceId: sessionStorage.getItem("pd") || CONFIG.deviceIdDefault,
  baseApi: `https://api.particle.io/v1/devices/${sessionStorage.getItem("pd") || CONFIG.deviceIdDefault}`,
  mfaToken: null,
  timer: null,
  selectedRangeHours: 12,
  pushEnabled: false,
  audioEnabled: false,
  activeId: 1,
  botes: {},
  ubicacion: leerJSON("bote_ubicacion", null), // ubicación guardada del Bote 1
  ubicFuente: "predeterminada",
  moviendo: false,
  rutaVisible: true,
  calib: calibInicial(),
  sensorOk: [true, true, true],
  conexion: { conectado: false, t: null }
};

const SVG_ICONS = {
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  recycle: '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 1 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'
};

function getIco(key) {
  return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG_ICONS[key] || ''}</svg>`;
}

// ===================== BOTES Y PERSISTENCIA =====================
const botesLista = () => Object.values(state.botes);
const boteActivo = () => state.botes[state.activeId];
const ultimoDe = (b) => b.historial[b.historial.length - 1];
const calibDe = (b) => (b.real ? state.calib : CALIB_DEFAULT);
const $ = (id) => document.getElementById(id);

function lsKey(b, k) { return b.real ? `bote:${state.deviceId}:${k}` : `bote:sim${b.id}:${k}`; }

function cargarBote(b) {
  const h = leerJSON(lsKey(b, "hist"), []);
  const v = leerJSON(lsKey(b, "vac"), []);
  b.historial = Array.isArray(h) ? h : [];
  b.vaciados = (Array.isArray(v) ? v : []).sort((x, y) => y.t - x.t); // más reciente primero
}

function guardarBote(b) {
  try {
    localStorage.setItem(lsKey(b, "hist"), JSON.stringify(b.historial.slice(-500)));
    localStorage.setItem(lsKey(b, "vac"), JSON.stringify(b.vaciados.slice(0, 50)));
  } catch (_) {}
}

function cmDesdePct(pct, vacio, lleno) {
  return parseFloat((vacio - (pct / 100) * (vacio - lleno)).toFixed(1));
}

function pctDesdeCm(cm, i, cal = state.calib) {
  const pct = ((cal.vacio[i] - cm) / (cal.vacio[i] - cal.lleno[i])) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function generarHistorial(b, objetivo) {
  const cal = calibDe(b), ahora = Date.now(), n = 25;
  const nivel = objetivo.map(v => Math.max(3, v - 30));
  b.historial = [];
  for (let i = n; i >= 0; i--) {
    const t = ahora - i * 30 * 60 * 1000;
    const p = nivel.map((v, k) => {
      nivel[k] = Math.min(98, Math.max(2, v + (objetivo[k] - v) / (i + 1) + (Math.random() * 2 - 1)));
      return Math.round(nivel[k]);
    });
    const c = p.map((v, k) => cmDesdePct(v, cal.vacio[k], cal.lleno[k]));
    b.historial.push({ t, p, c, sim: 1 });
  }
}

function initBotes() {
  state.botes[1] = { id: 1, nombre: "Bote 1 · Photon", real: true, historial: [], vaciados: [] };
  CONFIG.botesSim.forEach(s => { state.botes[s.id] = { ...s, real: false, historial: [], vaciados: [] }; });

  botesLista().forEach(b => {
    cargarBote(b);
    if (b.historial.length === 0) generarHistorial(b, b.real ? [55, 40, 30] : b.nivel);
    if (!b.real && b.vaciados.length === 0) {
      b.vaciados.push({ t: Date.now() - (5 + b.id) * 3600e3, compId: (b.id % 3) + 1, pre: 88, post: 7, sim: 1 });
    }
    guardarBote(b);
  });
}

function registrarVaciado(b, compId, pre, post, t, sim) {
  b.vaciados.unshift({ t, compId, pre, post, ...(sim ? { sim: 1 } : {}) });
  if (b.vaciados.length > 50) b.vaciados.pop();
  if (state.audioEnabled && b.id === state.activeId) playTone(523.25, 0.15);
}

function tickBoteSimulado(b) {
  const cal = calibDe(b);
  const ult = ultimoDe(b) || { p: [20, 20, 20] };
  const t = Date.now();
  const paso = [4, 5, 3];
  const p = ult.p.map((v, i) => {
    let n = Math.min(100, Math.max(0, v + Math.floor(Math.random() * paso[i] - 1)));
    if (n >= 97) {
      const post = 5 + Math.floor(Math.random() * 6);
      registrarVaciado(b, i + 1, n, post, t, true);
      n = post;
    }
    return n;
  });
  const c = p.map((v, i) => cmDesdePct(v, cal.vacio[i], cal.lleno[i]));
  b.historial.push({ t, p, c, sim: 1 });
  if (b.historial.length > 500) b.historial.shift();
  guardarBote(b);
}

// ===================== INICIO =====================
window.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initBotes();
  initUi();
  updateModeStatus();
  setupEventListeners();
  irA("map");
  initMapa();
  resolverUbicacion();
  renderAll();

  if (!state.demoMode) {
    fetchHardwareInterval();
    leerCalibDePhoton();
    fetchTelemetry();
  }
  state.timer = setInterval(fetchTelemetry, 15000);
});

function initUi() {
  const gridCards = $("gridCards");
  gridCards.innerHTML = "";

  CONFIG.compartimentos.forEach((c) => {
    gridCards.insertAdjacentHTML("beforeend", `
      <div class="bg-cardDark border border-borderDark rounded-2xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 font-bold text-white">
            <span class="p-2 rounded-xl bg-slate-800 text-slate-200 border border-borderDark" style="color:${c.colorHex}">
              ${getIco(c.icono)}
            </span>
            <span>${c.nombre}</span>
          </div>
          <span id="badge-${c.id}" class="px-2.5 py-1 rounded-full text-[11px] font-bold badge-normal">Normal</span>
        </div>

        <div class="relative w-44 h-44 mx-auto my-3 flex items-center justify-center">
          <svg class="w-full h-full" viewBox="0 0 190 190">
            <circle class="text-slate-800" stroke-width="14" stroke="currentColor" fill="none" cx="95" cy="95" r="78"/>
            <circle id="ring-${c.id}" class="ring-circle" stroke-width="14" stroke="${c.colorHex}" stroke-dasharray="0 490" stroke-linecap="round" fill="none" cx="95" cy="95" r="78"/>
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span id="pct-${c.id}" class="text-3xl font-extrabold text-white tracking-tight">0%</span>
            <span class="text-[11px] font-medium text-slate-400">Capacidad</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-3 border-t border-borderDark/60 text-center">
          <div class="bg-boxDark p-2 rounded-xl border border-borderDark/40">
            <div class="text-[10px] text-slate-400 font-medium">Distancia</div>
            <div id="cm-${c.id}" class="text-xs font-bold text-white mt-0.5">-- cm</div>
          </div>
          <div class="bg-boxDark p-2 rounded-xl border border-borderDark/40">
            <div class="text-[10px] text-slate-400 font-medium">Últ. Vaciado</div>
            <div id="vac-${c.id}" class="text-xs font-bold text-slate-200 mt-0.5">--</div>
          </div>
        </div>
      </div>
    `);
  });

  construirFormCalib();
  renderSaludSensores();
}

function renderSaludSensores() {
  const cont = $("devSensorCards");
  if (!cont) return;
  cont.innerHTML = CONFIG.compartimentos.map((c, i) => {
    const ok = state.demoMode || state.sensorOk[i];
    return `
    <div class="bg-boxDark p-4 rounded-xl border border-borderDark space-y-2">
      <div class="flex items-center justify-between text-xs font-bold text-white">
        <span>Sensor ${c.nombre} (HC-SR04)</span>
        <span class="${ok ? "text-emerald-400" : "text-red-400"}">${ok ? "OK" : "Sin eco"}</span>
      </div>
      <p class="text-[11px] text-slate-400">Eco ultrasónico: <span class="text-slate-200 font-medium">${ok ? "Estable" : "Sin respuesta"}</span></p>
      <p class="text-[11px] text-slate-400">Vacío / Lleno: <span class="text-slate-200 font-medium">${state.calib.vacio[i]} / ${state.calib.lleno[i]} cm</span></p>
    </div>`;
  }).join("");
}

function tiempoRelativoVaciado(compId) {
  const v = boteActivo().vaciados.find(item => item.compId === compId); // la lista está ordenada del más reciente al más antiguo
  if (!v) return "--";
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (v.t >= hoy.getTime()) return new Date(v.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.ceil((hoy.getTime() - v.t) / 864e5);
  return `Hace ${dias}d`;
}

// ===================== TELEMETRÍA =====================
async function fetchTelemetry() {
  // Los botes simulados avanzan siempre
  botesLista().forEach(b => { if (!b.real) tickBoteSimulado(b); });

  if (state.demoMode) {
    tickBoteSimulado(state.botes[1]);
    actualizarVistas();
    return;
  }

  if (!state.token || state.token.trim() === "") {
    $("aviso").hidden = false;
    $("avisoTxt").textContent = "Inicia sesión en Particle Cloud para ver las lecturas en vivo.";
    actualizarVistas();
    return;
  }

  try {
    if (!state.baseApi || !state.baseApi.startsWith("https://api.particle.io")) {
      state.baseApi = `https://api.particle.io/v1/devices/${state.deviceId || CONFIG.deviceIdDefault}`;
    }

    const r = await fetch(`${state.baseApi}/datos`, {
      headers: { "Authorization": "Bearer " + state.token }
    });
    const texto = await r.text();

    if (texto.trim().startsWith("<")) {
      throw new Error("Respuesta HTML recibida de Particle Cloud. Revisa la conectividad del dispositivo.");
    }

    const j = JSON.parse(texto);
    if (j.error === "invalid_token" || j.error === "invalid_request") {
      state.token = "";
      sessionStorage.removeItem("pt");
      updateModeStatus();
      throw new Error("Sesión de Particle expirada. Vuelve a iniciar sesión.");
    }
    if (j.error) throw new Error(j.error_description || j.error);

    const d = typeof j.result === "string" ? JSON.parse(j.result) : j.result;
    processParticleData(d, j.coreInfo);
    $("aviso").hidden = true;
  } catch (err) {
    state.conexion.conectado = false;
    $("aviso").hidden = false;
    $("avisoTxt").textContent = "Error Particle API: " + err.message;
  } finally {
    actualizarVistas();
  }
}

async function llamarParticleFunc(fn, arg) {
  if (state.demoMode) return { return_value: 1 };
  const r = await fetch(`${state.baseApi}/${fn}`, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + state.token,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ arg })
  });
  return await r.json();
}

async function fetchHardwareInterval() {
  if (state.demoMode || !state.token) return;
  try {
    const r = await fetch(`${state.baseApi}/minutos`, {
      headers: { "Authorization": "Bearer " + state.token }
    });
    const j = await r.json();
    if (j.result !== undefined) $("selMin").value = j.result;
  } catch (_) {}
}

// Lee la calibración que realmente tiene la Photon (variable "calib": "v1,l1;v2,l2;v3,l3")
async function leerCalibDePhoton() {
  if (state.demoMode || !state.token) return;
  try {
    const r = await fetch(`${state.baseApi}/calib`, {
      headers: { "Authorization": "Bearer " + state.token }
    });
    const j = await r.json();
    if (typeof j.result !== "string") return;
    const partes = j.result.split(";").map(s => s.split(",").map(Number));
    if (partes.length !== 3 || partes.some(p => p.length !== 2 || p.some(isNaN))) return;
    state.calib = { vacio: partes.map(p => p[0]), lleno: partes.map(p => p[1]) };
    localStorage.setItem("bote_calib", JSON.stringify(state.calib));
    cargarFormCalib();
    renderSaludSensores();
  } catch (_) {}
}

function processParticleData(d, coreInfo) {
  const b = state.botes[1];
  const t = d.t ? d.t * 1000 : Date.now();

  state.conexion = { conectado: true, t }; // si la lectura llegó, la Photon está en línea

  // Al llegar datos reales se descartan los de demostración
  if (b.historial.some(h => h.sim)) {
    b.historial = b.historial.filter(h => !h.sim);
    b.vaciados = b.vaciados.filter(v => !v.sim);
  }
  const ultimo = ultimoDe(b);

  const p = [], c = [];
  for (let i = 0; i < 3; i++) {
    const dist = Number(d["c" + (i + 1)]);
    let pct = d["p" + (i + 1)];
    const ok = dist > 0; // -1 = el sensor no recibió eco
    if (ok && !(typeof pct === "number" && pct >= 0)) pct = pctDesdeCm(dist, i);
    state.sensorOk[i] = ok;
    c.push(ok ? dist : (ultimo ? ultimo.c[i] : 0));
    p.push(ok ? pct : (ultimo ? ultimo.p[i] : 0));
  }

  renderSaludSensores();
  if (!state.sensorOk.some(Boolean)) return; // ningún sensor midió: no se grafica nada

  // Misma lectura que la anterior (la Photon solo actualiza cada X min): no se duplica
  if (ultimo && ultimo.t === t) return;

  if (ultimo) {
    p.forEach((val, idx) => {
      if (ultimo.p[idx] - val >= CONFIG.caidaVaciado) {
        registrarVaciado(b, idx + 1, ultimo.p[idx], val, t, false);
      }
    });
  }

  b.historial.push({ t, p, c });
  if (b.historial.length > 500) b.historial.shift();
  guardarBote(b);

  p.forEach((pct, idx) => {
    if (pct >= CONFIG.umbrales.lleno && state.pushEnabled) {
      sendPushNotification(`Contenedor ${CONFIG.compartimentos[idx].nombre} Lleno`, `El contenedor alcanzó un ${pct}% de su capacidad.`);
    }
  });
}

function actualizarVistas() {
  renderAll();
  renderMapaBotes();
}

// ===================== RENDER DASHBOARD =====================
function getStatusBadge(pct) {
  if (pct >= CONFIG.umbrales.lleno) return { txt: "¡Lleno!", cls: "badge-lleno" };
  if (pct >= CONFIG.umbrales.casiLleno) return { txt: "Casi Lleno", cls: "badge-casi-lleno" };
  if (pct >= CONFIG.umbrales.medio) return { txt: "Medio", cls: "badge-medio" };
  return { txt: "Normal", cls: "badge-normal" };
}

function renderEstado() {
  const el = $("statusBadge");
  if (!el) return;
  const b = boteActivo();
  const base = "text-[11px] font-bold px-2.5 py-1 rounded-full border ";

  if (!b.real || state.demoMode) {
    el.textContent = "Datos simulados";
    el.className = base + "bg-sky-500/10 text-sky-400 border-sky-500/20";
    return;
  }
  if (!state.conexion.t) {
    el.textContent = "Esperando datos de la Photon...";
    el.className = base + "bg-slate-500/10 text-slate-400 border-slate-500/20";
    return;
  }
  const hora = new Date(state.conexion.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (state.conexion.conectado) {
    el.textContent = `Photon en línea · Última: ${hora}`;
    el.className = base + "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  } else {
    el.textContent = `Photon sin conexión · Última: ${hora}`;
    el.className = base + "bg-amber-500/10 text-amber-400 border-amber-500/20";
  }
}

function renderAll() {
  const b = boteActivo();
  const current = ultimoDe(b);
  if (!current) return;

  renderEstado();
  const titulo = $("boteTitulo");
  if (titulo) titulo.textContent = b.nombre;

  const conSensor = b.real && !state.demoMode;
  CONFIG.compartimentos.forEach((c, i) => {
    const pct = current.p[i];
    const status = getStatusBadge(pct);

    $(`ring-${c.id}`).style.strokeDasharray = `${(pct / 100) * 490} 490`;
    $(`pct-${c.id}`).textContent = `${pct}%`;
    $(`cm-${c.id}`).textContent = (conSensor && !state.sensorOk[i]) ? "Sin eco" : `${current.c[i]} cm`;
    $(`vac-${c.id}`).textContent = tiempoRelativoVaciado(c.id);

    const badge = $(`badge-${c.id}`);
    badge.textContent = status.txt;
    badge.className = `px-2.5 py-1 rounded-full text-[11px] font-bold ${status.cls}`;
  });

  renderAreaChart();
  renderDonutChart(current.p);
  renderVaciadosTable();
  renderHistoryTable();
  renderLecturasCalib();
}

function renderAreaChart() {
  const svg = $("chartSvg");
  const wrapper = $("graficaWrapper");
  if (!wrapper || !svg) return;
  const W = wrapper.clientWidth || 600;
  const H = wrapper.clientHeight || 240;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const cutoff = Date.now() - state.selectedRangeHours * 3600 * 1000;
  const pts = boteActivo().historial.filter(h => h.t >= cutoff);

  if (pts.length < 2) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" style="fill:var(--suave)" text-anchor="middle" font-size="12">Recopilando telemetría...</text>`;
    return;
  }

  const margin = { top: 20, right: 15, bottom: 30, left: 35 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const minT = pts[0].t;
  const maxT = pts[pts.length - 1].t;

  const getX = t => margin.left + ((t - minT) / (maxT - minT || 1)) * innerW;
  const getY = val => margin.top + (1 - val / 100) * innerH;

  let svgContent = `
    <defs>
      <linearGradient id="grad-1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4ade80" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#4ade80" stop-opacity="0.0"/>
      </linearGradient>
      <linearGradient id="grad-2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
      </linearGradient>
      <linearGradient id="grad-3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0"/>
      </linearGradient>
    </defs>
  `;

  [0, 25, 50, 75, 100].forEach(v => {
    const y = getY(v);
    svgContent += `<line x1="${margin.left}" y1="${y}" x2="${W - margin.right}" y2="${y}" style="stroke:var(--pista)" stroke-dasharray="2 2"/>`;
    svgContent += `<text x="${margin.left - 8}" y="${y + 4}" style="fill:var(--suave)" font-size="10" text-anchor="end">${v}%</text>`;
  });

  CONFIG.compartimentos.forEach((c, idx) => {
    let pathD = "";
    let areaD = "";

    pts.forEach((h, i) => {
      const x = getX(h.t);
      const y = getY(h.p[idx]);
      if (i === 0) {
        pathD += `M ${x} ${y}`;
        areaD += `M ${x} ${margin.top + innerH} L ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }
    });

    const lastX = getX(pts[pts.length - 1].t);
    areaD += ` L ${lastX} ${margin.top + innerH} Z`;

    svgContent += `<path d="${areaD}" fill="url(#grad-${c.id})"/>`;
    svgContent += `<path d="${pathD}" fill="none" stroke="${c.colorHex}" stroke-width="2.5" stroke-linecap="round"/>`;
  });

  svgContent += `<line id="hoverLine" class="chart-hover-line hidden" x1="0" y1="${margin.top}" x2="0" y2="${H - margin.bottom}"/>`;
  svg.innerHTML = svgContent;

  wrapper.onmousemove = (e) => {
    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < margin.left || mouseX > W - margin.right) return;

    const hoverT = minT + ((mouseX - margin.left) / innerW) * (maxT - minT);
    let closest = pts[0];
    let minDiff = Math.abs(pts[0].t - hoverT);
    pts.forEach(p => {
      const diff = Math.abs(p.t - hoverT);
      if (diff < minDiff) { minDiff = diff; closest = p; }
    });

    const hoverLine = $("hoverLine");
    if (hoverLine) {
      const cx = getX(closest.t);
      hoverLine.setAttribute("x1", cx);
      hoverLine.setAttribute("x2", cx);
      hoverLine.classList.remove("hidden");
    }

    const tooltip = $("chartTooltip");
    if (tooltip) {
      const timeStr = new Date(closest.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      tooltip.innerHTML = `
        <div class="font-bold text-white mb-1 border-b border-slate-700 pb-1">${timeStr}</div>
        <div class="flex items-center justify-between gap-4 text-emerald-400"><span>Orgánico:</span><b>${closest.p[0]}% · ${closest.c[0]} cm</b></div>
        <div class="flex items-center justify-between gap-4 text-sky-400"><span>Reciclable:</span><b>${closest.p[1]}% · ${closest.c[1]} cm</b></div>
        <div class="flex items-center justify-between gap-4 text-amber-400"><span>Inorgánico:</span><b>${closest.p[2]}% · ${closest.c[2]} cm</b></div>
      `;
      tooltip.style.left = `${getX(closest.t)}px`;
      tooltip.style.top = `${getY(Math.max(...closest.p)) - 10}px`;
      tooltip.classList.remove("hidden");
    }
  };

  wrapper.onmouseleave = () => {
    const hoverLine = $("hoverLine");
    if (hoverLine) hoverLine.classList.add("hidden");
    const tooltip = $("chartTooltip");
    if (tooltip) tooltip.classList.add("hidden");
  };
}

function renderDonutChart(currentP) {
  const svg = $("donutSvg");
  if (!svg) return;
  const sum = currentP.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / 3);

  $("donutTotalVol").textContent = `${avg}%`;
  $("pctDonutOrg").textContent = `${currentP[0]}%`;
  $("pctDonutRec").textContent = `${currentP[1]}%`;
  $("pctDonutInorg").textContent = `${currentP[2]}%`;

  if (sum === 0) {
    svg.innerHTML = `<circle cx="50" cy="50" r="38" style="stroke:var(--pista)" stroke-width="12" fill="none"/>`;
    return;
  }

  const r = 38;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const colors = ["#4ade80", "#38bdf8", "#f59e0b"];
  let svgPaths = `<circle cx="50" cy="50" r="${r}" style="stroke:var(--pista)" stroke-width="12" fill="none"/>`;

  currentP.forEach((val, idx) => {
    const strokeDash = (val / 100) * (circ / 3);
    svgPaths += `
      <circle cx="50" cy="50" r="${r}"
        stroke="${colors[idx]}"
        stroke-width="12"
        fill="none"
        stroke-dasharray="${strokeDash} ${circ}"
        stroke-dashoffset="${-offset}"
        class="ring-circle"
      />
    `;
    offset += strokeDash;
  });

  svg.innerHTML = svgPaths;
}

function renderVaciadosTable() {
  const tbody = $("tbVaciadosDash");
  if (!tbody) return;
  const vaciados = boteActivo().vaciados;
  if (vaciados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No se han registrado eventos de vaciado recientemente.</td></tr>`;
    return;
  }

  tbody.innerHTML = vaciados.slice(0, 5).map(v => {
    const comp = CONFIG.compartimentos.find(c => c.id === v.compId);
    const timeStr = new Date(v.t).toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
    return `
      <tr class="hover:bg-boxDark/50 transition">
        <td class="p-3 font-semibold text-white">${timeStr}</td>
        <td class="p-3"><span class="flex items-center gap-1.5 font-bold" style="color:${comp.colorHex}">${getIco(comp.icono)} ${comp.nombre}</span></td>
        <td class="p-3 font-bold text-red-400">${v.pre}%</td>
        <td class="p-3 font-bold text-emerald-400">${v.post}%</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Vaciado Confirmado</span></td>
      </tr>
    `;
  }).join('');
}

function renderHistoryTable() {
  const tbody = $("tbHistorialFull");
  if (!tbody) return;
  const searchInput = $("searchHistory");
  const search = searchInput ? searchInput.value.toLowerCase() : "";

  let filtered = [...boteActivo().historial].reverse();
  if (search) {
    filtered = filtered.filter(h => new Date(h.t).toLocaleString("es-MX").toLowerCase().includes(search));
  }

  const lblTotal = $("lblTotalRegs");
  if (lblTotal) lblTotal.textContent = filtered.length;

  tbody.innerHTML = filtered.slice(0, 50).map(h => {
    const timeStr = new Date(h.t).toLocaleString("es-MX");
    return `
      <tr class="hover:bg-boxDark/50 transition">
        <td class="p-3 font-medium text-slate-200">${timeStr}</td>
        <td class="p-3 font-bold text-emerald-400">${h.p[0]}%</td>
        <td class="p-3 font-bold text-sky-400">${h.p[1]}%</td>
        <td class="p-3 font-bold text-amber-400">${h.p[2]}%</td>
        <td class="p-3 text-slate-400">${h.c[0]} cm</td>
        <td class="p-3 text-slate-400">${h.c[1]} cm</td>
        <td class="p-3 text-slate-400">${h.c[2]} cm</td>
      </tr>
    `;
  }).join('');
}

function playTone(freq, duration) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function sendPushNotification(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "https://cdn-icons-png.flaticon.com/512/3299/3299935.png" });
}

function exportToCsv() {
  const b = boteActivo();
  let csv = "Timestamp,Fecha_Hora,Organico_Pct,Reciclable_Pct,Inorganico_Pct,Dist_Org_cm,Dist_Rec_cm,Dist_Inorg_cm\n";
  b.historial.forEach(h => {
    const dateStr = `"${new Date(h.t).toLocaleString("es-MX")}"`;
    csv += `${h.t},${dateStr},${h.p[0]},${h.p[1]},${h.p[2]},${h.c[0]},${h.c[1]},${h.c[2]}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bote_${b.id}_telemetria_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateModeStatus() {
  const dot = $("modeDot");
  const txt = $("modeTxt");
  const btnModal = $("lblLoginBtnText");
  const btnLogoutModal = $("btnCerrarSesionModal");

  if (state.demoMode) {
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse";
    if (txt) txt.textContent = "Modo Demo";
    if (btnModal) btnModal.textContent = "Conectar Particle API";
    if (btnLogoutModal) btnLogoutModal.classList.add("hidden");
  } else {
    if (dot) dot.className = "w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse";
    if (txt) txt.textContent = "Modo Particle API";
    if (btnModal) btnModal.textContent = "Cuenta Particle Activa";
    if (btnLogoutModal) btnLogoutModal.classList.remove("hidden");
  }
  renderSaludSensores();
}

// ===================== CALIBRACIÓN =====================
function construirFormCalib() {
  const cont = $("calibRows");
  if (!cont) return;
  cont.innerHTML = CONFIG.compartimentos.map((c, i) => `
    <div class="bg-boxDark border border-borderDark rounded-xl p-4 space-y-3">
      <div class="text-xs font-bold" style="color:${c.colorHex}">${c.nombre} · sensor ${c.id}</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 mb-1">Bote vacío (cm)</label>
          <div class="flex gap-2">
            <input type="number" id="vacio${c.id}" step="0.1" class="w-full bg-cardDark border border-borderDark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
            <button type="button" data-tomar="vacio" data-i="${i}" class="px-3 rounded-lg text-[11px] font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition">Tomar</button>
          </div>
        </div>
        <div>
          <label class="block text-[11px] font-semibold text-slate-400 mb-1">Bote lleno (cm)</label>
          <div class="flex gap-2">
            <input type="number" id="lleno${c.id}" step="0.1" class="w-full bg-cardDark border border-borderDark rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
            <button type="button" data-tomar="lleno" data-i="${i}" class="px-3 rounded-lg text-[11px] font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition">Tomar</button>
          </div>
        </div>
      </div>
      <div class="text-[11px] text-slate-400">Lectura actual del sensor: <span id="lecturaCalib${c.id}" class="font-bold text-slate-200">-- cm</span></div>
    </div>
  `).join("");

  cont.querySelectorAll("[data-tomar]").forEach(btn => {
    btn.onclick = () => {
      const h = ultimoDe(state.botes[1]);
      if (!h) return;
      const i = parseInt(btn.dataset.i);
      $(`${btn.dataset.tomar}${i + 1}`).value = h.c[i];
    };
  });
  cargarFormCalib();
}

function cargarFormCalib() {
  CONFIG.compartimentos.forEach((c, i) => {
    const v = $(`vacio${c.id}`), l = $(`lleno${c.id}`);
    if (v) v.value = state.calib.vacio[i];
    if (l) l.value = state.calib.lleno[i];
  });
}

function renderLecturasCalib() {
  const h = ultimoDe(state.botes[1]);
  CONFIG.compartimentos.forEach((c, i) => {
    const el = $(`lecturaCalib${c.id}`);
    if (el) el.textContent = h ? `${h.c[i]} cm` : "-- cm";
  });
}

// ===================== NAVEGACIÓN =====================
function irA(tabId) {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.className = btn.dataset.tab === tabId ? NAV_ON : NAV_OFF;
  });
  document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
  const pane = $(`tab-${tabId}`);
  if (pane) pane.classList.remove("hidden");

  const b = boteActivo();
  $("viewTitle").textContent = tabId === "map" ? TITULOS.map : `${TITULOS[tabId] || "Dashboard"} · ${b.nombre}`;
  $("statusBadge").hidden = tabId === "map";

  if (tabId === "map") {
    renderMapaBotes();
    if (mapa) setTimeout(() => mapa.invalidateSize(), 50);
  } else {
    renderAll();
  }
}

function abrirDashboard(id) {
  if (!state.botes[id]) return;
  state.activeId = id;
  irA("dashboard");
}

// ===================== MAPA, BOTES Y RUTAS =====================
let mapa = null;
let marcadores = {};
let marcadorBase = null;
let capaRuta = null;
let rutaClave = "";
let rutaSeq = 0;

function posicionBote(b) {
  const base = state.ubicacion || CONFIG.ubicacionBase;
  if (b.real) return { lat: base.lat, lng: base.lng };
  return { lat: base.lat + b.dLat, lng: base.lng + b.dLng };
}

function posicionBase() {
  const base = state.ubicacion || CONFIG.ubicacionBase;
  return { lat: base.lat + CONFIG.base.dLat, lng: base.lng + CONFIG.base.dLng };
}

function colorPorNivel(pct) {
  if (pct >= CONFIG.umbrales.lleno) return "#ef4444";
  if (pct >= CONFIG.umbrales.casiLleno) return "#f97316";
  if (pct >= CONFIG.umbrales.medio) return "#f59e0b";
  return "#4ade80";
}

// Resumen de un bote: el número del marcador es el compartimento más lleno
function resumenBote(b) {
  const h = ultimoDe(b);
  const p = h ? h.p : [0, 0, 0];
  const max = Math.max(...p);
  return { p, max, estado: getStatusBadge(max), color: colorPorNivel(max) };
}

function resolverUbicacion() {
  if (state.ubicacion) { state.ubicFuente = "guardada"; return; }
  state.ubicFuente = "predeterminada";
  if (!("geolocation" in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (state.ubicacion) return;
      state.ubicacion = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.ubicFuente = "navegador";
      rutaClave = "";
      renderMapaBotes();
      ajustarVistaMapa();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function guardarUbicacion(lat, lng) {
  state.ubicacion = { lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) };
  state.ubicFuente = "guardada";
  try { localStorage.setItem("bote_ubicacion", JSON.stringify(state.ubicacion)); } catch (_) {}
  rutaClave = "";
  renderMapaBotes();
  ajustarVistaMapa();
}

function initMapa() {
  const cont = $("map");
  if (!cont || mapa || typeof L === "undefined") return;
  const centro = state.ubicacion || CONFIG.ubicacionBase;
  mapa = L.map("map").setView([centro.lat, centro.lng], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapa);

  mapa.invalidateSize();
  renderMapaBotes();
  ajustarVistaMapa();
  setTimeout(() => mapa.invalidateSize(), 250);
}

function ajustarVistaMapa() {
  if (!mapa) return;
  const pts = botesLista().map(posicionBote).concat([posicionBase()]);
  mapa.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])), { padding: [50, 50], maxZoom: 17 });
}

function popupBote(b) {
  const r = resumenBote(b);
  const origen = b.real ? (state.demoMode ? "Photon (modo demo)" : "Photon · datos reales") : "Bote simulado";
  const barras = CONFIG.compartimentos.map((c, i) => `
    <div style="margin:5px 0">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#334155"><span>${c.nombre}</span><b>${r.p[i]}%</b></div>
      <div style="height:6px;border-radius:4px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:${r.p[i]}%;background:${c.colorHex}"></div></div>
    </div>`).join("");
  return `
    <div style="font-family:Inter,sans-serif;color:#0b1220;min-width:210px">
      <b style="font-size:13px">${b.nombre}</b><br/>
      <span style="font-size:11px;color:#64748b">${origen}</span>
      ${barras}
      <button onclick="abrirDashboard(${b.id})" style="margin-top:8px;width:100%;padding:7px;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;font-size:12px;border:0;cursor:pointer">Ver dashboard</button>
    </div>`;
}

function renderListaBotes() {
  const cont = $("listaBotes");
  if (!cont) return;
  cont.innerHTML = botesLista().map(b => {
    const r = resumenBote(b);
    const barras = CONFIG.compartimentos.map((c, i) => `
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-16 text-slate-400">${c.nombre}</span>
        <div class="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full" style="width:${r.p[i]}%;background:${c.colorHex}"></div></div>
        <b class="w-9 text-right text-white">${r.p[i]}%</b>
      </div>`).join("");
    return `
      <button type="button" onclick="abrirDashboard(${b.id})" class="w-full text-left bg-boxDark border border-borderDark hover:border-blue-500 rounded-xl p-3 space-y-2 transition">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-white">${b.nombre}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.estado.cls}">${r.estado.txt}</span>
        </div>
        ${barras}
        <div class="text-[10px] text-slate-500">Ver dashboard →</div>
      </button>`;
  }).join("");
}

function renderMapaBotes() {
  renderListaBotes();

  const info = $("ubicInfo");
  if (info) {
    const u = state.ubicacion || CONFIG.ubicacionBase;
    info.textContent = `Bote 1: ${u.lat.toFixed(5)}, ${u.lng.toFixed(5)} (${state.ubicFuente}). Los botes 2 a 5 son simulados y se ubican a su alrededor.`;
  }
  if (!mapa) return;

  botesLista().forEach(b => {
    const pos = posicionBote(b);
    const r = resumenBote(b);
    const icon = L.divIcon({
      className: "",
      html: `<div class="bote-pin" style="--c:${r.color}">${r.max}%</div>`,
      iconSize: [46, 46],
      iconAnchor: [23, 23],
      popupAnchor: [0, -26]
    });

    let m = marcadores[b.id];
    if (!m) {
      m = L.marker([pos.lat, pos.lng], { icon, draggable: false }).addTo(mapa);
      m.bindPopup(() => popupBote(b), { minWidth: 220 });
      if (b.real) {
        m.on("dragend", () => {
          const ll = m.getLatLng();
          state.moviendo = false;
          m.dragging.disable();
          const btn = $("btnMoverBote");
          if (btn) btn.textContent = "Ajustar posición del Bote 1";
          guardarUbicacion(ll.lat, ll.lng);
        });
      }
      marcadores[b.id] = m;
    } else if (!(b.real && state.moviendo)) {
      m.setLatLng([pos.lat, pos.lng]);
      m.setIcon(icon);
      if (m.isPopupOpen()) m.getPopup().update();
    }
  });

  const pb = posicionBase();
  if (!marcadorBase) {
    marcadorBase = L.marker([pb.lat, pb.lng], {
      icon: L.divIcon({ className: "", html: '<div class="base-pin">Base</div>', iconSize: [48, 24], iconAnchor: [24, 12] }),
      interactive: false
    }).addTo(mapa);
  } else {
    marcadorBase.setLatLng([pb.lat, pb.lng]);
  }

  actualizarRuta();
}

function distM(a, b) {
  const R = 6371000, rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Vecino más cercano partiendo de la base
function ordenarRuta(botes) {
  let actual = posicionBase();
  const pend = [...botes];
  const orden = [];
  while (pend.length) {
    let mejor = 0, dMin = Infinity;
    pend.forEach((b, i) => {
      const d = distM(actual, posicionBote(b));
      if (d < dMin) { dMin = d; mejor = i; }
    });
    const [b] = pend.splice(mejor, 1);
    orden.push(b);
    actual = posicionBote(b);
  }
  return orden;
}

async function actualizarRuta() {
  if (!mapa) return;
  const info = $("rutaInfo");
  const necesitan = botesLista().filter(b => resumenBote(b).max >= CONFIG.umbrales.casiLleno);
  const orden = ordenarRuta(necesitan);
  const u = state.ubicacion || CONFIG.ubicacionBase;
  const clave = `${state.rutaVisible}|${orden.map(b => b.id).join(",")}|${u.lat.toFixed(5)},${u.lng.toFixed(5)}`;
  if (clave === rutaClave) return; // nada cambió: no se vuelve a pedir la ruta
  rutaClave = clave;

  if (capaRuta) { mapa.removeLayer(capaRuta); capaRuta = null; }
  if (!state.rutaVisible) { if (info) info.textContent = "Ruta oculta."; return; }
  if (!orden.length) { if (info) info.textContent = "Ningún bote necesita recolección por ahora (se recolectan los de ≥ 70 %)."; return; }

  const pts = [posicionBase(), ...orden.map(posicionBote), posicionBase()];
  const mi = ++rutaSeq;
  let coords = pts.map(p => [p.lat, p.lng]);
  let extra = "";
  let porCalles = false;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pts.map(p => `${p.lng},${p.lat}`).join(";")}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.code === "Ok" && j.routes && j.routes[0]) {
      coords = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      extra = ` · ${(j.routes[0].distance / 1000).toFixed(1)} km · ${Math.round(j.routes[0].duration / 60)} min`;
      porCalles = true;
    }
  } catch (_) {}

  if (mi !== rutaSeq) return; // llegó una petición más reciente
  capaRuta = L.polyline(coords, { color: "#3b82f6", weight: 5, opacity: 0.85, dashArray: porCalles ? null : "8 8" }).addTo(mapa);
  if (info) {
    info.textContent = `Ruta: Base → ${orden.map(b => b.nombre.split(" · ")[0]).join(" → ")} → Base${extra}${porCalles ? "" : " (línea recta: sin servicio de rutas)"}`;
  }
}

// ===================== EVENTOS =====================
function setupEventListeners() {
  const btnGuardarUmbralesVac = $("btnGuardarUmbralesVac");
  if (btnGuardarUmbralesVac) {
    btnGuardarUmbralesVac.onclick = async () => {
      const pre = $("inputPreVac").value;
      const post = $("inputPostVac").value;
      const msg = $("msgUmbralesVac");

      if (!pre || !post) {
        msg.textContent = "Ingresa ambos valores antes de guardar.";
        return;
      }

      msg.textContent = "Enviando configuración a la Photon...";
      try {
        const res = await llamarParticleFunc("configVaciado", `${pre},${post}`);
        if (res.return_value === 1 || state.demoMode) {
          msg.textContent = `¡Umbrales actualizados! Se avisará cuando baje de ≥${pre}% a ≤${post}%.`;
          msg.className = "text-[11px] text-emerald-400 text-center";
          localStorage.setItem("umbralPreVac", pre);
          localStorage.setItem("umbralPostVac", post);
        } else {
          throw new Error("La Photon no pudo procesar la solicitud.");
        }
      } catch (err) {
        msg.textContent = "Error al guardar: " + err.message;
        msg.className = "text-[11px] text-red-400 text-center";
      }
    };
  }

  const savedPre = localStorage.getItem("umbralPreVac") || "60";
  const savedPost = localStorage.getItem("umbralPostVac") || "10";
  if ($("inputPreVac")) $("inputPreVac").value = savedPre;
  if ($("inputPostVac")) $("inputPostVac").value = savedPost;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.onclick = () => irA(btn.dataset.tab);
  });

  if ($("btnVolverMapa")) $("btnVolverMapa").onclick = () => irA("map");

  const btnRuta = $("btnRuta");
  if (btnRuta) {
    btnRuta.onclick = () => {
      state.rutaVisible = !state.rutaVisible;
      btnRuta.textContent = state.rutaVisible ? "Ocultar ruta" : "Mostrar ruta";
      rutaClave = "";
      actualizarRuta();
    };
  }

  const btnMover = $("btnMoverBote");
  if (btnMover) {
    btnMover.onclick = () => {
      const m = marcadores[1];
      if (!m) return;
      state.moviendo = !state.moviendo;
      if (state.moviendo) {
        m.dragging.enable();
        btnMover.textContent = "Arrastra el Bote 1 al lugar correcto…";
      } else {
        m.dragging.disable();
        btnMover.textContent = "Ajustar posición del Bote 1";
        renderMapaBotes();
      }
    };
  }

  const btnMiUbic = $("btnMiUbicacion");
  if (btnMiUbic) {
    btnMiUbic.onclick = () => {
      if (!("geolocation" in navigator)) { alert("Este navegador no soporta geolocalización."); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => guardarUbicacion(pos.coords.latitude, pos.coords.longitude),
        (err) => alert("No se pudo obtener tu ubicación: " + err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };
  }

  const btnToggleDemo = $("btnToggleDemo");
  if (btnToggleDemo) {
    btnToggleDemo.onclick = () => {
      state.demoMode = !state.demoMode;
      if (state.demoMode) $("aviso").hidden = true;
      updateModeStatus();
      fetchTelemetry();
    };
  }

  document.querySelectorAll("#rangeSelector button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#rangeSelector button").forEach(b => {
        b.className = "px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-400 hover:text-white transition";
      });
      btn.className = "px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white shadow-sm transition";
      state.selectedRangeHours = parseInt(btn.dataset.range);
      renderAreaChart();
    };
  });

  const btnAct = $("btnAct");
  if (btnAct) {
    btnAct.onclick = async () => {
      btnAct.disabled = true;
      btnAct.classList.add("opacity-50", "cursor-wait");
      try {
        if (boteActivo().real && !state.demoMode) {
          await llamarParticleFunc("medir", "1");
        }
        await fetchTelemetry();
      } catch (e) {
        console.error(e);
      } finally {
        btnAct.disabled = false;
        btnAct.classList.remove("opacity-50", "cursor-wait");
      }
    };
  }

  const selMin = $("selMin");
  if (selMin) {
    selMin.onchange = async (e) => {
      const mins = e.target.value;
      if (!state.demoMode) {
        try { await llamarParticleFunc("intervalo", mins); } catch (err) { console.error(err); }
      }
      clearInterval(state.timer);
      state.timer = setInterval(fetchTelemetry, parseInt(mins) * 60 * 1000);
    };
  }

  if ($("btnLoginModal")) $("btnLoginModal").onclick = () => $("loginModal").classList.remove("hidden");
  if ($("btnCloseLogin")) $("btnCloseLogin").onclick = () => $("loginModal").classList.add("hidden");
  if ($("btnEntrar")) $("btnEntrar").onclick = loginParticle;

  if ($("btnCerrarSesionModal")) {
    $("btnCerrarSesionModal").onclick = () => {
      state.token = "";
      sessionStorage.removeItem("pt");
      sessionStorage.removeItem("pd");
      state.demoMode = true;
      $("aviso").hidden = true;
      updateModeStatus();
      $("loginModal").classList.add("hidden");
      fetchTelemetry();
    };
  }

  if ($("btnExportCsv")) $("btnExportCsv").onclick = exportToCsv;
  if ($("searchHistory")) $("searchHistory").oninput = renderHistoryTable;
  if ($("filterComp")) $("filterComp").onchange = renderHistoryTable;

  const frmCalib = $("frmCalib");
  if (frmCalib) {
    frmCalib.onsubmit = async (e) => {
      e.preventDefault();
      const msg = $("msgCalib");
      const aviso = (txt, cls) => { msg.textContent = txt; msg.className = `text-[11px] text-center min-h-[1.2em] ${cls}`; };

      const vacio = CONFIG.compartimentos.map(c => parseFloat($(`vacio${c.id}`).value));
      const lleno = CONFIG.compartimentos.map(c => parseFloat($(`lleno${c.id}`).value));
      const mal = vacio.findIndex((v, i) => !(lleno[i] >= 2 && v <= 400 && v - lleno[i] >= 3));
      if (mal !== -1) {
        aviso(`Revisa ${CONFIG.compartimentos[mal].nombre}: "lleno" ≥ 2 cm, "vacío" ≤ 400 cm y al menos 3 cm de diferencia.`, "text-red-400");
        return;
      }

      try {
        if (!state.demoMode) {
          aviso("Enviando calibración a la Photon...", "text-slate-400");
          for (let i = 0; i < 3; i++) {
            const res = await llamarParticleFunc("calibrar", `${i + 1},${vacio[i]},${lleno[i]}`);
            if (res.return_value !== 1) throw new Error(`la Photon rechazó el sensor ${i + 1} (¿ya cargaste el firmware nuevo?)`);
          }
          await llamarParticleFunc("medir", "1");
        }
        state.calib = { vacio, lleno };
        localStorage.setItem("bote_calib", JSON.stringify(state.calib));
        renderSaludSensores();
        aviso(state.demoMode ? "Calibración guardada (modo demo: solo local)." : "Calibración guardada en la Photon. La siguiente lectura ya la usa.", "text-emerald-400");
        if (!state.demoMode) await fetchTelemetry();
      } catch (err) {
        aviso("Error: " + err.message, "text-red-400");
      }
    };
  }

  const btnTogglePush = $("btnTogglePush");
  if (btnTogglePush) {
    btnTogglePush.onclick = () => {
      if (!("Notification" in window)) {
        alert("Este navegador no soporta notificaciones push.");
        return;
      }
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          state.pushEnabled = !state.pushEnabled;
          btnTogglePush.textContent = state.pushEnabled ? "Activado" : "Desactivado";
          btnTogglePush.className = state.pushEnabled
            ? "px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white transition"
            : "px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 text-slate-300 transition";
        }
      });
    };
  }

  const btnToggleAudio = $("btnToggleAudio");
  if (btnToggleAudio) {
    btnToggleAudio.onclick = () => {
      state.audioEnabled = !state.audioEnabled;
      btnToggleAudio.textContent = state.audioEnabled ? "Activado" : "Desactivado";
      btnToggleAudio.className = state.audioEnabled
        ? "px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white transition"
        : "px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 text-slate-300 transition";
    };
  }

  if ($("btnTestSound")) $("btnTestSound").onclick = () => playTone(880, 0.4);
}

// ===================== LOGIN DE PARTICLE =====================
async function loginParticle() {
  const email = $("email").value.trim();
  const pass = $("pass").value;
  const devId = $("devId").value.trim() || CONFIG.deviceIdDefault;
  const otp = $("otp").value.trim();
  const msg = $("msg");

  msg.textContent = "Conectando con Particle Cloud...";

  try {
    const bodyParams = state.mfaToken
      ? { grant_type: "urn:custom:mfa-otp", mfa_token: state.mfaToken, otp: otp }
      : { grant_type: "password", username: email, password: pass };

    const r = await fetch("https://api.particle.io/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + btoa("particle:particle")
      },
      body: new URLSearchParams({ expires_in: "28800", ...bodyParams })
    });

    const j = await r.json();

    if (j.error === "mfa_required") {
      state.mfaToken = j.mfa_token;
      $("otpBox").classList.remove("hidden");
      msg.textContent = "Escribe tu código de verificación OTP y vuelve a presionar Entrar.";
      return;
    }

    if (!j.access_token) throw new Error(j.error_description || j.error || "No se pudo iniciar sesión");

    state.token = j.access_token;
    state.deviceId = devId;
    state.baseApi = `https://api.particle.io/v1/devices/${state.deviceId}`;
    state.demoMode = false;
    state.mfaToken = null;

    sessionStorage.setItem("pt", state.token);
    sessionStorage.setItem("pd", state.deviceId);

    $("loginModal").classList.add("hidden");
    updateModeStatus();
    fetchHardwareInterval();
    leerCalibDePhoton();
    fetchTelemetry();
  } catch (e) {
    msg.textContent = "Error: " + e.message;
  }
}

// ================= TEMA CLARO / OSCURO =================
function initThemeToggle() {
  const root = document.documentElement;
  const btn = $("themeToggle");
  if (!btn) return;

  const syncSwitch = () => {
    const claro = root.classList.contains("light-theme");
    btn.setAttribute("aria-checked", String(claro));
    btn.setAttribute("aria-label", claro ? "Cambiar a tema oscuro" : "Cambiar a tema claro");
  };
  syncSwitch();

  let transitionTimer;
  btn.addEventListener("click", () => {
    root.classList.add("theme-transition");
    const claro = root.classList.toggle("light-theme");
    try {
      localStorage.setItem("bote_tema", claro ? "light" : "dark");
    } catch (e) {}
    syncSwitch();

    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => root.classList.remove("theme-transition"), 450);
  });
}