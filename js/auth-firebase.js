/* =========================================================================
   auth-firebase.js — AUTENTICACIÓN CONTRA FIREBASE
   -------------------------------------------------------------------------
   Reemplaza a window.Auth (js/auth.js) cuando Firebase está activo. Si el SDK
   no carga, NO se reemplaza nada y el sitio sigue con la versión local.

   ─── QUÉ PROBLEMA RESUELVE ─────────────────────────────────────────────
   Con localStorage, una cuenta creada en un navegador NO EXISTE en otro. No
   es un fallo de la lógica de acceso: es que las cuentas viven en un almacén
   privado de cada navegador, y no hay servidor donde buscarlas. Registrarse
   en el portátil y luego intentar entrar desde el móvil daba "Incorrect email
   or password", porque ahí esa cuenta nunca se creó.

   Firebase Auth guarda las cuentas en el servidor de Google. A partir de
   aquí, el mismo correo y contraseña funcionan desde cualquier dispositivo.

   ─── LO QUE DEJA DE HACER FALTA ────────────────────────────────────────
   Todo el trabajo de hashear contraseñas con PBKDF2, el salt por usuario y
   el bloqueo por intentos fallidos se retiran aquí, no por descuido: es que
   Firebase ya lo hace en el servidor, y hacerlo dos veces solo añade sitios
   donde equivocarse. La contraseña NUNCA llega a nuestro código.
   ========================================================================= */
(function () {

  const CFG = window.APP_CONFIG || {};
  const LOCAL = window.Auth;

  if (!LOCAL) { console.error("[Auth] auth.js must load before auth-firebase.js"); return; }
  if (!window.FB || !FB.enabled) return;     // Firebase apagado: no tocamos nada

  const COMPANY_DOMAIN = CFG.COMPANY_DOMAIN || "purehomeriver.com";

  /* Traduce los códigos de error de Firebase a algo que una persona entienda.
     Los mensajes por defecto ("auth/invalid-credential") no dicen nada. */
  function friendly(err) {
    const code = (err && err.code) || "";
    switch (code) {
      case "auth/invalid-email":          return "Please enter a valid email address.";
      case "auth/email-already-in-use":   return "An account with that email already exists. Try signing in instead.";
      case "auth/weak-password":          return "That password is too weak. Use at least 10 characters.";
      case "auth/user-disabled":          return "This account has been suspended. Contact the administrator.";
      case "auth/too-many-requests":      return "Too many failed attempts. Please wait a few minutes and try again.";
      case "auth/network-request-failed": return "Network error. Check your connection and try again.";
      case "auth/popup-closed-by-user":   return "The Google window was closed before finishing.";
      case "auth/popup-blocked":          return "Your browser blocked the Google window. Allow pop-ups and try again.";
      /* Firebase devuelve el mismo código tanto si el correo no existe como
         si la contraseña es incorrecta, a propósito: así el formulario no
         revela qué correos están registrados. Mantenemos ese mensaje. */
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":         return "Incorrect email or password.";
      default:
        console.error("[Auth] Firebase error:", code, err && err.message);
        return "Something went wrong. Please try again.";
    }
  }

  function emailDomain(email) {
    return String(email || "").trim().toLowerCase().split("@")[1] || "";
  }

  /* Mismas reglas de dominio que la versión local: los Property Managers usan
     el correo de la empresa y los vendors no. */
  function roleDomainError(email, role) {
    if (DB.isAdminEmail(email)) return null;
    if (role === "pm" && emailDomain(email) !== COMPANY_DOMAIN) {
      return `Property Manager accounts must use a @${COMPANY_DOMAIN} email address.`;
    }
    if (role === "vendor" && emailDomain(email) === COMPANY_DOMAIN) {
      return `Company emails (@${COMPANY_DOMAIN}) are reserved for Property Managers. ` +
             `Vendors should register with their own business email.`;
    }
    return null;
  }

  /* Crea el documento del usuario en Firestore. El rol que se escribe aquí es
     solo informativo: el que MANDA es el custom claim del token, que solo el
     servidor puede escribir (ver tools/set-admin.js y firestore.rules). */
  async function createUserDoc(uid, email, role, name) {
    const profile = LOCAL.blankProfile(role);
    if (name) {
      if (role === "vendor") profile.contactName = name;
      else profile.fullName = name;
    }
    const doc = {
      id: uid,
      email: DB.normalizeEmail(email),
      role,
      status: "active",
      createdAt: Date.now(),
      profile
    };
    await FB.db.collection("users").doc(uid).set(doc);
    return doc;
  }

  async function loadUserDoc(uid) {
    const snap = await FB.db.collection("users").doc(uid).get();
    return snap.exists ? Object.assign({ id: uid }, snap.data()) : null;
  }

  /* Envía el correo de verificación. Es obligatorio: las reglas de Firestore
     no dejan leer el directorio sin correo verificado, y sin eso cualquiera
     podría registrarse con un correo @purehomeriver.com que no es suyo. */
  async function sendVerification(fbUser) {
    try {
      await fbUser.sendEmailVerification({ url: location.origin + "/auth.html" });
    } catch (err) {
      console.warn("[Auth] Could not send the verification email:", err);
    }
  }

  const api = Object.create(LOCAL);

  /* ─── Registro ──────────────────────────────────────────────────── */
  api.register = async function ({ email, password, role }) {
    email = DB.normalizeEmail(email);
    if (!LOCAL.validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    if (role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const pwdError = LOCAL.validatePassword(password, email);
    if (pwdError) return { ok: false, error: pwdError };

    const domainError = roleDomainError(email, role);
    if (domainError) return { ok: false, error: domainError };

    try {
      const cred = await FB.auth.createUserWithEmailAndPassword(email, password);
      const user = await createUserDoc(cred.user.uid, email, role);
      await sendVerification(cred.user);
      return { ok: true, user, needsVerification: true };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  };

  /* ─── Acceso ────────────────────────────────────────────────────── */
  api.login = async function ({ email, password }) {
    email = DB.normalizeEmail(email);
    try {
      const cred = await FB.auth.signInWithEmailAndPassword(email, password);

      let user = await loadUserDoc(cred.user.uid);
      /* Puede no existir el documento si la cuenta se creó en un intento
         anterior o desde la consola de Firebase. Se crea al vuelo para que
         nadie se quede con una cuenta a medias. */
      if (!user) user = await createUserDoc(cred.user.uid, email, "vendor");

      const token = await cred.user.getIdTokenResult();
      user.role = (token.claims && token.claims.role) || user.role;

      if (user.status === "suspended") {
        await FB.auth.signOut();
        return { ok: false, error: "This account has been suspended. Contact the administrator." };
      }

      if (!cred.user.emailVerified) {
        await sendVerification(cred.user);
        /* Y se cierra la sesión. Dejarla abierta creaba un estado a medias:
           autenticado en Firebase pero rechazado por la app. En la siguiente
           carga la página veía una sesión válida y saltaba el formulario,
           así que el usuario ni siquiera podía reintentar. */
        await FB.auth.signOut();
        return { ok: false, needsVerification: true,
          error: "Please confirm your email first. We just sent you a new link." };
      }

      return { ok: true, user };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  };

  /* ─── Acceso con Google ─────────────────────────────────────────── */
  /* Aquí SÍ se verifica el token de verdad: lo hace Firebase en el servidor,
     comprobando la firma de Google. La versión de localStorage solo podía
     leer el contenido del token y confiar en él. */
  api.signInWithGoogle = async function ({ role }) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await FB.auth.signInWithPopup(provider);
      const fbUser = cred.user;
      const email = DB.normalizeEmail(fbUser.email);

      let user = await loadUserDoc(fbUser.uid);
      let created = false;

      if (!user) {
        if (role !== "vendor" && role !== "pm") {
          await FB.auth.signOut();
          return { ok: false, needsRole: true, email,
            error: "Almost there — choose Vendor or Property Manager, then continue with Google." };
        }
        const domainError = roleDomainError(email, role);
        if (domainError) {
          await FB.auth.signOut();
          return { ok: false, error: domainError };
        }
        user = await createUserDoc(fbUser.uid, email, role, fbUser.displayName);
        created = true;
      }

      const token = await fbUser.getIdTokenResult();
      user.role = (token.claims && token.claims.role) || user.role;

      if (user.status === "suspended") {
        await FB.auth.signOut();
        return { ok: false, error: "This account has been suspended. Contact the administrator." };
      }

      return { ok: true, user, created };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  };

  api.logout = function () {
    return FB.auth.signOut();
  };

  /* Reenvío del correo de verificación, para el aviso de la página de acceso. */
  api.resendVerification = async function () {
    const u = FB.auth.currentUser;
    if (!u) return { ok: false, error: "Sign in first." };
    await sendVerification(u);
    return { ok: true };
  };

  /* Restablecer la contraseña. Con localStorage esto era imposible: no había
     forma de enviar un correo ni de comprobar que quien lo pide es el dueño. */
  api.resetPassword = async function (email) {
    email = DB.normalizeEmail(email);
    if (!LOCAL.validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    try {
      await FB.auth.sendPasswordResetEmail(email);
      // Respuesta idéntica exista o no la cuenta: no filtramos quién está registrado.
      return { ok: true };
    } catch (err) {
      if (err && err.code === "auth/user-not-found") return { ok: true };
      return { ok: false, error: friendly(err) };
    }
  };

  window.Auth = api;
})();
