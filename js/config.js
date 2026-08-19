/* =========================================================================
   config.js — CONFIGURACIÓN DE LA APP
   -------------------------------------------------------------------------
   Todos los "ajustes" del sitio en un solo lugar. Se carga ANTES que el resto
   de scripts, así que está disponible en todas las páginas.

   ⚠️  ESTE ARCHIVO ES PÚBLICO. Se sirve tal cual a cualquier visitante.
       NUNCA pongas aquí contraseñas, claves secretas ni "client secrets".
       Lo que hay abajo es información que puede ser pública sin riesgo.
   ========================================================================= */
window.APP_CONFIG = {

  /* ─────────────────────────────────────────────────────────────────────
     ADMINISTRADORES
     Correos que reciben el rol "admin" automáticamente al iniciar sesión.
     El admin puede: ver el panel de administración, aprobar/rechazar
     solicitudes de cuenta, cambiar roles y dar de baja vendors.

     ⚠️  Con Firebase activo, esta lista YA NO decide quién es admin de
         verdad. El rol real vive en un "custom claim" del token, que solo
         se escribe desde el servidor con tools/set-admin.js y que las
         reglas de firestore.rules comprueban. Esta lista solo sirve para
         eximir al admin de la regla de dominio al registrarse.
     ───────────────────────────────────────────────────────────────────── */
  ADMIN_EMAILS: [
    "jose.vega.lafuente@gmail.com"
  ],

  /* Dominio de la empresa. Solo los correos de este dominio pueden
     registrarse como Property Manager. */
  COMPANY_DOMAIN: "purehomeriver.com",

  /* ─────────────────────────────────────────────────────────────────────
     SIGN IN WITH GOOGLE
     El "Client ID" SÍ es público (va en el HTML de cualquier sitio que use
     Google Sign-In). El "Client Secret" NO se usa aquí y nunca debe estar
     en este archivo.

     Para obtenerlo: console.cloud.google.com → APIs & Services →
     Credentials → Create credentials → OAuth client ID → Web application.
     En "Authorized JavaScript origins" agrega los orígenes desde donde
     abres el sitio (sin la ruta y sin "/" final):
         http://localhost:5500
         http://127.0.0.1:5500
         https://thevendorshub.work
     Si lo dejas vacío, el botón de Google se oculta solo y el acceso con
     correo + contraseña sigue funcionando.
     ───────────────────────────────────────────────────────────────────── */
  GOOGLE_CLIENT_ID: "841764123921-ua6hk653o35vmg9a92nov6jgsrgokc6i.apps.googleusercontent.com",

  /* ─────────────────────────────────────────────────────────────────────
     REGLAS DE SEGURIDAD DE LA APP
     ───────────────────────────────────────────────────────────────────── */
  SECURITY: {
    // Longitud mínima de contraseña. 6 era demasiado permisivo.
    MIN_PASSWORD_LENGTH: 10,
    // Intentos fallidos seguidos antes de bloquear temporalmente el acceso.
    MAX_LOGIN_ATTEMPTS: 5,
    // Duración del bloqueo tras superar los intentos (minutos).
    LOCKOUT_MINUTES: 15,
    // La sesión caduca tras este tiempo sin actividad (minutos).
    SESSION_IDLE_MINUTES: 480,
    // Esquemas de URL permitidos en el campo "Website" de un vendor.
    // Bloquea javascript:, data:, vbscript:, file: …
    ALLOWED_URL_SCHEMES: ["http:", "https:"]
  },

  /* ─────────────────────────────────────────────────────────────────────
     LÍMITES DE ARCHIVOS
     El navegador guarda todo en localStorage (~5 MB en total), y las
     imágenes/PDF ocupan un 33 % más al convertirse a base64. Por eso los
     límites son conservadores hasta que Firebase Storage entre en juego.
     ───────────────────────────────────────────────────────────────────── */
  UPLOADS: {
    MAX_AVATAR_BYTES: 4 * 1024 * 1024, // 4 MB antes de comprimir
    AVATAR_MAX_DIMENSION: 512,       // el avatar se reescala a 512 px máx.
    AVATAR_QUALITY: 0.82,            // calidad JPEG tras comprimir
    ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"]
  },

  /* ─────────────────────────────────────────────────────────────────────
     FIREBASE — ACTIVO.
     Las cuentas y el directorio viven en Firestore, no en el navegador. Por
     eso una cuenta creada en un equipo funciona en cualquier otro: antes se
     guardaban en localStorage y no salían de ese navegador.
     Estos valores son públicos por diseño; la seguridad la dan las reglas de
     firestore.rules, no ocultar la config. Guía completa en FIREBASE.md
     ───────────────────────────────────────────────────────────────────── */
  FIREBASE: {
    // Si se pone en false, la app vuelve a localStorage sin tocar nada más.
    // Sirve como salida de emergencia si Firebase diera problemas.
    ENABLED: true,

    apiKey:            "AIzaSyC47MYPTP0ImoYVeQskaZ1olxtBnQapTYQ",
    authDomain:        "the-vendors-hub.firebaseapp.com",
    projectId:         "the-vendors-hub",
    storageBucket:     "the-vendors-hub.firebasestorage.app",
    messagingSenderId: "140873702391",
    appId:             "1:140873702391:web:51fdffba914697d4c66cf2",
    measurementId:     "G-DDW5CDSSHN"   // Analytics: opcional, no lo usamos
  }
};
