/* =========================================================================
   firebase-app.js — CARGA E INICIALIZACIÓN DE FIREBASE
   -------------------------------------------------------------------------
   Este archivo NO hace nada mientras APP_CONFIG.FIREBASE.ENABLED sea false.
   Así podemos construir y probar la capa nueva sin tocar el sitio en
   funcionamiento: el interruptor es el último paso, no el primero.

   ─── POR QUÉ LA VERSIÓN "COMPAT" DEL SDK ───────────────────────────────
   Firebase v9+ se distribuye como módulos ES (import/export). Todo el sitio
   está escrito con <script> clásicos y objetos globales (DB, Auth, UI), y
   convertirlo entero a módulos sería un cambio enorme y arriesgado por una
   razón puramente de empaquetado. Las librerías "compat" exponen el mismo
   SDK como `window.firebase`, que encaja con la arquitectura actual.

   ─── POR QUÉ SE CARGA POR JAVASCRIPT Y NO CON <script> ─────────────────
   Para que el sitio siga funcionando sin conexión a Google y sin tocar los
   siete HTML. Si Firebase está apagado, estos ~300 KB no se descargan nunca.
   ========================================================================= */
window.FB = (function () {

  const CFG = (window.APP_CONFIG && window.APP_CONFIG.FIREBASE) || {};
  const VERSION = "10.14.1";
  const CDN = "https://www.gstatic.com/firebasejs/" + VERSION + "/";

  const LIBS = [
    "firebase-app-compat.js",
    "firebase-auth-compat.js",
    "firebase-firestore-compat.js"
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;          // el orden importa: app antes que auth/firestore
      s.onload = resolve;
      s.onerror = () => reject(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }

  function configLooksValid() {
    return !!(CFG.apiKey && CFG.projectId && CFG.authDomain);
  }

  /* Estado expuesto al resto de la app. */
  const state = {
    enabled: !!CFG.ENABLED,
    available: false,   // true cuando el SDK cargó y se inicializó
    error: null,
    app: null,
    auth: null,
    db: null
  };

  async function init() {
    if (!state.enabled) return state;

    if (!configLooksValid()) {
      state.error = "La configuración de Firebase está incompleta en js/config.js";
      console.error("[Firebase] " + state.error);
      return state;
    }

    try {
      for (const lib of LIBS) await loadScript(CDN + lib);

      if (!window.firebase || !firebase.initializeApp) {
        throw new Error("El SDK cargó pero no expuso window.firebase");
      }

      state.app = firebase.apps && firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp({
            apiKey: CFG.apiKey,
            authDomain: CFG.authDomain,
            projectId: CFG.projectId,
            storageBucket: CFG.storageBucket,
            messagingSenderId: CFG.messagingSenderId,
            appId: CFG.appId
          });

      state.auth = firebase.auth();
      state.db = firebase.firestore();

      /* La sesión persiste en el navegador hasta cerrar sesión
         explícitamente. Firebase gestiona la caducidad y la renovación del
         token, así que no hace falta el control manual de inactividad que
         lleva la versión de localStorage. */
      await state.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

      state.available = true;
      return state;

    } catch (err) {
      /* Fallar aquí NO debe dejar el sitio inservible: si Google no responde
         o el usuario tiene un bloqueador que corta gstatic.com, seguimos con
         la capa local en vez de mostrar una página en blanco. */
      state.error = err.message;
      console.error("[Firebase] No se pudo inicializar:", err);
      return state;
    }
  }

  const ready = init();

  return {
    ready,                                  // promesa: se resuelve con el estado
    get enabled()   { return state.enabled; },
    get available() { return state.available; },
    get error()     { return state.error; },
    get auth()      { return state.auth; },
    get db()        { return state.db; },
    get app()       { return state.app; }
  };
})();
