/* =========================================================================
   set-admin.js — asigna el rol de administrador en Firebase.
   -------------------------------------------------------------------------
   POR QUÉ EXISTE ESTE ARCHIVO

   Hoy el rol de admin se comprueba en el navegador (js/config.js →
   ADMIN_EMAILS). Eso es una sugerencia: quien sepa abrir las herramientas de
   desarrollo puede ponerse "admin" en SU equipo.

   En Firebase el rol vive en un "custom claim" dentro del token de sesión.
   Los claims SOLO se pueden escribir desde el servidor con el Admin SDK —
   que es justo lo que hace este script. Un cliente no puede modificarlos
   por ningún medio, y las reglas de firestore.rules los leen del token.
   Ahí es donde "solo yo soy administrador" pasa de ser una intención a ser
   una garantía.

   ─── CÓMO SE USA ───────────────────────────────────────────────────────
   1. La persona debe haberse registrado ya en el sitio (para que exista su
      cuenta en Firebase Auth).
   2. Descarga la clave de servicio:
        Firebase Console → ⚙ Project settings → Service accounts
        → "Generate new private key" → guarda el archivo como
          firebase-service-account.json  EN ESTA CARPETA (tools/).
      ⚠️  Ese archivo es una llave maestra de tu proyecto. Ya está en
          .gitignore. No lo subas, no lo compartas, no lo pegues en un chat.
   3. Instala la dependencia y ejecuta:
        cd tools
        npm install firebase-admin
        node set-admin.js jose.vega.lafuente@gmail.com
   4. Cierra sesión y vuelve a entrar en el sitio: el token se refresca y
      ya llevas role=admin.

   Para QUITAR el rol a alguien:
        node set-admin.js correo@ejemplo.com --remove
   Para ver quién es admin:
        node set-admin.js --list
   ========================================================================= */
const fs = require("fs");
const path = require("path");

const KEY_FILE = path.join(__dirname, "firebase-service-account.json");

function die(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

if (!fs.existsSync(KEY_FILE)) {
  die("No encuentro tools/firebase-service-account.json\n" +
      "   Descárgalo en: Firebase Console → Project settings → Service accounts\n" +
      "   → Generate new private key");
}

/* firebase-admin v13+ usa exportaciones modulares: ya no existen
   `admin.credential.cert()` ni `admin.auth()` del estilo antiguo. */
let initializeApp, cert, getAuth;
try {
  ({ initializeApp, cert } = require("firebase-admin/app"));
  ({ getAuth } = require("firebase-admin/auth"));
} catch (err) {
  die("Falta la dependencia. Ejecuta:  cd tools && npm install firebase-admin");
}

initializeApp({ credential: cert(require(KEY_FILE)) });
const auth = getAuth();

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const list = args.includes("--list");
const email = args.find(a => !a.startsWith("--"));

async function listAdmins() {
  console.log("\nAdministradores actuales:\n");
  let found = 0;
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    res.users.forEach(u => {
      if (u.customClaims && u.customClaims.role === "admin") {
        found++;
        console.log(`  • ${u.email}   (uid ${u.uid})`);
      }
    });
    pageToken = res.pageToken;
  } while (pageToken);
  if (!found) console.log("  (ninguno todavía)");
  console.log("");
}

async function main() {
  if (list) { await listAdmins(); return; }

  if (!email) {
    die("Falta el correo.\n" +
        "   Uso:  node set-admin.js correo@ejemplo.com [--remove]\n" +
        "         node set-admin.js --list");
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    die(`No existe ninguna cuenta con el correo ${email}.\n` +
        "   Esa persona debe registrarse primero en el sitio.");
  }

  const claims = Object.assign({}, user.customClaims || {});
  if (remove) delete claims.role;
  else claims.role = "admin";

  await auth.setCustomUserClaims(user.uid, claims);

  // Invalida los tokens vigentes para que el cambio surta efecto ya y no
  // dentro de una hora. Importante sobre todo al RETIRAR el rol.
  await auth.revokeRefreshTokens(user.uid);

  console.log(`\n✅ ${remove ? "Rol de admin RETIRADO a" : "Rol de admin asignado a"} ${email}`);
  console.log("   Cierra sesión y vuelve a entrar para que el token se refresque.\n");

  await listAdmins();
}

main()
  .then(() => process.exit(0))
  .catch(err => die("Error inesperado: " + err.message));
