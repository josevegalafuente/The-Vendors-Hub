/* =========================================================================
   page-market.js — vista de un MERCADO con sus categorías y conteos reales.
   Sin números inventados: las categorías sin vendors salen desactivadas.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const marketId = UI.getQueryParam("market");
  const market = marketId ? DB.getMarket(marketId) : null;
  if(!market){
    window.location.replace("markets.html");
    return;
  }

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: market.name }
  ], true);

  UI.pickRandomIllustration("marketIllustration");

  const counties = Object.keys(market.counties);
  const zips = DB.marketZips(marketId);

  // ─── Cabecera ────────────────────────────────────────
  document.title = `${market.name} · VendorHub`;
  document.getElementById("regionBadge").textContent = (market.states || []).join(" · ");
  document.getElementById("stateTitle").innerHTML = `${UI.escapeHtml(market.name)} <em>market.</em>`;
  document.getElementById("stateDesc").textContent =
    `Verified vendors across every service category in ${market.name}. ` +
    `Coverage spans ${counties.length} ${counties.length === 1 ? "county" : "counties"} ` +
    `and ${zips.length} ZIP codes.`;

  // ─── Conteos reales (índice de db.js) ────────────────
  const vendorsInMarket = DB.vendorsInMarket(marketId);

  const countByCategory = {};
  VENDOR_CATEGORIES.forEach(cat => {
    const set = new Set(cat.services);
    countByCategory[cat.id] = vendorsInMarket.filter(v => {
      const services = (v.profile && v.profile.services) || [];
      return services.some(s => set.has(s));
    }).length;
  });
  const activeCategories = VENDOR_CATEGORIES.filter(cat => countByCategory[cat.id] > 0);

  document.getElementById("metaVendors").textContent = vendorsInMarket.length;
  document.getElementById("metaCounties").textContent = counties.length;
  document.getElementById("metaCategories").textContent = activeCategories.length;
  const metaZips = document.getElementById("metaZips");
  if(metaZips) metaZips.textContent = zips.length;

  // ─── Rejilla de categorías ───────────────────────────
  const grid = document.getElementById("categoriesGrid");

  if(vendorsInMarket.length === 0){
    grid.outerHTML = `
      <div class="empty-state">
        <div class="icon">🏗️</div>
        <h3>No vendors registered in ${UI.escapeHtml(market.name)} yet</h3>
        <p>As vendors register and add ${UI.escapeHtml(market.name)} ZIP codes to their coverage,
           you'll see them organized by category here.</p>
        <a class="btn btn-primary" href="markets.html">Browse other markets</a>
      </div>
    `;
    document.getElementById("catLede").textContent = "No vendors are currently registered in this market.";
    return;
  }

  const allCard = `
    <a class="cat-card highlight" href="category.html?market=${encodeURIComponent(marketId)}&cat=all">
      <div class="cat-icon">📋</div>
      <h4>All vendors</h4>
      <p>Browse every vendor that covers ${UI.escapeHtml(market.name)}, in one list.</p>
      <div class="vendor-count">${vendorsInMarket.length} ${vendorsInMarket.length === 1 ? "vendor" : "vendors"} total</div>
      <span class="arrow-cta">→</span>
    </a>`;

  /* Las categorías sin vendors se pintan como tarjeta desactivada. Son <div>
     sin href: no navegan porque no son enlaces, sin necesitar JavaScript en
     línea (que impediría activar una CSP estricta). */
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
    const href = `category.html?market=${encodeURIComponent(marketId)}&cat=${encodeURIComponent(cat.id)}`;
    return `<a class="cat-card" href="${href}">${inner}<span class="arrow-cta">→</span></a>`;
  }).join("");
})();
