/* =========================================================================
   bump-version.js — sella los archivos locales con un número de versión
   -------------------------------------------------------------------------
   QUÉ PROBLEMA RESUELVE

   GitHub Pages sirve todo con `Cache-Control: max-age=600`: HTML, JavaScript
   y CSS se cachean DIEZ MINUTOS cada uno POR SEPARADO. Eso abre una ventana
   en la que el navegador puede tener el HTML nuevo y el JavaScript viejo a
   la vez.

   No es teórico: al quitar la zona de subida de licencias, el HTML dejó de
   tener el elemento #licenseDrop, pero los navegadores que aún tenían el JS
   anterior en caché seguían intentando enlazarlo. Eso lanza un TypeError que
   corta la ejecución, y las secciones que se pintaban DESPUÉS —los servicios
   y el selector de códigos postales— se quedaban vacías. La página parecía
   rota sin ningún mensaje de error visible.

   LA SOLUCIÓN
   Añadir ?v=<sello> a cada archivo local. Al cambiar el sello, la URL cambia,
   y el navegador está obligado a descargar la versión que corresponde a ese
   HTML. Se acabaron las mezclas.

   USO — ejecútalo ANTES de cada commit que toque html/js/css:
       node tools/bump-version.js

   Solo toca rutas locales (js/, css/, data/). Las externas —las fuentes de
   Google, el SDK de Firebase— se quedan como están.
   ========================================================================= */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Sello legible: aaaammddhhmm en UTC. Ordenable y fácil de comparar a ojo
// con la fecha de un commit cuando haya que depurar algo.
function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
         p(d.getUTCHours()) + p(d.getUTCMinutes());
}

const VERSION = process.argv[2] || stamp();
const LOCAL = /^(js|css|data)\//;

const files = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
let touched = 0, refs = 0;

files.forEach(file => {
  const full = path.join(ROOT, file);
  const before = fs.readFileSync(full, "utf8");

  const after = before.replace(
    /(src|href)="((?:js|css|data)\/[^"?]+)(\?v=[^"]*)?"/g,
    (m, attr, url) => { refs++; return `${attr}="${url}?v=${VERSION}"`; }
  );

  if (after !== before) {
    fs.writeFileSync(full, after, "utf8");
    touched++;
  }
});

console.log(`\nVersión: ${VERSION}`);
console.log(`  archivos HTML actualizados: ${touched} de ${files.length}`);
console.log(`  referencias selladas      : ${refs}`);
console.log("\nRecuerda commitear los HTML para que el sello llegue al sitio.\n");
