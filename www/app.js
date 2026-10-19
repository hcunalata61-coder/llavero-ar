import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MindARThree } from "./vendor/mind-ar/mindar-image-three.prod.js";
import { Compiler } from "./vendor/mind-ar/mindar-image.prod.js";
import { CONFIG } from "./config.js";

const $ = (id) => document.getElementById(id);
// Estado visible para pruebas automáticas
const estado = (window.__estado = { pantalla: "inicio", iniciado: false, detecciones: 0, detectado: false, error: null, guardado: false });

/* ============================================================
   Almacenamiento local (IndexedDB): marcador, fotos y música
   ============================================================ */
const almacen = (() => {
  let db;
  const abrir = () => db || (db = new Promise((ok, mal) => {
    const r = indexedDB.open("llavero-ar", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("datos");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  }));
  const tx = async (modo, fn) => {
    const d = await abrir();
    return new Promise((ok, mal) => {
      const t = d.transaction("datos", modo);
      const req = fn(t.objectStore("datos"));
      t.oncomplete = () => ok(req?.result);
      t.onerror = () => mal(t.error);
    });
  };
  return {
    leer: (k) => tx("readonly", (s) => s.get(k)).catch(() => undefined),
    guardar: (k, v) => tx("readwrite", (s) => s.put(v, k)),
  };
})();

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

const pantallas = ["inicio", "config", "ar"];
function mostrar(nombre, { desdeHistorial = false } = {}) {
  if (estado.pantalla === "ar" && nombre !== "ar") detenerAR();
  pantallas.forEach((p) => ($(p).hidden = p !== nombre));
  estado.pantalla = nombre;
  // El botón "atrás" de Android regresa al inicio
  if (!desdeHistorial && nombre !== "inicio") history.pushState({ p: nombre }, "");
}
window.addEventListener("popstate", () => { if (estado.pantalla !== "inicio") mostrar("inicio", { desdeHistorial: true }); });
function volverInicio() { if (history.state?.p) history.back(); else mostrar("inicio"); }

/* ============================================================
   Inicio: elegir llavero
   ============================================================ */
let activo = "incluido";
let miLlavero = null; // { marcador, vistas:[Blob], musica:{tipo,nombre,blob?,url?} }

function nombreMusica(m) {
  if (!m) return "Sin música";
  if (m.tipo === "archivo") return m.nombre;
  if (m.tipo === "enlace") return decodeURIComponent(m.url.split("/").pop() || m.url);
  return "Canción de ejemplo";
}

function pintarInicio() {
  $("titulo").textContent = CONFIG.titulo;
  $("incluido-foto").src = CONFIG.llaveroIncluido.miniatura;
  $("incluido-nombre").textContent = CONFIG.llaveroIncluido.nombre;
  $("incluido-detalle").textContent = "Llavero incluido · música desde internet";
  if (miLlavero) {
    $("mio-foto").src = URL.createObjectURL(miLlavero.vistas[0]);
    $("mio-foto").hidden = false;
    $("mio-foto-vacia").hidden = true;
    $("mio-detalle").textContent = `${miLlavero.vistas.length} ${miLlavero.vistas.length === 1 ? "vista" : "vistas"} · ♪ ${nombreMusica(miLlavero.musica)}`;
  }
  $("op-incluido").setAttribute("aria-pressed", String(activo === "incluido"));
  $("op-mio").setAttribute("aria-pressed", String(activo === "mio"));
}

$("op-incluido").addEventListener("click", () => { activo = "incluido"; almacen.guardar("activo", activo); pintarInicio(); });
$("op-mio").addEventListener("click", () => {
  if (!miLlavero) { abrirConfig(); return; }
  activo = "mio"; almacen.guardar("activo", activo); pintarInicio();
});
$("ir-config").addEventListener("click", () => abrirConfig());
$("escanear").addEventListener("click", () => iniciarAR());

/* ============================================================
   Configurar: fotos (vistas), recorte, música y marcador
   ============================================================ */
const borrador = { vistas: [], musica: { tipo: "ejemplo" } };
const MAX_VISTAS = 3;

function abrirConfig() {
  borrador.vistas = miLlavero ? [...miLlavero.vistas] : [];
  borrador.musica = miLlavero ? { ...miLlavero.musica } : { tipo: "ejemplo" };
  $("enlace-musica").value = borrador.musica.tipo === "enlace" ? borrador.musica.url : "";
  $("recorte").hidden = true;
  $("barra-progreso").style.width = "0%";
  pintarVistas();
  pintarMusica();
  mensajeConfig(borrador.vistas.length ? "Listo para generar." : "Primero agrega al menos una vista del llavero.");
  mostrar("config");
}
$("volver-config").addEventListener("click", volverInicio);

function mensajeConfig(t, tipo) {
  const el = $("mensaje-config");
  el.textContent = t;
  el.classList.toggle("error", tipo === "error");
  el.classList.toggle("bien", tipo === "bien");
}

function pintarVistas() {
  const cont = $("vistas");
  cont.replaceChildren();
  borrador.vistas.forEach((blob, i) => {
    const d = document.createElement("div");
    d.className = "vista";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(blob);
    img.alt = `Vista ${i + 1}`;
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.textContent = "×";
    quitar.setAttribute("aria-label", `Quitar vista ${i + 1}`);
    quitar.addEventListener("click", () => { borrador.vistas.splice(i, 1); pintarVistas(); });
    d.append(img, quitar);
    cont.append(d);
  });
  const lleno = borrador.vistas.length >= MAX_VISTAS;
  $("tomar-foto").disabled = lleno;
  $("elegir-foto").disabled = lleno;
  $("vistas-ayuda").textContent = lleno
    ? "Máximo 3 vistas. Quita una para agregar otra."
    : borrador.vistas.length
      ? `${borrador.vistas.length} de ${MAX_VISTAS} vistas. Puedes agregar otra desde un ángulo distinto.`
      : "Para llaveros en 3D agrega 2 o 3 vistas: desde arriba y un poco inclinado.";
  $("guardar").disabled = borrador.vistas.length === 0;
}

// ---------- Recorte con arrastre y zoom ----------
const recorte = { img: null, zoom: 1, x: 0, y: 0 };
const lienzo = $("lienzo-recorte");
const ctxL = lienzo.getContext("2d");

function dibujarRecorte() {
  const { img } = recorte;
  if (!img) return;
  const L = lienzo.width;
  const base = L / Math.min(img.width, img.height); // "cover"
  const e = base * recorte.zoom;
  const w = img.width * e, h = img.height * e;
  // limitar el desplazamiento para no dejar huecos
  recorte.x = Math.min(0, Math.max(L - w, recorte.x));
  recorte.y = Math.min(0, Math.max(L - h, recorte.y));
  ctxL.fillStyle = "#223140";
  ctxL.fillRect(0, 0, L, L);
  ctxL.drawImage(img, recorte.x, recorte.y, w, h);
}
function centrarRecorte() {
  const L = lienzo.width, img = recorte.img;
  const e = (L / Math.min(img.width, img.height)) * recorte.zoom;
  recorte.x = (L - img.width * e) / 2;
  recorte.y = (L - img.height * e) / 2;
}

async function cargarFoto(archivo) {
  if (!archivo) return;
  if (!archivo.type.startsWith("image/")) { aviso("Ese archivo no es una imagen."); return; }
  try {
    const bmp = await createImageBitmap(archivo, { imageOrientation: "from-image" });
    recorte.img = bmp;
    recorte.zoom = 1;
    $("zoom").value = "1";
    centrarRecorte();
    dibujarRecorte();
    $("recorte").hidden = false;
    $("recorte").scrollIntoView({ behavior: "smooth", block: "center" });
    if (Math.min(bmp.width, bmp.height) < 480) aviso("La foto es pequeña; el reconocimiento puede fallar.");
  } catch (e) {
    aviso("No se pudo abrir la foto. Prueba con otra.");
  }
}

$("tomar-foto").addEventListener("click", () => $("in-camara").click());
$("elegir-foto").addEventListener("click", () => $("in-galeria").click());
$("in-camara").addEventListener("change", (e) => { cargarFoto(e.target.files[0]); e.target.value = ""; });
$("in-galeria").addEventListener("change", (e) => { cargarFoto(e.target.files[0]); e.target.value = ""; });

$("zoom").addEventListener("input", (e) => {
  const L = lienzo.width, viejo = recorte.zoom, nuevo = parseFloat(e.target.value);
  // zoom hacia el centro del recuadro
  const c = L / 2;
  recorte.x = c - ((c - recorte.x) * nuevo) / viejo;
  recorte.y = c - ((c - recorte.y) * nuevo) / viejo;
  recorte.zoom = nuevo;
  dibujarRecorte();
});
let arrastre = null;
lienzo.addEventListener("pointerdown", (e) => {
  lienzo.setPointerCapture(e.pointerId);
  arrastre = { x: e.clientX, y: e.clientY, ox: recorte.x, oy: recorte.y };
});
lienzo.addEventListener("pointermove", (e) => {
  if (!arrastre) return;
  const k = lienzo.width / lienzo.getBoundingClientRect().width;
  recorte.x = arrastre.ox + (e.clientX - arrastre.x) * k;
  recorte.y = arrastre.oy + (e.clientY - arrastre.y) * k;
  dibujarRecorte();
});
["pointerup", "pointercancel"].forEach((ev) => lienzo.addEventListener(ev, () => (arrastre = null)));

$("cancelar-vista").addEventListener("click", () => { $("recorte").hidden = true; recorte.img = null; });
$("agregar-vista").addEventListener("click", () => {
  // Exportar el recorte a 800 × 800 px
  const S = 800, out = document.createElement("canvas");
  out.width = out.height = S;
  const k = S / lienzo.width;
  const g = out.getContext("2d");
  const { img } = recorte;
  const e = (lienzo.width / Math.min(img.width, img.height)) * recorte.zoom;
  g.drawImage(img, recorte.x * k, recorte.y * k, img.width * e * k, img.height * e * k);
  out.toBlob((blob) => {
    borrador.vistas.push(blob);
    $("recorte").hidden = true;
    recorte.img = null;
    pintarVistas();
    mensajeConfig("Listo para generar.");
  }, "image/jpeg", 0.92);
});

// ---------- Música ----------
function pintarMusica() { $("musica-nombre").textContent = nombreMusica(borrador.musica); }
$("elegir-musica").addEventListener("click", () => $("in-musica").click());
$("in-musica").addEventListener("change", (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!f.type.startsWith("audio/") && !/\.(mp3|m4a|aac|ogg|wav)$/i.test(f.name)) { aviso("Ese archivo no es de audio."); return; }
  borrador.musica = { tipo: "archivo", nombre: f.name, blob: f };
  $("enlace-musica").value = "";
  pintarMusica();
});
$("musica-ejemplo").addEventListener("click", () => { borrador.musica = { tipo: "ejemplo" }; $("enlace-musica").value = ""; pintarMusica(); });
$("enlace-musica").addEventListener("change", (e) => {
  const v = e.target.value.trim();
  if (!v) return;
  if (!/^https:\/\/.+/i.test(v)) { aviso("El enlace debe empezar con https://"); return; }
  borrador.musica = { tipo: "enlace", url: v };
  pintarMusica();
});

// ---------- Generar marcador ----------
async function blobAImagen(blob) {
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  return img;
}

$("guardar").addEventListener("click", async () => {
  if (!borrador.vistas.length) return;
  // Si el campo de enlace tiene texto que aún no se aplicó
  const v = $("enlace-musica").value.trim();
  if (v && /^https:\/\//i.test(v)) borrador.musica = { tipo: "enlace", url: v };

  $("guardar").disabled = true;
  mensajeConfig("Analizando los detalles… 0%");
  try {
    const imagenes = await Promise.all(borrador.vistas.map(blobAImagen));
    const compilador = new Compiler();
    await compilador.compileImageTargets(imagenes, (p) => {
      $("barra-progreso").style.width = p.toFixed(0) + "%";
      mensajeConfig(`Analizando los detalles… ${p.toFixed(0)}%`);
    });
    const marcador = await compilador.exportData();
    // Puntos de detalle por vista: indican qué tan reconocible es
    const puntos = compilador.data.map((d) => d.matchingData.reduce((s, m) => s + m.maximaPoints.length + m.minimaPoints.length, 0));
    const minimo = Math.min(...puntos);
    miLlavero = { marcador, vistas: [...borrador.vistas], musica: borrador.musica, puntos };
    await almacen.guardar("mio", miLlavero);
    activo = "mio";
    await almacen.guardar("activo", activo);
    estado.guardado = true;
    $("barra-progreso").style.width = "100%";
    if (minimo < 300) {
      mensajeConfig("Guardado, pero una vista tiene poco detalle. Si no lo reconoce, usa otra foto con más textura.", "error");
    } else {
      mensajeConfig("¡Guardado! Ya puedes escanear tu llavero.", "bien");
    }
    pintarInicio();
    setTimeout(() => { if (estado.pantalla === "config") volverInicio(); }, 1400);
  } catch (e) {
    console.error(e);
    mensajeConfig("No se pudo generar: " + (e?.message || e), "error");
  } finally {
    $("guardar").disabled = borrador.vistas.length === 0;
  }
});

/* ============================================================
   Contenido 3D
   ============================================================ */
const cargador = new GLTFLoader();
const modelosCache = new Map();
async function cargarModelo(url, escalaExtra = 1) {
  if (!modelosCache.has(url)) modelosCache.set(url, cargador.loadAsync(url).catch((e) => { modelosCache.delete(url); throw e; }));
  const gltf = await modelosCache.get(url);
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
  const escala = (CONFIG.escalaModelo * escalaExtra) / Math.max(tam.x, tam.y, tam.z || 1);
  modelo.scale.setScalar(escala);
  modelo.position.copy(centro).multiplyScalar(-escala);
  const pivote = new THREE.Group();
  pivote.add(modelo);
  return { pivote, animaciones: gltf.animations, modelo };
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

async function crearContenido(grupo, urlModelo, escalaExtra = 1) {
  const col = CONFIG.colores;
  const raiz = new THREE.Group();
  grupo.add(raiz);
  raiz.add(new THREE.HemisphereLight(0xffffff, 0x553366, 2.2));
  const luz = new THREE.DirectionalLight(0xffffff, 2);
  luz.position.set(0.4, 0.6, 1.5);
  raiz.add(luz);

  let modelo = null, mezclador = null;
  if (urlModelo) {
    try {
      const m = await cargarModelo(urlModelo, escalaExtra);
      modelo = m.pivote;
      modelo.position.z = CONFIG.alturaModelo;
      raiz.add(modelo);
      if (m.animaciones.length) {
        mezclador = new THREE.AnimationMixer(m.modelo);
        m.animaciones.forEach((c) => mezclador.clipAction(c).play());
      }
    } catch (e) {
      console.warn("No se pudo cargar el modelo 3D", e);
    }
  }

  const notas = [];
  let aro = null;
  if (CONFIG.notasMusicales) {
    aro = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.535, 96),
      new THREE.MeshBasicMaterial({ color: col.principal, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    raiz.add(aro);
    const simbolos = ["♪", "♫", "♩", "♬"];
    const colores = [col.principal, col.secundario, col.terciario, col.principal];
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaNota(simbolos[i % 4], colores[i % 4]), transparent: true, depthWrite: false }));
      s.userData = { fase: i / 8, radio: 0.38 + (i % 3) * 0.1, vel: 0.1 + (i % 4) * 0.025 };
      s.scale.setScalar(0.15);
      raiz.add(s);
      notas.push(s);
    }
  }

  return {
    raiz,
    actualizar(t, dt, nivel) {
      // nivel: 0..1 (volumen real de la música o un pulso simulado)
      if (modelo) {
        modelo.rotation.y = Math.sin(t * 0.9) * 0.45;
        modelo.position.z = CONFIG.alturaModelo + Math.sin(t * 2) * 0.03;
        modelo.scale.setScalar(1 + nivel * 0.12);
      }
      if (mezclador) mezclador.update(dt);
      if (aro) {
        aro.rotation.z = t * 0.4;
        aro.scale.setScalar(1 + nivel * 0.08);
        aro.material.opacity = 0.55 + 0.35 * nivel;
      }
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
let ctxAudio = null;
function crearReproductor(musica) {
  const audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = 0;
  let mismoOrigen = true;
  let url;
  if (musica?.tipo === "archivo" && musica.blob) url = URL.createObjectURL(musica.blob);
  else if (musica?.tipo === "enlace") { url = musica.url; mismoOrigen = false; }
  else if (musica?.tipo === "incluido") { url = musica.url; mismoOrigen = new URL(url, location.href).origin === location.origin; }
  else url = "musica/ejemplo.mp3";
  audio.src = url;

  // Analizador solo para audio local (un enlace externo sin CORS quedaría en silencio)
  let analizador = null, datos = null;
  if (mismoOrigen) {
    try {
      ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
      const fuente = ctxAudio.createMediaElementSource(audio);
      analizador = ctxAudio.createAnalyser();
      analizador.fftSize = 64;
      datos = new Uint8Array(analizador.frequencyBinCount);
      fuente.connect(analizador);
      analizador.connect(ctxAudio.destination);
    } catch (e) { analizador = null; }
  }

  let fallo = false, fundido = 0, silenciado = false;
  audio.addEventListener("error", () => { fallo = true; reproductor.onFallo?.(); });

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

  const reproductor = {
    get fallo() { return fallo; },
    get sonando() { return !audio.paused; },
    desbloquear() {
      if (ctxAudio?.state === "suspended") ctxAudio.resume();
      return audio.play().then(() => { audio.pause(); }).catch(() => {});
    },
    sonar() {
      if (fallo) return;
      if (ctxAudio?.state === "suspended") ctxAudio.resume();
      audio.play().catch(() => reproductor.onBloqueado?.());
      fundir(silenciado ? 0 : CONFIG.volumen, 600);
    },
    pausar() {
      if (CONFIG.seguirSonando) return;
      fundir(0, 400, () => audio.pause());
    },
    silenciar(v) { silenciado = v; fundir(v ? 0 : CONFIG.volumen, 250); },
    nivel(t) {
      if (analizador && !audio.paused) {
        analizador.getByteFrequencyData(datos);
        let s = 0;
        for (let i = 0; i < 8; i++) s += datos[i];
        return Math.min(1, s / (8 * 200));
      }
      // Pulso simulado tipo latido (~100 bpm)
      const f = (t * 1.66) % 1;
      return audio.paused ? 0.2 : Math.max(Math.exp(-f * 9), 0.6 * Math.exp(-Math.abs(f - 0.22) * 14));
    },
    destruir() {
      cancelAnimationFrame(fundido);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    },
  };
  return reproductor;
}

/* ============================================================
   Escáner AR
   ============================================================ */
let sesion = null;

function estadoAR(texto, detectado) {
  $("estado-texto").textContent = texto;
  $("estado").classList.toggle("detectado", !!detectado);
}

async function iniciarAR() {
  const usarMio = activo === "mio" && miLlavero;
  const L = CONFIG.llaveroIncluido;
  const fuente = usarMio
    ? { marcador: URL.createObjectURL(new Blob([miLlavero.marcador])), vistas: miLlavero.vistas.length, musica: miLlavero.musica, modelo: CONFIG.modeloMiLlavero, escala: 0.65 }
    : { marcador: L.marcador, vistas: L.vistas, musica: { tipo: "incluido", url: L.musica }, modelo: L.modelo, escala: 1 };

  estado.iniciado = false; estado.detectado = false; estado.error = null;
  mostrar("ar");
  $("guia").classList.remove("oculta");
  estadoAR("Iniciando la cámara…", false);
  $("escena").replaceChildren();

  const reproductor = crearReproductor(fuente.musica);
  if (silenciado) reproductor.silenciar(true);
  reproductor.desbloquear(); // dentro del toque del usuario
  reproductor.onFallo = () => {
    if (estado.detectado) estadoAR("Llavero detectado · sin música", true);
    aviso(fuente.musica?.tipo === "incluido" || fuente.musica?.tipo === "enlace"
      ? "No se pudo cargar la música. Revisa tu conexión a internet."
      : "No se pudo reproducir la música.");
  };
  reproductor.onBloqueado = () => estadoAR("Toca la pantalla para activar el sonido", true);

  const mindar = new MindARThree({
    container: $("escena"),
    imageTargetSrc: fuente.marcador,
    maxTrack: 1,
    uiLoading: "no", uiScanning: "no", uiError: "no",
    filterMinCF: 0.0001, filterBeta: 0.001,
    warmupTolerance: 3, missTolerance: 8,
  });
  const { renderer, scene, camera } = mindar;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const yo = (sesion = { mindar, reproductor, marcadorUrl: fuente.marcador, activa: true });

  // Un ancla por cada vista; todas muestran el mismo contenido
  const anclas = [];
  for (let i = 0; i < fuente.vistas; i++) {
    const ancla = mindar.addAnchor(i);
    const contenido = await crearContenido(ancla.group, fuente.modelo, fuente.escala);
    anclas.push({ ancla, contenido, aparicion: 0 });
    ancla.onTargetFound = () => {
      if (!yo.activa) return;
      estado.detectado = true; estado.detecciones++;
      $("guia").classList.add("oculta");
      estadoAR(reproductor.fallo ? "Llavero detectado · sin música" : "♪ Llavero detectado", true);
      reproductor.sonar();
      navigator.vibrate?.(30);
    };
    ancla.onTargetLost = () => {
      if (!yo.activa) return;
      anclas[i].aparicion = 0;
      if (anclas.some((a) => a.ancla.visible)) return;
      estado.detectado = false;
      $("guia").classList.remove("oculta");
      estadoAR("Buscando el llavero…", false);
      reproductor.pausar();
    };
  }
  if (!yo.activa) return;

  try {
    await mindar.start();
  } catch (e) {
    console.error(e);
    if (!yo.activa) return;
    const n = e?.name || "";
    estado.error = n || String(e);
    if (n === "NotAllowedError") aviso("Permite el acceso a la cámara para usar la app (Ajustes › Apps › Llavero AR › Permisos).", 7000);
    else aviso("No se pudo abrir la cámara: " + (e?.message || e), 7000);
    volverInicio();
    return;
  }
  if (!yo.activa) { try { mindar.stop(); } catch (e) {} return; }

  estado.iniciado = true;
  estadoAR("Buscando el llavero…", false);

  const reloj = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = reloj.getDelta(), t = reloj.elapsedTime;
    const nivel = reproductor.nivel(t);
    for (const a of anclas) {
      if (!a.ancla.visible) continue;
      a.aparicion = Math.min(1, a.aparicion + dt * 3);
      const k = 1 - Math.pow(1 - a.aparicion, 3);
      a.contenido.raiz.scale.setScalar(Math.max(0.001, k));
      a.contenido.actualizar(t, dt, nivel);
    }
    renderer.render(scene, camera);
  });
}

function detenerAR() {
  const s = sesion;
  if (!s) return;
  s.activa = false;
  sesion = null;
  try { s.mindar.renderer.setAnimationLoop(null); } catch (e) {}
  try { s.mindar.stop(); } catch (e) {}
  try { s.mindar.renderer.dispose(); } catch (e) {}
  s.reproductor.destruir();
  if (s.marcadorUrl.startsWith("blob:")) URL.revokeObjectURL(s.marcadorUrl);
  $("escena").replaceChildren();
  estado.detectado = false;
}

let silenciado = false;
$("silenciar").addEventListener("click", () => {
  silenciado = !silenciado;
  $("icono-ondas").style.display = silenciado ? "none" : "";
  $("icono-mudo").style.display = silenciado ? "" : "none";
  $("silenciar").setAttribute("aria-label", silenciado ? "Activar música" : "Silenciar música");
  sesion?.reproductor.silenciar(silenciado);
});
$("volver-ar").addEventListener("click", volverInicio);
// Si el sistema bloqueó el audio, cualquier toque lo reactiva
$("ar").addEventListener("pointerdown", () => { if (sesion && estado.detectado && !sesion.reproductor.sonando) sesion.reproductor.sonar(); });

/* ============================================================
   Arranque
   ============================================================ */
(async () => {
  miLlavero = (await almacen.leer("mio")) || null;
  activo = (await almacen.leer("activo")) || "incluido";
  if (activo === "mio" && !miLlavero) activo = "incluido";
  pintarInicio();
  window.__listo = true;
})();
