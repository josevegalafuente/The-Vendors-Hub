/* =========================================================================
   deploy-rules.js — publica firestore.rules en el proyecto.
   -------------------------------------------------------------------------
   Hace lo mismo que `firebase deploy --only firestore:rules`, pero usando la
   clave de servicio en vez del CLI de Firebase. Así no hace falta instalar
   firebase-tools ni pasar por un login interactivo en el navegador.

   Publicar reglas son dos llamadas a la API de Firebase Rules:
     1. Crear un "ruleset" (una versión inmutable del archivo).
     2. Apuntar el "release" cloud.firestore a ese ruleset.
   El paso 2 es el que lo activa. Los rulesets antiguos quedan guardados,
   así que siempre se puede volver atrás desde la consola.

   USO:
     cd tools
     node deploy-rules.js --check     <- validate syntax only, do not publish
     node deploy-rules.js             <- validate and publish
   ========================================================================= */
const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");

const RULES_FILE = path.join(__dirname, "..", "firestore.rules");
const KEY_FILE = path.join(__dirname, "firebase-service-account.json");
const checkOnly = process.argv.includes("--check");

function die(msg) { console.error("\n❌ " + msg + "\n"); process.exit(1); }

if (!fs.existsSync(KEY_FILE)) die("Missing tools/firebase-service-account.json");
if (!fs.existsSync(RULES_FILE)) die("Missing firestore.rules");

const key = require(KEY_FILE);
const PROJECT = key.project_id;
const source = fs.readFileSync(RULES_FILE, "utf8");

const auth = new GoogleAuth({
  credentials: key,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const BASE = "https://firebaserules.googleapis.com/v1";

async function api(client, method, url, body) {
  const res = await client.request({
    url, method,
    data: body,
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true
  });
  return res;
}

async function main() {
  const client = await auth.getClient();

  const ruleset = {
    source: { files: [{ name: "firestore.rules", content: source }] }
  };

  console.log(`\nProject: ${PROJECT}`);
  console.log(`File:     firestore.rules (${source.length} bytes)\n`);

  // ── 1. Crear el ruleset (aquí se valida la sintaxis) ──
  const created = await api(client, "POST", `${BASE}/projects/${PROJECT}/rulesets`, ruleset);

  if (created.status !== 200) {
    const err = created.data && created.data.error;
    console.error("❌ The rules are NOT valid:\n");
    if (err && err.details) {
      err.details.forEach(d => {
        (d.issues || []).forEach(i => {
          const loc = i.sourcePosition || {};
          console.error(`   line ${loc.line || "?"}, col ${loc.column || "?"}: ${i.description}`);
        });
      });
    } else {
      console.error("   " + (err ? err.message : JSON.stringify(created.data).slice(0, 400)));
    }
    console.error("");
    process.exit(1);
  }

  const rulesetName = created.data.name;          // projects/X/rulesets/UUID
  console.log("✓ Syntax valid. Ruleset created:");
  console.log("  " + rulesetName);

  if (checkOnly) {
    console.log("\n--check mode: nothing was published. The active rules are unchanged.\n");
    return;
  }

  // ── 2. Apuntar el release a ese ruleset (esto lo activa) ──
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  let res = await api(client, "PATCH",
    `${BASE}/${releaseName}?updateMask=rulesetName`,
    { release: { name: releaseName, rulesetName } });

  // Si el release aún no existe (proyecto recién creado), se crea.
  if (res.status === 404) {
    res = await api(client, "POST", `${BASE}/projects/${PROJECT}/releases`,
      { name: releaseName, rulesetName });
  }

  if (res.status !== 200) {
    die("Could not activate the release: " +
        JSON.stringify(res.data && res.data.error ? res.data.error.message : res.data).slice(0, 400));
  }

  console.log("\n✅ Rules PUBLISHED and active on " + PROJECT);
  console.log("   Check it at: Firebase Console → Firestore → Rules\n");
}

main().catch(e => die(e.message));
