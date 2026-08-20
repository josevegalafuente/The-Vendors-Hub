/* =========================================================================
   db-firebase.js — CAPA DE DATOS SOBRE FIRESTORE
   -------------------------------------------------------------------------
   Reemplaza a window.DB (js/db.js) cuando APP_CONFIG.FIREBASE.ENABLED es
   true Y el SDK carga correctamente. Si algo falla, NO se reemplaza nada y
   el sitio sigue con la capa de localStorage: preferimos un sitio que
   funciona con datos locales a una página en blanco.

   ─── POR QUÉ "HIDRATACIÓN" Y NO async EN TODAS PARTES ──────────────────
   La alternativa obvia era convertir cada getter en una promesa. Eso obliga
   a poner `await` en centenares de sitios de las siete páginas, con un
   riesgo de error alto y ningún beneficio real para este volumen de datos.

   En su lugar: al arrancar se cargan los datos UNA vez en memoria (DB.ready),
   y a partir de ahí todos los getters siguen siendo síncronos e idénticos a
   los de js/db.js. Las escrituras van a Firestore y actualizan la memoria.

   ─── COSTE DE LECTURAS ─────────────────────────────────────────────────
   El directorio son 1.179 vendors. Guardado como un documento por vendor,
   cada visita costaría 1.179 lecturas y el plan gratuito (50.000/día) se
   agotaría en ~42 visitas. Por eso va troceado en 8 documentos + metadatos,
   y además se cachea en localStorage por número de versión: si el directorio
   no cambió, una visita cuesta UNA lectura (la de `directory/meta`).
   ========================================================================= */
(function () {

  const CFG = window.APP_CONFIG || {};
  const LOCAL = window.DB;             // la capa de localStorage, como respaldo
  const CACHE_KEY = "tvh_fs_directory";

  if (!LOCAL) { console.error("[DB] db.js must load before db-firebase.js"); return; }

  /* La capa local expone `ready` ya resuelto, así que las páginas pueden
     hacer DB.ready.then(...) sin saber cuál de las dos está activa. */
  if (!LOCAL.ready) LOCAL.ready = Promise.resolve({ backend: "local" });

  if (!window.FB || !FB.enabled) return;   // Firebase apagado: no tocamos nada

  /* =======================================================================
     ESTADO EN MEMORIA
     ===================================================================== */
  const mem = {
    user: null,        // documento del usuario con sesión (o null)
    claims: {},        // custom claims del token (rol)
    listings: [],      // directorio
    reviews: [],       // { id, vendorId, pmId, pmName, stars, comment, createdAt }
    claimsList: [],    // solicitudes de reclamación
    users: []          // solo lo ve el admin; para el resto, [] o su propio doc
  };

  let db = null, auth = null;

  /* =======================================================================
     CARGA DEL DIRECTORIO (con caché por versión)
     ===================================================================== */
  async function loadDirectory() {
    const metaSnap = await db.collection("directory").doc("meta").get();
    if (!metaSnap.exists) return [];
    const meta = metaSnap.data();

    // ¿Tenemos ya esta versión guardada del navegador?
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.version === meta.version && Array.isArray(cached.items)) {
          return cached.items;      // coste: 1 lectura
        }
      }
    } catch (e) { /* caché corrupta: se ignora y se recarga */ }

    // Descarga de los trozos (coste: nº de trozos, hoy 8)
    const ids = [];
    for (let i = 0; i < (meta.chunks || 0); i++) ids.push("chunk-" + String(i).padStart(3, "0"));
    const snaps = await Promise.all(ids.map(id => db.collection("directory").doc(id).get()));

    const items = [];
    snaps.forEach(s => { if (s.exists) items.push.apply(items, s.data().items || []); });

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: meta.version, items }));
    } catch (e) { /* sin espacio: funciona igual, solo se relee la próxima vez */ }

    return items;
  }

  /* =======================================================================
     ARRANQUE
     ===================================================================== */
  async function boot() {
    const st = await FB.ready;
    if (!st.available) {
      console.warn("[DB] Firebase unavailable; keeping the local layer.");
      return { backend: "local", reason: st.error };
    }

    db = FB.db;
    auth = FB.auth;

    /* Esperamos a saber si hay sesión antes de decidir qué se puede leer.

       ⚠️  El `off()` NO puede llamarse a secas dentro del callback: si
       Firebase ya conoce el estado, lo invoca de inmediato y en ese momento
       la constante todavía no está asignada. Eso lanzaba un ReferenceError
       que Firebase se tragaba, la promesa no se resolvía nunca y la página
       se quedaba esperando en blanco, sin ningún error visible.

       Y un tiempo máximo: si Firebase no responde, es preferible seguir sin
       sesión que dejar el sitio colgado. */
    const fbUser = await new Promise(resolve => {
      let off = null, done = false;
      const finish = u => {
        if (done) return;
        done = true;
        if (typeof off === "function") off();
        resolve(u);
      };
      off = auth.onAuthStateChanged(finish, err => {
        console.error("[DB] onAuthStateChanged failed:", err);
        finish(null);
      });
      setTimeout(() => finish(null), 10000);
    });

    if (fbUser) {
      const token = await fbUser.getIdTokenResult();
      mem.claims = token.claims || {};

      const doc = await db.collection("users").doc(fbUser.uid).get();
      mem.user = doc.exists
        ? Object.assign({ id: fbUser.uid }, doc.data())
        : null;

      // El rol manda desde el CLAIM del token, no desde el documento: el
      // documento lo puede editar su dueño, el claim solo el servidor.
      if (mem.user) mem.user.role = mem.claims.role || mem.user.role;

      /* Las reglas exigen correo verificado para leer el directorio. Sin
         verificar, la sesión existe pero no hay datos que mostrar. */
      /* Cada carga va por separado y tolera su propio fallo.

         Antes iban encadenadas: si UNA fallaba, el arranque entero se caía,
         la app volvía a la capa local —donde no hay sesión— y el usuario
         acababa expulsado a la pantalla de registro segundos después de
         entrar. Perder la sesión porque una consulta secundaria falle es
         desproporcionado: es mejor entrar con parte de los datos y dejar el
         motivo en la consola. */
      if (fbUser.emailVerified) {
        const safe = (label, p) => p.catch(err => {
          console.error("[DB] Could not load " + label + ":", err);
          return null;
        });

        const [listings, reviews, claimsList, users] = await Promise.all([
          safe("the directory", loadDirectory()),
          safe("reviews", loadReviews()),
          safe("claims", loadClaims(fbUser.uid)),
          mem.claims.role === "admin" ? safe("accounts", loadUsers()) : Promise.resolve(null)
        ]);

        if (listings)   mem.listings = listings;
        if (reviews)    mem.reviews = reviews;
        if (claimsList) mem.claimsList = claimsList;
        if (users)      mem.users = users;
      }
    }

    // Sustituimos la capa local por esta.
    window.DB = api;
    api.ready = Promise.resolve({ backend: "firestore" });
    return { backend: "firestore" };
  }

  async function loadReviews() {
    const snap = await db.collection("reviews").get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }

  async function loadClaims(uid) {
    // El admin ve todas; el resto, solo las suyas (así lo imponen las reglas).
    const q = mem.claims.role === "admin"
      ? db.collection("claims")
      : db.collection("claims").where("userId", "==", uid);
    const snap = await q.get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }

  async function loadUsers() {
    const snap = await db.collection("users").get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  }

  /* =======================================================================
     API — misma forma que js/db.js
     Lo que no depende del origen de los datos (mercados, ZIP, utilidades)
     se reutiliza tal cual de la capa local en vez de duplicarlo.
     ===================================================================== */
  const api = Object.create(LOCAL);

  // ---- sesión y usuarios ----
  api.getCurrentUser = () => mem.user;
  api.isAdmin = u => !!(u && u.role === "admin");
  api.getUsers = () => mem.users;
  api.getUserById = id => (mem.user && mem.user.id === id)
    ? mem.user
    : (mem.users.find(u => u.id === id) || null);
  api.findUserByEmail = email => {
    const clean = LOCAL.normalizeEmail(email);
    return mem.users.find(u => LOCAL.normalizeEmail(u.email) === clean) || null;
  };

  api.updateUser = function (id, patch) {
    const target = api.getUserById(id);
    if (!target) return false;
    // Optimista en memoria; Firestore confirma después.
    if (patch.profile) target.profile = Object.assign({}, target.profile, patch.profile);
    Object.keys(patch).forEach(k => { if (k !== "profile") target[k] = patch[k]; });

    const payload = {};
    Object.keys(patch).forEach(k => {
      payload[k === "profile" ? "profile" : k] = k === "profile" ? target.profile : patch[k];
    });
    payload.updatedAt = Date.now();

    db.collection("users").doc(id).set(payload, { merge: true })
      .catch(err => console.error("[DB] Could not save the profile:", err));
    return true;
  };

  api.deleteUser = function (id) {
    db.collection("users").doc(id).delete()
      .catch(err => console.error("[DB] Could not delete the account:", err));
    mem.users = mem.users.filter(u => u.id !== id);
    return true;
  };

  api.clearSession = function () { if (auth) auth.signOut(); mem.user = null; };
  api.setSession = function () { /* la gestiona Firebase Auth */ };

  // ---- directorio y vendors ----
  api.getListings = () => mem.listings;
  api.getListingByRef = ref => mem.listings.find(l => l.ref === ref) || null;

  function reviewsFor(vendorId) {
    return mem.reviews.filter(r => r.vendorId === vendorId);
  }

  function listingToVendor(l) {
    return {
      id: "l_" + l.ref, kind: "listing", ref: l.ref,
      email: l.email || null, role: "vendor", claimed: !!l.claimedBy,
      reviews: reviewsFor("l_" + l.ref),
      profile: {
        businessName: l.name || "", vendorMeldName: l.meld || "",
        contactName: "", addressLine: "", city: "", state: (l.states || [])[0] || "",
        zip: "", phone: "", website: "", about: "", yearsActive: "", employees: "",
        license: "", licenses: [], avatar: null,
        services: l.services || [], zips: l.zips || []
      }
    };
  }

  function accountToVendor(u) {
    return {
      id: u.id, kind: "account", ref: u.claimedRef || null, email: u.email,
      role: u.role, claimed: true, reviews: reviewsFor(u.id),
      profile: u.profile || {}
    };
  }

  api.getAllVendors = function () {
    const accounts = mem.users
      .filter(u => u.role === "vendor" && u.status !== "suspended")
      .map(accountToVendor);
    // El propio usuario puede no estar en mem.users si no es admin.
    if (mem.user && mem.user.role === "vendor" && !accounts.some(a => a.id === mem.user.id)) {
      accounts.push(accountToVendor(mem.user));
    }
    const listings = mem.listings
      .filter(l => !l.hidden && !l.claimedBy)
      .map(listingToVendor);
    return accounts.concat(listings);
  };

  api.getVendorById = function (id) {
    if (!id) return null;
    if (id.indexOf("l_") === 0) {
      const l = api.getListingByRef(id.slice(2));
      return (l && !l.hidden) ? listingToVendor(l) : null;
    }
    const u = api.getUserById(id);
    return (u && u.role === "vendor" && u.status !== "suspended") ? accountToVendor(u) : null;
  };

  api.updateListing = function (ref, patch) {
    const l = api.getListingByRef(ref);
    if (l) Object.assign(l, patch);
    // El directorio va troceado, así que un cambio puntual se guarda aparte
    // y el administrador lo consolida al reimportar con tools/upload-directory.js
    db.collection("directory").doc("overrides").set(
      { [ref]: patch }, { merge: true }
    ).catch(err => console.error("[DB] Could not update the listing:", err));
    return true;
  };

  // ---- reseñas ----
  api.getReviews = vendorId => reviewsFor(vendorId);

  api.addOrUpdateReview = function (vendorId, { pmId, pmName, stars, comment }) {
    const review = {
      vendorId, pmId,
      pmName: pmName || "Property Manager",
      stars: Math.max(1, Math.min(5, Math.round(Number(stars) || 0))),
      comment: String(comment || "").trim().slice(0, 1000),
      createdAt: Date.now()
    };
    if (review.stars < 1) return false;

    // El id del documento impone "una reseña por PM y vendor" en el servidor.
    const docId = vendorId + "__" + pmId;
    const i = mem.reviews.findIndex(r => r.id === docId);
    const withId = Object.assign({ id: docId }, review);
    if (i > -1) mem.reviews[i] = withId; else mem.reviews.push(withId);

    db.collection("reviews").doc(docId).set(review)
      .catch(err => console.error("[DB] Could not save the review:", err));
    return true;
  };

  // ---- reclamaciones ----
  api.getClaims = () => mem.claimsList;

  api.createClaim = function (userId, ref, note) {
    const listing = api.getListingByRef(ref);
    if (!listing || listing.claimedBy) return { ok: false, error: "That listing is not available to claim." };
    if (mem.claimsList.some(c => c.userId === userId && c.ref === ref && c.status === "pending")) {
      return { ok: false, error: "You already have a pending request for this listing." };
    }
    const id = LOCAL.genId("c");
    const claim = { userId, ref, note: String(note || "").trim().slice(0, 500),
                    status: "pending", createdAt: Date.now() };
    mem.claimsList.push(Object.assign({ id }, claim));
    db.collection("claims").doc(id).set(claim)
      .catch(err => console.error("[DB] Could not submit the claim:", err));
    return { ok: true, claim: Object.assign({ id }, claim) };
  };

  api.resolveClaim = function (claimId, decision, adminUser) {
    if (!api.isAdmin(adminUser)) return { ok: false, error: "Only an administrator can do that." };
    const claim = mem.claimsList.find(c => c.id === claimId);
    if (!claim || claim.status !== "pending") return { ok: false, error: "Request not found." };

    if (decision === "approved") {
      const listing = api.getListingByRef(claim.ref);
      const user = api.getUserById(claim.userId);
      if (!listing || !user) return { ok: false, error: "The listing or the account no longer exists." };
      api.updateListing(claim.ref, { claimedBy: user.id });
      const p = user.profile || {};
      api.updateUser(user.id, {
        claimedRef: claim.ref,
        profile: {
          businessName: p.businessName || listing.name || "",
          vendorMeldName: p.vendorMeldName || listing.meld || "",
          services: Array.from(new Set([].concat(p.services || [], listing.services || []))),
          zips: Array.from(new Set([].concat(p.zips || [], listing.zips || []))).sort()
        }
      });
    }

    claim.status = decision;
    claim.resolvedAt = Date.now();
    claim.resolvedBy = adminUser.id;
    db.collection("claims").doc(claimId)
      .set({ status: decision, resolvedAt: claim.resolvedAt, resolvedBy: adminUser.id }, { merge: true })
      .catch(err => console.error("[DB] Could not resolve the claim:", err));

    api.logAction(adminUser, decision === "approved" ? "claim.approve" : "claim.reject",
                  { claimId, ref: claim.ref });
    return { ok: true };
  };

  // ---- auditoría ----
  api.logAction = function (actor, action, details) {
    if (!db) return;
    db.collection("audit").add({
      at: Date.now(),
      actorId: actor ? actor.id : null,
      actorEmail: actor ? actor.email : null,
      action, details: details || {}
    }).catch(() => { /* el registro no debe romper la acción principal */ });
  };

  api.getAuditLog = function () { return []; };   // se consulta bajo demanda

  api.loadAuditLog = async function () {
    const snap = await db.collection("audit").orderBy("at", "desc").limit(50).get();
    return snap.docs.map(d => d.data());
  };

  // ---- copia de seguridad / almacenamiento ----
  api.exportData = () => ({
    schema: 3, exportedAt: new Date().toISOString(),
    users: mem.users, listings: mem.listings,
    claims: mem.claimsList, reviews: mem.reviews
  });

  api.importData = () => ({
    ok: false,
    error: "With Firebase enabled, restore a backup from the Firebase console instead."
  });

  api.getStorageUsage = () => ({ bytes: 0, limit: 0, percent: 0, cloud: true });

  api.resetDemo = () => {
    console.warn("[DB] resetDemo does not apply with Firestore.");
  };

  // ---- utilidades que sí dependen de los datos ----
  api.getRatingSummary = function (vendor) {
    const reviews = (vendor && Array.isArray(vendor.reviews)) ? vendor.reviews : [];
    if (!reviews.length) return { avg: 0, count: 0 };
    const total = reviews.reduce((s, r) => s + (Number(r.stars) || 0), 0);
    return { avg: total / reviews.length, count: reviews.length };
  };

  /* =======================================================================
     ÍNDICES DE BÚSQUEDA
     -----------------------------------------------------------------------
     ⚠️  Esto NO se puede heredar de la capa local por el prototipo.
     `buildIndexes` y compañía son cierres sobre el `getAllVendors` interno
     de js/db.js, así que llamarlas desde aquí devolvería los vendors de
     localStorage en lugar de los de Firestore — y en silencio, que es lo
     peor. Se reimplementan sobre los datos en memoria.

     Los ayudantes de mercados y códigos postales (marketZips, lookupZip,
     coverageSummary, vendorCoversZip…) SÍ se heredan sin problema: dependen
     solo de window.MARKETS y del vendor que se les pasa.
     ===================================================================== */
  let indexes = null;

  function buildIndexes() {
    const vendors = api.getAllVendors();
    const byMarket = new Map(), byZip = new Map(), byId = new Map();

    const zipToMarkets = new Map();
    const ms = window.MARKETS || {};
    Object.keys(ms).forEach(mid => {
      Object.keys(ms[mid].counties).forEach(cty => {
        const cities = ms[mid].counties[cty].cities || {};
        Object.keys(cities).forEach(city => {
          cities[city].forEach(z => {
            if (!zipToMarkets.has(z)) zipToMarkets.set(z, new Set());
            zipToMarkets.get(z).add(mid);
          });
        });
      });
    });

    vendors.forEach(v => {
      byId.set(v.id, v);
      const seen = new Set();
      ((v.profile && v.profile.zips) || []).forEach(z => {
        if (!byZip.has(z)) byZip.set(z, []);
        byZip.get(z).push(v);
        (zipToMarkets.get(z) || []).forEach(mid => seen.add(mid));
      });
      seen.forEach(mid => {
        if (!byMarket.has(mid)) byMarket.set(mid, []);
        byMarket.get(mid).push(v);
      });
    });

    indexes = { vendors, byMarket, byZip, byId };
    return indexes;
  }

  function idx() { return indexes || buildIndexes(); }
  function invalidate() { indexes = null; }

  api.vendorsInMarket = mid => idx().byMarket.get(mid) || [];
  api.vendorsInZip = z => idx().byZip.get(String(z).trim()) || [];

  api.countVendorsInMarketWithServices = function (mid, serviceSet) {
    let n = 0;
    for (const v of api.vendorsInMarket(mid)) {
      const services = (v.profile && v.profile.services) || [];
      for (const s of services) { if (serviceSet.has(s)) { n++; break; } }
    }
    return n;
  };

  api.countVendorsByMarket = function () {
    const out = {};
    Object.keys(window.MARKETS || {}).forEach(mid => { out[mid] = 0; });
    idx().byMarket.forEach((list, mid) => { out[mid] = list.length; });
    return out;
  };

  // Cualquier escritura que cambie la cobertura invalida los índices.
  const _updateUser = api.updateUser;
  api.updateUser = function (id, patch) { invalidate(); return _updateUser(id, patch); };
  const _updateListing = api.updateListing;
  api.updateListing = function (ref, patch) { invalidate(); return _updateListing(ref, patch); };

  api.ready = boot().then(r => { invalidate(); return r; }).catch(err => {
    console.error("[DB] Firestore boot failed; keeping the local layer.", err);
    return { backend: "local", reason: err.message };
  });

  // Mientras arranca, DB.ready ya existe y las páginas pueden esperarlo.
  LOCAL.ready = api.ready;
})();
