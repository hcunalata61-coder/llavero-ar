// Ajusta el proyecto Android generado por Capacitor:
//  - permiso de cámara
//  - ícono de la app y pantalla de carga a partir de www/icono.svg
// Se ejecuta después de "npx cap add android".
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RES = "android/app/src/main/res";
const MANIFEST = "android/app/src/main/AndroidManifest.xml";
const ICONO = fs.readFileSync("www/icono.svg", "utf8");
const COLOR_MARCA = "#A100FF";
const COLOR_FONDO = "#0F1720";

// ---------- 1. Permisos ----------
let manifest = fs.readFileSync(MANIFEST, "utf8");
const permisos = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-permission android:name="android.permission.VIBRATE" />',
];
for (const p of permisos) {
  if (!manifest.includes(p)) manifest = manifest.replace("</manifest>", `    ${p}\n</manifest>`);
}
// Mantener la app en vertical (más estable para el escáner)
if (!manifest.includes("android:screenOrientation")) {
  manifest = manifest.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"');
}
fs.writeFileSync(MANIFEST, manifest);
console.log("✔ Permiso de cámara agregado");

// ---------- 1b. Música sin toque previo y pantalla siempre encendida ----------
const actividad = fs.readdirSync("android/app/src/main/java", { recursive: true })
  .map((f) => path.join("android/app/src/main/java", f)).find((f) => f.endsWith("MainActivity.java"));
if (actividad) {
  const paquete = fs.readFileSync(actividad, "utf8").match(/^package\s+([\w.]+);/m)[1];
  fs.writeFileSync(actividad, `package ${paquete};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // La pantalla no se apaga mientras escaneas
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Permite que la música suene al detectar el llavero sin tocar la pantalla
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }
    }
}
`);
  console.log("✔ MainActivity ajustada");
}

// ---------- 2. Íconos ----------
// Solo la "M" blanca, sin el cuadro morado (para el ícono adaptable)
const soloLogo = ICONO.replace(/<rect[^>]*\/>/, "");
const svgBuffer = (s) => Buffer.from(s);

async function png(svg, tam, salida, { fondo = null, margen = 0, circulo = false } = {}) {
  const interior = Math.round(tam * (1 - margen * 2));
  let img = await sharp(svgBuffer(svg), { density: 600 }).resize(interior, interior).png().toBuffer();
  const lienzo = sharp({ create: { width: tam, height: tam, channels: 4, background: fondo || { r: 0, g: 0, b: 0, alpha: 0 } } });
  let out = await lienzo.composite([{ input: img, gravity: "center" }]).png().toBuffer();
  if (circulo) {
    const mascara = Buffer.from(`<svg width="${tam}" height="${tam}"><circle cx="${tam / 2}" cy="${tam / 2}" r="${tam / 2}" fill="#fff"/></svg>`);
    out = await sharp(out).composite([{ input: mascara, blend: "dest-in" }]).png().toBuffer();
  }
  fs.writeFileSync(salida, out);
}

const densidades = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densidades)) {
  const dir = path.join(RES, `mipmap-${d}`);
  const legado = Math.round(48 * k);
  const adaptable = Math.round(108 * k);
  await png(ICONO, legado, path.join(dir, "ic_launcher.png"));
  // Redondo: fondo morado completo y la M al centro
  await png(soloLogo, legado, path.join(dir, "ic_launcher_round.png"), { fondo: COLOR_MARCA, margen: 0.16, circulo: true });
  // Adaptable: la M dentro de la zona segura (66 de 108 dp)
  await png(soloLogo, adaptable, path.join(dir, "ic_launcher_foreground.png"), { margen: 0.27 });
}
fs.writeFileSync(
  path.join(RES, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${COLOR_MARCA}</color>\n</resources>\n`
);
console.log("✔ Ícono de la app actualizado");

// ---------- 3. Pantalla de carga ----------
const splashes = fs.readdirSync(RES).filter((d) => d.startsWith("drawable"))
  .map((d) => path.join(RES, d, "splash.png")).filter((f) => fs.existsSync(f));
for (const f of splashes) {
  const { width, height } = await sharp(f).metadata();
  const lado = Math.round(Math.min(width, height) * 0.32);
  const logo = await sharp(svgBuffer(ICONO), { density: 600 }).resize(lado, lado).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 4, background: COLOR_FONDO } })
    .composite([{ input: logo, gravity: "center" }]).png().toBuffer();
  fs.writeFileSync(f, out);
}
console.log(`✔ Pantalla de carga actualizada (${splashes.length} tamaños)`);
