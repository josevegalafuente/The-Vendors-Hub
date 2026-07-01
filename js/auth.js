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

  function register({ email, password, role }){
    email = (email || "").trim();
    if(!validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    if(!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    const domainError = roleDomainError(email, role);
    if(domainError) return { ok: false, error: domainError };

    if(Storage.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    const user = {
      id: genId(),
      email,
      password,        // demo only — would be hashed in production
      role,
      createdAt: Date.now(),
      profile: blankProfile(role)
    };

    Storage.createUser(user);
    Storage.setSession(user.id, user.role);
    return { ok: true, user };
  }

  function login({ email, password, role }){
    email = (email || "").trim();
    const user = Storage.findUserByEmail(email);
    if(!user) return { ok: false, error: "No account found with that email." };
    if(user.password !== password) return { ok: false, error: "Incorrect password." };
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

  // Guards: redirect if not signed in or wrong role
  function requireRole(role, redirectTo){
    const user = Storage.getCurrentUser();
    if(!user || user.role !== role){
      window.location.href = redirectTo || "auth.html";
      return null;
    }
    return user;
  }

  return { register, login, signInWithGoogle, logout, requireRole, validateEmail, COMPANY_DOMAIN };
})();
