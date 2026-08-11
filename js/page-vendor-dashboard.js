/* =========================================================================
   page-vendor-dashboard.js — editor del perfil del vendor, con cobertura
   jerárquica: Estado → Condados → Ciudades.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("vendor", "auth.html?role=vendor");
  if(!user) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "My profile" }
  ], true);

  const CFG = window.APP_CONFIG || {};
  const UP = CFG.UPLOADS || {};

  const $ = sel => document.querySelector(sel);
  const profile = user.profile || {};

  // ─── Estado editable ─────────────────────────────────
  let selectedServices = new Set(profile.services || []);
  // Se declara AQUÍ, con el resto del estado, porque renderProfileStatus()
  // se ejecuta antes que el selector de ZIP y ya la necesita.
  const selectedZips = new Set(Array.isArray(profile.zips) ? profile.zips : []);
  let avatar = profile.avatar || null;
  let licenses = Array.isArray(profile.licenses) ? profile.licenses.slice() : [];

  // ─── Campos de texto ─────────────────────────────────
  const FIELD_IDS = ["businessName","contactName","addressLine","city","state","zip",
                     "phone","website","about","yearsActive","employees","license"];
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if(el && profile[id] != null) el.value = profile[id];
  });
  $("#email").value = user.email;

  const viewBtn = document.getElementById("viewProfileBtn");
  if(viewBtn) viewBtn.href = `vendor.html?id=${encodeURIComponent(user.id)}`;

  // ─── Estado del perfil ("incompleto" / "completo") ───
  function currentProfileSnapshot(){
    const snap = {};
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);       // sin el guard, quitar un
      snap[id] = el ? (el.value || "").trim() : ""; // campo del HTML rompía la página entera
    });
    snap.services = Array.from(selectedServices);
    snap.zips = Array.from(selectedZips);
    return snap;
  }

  function renderProfileStatus(){
    const box = document.getElementById("profileStatus");
    if(!box) return;
    const status = DB.getProfileCompleteness({ profile: currentProfileSnapshot() });
    box.innerHTML = status.complete
      ? `<div class="status-banner complete">
           <span class="status-ico">✓</span>
           <div><strong>Profile complete</strong> · your profile is ready for property managers to see.</div>
         </div>`
      : `<div class="status-banner incomplete">
           <span class="status-ico">!</span>
           <div>
             <strong>Profile incomplete</strong> · ${status.filled} of ${status.total} done.
             Please add: ${status.missing.map(m => `<span class="miss-tag">${UI.escapeHtml(m)}</span>`).join(" ")}
           </div>
         </div>`;
  }
  renderProfileStatus();

  /* ─── Estado de la reclamación de ficha ───────────────
     Si el vendor todavía no está vinculado a una ficha del directorio, le
     mostramos aquí en qué punto está su solicitud. */
  function renderClaimStatus(){
    const box = document.getElementById("claimStatus");
    if(!box) return;

    if(user.claimedRef){
      const listing = DB.getListingByRef(user.claimedRef);
      box.innerHTML = `<div class="status-banner complete">
          <span class="status-ico">🏷️</span>
          <div><strong>Directory listing linked</strong> · ${UI.escapeHtml(listing ? listing.name : user.claimedRef)}</div>
        </div>`;
      return;
    }

    const mine = DB.getClaims().filter(c => c.userId === user.id);
    const pending = mine.find(c => c.status === "pending");
    if(pending){
      const listing = DB.getListingByRef(pending.ref);
      box.innerHTML = `<div class="status-banner pending">
          <span class="status-ico">⏳</span>
          <div><strong>Claim under review</strong> · ${UI.escapeHtml(listing ? listing.name : pending.ref)}.
               An administrator will approve or reject it shortly.</div>
        </div>`;
      return;
    }
    const rejected = mine.find(c => c.status === "rejected");
    if(rejected){
      box.innerHTML = `<div class="status-banner incomplete">
          <span class="status-ico">!</span>
          <div><strong>Claim rejected</strong> · contact the administrator if you think this was a mistake.</div>
        </div>`;
      return;
    }
    box.innerHTML = "";
  }
  renderClaimStatus();

  /* =====================================================================
     AVATAR
     Las imágenes se COMPRIMEN antes de guardarse. Una foto de 4 MB ocupa
     ~5,5 MB en base64 y agota ella sola toda la cuota del navegador.
     ===================================================================== */
  function paintAvatar(){
    const slot = $("#avatarUpload");
    const safe = UI.safeImageSrc(avatar);
    slot.innerHTML = safe
      ? `<img src="${UI.escapeHtml(safe)}" alt="Profile photo"/>
         <input type="file" id="avatarFile" hidden accept="image/*" />`
      : `<div class="avatar-text">
           <div class="camera-icon">📷</div>
           Upload profile photo
         </div>
         <input type="file" id="avatarFile" hidden accept="image/*" />`;
    // Re-enlazamos porque acabamos de reemplazar el innerHTML.
    slot.addEventListener("click", openFile);
    document.getElementById("avatarFile").addEventListener("change", handleAvatarChange);
  }

  function openFile(){ document.getElementById("avatarFile").click(); }

  async function handleAvatarChange(e){
    const file = e.target.files[0];
    if(!file) return;

    const allowed = UP.ALLOWED_IMAGE_TYPES || ["image/jpeg","image/png","image/webp","image/gif"];
    if(allowed.indexOf(file.type) === -1){
      UI.showToast("Please choose a JPG, PNG, WebP or GIF image.", "error");
      e.target.value = "";
      return;
    }
    if(file.size > (UP.MAX_AVATAR_BYTES || 4 * 1024 * 1024)){
      UI.showToast("That image is too large. Please use one under 4 MB.", "error");
      e.target.value = "";
      return;
    }

    try{
      avatar = await UI.compressImage(file, UP.AVATAR_MAX_DIMENSION || 512, UP.AVATAR_QUALITY || 0.82);
      paintAvatar();
      UI.showToast("Photo ready. Remember to save your profile.", "success");
    }catch(err){
      console.error(err);
      UI.showToast("Could not read that image. Try another file.", "error");
    }
    e.target.value = "";
  }
  paintAvatar();

  /* =====================================================================
     DOCUMENTOS DE LICENCIA
     ===================================================================== */
  const MAX_LICENSE_BYTES = UP.MAX_LICENSE_BYTES || 700 * 1024;
  const MAX_LICENSE_FILES = UP.MAX_LICENSE_FILES || 5;
  const ALLOWED_LICENSE_TYPES = UP.ALLOWED_LICENSE_TYPES ||
    ["application/pdf", "image/jpeg", "image/png", "image/webp"];

  function renderLicenses(){
    const list = $("#licensesList");
    if(licenses.length === 0){ list.innerHTML = ""; return; }

    list.innerHTML = licenses.map((f, i) => {
      const src = UI.safeFileSrc(f.dataURL);
      const isPdf = !!src && src.indexOf("data:application/pdf") === 0;
      const nameHtml = UI.escapeHtml(f.name);
      // Si el adjunto no supera la validación, se muestra sin enlace.
      const label = src
        ? `<a class="file-name" href="${UI.escapeHtml(src)}" target="_blank" rel="noopener noreferrer"
              download="${nameHtml}">${nameHtml}</a>`
        : `<span class="file-name">${nameHtml}</span>`;
      return `
        <div class="file-chip">
          <span class="file-ico">${isPdf ? "📄" : "🖼️"}</span>
          ${label}
          <button type="button" class="file-remove" data-index="${i}" title="Remove" aria-label="Remove ${nameHtml}">✕</button>
        </div>`;
    }).join("");

    list.querySelectorAll(".file-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        licenses.splice(Number(btn.dataset.index), 1);
        renderLicenses();
      });
    });
  }

  $("#licenseDrop").addEventListener("click", () => $("#licenseFile").click());

  $("#licenseFile").addEventListener("change", async e => {
    const file = e.target.files[0];
    if(!file) return;
    e.target.value = "";   // permite volver a subir el mismo archivo

    if(licenses.length >= MAX_LICENSE_FILES){
      UI.showToast(`You can attach up to ${MAX_LICENSE_FILES} documents.`, "error");
      return;
    }
    if(ALLOWED_LICENSE_TYPES.indexOf(file.type) === -1){
      UI.showToast("Only PDF, JPG, PNG or WebP files are allowed.", "error");
      return;
    }
    if(file.size > MAX_LICENSE_BYTES){
      const kb = Math.round(MAX_LICENSE_BYTES / 1024);
      UI.showToast(`That file is larger than ${kb} KB. Please use a smaller file.`, "error");
      return;
    }

    try{
      let dataURL;
      if(file.type === "application/pdf"){
        dataURL = await UI.readFileAsDataURL(file);
      } else {
        // Las imágenes se comprimen: una foto del carnet no necesita 3 MB.
        dataURL = await UI.compressImage(file, 1400, 0.8);
      }
      licenses.push({ name: file.name.slice(0, 120), type: file.type, dataURL, addedAt: Date.now() });
      renderLicenses();
      UI.showToast("Document attached. Remember to save your profile.", "success");
    }catch(err){
      console.error(err);
      UI.showToast("Could not read that file.", "error");
    }
  });
  renderLicenses();

  /* =====================================================================
     SERVICIOS
     ===================================================================== */
  function renderServices(filter = ""){
    const container = $("#servicesContainer");
    const lower = filter.trim().toLowerCase();
    container.innerHTML = "";

    Object.entries(SERVICE_CATEGORIES).forEach(([catName, services]) => {
      const filtered = services.filter(s => s.toLowerCase().includes(lower));
      if(filtered.length === 0) return;
      const div = document.createElement("div");
      div.className = "service-category";
      div.innerHTML = `
        <h4>${UI.escapeHtml(catName)}</h4>
        <div class="service-pills">
          ${filtered.map(s => `
            <button type="button" class="service-pill ${selectedServices.has(s) ? 'selected' : ''}"
              aria-pressed="${selectedServices.has(s)}"
              data-service="${UI.escapeHtml(s)}">${UI.escapeHtml(s)}</button>
          `).join("")}
        </div>
      `;
      container.appendChild(div);
    });

    container.querySelectorAll(".service-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const s = pill.dataset.service;
        if(selectedServices.has(s)) selectedServices.delete(s);
        else selectedServices.add(s);
        pill.classList.toggle("selected");
        pill.setAttribute("aria-pressed", String(selectedServices.has(s)));
        $("#serviceCount").textContent = `${selectedServices.size} selected`;
      });
    });
    $("#serviceCount").textContent = `${selectedServices.size} selected`;
  }
  renderServices();
  $("#serviceSearch").addEventListener("input", UI.debounce(e => renderServices(e.target.value), 150));

  /* =====================================================================
     COBERTURA POR CÓDIGO POSTAL
     ---------------------------------------------------------------------
     Sustituye al mapa de EE. UU. + árbol condado/ciudad con tres modos
     ("estado completo" / "condado completo" / "estas ciudades"). Aquella
     interfaz tenía dos problemas: obligaba a mantener tres reglas distintas
     sincronizadas, y ofrecía los 50 estados cuando la empresa solo opera en
     35 mercados.

     Ahora la selección es una lista plana de ZIP. La jerarquía
     mercado → condado → ciudad sigue ahí, pero solo para navegar y marcar
     en bloque; lo que se guarda son los códigos.
     ===================================================================== */
  const openMarkets = new Set();     // mercados desplegados
  const openCounties = new Set();    // condados desplegados
  let zipQuery = "";
  let onlySelected = false;

  const MARKETS_LIST = DB.getMarkets();

  /* Índice de búsqueda: por cada ciudad, el texto donde buscar. Se construye
     una vez, no en cada tecla. */
  const searchIndex = (function(){
    const rows = [];
    MARKETS_LIST.forEach(m => {
      const market = DB.getMarket(m.id);
      Object.keys(market.counties).forEach(cty => {
        const info = market.counties[cty];
        Object.keys(info.cities).forEach(city => {
          rows.push({
            marketId: m.id, county: cty, city,
            zips: info.cities[city],
            hay: (m.name + " " + cty + " " + city + " " + info.cities[city].join(" ")).toLowerCase()
          });
        });
      });
    });
    return rows;
  })();

  function zipsOfCounty(marketId, county){ return DB.marketZips(marketId, county); }
  function zipsOfMarket(marketId){ return DB.marketZips(marketId); }

  function countSelected(list){
    let n = 0;
    for (const z of list) if (selectedZips.has(z)) n++;
    return n;
  }

  /* Estado de una casilla de grupo: todas, algunas o ninguna. */
  function tri(list){
    const n = countSelected(list);
    if (n === 0) return "none";
    return n === list.length ? "all" : "some";
  }

  function setZips(list, on){
    list.forEach(z => { if (on) selectedZips.add(z); else selectedZips.delete(z); });
  }

  function boxHtml(state){
    const cls = state === "all" ? "checked" : (state === "some" ? "partial" : "");
    const mark = state === "all" ? "✓" : (state === "some" ? "–" : "");
    return `<span class="zip-box ${cls}" aria-hidden="true">${mark}</span>`;
  }

  /* ─── Render ─────────────────────────────────────── */
  function renderZipPicker(){
    const host = $("#zipPicker");
    const q = zipQuery.trim().toLowerCase();

    // Qué ciudades entran, según búsqueda y filtro "solo seleccionados"
    let rows = searchIndex;
    if (q) rows = rows.filter(r => r.hay.includes(q));
    if (onlySelected) rows = rows.filter(r => countSelected(r.zips) > 0);

    if (rows.length === 0){
      host.innerHTML = `<div class="zip-empty">
        ${q ? `No results for “${UI.escapeHtml(zipQuery)}”.`
            : "You haven't selected any ZIP codes yet."}
      </div>`;
      return;
    }

    // Agrupar de nuevo en mercado → condado → ciudades
    const byMarket = new Map();
    rows.forEach(r => {
      if (!byMarket.has(r.marketId)) byMarket.set(r.marketId, new Map());
      const cs = byMarket.get(r.marketId);
      if (!cs.has(r.county)) cs.set(r.county, []);
      cs.get(r.county).push(r);
    });

    // Con búsqueda activa se despliega todo, que es lo que espera quien busca.
    const forceOpen = !!q || onlySelected;

    const html = [];
    MARKETS_LIST.forEach(m => {
      if (!byMarket.has(m.id)) return;
      const counties = byMarket.get(m.id);
      const allZips = zipsOfMarket(m.id);
      const state = tri(allZips);
      const open = forceOpen || openMarkets.has(m.id);
      const sel = countSelected(allZips);

      html.push(`
        <div class="zip-market ${open ? "open" : ""}" data-market="${UI.escapeHtml(m.id)}">
          <div class="zip-market-head">
            <button type="button" class="zip-toggle" data-action="toggle-market"
                    data-market="${UI.escapeHtml(m.id)}" aria-expanded="${open}">▾</button>
            <label class="zip-check" data-action="pick-market" data-market="${UI.escapeHtml(m.id)}"
                   role="checkbox" tabindex="0" aria-checked="${state === "all"}">
              ${boxHtml(state)}
              <span class="zip-name">${UI.escapeHtml(m.name)}</span>
              <span class="zip-state">${UI.escapeHtml((m.states || []).join(" · "))}</span>
            </label>
            <span class="zip-count">${sel} / ${allZips.length}</span>
          </div>
          <div class="zip-market-body">
            ${Array.from(counties.keys()).sort().map(cty => {
              const cZips = zipsOfCounty(m.id, cty);
              const cState = tri(cZips);
              const cKey = m.id + "||" + cty;
              const cOpen = forceOpen || openCounties.has(cKey);
              return `
                <div class="zip-county ${cOpen ? "open" : ""}">
                  <div class="zip-county-head">
                    <button type="button" class="zip-toggle" data-action="toggle-county"
                            data-key="${UI.escapeHtml(cKey)}" aria-expanded="${cOpen}">▾</button>
                    <label class="zip-check" data-action="pick-county"
                           data-market="${UI.escapeHtml(m.id)}" data-county="${UI.escapeHtml(cty)}"
                           role="checkbox" tabindex="0" aria-checked="${cState === "all"}">
                      ${boxHtml(cState)}
                      <span class="zip-name">${UI.escapeHtml(cty)}</span>
                    </label>
                    <span class="zip-count">${countSelected(cZips)} / ${cZips.length}</span>
                  </div>
                  <div class="zip-county-body">
                    ${counties.get(cty).sort((a,b) => a.city.localeCompare(b.city)).map(r => {
                      const rState = tri(r.zips);
                      return `
                        <div class="zip-city">
                          <label class="zip-check" data-action="pick-city"
                                 data-market="${UI.escapeHtml(m.id)}" data-county="${UI.escapeHtml(cty)}"
                                 data-city="${UI.escapeHtml(r.city)}"
                                 role="checkbox" tabindex="0" aria-checked="${rState === "all"}">
                            ${boxHtml(rState)}
                            <span class="zip-name">${UI.escapeHtml(r.city)}</span>
                          </label>
                          <div class="zip-list">
                            ${r.zips.map(z => `
                              <button type="button" class="zip-pill ${selectedZips.has(z) ? "selected" : ""}"
                                      data-action="pick-zip" data-zip="${UI.escapeHtml(z)}"
                                      aria-pressed="${selectedZips.has(z)}">${UI.escapeHtml(z)}</button>
                            `).join("")}
                          </div>
                        </div>`;
                    }).join("")}
                  </div>
                </div>`;
            }).join("")}
          </div>
        </div>`);
    });

    host.innerHTML = html.join("");
    host.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", onZipAction);
      if (el.getAttribute("role") === "checkbox") {
        el.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onZipAction(e); }
        });
      }
    });
  }

  function onZipAction(e){
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const { action, market, county, city, zip, key } = el.dataset;

    if (action === "toggle-market"){
      if (openMarkets.has(market)) openMarkets.delete(market); else openMarkets.add(market);
      renderZipPicker();
      return;
    }
    if (action === "toggle-county"){
      if (openCounties.has(key)) openCounties.delete(key); else openCounties.add(key);
      renderZipPicker();
      return;
    }

    if (action === "pick-market"){
      const list = zipsOfMarket(market);
      setZips(list, tri(list) !== "all");
      openMarkets.add(market);
    } else if (action === "pick-county"){
      const list = zipsOfCounty(market, county);
      setZips(list, tri(list) !== "all");
      openCounties.add(market + "||" + county);
    } else if (action === "pick-city"){
      const m = DB.getMarket(market);
      const list = (m && m.counties[county] && m.counties[county].cities[city]) || [];
      setZips(list, tri(list) !== "all");
    } else if (action === "pick-zip"){
      if (selectedZips.has(zip)) selectedZips.delete(zip); else selectedZips.add(zip);
    }

    refreshCoverage();
  }

  /* Resumen de lo elegido, arriba del selector. */
  function renderZipSummary(){
    const box = $("#zipSelectedSummary");
    if (selectedZips.size === 0){
      box.innerHTML = `<div class="zip-summary-empty">No coverage selected yet — property managers
        won't find you until you pick at least one ZIP code.</div>`;
      return;
    }
    const summary = DB.coverageSummary({ profile: { zips: Array.from(selectedZips) } });
    box.innerHTML = summary.map(s => `
      <span class="zip-chip">
        <strong>${UI.escapeHtml(s.marketName)}</strong>
        ${s.covered} of ${s.total}
        <button type="button" class="zip-chip-x" data-drop-market="${UI.escapeHtml(s.marketId)}"
                title="Remove this market" aria-label="Remove ${UI.escapeHtml(s.marketName)}">✕</button>
      </span>`).join("");

    box.querySelectorAll("[data-drop-market]").forEach(btn => {
      btn.addEventListener("click", () => {
        setZips(zipsOfMarket(btn.dataset.dropMarket), false);
        refreshCoverage();
      });
    });
  }

  function updateAreaCount(){
    const n = selectedZips.size;
    $("#areaCount").textContent = `${n} ZIP ${n === 1 ? "code" : "codes"}`;
  }

  function refreshCoverage(){
    renderZipPicker();
    renderZipSummary();
    updateAreaCount();
    renderProfileStatus();
  }

  $("#zipSearch").addEventListener("input", UI.debounce(e => {
    zipQuery = e.target.value;
    renderZipPicker();
  }, 180));

  $("#zipShowSelected").addEventListener("click", () => {
    onlySelected = !onlySelected;
    $("#zipShowSelected").classList.toggle("active", onlySelected);
    $("#zipShowSelected").textContent = onlySelected ? "Show all" : "Show only selected";
    renderZipPicker();
  });

  $("#zipClearAll").addEventListener("click", () => {
    if (selectedZips.size === 0) return;
    if (!UI.confirmAction(`Remove all ${selectedZips.size} ZIP codes from your coverage?`)) return;
    selectedZips.clear();
    refreshCoverage();
  });

  refreshCoverage();

  /* =====================================================================
     GUARDAR
     ===================================================================== */
  let saving = false;

  function saveProfile(){
    if(saving) return;

    const updates = {};
    FIELD_IDS.forEach(id => {
      const el = document.getElementById(id);
      updates[id] = el ? (el.value || "").trim() : "";
    });

    if(!updates.businessName){
      UI.showToast("Please enter your business name.", "error");
      const el = $("#businessName");
      if(el) el.focus();
      return;
    }

    /* El sitio web se normaliza y se valida. Si alguien escribe
       `javascript:alert(1)` no se guarda: no queremos que ese valor llegue
       nunca a un href. Si escribe "midominio.com" le añadimos https://. */
    if(updates.website){
      const clean = Auth.sanitizeUrl(updates.website);
      if(!clean){
        UI.showToast("That website address is not valid. Use something like https://yourcompany.com", "error");
        const el = $("#website");
        if(el) el.focus();
        return;
      }
      updates.website = clean;
      const el = $("#website");
      if(el) el.value = clean;
    }

    saving = true;
    const profilePatch = Object.assign({}, updates, {
      avatar,
      licenses,
      services: Array.from(selectedServices),
      zips: Array.from(selectedZips).sort()
    });

    const ok = DB.updateUser(user.id, { profile: profilePatch });
    saving = false;

    if(ok){
      UI.showToast("Profile saved! Showing your profile…", "success");
      renderProfileStatus();
      setTimeout(() => {
        window.location.href = `vendor.html?id=${encodeURIComponent(user.id)}`;
      }, 700);
    } else {
      // Causa típica: se superó el límite de almacenamiento del navegador.
      const usage = DB.getStorageUsage();
      UI.showToast(
        `Could not save — browser storage is ${usage.percent}% full. Remove a document or use smaller files.`,
        "error"
      );
    }
  }

  $("#saveBtn").addEventListener("click", saveProfile);
  const saveBtn2 = document.getElementById("saveBtn2");
  if(saveBtn2) saveBtn2.addEventListener("click", saveProfile);

  // Aviso al salir con cambios sin guardar.
  let dirty = false;
  document.addEventListener("input", () => { dirty = true; }, true);
  document.addEventListener("click", e => {
    if(e.target.closest("#saveBtn, #saveBtn2")) dirty = false;
  }, true);
  window.addEventListener("beforeunload", e => {
    if(!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
})();
