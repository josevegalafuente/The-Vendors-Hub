/* =========================================================================
   page-category.js — vendors de un mercado para una categoría dada.
   Solo vendors reales del directorio. Si no hay, estado vacío explicativo.
   ========================================================================= */
/* Espera a que la capa de datos esté lista antes de pintar. Con localStorage
   la promesa ya viene resuelta y no cambia nada; con Firestore da tiempo a
   cargar la sesión y el directorio. Si la carga falla, se pinta igual con lo
   que haya en lugar de dejar la página en blanco. */
DB.ready.catch(function(){}).then(function(){

  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const marketId = UI.getQueryParam("market");
  const catId = UI.getQueryParam("cat");
  const market = marketId ? DB.getMarket(marketId) : null;

  // cat="all" → todos los vendors del mercado (sin filtrar por servicio).
  const category = catId === "all"
    ? { id: "all", name: "All vendors", icon: "📋", services: null }
    : VENDOR_CATEGORIES.find(c => c.id === catId);

  if(!market || !category){
    window.location.replace("markets.html");
    return;
  }

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: market.name, href: `market.html?market=${encodeURIComponent(marketId)}` },
    { label: category.name }
  ], true);

  document.title = `${category.name} in ${market.name} · VendorHub`;
  document.getElementById("catIcon").textContent = category.icon;
  document.getElementById("catTitle").innerHTML =
    `${UI.escapeHtml(category.name)} <em>in ${UI.escapeHtml(market.name)}</em>`;
  document.getElementById("crumbsInline").innerHTML =
    `<a href="markets.html">Markets</a> / ` +
    `<a href="market.html?market=${encodeURIComponent(marketId)}">${UI.escapeHtml(market.name)}</a> / ` +
    `${UI.escapeHtml(category.name)}`;

  const back = document.getElementById("backLink");
  back.href = `market.html?market=${encodeURIComponent(marketId)}`;
  document.getElementById("backLinkText").textContent = `Back to ${market.name} categories`;

  // ─── Filtrado (índice por mercado de db.js) ──────────
  const serviceSet = category.services ? new Set(category.services) : null;
  const marketZipSet = new Set(DB.marketZips(marketId));

  const matches = DB.vendorsInMarket(marketId).filter(v => {
    if(!serviceSet) return true;
    const services = (v.profile && v.profile.services) || [];
    return services.some(s => serviceSet.has(s));
  });

  // Mejor valorados primero; a igualdad, por nombre.
  matches.sort((a, b) => {
    const ra = DB.getRatingSummary(a), rb = DB.getRatingSummary(b);
    if(rb.avg !== ra.avg) return rb.avg - ra.avg;
    if(rb.count !== ra.count) return rb.count - ra.count;
    return String((a.profile || {}).businessName || "")
      .localeCompare(String((b.profile || {}).businessName || ""));
  });

  document.getElementById("resultCount").textContent = matches.length;

  const list = document.getElementById("vendorList");
  if(matches.length === 0){
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">${UI.escapeHtml(category.icon)}</div>
        <h3>No ${UI.escapeHtml(category.name)} vendors in ${UI.escapeHtml(market.name)} yet</h3>
        <p>As vendors offering ${UI.escapeHtml(category.name)} services add
           ${UI.escapeHtml(market.name)} ZIP codes to their coverage, they'll appear here.</p>
        <a class="btn btn-secondary" href="market.html?market=${encodeURIComponent(marketId)}">
          Browse other categories in ${UI.escapeHtml(market.name)}</a>
      </div>
    `;
    return;
  }

  list.className = "vendor-list";
  list.innerHTML = matches.map(v => {
    const p = v.profile || {};
    const matchingServices = category.services
      ? category.services.filter(s => (p.services || []).includes(s)) : [];
    const otherServices = (p.services || []).filter(s => !matchingServices.includes(s)).slice(0, 2);
    const r = DB.getRatingSummary(v);

    // Cuántos de los ZIP de este mercado atiende: es la medida honesta de
    // "cuánto" cubre aquí, en vez de un genérico "cubre el estado".
    const own = DB.vendorZips(v).filter(z => marketZipSet.has(z)).length;
    const href = `vendor.html?id=${encodeURIComponent(v.id)}&market=${encodeURIComponent(marketId)}` +
                 `&cat=${encodeURIComponent(category.id)}`;

    return `
      <a class="vendor-row" href="${href}">
        <div class="vendor-avatar">${UI.avatarHtml(p.avatar, p.businessName)}</div>
        <div class="vendor-info">
          <h4>${UI.escapeHtml(p.businessName)}</h4>
          <div class="tags">
            <span class="tag">${own} ZIP ${own === 1 ? "code" : "codes"} here</span>
            ${r.count > 0 ? `<span class="tag">${UI.starString(r.avg)} ${r.avg.toFixed(1)} (${r.count})</span>` : ""}
            ${matchingServices.slice(0, 3).map(s => `<span class="tag hl">${UI.escapeHtml(s)}</span>`).join("")}
            ${otherServices.map(s => `<span class="tag">${UI.escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div class="vendor-cta">View profile →</div>
      </a>
    `;
  }).join("");
});
