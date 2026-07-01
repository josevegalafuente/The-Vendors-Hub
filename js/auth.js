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

  function register({ email, password, role }){
    email = (email || "").trim();
    if(!validateEmail(email)) return { ok: false, error: "Please enter a valid email address." };
    if(!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
    if(role !== "vendor" && role !== "pm") return { ok: false, error: "Please select a role." };

    // Regla de la empresa:
    //  - Property Managers DEBEN usar un correo @purehomeriver.com
    //  - Vendors son externos: NO pueden usar el correo de la empresa
    if(role === "pm" && emailDomain(email) !== COMPANY_DOMAIN){
      return { ok: false, error: `Property Manager accounts must use a @${COMPANY_DOMAIN} email address.` };
    }
    if(role === "vendor" && emailDomain(email) === COMPANY_DOMAIN){
      return { ok: false, error: `Company emails (@${COMPANY_DOMAIN}) are reserved for Property Managers. Vendors should register with their own business email.` };
    }

    if(Storage.findUserByEmail(email)){
      return { ok: false, error: "An account with that email already exists. Try signing in instead." };
    }

    const user = {
      id: genId(),
      email,
      password,        // demo only — would be hashed in production
      role,
      createdAt: Date.now(),
      profile: role === "vendor" ? {
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
      }
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

  return { register, login, logout, requireRole, validateEmail, COMPANY_DOMAIN };
})();
