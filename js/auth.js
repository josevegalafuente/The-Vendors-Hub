/* =========================================================================
   auth.js — AUTENTICACIÓN
   -------------------------------------------------------------------------
   ⚠️  LEE ESTO ANTES DE CONFIAR EN ESTE ARCHIVO
   Este sitio funciona 100 % en el navegador, sin servidor. Eso impone un
   límite que ningún código puede superar: todas las comprobaciones de abajo
   se ejecutan en el equipo del visitante, así que alguien con conocimientos
   puede saltárselas editando su propio almacenamiento.

   Lo que SÍ conseguimos aquí:
     · Las contraseñas nunca se guardan en texto plano (PBKDF2 + salt).
     · Nadie puede entrar en una cuenta ajena sin conocer su contraseña.
     · Se frena la fuerza bruta con bloqueo por intentos.
     · No hay credenciales escritas en el código público.

   Lo que NO se puede conseguir sin servidor:
     · Impedir que alguien se dé a sí mismo el rol de administrador en SU
       navegador (no le da acceso a datos de nadie más: cada navegador tiene
       su propia copia, pero tampoco es una garantía).
     · Verificar de verdad el token de Google.
   La solución a ambos es Firebase Auth. Ver FIREBASE.md
   ========================================================================= */
window.Auth = (function(){

  const CFG = window.APP_CONFIG || {};
  const SEC = CFG.SECURITY || {};
  const COMPANY_DOMAIN = CFG.COMPANY_DOMAIN || "purehomeriver.com";
  const MIN_PASSWORD = SEC.MIN_PASSWORD_LENGTH || 10;

  /* =======================================================================
     CONTRASEÑAS
     -----------------------------------------------------------------------
     Guardamos un hash PBKDF2-SHA256 con salt aleatorio por usuario.

     ¿Por qué PBKDF2 y no SHA-256 a secas? Porque SHA-256 es RÁPIDO, y eso
     juega a favor del atacante: con una tarjeta gráfica se prueban miles de
     millones de contraseñas por segundo. PBKDF2 repite el cálculo 210.000
     veces a propósito, así que cada intento cuesta ~100 ms. La misma
     comprobación que a ti te resulta imperceptible convierte un ataque de
     minutos en uno de años.

     El prefijo del hash ("p1:", "s2:", "f1:") indica con qué algoritmo se
     generó, para poder comprobarlo igual y actualizarlo al entrar.
     ===================================================================== */
  const PBKDF2_ITERATIONS = 210000;

  function bytesToHex(buffer){
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function makeSalt(){
    const a = new Uint8Array(16);
    if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for(let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return bytesToHex(a.buffer);
  }

  /* Hash de respaldo (FNV-1a) SOLO si no hay crypto.subtle — por ejemplo al
     abrir el sitio con file://. Es débil; por eso avisamos por consola. */
  function fnv1a(str){
    let h = 0x811c9dc5;
    for(let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  async function hashPassword(password, salt){
    const enc = new TextEncoder();

    if(window.crypto && crypto.subtle && crypto.subtle.importKey){
      try{
        const key = await crypto.subtle.importKey(
          "raw", enc.encode(String(password)), { name: "PBKDF2" }, false, ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
          key, 256
        );
        return "p1:" + PBKDF2_ITERATIONS + ":" + bytesToHex(bits);
      }catch(err){
        console.warn("PBKDF2 no disponible, se usa SHA-256", err);
      }
    }

    if(window.crypto && crypto.subtle){
      const digest = await crypto.subtle.digest("SHA-256", enc.encode(salt + "::" + String(password)));
      return "s2:" + bytesToHex(digest);
    }

    console.warn("crypto.subtle no disponible (¿estás abriendo el sitio con file://?). " +
                 "Se usa un hash de respaldo mucho más débil. Abre el sitio por http:// o https://.");
    return "f1:" + fnv1a(salt + "::" + String(password));
  }

  /* Recalcula el hash con el MISMO algoritmo con el que se guardó, para
     poder comparar cuentas antiguas. */
  async function hashWithSameScheme(password, salt, storedHash){
    const enc = new TextEncoder();
    if(storedHash.indexOf("p1:") === 0){
      const iterations = parseInt(storedHash.split(":")[1], 10) || PBKDF2_ITERATIONS;
      const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), { name: "PBKDF2" }, false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" }, key, 256
      );
      return "p1:" + iterations + ":" + bytesToHex(bits);
    }
    if(storedHash.indexOf("s2:") === 0){
      const digest = await crypto.subtle.digest("SHA-256", enc.encode(salt + "::" + String(password)));
      return "s2:" + bytesToHex(digest);
    }
    return "f1:" + fnv1a(salt + "::" + String(password));
  }

  /* Comparación en tiempo constante: no revela por cuánto se falló.
     (Detalle fino, pero es gratis hacerlo bien.) */
  function safeEqual(a, b){
    const s1 = String(a), s2 = String(b);
    if(s1.length !== s2.length) return false;
    let diff = 0;
    for(let i = 0; i < s1.length; i++) diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
    return diff === 0;
  }

  async function verifyPassword(user, password){
    if(!user.passwordHash || !user.salt) return false;
    const candidate = await hashWithSameScheme(password, user.salt, user.passwordHash);
    if(!safeEqual(candidate, user.passwordHash)) return false;

    // Si la cuenta usaba un algoritmo antiguo, la actualizamos ahora que
    // tenemos la contraseña correcta a mano.
    if(user.passwordHash.indexOf("p1:") !== 0){
      const salt = makeSalt();
      const passwordHash = await hashPassword(password, salt);
      DB.updateUser(user.id, { salt, passwordHash });
    }
    return true;
  }

  /* =======================================================================
     VALIDACIONES
     ===================================================================== */
  function validateEmail(email){
    const e = String(email || "").trim();
    return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  }

  function emailDomain(email){
    return DB.normalizeEmail(email).split("@")[1] || "";
  }

  /* Comprueba la fuerza de la contraseña. Devuelve un mensaje de error o null.
     No exigimos símbolos raros (empujan a la gente a "Password1!" y a
     apuntarla en un papel): pedimos LONGITUD, que es lo que de verdad
     protege, y descartamos las más obvias. */
  const COMMON_PASSWORDS = [
    "password", "12345678", "123456789", "1234567890", "qwerty", "letmein",
    "welcome", "admin", "changeme", "iloveyou", "abc123", "password1",
    "vendorhub", "thevendorshub", "demo123", "contraseña"
  ];

  function validatePassword(password, email){
    const p = String(password || "");
    if(p.length < MIN_PASSWORD){
      return `Password must be at least ${MIN_PASSWORD} characters.`;
    }
    if(p.length > 200) return "Password is too long (200 characters max).";

    const lower = p.toLowerCase();
    if(COMMON_PASSWORDS.some(c => lower === c || lower.indexOf(c) === 0)){
      return "That password is too common. Please choose something harder to guess.";
    }
    if(email){
      const local = DB.normalizeEmail(email).split("@")[0];
      if(local && local.length >= 3 && lower.indexOf(local) > -1){
        return "Your password should not contain your email address.";
      }
    }
    if(/^(.)\1+$/.test(p)) return "Your password cannot be a single repeated character.";
    return null;
  }

  /* URL segura: bloquea javascript:, data:, vbscript:, file:…
     Sin esto, un vendor podía poner `javascript:…` en su campo "Website" y
     el código se ejecutaba cuando un Property Manager pulsaba "Visit
     website". Es un XSS almacenado de manual. */
  const ALLOWED_SCHEMES = SEC.ALLOWED_URL_SCHEMES || ["http:", "https:"];

  function sanitizeUrl(raw){
    const s = String(raw || "").trim();
    if(!s) return null;
    // Sin esquema explícito asumimos https:// (lo normal en "midominio.com")
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) ? s : "https://" + s;
    try{
      const url = new URL(withScheme);
      if(ALLOWED_SCHEMES.indexOf(url.protocol) === -1) return null;
      if(!url.hostname || url.hostname.indexOf(".") === -1) return null;
      return url.href;
    }catch(err){
      return null;
    }
  }

  /* Perfil vacío según el rol. */
  function blankProfile(role){
    return role === "vendor" ? {
      businessName: "", contactName: "", addressLine: "", city: "", state: "",
      zip: "", phone: "", website: "", about: "", yearsActive: "", employees: "",
      license: "", vendorMeldName: "",
      avatar: null,         // base64 o null
      licenses: [],         // documentos adjuntos
      services: [],         // nombres de servicio
      coverage: {}          // { estado: { mode, counties } }
    } : {
      fullName: "",
      company: ""
    };
  }

  /* Reglas de dominio de la empresa:
       · Property Managers DEBEN usar un correo @purehomeriver.com
       · Vendors son externos: NO pueden usar el correo de la empresa
     El administrador queda exento (su correo se define en config.js). */
  function roleDomainError(email, role){
    if(DB.isAdminEmail(email)) return null;
    if(role === "pm" && emailDomain(email) !== COMPANY_DOMAIN){
      return `Property Manager accounts must use a @${COMPANY_DOMAIN} email address.`;
    }
    if(role === "vendor" && emailDomain(email) === COMPANY_DOMAIN){
      return `Company emails (@${COMPANY_DOMAIN}) are reserved for Property Managers. ` +
             `Vendors should register with their own business email.`;
    }
    return null;
  }

  /* El rol efectivo: si el correo está en ADMIN_EMAILS, manda "admin". */
  function effectiveRole(email, requestedRole){
    return DB.isAdminEmail(email) ? "admin" : requestedRole;
  }

  /* =======================================================================
     REGISTRO
     ===================================================================== */
  async function register({ email, password, role }){
    // ⚠️  CORRECCIÓN IMPORTANTE: el correo se normaliza a minúsculas ANTES
    // de guardarlo. Antes se guardaba tal cual lo escribía el usuario, pero
    // la búsqueda sí normalizaba, así que quien se registraba como
    // "Jose@Empresa.com" NO PODÍA VOLVER A ENTRAR NUNCA y además podía
    // crear cuentas duplicadas.
    email = DB.normalizeEmail(email);

    if(!validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const pwdError = validatePassword(password, email);
    if(pwdError) return { ok: false, error: pwdError };

    const domainError = roleDomainError(email, role);
    if(domainError) return { ok: false, error: domainError };

    if(DB.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    const finalRole = effectiveRole(email, role);

    const user = {
      id: DB.genId("u"),
      email,
      salt,
      passwordHash,
      role: finalRole,
      status: "active",
      createdAt: Date.now(),
      reviews: [],
      profile: blankProfile(finalRole === "admin" ? "pm" : finalRole)
    };

    // createUser vuelve a comprobar duplicados al escribir, para que dos
    // pestañas a la vez no puedan crear la misma cuenta.
    if(!DB.createUser(user)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    DB.setSession(user.id, user.role);
    DB.logAction(user, "account.register", { role: user.role });
    return { ok: true, user };
  }

  /* =======================================================================
     INICIO DE SESIÓN
     ===================================================================== */
  async function login({ email, password }){
    email = DB.normalizeEmail(email);

    const lockedMinutes = DB.isLockedOut(email);
    if(lockedMinutes){
      return { ok: false, error: `Too many failed attempts. Try again in ${lockedMinutes} minute${lockedMinutes === 1 ? "" : "s"}.` };
    }

    const user = DB.findUserByEmail(email);

    /* Mensaje deliberadamente genérico y con el mismo coste en tiempo tanto
       si la cuenta existe como si no: así nadie puede usar el formulario
       para averiguar qué correos están registrados. */
    if(!user){
      await hashPassword(String(password || ""), makeSalt());   // gasta el mismo tiempo
      DB.registerFailedLogin(email);
      return { ok: false, error: "Incorrect email or password." };
    }

    if(user.status === "suspended"){
      return { ok: false, error: "This account has been suspended. Contact the administrator." };
    }

    if(user.provider === "google" && !user.passwordHash){
      return { ok: false, error: "This account uses Google sign-in. Use the “Sign in with Google” button." };
    }

    if(user.disabled || !user.passwordHash){
      return { ok: false, error: "This account has no password set. Please register or use Google sign-in." };
    }

    const valid = await verifyPassword(user, password);
    if(!valid){
      DB.registerFailedLogin(email);
      return { ok: false, error: "Incorrect email or password." };
    }

    DB.clearFailedLogins(email);

    // Si el correo está en la lista de administradores, el rol se corrige al
    // entrar (por si la cuenta se creó antes de añadirlo a config.js).
    const shouldBeAdmin = DB.isAdminEmail(email);
    if(shouldBeAdmin && user.role !== "admin"){
      DB.updateUser(user.id, { role: "admin" });
      user.role = "admin";
    } else if(!shouldBeAdmin && user.role === "admin"){
      // Se quitó de ADMIN_EMAILS → deja de ser admin.
      DB.updateUser(user.id, { role: "pm" });
      user.role = "pm";
    }

    DB.setSession(user.id, user.role);
    DB.updateUser(user.id, { lastLoginAt: Date.now() });
    return { ok: true, user };
  }

  /* =======================================================================
     SIGN IN WITH GOOGLE
     Google nos entrega un correo YA VERIFICADO. Si existe la cuenta,
     entramos; si no, hace falta el ROL para crearla.

     ⚠️  La firma del token NO se verifica aquí (no se puede sin servidor).
         Comprobamos lo que sí podemos: destinatario, caducidad, emisor y
         que el correo esté verificado. Con Firebase Auth esta verificación
         pasa a hacerse en el servidor, como debe ser.
     ===================================================================== */
  function registerWithGoogle({ email, role, name }){
    email = DB.normalizeEmail(email);
    if(!validateEmail(email)) return { ok: false, error: "Google did not return a valid email address." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const domainError = roleDomainError(email, role);
    if(domainError) return { ok: false, error: domainError };

    if(DB.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    const finalRole = effectiveRole(email, role);
    const profile = blankProfile(finalRole === "admin" ? "pm" : finalRole);
    if(name){
      if(finalRole === "vendor") profile.contactName = name;
      else profile.fullName = name;
    }

    const user = {
      id: DB.genId("u"),
      email,
      salt: null,
      passwordHash: null,   // sin contraseña: esta cuenta entra con Google
      provider: "google",
      role: finalRole,
      status: "active",
      createdAt: Date.now(),
      reviews: [],
      profile
    };

    if(!DB.createUser(user)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    DB.setSession(user.id, user.role);
    DB.logAction(user, "account.register", { role: user.role, provider: "google" });
    return { ok: true, user };
  }

  function signInWithGoogle({ email, name, role }){
    email = DB.normalizeEmail(email);
    if(!validateEmail(email)) return { ok: false, error: "Google did not return a valid email address." };

    const existing = DB.findUserByEmail(email);
    if(existing){
      if(existing.status === "suspended"){
        return { ok: false, error: "This account has been suspended. Contact the administrator." };
      }
      const shouldBeAdmin = DB.isAdminEmail(email);
      if(shouldBeAdmin && existing.role !== "admin"){
        DB.updateUser(existing.id, { role: "admin" });
        existing.role = "admin";
      }
      DB.setSession(existing.id, existing.role);
      DB.updateUser(existing.id, { lastLoginAt: Date.now() });
      return { ok: true, user: existing, created: false };
    }

    if(role !== "vendor" && role !== "pm"){
      return { ok: false, needsRole: true, email,
        error: "Almost there — choose Vendor or Property Manager, then continue with Google." };
    }

    const result = registerWithGoogle({ email, role, name });
    if(result.ok) result.created = true;
    return result;
  }

  function logout(){
    const user = DB.getCurrentUser();
    if(user) DB.logAction(user, "account.logout", {});
    DB.clearSession();
  }

  /* =======================================================================
     GUARDS DE PÁGINA
     Redirige si no hay sesión o el rol no corresponde.
     Diseñado para NO poder entrar en bucle infinito.
     ===================================================================== */
  function homeForRole(role){
    if(role === "admin")  return "admin.html";
    if(role === "vendor") return "vendor-dashboard.html";
    return "markets.html";
  }

  const VALID_ROLES = ["vendor", "pm", "admin"];

  /* `roles` acepta un string o un arreglo. El admin entra en todas partes. */
  function requireRole(roles, redirectTo){
    const allowed = Array.isArray(roles) ? roles : [roles];
    const user = DB.getCurrentUser();

    // 1) Sin sesión (o caducada) → a la página de acceso.
    if(!user){
      window.location.replace(redirectTo || "auth.html");
      return null;
    }

    // 2) Cuenta suspendida por el administrador → fuera.
    if(user.status === "suspended"){
      DB.clearSession();
      window.location.replace("auth.html?suspended=1");
      return null;
    }

    // 3) Rol correcto (o admin, que puede verlo todo) → adelante.
    if(allowed.indexOf(user.role) > -1 || user.role === "admin") return user;

    // 4) Con sesión pero rol distinto y VÁLIDO → a SU propia página de
    //    inicio (no a auth.html, para no rebotar en bucle).
    if(VALID_ROLES.indexOf(user.role) > -1){
      window.location.replace(homeForRole(user.role));
      return null;
    }

    // 5) Rol desconocido o corrupto → cerramos sesión y a auth.
    //    Es terminal: en la próxima carga ya no habrá sesión.
    DB.clearSession();
    window.location.replace(redirectTo || "auth.html");
    return null;
  }

  /* Solo administradores. */
  function requireAdmin(){
    const user = DB.getCurrentUser();
    if(!user){ window.location.replace("auth.html"); return null; }
    if(user.role !== "admin"){ window.location.replace(homeForRole(user.role)); return null; }
    return user;
  }

  return {
    register, login, logout,
    signInWithGoogle,
    requireRole, requireAdmin, homeForRole,
    validateEmail, validatePassword, sanitizeUrl,
    blankProfile,
    COMPANY_DOMAIN, MIN_PASSWORD
  };
})();
