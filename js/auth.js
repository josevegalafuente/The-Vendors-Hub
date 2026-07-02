/* =========================================================================
   Authentication
   NOTE: This is a client-side demo. In production, you would:
   - Hash passwords on a backend (bcrypt/argon2)
   - Use HTTP-only cookies / JWT
   - Verify emails, rate-limit, etc.
   For this prototype, credentials are stored in localStorage.
   ========================================================================= */
window.Auth = (function(){

  // ───────────────────────────────────────────────────────────────
  // Dominio de la empresa. Solo correos que terminen en este dominio
  // pueden registrarse como Property Manager. Si algún día cambian de
  // dominio, se edita AQUÍ en un solo lugar.
  // ⚠️  Esto es una "puerta blanda" (validación en el navegador). La
  //     seguridad REAL se aplicará en la Fase B con Firebase.
  // ───────────────────────────────────────────────────────────────
  const COMPANY_DOMAIN = "purehomeriver.com";

  function genId(){
    return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function validateEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ───────────────────────────────────────────────────────────────
  // CONTRASEÑAS — nunca se guardan en texto plano.
  // Guardamos un HASH (SHA-256) + un "salt" aleatorio por usuario.
  // Así, aunque alguien abra el almacenamiento del navegador, no puede
  // leer la contraseña original.
  //
  // ⚠️  Aclaración honesta: esto es un sitio 100% en el navegador (sin
  //     servidor). El hashing evita el texto plano, pero la seguridad REAL
  //     (proteger contra alguien con acceso al equipo, fuerza bruta, etc.)
  //     requiere un backend. La Fase B con Firebase Auth es el paso correcto.
  // ───────────────────────────────────────────────────────────────
  function bytesToHex(buffer){
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Salt aleatorio de 16 bytes (usa el generador seguro del navegador si existe).
  function makeSalt(){
    const a = new Uint8Array(16);
    if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for(let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return bytesToHex(a.buffer);
  }

  // Hash simple (FNV-1a) SOLO como respaldo si no hay crypto.subtle
  // (por ejemplo al abrir con file://). Sigue siendo mejor que texto plano.
  function fnv1a(str){
    let h = 0x811c9dc5;
    for(let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  // Devuelve una promesa con el hash de la contraseña usando el salt dado.
  // El prefijo ("s2:"/"f1:") indica el algoritmo para que al iniciar sesión
  // se compare exactamente igual.
  async function hashPassword(password, salt){
    const input = salt + "::" + String(password);
    if(window.crypto && crypto.subtle){
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      return "s2:" + bytesToHex(digest);
    }
    console.warn("crypto.subtle no disponible (¿file://?). Usando hash de respaldo.");
    return "f1:" + fnv1a(input);
  }

  // Verifica una contraseña contra un usuario. Soporta cuentas nuevas (hash)
  // y cuentas antiguas con `password` en texto plano (y las migra a hash).
  async function verifyPassword(user, password){
    if(user.passwordHash){
      const h = await hashPassword(password, user.salt);
      return h === user.passwordHash;
    }
    // Cuenta antigua con texto plano → validar y, si coincide, migrar a hash.
    if(user.password != null){
      const ok = user.password === password;
      if(ok){
        const salt = makeSalt();
        const passwordHash = await hashPassword(password, salt);
        Storage.updateUser(user.id, { salt, passwordHash, password: null });
      }
      return ok;
    }
    return false;
  }

  // Migración única al cargar: convierte CUALQUIER contraseña en texto plano
  // que quede en el almacenamiento (cuentas demo, importadas o antiguas) a
  // hash + salt. Después de correr una vez, no vuelve a hacer nada.
  async function migratePlaintextPasswords(){
    const users = Storage.getUsers();
    let changed = false;
    for(const u of users){
      if(u && u.password != null && !u.passwordHash){
        u.salt = makeSalt();
        u.passwordHash = await hashPassword(u.password, u.salt);
        u.password = null;
        changed = true;
      }
    }
    if(changed) Storage.saveUsers(users);
  }

  // Devuelve el dominio del correo en minúsculas. "a@PureHomeRiver.com" → "purehomeriver.com"
  function emailDomain(email){
    return String(email || "").trim().toLowerCase().split("@")[1] || "";
  }

  // Perfil vacío según el rol. Lo usan tanto el registro normal como el de Google.
  function blankProfile(role){
    return role === "vendor" ? {
      businessName: "",
      contactName: "",
      addressLine: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      website: "",
      about: "",
      yearsActive: "",
      employees: "",
      license: "",
      avatar: null,         // base64 or null
      services: [],         // array of service names
      coverage: {}          // { stateAbbr: { mode: 'full'|'partial', counties: { 'County Name': ['City1','City2'] } } }
    } : {
      fullName: "",
      company: ""
    };
  }

  // Aplica las reglas de dominio de la empresa. Devuelve un string de error o null si todo bien.
  //  - Property Managers DEBEN usar un correo @purehomeriver.com
  //  - Vendors son externos: NO pueden usar el correo de la empresa
  function roleDomainError(email, role){
    if(role === "pm" && emailDomain(email) !== COMPANY_DOMAIN){
      return `Property Manager accounts must use a @${COMPANY_DOMAIN} email address.`;
    }
    if(role === "vendor" && emailDomain(email) === COMPANY_DOMAIN){
      return `Company emails (@${COMPANY_DOMAIN}) are reserved for Property Managers. Vendors should register with their own business email.`;
    }
    return null;
  }

  async function register({ email, password, role }){
    email = (email || "").trim();
    if(!validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    if(!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const domainError = roleDomainError(email, role);
    if(domainError) return { ok: false, error: domainError };

    if(Storage.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    // Guardamos SOLO el hash + salt, nunca la contraseña en texto plano.
    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);

    const user = {
      id: genId(),
      email,
      salt,
      passwordHash,
      role,
      createdAt: Date.now(),
      profile: blankProfile(role)
    };

    Storage.createUser(user);
    Storage.setSession(user.id, user.role);
    return { ok: true, user };
  }

  async function login({ email, password, role }){
    email = (email || "").trim();
    const user = Storage.findUserByEmail(email);
    if(!user) return { ok: false, error: "No account found with that email." };

    // Cuentas creadas con Google no tienen contraseña.
    if(user.provider === "google" && !user.passwordHash && user.password == null){
      return { ok: false, error: "This account uses Google sign-in. Use the “Sign in with Google” button." };
    }

    const valid = await verifyPassword(user, password);
    if(!valid) return { ok: false, error: "Incorrect password." };

    if(role && user.role !== role){
      return { ok: false, error: `This account is registered as a ${user.role === "vendor" ? "Vendor" : "Property Manager"}. Switch the tab above.` };
    }
    Storage.setSession(user.id, user.role);
    return { ok: true, user };
  }

  // ───────────────────────────────────────────────────────────────
  // SIGN IN WITH GOOGLE
  // Google nos entrega un correo YA VERIFICADO. Con eso:
  //  - Si ya existe una cuenta con ese correo → iniciamos sesión.
  //  - Si no existe → hay que crearla, y para eso necesitamos el ROL
  //    (Vendor o Property Manager), porque la app funciona distinto
  //    para cada uno. Por eso `signInWithGoogle` avisa cuando falta el rol.
  // Las cuentas creadas por Google no tienen contraseña (password: null)
  // y llevan provider:"google" para saber de dónde vienen.
  // ───────────────────────────────────────────────────────────────

  // Da de alta una cuenta a partir de un correo verificado por Google.
  function registerWithGoogle({ email, role, name }){
    email = (email || "").trim().toLowerCase();
    if(!validateEmail(email)) return { ok: false, error: "Google did not return a valid email address." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const domainError = roleDomainError(email, role);
    if(domainError) return { ok: false, error: domainError };

    if(Storage.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    const profile = blankProfile(role);
    // Aprovechamos el nombre que Google nos da para prellenar el perfil.
    if(name){
      if(role === "vendor") profile.contactName = name;
      else profile.fullName = name;
    }

    const user = {
      id: genId(),
      email,
      password: null,      // sin contraseña: esta cuenta entra con Google
      provider: "google",
      role,
      createdAt: Date.now(),
      profile
    };

    Storage.createUser(user);
    Storage.setSession(user.id, user.role);
    return { ok: true, user };
  }

  // Punto de entrada del botón de Google. `email` y `name` vienen del token de Google;
  // `role` es el que el usuario haya elegido en la página (puede ser null al iniciar sesión).
  function signInWithGoogle({ email, name, role }){
    email = (email || "").trim().toLowerCase();
    if(!validateEmail(email)) return { ok: false, error: "Google did not return a valid email address." };

    const existing = Storage.findUserByEmail(email);
    if(existing){
      Storage.setSession(existing.id, existing.role);
      return { ok: true, user: existing, created: false };
    }

    // Cuenta nueva: necesitamos saber si es Vendor o Property Manager.
    if(role !== "vendor" && role !== "pm"){
      return { ok: false, needsRole: true, email,
        error: "Almost there — choose Vendor or Property Manager, then continue with Google." };
    }

    const result = registerWithGoogle({ email, role, name });
    if(result.ok) result.created = true;
    return result;
  }

  function logout(){
    Storage.clearSession();
  }

  // Página de inicio propia de cada rol.
  function homeForRole(role){
    return role === "vendor" ? "vendor-dashboard.html" : "markets.html";
  }

  // Guards: redirige si no hay sesión o el rol no corresponde.
  // IMPORTANTE: está diseñado para NO poder entrar en bucle infinito.
  function requireRole(role, redirectTo){
    const user = Storage.getCurrentUser();

    // 1) Sin sesión → a la página de acceso.
    if(!user){
      window.location.href = redirectTo || "auth.html";
      return null;
    }

    // 2) Rol correcto → adelante.
    if(user.role === role) return user;

    // 3) Con sesión pero rol distinto y VÁLIDO → lo mandamos a SU propia
    //    página de inicio (no a auth.html, para no rebotar en bucle).
    if(user.role === "vendor" || user.role === "pm"){
      window.location.href = homeForRole(user.role);
      return null;
    }

    // 4) Rol desconocido/corrupto → cerramos la sesión y vamos a auth.
    //    Es una acción terminal: en la próxima carga ya no habrá sesión.
    Storage.clearSession();
    window.location.href = redirectTo || "auth.html";
    return null;
  }

  // Al cargar: convertimos a hash cualquier contraseña en texto plano que
  // haya quedado guardada (cuentas demo, importadas o de versiones antiguas).
  migratePlaintextPasswords();

  return { register, login, signInWithGoogle, logout, requireRole, validateEmail, COMPANY_DOMAIN };
})();
