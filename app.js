const CONFIG = {
  titulo: "Bote Inteligente",
  deviceIdDefault: "3f0036000947313037363132",
  caidaVaciado: 25,
  puntosRitmo: 8,
  umbrales: { medio: 50, casiLleno: 70, lleno: 80 },
  compartimentos: [
    { id: 1, nombre: "Orgánico", icono: "leaf", colorHex: "#4ade80", colorVar: "--organico", depth: 27 },
    { id: 2, nombre: "Reciclable", icono: "recycle", colorHex: "#38bdf8", colorVar: "--reciclable", depth: 27 },
    { id: 3, nombre: "Inorgánico", icono: "trash", colorHex: "#f59e0b", colorVar: "--inorganico", depth: 27 }
  ]
};

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
  historial: [],
  vaciados: [],
  maxHoy: [0, 0, 0],
  depths: JSON.parse(localStorage.getItem("bote_depths")) || [27, 27, 27]
};

const SVG_ICONS = {
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  recycle: '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 1 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'
};

function getIco(key) {
  return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG_ICONS[key] || ''}</svg>`;
}

// Persistencia LocalStorage por dispositivo
function getLSKey(k) { return `bote:${state.deviceId}:${k}`; }
function loadLocalStorage() {
  try {
    state.historial = JSON.parse(localStorage.getItem(getLSKey("hist"))) || [];
    state.vaciados = JSON.parse(localStorage.getItem(getLSKey("vac"))) || [];
  } catch (_) { state.historial = []; state.vaciados = []; }
}
function saveLocalStorage() {
  try {
    localStorage.setItem(getLSKey("hist"), JSON.stringify(state.historial.slice(-500)));
    localStorage.setItem(getLSKey("vac"), JSON.stringify(state.vaciados.slice(-50)));
  } catch (_) {}
}

window.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
  initUi();
  loadLocalStorage();

  if (state.historial.length === 0) {
    initDemoData();
  }

  updateModeStatus();
  renderAll();
  setupEventListeners();

  if (!state.demoMode) {
    fetchHardwareInterval();
  }

  state.timer = setInterval(fetchTelemetry, 15000);
});

function initUi() {
  document.getElementById("depth1").value = state.depths[0];
  document.getElementById("depth2").value = state.depths[1];
  document.getElementById("depth3").value = state.depths[2];

  const gridCards = document.getElementById("gridCards");
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

        <div class="grid grid-cols-3 gap-2 pt-3 border-t border-borderDark/60 text-center">
          <div class="bg-boxDark p-2 rounded-xl border border-borderDark/40">
            <div class="text-[10px] text-slate-400 font-medium">Distancia</div>
            <div id="cm-${c.id}" class="text-xs font-bold text-white mt-0.5">-- cm</div>
          </div>
          <div class="bg-boxDark p-2 rounded-xl border border-borderDark/40">
            <div class="text-[10px] text-slate-400 font-medium">Se llena en</div>
            <div id="est-${c.id}" class="text-xs font-bold text-emerald-400 mt-0.5">--</div>
          </div>
          <div class="bg-boxDark p-2 rounded-xl border border-borderDark/40">
            <div class="text-[10px] text-slate-400 font-medium">Últ. Vaciado</div>
            <div id="vac-${c.id}" class="text-xs font-bold text-slate-200 mt-0.5">--</div>
          </div>
        </div>
      </div>
    `);
  });

  const devSensorCards = document.getElementById("devSensorCards");
  devSensorCards.innerHTML = CONFIG.compartimentos.map(c => `
    <div class="bg-boxDark p-4 rounded-xl border border-borderDark space-y-2">
      <div class="flex items-center justify-between text-xs font-bold text-white">
        <span>Sensor ${c.nombre} (HC-SR04)</span>
        <span class="text-emerald-400">OK</span>
      </div>
      <p class="text-[11px] text-slate-400">Eco ultrasónico: <span class="text-slate-200 font-medium">Estable</span></p>
      <p class="text-[11px] text-slate-400">Profundidad Máx: <span class="text-slate-200 font-medium" id="lblDepthDev-${c.id}">${state.depths[c.id-1]} cm</span></p>
    </div>
  `).join('');
}

function initDemoData() {
  const now = Date.now();
  const points = 25;
  state.historial = [];

  let levelOrg = 20, levelRec = 35, levelInorg = 15;

  for (let i = points; i >= 0; i--) {
    const t = now - i * (30 * 60 * 1000);

    levelOrg = Math.min(95, Math.max(5, levelOrg + (Math.random() * 8 - 2)));
    levelRec = Math.min(95, Math.max(5, levelRec + (Math.random() * 6 - 1.5)));
    levelInorg = Math.min(95, Math.max(5, levelInorg + (Math.random() * 5 - 1)));

    if (levelOrg > 85) {
      state.vaciados.push({ t, compId: 1, pre: Math.round(levelOrg), post: 10 });
      levelOrg = 10;
    }

    const p = [Math.round(levelOrg), Math.round(levelRec), Math.round(levelInorg)];
    const c = p.map((val, idx) => parseFloat((state.depths[idx] * (1 - val / 100)).toFixed(1)));

    state.historial.push({ t, p, c });
  }
  saveLocalStorage();
}

// PREDICCIÓN CON REGRESIÓN LINEAL
function duracionTxt(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `~${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `~${h} h`;
  const d = Math.round(h / 24);
  return d > 30 ? "> 30 d" : `~${d} d`;
}

function estimarTiempoLlenado(compIndex, pctActual) {
  if (pctActual >= CONFIG.umbrales.lleno) return "¡Lleno!";
  const lastVacTime = state.vaciados.filter(v => v.compId === compIndex + 1).slice(-1)[0]?.t || 0;
  const pts = state.historial.filter(h => h.t > lastVacTime && h.p[compIndex] != null).slice(-CONFIG.puntosRitmo);

  if (pts.length < 2 || pts[pts.length - 1].t - pts[0].t < 60000) return "Estimando...";

  const n = pts.length;
  const mx = pts.reduce((s, h) => s + h.t, 0) / n;
  const my = pts.reduce((s, h) => s + h.p[compIndex], 0) / n;

  let num = 0, den = 0;
  pts.forEach(h => {
    num += (h.t - mx) * (h.p[compIndex] - my);
    den += (h.t - mx) ** 2;
  });

  const pendiente = num / den; // Incremento en % por milisegundo
  if (!(pendiente > 0)) return "Estable";

  const msRestantes = (CONFIG.umbrales.lleno - pctActual) / pendiente;
  return duracionTxt(msRestantes);
}

function tiempoRelativoVaciado(compId) {
  const v = state.vaciados.filter(item => item.compId === compId).slice(-1)[0];
  if (!v) return "--";
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (v.t >= hoy.getTime()) return new Date(v.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.ceil((hoy.getTime() - v.t) / 864e5);
  return `Hace ${dias}d`;
}

// TELEMETRÍA API PARTICLE & DEMO
async function fetchTelemetry() {
  if (state.demoMode) {
    const last = state.historial[state.historial.length - 1] || { p: [20, 20, 20] };
    const t = Date.now();

    let newOrg = Math.min(100, Math.max(0, last.p[0] + Math.floor(Math.random() * 4 - 1)));
    let newRec = Math.min(100, Math.max(0, last.p[1] + Math.floor(Math.random() * 5 - 1)));
    let newInorg = Math.min(100, Math.max(0, last.p[2] + Math.floor(Math.random() * 3 - 1)));

    [newOrg, newRec, newInorg].forEach((val, idx) => {
      if (last.p[idx] - val >= CONFIG.caidaVaciado) {
        triggerVaciadoDetected(idx + 1, last.p[idx], val, t);
      }
    });

    const p = [newOrg, newRec, newInorg];
    const c = p.map((val, idx) => parseFloat((state.depths[idx] * (1 - val / 100)).toFixed(1)));

    state.historial.push({ t, p, c });
    if (state.historial.length > 500) state.historial.shift();
    saveLocalStorage();

    renderAll();
  } else {
    // VALIDACIÓN: Evita hacer peticiones con Token vacío
    if (!state.token || state.token.trim() === "") {
      document.getElementById("aviso").hidden = false;
      document.getElementById("avisoTxt").textContent = "Inicia sesión en Particle Cloud para ver las lecturas en vivo.";
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
      document.getElementById("aviso").hidden = true;
    } catch (err) {
      document.getElementById("aviso").hidden = false;
      document.getElementById("avisoTxt").textContent = "Error Particle API: " + err.message;
    }
  }
}

async function llamarParticleFunc(fn, arg) {
  if (state.demoMode) return { result: 1 };
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
    if (j.result !== undefined) {
      document.getElementById("selMin").value = j.result;
    }
  } catch (_) {}
}

function triggerVaciadoDetected(compId, preVal, postVal, timestamp) {
  state.vaciados.unshift({ t: timestamp, compId, pre: preVal, post: postVal });
  if (state.vaciados.length > 50) state.vaciados.pop();
  saveLocalStorage();

  renderVaciadosTable();
  if (state.audioEnabled) playTone(523.25, 0.15);
}

function processParticleData(d, coreInfo) {
  const t = d.t ? d.t * 1000 : Date.now();
  
  const c = [d.c1 || 0, d.c2 || 0, d.c3 || 0];
  let p = [];

  if (d.p1 !== undefined && d.p2 !== undefined && d.p3 !== undefined) {
    p = [d.p1, d.p2, d.p3];
  } else {
    p = c.map((dist, i) => {
      if (dist < 0) return 0;
      const pct = ((state.depths[i] - dist) / (state.depths[i] - 3.0)) * 100;
      return Math.max(0, Math.min(100, Math.round(pct)));
    });
  }

  const last = state.historial[state.historial.length - 1];
  if (last) {
    p.forEach((val, idx) => {
      if (last.p[idx] - val >= CONFIG.caidaVaciado) {
        triggerVaciadoDetected(idx + 1, last.p[idx], val, t);
      }
    });
  }

  state.historial.push({ t, p, c });
  if (state.historial.length > 500) state.historial.shift();
  saveLocalStorage();

  const isConnected = coreInfo && coreInfo.connected;
  const statusBadge = document.getElementById("statusBadge");
  const horaStr = new Date(t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  if (isConnected) {
    statusBadge.textContent = `Photon en línea · Última: ${horaStr}`;
    statusBadge.className = "text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  } else {
    statusBadge.textContent = `Photon sin conexión · Última: ${horaStr}`;
    statusBadge.className = "text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20";
  }

  p.forEach((pct, idx) => {
    if (pct >= CONFIG.umbrales.lleno && state.pushEnabled) {
      sendPushNotification(`Contenedor ${CONFIG.compartimentos[idx].nombre} Lleno`, `El contenedor alcanzó un ${pct}% de su capacidad.`);
    }
  });

  renderAll();
}

function getStatusBadge(pct) {
  if (pct >= CONFIG.umbrales.lleno) return { txt: "¡Lleno!", cls: "badge-lleno" };
  if (pct >= CONFIG.umbrales.casiLleno) return { txt: "Casi Lleno", cls: "badge-casi-lleno" };
  if (pct >= CONFIG.umbrales.medio) return { txt: "Medio", cls: "badge-medio" };
  return { txt: "Normal", cls: "badge-normal" };
}

function renderAll() {
  const current = state.historial[state.historial.length - 1];
  if (!current) return;

  CONFIG.compartimentos.forEach((c, i) => {
    const pct = current.p[i];
    const cm = current.c[i];
    const status = getStatusBadge(pct);

    const ring = document.getElementById(`ring-${c.id}`);
    const strokeDash = (pct / 100) * 490;
    ring.style.strokeDasharray = `${strokeDash} 490`;

    document.getElementById(`pct-${c.id}`).textContent = `${pct}%`;
    document.getElementById(`cm-${c.id}`).textContent = `${cm} cm`;
    document.getElementById(`est-${c.id}`).textContent = estimarTiempoLlenado(i, pct);
    document.getElementById(`vac-${c.id}`).textContent = tiempoRelativoVaciado(c.id);

    const badge = document.getElementById(`badge-${c.id}`);
    badge.textContent = status.txt;
    badge.className = `px-2.5 py-1 rounded-full text-[11px] font-bold ${status.cls}`;
  });

  renderAreaChart();
  renderDonutChart(current.p);
  renderVaciadosTable();
  renderHistoryTable();
}

function renderAreaChart() {
  const svg = document.getElementById("chartSvg");
  const wrapper = document.getElementById("graficaWrapper");
  if (!wrapper || !svg) return;
  const W = wrapper.clientWidth || 600;
  const H = wrapper.clientHeight || 240;

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  const now = Date.now();
  const cutoff = now - state.selectedRangeHours * 3600 * 1000;
  const pts = state.historial.filter(h => h.t >= cutoff);

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

    const hoverLine = document.getElementById("hoverLine");
    if (hoverLine) {
      const cx = getX(closest.t);
      hoverLine.setAttribute("x1", cx);
      hoverLine.setAttribute("x2", cx);
      hoverLine.classList.remove("hidden");
    }

    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) {
      const timeStr = new Date(closest.t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      
      tooltip.innerHTML = `
        <div class="font-bold text-white mb-1 border-b border-slate-700 pb-1">${timeStr}</div>
        <div class="flex items-center justify-between gap-4 text-emerald-400"><span>Orgánico:</span><b>${closest.p[0]}%</b></div>
        <div class="flex items-center justify-between gap-4 text-sky-400"><span>Reciclable:</span><b>${closest.p[1]}%</b></div>
        <div class="flex items-center justify-between gap-4 text-amber-400"><span>Inorgánico:</span><b>${closest.p[2]}%</b></div>
      `;

      tooltip.style.left = `${getX(closest.t)}px`;
      tooltip.style.top = `${getY(Math.max(...closest.p)) - 10}px`;
      tooltip.classList.remove("hidden");
    }
  };

  wrapper.onmouseleave = () => {
    const hoverLine = document.getElementById("hoverLine");
    if (hoverLine) hoverLine.classList.add("hidden");
    const tooltip = document.getElementById("chartTooltip");
    if (tooltip) tooltip.classList.add("hidden");
  };
}

function renderDonutChart(currentP) {
  const svg = document.getElementById("donutSvg");
  if (!svg) return;
  const sum = currentP.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / 3);

  document.getElementById("donutTotalVol").textContent = `${avg}%`;
  document.getElementById("pctDonutOrg").textContent = `${currentP[0]}%`;
  document.getElementById("pctDonutRec").textContent = `${currentP[1]}%`;
  document.getElementById("pctDonutInorg").textContent = `${currentP[2]}%`;

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
  const tbody = document.getElementById("tbVaciadosDash");
  if (!tbody) return;
  if (state.vaciados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No se han registrado eventos de vaciado recientemente.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.vaciados.slice(0, 5).map(v => {
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
  const tbody = document.getElementById("tbHistorialFull");
  if (!tbody) return;
  const searchInput = document.getElementById("searchHistory");
  const search = searchInput ? searchInput.value.toLowerCase() : "";

  let filtered = [...state.historial].reverse();

  if (search) {
    filtered = filtered.filter(h => new Date(h.t).toLocaleString("es-MX").toLowerCase().includes(search));
  }

  const lblTotal = document.getElementById("lblTotalRegs");
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
  let csv = "Timestamp,Fecha_Hora,Organico_Pct,Reciclable_Pct,Inorganico_Pct,Dist_Org_cm,Dist_Rec_cm,Dist_Inorg_cm\n";
  state.historial.forEach(h => {
    const dateStr = `"${new Date(h.t).toLocaleString("es-MX")}"`;
    csv += `${h.t},${dateStr},${h.p[0]},${h.p[1]},${h.p[2]},${h.c[0]},${h.c[1]},${h.c[2]}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bote_inteligente_telemetria_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function updateModeStatus() {
  const dot = document.getElementById("modeDot");
  const txt = document.getElementById("modeTxt");
  const btnModal = document.getElementById("lblLoginBtnText");
  const btnLogoutModal = document.getElementById("btnCerrarSesionModal");

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
}

function setupEventListeners() {
  const btnGuardarUmbralesVac = document.getElementById("btnGuardarUmbralesVac");
  if (btnGuardarUmbralesVac) {
    btnGuardarUmbralesVac.onclick = async () => {
      const pre = document.getElementById("inputPreVac").value;
      const post = document.getElementById("inputPostVac").value;
      const msg = document.getElementById("msgUmbralesVac");

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
  if (document.getElementById("inputPreVac")) document.getElementById("inputPreVac").value = savedPre;
  if (document.getElementById("inputPostVac")) document.getElementById("inputPostVac").value = savedPost;

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.onclick = () => {
      const tabId = btn.dataset.tab;
      
      document.querySelectorAll(".nav-item").forEach(b => {
        b.className = "nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-all";
      });

      // Conservar mt-auto para el botón de ubicación al fondo de la barra
      const extraClass = tabId === "location" ? " mt-auto" : "";
      btn.className = `nav-item w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all bg-blue-600/15 text-blue-400 border border-blue-500/30${extraClass}`;

      document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
      const targetPane = document.getElementById(`tab-${tabId}`);
      if (targetPane) targetPane.classList.remove("hidden");

      const titles = {
        dashboard: "Dashboard General",
        location: "Ubicación del Dispositivo",
        history: "Historial y Eventos",
        alerts: "Alertas y Reglas",
        device: "Salud del Dispositivo",
        calibration: "Calibración de Altura"
      };
      document.getElementById("viewTitle").textContent = titles[tabId] || "Dashboard";

      if (tabId === "location") {
        initLeafletMap();
      }
    };
  });

  const btnToggleDemo = document.getElementById("btnToggleDemo");
  if (btnToggleDemo) {
    btnToggleDemo.onclick = () => {
      state.demoMode = !state.demoMode;
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

  const btnAct = document.getElementById("btnAct");
  if (btnAct) {
    btnAct.onclick = async () => {
      btnAct.disabled = true;
      btnAct.classList.add("opacity-50", "cursor-wait");
      try {
        if (!state.demoMode) {
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

  const selMin = document.getElementById("selMin");
  if (selMin) {
    selMin.onchange = async (e) => {
      const mins = e.target.value;
      if (!state.demoMode) {
        try {
          await llamarParticleFunc("intervalo", mins);
        } catch (err) { console.error(err); }
      }
      clearInterval(state.timer);
      state.timer = setInterval(fetchTelemetry, parseInt(mins) * 60 * 1000);
    };
  }

  if (document.getElementById("btnLoginModal")) document.getElementById("btnLoginModal").onclick = () => document.getElementById("loginModal").classList.remove("hidden");
  if (document.getElementById("btnCloseLogin")) document.getElementById("btnCloseLogin").onclick = () => document.getElementById("loginModal").classList.add("hidden");
  if (document.getElementById("btnEntrar")) document.getElementById("btnEntrar").onclick = loginParticle;

  if (document.getElementById("btnCerrarSesionModal")) {
    document.getElementById("btnCerrarSesionModal").onclick = () => {
      state.token = "";
      sessionStorage.removeItem("pt");
      sessionStorage.removeItem("pd");
      state.demoMode = true;
      updateModeStatus();
      document.getElementById("loginModal").classList.add("hidden");
      fetchTelemetry();
    };
  }

  if (document.getElementById("btnExportCsv")) document.getElementById("btnExportCsv").onclick = exportToCsv;
  if (document.getElementById("searchHistory")) document.getElementById("searchHistory").oninput = renderHistoryTable;
  if (document.getElementById("filterComp")) document.getElementById("filterComp").onchange = renderHistoryTable;

  const frmCalib = document.getElementById("frmCalib");
  if (frmCalib) {
    frmCalib.onsubmit = (e) => {
      e.preventDefault();
      state.depths = [
        parseFloat(document.getElementById("depth1").value),
        parseFloat(document.getElementById("depth2").value),
        parseFloat(document.getElementById("depth3").value)
      ];
      localStorage.setItem("bote_depths", JSON.stringify(state.depths));
      
      CONFIG.compartimentos.forEach(c => {
        const lblDev = document.getElementById(`lblDepthDev-${c.id}`);
        if (lblDev) lblDev.textContent = `${state.depths[c.id-1]} cm`;
      });

      alert("¡Calibración guardada exitosamente!");
      renderAll();
    };
  }

  const btnTogglePush = document.getElementById("btnTogglePush");
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

  const btnToggleAudio = document.getElementById("btnToggleAudio");
  if (btnToggleAudio) {
    btnToggleAudio.onclick = () => {
      state.audioEnabled = !state.audioEnabled;
      btnToggleAudio.textContent = state.audioEnabled ? "Activado" : "Desactivado";
      btnToggleAudio.className = state.audioEnabled 
        ? "px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white transition"
        : "px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-700 text-slate-300 transition";
    };
  }

  if (document.getElementById("btnTestSound")) document.getElementById("btnTestSound").onclick = () => playTone(880, 0.4);
}

// LOGIN DE PARTICLE
async function loginParticle() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("pass").value;
  const devId = document.getElementById("devId").value.trim() || CONFIG.deviceIdDefault;
  const otp = document.getElementById("otp").value.trim();
  const msg = document.getElementById("msg");

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
      document.getElementById("otpBox").classList.remove("hidden");
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

    document.getElementById("loginModal").classList.add("hidden");
    updateModeStatus();
    fetchHardwareInterval();
    fetchTelemetry();
  } catch (e) {
    msg.textContent = "Error: " + e.message;
  }
}

// --- LÓGICA DEL MAPA OPENSTREETMAP CON UBICACIÓN REAL Y PRECISA ---
let mapInstance = null;
let markerInstance = null;

// Obtener ubicación real de alta precisión
function obtenerUbicacionPrecisa(callback) {
  const token = localStorage.getItem('particle_token') || sessionStorage.getItem('pt');
  const devId = localStorage.getItem('particle_dev_id') || sessionStorage.getItem('pd') || CONFIG.deviceIdDefault;

  if (token && devId && !state.demoMode) {
    fetch(`https://api.particle.io/v1/devices/${devId}/ubicacion?access_token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.result) {
          const coords = data.result.split(',').map(n => parseFloat(n.trim()));
          if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            callback(coords[0], coords[1], "Sensor GPS Particle Photon");
            return;
          }
        }
        fallbackGeolocalizacionAltaPrecision(callback);
      })
      .catch(() => fallbackGeolocalizacionAltaPrecision(callback));
  } else {
    fallbackGeolocalizacionAltaPrecision(callback);
  }
}

// Geolocalización del navegador con MÁXIMA precisión (GPS/red preciso)
function fallbackGeolocalizacionAltaPrecision(callback) {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        callback(lat, lng, "Geolocalización GPS / Red de Alta Precisión");
      },
      (error) => {
        console.warn("No se obtuvo geolocalización precisa, usando coordenadas por defecto.", error);
        callback(19.4326, -99.1332, "Ubicación Predeterminada");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    callback(19.4326, -99.1332, "Ubicación Predeterminada");
  }
}

function initLeafletMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  obtenerUbicacionPrecisa((lat, lng, origen) => {
    if (!mapInstance) {
      // Zoom 16 para mostrar la ubicación exacta en alta resolución
      mapInstance = L.map('map').setView([lat, lng], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(mapInstance);

      // Marcador FIJO e INAMOVIBLE (draggable: false)
      markerInstance = L.marker([lat, lng], { draggable: false }).addTo(mapInstance);

      markerInstance.bindPopup(`
        <div style="font-family: Inter, sans-serif; color: #0b1220;">
          <b style="font-size: 13px;">Bote Inteligente Particle Photon</b><br/>
          <span style="font-size: 11px; color: #16a34a; font-weight: bold;">● Dispositivo En Línea</span><br/>
          <span style="font-size: 11px; color: #64748b;">${origen}</span><br/>
          <span style="font-size: 11px; color: #334155;">Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</span>
        </div>
      `).openPopup();

    } else {
      mapInstance.setView([lat, lng], 16);
      if (markerInstance) {
        markerInstance.setLatLng([lat, lng]);
        markerInstance.getPopup().setContent(`
          <div style="font-family: Inter, sans-serif; color: #0b1220;">
            <b style="font-size: 13px;">Bote Inteligente Particle Photon</b><br/>
            <span style="font-size: 11px; color: #16a34a; font-weight: bold;">● Dispositivo En Línea</span><br/>
            <span style="font-size: 11px; color: #64748b;">${origen}</span><br/>
            <span style="font-size: 11px; color: #334155;">Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</span>
          </div>
        `);
      }
    }

    // Forzar renderizado y centrado inmediato
    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 250);
  });
}

// ================= TEMA CLARO / OSCURO =================
function initThemeToggle() {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
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
