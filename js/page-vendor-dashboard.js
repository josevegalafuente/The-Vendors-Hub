/* =========================================================================
   Vendor Dashboard — profile editor with hierarchical coverage:
   State → Counties → Cities
   ========================================================================= */
(function(){
  // Auth guard
  const user = Auth.requireRole("vendor", "auth.html?role=vendor");
  if(!user) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "My profile" }
  ], true);

  const $ = sel => document.querySelector(sel);
  const profile = user.profile || {};

  // ─── Selection state (mutable) ───────────────────────
  let selectedServices = new Set(profile.services || []);
  // coverage: { stateAbbr: { mode: 'full'|'partial', counties: { 'County': ['City1', ...] } } }
  let coverage = profile.coverage ? JSON.parse(JSON.stringify(profile.coverage)) : {};
  let avatar = profile.avatar || null;
  // Licencias adjuntas: arreglo de { name, type, dataURL }
  let licenses = Array.isArray(profile.licenses) ? profile.licenses.slice() : [];

  // ─── Populate text fields ────────────────────────────
  const FIELD_IDS = ["businessName","contactName","addressLine","city","state","zip","phone","website","about","yearsActive","employees","license"];
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if(el && profile[id] != null) el.value = profile[id];
  });
  $("#email").value = user.email;

  // Enlace para ver el perfil público propio
  const viewBtn = document.getElementById("viewProfileBtn");
  if(viewBtn) viewBtn.href = `vendor.html?id=${user.id}`;

  // ─── Estado del perfil: "Profile incomplete" / "Profile complete" ───
  // Lee de un objeto de perfil "en vivo" (lo que hay en pantalla + selecciones),
  // para que el aviso se actualice al guardar.
  function currentProfileSnapshot(){
    const snap = {};
    FIELD_IDS.forEach(id => { snap[id] = (document.getElementById(id).value || "").trim(); });
    snap.services = Array.from(selectedServices);
    snap.coverage = coverage;
    return snap;
  }

  function renderProfileStatus(){
    const box = document.getElementById("profileStatus");
    if(!box) return;
    const status = Storage.getProfileCompleteness({ profile: currentProfileSnapshot() });
    if(status.complete){
      box.innerHTML = `
        <div class="status-banner complete">
          <span class="status-ico">✓</span>
          <div><strong>Profile complete</strong> · your profile is ready for property managers to see.</div>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="status-banner incomplete">
          <span class="status-ico">!</span>
          <div>
            <strong>Profile incomplete</strong> · ${status.filled} of ${status.total} done.
            Please add: ${status.missing.map(m => `<span class="miss-tag">${UI.escapeHtml(m)}</span>`).join(" ")}
          </div>
        </div>`;
    }
  }
  renderProfileStatus();

  // ─── Avatar upload ───────────────────────────────────
  function paintAvatar(){
    const slot = $("#avatarUpload");
    if(avatar){
      slot.innerHTML = `<img src="${avatar}" alt="Avatar"/><input type="file" id="avatarFile" hidden accept="image/*" />`;
    } else {
      slot.innerHTML = `
        <div class="avatar-text">
          <div class="camera-icon">📷</div>
          Upload profile photo
        </div>
        <input type="file" id="avatarFile" hidden accept="image/*" />
      `;
    }
    // Re-bind because we replaced innerHTML
    $("#avatarUpload").addEventListener("click", openFile);
    document.getElementById("avatarFile").addEventListener("change", handleAvatarChange);
  }
  function openFile(){ document.getElementById("avatarFile").click(); }
  function handleAvatarChange(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      avatar = ev.target.result;
      paintAvatar();
    };
    reader.readAsDataURL(file);
  }
  paintAvatar();

  // ─── License documents (file attachments) ────────────
  const MAX_LICENSE_BYTES = 2 * 1024 * 1024; // ~2 MB por archivo

  function renderLicenses(){
    const list = $("#licensesList");
    if(licenses.length === 0){
      list.innerHTML = "";
      return;
    }
    list.innerHTML = licenses.map((f, i) => `
      <div class="file-chip">
        <span class="file-ico">${f.type && f.type.indexOf("pdf") > -1 ? "📄" : "🖼️"}</span>
        <a class="file-name" href="${f.dataURL}" target="_blank" rel="noopener" download="${UI.escapeHtml(f.name)}">${UI.escapeHtml(f.name)}</a>
        <button type="button" class="file-remove" data-index="${i}" title="Remove">✕</button>
      </div>
    `).join("");
    list.querySelectorAll(".file-remove").forEach(btn => {
      btn.addEventListener("click", () => {
        licenses.splice(Number(btn.dataset.index), 1);
        renderLicenses();
      });
    });
  }

  $("#licenseDrop").addEventListener("click", () => $("#licenseFile").click());
  $("#licenseFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > MAX_LICENSE_BYTES){
      UI.showToast("That file is larger than 2 MB. Please use a smaller file.", "error");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      licenses.push({ name: file.name, type: file.type, dataURL: ev.target.result });
      renderLicenses();
      e.target.value = ""; // permite volver a subir el mismo archivo si hace falta
    };
    reader.readAsDataURL(file);
  });
  renderLicenses();

  // ─── Services ────────────────────────────────────────
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
        $("#serviceCount").textContent = `${selectedServices.size} selected`;
      });
    });
    $("#serviceCount").textContent = `${selectedServices.size} selected`;
  }
  renderServices();
  $("#serviceSearch").addEventListener("input", e => renderServices(e.target.value));

  // ─── Map: geographic 11-col grid ─────────────────────
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
        if(!abbr){ cell.classList.add("empty"); }
        else {
          cell.textContent = abbr;
          const c = coverage[abbr];
          if(c && c.mode === "full") cell.classList.add("selected");
          else if(c && c.mode === "partial") cell.classList.add("partial");
          cell.title = (STATES_DATA[abbr] || {}).name || abbr;
          cell.addEventListener("click", () => onStateClick(abbr));
        }
        grid.appendChild(cell);
      });
    });
  }

  function onStateClick(abbr){
    const c = coverage[abbr];
    if(!c){
      // No coverage → full
      coverage[abbr] = { mode: "full", counties: {} };
    } else if(c.mode === "full"){
      // Full → partial (initialize empty counties)
      coverage[abbr] = { mode: "partial", counties: {} };
    } else {
      // Partial → none (only if no counties selected, otherwise just go to full again? Let's clear)
      delete coverage[abbr];
    }
    renderMap();
    renderCoverageEditor();
    updateAreaCount();
  }

  // ─── Coverage editor (counties + cities per state) ───
  function renderCoverageEditor(){
    const editor = $("#coverageEditor");
    const stateAbbrs = Object.keys(coverage);
    if(stateAbbrs.length === 0){
      editor.innerHTML = `<div class="coverage-editor-empty">Click a state on the map above to start defining your coverage.</div>`;
      return;
    }
    editor.innerHTML = stateAbbrs.map(abbr => renderStateBlock(abbr)).join("");
    bindStateBlockEvents();
  }

  function renderStateBlock(abbr){
    const stateData = STATES_DATA[abbr];
    const c = coverage[abbr];
    const isFull = c.mode === "full";
    const totalCounties = stateData ? Object.keys(stateData.counties).length : 0;
    const selectedCounties = Object.keys(c.counties || {}).length;

    let body = "";
    if(isFull){
      body = `<div style="font-family:var(--serif); font-style:italic; color:var(--muted); padding:8px 0;">
        Full state coverage · all counties and cities in ${UI.escapeHtml(stateData.name)} are included.
      </div>`;
    } else {
      // Partial — list every county with its cities
      const counties = stateData ? Object.entries(stateData.counties) : [];
      if(counties.length === 0){
        body = `<div style="color:var(--muted); font-style:italic; padding:8px 0;">No county data available for this state.</div>`;
      } else {
        body = `<div class="county-list">
          ${counties.map(([countyName, cities]) => renderCountyRow(abbr, countyName, cities)).join("")}
        </div>`;
      }
    }

    return `
      <div class="state-coverage-block" data-state="${abbr}">
        <div class="state-coverage-head">
          <div class="state-name">
            <strong>${abbr}</strong> · ${UI.escapeHtml(stateData ? stateData.name : abbr)}
            ${isFull
              ? `<span style="font-size:12px; color:var(--cerulean); font-weight:600; margin-left:10px;">Full coverage</span>`
              : `<span style="font-size:12px; color:var(--muted); font-weight:600; margin-left:10px;">${selectedCounties} of ${totalCounties} counties</span>`
            }
          </div>
          <div class="actions">
            <div class="coverage-mode">
              <button class="${isFull ? 'active' : ''}" data-action="mode-full" data-state="${abbr}">Full state</button>
              <button class="${!isFull ? 'active' : ''}" data-action="mode-partial" data-state="${abbr}">Counties</button>
            </div>
            <button class="btn btn-sm btn-danger" data-action="remove-state" data-state="${abbr}">Remove</button>
          </div>
        </div>
        ${body}
      </div>
    `;
  }

  function renderCountyRow(stateAbbr, countyName, cities){
    const c = coverage[stateAbbr];
    const selected = (c.counties && c.counties[countyName]) || null;
    // selected = null (not selected), or array of city names (subset). Empty array = full county.
    const isCountyFull = selected !== null && selected.length === 0;
    const isCountyPartial = selected !== null && selected.length > 0;
    const isAnySelected = selected !== null;

    const checkboxClass = isCountyFull ? "checked" : (isCountyPartial ? "partial" : "");

    const collapsed = !isAnySelected ? "collapsed" : "";

    return `
      <div class="county-row ${collapsed}" data-state="${stateAbbr}" data-county="${UI.escapeHtml(countyName)}">
        <div class="county-head">
          <div class="county-checkbox ${checkboxClass}" data-action="toggle-county" data-state="${stateAbbr}" data-county="${UI.escapeHtml(countyName)}">
            ${isCountyFull ? "✓" : (isCountyPartial ? "•" : "")}
          </div>
          <div class="county-name" data-action="expand" data-state="${stateAbbr}" data-county="${UI.escapeHtml(countyName)}">${UI.escapeHtml(countyName)}</div>
          <div class="city-count">
            ${isCountyFull ? `All ${cities.length} cities` :
              isCountyPartial ? `${selected.length} of ${cities.length} cities` :
              `${cities.length} cities`}
          </div>
          <span class="toggle-icon" data-action="expand" data-state="${stateAbbr}" data-county="${UI.escapeHtml(countyName)}">▾</span>
        </div>
        <div class="county-cities">
          ${cities.map(city => {
            const cityActive = isCountyFull || (isCountyPartial && selected.includes(city));
            return `<button type="button" class="city-pill ${cityActive ? 'selected' : ''}"
              data-action="toggle-city" data-state="${stateAbbr}" data-county="${UI.escapeHtml(countyName)}" data-city="${UI.escapeHtml(city)}">${UI.escapeHtml(city)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function bindStateBlockEvents(){
    $("#coverageEditor").querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", onCoverageAction);
    });
  }

  function onCoverageAction(e){
    e.stopPropagation();
    const el = e.currentTarget;
    const action = el.dataset.action;
    const stateAbbr = el.dataset.state;
    const countyName = el.dataset.county;
    const cityName = el.dataset.city;

    if(action === "mode-full"){
      coverage[stateAbbr] = { mode: "full", counties: {} };
    }
    else if(action === "mode-partial"){
      // Switch to partial; preserve existing counties
      const cur = coverage[stateAbbr];
      coverage[stateAbbr] = { mode: "partial", counties: (cur && cur.counties) || {} };
    }
    else if(action === "remove-state"){
      delete coverage[stateAbbr];
    }
    else if(action === "toggle-county"){
      const c = coverage[stateAbbr];
      if(!c.counties) c.counties = {};
      if(c.counties[countyName] !== undefined){
        // Currently selected (full or partial) → remove
        delete c.counties[countyName];
      } else {
        // Not selected → add as full county (empty array means "all cities")
        c.counties[countyName] = [];
      }
    }
    else if(action === "expand"){
      const row = el.closest(".county-row");
      if(row) row.classList.toggle("collapsed");
      return; // No re-render needed
    }
    else if(action === "toggle-city"){
      const c = coverage[stateAbbr];
      if(!c.counties) c.counties = {};
      const stateData = STATES_DATA[stateAbbr];
      const allCities = (stateData && stateData.counties && stateData.counties[countyName]) || [];

      let current = c.counties[countyName];
      if(current === undefined){
        // County not yet selected — start with this city
        c.counties[countyName] = [cityName];
      } else if(current.length === 0){
        // Was full — convert to all-but-this
        c.counties[countyName] = allCities.filter(ci => ci !== cityName);
      } else {
        // Partial — toggle this city
        if(current.includes(cityName)){
          current = current.filter(ci => ci !== cityName);
        } else {
          current.push(cityName);
        }
        if(current.length === 0){
          // No cities left — remove county entirely
          delete c.counties[countyName];
        } else if(current.length === allCities.length){
          // All cities selected — collapse to "full county"
          c.counties[countyName] = [];
        } else {
          c.counties[countyName] = current;
        }
      }
    }

    renderMap();
    renderCoverageEditor();
    updateAreaCount();
  }

  function updateAreaCount(){
    let count = 0;
    Object.values(coverage).forEach(c => {
      if(c.mode === "full") count += 1;
      else count += Object.keys(c.counties || {}).length;
    });
    $("#areaCount").textContent = `${count} ${count === 1 ? "area" : "areas"}`;
  }

  renderMap();
  renderCoverageEditor();
  updateAreaCount();

  // ─── Save profile ────────────────────────────────────
  function saveProfile(){
    const updates = {};
    FIELD_IDS.forEach(id => {
      updates[id] = (document.getElementById(id).value || "").trim();
    });

    // Basic validation
    if(!updates.businessName){
      UI.showToast("Please enter your business name.", "error");
      $("#businessName").focus();
      return;
    }

    const profilePatch = {
      ...updates,
      avatar,
      licenses,
      services: Array.from(selectedServices),
      coverage
    };

    const ok = Storage.updateUser(user.id, { profile: profilePatch });
    if(ok){
      UI.showToast("Profile saved! Showing your profile…", "success");
      renderProfileStatus();
      // Redirige a la página del perfil completo (vista, no edición).
      setTimeout(() => { window.location.href = `vendor.html?id=${user.id}`; }, 700);
    } else {
      // Causa típica: superaste el límite de almacenamiento del navegador
      // (fotos/PDF muy grandes). En la Fase B (Firebase) esto desaparece.
      UI.showToast("Could not save. Storage is full, try smaller files.", "error");
    }
  }

  $("#saveBtn").addEventListener("click", saveProfile);
  const saveBtn2 = document.getElementById("saveBtn2");
  if(saveBtn2) saveBtn2.addEventListener("click", saveProfile);

})();
