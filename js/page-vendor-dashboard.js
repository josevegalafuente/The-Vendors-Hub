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
  // coverage: { estado: { mode: 'full'|'partial', counties: { 'Condado': ['Ciudad', …] } } }
  let coverage = profile.coverage ? JSON.parse(JSON.stringify(profile.coverage)) : {};
  let avatar = profile.avatar || null;
  let licenses = Array.isArray(profile.licenses) ? profile.licenses.slice() : [];
  // Qué condados están desplegados. Antes se perdía en cada redibujado y era
  // molestísimo al ir marcando ciudades una a una.
  const expandedCounties = new Set();

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
    snap.coverage = coverage;
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
     MAPA — rejilla geográfica de 11 columnas
     ===================================================================== */
  const MAP_LAYOUT = [
    ["",  "",  "",  "",  "",  "",  "",  "",  "",  "",  "ME"],
    ["AK","",  "",  "",  "",  "",  "",  "",  "VT","NH",""],
    ["",  "",  "WA","ID","MT","ND","MN","",  "WI","NY","MA"],
    ["",  "",  "OR","UT","WY","SD","IA","IL","MI","PA","CT"],
    ["",  "",  "CA","NV","CO","NE","MO","IN","OH","NJ","RI"],
    ["",  "",  "",  "AZ","NM","KS","AR","KY","WV","MD","DE"],
    ["HI","",  "",  "",  "",  "OK","LA","TN","VA","",  ""],
    ["",  "",  "",  "",  "TX","",  "MS","AL","GA","SC",""],
    ["",  "",  "",  "",  "",  "",  "",  "",  "FL","NC",""]
  ];

  function renderMap(){
    const grid = $("#usMapGrid");
    grid.innerHTML = "";
    MAP_LAYOUT.forEach(row => {
      row.forEach(abbr => {
        const cell = document.createElement("div");
        cell.className = "state-cell";
        if(!abbr){
          cell.classList.add("empty");
          cell.setAttribute("aria-hidden", "true");
        } else {
          cell.textContent = abbr;
          const c = coverage[abbr];
          if(c && c.mode === "full") cell.classList.add("selected");
          else if(c && c.mode === "partial") cell.classList.add("partial");
          const stateName = (STATES_DATA[abbr] || {}).name || abbr;
          cell.title = stateName;
          // Navegable por teclado (antes solo respondía al ratón).
          cell.setAttribute("role", "button");
          cell.setAttribute("tabindex", "0");
          cell.setAttribute("aria-label", stateName);
          cell.setAttribute("aria-pressed", String(!!c));
          cell.addEventListener("click", () => onStateClick(abbr));
          cell.addEventListener("keydown", e => {
            if(e.key === "Enter" || e.key === " "){ e.preventDefault(); onStateClick(abbr); }
          });
        }
        grid.appendChild(cell);
      });
    });
  }

  // Ciclo: sin cobertura → estado completo → por condados → sin cobertura
  function onStateClick(abbr){
    const c = coverage[abbr];
    if(!c) coverage[abbr] = { mode: "full", counties: {} };
    else if(c.mode === "full") coverage[abbr] = { mode: "partial", counties: c.counties || {} };
    else delete coverage[abbr];
    refreshCoverage();
  }

  /* =====================================================================
     EDITOR DE COBERTURA (condados + ciudades por estado)
     ===================================================================== */
  function renderCoverageEditor(){
    const editor = $("#coverageEditor");
    const stateAbbrs = Object.keys(coverage);
    if(stateAbbrs.length === 0){
      editor.innerHTML = `<div class="coverage-editor-empty">Click a state on the map above to start defining your coverage.</div>`;
      return;
    }
    editor.innerHTML = stateAbbrs.map(renderStateBlock).join("");
    editor.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", onCoverageAction);
    });
  }

  function renderStateBlock(abbr){
    const stateData = STATES_DATA[abbr];
    const c = coverage[abbr];
    const isFull = c.mode === "full";
    const totalCounties = stateData ? Object.keys(stateData.counties).length : 0;
    const selectedCounties = Object.keys(c.counties || {}).length;
    const stateName = stateData ? stateData.name : abbr;

    let body;
    if(isFull){
      body = `<div class="coverage-note">
        Full state coverage · all counties and cities in ${UI.escapeHtml(stateName)} are included.
      </div>`;
    } else {
      const counties = stateData ? Object.entries(stateData.counties) : [];
      body = counties.length === 0
        ? `<div class="coverage-note">No county data available for this state.</div>`
        : `<div class="county-list">
             ${counties.map(([countyName, cities]) => renderCountyRow(abbr, countyName, cities)).join("")}
           </div>`;
    }

    return `
      <div class="state-coverage-block" data-state="${UI.escapeHtml(abbr)}">
        <div class="state-coverage-head">
          <div class="state-name">
            <strong>${UI.escapeHtml(abbr)}</strong> · ${UI.escapeHtml(stateName)}
            ${isFull
              ? `<span class="coverage-chip full">Full coverage</span>`
              : `<span class="coverage-chip">${selectedCounties} of ${totalCounties} counties</span>`}
          </div>
          <div class="actions">
            <div class="coverage-mode">
              <button type="button" class="${isFull ? 'active' : ''}" data-action="mode-full" data-state="${UI.escapeHtml(abbr)}">Full state</button>
              <button type="button" class="${!isFull ? 'active' : ''}" data-action="mode-partial" data-state="${UI.escapeHtml(abbr)}">Counties</button>
            </div>
            <button type="button" class="btn btn-sm btn-danger" data-action="remove-state" data-state="${UI.escapeHtml(abbr)}">Remove</button>
          </div>
        </div>
        ${body}
      </div>
    `;
  }

  function countyKey(stateAbbr, countyName){ return stateAbbr + "::" + countyName; }

  function renderCountyRow(stateAbbr, countyName, cities){
    const c = coverage[stateAbbr];
    const selected = (c.counties && c.counties[countyName]) || null;
    // selected = null (no seleccionado) o arreglo de ciudades.
    // Arreglo vacío = condado completo.
    const isCountyFull = selected !== null && selected.length === 0;
    const isCountyPartial = selected !== null && selected.length > 0;
    const isAnySelected = selected !== null;

    const checkboxClass = isCountyFull ? "checked" : (isCountyPartial ? "partial" : "");
    // Recuerda si el usuario lo había desplegado a mano.
    const isExpanded = expandedCounties.has(countyKey(stateAbbr, countyName)) || isAnySelected;
    const collapsed = isExpanded ? "" : "collapsed";

    const sAttr = UI.escapeHtml(stateAbbr);
    const cAttr = UI.escapeHtml(countyName);

    return `
      <div class="county-row ${collapsed}" data-state="${sAttr}" data-county="${cAttr}">
        <div class="county-head">
          <div class="county-checkbox ${checkboxClass}" role="checkbox" tabindex="0"
               aria-checked="${isCountyFull}" aria-label="${cAttr}"
               data-action="toggle-county" data-state="${sAttr}" data-county="${cAttr}">
            ${isCountyFull ? "✓" : (isCountyPartial ? "•" : "")}
          </div>
          <div class="county-name" data-action="expand" data-state="${sAttr}" data-county="${cAttr}">${cAttr}</div>
          <div class="city-count">
            ${isCountyFull ? `All ${cities.length} cities` :
              isCountyPartial ? `${selected.length} of ${cities.length} cities` :
              `${cities.length} cities`}
          </div>
          <span class="toggle-icon" data-action="expand" data-state="${sAttr}" data-county="${cAttr}">▾</span>
        </div>
        <div class="county-cities">
          ${cities.map(city => {
            const cityActive = isCountyFull || (isCountyPartial && selected.includes(city));
            return `<button type="button" class="city-pill ${cityActive ? 'selected' : ''}"
              aria-pressed="${cityActive}"
              data-action="toggle-city" data-state="${sAttr}" data-county="${cAttr}"
              data-city="${UI.escapeHtml(city)}">${UI.escapeHtml(city)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function onCoverageAction(e){
    e.stopPropagation();
    const el = e.currentTarget;
    const { action, state: stateAbbr, county: countyName, city: cityName } = el.dataset;

    if(action === "expand"){
      // Solo abre/cierra: no hace falta redibujar nada.
      const row = el.closest(".county-row");
      if(row){
        row.classList.toggle("collapsed");
        const key = countyKey(stateAbbr, countyName);
        if(row.classList.contains("collapsed")) expandedCounties.delete(key);
        else expandedCounties.add(key);
      }
      return;
    }

    if(action === "mode-full"){
      coverage[stateAbbr] = { mode: "full", counties: {} };
    }
    else if(action === "mode-partial"){
      const cur = coverage[stateAbbr];
      coverage[stateAbbr] = { mode: "partial", counties: (cur && cur.counties) || {} };
    }
    else if(action === "remove-state"){
      delete coverage[stateAbbr];
    }
    else if(action === "toggle-county"){
      const c = coverage[stateAbbr];
      if(!c.counties) c.counties = {};
      if(c.counties[countyName] !== undefined) delete c.counties[countyName];
      else c.counties[countyName] = [];        // arreglo vacío = todas las ciudades
      expandedCounties.add(countyKey(stateAbbr, countyName));
    }
    else if(action === "toggle-city"){
      const c = coverage[stateAbbr];
      if(!c.counties) c.counties = {};
      const stateData = STATES_DATA[stateAbbr];
      const allCities = (stateData && stateData.counties && stateData.counties[countyName]) || [];
      let current = c.counties[countyName];

      if(current === undefined){
        c.counties[countyName] = [cityName];                       // aún sin condado → esta ciudad
      } else if(current.length === 0){
        c.counties[countyName] = allCities.filter(ci => ci !== cityName);  // estaba completo → todas menos esta
      } else {
        current = current.includes(cityName)
          ? current.filter(ci => ci !== cityName)
          : current.concat([cityName]);
        if(current.length === 0) delete c.counties[countyName];           // ninguna → fuera el condado
        else if(current.length === allCities.length) c.counties[countyName] = [];  // todas → condado completo
        else c.counties[countyName] = current;
      }
      expandedCounties.add(countyKey(stateAbbr, countyName));
    }

    refreshCoverage();
  }

  function updateAreaCount(){
    let count = 0;
    Object.values(coverage).forEach(c => {
      if(c.mode === "full") count += 1;
      else count += Object.keys(c.counties || {}).length;
    });
    $("#areaCount").textContent = `${count} ${count === 1 ? "area" : "areas"}`;
  }

  function refreshCoverage(){
    renderMap();
    renderCoverageEditor();
    updateAreaCount();
    renderProfileStatus();
  }
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
      coverage
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
