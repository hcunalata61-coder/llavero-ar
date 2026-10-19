// ============================================================
//  AJUSTES DE LA APP LLAVERO AR
//  Cambia aquí el llavero incluido, su música y su modelo 3D.
// ============================================================

export const CONFIG = {
  titulo: "Llavero AR",

  // Llavero que viene incluido en la app
  llaveroIncluido: {
    nombre: "Cocodrilo",
    miniatura: "llaveros/cocodrilo/miniatura.jpg",
    // Marcador con 2 vistas del llavero (desde arriba e inclinado)
    marcador: "llaveros/cocodrilo/cocodrilo.mind",
    vistas: 2,
    // Música: enlace de tu hosting (necesita internet) o archivo dentro de www/
    musica: "https://taynastudio.com/wp-content/uploads/2026/07/AUD-20260727-WA0018.mp3",
    // Modelo 3D que aparece sobre el llavero
    modelo: "llaveros/cocodrilo/corazon.glb",
  },

  // Modelo 3D para "Mi llavero" (el que configuras con fotos dentro de la app)
  modeloMiLlavero: "llaveros/cocodrilo/corazon.glb",

  // Tamaño del modelo respecto al ancho del llavero (1 = mismo ancho)
  escalaModelo: 0.85,
  // Altura a la que flota el modelo sobre el llavero
  alturaModelo: 0.45,

  // Mostrar notas musicales y aro alrededor del modelo
  notasMusicales: true,

  volumen: 0.9,
  // ¿Seguir sonando aunque se pierda el llavero de vista?
  seguirSonando: false,

  colores: {
    principal: "#c766ff",
    secundario: "#ff5c8a",
    terciario: "#ffffff",
  },
};
