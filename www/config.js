// ============================================================
//  AJUSTES DE LA APP LLAVERO AR
//  El usuario puede cambiar volumen, tamaño, etc. desde el panel
//  de ajustes de la app; aquí van los valores de fábrica.
// ============================================================

export const CONFIG = {
  titulo: "Llavero AR",

  llavero: {
    nombre: "Cocodrilo",
    // Marcador con 2 vistas del llavero (desde arriba e inclinado)
    marcador: "llaveros/cocodrilo/cocodrilo.mind",
    vistas: 2,
    // Música: enlace de tu hosting (necesita internet) o archivo dentro de www/
    musica: "https://taynastudio.com/wp-content/uploads/2026/07/AUD-20260727-WA0018.mp3",
    // Modelo 3D que aparece sobre el llavero
    modelo: "llaveros/cocodrilo/corazon.glb",
    // Color del llavero para el reconocimiento por color (tono en grados 0–360)
    color: { tonoMin: 75, tonoMax: 165, saturacionMin: 0.15, brilloMin: 0.12 },
  },

  // Tamaño del modelo respecto al ancho del llavero (1 = mismo ancho)
  escalaModelo: 0.85,
  // Altura a la que flota el modelo sobre el llavero
  alturaModelo: 0.45,

  // Valores de fábrica del panel de ajustes
  ajustes: {
    musica: true,
    volumen: 90,
    tamano: 100,
    notas: true,
    linterna: false,
    imagen: true,
    color: true,
    sensibilidad: 3,
    marco: false,
  },

  colores: {
    principal: "#c766ff",
    secundario: "#ff5c8a",
    terciario: "#ffffff",
  },
};
