/* =========================================================================
   PM Single-Market View — categories with REAL vendor counts.
   No fake numbers. Categories without registered vendors are shown as disabled.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const stateAbbr = UI.getQueryParam("state");
  if(!stateAbbr || !STATES_DATA[stateAbbr]){
    window.location.href = "markets.html";
    return;
  }
  const stateData = STATES_DATA[stateAbbr];

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: stateData.name }
  ], true);

  // Ilustración aleatoria en el banner del mercado (misma función que Markets).
  UI.pickRandomIllustration("marketIllustration");

  // ─── Fill header ─────────────────────────────────────
  document.title = `${stateData.name} · VendorHub`;
  document.getElementById("regionBadge").textContent = stateData.region + " region";
  document.getElementById("stateTitle").innerHTML = `${UI.escapeHtml(stateData.name)} <em>market.</em>`;
  document.getElementById("stateDesc").textContent = `Verified vendors across every service category in ${stateData.name}. Coverage spans ${Object.keys(stateData.counties).length} counties.`;

  // ─── Compute REAL vendor counts ──────────────────────
  const allVendors = Storage.getAllVendors();
  const vendorsInState = allVendors.filter(v => Storage.vendorCoversState(v, stateAbbr));

  // Match vendors to categories by intersecting their selected services with each category's services
  function categoryHasVendor(category, vendor){
    const services = (vendor.profile && vendor.profile.services) || [];
    return category.services.some(s => services.includes(s));
  }

  const countByCategory = {};
  VENDOR_CATEGORIES.forEach(cat => {
    countByCategory[cat.id] = vendorsInState.filter(v => categoryHasVendor(cat, v)).length;
  });
  const activeCategories = VENDOR_CATEGORIES.filter(cat => countByCategory[cat.id] > 0);

  // ─── Header meta ─────────────────────────────────────
  document.getElementById("metaVendors").textContent = vendorsInState.length;
  document.getElementById("metaCounties").textContent = Object.keys(stateData.counties).length;
  document.getElementById("metaCategories").textContent = activeCategories.length;

  // ─── Categories grid ─────────────────────────────────
  const grid = document.getElementById("categoriesGrid");

  if(vendorsInState.length === 0){
    // No vendors at all → show a single empty state
    grid.outerHTML = `
      <div class="empty-state">
        <div class="icon">🏗️</div>
        <h3>No vendors registered in ${UI.escapeHtml(stateData.name)} yet</h3>
        <p>VendorHub is brand new. As vendors register and select ${UI.escapeHtml(stateData.name)} as part of their coverage area, you'll see them organized by category here.</p>
        <a class="btn btn-primary" href="markets.html">Browse other markets</a>
      </div>
    `;
    document.getElementById("catLede").textContent = "No vendors are currently registered in this market.";
    return;
  }

  // Tarjeta destacada "All vendors" — lleva a la lista completa del estado,
  // útil sobre todo para vendors importados que aún no tienen categoría.
  const allCard = `
    <a class="cat-card highlight" href="category.html?state=${stateAbbr}&cat=all">
      <div class="cat-icon">📋</div>
      <h4>All vendors</h4>
      <p>Browse every vendor that covers ${UI.escapeHtml(stateData.name)}, in one list.</p>
      <div class="vendor-count">${vendorsInState.length} ${vendorsInState.length === 1 ? "vendor" : "vendors"} total</div>
      <span class="arrow-cta">→</span>
    </a>`;

  // Render all categories: those with vendors are clickable, those with 0 are visually muted
  grid.innerHTML = allCard + VENDOR_CATEGORIES.map(cat => {
    const count = countByCategory[cat.id];
    const disabled = count === 0;
    const href = disabled ? "#" : `category.html?state=${stateAbbr}&cat=${cat.id}`;
    return `
      <a class="cat-card ${disabled ? 'disabled' : ''}"
         ${disabled ? '' : `href="${href}"`}
         ${disabled ? 'onclick="event.preventDefault(); return false;" title="No vendors registered in this category yet"' : ''}>
        <div class="cat-icon">${cat.icon}</div>
        <h4>${UI.escapeHtml(cat.name)}</h4>
        <p>${UI.escapeHtml(cat.desc)}</p>
        <div class="vendor-count">
          ${count === 0 ? "No vendors yet" : `${count} ${count === 1 ? "vendor" : "vendors"} available`}
        </div>
        ${!disabled ? `<span class="arrow-cta">→</span>` : ""}
      </a>
    `;
  }).join("");
})();
