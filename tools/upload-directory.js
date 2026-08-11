/* =========================================================================
   upload-directory.js — sube el directorio de vendors a Firestore.
   -------------------------------------------------------------------------
   QUÉ RESUELVE ESTE SCRIPT

   Los correos de los 1.179 vendors están hoy en un archivo local
   (data/vendors-contacts.local.js) que no se publica. Funciona, pero es
   frágil: solo existen en tu equipo y no se pueden usar desde el sitio.

   Al subirlos a Firestore quedan protegidos por firestore.rules
   (`allow read: if signedIn()`): solo los ve quien ha iniciado sesión, la
   comprobación la hace el servidor de Google, y no hay ningún archivo
   descargable. Ahí el problema queda cerrado de verdad.

   ─── FORMATO EN FIRESTORE ──────────────────────────────────────────────
   Para no gastar 1.179 lecturas por visita (el plan gratuito da 50.000 al
   día, o sea ~42 visitas), el directorio NO se guarda como un documento por
   vendor. Se guarda troceado:

     directory/meta            → { version, chunks, count, updatedAt }
     directory/chunk-000 …     → { items: [ …150 vendors… ] }

   Así una visita cuesta ~9 lecturas en vez de 1.179, y el cliente puede
   cachear por `version` y no volver a pedir nada hasta que cambie.

   Las reseñas y las reclamaciones NO van aquí: son datos vivos y se
   escriben desde la app, cada una en su propia colección.

   ─── CÓMO SE USA ───────────────────────────────────────────────────────
     cd tools
     npm install firebase-admin
     node upload-directory.js --dry-run     ← primero SIEMPRE en seco
     node upload-directory.js               ← sube de verdad

   Necesita tools/firebase-service-account.json (ver set-admin.js).
   ========================================================================= */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const KEY_FILE = path.join(__dirname, "firebase-service-account.json");
const CHUNK_SIZE = 150;

const dryRun = process.argv.includes("--dry-run");

function die(msg) { console.error("\n❌ " + msg + "\n"); process.exit(1); }

/* ---------- 1. Leer los datos locales ---------- */
function loadWindowFile(relPath, globalName) {
  const file = path.join(ROOT, relPath);
  if (!fs.existsSync(file)) return null;
  const win = {};
  new Function("window", fs.readFileSync(file, "utf8"))(win);
  return win[globalName];
}

const markets = loadWindowFile("data/markets.js", "MARKETS") || {};
const vendors = loadWindowFile("data/vendors-data.js", "IMPORTED_VENDORS");
if (!Array.isArray(vendors) || !vendors.length) {
  die("Could not read data/vendors-data.js");
}

const contacts = loadWindowFile("data/vendors-contacts.local.js", "VENDOR_CONTACTS") || {};
const categories = loadWindowFile("data/services.js", "VENDOR_CATEGORIES") || [];

function servicesForCategory(catId) {
  const c = categories.find(x => x.id === catId);
  return c ? c.services.slice() : [];
}

/* Todos los ZIP que la empresa gestiona en un estado. La ficha importada solo
   trae estados, así que su cobertura inicial son todos los ZIP de ese estado;
   el vendor la afina luego desde su perfil. */
function zipsForState(abbr) {
  const out = [];
  Object.values(markets).forEach(m => {
    Object.values(m.counties).forEach(info => {
      if (info.state !== abbr) return;
      Object.values(info.cities).forEach(list => out.push(...list));
    });
  });
  return Array.from(new Set(out));
}

/* ---------- 2. Construir los documentos ---------- */
const items = vendors.map(v => {
  const states = Array.isArray(v.states) ? v.states : [];
  const zips = [];
  states.forEach(s => zips.push(...zipsForState(s)));
  return {
    ref: v.ref,
    name: v.name || "",
    meld: v.meld || v.name || "",
    cat: v.cat || "",
    states,
    zips: Array.from(new Set(zips)).sort(),
    services: servicesForCategory(v.cat),
    email: (contacts[v.ref] || "").trim().toLowerCase() || null,
    claimedBy: null,
    hidden: false
  };
});

const withEmail = items.filter(i => i.email).length;
const chunks = [];
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  chunks.push(items.slice(i, i + CHUNK_SIZE));
}

console.log("\n─── Summary ─────────────────────────────────");
console.log(`  Vendors:            ${items.length}`);
console.log(`  With email:         ${withEmail}`);
console.log(`  Without email:      ${items.length - withEmail}`);
console.log(`  Chunks to write:    ${chunks.length} (+1 metadata)`);
console.log(`  Reads per visit:    ~${chunks.length + 1} instead of ${items.length}`);
console.log("─────────────────────────────────────────────\n");

if (withEmail === 0) {
  console.log("⚠️  No contact emails loaded. If you expected 1,179, check that");
  console.log("    data/vendors-contacts.local.js exists\n");
}

if (dryRun) {
  console.log("--dry-run mode: nothing was written to Firestore.");
  console.log("Example of the first vendor that would be uploaded:\n");
  console.log(JSON.stringify(items[0], null, 2));
  console.log("\nIf it looks right, run again without --dry-run.\n");
  process.exit(0);
}

/* ---------- 3. Subir ---------- */
if (!fs.existsSync(KEY_FILE)) {
  die("Cannot find tools/firebase-service-account.json\n" +
      "   Firebase Console → Project settings → Service accounts → Generate new private key");
}

/* firebase-admin v13+ usa exportaciones modulares. */
let initializeApp, cert, getFirestore, FieldValue;
try {
  ({ initializeApp, cert } = require("firebase-admin/app"));
  ({ getFirestore, FieldValue } = require("firebase-admin/firestore"));
} catch (err) { die("Run:  cd tools && npm install firebase-admin"); }

initializeApp({ credential: cert(require(KEY_FILE)) });
const db = getFirestore();

async function main() {
  const version = Date.now();
  const batch = db.batch();

  chunks.forEach((chunk, i) => {
    const id = "chunk-" + String(i).padStart(3, "0");
    batch.set(db.collection("directory").doc(id), { items: chunk, version });
  });

  batch.set(db.collection("directory").doc("meta"), {
    version,
    chunks: chunks.length,
    count: items.length,
    withEmail,
    updatedAt: FieldValue.serverTimestamp()
  });

  await batch.commit();

  console.log(`✅ Uploaded ${items.length} vendors in ${chunks.length} chunks (version ${version}).\n`);
  console.log("Next steps:");
  console.log("  1. firebase deploy --only firestore:rules");
  console.log("  2. In Firestore → Rules → Playground, confirm that a user");
  console.log("     WITHOUT a session cannot read 'directory'.");
  console.log("  3. Once the site reads from Firestore, you can delete from the repo");
  console.log("     data/vendors-data.js y data/vendors-contacts.local.js\n");
}

main()
  .then(() => process.exit(0))
  .catch(err => die("Upload error: " + err.message));
