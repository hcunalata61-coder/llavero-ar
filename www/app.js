import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "./vendor/mind-ar/mindar-image-three.prod.js";
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);
// Estado visible para pruebas automáticas
const estado = (window.__estado = {
  iniciado: false, detectado: false, porImagen: false, porColor: false,
  detecciones: 0, error: null, calibrado: false,
});

/* ============================================================
   Ajustes (se guardan en el celular)
   ============================================================ */
const CLAVE = "llavero-ar-ajustes";
const CLAVE_CAL = "llavero-ar-calibracion";
function leerJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function guardarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

const ajustes = { ...CONFIG.ajustes, ...(leerJSON(CLAVE) || {}) };
let calibracion = leerJSON(CLAVE_CAL); // null = color de fábrica
const guardarAjustes = () => guardarJSON(CLAVE, ajustes);

/* ============================================================
   Utilidades de interfaz
   ============================================================ */
let temporizadorAviso;
function aviso(texto, ms = 4000) {
  const el = $("aviso");
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => (el.hidden = true), ms);
}
function estadoTexto(texto, detectado) {
  $("estado-texto").textContent = texto;
  $("estado").classList.toggle("detectado", !!detectado);
}
$("titulo").textContent = CONFIG.titulo;

/* ============================================================
   Contenido 3D (corazón + notas)
   ============================================================ */
const cargador = new GLTFLoader();
let promesaModelo = null;
function cargarGLTF() {
  if (!promesaModelo) promesaModelo = cargador.loadAsync(CONFIG.llavero.modelo).catch((e) => { promesaModelo = null; throw e; });
  return promesaModelo;
}
async function crearModelo() {
  const gltf = await cargarGLTF();
  const modelo = gltf.scene.clone(true);
  // El vidrio con "transmission" se ve oscuro sobre el video: lo cambiamos por vidrio simple
  modelo.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m && (m.transmission > 0 || m.name === "Marble")) {
      o.material = new THREE.MeshStandardMaterial({
        color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2,
        side: THREE.DoubleSide, depthWrite: false,
      });
      o.renderOrder = 2;
    }
  });
  const caja = new THREE.Box3().setFromObject(modelo);
  const tam = caja.getSize(new THREE.Vector3());
  const centro = caja.getCenter(new THREE.Vector3());
  const escala = CONFIG.escalaModelo / Math.max(tam.x, tam.y, tam.z || 1);
  modelo.scale.setScalar(escala);
  modelo.position.copy(centro).multiplyScalar(-escala);
  const pivote = new THREE.Group();
  pivote.add(modelo);
  const mezclador = gltf.animations.length ? new THREE.AnimationMixer(modelo) : null;
  gltf.animations.forEach((c) => mezclador.clipAction(c).play());
  return { pivote, mezclador };
}

function texturaNota(simbolo, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.font = "bold 104px 'Segoe UI Symbol', 'Noto Sans Symbols 2', 'Noto Music', 'DejaVu Sans', serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.4)"; g.shadowBlur = 8;
  g.fillText(simbolo, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Crea el contenido en unidades del llavero (ancho = 1)
async function crearContenido() {
  const col = CONFIG.colores;
  const raiz = new THREE.Group();
  raiz.add(new THREE.HemisphereLight(0xffffff, 0x553366, 2.2));
  const luz = new THREE.DirectionalLight(0xffffff, 2);
  luz.position.set(0.4, 0.6, 1.5);
  raiz.add(luz);

  let modelo = null, mezclador = null;
  try {
    const m = await crearModelo();
    modelo = m.pivote;
    mezclador = m.mezclador;
    modelo.position.z = CONFIG.alturaModelo;
    raiz.add(modelo);
  } catch (e) {
    console.warn("No se pudo cargar el modelo 3D", e);
  }

  const decoracion = new THREE.Group();
  raiz.add(decoracion);
  const aro = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.535, 96),
    new THREE.MeshBasicMaterial({ color: col.principal, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  decoracion.add(aro);
  const notas = [];
  const simbolos = ["♪", "♫", "♩", "♬"];
  const colores = [col.principal, col.secundario, col.terciario, col.principal];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaNota(simbolos[i % 4], colores[i % 4]), transparent: true, depthWrite: false }));
    s.userData = { fase: i / 8, radio: 0.38 + (i % 3) * 0.1, vel: 0.1 + (i % 4) * 0.025 };
    s.scale.setScalar(0.15);
    decoracion.add(s);
    notas.push(s);
  }

  return {
    raiz,
    actualizar(t, dt, nivel) {
      decoracion.visible = ajustes.notas;
      if (modelo) {
        modelo.rotation.y = Math.sin(t * 0.9) * 0.45;
        modelo.position.z = CONFIG.alturaModelo + Math.sin(t * 2) * 0.03;
        modelo.scale.setScalar(1 + nivel * 0.12);
      }
      if (mezclador) mezclador.update(dt);
      aro.rotation.z = t * 0.4;
      aro.scale.setScalar(1 + nivel * 0.08);
      aro.material.opacity = 0.55 + 0.35 * nivel;
      for (const s of notas) {
        const u = (s.userData.fase + t * s.userData.vel) % 1;
        const a = u * Math.PI * 3 + s.userData.fase * 6.28;
        s.position.set(Math.cos(a) * s.userData.radio, Math.sin(a) * s.userData.radio, 0.05 + u * 0.9);
        s.material.opacity = Math.sin(u * Math.PI);
      }
    },
  };
}

/* ============================================================
   Música
   ============================================================ */
const audio = new Audio();
audio.loop = true;
audio.preload = "auto";
audio.volume = 0;
audio.src = CONFIG.llavero.musica;
let musicaFallo = false;
let quiereSonar = false;
audio.addEventListener("error", () => {
  musicaFallo = true;
  if (estado.detectado) estadoTexto("Llavero detectado · sin música", true);
  aviso(/^https?:/.test(CONFIG.llavero.musica) ? "No se pudo cargar la música. Revisa tu conexión a internet." : "No se pudo reproducir la música.");
});

let fundido = 0;
function fundir(objetivo, ms, fin) {
  cancelAnimationFrame(fundido);
  const desde = audio.volume, t0 = performance.now();
  const paso = (t) => {
    const k = Math.min(1, Math.max(0, (t - t0) / ms));
    audio.volume = Math.min(1, Math.max(0, desde + (objetivo - desde) * k));
    if (k < 1) fundido = requestAnimationFrame(paso); else fin?.();
  };
  fundido = requestAnimationFrame(paso);
}
const volumenObjetivo = () => (ajustes.musica ? ajustes.volumen / 100 : 0);
function sonar() {
  quiereSonar = true;
  if (musicaFallo || !ajustes.musica) return;
  const p = audio.play();
  if (p) p.then(() => { $("toque-sonido").hidden = true; }).catch(() => { $("toque-sonido").hidden = false; });
  fundir(volumenObjetivo(), 600);
}
function pausar() {
  quiereSonar = false;
  $("toque-sonido").hidden = true;
  fundir(0, 400, () => { if (!quiereSonar) audio.pause(); });
}
function nivelMusica(t) {
  // Pulso tipo latido (~100 bpm) mientras suena
  if (audio.paused) return 0.15;
  const f = (t * 1.66) % 1;
  return Math.max(Math.exp(-f * 9), 0.6 * Math.exp(-Math.abs(f - 0.22) * 14));
}
$("toque-sonido").addEventListener("click", () => sonar());
document.addEventListener("visibilitychange", () => { if (document.hidden) audio.pause(); else if (quiereSonar) sonar(); });

/* ============================================================
   Reconocimiento por color y forma
   ============================================================ */
const lienzoDet = document.createElement("canvas");
const ctxDet = lienzoDet.getContext("2d", { willReadFrequently: true });
const ANCHO_DET = 120;

function rgbAHsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

function parametrosColor() {
  const base = calibracion || CONFIG.llavero.color;
  const sens = ajustes.sensibilidad; // 1 (estricto) … 5 (permisivo)
  const extra = (sens - 3) * 8;
  const factorS = [1.5, 1.25, 1, 0.8, 0.65][sens - 1] ?? 1;
  return {
    tonoMin: base.tonoMin - extra,
    tonoMax: base.tonoMax + extra,
    sMin: base.saturacionMin * factorS,
    vMin: base.brilloMin,
    areaMin: [0.025, 0.018, 0.012, 0.008, 0.005][sens - 1] ?? 0.012,
  };
}
function tonoEnRango(h, a, b) {
  const n = (x) => ((x % 360) + 360) % 360;
  a = n(a); b = n(b); h = n(h);
  return a <= b ? h >= a && h <= b : h >= a || h <= b;
}

// Devuelve la mancha de color más grande (coordenadas 0–1 del video) o null
function detectarColor(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const W = ANCHO_DET, H = Math.max(1, Math.round((vh * W) / vw));
  if (lienzoDet.width !== W || lienzoDet.height !== H) { lienzoDet.width = W; lienzoDet.height = H; }
  ctxDet.drawImage(video, 0, 0, W, H);
  const datos = ctxDet.getImageData(0, 0, W, H).data;
  const p = parametrosColor();
  const N = W * H;
  const mascara = new Uint8Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const [h, s, v] = rgbAHsv(datos[j], datos[j + 1], datos[j + 2]);
    if (s >= p.sMin && v >= p.vMin && tonoEnRango(h, p.tonoMin, p.tonoMax)) mascara[i] = 1;
  }
  // Componentes conectadas: nos quedamos con la más grande
  const etiqueta = new Int32Array(N);
  const cola = new Int32Array(N);
  let mejor = null, id = 0;
  for (let i = 0; i < N; i++) {
    if (!mascara[i] || etiqueta[i]) continue;
    id++;
    let ini = 0, fin = 0;
    cola[fin++] = i; etiqueta[i] = id;
    let area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (ini < fin) {
      const k = cola[ini++];
      const x = k % W, y = (k / W) | 0;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      // vecinos (con salto de 1 px para unir huecos pequeños)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mascara[q] && !etiqueta[q]) { etiqueta[q] = id; cola[fin++] = q; }
      }
    }
    if (!mejor || area > mejor.area) mejor = { area, sx, sy, x0, x1, y0, y1 };
  }
  if (!mejor) return null;
  const fraccion = mejor.area / N;
  const bw = mejor.x1 - mejor.x0 + 1, bh = mejor.y1 - mejor.y0 + 1;
  const relleno = mejor.area / (bw * bh);
  // Debe tener tamaño razonable y ser un objeto (no toda la pantalla ni una línea)
  if (fraccion < p.areaMin || fraccion > 0.7 || relleno < 0.2) return null;
  return {
    cx: mejor.sx / mejor.area / W, cy: mejor.sy / mejor.area / H,
    x0: mejor.x0 / W, y0: mejor.y0 / H, w: bw / W, h: bh / H, fraccion,
  };
}

// Pasa coordenadas del video (0–1) a píxeles de pantalla, según cómo se muestra el video
function videoAPantalla(video, nx, ny) {
  const r = video.getBoundingClientRect();
  return [r.left + nx * r.width, r.top + ny * r.height, r.width, r.height];
}

/* ============================================================
   Calibración de color
   ============================================================ */
function abrirCalibrar() {
  cerrarAjustes();
  if (!sesion?.video) { aviso("Espera a que se abra la cámara."); return; }
  $("calibrar-capa").hidden = false;
  $("calibrar-barra").hidden = false;
  $("guia").hidden = true;
}
function cerrarCalibrar() {
  $("calibrar-capa").hidden = true;
  $("calibrar-barra").hidden = true;
  $("guia").hidden = false;
}
function capturarCalibracion() {
  const video = sesion?.video;
  if (!video?.videoWidth) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  const r = video.getBoundingClientRect();
  // círculo de 34vmin centrado en la pantalla → zona del video
  const radioPx = Math.min(innerWidth, innerHeight) * 0.17;
  const cxV = ((innerWidth / 2 - r.left) / r.width) * vw;
  const cyV = ((innerHeight / 2 - r.top) / r.height) * vh;
  const radV = (radioPx / r.width) * vw;
  const lado = Math.max(8, Math.round(radV * 2));
  const c = document.createElement("canvas");
  const S = 80;
  c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(video, cxV - lado / 2, cyV - lado / 2, lado, lado, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const tonos = [], sats = [], brillos = [];
  let dentro = 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - S / 2, dy = y - S / 2;
    if (dx * dx + dy * dy > (S / 2) * (S / 2)) continue;
    dentro++;
    const j = (y * S + x) * 4;
    const [h, s, v] = rgbAHsv(d[j], d[j + 1], d[j + 2]);
    if (s >= 0.12 && v >= 0.08) { tonos.push(h); sats.push(s); brillos.push(v); }
  }
  if (tonos.length < dentro * 0.15) {
    aviso("No encontré un color claro. Acerca más el llavero o mejora la luz y vuelve a intentar.", 5000);
    return;
  }
  // mediana circular del tono
  const ang = tonos.map((h) => (h * Math.PI) / 180);
  const medio = (Math.atan2(ang.reduce((s, a) => s + Math.sin(a), 0), ang.reduce((s, a) => s + Math.cos(a), 0)) * 180) / Math.PI;
  const desv = tonos.map((h) => Math.abs(((h - medio + 540) % 360) - 180)).sort((a, b) => a - b);
  const ancho = Math.min(60, Math.max(25, desv[Math.floor(desv.length * 0.85)] + 10));
  const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length * q)];
  calibracion = {
    tonoMin: medio - ancho, tonoMax: medio + ancho,
    saturacionMin: Math.max(0.08, pct(sats, 0.15) * 0.8),
    brilloMin: Math.max(0.06, pct(brillos, 0.1) * 0.7),
  };
  guardarJSON(CLAVE_CAL, calibracion);
  estado.calibrado = true;
  pintarNotaCalibracion();
  cerrarCalibrar();
  aviso("¡Color calibrado! Ahora apunta al llavero.");
}
function pintarNotaCalibracion() {
  $("nota-calibracion").textContent = calibracion
    ? "Usando el color que calibraste con tu cámara."
    : "Usando el color del cocodrilo de las fotos.";
}
$("abrir-calibrar").addEventListener("click", abrirCalibrar);
$("calibrar-cancelar").addEventListener("click", cerrarCalibrar);
$("calibrar-capturar").addEventListener("click", capturarCalibracion);

/* ============================================================
   Panel de ajustes
   ============================================================ */
function abrirAjustes() {
  $("ajustes").classList.add("abierto");
  $("ajustes").setAttribute("aria-hidden", "false");
  $("velo").classList.add("visible");
  $("abrir-ajustes").setAttribute("aria-expanded", "true");
}
function cerrarAjustes() {
  $("ajustes").classList.remove("abierto");
  $("ajustes").setAttribute("aria-hidden", "true");
  $("velo").classList.remove("visible");
  $("abrir-ajustes").setAttribute("aria-expanded", "false");
}
$("abrir-ajustes").addEventListener("click", abrirAjustes);
$("cerrar-ajustes").addEventListener("click", cerrarAjustes);
$("velo").addEventListener("click", cerrarAjustes);

const nombresSens = ["Muy baja", "Baja", "Media", "Alta", "Muy alta"];
function pintarAjustes() {
  $("aj-musica").checked = ajustes.musica;
  $("aj-volumen").value = ajustes.volumen;
  $("aj-volumen-val").textContent = ajustes.volumen + "%";
  $("aj-tamano").value = ajustes.tamano;
  $("aj-tamano-val").textContent = ajustes.tamano + "%";
  $("aj-notas").checked = ajustes.notas;
  $("aj-linterna").checked = ajustes.linterna;
  $("aj-imagen").checked = ajustes.imagen;
  $("aj-color").checked = ajustes.color;
  $("aj-sensibilidad").value = ajustes.sensibilidad;
  $("aj-sensibilidad-val").textContent = nombresSens[ajustes.sensibilidad - 1];
  $("aj-marco").checked = ajustes.marco;
  $("icono-ondas").style.display = ajustes.musica ? "" : "none";
  $("icono-mudo").style.display = ajustes.musica ? "none" : "";
  $("silenciar").setAttribute("aria-label", ajustes.musica ? "Silenciar música" : "Activar música");
  pintarNotaCalibracion();
}
function aplicarMusica() {
  if (!ajustes.musica) fundir(0, 250, () => audio.pause());
  else if (estado.detectado) sonar();
  else fundir(0, 250);
}
function enlazar(id, clave, tipo, alCambiar) {
  $(id).addEventListener(tipo === "check" ? "change" : "input", (e) => {
    ajustes[clave] = tipo === "check" ? e.target.checked : parseInt(e.target.value, 10);
    guardarAjustes();
    pintarAjustes();
    alCambiar?.();
  });
}
enlazar("aj-musica", "musica", "check", aplicarMusica);
enlazar("aj-volumen", "volumen", "range", () => { if (!audio.paused) fundir(volumenObjetivo(), 150); });
enlazar("aj-tamano", "tamano", "range");
enlazar("aj-notas", "notas", "check");
enlazar("aj-linterna", "linterna", "check", () => aplicarLinterna());
enlazar("aj-imagen", "imagen", "check", () => { if (!ajustes.imagen && !ajustes.color) { ajustes.color = true; guardarAjustes(); pintarAjustes(); aviso("Dejé activo el reconocimiento por color para que la app pueda detectar el llavero."); } });
enlazar("aj-color", "color", "check", () => { if (!ajustes.imagen && !ajustes.color) { ajustes.imagen = true; guardarAjustes(); pintarAjustes(); aviso("Dejé activo el reconocimiento por imagen para que la app pueda detectar el llavero."); } });
enlazar("aj-sensibilidad", "sensibilidad", "range");
enlazar("aj-marco", "marco", "check");
$("silenciar").addEventListener("click", () => {
  ajustes.musica = !ajustes.musica;
  guardarAjustes(); pintarAjustes(); aplicarMusica();
});
$("restablecer").addEventListener("click", () => {
  Object.assign(ajustes, CONFIG.ajustes);
  calibracion = null;
  try { localStorage.removeItem(CLAVE_CAL); } catch (e) {}
  guardarAjustes(); pintarAjustes(); aplicarMusica(); aplicarLinterna();
  aviso("Ajustes restablecidos.");
});

// ---------- Linterna ----------
async function aplicarLinterna() {
  const pista = sesion?.video?.srcObject?.getVideoTracks?.()[0];
  if (!pista) return;
  const cap = pista.getCapabilities?.() || {};
  if (!cap.torch) {
    $("aj-linterna").disabled = true;
    $("aj-linterna").checked = false;
    $("aj-linterna-nota").textContent = "No disponible en este celular";
    return;
  }
  try { await pista.applyConstraints({ advanced: [{ torch: !!ajustes.linterna }] }); } catch (e) {}
}

/* ============================================================
   Cámara + reconocimiento
   ============================================================ */
let sesion = null;

async function iniciar() {
  estado.error = null;
  estadoTexto("Abriendo la cámara…", false);
  $("escena").replaceChildren();

  const L = CONFIG.llavero;
  const mindar = new MindARThree({
    container: $("escena"),
    imageTargetSrc: L.marcador,
    maxTrack: 1,
    uiLoading: "no", uiScanning: "no", uiError: "no",
    filterMinCF: 0.0001, filterBeta: 0.001,
    warmupTolerance: 2, missTolerance: 10,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;

  // Anclas por imagen (una por vista del llavero)
  const anclas = [];
  for (let i = 0; i < L.vistas; i++) {
    const ancla = mindar.addAnchor(i);
    const contenido = await crearContenido();
    ancla.group.add(contenido.raiz);
    anclas.push({ ancla, contenido, aparicion: 0 });
  }

  // Escena superpuesta para el reconocimiento por color (en píxeles de pantalla)
  const escenaColor = new THREE.Scene();
  const camColor = new THREE.OrthographicCamera(0, 1, 0, -1, -5000, 5000);
  const soporte = new THREE.Group();
  const contenidoColor = await crearContenido();
  soporte.add(contenidoColor.raiz);
  soporte.visible = false;
  escenaColor.add(soporte);
  const suave = { x: 0, y: 0, s: 0, listo: false };
  let aciertos = 0, fallos = 0, aparicionColor = 0, ultimoDet = 0;

  sesion = { mindar, video: null };

  try {
    await mindar.start();
  } catch (e) {
    console.error(e);
    sesion = null;
    const n = e?.name || "";
    estado.error = n || String(e);
    if (n === "NotAllowedError" || /Permission|denied/i.test(String(e))) {
      estadoTexto("Toca aquí después de permitir la cámara", false);
      aviso("Permite el acceso a la cámara: Ajustes del teléfono › Apps › Llavero AR › Permisos.", 8000);
    } else {
      estadoTexto("Toca aquí para reintentar", false);
      aviso("No se pudo abrir la cámara. Cierra otras apps que la usen y vuelve a intentar.", 6000);
    }
    return;
  }
  sesion.video = mindar.video;
  estado.iniciado = true;
  estadoTexto("Buscando el llavero…", false);
  aplicarLinterna();

  let detectadoAntes = false;
  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = reloj.getDelta(), t = reloj.elapsedTime;
    const nivel = nivelMusica(t);
    const ancho = $("escena").clientWidth, alto = $("escena").clientHeight;

    // --- por imagen ---
    const calibrando = !$("calibrar-barra").hidden;
    let porImagen = false;
    for (const a of anclas) {
      const visible = ajustes.imagen && a.ancla.visible && !calibrando;
      a.contenido.raiz.visible = visible;
      if (!visible) { a.aparicion = 0; continue; }
      porImagen = true;
      a.aparicion = Math.min(1, a.aparicion + dt * 3);
      const k = 1 - Math.pow(1 - a.aparicion, 3);
      a.contenido.raiz.scale.setScalar(Math.max(0.001, k) * (ajustes.tamano / 100));
      a.contenido.actualizar(t, dt, nivel);
    }

    // --- por color (unas 12 veces por segundo) ---
    if (ajustes.color && t - ultimoDet > 0.08 && $("calibrar-barra").hidden) {
      ultimoDet = t;
      const m = detectarColor(mindar.video);
      if (m) {
        aciertos = Math.min(aciertos + 1, 10); fallos = 0;
        const [x, y, rw, rh] = videoAPantalla(mindar.video, m.cx, m.cy);
        const tam = Math.sqrt(m.w * rw * m.h * rh) * 0.75;
        if (!suave.listo) { suave.x = x; suave.y = y; suave.s = tam; suave.listo = true; }
        suave.x += (x - suave.x) * 0.45; suave.y += (y - suave.y) * 0.45; suave.s += (tam - suave.s) * 0.3;
        if (ajustes.marco) {
          const [bx, by] = videoAPantalla(mindar.video, m.x0, m.y0);
          const marco = $("marco-deteccion");
          marco.style.left = bx + "px"; marco.style.top = by + "px";
          marco.style.width = m.w * rw + "px"; marco.style.height = m.h * rh + "px";
        }
      } else {
        fallos++;
        if (fallos >= 6) { aciertos = 0; suave.listo = false; }
      }
    } else if (!ajustes.color) { aciertos = 0; suave.listo = false; }
    const porColor = ajustes.color && aciertos >= 3 && !calibrando;
    $("marco-deteccion").hidden = !(ajustes.marco && porColor);

    // Si la imagen ya lo encontró, se usa esa posición (más precisa)
    const mostrarColor = porColor && !porImagen;
    soporte.visible = mostrarColor;
    if (mostrarColor) {
      aparicionColor = Math.min(1, aparicionColor + dt * 3);
      const k = 1 - Math.pow(1 - aparicionColor, 3);
      soporte.position.set(suave.x, -suave.y, 0);
      soporte.scale.setScalar(Math.max(0.001, suave.s * k * (ajustes.tamano / 100)));
      contenidoColor.actualizar(t, dt, nivel);
    } else aparicionColor = 0;

    // --- estado general ---
    const detectado = porImagen || porColor;
    estado.porImagen = porImagen; estado.porColor = porColor; estado.detectado = detectado;
    if (detectado !== detectadoAntes) {
      detectadoAntes = detectado;
      if (detectado) {
        estado.detecciones++;
        $("guia").classList.add("oculta");
        estadoTexto(musicaFallo ? "Llavero detectado · sin música" : `♪ ${L.nombre} detectado`, true);
        sonar();
        navigator.vibrate?.(30);
      } else {
        $("guia").classList.remove("oculta");
        estadoTexto("Buscando el llavero…", false);
        pausar();
      }
    }

    // --- dibujar ---
    renderer.clear();
    renderer.render(scene, camera);
    if (mostrarColor) {
      camColor.left = 0; camColor.right = ancho; camColor.top = 0; camColor.bottom = -alto;
      camColor.updateProjectionMatrix();
      renderer.clearDepth();
      renderer.render(escenaColor, camColor);
    }
  });
}

// Reintentar si falló la cámara
$("estado").addEventListener("click", () => { if (!sesion && !estado.iniciado) iniciar(); });

/* ============================================================
   Arranque: abre la cámara directamente
   ============================================================ */
pintarAjustes();
cargarGLTF().catch(() => {});
iniciar();
window.__listo = true;
