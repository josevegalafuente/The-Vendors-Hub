/* =========================================================================
   db.js — CAPA DE DATOS (antes storage.js)
   -------------------------------------------------------------------------
   Esta es la "base de datos" del prototipo. Guarda todo en localStorage (el
   almacenamiento del navegador). En la Fase B la reemplazaremos por Firebase
   sin tocar el resto de la app, porque todas las páginas hablan SOLO con este
   objeto `DB` (nunca directo con localStorage). A eso se le llama "capa de
   abstracción".

   ⚠️  POR QUÉ SE LLAMA `DB` Y NO `Storage`
       `Storage` es un nombre que el navegador YA usa (es la interfaz de
       localStorage/sessionStorage). Pisarlo rompía `localStorage instanceof
       Storage` y podía romper cualquier librería de terceros que añadiéramos.

   ⚠️  LIMITACIÓN REAL DE localStorage
       Los datos viven solo en ESTE navegador y tienen un límite (~5 MB).
       Además, cualquiera puede editarlos desde las herramientas de
       desarrollo. Sirve para probar; la seguridad de verdad llega con
       Firebase (ver FIREBASE.md).

   ─── ESTRUCTURA ─────────────────────────────────────────────────────────
   Hay dos cosas distintas que antes estaban mezcladas:

     1. CUENTAS (`users`)     — gente que puede iniciar sesión: vendors que
                                se registraron, property managers y el admin.
     2. FICHAS (`listings`)   — el directorio importado de la empresa. Son
                                fichas informativas, NO cuentas: no tienen
                                contraseña y nadie puede iniciar sesión con
                                ellas. Un vendor puede "reclamar" su ficha y
                                el administrador aprueba la solicitud.

   Antes, las 1.179 fichas importadas se creaban como cuentas con la
   contraseña "changeme" escrita en el código público: cualquiera podía
   entrar como cualquier vendor. Separarlas elimina ese agujero por completo.
   ========================================================================= */
window.DB = (function () {

  const CFG = window.APP_CONFIG || {};
  const SEC = CFG.SECURITY || {};

  /* Claves bajo las que guardamos cada cosa en localStorage. */
  const KEYS = {
    users:    "tvh_users",     // cuentas que pueden iniciar sesión
    listings: "tvh_listings",  // directorio importado (fichas, no cuentas)
    session:  "tvh_session",   // quién tiene sesión iniciada ahora
    claims:   "tvh_claims",    // solicitudes de reclamación de ficha
    audit:    "tvh_audit",     // registro de acciones del administrador
    lockout:  "tvh_lockout",   // intentos fallidos de inicio de sesión
    seeded:   "tvh_seeded",    // bandera: ¿ya cargamos los datos de ejemplo?
    schema:   "tvh_schema"     // versión del esquema de datos
  };

  const SCHEMA_VERSION = 2;

  /* =======================================================================
     HELPERS DE BAJO NIVEL
     Con caché en memoria: `getUsers()` se llama muchas veces por página y
     parsear ~1 MB de JSON cada vez era un cuello de botella real.
     ===================================================================== */
  const cache = new Map();

  function read(key, fallback) {
    if (cache.has(key)) return cache.get(key);
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : fallback;
      cache.set(key, value);
      return value;
    } catch (err) {
      console.error("No se pudo leer", key, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      cache.set(key, value);
      indexes = null;          // cualquier escritura invalida los índices
      return true;
    } catch (err) {
      // El error típico aquí es QuotaExceeded (te pasaste de ~5 MB,
      // normalmente por subir imágenes o PDFs muy grandes en base64).
      console.error("No se pudo guardar", key, err);
      cache.delete(key);
      return false;
    }
  }

  function drop(key) {
    localStorage.removeItem(key);
    cache.delete(key);
    indexes = null;
  }

  /* Si OTRA pestaña escribe, nuestra caché queda obsoleta. El evento
     `storage` solo se dispara en las demás pestañas, que es justo lo que
     necesitamos para no servir datos viejos. */
  window.addEventListener("storage", function (e) {
    if (e.key && cache.has(e.key)) { cache.delete(e.key); indexes = null; }
  });

  /* =======================================================================
     ESCRITURAS SEGURAS
     `mutate` RELEE justo antes de guardar. Es la corrección de un fallo real:
     el código antiguo tomaba una foto de la lista de usuarios, hacía trabajo
     asíncrono y guardaba esa foto vieja encima, borrando cuentas que se
     habían creado mientras tanto.
     ===================================================================== */
  function mutate(key, fallback, fn) {
    cache.delete(key);                 // fuerza lectura fresca del disco
    const current = read(key, fallback);
    const next = fn(current);
    if (next === undefined) return false;   // el callback decidió no tocar nada
    return write(key, next);
  }

  function genId(prefix) {
    // crypto.randomUUID evita colisiones que Math.random sí puede provocar.
    if (window.crypto && crypto.randomUUID) return prefix + "_" + crypto.randomUUID();
    const rnd = new Uint8Array(9);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(rnd);
    else for (let i = 0; i < rnd.length; i++) rnd[i] = Math.floor(Math.random() * 256);
    return prefix + "_" + Date.now().toString(36) + "_" +
      [...rnd].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /* ¿Este correo es de un administrador? */
  function isAdminEmail(email) {
    const list = (CFG.ADMIN_EMAILS || []).map(normalizeEmail);
    return list.indexOf(normalizeEmail(email)) > -1;
  }

  /* =======================================================================
     USUARIOS (cuentas)
     ===================================================================== */
  function getUsers()       { return read(KEYS.users, []); }
  function saveUsers(users) { return write(KEYS.users, users); }

  function findUserByEmail(email) {
    const clean = normalizeEmail(email);
    if (!clean) return null;
    return getUsers().find(u => normalizeEmail(u.email) === clean) || null;
  }

  function getUserById(id) {
    return getUsers().find(u => u.id === id) || null;
  }

  function createUser(user) {
    // Relee y comprueba duplicados dentro de la misma operación, para que dos
    // pestañas no puedan crear la misma cuenta a la vez.
    let created = false;
    mutate(KEYS.users, [], users => {
      const clean = normalizeEmail(user.email);
      if (users.some(u => normalizeEmail(u.email) === clean)) return undefined;
      users.push(user);
      created = true;
      return users;
    });
    return created;
  }

  /* Mezcla `patch` dentro del usuario con ese id y guarda.
     Si el patch trae `profile`, lo combina campo por campo. */
  function updateUser(id, patch) {
    let ok = false;
    mutate(KEYS.users, [], users => {
      const i = users.findIndex(u => u.id === id);
      if (i === -1) return undefined;
      const user = users[i];
      Object.keys(patch).forEach(key => {
        if (key === "profile" && patch.profile && typeof patch.profile === "object") {
          user.profile = Object.assign({}, user.profile, patch.profile);
        } else {
          user[key] = patch[key];
        }
      });
      user.updatedAt = Date.now();
      users[i] = user;
      ok = true;
      return users;
    });
    return ok;
  }

  function deleteUser(id) {
    let ok = false;
    mutate(KEYS.users, [], users => {
      const i = users.findIndex(u => u.id === id);
      if (i === -1) return undefined;
      users.splice(i, 1);
      ok = true;
      return users;
    });
    return ok;
  }

  /* =======================================================================
     SESIÓN
     Guardamos también cuándo caduca. Una sesión que no expira nunca en un
     equipo compartido es un riesgo evitable.
     ===================================================================== */
  function setSession(userId, role) {
    const minutes = SEC.SESSION_IDLE_MINUTES || 480;
    return write(KEYS.session, {
      userId,
      role,
      createdAt: Date.now(),
      expiresAt: Date.now() + minutes * 60 * 1000
    });
  }

  function clearSession() { drop(KEYS.session); }

  function getCurrentUser() {
    const s = read(KEYS.session, null);
    if (!s) return null;

    // Sesión caducada por inactividad → fuera.
    if (s.expiresAt && Date.now() > s.expiresAt) {
      clearSession();
      return null;
    }

    const user = getUserById(s.userId);
    if (!user) { clearSession(); return null; }   // la cuenta ya no existe

    // El rol manda siempre desde la CUENTA, nunca desde la sesión: si alguien
    // edita el objeto de sesión a mano, no consigue cambiar su rol.
    if (s.role !== user.role) setSession(user.id, user.role);

    // Renueva la ventana de inactividad mientras el usuario navega.
    const minutes = SEC.SESSION_IDLE_MINUTES || 480;
    const remaining = s.expiresAt - Date.now();
    if (remaining < minutes * 60 * 1000 * 0.5) setSession(user.id, user.role);

    return user;
  }

  function isAdmin(user) {
    return !!(user && user.role === "admin");
  }

  /* =======================================================================
     BLOQUEO POR INTENTOS FALLIDOS
     Freno básico a la fuerza bruta. En un sitio sin servidor no es una
     defensa real (se puede limpiar desde el navegador), pero sí frena el
     caso común: alguien probando contraseñas a mano en un equipo ajeno.
     ===================================================================== */
  function lockoutKeyFor(email) { return normalizeEmail(email); }

  function getLockout(email) {
    const all = read(KEYS.lockout, {});
    return all[lockoutKeyFor(email)] || { fails: 0, until: 0 };
  }

  function isLockedOut(email) {
    const l = getLockout(email);
    if (l.until && Date.now() < l.until) {
      return Math.ceil((l.until - Date.now()) / 60000);   // minutos restantes
    }
    return 0;
  }

  function registerFailedLogin(email) {
    const max = SEC.MAX_LOGIN_ATTEMPTS || 5;
    const mins = SEC.LOCKOUT_MINUTES || 15;
    mutate(KEYS.lockout, {}, all => {
      const k = lockoutKeyFor(email);
      const cur = all[k] || { fails: 0, until: 0 };
      cur.fails += 1;
      if (cur.fails >= max) {
        cur.until = Date.now() + mins * 60 * 1000;
        cur.fails = 0;
      }
      all[k] = cur;
      return all;
    });
  }

  function clearFailedLogins(email) {
    mutate(KEYS.lockout, {}, all => {
      delete all[lockoutKeyFor(email)];
      return all;
    });
  }

  /* =======================================================================
     FICHAS DEL DIRECTORIO (vendors importados)
     No son cuentas. No tienen contraseña. Nadie puede iniciar sesión con
     ellas. Solo son información pública del directorio + reseñas.
     ===================================================================== */
  function getListings()  { return read(KEYS.listings, []); }

  function getListingByRef(ref) {
    return getListings().find(l => l.ref === ref) || null;
  }

  /* Mapa categoría-id → lista de servicios, para que la ficha sea buscable
     por su categoría. Se arma desde VENDOR_CATEGORIES (data/services.js). */
  function servicesForCategory(catId) {
    if (!catId || !Array.isArray(window.VENDOR_CATEGORIES)) return [];
    const c = window.VENDOR_CATEGORIES.find(x => x.id === catId);
    return c ? c.services.slice() : [];
  }

  /* Sincroniza data/vendors-data.js con el almacenamiento local.
     Es idempotente y además ACTUALIZA las fichas existentes: si corriges la
     categoría o los estados de un vendor en el archivo de datos, el cambio
     se refleja (antes las fichas ya creadas se quedaban congeladas).
     Las reseñas y el estado de reclamación NO se tocan. */
  function syncDirectory() {
    const list = window.IMPORTED_VENDORS;
    if (!Array.isArray(list) || list.length === 0) return 0;

    // Los correos reales viven en data/vendors-contacts.local.js, que NO se
    // publica. Si el archivo no está, las fichas simplemente no muestran
    // correo y todo lo demás funciona igual.
    const contacts = window.VENDOR_CONTACTS || {};

    let changes = 0;
    mutate(KEYS.listings, [], current => {
      const byRef = new Map(current.map(l => [l.ref, l]));
      const next = [];

      list.forEach(item => {
        const ref = String(item.ref || "").trim();
        if (!ref) return;

        const states = Array.isArray(item.states) ? item.states : [];
        const coverage = {};
        states.forEach(s => { coverage[s] = { mode: "full", counties: {} }; });

        const existing = byRef.get(ref);
        const email = normalizeEmail(contacts[ref] || (existing && existing.email) || "");

        if (existing) {
          // Actualiza los datos que vienen del archivo, conserva lo demás.
          const before = JSON.stringify([existing.name, existing.cat, existing.states, existing.email]);
          existing.name   = item.name || existing.name;
          existing.cat    = item.cat || "";
          existing.meld   = item.meld || item.name || "";
          existing.states = states;
          existing.email  = email || null;
          // La cobertura y los servicios solo se regeneran si el vendor aún
          // no ha reclamado la ficha (si la reclamó, manda su propio perfil).
          if (!existing.claimedBy) {
            existing.coverage = coverage;
            existing.services = servicesForCategory(item.cat);
          }
          if (JSON.stringify([existing.name, existing.cat, existing.states, existing.email]) !== before) changes++;
          next.push(existing);
          byRef.delete(ref);
        } else {
          next.push({
            ref,
            name: item.name || "",
            meld: item.meld || item.name || "",
            cat: item.cat || "",
            states,
            coverage,
            services: servicesForCategory(item.cat),
            email: email || null,
            claimedBy: null,      // id de la cuenta que reclamó esta ficha
            hidden: false,        // el admin puede ocultar una ficha
            reviews: [],
            createdAt: Date.now()
          });
          changes++;
        }
      });

      // Las fichas que ya no están en el archivo se conservan si alguien las
      // reclamó o si tienen reseñas; el resto desaparece.
      byRef.forEach(orphan => {
        if (orphan.claimedBy || (orphan.reviews && orphan.reviews.length)) next.push(orphan);
        else changes++;
      });

      return changes > 0 ? next : undefined;
    });
    return changes;
  }

  function updateListing(ref, patch) {
    let ok = false;
    mutate(KEYS.listings, [], listings => {
      const i = listings.findIndex(l => l.ref === ref);
      if (i === -1) return undefined;
      listings[i] = Object.assign({}, listings[i], patch, { updatedAt: Date.now() });
      ok = true;
      return listings;
    });
    return ok;
  }

  /* =======================================================================
     VISTA UNIFICADA DE VENDORS
     Las páginas no deberían saber si un vendor es una cuenta o una ficha del
     directorio. `getAllVendors()` devuelve las dos cosas con la MISMA forma:
        { id, kind, email, profile:{...}, reviews:[], claimed }
     Los ids llevan prefijo: "u_…" = cuenta, "l_…" = ficha del directorio.
     ===================================================================== */
  function listingToVendor(l) {
    return {
      id: "l_" + l.ref,
      kind: "listing",
      ref: l.ref,
      email: l.email || null,
      role: "vendor",
      claimed: !!l.claimedBy,
      createdAt: l.createdAt,
      reviews: l.reviews || [],
      profile: {
        businessName: l.name || "",
        vendorMeldName: l.meld || "",
        contactName: "", addressLine: "", city: "",
        state: (l.states && l.states[0]) || "",
        zip: "", phone: "", website: "", about: "",
        yearsActive: "", employees: "", license: "",
        licenses: [], avatar: null,
        services: l.services || [],
        coverage: l.coverage || {}
      }
    };
  }

  function accountToVendor(u) {
    return {
      id: u.id,
      kind: "account",
      ref: u.claimedRef || null,
      email: u.email,
      role: u.role,
      claimed: true,
      createdAt: u.createdAt,
      reviews: u.reviews || [],
      profile: u.profile || {}
    };
  }

  function getAllVendors() {
    const accounts = getUsers()
      .filter(u => u.role === "vendor" && u.status !== "suspended")
      .map(accountToVendor);
    const listings = getListings()
      .filter(l => !l.hidden && !l.claimedBy)   // si fue reclamada, manda la cuenta
      .map(listingToVendor);
    return accounts.concat(listings);
  }

  function getVendorById(id) {
    if (!id) return null;
    if (id.indexOf("l_") === 0) {
      const l = getListingByRef(id.slice(2));
      return (l && !l.hidden) ? listingToVendor(l) : null;
    }
    const u = getUserById(id);
    return (u && u.role === "vendor" && u.status !== "suspended") ? accountToVendor(u) : null;
  }

  /* =======================================================================
     ÍNDICES DE BÚSQUEDA
     Antes, cada tecla en el buscador recorría 1.179 vendors × 50 estados
     (~59.000 comprobaciones). Ahora se construye una sola vez por carga.
     ===================================================================== */
  let indexes = null;

  function buildIndexes() {
    const vendors = getAllVendors();
    const byState = new Map();     // "FL" -> [vendor, …]
    const byService = new Map();   // "Plumbing" -> Set(vendorId)
    const byId = new Map();

    vendors.forEach(v => {
      byId.set(v.id, v);
      const cov = (v.profile && v.profile.coverage) || {};
      Object.keys(cov).forEach(abbr => {
        if (!byState.has(abbr)) byState.set(abbr, []);
        byState.get(abbr).push(v);
      });
      ((v.profile && v.profile.services) || []).forEach(s => {
        if (!byService.has(s)) byService.set(s, new Set());
        byService.get(s).add(v.id);
      });
    });

    indexes = { vendors, byState, byService, byId };
    return indexes;
  }

  function idx() { return indexes || buildIndexes(); }

  function vendorsInState(stateAbbr) {
    return idx().byState.get(stateAbbr) || [];
  }

  /* Cuenta vendors que cubren un estado Y ofrecen alguno de esos servicios. */
  function countVendorsInStateWithServices(stateAbbr, serviceSet) {
    const inState = vendorsInState(stateAbbr);
    let n = 0;
    for (const v of inState) {
      const services = (v.profile && v.profile.services) || [];
      for (const s of services) { if (serviceSet.has(s)) { n++; break; } }
    }
    return n;
  }

  function countVendorsByState() {
    const out = {};
    idx().byState.forEach((list, abbr) => { out[abbr] = list.length; });
    return out;
  }

  /* ¿Este vendor cubre el estado dado? */
  function vendorCoversState(vendor, stateAbbr) {
    const cov = (vendor.profile && vendor.profile.coverage) || {};
    return Object.prototype.hasOwnProperty.call(cov, stateAbbr);
  }

  /* ¿Este vendor cubre una CIUDAD específica (en un estado y condado dados)?
     Reglas de coverage:
       - mode 'full'            → cubre todas las ciudades del estado
       - county con []          → cubre todas las ciudades de ese condado
       - county con [c1,c2,…]   → cubre solo esas ciudades                */
  function vendorCoversCity(vendor, stateAbbr, countyName, cityName) {
    const cov = (vendor.profile && vendor.profile.coverage) || {};
    const c = cov[stateAbbr];
    if (!c) return false;
    if (c.mode === "full") return true;
    const cities = c.counties && c.counties[countyName];
    if (cities === undefined) return false;   // ese condado no está cubierto
    if (cities.length === 0) return true;     // condado completo
    return cities.indexOf(cityName) > -1;
  }

  /* =======================================================================
     RESEÑAS (⭐)
     Un property manager solo puede dejar UNA reseña por vendor (si vuelve,
     la actualiza). Funciona igual sobre cuentas y sobre fichas.
     ===================================================================== */
  function addOrUpdateReview(vendorId, { pmId, pmName, stars, comment }) {
    const review = {
      pmId,
      pmName: pmName || "Property Manager",
      stars: Math.max(1, Math.min(5, Math.round(Number(stars) || 0))),
      comment: String(comment || "").trim().slice(0, 1000),   // tope de longitud
      createdAt: Date.now()
    };
    if (review.stars < 1) return false;

    const apply = (target) => {
      if (!Array.isArray(target.reviews)) target.reviews = [];
      const i = target.reviews.findIndex(r => r.pmId === pmId);
      if (i > -1) target.reviews[i] = review;
      else target.reviews.push(review);
      return target;
    };

    if (vendorId.indexOf("l_") === 0) {
      const ref = vendorId.slice(2);
      let ok = false;
      mutate(KEYS.listings, [], listings => {
        const i = listings.findIndex(l => l.ref === ref);
        if (i === -1) return undefined;
        listings[i] = apply(listings[i]);
        ok = true;
        return listings;
      });
      return ok;
    }

    let ok = false;
    mutate(KEYS.users, [], users => {
      const i = users.findIndex(u => u.id === vendorId);
      if (i === -1) return undefined;
      users[i] = apply(users[i]);
      ok = true;
      return users;
    });
    return ok;
  }

  function getReviews(vendorId) {
    const v = getVendorById(vendorId);
    return (v && Array.isArray(v.reviews)) ? v.reviews : [];
  }

  function getRatingSummary(vendor) {
    const reviews = (vendor && Array.isArray(vendor.reviews)) ? vendor.reviews : [];
    if (reviews.length === 0) return { avg: 0, count: 0 };
    const total = reviews.reduce((sum, r) => sum + (Number(r.stars) || 0), 0);
    return { avg: total / reviews.length, count: reviews.length };
  }

  /* ¿Está completo el perfil del vendor?
     El sitio web ya NO es obligatorio: muchos vendors pequeños no tienen, y
     antes quedaban marcados como "incompletos" para siempre sin poder
     hacer nada al respecto. */
  function getProfileCompleteness(vendor) {
    const p = (vendor && vendor.profile) || {};
    const checks = [
      ["Business name",              !!String(p.businessName || "").trim()],
      ["Contact name",               !!String(p.contactName || "").trim()],
      ["Phone",                      !!String(p.phone || "").trim()],
      ["About / description",        !!String(p.about || "").trim()],
      ["License number",             !!String(p.license || "").trim()],
      ["At least one service",       Array.isArray(p.services) && p.services.length > 0],
      ["At least one coverage area", !!p.coverage && Object.keys(p.coverage).length > 0]
    ];
    const missing = checks.filter(c => !c[1]).map(c => c[0]);
    return {
      complete: missing.length === 0,
      missing,
      filled: checks.length - missing.length,
      total: checks.length
    };
  }

  /* =======================================================================
     SOLICITUDES DE RECLAMACIÓN
     Un vendor registrado dice "esta ficha del directorio es mi negocio".
     El ADMINISTRADOR aprueba o rechaza. Sin aprobación no pasa nada: así
     nadie puede apropiarse de la ficha de otro.
     ===================================================================== */
  function getClaims() { return read(KEYS.claims, []); }

  function createClaim(userId, ref, note) {
    const listing = getListingByRef(ref);
    if (!listing || listing.claimedBy) return { ok: false, error: "That listing is not available to claim." };

    const existing = getClaims().find(c => c.userId === userId && c.ref === ref && c.status === "pending");
    if (existing) return { ok: false, error: "You already have a pending request for this listing." };

    const claim = {
      id: genId("c"),
      userId, ref,
      note: String(note || "").trim().slice(0, 500),
      status: "pending",
      createdAt: Date.now()
    };
    let ok = false;
    mutate(KEYS.claims, [], claims => { claims.push(claim); ok = true; return claims; });
    return ok ? { ok: true, claim } : { ok: false, error: "Could not save the request." };
  }

  /* Solo el admin resuelve. Al aprobar, la ficha se vincula a la cuenta y
     sus datos (servicios, cobertura, nombre Meld) se copian al perfil. */
  function resolveClaim(claimId, decision, adminUser) {
    if (!isAdmin(adminUser)) return { ok: false, error: "Only an administrator can do that." };
    if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Invalid decision." };

    const claim = getClaims().find(c => c.id === claimId);
    if (!claim || claim.status !== "pending") return { ok: false, error: "Request not found." };

    if (decision === "approved") {
      const listing = getListingByRef(claim.ref);
      const user = getUserById(claim.userId);
      if (!listing || !user) return { ok: false, error: "The listing or the account no longer exists." };
      if (listing.claimedBy) return { ok: false, error: "That listing was already claimed." };

      updateListing(claim.ref, { claimedBy: user.id });

      // Fusiona los datos de la ficha en el perfil, sin pisar lo que el
      // vendor ya haya escrito a mano.
      const p = user.profile || {};
      const mergedServices = Array.from(new Set([].concat(p.services || [], listing.services || [])));
      const mergedCoverage = Object.assign({}, listing.coverage || {}, p.coverage || {});
      updateUser(user.id, {
        claimedRef: claim.ref,
        profile: {
          businessName: p.businessName || listing.name || "",
          vendorMeldName: p.vendorMeldName || listing.meld || "",
          services: mergedServices,
          coverage: mergedCoverage
        }
      });
    }

    mutate(KEYS.claims, [], claims => {
      const i = claims.findIndex(c => c.id === claimId);
      if (i === -1) return undefined;
      claims[i].status = decision;
      claims[i].resolvedAt = Date.now();
      claims[i].resolvedBy = adminUser.id;
      return claims;
    });

    logAction(adminUser, decision === "approved" ? "claim.approve" : "claim.reject",
              { claimId, ref: claim.ref, userId: claim.userId });
    return { ok: true };
  }

  /* =======================================================================
     REGISTRO DE ACCIONES (auditoría)
     Deja rastro de lo que hace el administrador. Se guardan las últimas 500.
     ===================================================================== */
  function logAction(actor, action, details) {
    mutate(KEYS.audit, [], log => {
      log.push({
        at: Date.now(),
        actorId: actor ? actor.id : null,
        actorEmail: actor ? actor.email : null,
        action,
        details: details || {}
      });
      return log.slice(-500);
    });
  }

  function getAuditLog() {
    return read(KEYS.audit, []).slice().reverse();   // más reciente primero
  }

  /* =======================================================================
     COPIA DE SEGURIDAD
     Mientras los datos vivan solo en este navegador, poder exportarlos e
     importarlos es la diferencia entre "se perdió todo" y "no pasó nada".
     ===================================================================== */
  function exportData() {
    return {
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      users: getUsers(),
      listings: getListings(),
      claims: getClaims(),
      audit: read(KEYS.audit, [])
    };
  }

  function importData(payload, adminUser) {
    if (!isAdmin(adminUser)) return { ok: false, error: "Only an administrator can restore a backup." };
    if (!payload || !Array.isArray(payload.users)) return { ok: false, error: "That file is not a valid backup." };
    write(KEYS.users, payload.users);
    write(KEYS.listings, Array.isArray(payload.listings) ? payload.listings : []);
    write(KEYS.claims, Array.isArray(payload.claims) ? payload.claims : []);
    if (Array.isArray(payload.audit)) write(KEYS.audit, payload.audit);
    logAction(adminUser, "data.import", { users: payload.users.length });
    return { ok: true };
  }

  /* =======================================================================
     ESPACIO USADO
     ===================================================================== */
  function getStorageUsage() {
    let bytes = 0;
    Object.values(KEYS).forEach(k => {
      const raw = localStorage.getItem(k);
      if (raw) bytes += raw.length * 2;   // UTF-16: ~2 bytes por carácter
    });
    const limit = 5 * 1024 * 1024;
    return { bytes, limit, percent: Math.min(100, Math.round((bytes / limit) * 100)) };
  }

  /* =======================================================================
     DATOS DE EJEMPLO (seed)
     Un property manager y un par de vendors de prueba para ver el flujo
     completo sin registrar cuentas a mano.

     ⚠️  Las cuentas demo se crean SIN contraseña utilizable. Antes tenían
         "demo123" en texto plano y en un sitio publicado eso son puertas
         abiertas. Ahora son fichas de solo lectura: para entrar hay que
         registrarse de verdad.
     ===================================================================== */
  function seedIfEmpty() {
    if (read(KEYS.seeded, false)) return;
    if (getListings().length > 0 || getUsers().length > 0) { write(KEYS.seeded, true); return; }

    const demoListings = [
      {
        ref: "demo-bluewave-plumbing", name: "BlueWave Plumbing Co.",
        meld: "BlueWave Plumbing", cat: "plumbing", states: ["FL"],
        coverage: { "FL": { mode: "partial", counties: { "Miami-Dade County": [], "Broward County": ["Fort Lauderdale", "Hollywood"] } } },
        services: ["Plumbing", "Drain Cleaning", "Water Damage Restoration"],
        email: null, claimedBy: null, hidden: false, createdAt: Date.now(),
        reviews: [
          { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5, comment: "Fast response and clean work. Fixed a major leak overnight.", createdAt: Date.now() - 86400000 * 5 },
          { pmId: "seed_pm2", pmName: "Coastal Realty Group", stars: 4, comment: "Reliable and fairly priced. Would hire again.", createdAt: Date.now() - 86400000 * 2 }
        ]
      },
      {
        ref: "demo-summit-electric", name: "Summit Electric",
        meld: "Summit Electric", cat: "electrical", states: ["AZ"],
        coverage: { "AZ": { mode: "full", counties: {} } },
        services: ["Electrical", "Lighting Installation", "EV Charging Installation", "Generator Installation"],
        email: null, claimedBy: null, hidden: false, createdAt: Date.now(),
        reviews: [
          { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5, comment: "Great communication and licensed crew. Highly recommend.", createdAt: Date.now() - 86400000 * 10 }
        ]
      },
      {
        ref: "demo-ocala-comfort", name: "Ocala Comfort HVAC",
        meld: "Ocala Comfort HVAC", cat: "hvac", states: ["FL"],
        coverage: { "FL": { mode: "partial", counties: { "Marion County": [] } } },
        services: ["HVAC Installation", "HVAC Repair & Maintenance", "Duct Cleaning"],
        email: null, claimedBy: null, hidden: false, createdAt: Date.now(),
        reviews: [
          { pmId: "seed_pm", pmName: "Sunrise Property Mgmt", stars: 5, comment: "Saved us during a summer outage. Excellent service in Ocala.", createdAt: Date.now() - 86400000 * 3 }
        ]
      }
    ];

    write(KEYS.listings, demoListings);
    write(KEYS.seeded, true);
  }

  /* Borra TODO y vuelve a sembrar. */
  function resetDemo() {
    Object.values(KEYS).forEach(drop);
    seedIfEmpty();
    syncDirectory();
    write(KEYS.schema, SCHEMA_VERSION);
  }

  /* =======================================================================
     MIGRACIONES
     El sitio ya está publicado, así que hay navegadores con datos del
     esquema antiguo. Estas funciones los ponen al día sin perder nada.
     ===================================================================== */
  function migrate() {
    const from = read(KEYS.schema, 1);

    /* v1: los Property Managers se guardaban con el rol "manager". El código
       actual usa "pm". Sin normalizar, la sesión vieja no coincide con lo que
       piden las páginas y se produce un BUCLE de redirección. */
    const legacyRoles = { manager: "pm", property_manager: "pm", propertymanager: "pm", propertyManager: "pm" };
    mutate(KEYS.users, [], users => {
      let changed = false;
      users.forEach(u => {
        if (u && legacyRoles[u.role]) { u.role = legacyRoles[u.role]; changed = true; }

        /* v1 → v2: las cuentas importadas se creaban con la contraseña
           "changeme" escrita en el código público. Cualquiera podía entrar
           en ellas. Se convierten en fichas del directorio: se les quita
           toda credencial y se marcan como no utilizables para iniciar
           sesión. La ficha equivalente ya la crea `syncDirectory()`. */
        if (u && u.imported) {
          u.password = null;
          u.passwordHash = null;
          u.salt = null;
          u.disabled = true;
          u.disabledReason = "imported-listing";
          changed = true;
        }
      });
      if (!changed) return undefined;
      return users.filter(u => !(u.disabled && u.disabledReason === "imported-listing"));
    });

    // La sesión también podía llevar un rol heredado.
    const s = read(KEYS.session, null);
    if (s && legacyRoles[s.role]) { s.role = legacyRoles[s.role]; write(KEYS.session, s); }

    // Las cuentas demo con "demo123" en texto plano dejan de poder entrar.
    mutate(KEYS.users, [], users => {
      let changed = false;
      users.forEach(u => {
        if (u && u.password === "demo123") { u.password = null; u.disabled = true; changed = true; }
      });
      return changed ? users : undefined;
    });

    if (from !== SCHEMA_VERSION) write(KEYS.schema, SCHEMA_VERSION);
  }

  /* =======================================================================
     CORREOS DE CONTACTO (solo en local)
     -----------------------------------------------------------------------
     Los correos reales de los 1.179 vendors importados son datos personales
     de terceros. Estaban dentro de data/vendors-data.js, que se publica tal
     cual: cualquiera podía descargar la lista completa desde el sitio.

     Ahora viven en data/vendors-contacts.local.js, que está en .gitignore y
     NO se sube ni se publica. Este cargador solo lo pide cuando el sitio se
     abre desde tu propio equipo (localhost). En el sitio publicado el
     archivo no se solicita nunca: cero peticiones, cero exposición.

     La solución definitiva es Firestore con reglas de seguridad, donde los
     correos solo se sirven a usuarios autenticados. Ver FIREBASE.md
     ===================================================================== */
  function loadLocalContacts() {
    const host = location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
    if (!isLocal) return Promise.resolve(false);
    if (window.VENDOR_CONTACTS) { syncDirectory(); return Promise.resolve(true); }

    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "data/vendors-contacts.local.js";
      s.onload = () => { syncDirectory(); resolve(true); };
      // Que no exista es lo normal: el sitio funciona igual sin correos.
      s.onerror = () => resolve(false);
      (document.head || document.documentElement).appendChild(s);
    });
  }

  /* =======================================================================
     ARRANQUE — se ejecuta en cuanto carga el script.
     ===================================================================== */
  migrate();         // pone al día los navegadores con datos antiguos
  seedIfEmpty();     // datos de ejemplo la primera vez
  syncDirectory();   // vuelca data/vendors-data.js al directorio local
  const contactsReady = loadLocalContacts();

  /* ---------- lo que exponemos al resto de la app ---------- */
  return {
    // promesa que se resuelve cuando (y si) se cargan los correos locales
    contactsReady,
    // utilidades
    genId, normalizeEmail, isAdminEmail, isAdmin,
    // cuentas
    getUsers, saveUsers, findUserByEmail, getUserById, createUser, updateUser, deleteUser,
    // sesión
    setSession, clearSession, getCurrentUser,
    // bloqueo por intentos fallidos
    isLockedOut, registerFailedLogin, clearFailedLogins,
    // vendors (vista unificada)
    getAllVendors, getVendorById, vendorCoversState, vendorCoversCity, getProfileCompleteness,
    // directorio
    getListings, getListingByRef, updateListing, syncDirectory,
    // índices / búsqueda
    vendorsInState, countVendorsInStateWithServices, countVendorsByState,
    // reseñas
    addOrUpdateReview, getReviews, getRatingSummary,
    // reclamaciones
    getClaims, createClaim, resolveClaim,
    // administración
    logAction, getAuditLog, exportData, importData, getStorageUsage,
    // demo
    resetDemo
  };
})();
