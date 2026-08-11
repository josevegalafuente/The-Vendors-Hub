/* =========================================================================
   verify-rules.js — comprueba que las reglas hacen lo que decimos.
   -------------------------------------------------------------------------
   Unas reglas de seguridad que nadie ha probado son una suposición. Este
   script las ataca desde fuera, como lo haría alguien intentando sacar los
   datos, y comprueba escenario por escenario quién puede leer qué.

   Crea un usuario de prueba temporal, hace las comprobaciones y lo borra.

   USO:  cd tools && node verify-rules.js
   ========================================================================= */
const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const KEY_FILE = path.join(__dirname, "firebase-service-account.json");
const key = require(KEY_FILE);
const PROJECT = key.project_id;

/* La clave web se LEE de js/config.js en vez de duplicarla aquí.

   Es pública por diseño —Firebase la sirve en el HTML de cualquier sitio que
   lo use, y quien protege los datos son las reglas de firestore.rules, no
   ocultarla—, pero tenerla escrita en dos archivos tiene dos problemas:
   al rotarla habría que acordarse de los dos sitios, y el escáner de secretos
   de GitHub la marca (no puede distinguir una clave web de Firebase de una
   clave de servidor con facturación asociada). Con una sola fuente, ninguno
   de los dos problemas existe. */
const API_KEY = (function () {
  const win = {};
  new Function("window", fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8"))(win);
  const key = win.APP_CONFIG && win.APP_CONFIG.FIREBASE && win.APP_CONFIG.FIREBASE.apiKey;
  if (!key) {
    console.error("\n❌ No hay apiKey en js/config.js → FIREBASE.apiKey\n");
    process.exit(1);
  }
  return key;
})();
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

initializeApp({ credential: cert(key) });
const auth = getAuth();

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? "  → " + extra : "")); }
}

/* Lee un documento con un token concreto (o sin token). Devuelve el código. */
async function tryRead(docPath, idToken) {
  const headers = idToken ? { Authorization: "Bearer " + idToken } : {};
  const res = await fetch(`${FS}/${docPath}`, { headers });
  return { status: res.status, body: await res.text() };
}

async function tryWrite(docPath, idToken, fields) {
  const res = await fetch(`${FS}/${docPath}`, {
    method: "PATCH",
    headers: Object.assign({ "Content-Type": "application/json" },
      idToken ? { Authorization: "Bearer " + idToken } : {}),
    body: JSON.stringify({ fields })
  });
  return { status: res.status, body: await res.text() };
}

/* Convierte un custom token en un ID token, como haría el navegador. */
async function idTokenFor(uid, claims) {
  const custom = await auth.createCustomToken(uid, claims || {});
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  const j = await res.json();
  if (!j.idToken) throw new Error("Could not obtain idToken: " + JSON.stringify(j).slice(0, 200));
  return j.idToken;
}

const TEST_EMAIL = "verificacion-temporal@example.invalid";

async function main() {
  console.log("\n══ SECURITY RULES VERIFICATION · " + PROJECT + " ══\n");

  // Limpieza por si quedó de una ejecución anterior
  try { const old = await auth.getUserByEmail(TEST_EMAIL); await auth.deleteUser(old.uid); } catch (e) {}

  const user = await auth.createUser({ email: TEST_EMAIL, password: "prueba-temporal-2026", emailVerified: false });

  try {
    console.log("── 1. NO SESSION (anyone on the internet) ──");
    let r = await tryRead("directory/chunk-000", null);
    check("cannot read the directory", r.status === 403, "HTTP " + r.status);
    check("gets no contact emails", !r.body.includes("@gmail.com"));
    r = await tryRead("directory/meta", null);
    check("cannot read the metadata", r.status === 403, "HTTP " + r.status);
    r = await tryRead("users/" + user.uid, null);
    check("cannot read accounts", r.status === 403, "HTTP " + r.status);
    r = await tryWrite("directory/chunk-000", null, { hackeado: { stringValue: "si" } });
    check("cannot write to the directory", r.status === 403, "HTTP " + r.status);

    console.log("\n── 2. SIGNED IN but EMAIL NOT VERIFIED ──");
    let token = await idTokenFor(user.uid);
    r = await tryRead("directory/chunk-000", token);
    check("still cannot read the directory", r.status === 403, "HTTP " + r.status);
    check("still gets no contact emails", !r.body.includes("@gmail.com"));

    console.log("\n── 3. SIGNED IN and EMAIL VERIFIED ──");
    await auth.updateUser(user.uid, { emailVerified: true });
    token = await idTokenFor(user.uid);
    r = await tryRead("directory/chunk-000", token);
    check("CAN read the directory", r.status === 200, "HTTP " + r.status);
    check("and sees the vendor data", r.body.includes("All Property Maintenance"));
    r = await tryWrite("directory/chunk-000", token, { hackeado: { stringValue: "si" } });
    check("but CANNOT modify it", r.status === 403, "HTTP " + r.status);

    console.log("\n── 4. SELF-PROMOTION TO ADMIN ATTEMPT ──");
    // Un usuario normal intenta escribir role:admin en su propio documento.
    r = await tryWrite("users/" + user.uid, token, {
      role: { stringValue: "admin" }, email: { stringValue: TEST_EMAIL }
    });
    check("cannot grant itself the admin role", r.status === 403, "HTTP " + r.status);

    // Y aunque falsifique el claim en el cliente, el token lo firma Google:
    // este token SÍ lleva role=admin porque lo firmamos NOSOTROS con la clave
    // de servicio. Sirve para comprobar que las reglas de admin funcionan.
    //
    // ⚠️  Se escribe en un documento DESECHABLE, nunca en uno real. Un PATCH
    //     sin `updateMask` en la API REST de Firestore REEMPLAZA el documento
    //     entero: apuntar esta prueba a directory/meta lo vaciaba.
    const adminToken = await idTokenFor(user.uid, { role: "admin" });
    r = await tryWrite("directory/__prueba-temporal", adminToken, { ok: { stringValue: "si" } });
    check("a token with role=admin (server-signed) can write", r.status === 200, "HTTP " + r.status);

    console.log("\n── 5. REVIEWS: one per property manager and vendor ──");
    const pmToken = await idTokenFor(user.uid, { role: "pm" });
    const good = `l_demo__${user.uid}`;
    r = await tryWrite("reviews/" + good, pmToken, {
      vendorId: { stringValue: "l_demo" }, pmId: { stringValue: user.uid },
      stars: { integerValue: 5 }, comment: { stringValue: "prueba" }
    });
    check("a PM can leave their review", r.status === 200, "HTTP " + r.status);

    r = await tryWrite("reviews/l_demo__otrapersona", pmToken, {
      vendorId: { stringValue: "l_demo" }, pmId: { stringValue: "otrapersona" },
      stars: { integerValue: 1 }, comment: { stringValue: "suplantación" }
    });
    check("cannot write someone else's review", r.status === 403, "HTTP " + r.status);

    r = await tryWrite("reviews/" + good, pmToken, {
      vendorId: { stringValue: "l_demo" }, pmId: { stringValue: user.uid },
      stars: { integerValue: 99 }, comment: { stringValue: "x" }
    });
    check("cannot give 99 stars", r.status === 403, "HTTP " + r.status);

    const vendorToken = await idTokenFor(user.uid, { role: "vendor" });
    r = await tryWrite("reviews/l_demo2__" + user.uid, vendorToken, {
      vendorId: { stringValue: "l_demo2" }, pmId: { stringValue: user.uid },
      stars: { integerValue: 5 }, comment: { stringValue: "me auto-reseño" }
    });
    check("a vendor cannot leave reviews", r.status === 403, "HTTP " + r.status);

    console.log("\n── 6. CLAIMS: only the admin resolves them ──");
    r = await tryWrite("claims/prueba1", vendorToken, {
      userId: { stringValue: user.uid }, ref: { stringValue: "x" },
      status: { stringValue: "pending" }, note: { stringValue: "es mío" }
    });
    check("a vendor can submit a claim", r.status === 200, "HTTP " + r.status);

    r = await tryWrite("claims/prueba2", vendorToken, {
      userId: { stringValue: user.uid }, ref: { stringValue: "x" },
      status: { stringValue: "approved" }, note: { stringValue: "me la apruebo yo" }
    });
    check("but CANNOT approve it themselves", r.status === 403, "HTTP " + r.status);

  } finally {
    // Limpieza: borrar el usuario y los documentos de prueba.
    const adminCleanup = await idTokenFor(user.uid, { role: "admin" });
    for (const p of ["reviews/l_demo__" + user.uid, "claims/prueba1",
                     "users/" + user.uid, "directory/__prueba-temporal"]) {
      await fetch(`${FS}/${p}`, { method: "DELETE", headers: { Authorization: "Bearer " + adminCleanup } });
    }
    await auth.deleteUser(user.uid);
    console.log("\n(test user and documents removed)");
  }

  console.log("\n" + "═".repeat(52));
  console.log(`  ${pass} checks passed · ${fail} failed`);
  console.log("═".repeat(52) + "\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("\n❌ " + e.message + "\n"); process.exit(1); });
