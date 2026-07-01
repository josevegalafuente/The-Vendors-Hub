/* =========================================================================
   storage.js — CAPA DE DATOS (Data Layer)
   -------------------------------------------------------------------------
   Esta es la "base de datos" del prototipo. Por ahora guarda todo en
   localStorage (el almacenamiento del navegador). En la Fase B la
   reemplazaremos por Firebase sin tocar el resto de la app, porque todas
   las páginas hablan SOLO con este objeto `Storage` (nunca directo con
   localStorage). A eso se le llama "capa de abstracción".

   ⚠️  Limitación de localStorage: los datos viven solo en ESTE navegador
       y tienen un límite (~5 MB). Sirve para probar, no para producción.
   ========================================================================= */
window.Storage = (function () {

  // Claves bajo las que guardamos cada cosa en localStorage.
  const KEYS = {
    users:   "tvh_users",     // lista de todas las cuentas (vendors + PMs)
    session: "tvh_session",   // quién tiene sesión iniciada ahora
    seeded:  "tvh_seeded"     // bandera: ¿ya cargamos los datos de ejemplo?
  };

  /* ---------- helpers de bajo nivel ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.error("No se pudo leer", key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      // El error típico aquí es QuotaExceeded (te pasaste de ~5 MB,
      // normalmente por subir imágenes o PDFs muy grandes en base64).
      console.error("No se pudo guardar", key, err);
      return false;
    }
  }

  /* ---------- usuarios ---------- */
  function getUsers()            { return read(KEYS.users, []); }
  function saveUsers(users)      { return write(KEYS.users, users); }

  function findUserByEmail(email) {
    const clean = String(email || "").trim().toLowerCase();
    return getUsers().find(u => u.email === clean) || null;
  }

  function getUserById(id) {
    return getUsers().find(u => u.id === id) || null;
  }

  function createUser(user) {
    const users = getUsers();
    users.push(user);
    return saveUsers(users);
  }

  // Mezcla `patch` dentro del usuario con ese id y guarda.
  // Si el patch trae `profile`, lo combina campo por campo.
  function updateUser(id, patch) {
    const users = getUsers();
    const i = users.findIndex(u => u.id === id);
    if (i === -1) return false;
    const user = users[i];
    Object.keys(patch).forEach(key => {
      if (key === "profile" && typeof patch.profile === "object") {
        user.profile = Object.assign({}, user.profile, patch.profile);
      } else {
        user[key] = patch[key];
      }
    });
    users[i] = user;
    return saveUsers(users);
  }

  /* ---------- sesión (quién está logueado) ---------- */
  function setSession(userId, role) { write(KEYS.session, { userId, role }); }
  function clearSession()           { localStorage.removeItem(KEYS.session); }

  function getCurrentUser() {
    const s = read(KEYS.session, null);
    if (!s) return null;
    return getUserById(s.userId);   // devolvemos el usuario fresco y completo
  }

  /* ---------- vendors (proveedores) ---------- */
  function getAllVendors() {
    return getUsers().filter(u => u.role === "vendor");
  }

  function getVendorById(id) {
    const u = getUserById(id);
    return (u && u.role === "vendor") ? u : null;
  }

  // ¿Este vendor cubre el estado dado? (basta con que exista en su coverage)
  function vendorCoversState(vendor, stateAbbr) {
    const cov = (vendor.profile && vendor.profile.coverage) || {};
    return Object.prototype.hasOwnProperty.call(cov, stateAbbr);
  }

  // ¿Este vendor cubre una CIUDAD específica (en un estado y condado dados)?
  // Reglas de coverage:
  //   - mode 'full'           → cubre todas las ciudades del estado
  //   - county con []         → cubre todas las ciudades de ese condado
  //   - county con [c1,c2...]  → cubre solo esas ciudades
  function vendorCoversCity(vendor, stateAbbr, countyName, cityName) {
    const cov = (vendor.profile && vendor.profile.coverage) || {};
    const c = cov[stateAbbr];
    if (!c) return false;
    if (c.mode === "full") return true;
    const cities = c.counties && c.counties[countyName];
    if (cities === undefined) return false;   // ese condado no está cubierto
    if (cities.length === 0) return true;      // condado completo
    return cities.indexOf(cityName) > -1;
  }

  /* ---------- calificaciones / reseñas (⭐) ---------- */
  // Cada vendor tiene un arreglo `reviews`. Regla: UN property manager
  // solo puede dejar UNA reseña por vendor (si vuelve, la actualiza).
  function addOrUpdateReview(vendorId, { pmId, pmName, stars, comment }) {
    const users = getUsers();
    const i = users.findIndex(u => u.id === vendorId);
    if (i === -1) return false;
    const vendor = users[i];
    if (!Array.isArray(vendor.reviews)) vendor.reviews = [];

    const existing = vendor.reviews.findIndex(r => r.pmId === pmId);
    const review = {
      pmId,
      pmName: pmName || "Property Manager",
      stars: Math.max(1, Math.min(5, Number(stars) || 0)),
      comment: (comment || "").trim(),
      createdAt: Date.now()
    };
    if (existing > -1) vendor.reviews[existing] = review;   // actualizar
    else vendor.reviews.push(review);                       // crear

    users[i] = vendor;
    return saveUsers(users);
  }

  function getReviews(vendorId) {
    const v = getVendorById(vendorId);
    return (v && Array.isArray(v.reviews)) ? v.reviews : [];
  }

  // ── ¿Está completo el perfil del vendor? ──
  // Devuelve { complete, missing[], filled, total }. `missing` trae etiquetas
  // legibles de lo que falta, para mostrar "Profile incomplete".
  function getProfileCompleteness(vendor) {
    const p = (vendor && vendor.profile) || {};
    const checks = [
      ["Business name",        !!(p.businessName || "").trim()],
      ["Contact name",         !!(p.contactName || "").trim()],
      ["Phone",                !!(p.phone || "").trim()],
      ["Website",              !!(p.website || "").trim()],
      ["About / description",  !!(p.about || "").trim()],
      ["License number",       !!(p.license || "").trim()],
      ["At least one service", Array.isArray(p.services) && p.services.length > 0],
      ["At least one coverage area", p.coverage && Object.keys(p.coverage).length > 0]
    ];
    const missing = checks.filter(c => !c[1]).map(c => c[0]);
    return {
      complete: missing.length === 0,
      missing,
      filled: checks.length - missing.length,
      total: checks.length
    };
  }

  // Devuelve { avg, count } a partir de las reseñas de un vendor.
  function getRatingSummary(vendor) {
    const reviews = (vendor && Array.isArray(vendor.reviews)) ? vendor.reviews : [];
    if (reviews.length === 0) return { avg: 0, count: 0 };
    const total = reviews.reduce((sum, r) => sum + (Number(r.stars) || 0), 0);
    return { avg: total / reviews.length, count: reviews.length };
  }

  /* ---------- DATOS DE EJEMPLO (seed) ----------
     La primera vez que abres la app, sembramos algunos vendors y un
     property manager de prueba para que veas TODO el flujo funcionando
     sin tener que registrar cuentas a mano. Puedes borrarlo todo desde
     el menú del header ("Reset demo") cuando quieras empezar limpio. */
  function genId(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function makeVendor(email, profile, reviews) {
    return {
      id: genId("u"), email: email.toLowerCase(), password: "demo123",
      role: "vendor", createdAt: Date.now(),
      reviews: reviews || [],
      profile: Object.assign({
        businessName: "", contactName: "", addressLine: "", city: "", state: "",
        zip: "", phone: "", website: "", about: "", yearsActive: "", employees: "",
        license: "", licenses: [], avatar: null, services: [], coverage: {}
      }, profile)
    };
  }

  function seedIfEmpty() {
    if (read(KEYS.seeded, false)) return;     // ya sembrado antes
    if (getUsers().length > 0) { write(KEYS.seeded, true); return; }

    const demo = [
      makeVendor("contact@bluewaveplumbing.com", {
        businessName: "BlueWave Plumbing Co.",
        contactName: "Marcus Reed", phone: "(305) 555-0142",
        website: "https://bluewaveplumbing.com",
        city: "Miami", state: "FL", zip: "33101", yearsActive: "12", employees: "18",
        about: "Family-owned plumbing company serving South Florida since 2012. " +
               "Licensed, insured, and available for 24/7 emergency calls.",
        license: "FL-PLB-118822",
        services: ["Plumbing", "Drain Cleaning", "Water Damage Restoration"],
        coverage: {
          "FL": { mode: "partial", counties: {
            "Miami-Dade County": [],
            "Broward County": ["Fort Lauderdale", "Hollywood"]
          }}
        }
      }, [
        { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5,
          comment: "Fast response and clean work. Fixed a major leak overnight.", createdAt: Date.now() - 86400000 * 5 },
        { pmId: "seed_pm2", pmName: "Coastal Realty Group", stars: 4,
          comment: "Reliable and fairly priced. Would hire again.", createdAt: Date.now() - 86400000 * 2 }
      ]),

      makeVendor("hello@summitelectric.com", {
        businessName: "Summit Electric",
        contactName: "Dana Lopez", phone: "(602) 555-0199",
        website: "https://summitelectric.io",
        city: "Phoenix", state: "AZ", zip: "85001", yearsActive: "8", employees: "9",
        about: "Commercial and residential electrical contractor. Panel upgrades, " +
               "lighting, EV charger installs and generator hookups.",
        license: "AZ-ELE-44120",
        services: ["Electrical", "Lighting Installation", "EV Charging Installation", "Generator Installation"],
        coverage: {
          "AZ": { mode: "full", counties: {} }
        }
      }, [
        { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5,
          comment: "Great communication and licensed crew. Highly recommend.", createdAt: Date.now() - 86400000 * 10 }
      ]),

      makeVendor("team@evergreenexteriors.com", {
        businessName: "Evergreen Exteriors",
        contactName: "Priya Nair", phone: "(206) 555-0177",
        website: "https://evergreenexteriors.com",
        city: "Seattle", state: "WA", zip: "98101", yearsActive: "15", employees: "24",
        about: "Roofing, siding and gutter specialists for the Pacific Northwest. " +
               "Storm damage repairs and full exterior remodels.",
        license: "WA-ROOF-90233",
        services: ["Roofing", "Siding", "Gutter Services", "Pressure Washing"],
        coverage: {
          "WA": { mode: "partial", counties: { "King County": [] } }
        }
      }, []),

      makeVendor("service@ocalacomfort.com", {
        businessName: "Ocala Comfort HVAC",
        contactName: "Brian Foster", phone: "(352) 555-0188",
        website: "https://ocalacomfort.com",
        city: "Ocala", state: "FL", zip: "34470", yearsActive: "10", employees: "14",
        about: "Heating and cooling specialists serving Marion County and all of " +
               "Central Florida. AC installs, repairs and seasonal maintenance.",
        license: "FL-HVAC-77310",
        services: ["HVAC Installation", "HVAC Repair & Maintenance", "Duct Cleaning"],
        coverage: {
          "FL": { mode: "partial", counties: { "Marion County": [] } }
        }
      }, [
        { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5,
          comment: "Saved us during a summer outage. Excellent service in Ocala.", createdAt: Date.now() - 86400000 * 3 }
      ])
    ];

    const pm = {
      id: "seed_pm", email: "manager@demo.com", password: "demo123",
      role: "pm", createdAt: Date.now(),
      profile: { fullName: "Jose (Demo)", company: "Sunrise Property Mgmt" }
    };

    const users = getUsers().concat(demo, [pm]);
    saveUsers(users);
    write(KEYS.seeded, true);
  }

  // Borra TODO (cuentas + sesión + datos demo) y vuelve a sembrar.
  function resetDemo() {
    localStorage.removeItem(KEYS.users);
    localStorage.removeItem(KEYS.session);
    localStorage.removeItem(KEYS.seeded);
    seedIfEmpty();
  }

  // ── Vendors importados (data/vendors-data.js) ──
  // Crea un perfil por cada vendor de la lista que aún no exista (compara por
  // correo). Es idempotente: corre en cada carga, así que agregar vendors al
  // archivo de datos los crea automáticamente, sin duplicar los existentes.
  // Cobertura por defecto: estado completo (lo que viene en la columna state).
  // Mapa categoría-id → lista de servicios (para que el vendor sea buscable
  // por su categoría). Se arma desde VENDOR_CATEGORIES (data/services.js).
  function servicesForCategory(catId) {
    if (!catId || !Array.isArray(window.VENDOR_CATEGORIES)) return [];
    const c = window.VENDOR_CATEGORIES.find(x => x.id === catId);
    return c ? c.services.slice() : [];
  }

  function syncImportedVendors() {
    const list = window.IMPORTED_VENDORS;
    if (!Array.isArray(list) || list.length === 0) return;
    const users = getUsers();
    const byEmail = new Set(users.map(u => u.email));
    let added = 0;
    list.forEach(item => {
      const email = String(item.email || "").trim().toLowerCase();
      if (!email || byEmail.has(email)) return;
      // Cobertura: estado completo por cada mercado (states es un arreglo)
      const states = Array.isArray(item.states) ? item.states : (item.state ? [item.state] : []);
      const coverage = {};
      states.forEach(s => { coverage[s] = { mode: "full", counties: {} }; });
      users.push({
        id: genId("u"), email, password: "changeme",  // contraseña temporal
        role: "vendor", createdAt: Date.now(), imported: true, reviews: [],
        profile: {
          businessName: item.name || "", contactName: "", addressLine: "",
          city: "", state: states[0] || "", zip: "", phone: "",   // sin teléfono (lo ponen ellos)
          website: "", about: "", yearsActive: "", employees: "", license: "",
          vendorMeldName: item.meld || item.name || "",
          licenses: [], avatar: null,
          services: servicesForCategory(item.cat), coverage
        }
      });
      byEmail.add(email);
      added++;
    });
    if (added > 0) saveUsers(users);
    return added;
  }

  // Sembramos en cuanto carga el script.
  seedIfEmpty();
  syncImportedVendors();

  /* ---------- lo que exponemos al resto de la app ---------- */
  return {
    // usuarios / auth
    findUserByEmail, getUserById, createUser, updateUser,
    setSession, clearSession, getCurrentUser,
    // vendors
    getAllVendors, getVendorById, vendorCoversState, vendorCoversCity, getProfileCompleteness,
    // reseñas
    addOrUpdateReview, getReviews, getRatingSummary,
    // demo
    resetDemo
  };
})();
