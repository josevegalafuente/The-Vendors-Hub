/* =========================================================================
   page-market.js — vista de un mercado (estado) con las categorías y sus
   conteos REALES de vendors. Sin números inventados: las categorías sin
   vendors registrados salen desactivadas.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const stateAbbr = UI.getQueryParam("state");
  if(!stateAbbr || !STATES_DATA[stateAbbr]){
    window.location.replace("markets.html");
    return;
  }
  const stateData = STATES_DATA[stateAbbr];

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: stateData.name }
  ], true);

  UI.pickRandomIllustration("marketIllustration");

  // ─── Cabecera ────────────────────────────────────────
  document.title = `${stateData.name} · VendorHub`;
  document.getElementById("regionBadge").textContent = stateData.region + " region";
  document.getElementById("stateTitle").innerHTML = `${UI.escapeHtml(stateData.name)} <em>market.</em>`;
  document.getElementById("stateDesc").textContent =
    `Verified vendors across every service category in ${stateData.name}. ` +
    `Coverage spans ${Object.keys(stateData.counties).length} counties.`;

  // ─── Conteos reales (usando el índice de db.js) ──────
  const vendorsInState = DB.vendorsInState(stateAbbr);

  const countByCategory = {};
  VENDOR_CATEGORIES.forEach(cat => {
    const set = new Set(cat.services);
    countByCategory[cat.id] = vendorsInState.filter(v => {
      const services = (v.profile && v.profile.services) || [];
      return services.some(s => set.has(s));
    }).length;
  });
  const activeCategories = VENDOR_CATEGORIES.filter(cat => countByCategory[cat.id] > 0);

  document.getElementById("metaVendors").textContent = vendorsInState.length;
  document.getElementById("metaCounties").textContent = Object.keys(stateData.counties).length;
  document.getElementById("metaCategories").textContent = activeCategories.length;

  // ─── Rejilla de categorías ───────────────────────────
  const grid = document.getElementById("categoriesGrid");

  if(vendorsInState.length === 0){
    grid.outerHTML = `
      <div class="empty-state">
        <div class="icon">🏗️</div>
        <h3>No vendors registered in ${UI.escapeHtml(stateData.name)} yet</h3>
        <p>As vendors register and select ${UI.escapeHtml(stateData.name)} as part of their coverage area,
           you'll see them organized by category here.</p>
        <a class="btn btn-primary" href="markets.html">Browse other markets</a>
      </div>
    `;
    document.getElementById("catLede").textContent = "No vendors are currently registered in this market.";
    return;
  }

  // Tarjeta destacada "All vendors" — lista completa del estado, útil sobre
  // todo para las fichas importadas que aún no tienen categoría asignada.
  const allCard = `
    <a class="cat-card highlight" href="category.html?state=${encodeURIComponent(stateAbbr)}&cat=all">
      <div class="cat-icon">📋</div>
      <h4>All vendors</h4>
      <p>Browse every vendor that covers ${UI.escapeHtml(stateData.name)}, in one list.</p>
      <div class="vendor-count">${vendorsInState.length} ${vendorsInState.length === 1 ? "vendor" : "vendors"} total</div>
      <span class="arrow-cta">→</span>
    </a>`;

  /* Las categorías sin vendors se pintan como una tarjeta desactivada.
     Antes se usaba un onclick inline (`event.preventDefault()`), que impide
     activar una Content-Security-Policy estricta más adelante. Ahora son
     <div> sin href: no navegan porque no son enlaces, sin JavaScript. */
  grid.innerHTML = allCard + VENDOR_CATEGORIES.map(cat => {
    const count = countByCategory[cat.id];
    const inner = `
      <div class="cat-icon">${UI.escapeHtml(cat.icon)}</div>
      <h4>${UI.escapeHtml(cat.name)}</h4>
      <p>${UI.escapeHtml(cat.desc)}</p>
      <div class="vendor-count">
        ${count === 0 ? "No vendors yet" : `${count} ${count === 1 ? "vendor" : "vendors"} available`}
      </div>`;

    if(count === 0){
      return `<div class="cat-card disabled" aria-disabled="true"
                   title="No vendors registered in this category yet">${inner}</div>`;
    }
    const href = `category.html?state=${encodeURIComponent(stateAbbr)}&cat=${encodeURIComponent(cat.id)}`;
    return `<a class="cat-card" href="${href}">${inner}<span class="arrow-cta">→</span></a>`;
  }).join("");
})();
