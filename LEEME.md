# Llavero AR — app Android de prueba

App de realidad aumentada para tus llaveros impresos en 3D. Al apuntar la cámara al
**llavero del cocodrilo** aparece el **corazón 3D** con notas musicales y suena tu canción.
Todo funciona dentro del celular: no hace falta subir nada a un servidor
(solo la música necesita internet, porque viene de tu enlace).

---

## Cómo obtener la APK con GitHub (sin instalar nada)

GitHub compila la APK por ti en unos 5–8 minutos.

### 1. Crear el repositorio
1. Entra a <https://github.com> con tu usuario **hcunalata61-coder**.
2. Arriba a la derecha toca **+** → **New repository**.
3. Nombre: `llavero-ar`. Déjalo **Public** (o Private, también funciona).
   No marques ninguna casilla de README. Toca **Create repository**.

### 2. Subir los archivos
1. Descomprime `llavero-ar-app.zip` en tu computadora.
2. En la página del repositorio nuevo toca el enlace **uploading an existing file**.
3. Abre la carpeta `llavero-ar-app`, **selecciona todo su contenido**
   (las carpetas `www`, `scripts`, `.github` y los archivos sueltos) y arrástralo a la página.
   > Sube el **contenido** de la carpeta, no la carpeta misma.
4. Abajo toca **Commit changes**.

> **Si no se subió la carpeta `.github`** (algunos sistemas ocultan las carpetas que empiezan con punto):
> en el repositorio toca **Add file → Create new file**, escribe como nombre
> `.github/workflows/compilar-apk.yml`, pega el contenido del archivo
> `compilar-apk.yml` que va incluido en el zip dentro de `.github/workflows/`, y toca **Commit changes**.

### 3. Esperar la compilación
1. Abre la pestaña **Actions** del repositorio.
2. Verás **Compilar APK** con un círculo amarillo (en proceso). Espera a que se ponga en ✅ verde.
   Si sale ❌ rojo, ábrelo y envíame una captura del error.

### 4. Descargar e instalar en el celular
1. Desde el **celular**, abre tu repositorio en GitHub → sección **Releases** (a la derecha o abajo).
2. Abre **Llavero AR · prueba 1** y descarga **LlaveroAR.apk**.
3. Ábrela. Android pedirá permitir **"Instalar apps de origen desconocido"** para el navegador: acéptalo.
4. Abre **Llavero AR**, toca **Escanear** y permite la cámara.

---

## Cómo usar la app

- **Cocodrilo** (incluido): apunta la cámara al llavero, desde arriba o un poco inclinado,
  con buena luz. Aparece el corazón y suena la música.
- **Mi llavero**: para probar otros llaveros sin recompilar.
  1. Toca **Configurar mi llavero**.
  2. **Tomar foto** → encuadra solo el llavero con el dedo y el zoom → **Usar esta vista**.
     Para llaveros en 3D agrega 2 o 3 vistas (arriba, inclinado…).
  3. Elige la música: del celular, de ejemplo o pegando un enlace `https://…mp3`.
  4. **Generar y guardar**. Queda guardado en el celular.

## Consejos para que lo reconozca rápido
- Buena luz, sin reflejos fuertes.
- Que el llavero ocupe buena parte de la pantalla.
- Mantén la pose parecida a la de las fotos (el cocodrilo es articulado: si lo doblas mucho cuesta más).
- Fondo distinto al llavero (en mesa de madera funciona bien).

## Cambiar el llavero, la música o el modelo 3D incluidos
Edita `www/config.js` en GitHub (ábrelo y toca el lápiz ✏️). Al guardar, GitHub compila
una APK nueva sola en **Releases**.

| Qué | Dónde |
|---|---|
| Enlace de la música | `musica:` dentro de `llaveroIncluido` |
| Modelo 3D | sube el `.glb` a `www/llaveros/…` y cambia `modelo:` |
| Tamaño y altura del modelo | `escalaModelo`, `alturaModelo` |
| Notas musicales y aro | `notasMusicales: true / false` |

Para cambiar el **ícono**, reemplaza `www/icono.svg`.

## Qué hay en el proyecto
| Archivo | Para qué sirve |
|---|---|
| `www/` | La app (pantallas, escáner AR, librerías incluidas para funcionar sin internet). |
| `www/config.js` | Ajustes: música, modelo, tamaños, colores. |
| `www/llaveros/cocodrilo/` | Marcador del cocodrilo (2 vistas), fotos y el corazón `.glb`. |
| `scripts/preparar-android.mjs` | Agrega el permiso de cámara, tu ícono y la pantalla de carga. |
| `.github/workflows/compilar-apk.yml` | Receta para que GitHub compile la APK. |

Tecnología: Capacitor 8 (app Android), MindAR 1.2.5 (reconocimiento de imagen), three.js 0.160 (3D).
