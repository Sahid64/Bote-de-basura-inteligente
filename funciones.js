const CONFIG = {
  titulo: "Bote inteligente",
  deviceId: "3f0036000947313037363132",             // aparece prellenado en el login
  sesionSeg: 28800,                     // duración del token (8 horas)
  refrescoMs: 30000,                    // cada cuánto consulta la página (no mide, solo lee)
  intervalos: [1, 5, 10, 15, 30, 60],   // opciones de minutos para la Photon
  umbrales: { medio: 50, alto: 80 },    // % donde cambia la etiqueta (Normal / Medio / Lleno)
  ventanaHoras: 12,                     // historial que muestra la gráfica
  caidaVaciado: 25,                     // si el % baja esto o más de golpe, cuenta como vaciado
  puntosRitmo: 8,                       // lecturas usadas para estimar "Se llena en"
  compartimentos: [
    { id: 1, nombre: "Orgánico",   icono: "leaf",    color: "--organico" },
    { id: 2, nombre: "Reciclable", icono: "recycle", color: "--reciclable" },
    { id: 3, nombre: "Inorgánico", icono: "trash-2", color: "--inorganico" }
  ]
};

// Íconos de Lucide (https://lucide.dev) en línea
const ICONOS = {
  "leaf": '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  "recycle": '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>',
  "trash-2": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  "refresh-cw": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  "chart-line": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
  "ruler": '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "calendar": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'
};
function ico(nombre, tam = 18) {
  return `<svg class="ico" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;
}

const $ = id => document.getElementById(id);
let token = "", base = "", mfaToken = null, timer = null;

function guardar(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }
function obtener(k) { try { return sessionStorage.getItem(k) || ""; } catch (_) { return ""; } }
function borrar(k) { try { sessionStorage.removeItem(k); } catch (_) {} }

$("tituloLogin").textContent = CONFIG.titulo;
$("titulo").textContent = CONFIG.titulo;
$("devId").value = obtener("pd") || CONFIG.deviceId;

// Íconos de los elementos fijos
document.querySelectorAll("[data-ico]").forEach(el =>
  el.insertAdjacentHTML("afterbegin", ico(el.dataset.ico, +el.dataset.size || 18)));

// Tarjetas
const CIRC = 2 * Math.PI * 87;   // anillo de 190px con trazo de 16px → radio 87
CONFIG.compartimentos.forEach(c => {
  $("grid").insertAdjacentHTML("beforeend", `
    <article class="card" style="--c:var(${c.color})">
      <div class="card-head">
        <div class="tit"><span class="ico-box">${ico(c.icono, 18)}</span>${c.nombre}</div>
        <span class="badge" id="b-${c.id}" hidden></span>
      </div>
      <div class="ring">
        <svg viewBox="0 0 190 190" aria-hidden="true">
          <circle class="pista" cx="95" cy="95" r="87"/>
          <circle class="valor" id="r-${c.id}" cx="95" cy="95" r="87" style="opacity:0"/>
        </svg>
        <div class="ring-txt">
          <div class="pct" id="p-${c.id}">—</div>
          <div class="sub" id="s-${c.id}">de capacidad</div>
        </div>
      </div>
      <div class="minis">
        <div class="mini"><div class="mini-lbl">${ico("ruler", 14)}Distancia</div><div class="mini-val" id="c-${c.id}">—</div></div>
        <div class="mini"><div class="mini-lbl">${ico("clock", 14)}Se llena en</div><div class="mini-val" id="l-${c.id}">—</div></div>
        <div class="mini"><div class="mini-lbl">${ico("calendar", 14)}Vaciado</div><div class="mini-val" id="v-${c.id}">—</div></div>
      </div>
    </article>`);
  $("leyenda").insertAdjacentHTML("beforeend",
    `<span style="--c:var(${c.color})"><i></i>${c.nombre}</span>`);
});
CONFIG.intervalos.forEach(m =>
  $("selMin").insertAdjacentHTML("beforeend", `<option value="${m}">Cada ${m} min</option>`));

// ---------- Historial local (alimenta la gráfica, "Se llena en" y "Vaciado") ----------
const VENTANA = CONFIG.ventanaHoras * 3600e3;
let historial = [], vaciados = [], ultimo = null;

function clave(k) { return `bote:${base}:${k}`; }
function leerLS(k, def) { try { return JSON.parse(localStorage.getItem(clave(k))) ?? def; } catch (_) { return def; } }
function guardarLS(k, v) { try { localStorage.setItem(clave(k), JSON.stringify(v)); } catch (_) {} }

function cargarLocal() {
  historial = leerLS("hist", []);
  vaciados = leerLS("vac", []);
  ultimo = leerLS("ultimo", null);
}

const valido = p => typeof p === "number" && p >= 0;

function ultimoValor(i) {
  for (let k = historial.length - 1; k >= 0; k--) if (historial[k].p[i] != null) return historial[k].p[i];
  return null;
}

function registrar(t, d) {
  const prev = historial[historial.length - 1];
  if (prev && t <= prev.t) return;   // misma medición que ya teníamos
  const p = CONFIG.compartimentos.map(c => valido(d["p" + c.id]) ? d["p" + c.id] : null);
  p.forEach((v, i) => {
    const ant = ultimoValor(i);
    if (v != null && ant != null && ant - v >= CONFIG.caidaVaciado) vaciados[i] = t;
  });
  historial.push({ t, p });
  const limite = Date.now() - VENTANA;
  historial = historial.filter(h => h.t >= limite).slice(-2000);
  guardarLS("hist", historial);
  guardarLS("vac", vaciados);
}

// ---------- Formato ----------
function hhmm(t) { return new Date(t).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }); }

function duracion(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `~${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `~${h} h`;
  const d = Math.round(h / 24);
  return d > 30 ? "> 30 d" : `~${d} d`;
}

function cuando(t) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (t >= hoy.getTime()) return "Hoy " + hhmm(t);
  if (t >= hoy.getTime() - 864e5) return "Ayer";
  return `Hace ${Math.ceil((hoy.getTime() - t) / 864e5)} d`;
}

function estadoDe(p) {
  if (p >= CONFIG.umbrales.alto) return ["Lleno", "lleno"];
  if (p >= CONFIG.umbrales.medio) return ["Medio", "medio"];
  return ["Normal", "normal"];
}

// Ritmo de llenado: regresión lineal sobre las últimas lecturas desde el último vaciado
function seLlenaEn(i, p) {
  if (p >= CONFIG.umbrales.alto) return "¡Ya!";
  const pts = historial.filter(h => h.t > (vaciados[i] || 0) && h.p[i] != null).slice(-CONFIG.puntosRitmo);
  if (pts.length < 2 || pts[pts.length - 1].t - pts[0].t < 60000) return "—";
  const n = pts.length, mx = pts.reduce((s, h) => s + h.t, 0) / n, my = pts.reduce((s, h) => s + h.p[i], 0) / n;
  let num = 0, den = 0;
  pts.forEach(h => { num += (h.t - mx) * (h.p[i] - my); den += (h.t - mx) ** 2; });
  const pendiente = num / den;   // % por ms
  if (!(pendiente > 0)) return "—";
  return duracion((CONFIG.umbrales.alto - p) / pendiente);
}

// ---------- Pintar ----------
function pintarTarjetas(d) {
  CONFIG.compartimentos.forEach((c, i) => {
    const p = d["p" + c.id], cm = d["c" + c.id];
    const anillo = $("r-" + c.id), badge = $("b-" + c.id);
    const ok = valido(p);
    const v = ok ? Math.min(100, p) : 0;

    anillo.style.strokeDasharray = `${CIRC * v / 100} ${CIRC}`;
    anillo.style.opacity = v > 0 ? 1 : 0;
    $("p-" + c.id).textContent = ok ? Math.round(p) + "%" : "—";
    $("s-" + c.id).textContent = p === undefined ? "Sin sensor" : !ok ? "Sin eco del sensor" : "de capacidad";

    const [txt, cls] = p === undefined ? ["Sin sensor", "off"] : !ok ? ["Error", "error"] : estadoDe(p);
    badge.textContent = txt;
    badge.className = "badge " + cls;
    badge.hidden = false;

    $("c-" + c.id).textContent = ok && typeof cm === "number" ? cm.toFixed(1) + " cm" : "—";
    $("l-" + c.id).textContent = ok ? seLlenaEn(i, p) : "—";
    $("v-" + c.id).textContent = vaciados[i] ? cuando(vaciados[i]) : "—";
  });
}

function pintarGrafica() {
  const cont = $("grafica"), ahora = Date.now(), desde = ahora - VENTANA;
  const pts = historial.filter(h => h.t >= desde);
  if (pts.length < 2) {
    cont.innerHTML = `<div class="vacio">${ico("chart-line", 28)}<span>Aún no hay suficientes lecturas</span></div>`;
    return;
  }
  const W = Math.max(cont.parentElement.clientWidth, 640), H = 260;
  const m = { l: 48, r: 18, t: 12, b: 34 };
  const x = t => m.l + (t - desde) / VENTANA * (W - m.l - m.r);
  const y = v => m.t + (1 - v / 100) * (H - m.t - m.b);

  let s = "";
  [0, 25, 50, 75, 100].forEach(v => {
    s += `<line class="rej" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text x="${m.l - 10}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  });
  s += `<line class="alerta" x1="${m.l}" x2="${W - m.r}" y1="${y(CONFIG.umbrales.alto)}" y2="${y(CONFIG.umbrales.alto)}"/>`;

  const h0 = new Date(desde); h0.setMinutes(0, 0, 0);
  for (let t = h0.getTime() + 3600e3; t <= ahora; t += 3600e3) {
    if (new Date(t).getHours() % 2) continue;
    s += `<text x="${x(t)}" y="${H - 10}" text-anchor="middle">${hhmm(t)}</text>`;
  }

  CONFIG.compartimentos.forEach((c, i) => {
    let d = "", seguir = false, fin = null;
    pts.forEach(h => {
      const v = h.p[i];
      if (v == null) { seguir = false; return; }
      d += `${seguir ? "L" : "M"}${x(h.t).toFixed(1)},${y(Math.min(100, v)).toFixed(1)}`;
      seguir = true; fin = h;
    });
    if (!fin) return;
    s += `<path class="linea" d="${d}" style="stroke:var(${c.color})"/>`;
    s += `<circle cx="${x(fin.t)}" cy="${y(Math.min(100, fin.p[i]))}" r="4.5" style="fill:var(${c.color})"/>`;
  });

  cont.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Llenado en las últimas ${CONFIG.ventanaHoras} horas">${s}</svg>`;
}

function mostrarAviso(error) {
  $("avisoTxt").textContent = `(Error: ${error}). ` +
    (ultimo ? `Mostrando la última lectura válida de las ${hhmm(ultimo.t)}. ` : "") + "Reintentando…";
  $("aviso").hidden = false;
}

function pintar(d) {
  const t = d.t ? d.t * 1000 : Date.now();
  registrar(t, d);
  ultimo = { t, d };
  guardarLS("ultimo", ultimo);
  $("aviso").hidden = true;
  pintarTarjetas(d);
  pintarGrafica();
}

let tRedim;
window.addEventListener("resize", () => { clearTimeout(tRedim); tRedim = setTimeout(pintarGrafica, 150); });

// ---------- Login ----------
async function pedirToken(params) {
  const r = await fetch("https://api.particle.io/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa("particle:particle")
    },
    body: new URLSearchParams({ expires_in: String(CONFIG.sesionSeg), ...params })
  });
  return r.json();
}

async function entrar() {
  const msg = $("msg");
  msg.textContent = "Entrando...";
  try {
    const j = mfaToken
      ? await pedirToken({ grant_type: "urn:custom:mfa-otp", mfa_token: mfaToken, otp: $("otp").value.trim() })
      : await pedirToken({ grant_type: "password", username: $("email").value.trim(), password: $("pass").value });

    if (j.error === "mfa_required") {
      mfaToken = j.mfa_token;
      $("otpBox").hidden = false;
      msg.textContent = "Escribe tu código de verificación y vuelve a pulsar Entrar";
      return;
    }
    if (!j.access_token) throw new Error(j.error_description || j.error || "No se pudo iniciar sesión");

    token = j.access_token;
    guardar("pt", token);
    guardar("pd", $("devId").value.trim());
    $("pass").value = "";
    mfaToken = null;
    abrirApp();
  } catch (e) {
    msg.textContent = "Error: " + e.message;
  }
}

function salir(motivo) {
  clearInterval(timer);
  token = "";
  borrar("pt");
  $("app").hidden = true;
  $("login").hidden = false;
  $("msg").textContent = motivo || "";
}

function abrirApp() {
  base = `https://api.particle.io/v1/devices/${$("devId").value.trim()}`;
  $("login").hidden = true;
  $("app").hidden = false;
  // Muestra lo último guardado mientras llega la primera lectura
  cargarLocal();
  $("aviso").hidden = true;
  if (ultimo) pintarTarjetas(ultimo.d);
  pintarGrafica();
  leerIntervalo();
  leer();
  clearInterval(timer);
  timer = setInterval(leer, CONFIG.refrescoMs);
}

// ---------- API de Particle (token en el encabezado, no en la URL) ----------
function cab(extra) {
  return { "Authorization": "Bearer " + token, ...extra };
}

async function leer() {
  try {
    const r = await fetch(`${base}/datos`, { headers: cab() });
    const j = await r.json();
    if (j.error === "invalid_token") return salir("La sesión expiró, vuelve a entrar");
    if (j.error) throw new Error(j.error_description || j.error);
    const d = JSON.parse(j.result);

    pintar(d);

    const hora = d.t ? new Date(d.t * 1000).toLocaleTimeString() : "--";
    const online = j.coreInfo && j.coreInfo.connected ? "Photon en línea" : "Photon sin conexión";
    $("estado").textContent = `${online} · última medición: ${hora}`;
  } catch (e) {
    // Las tarjetas conservan la última lectura válida
    mostrarAviso(e.message);
  }
}

async function llamar(fn, arg) {
  const r = await fetch(`${base}/${fn}`, {
    method: "POST",
    headers: cab({ "Content-Type": "application/x-www-form-urlencoded" }),
    body: new URLSearchParams({ arg })
  });
  return r.json();
}

async function leerIntervalo() {
  try {
    const r = await fetch(`${base}/minutos`, { headers: cab() });
    const j = await r.json();
    if (j.result !== undefined) $("selMin").value = j.result;
  } catch (_) {}
}

// ---------- Botones ----------
$("btnEntrar").onclick = entrar;
$("pass").onkeydown = e => { if (e.key === "Enter") entrar(); };
$("btnSalir").onclick = () => salir("Sesión cerrada");

$("btnAct").onclick = async e => {
  const btn = e.currentTarget;   // el clic puede caer en el ícono SVG
  btn.disabled = true;
  $("estado").textContent = "Midiendo...";
  try { await llamar("medir", "1"); } catch (_) {}
  await leer();
  btn.disabled = false;
};

$("btnMin").onclick = async () => {
  try {
    const j = await llamar("intervalo", $("selMin").value);
    $("estado").textContent = j.error ? "Error: " + (j.error_description || j.error)
                                      : `Intervalo cambiado a ${$("selMin").value} min`;
  } catch (e) {
    $("estado").textContent = "Error: " + e.message;
  }
};

// Si ya había sesión en esta pestaña, entra directo
token = obtener("pt");
if (token) abrirApp();
