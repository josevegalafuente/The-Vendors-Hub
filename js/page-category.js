/* =========================================================================
   page-category.js — lista de vendors de un estado para una categoría.
   Solo vendors reales del directorio. Si no hay, estado vacío explicativo.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const stateAbbr = UI.getQueryParam("state");
  const catId = UI.getQueryParam("cat");
  const stateData = STATES_DATA[stateAbbr];

  // cat="all" → todos los vendors del estado (sin filtrar por servicio).
  const category = catId === "all"
    ? { id: "all", name: "All vendors", icon: "📋", services: null }
    : VENDOR_CATEGORIES.find(c => c.id === catId);

  if(!stateData || !category){
    window.location.replace("markets.html");
    return;
  }

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: stateData.name, href: `market.html?state=${encodeURIComponent(stateAbbr)}` },
    { label: category.name }
  ], true);

  document.title = `${category.name} in ${stateData.name} · VendorHub`;
  document.getElementById("catIcon").textContent = category.icon;
  document.getElementById("catTitle").innerHTML =
    `${UI.escapeHtml(category.name)} <em>in ${UI.escapeHtml(stateData.name)}</em>`;
  document.getElementById("crumbsInline").innerHTML =
    `<a href="markets.html">Markets</a> / ` +
    `<a href="market.html?state=${encodeURIComponent(stateAbbr)}">${UI.escapeHtml(stateData.name)}</a> / ` +
    `${UI.escapeHtml(category.name)}`;

  const back = document.getElementById("backLink");
  back.href = `market.html?state=${encodeURIComponent(stateAbbr)}`;
  document.getElementById("backLinkText").textContent = `Back to ${stateData.name} categories`;

  // ─── Filtrado (con el índice por estado de db.js) ─────
  const serviceSet = category.services ? new Set(category.services) : null;
  const matches = DB.vendorsInState(stateAbbr).filter(v => {
    if(!serviceSet) return true;
    const services = (v.profile && v.profile.services) || [];
    return services.some(s => serviceSet.has(s));
  });

  // Mejor valorados primero; a igualdad, por nombre.
  matches.sort((a, b) => {
    const ra = DB.getRatingSummary(a), rb = DB.getRatingSummary(b);
    if(rb.count > 0 || ra.count > 0){
      if(rb.avg !== ra.avg) return rb.avg - ra.avg;
      if(rb.count !== ra.count) return rb.count - ra.count;
    }
    return String((a.profile || {}).businessName || "")
      .localeCompare(String((b.profile || {}).businessName || ""));
  });

  document.getElementById("resultCount").textContent = matches.length;

  const list = document.getElementById("vendorList");
  if(matches.length === 0){
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">${UI.escapeHtml(category.icon)}</div>
        <h3>No ${UI.escapeHtml(category.name)} vendors in ${UI.escapeHtml(stateData.name)} yet</h3>
        <p>As vendors offering ${UI.escapeHtml(category.name)} services register and add
           ${UI.escapeHtml(stateData.name)} to their coverage areas, they'll appear here.</p>
        <a class="btn btn-secondary" href="market.html?state=${encodeURIComponent(stateAbbr)}">
          Browse other categories in ${UI.escapeHtml(stateData.name)}</a>
      </div>
    `;
    return;
  }

  list.className = "vendor-list";
  list.innerHTML = matches.map(v => {
    const p = v.profile || {};
    const cityState = [p.city, p.state].filter(Boolean).join(", ");
    const matchingServices = category.services
      ? category.services.filter(s => (p.services || []).includes(s)) : [];
    const otherServices = (p.services || []).filter(s => !matchingServices.includes(s)).slice(0, 2);
    const r = DB.getRatingSummary(v);
    const href = `vendor.html?id=${encodeURIComponent(v.id)}` +
                 `&state=${encodeURIComponent(stateAbbr)}&cat=${encodeURIComponent(category.id)}`;

    return `
      <a class="vendor-row" href="${href}">
        <div class="vendor-avatar">${UI.avatarHtml(p.avatar, p.businessName)}</div>
        <div class="vendor-info">
          <h4>${UI.escapeHtml(p.businessName)}</h4>
          <div class="tags">
            ${cityState ? `<span class="tag">${UI.escapeHtml(cityState)}</span>` : ""}
            ${r.count > 0 ? `<span class="tag">${UI.starString(r.avg)} ${r.avg.toFixed(1)} (${r.count})</span>` : ""}
            ${matchingServices.slice(0, 3).map(s => `<span class="tag hl">${UI.escapeHtml(s)}</span>`).join("")}
            ${otherServices.map(s => `<span class="tag">${UI.escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div class="vendor-cta">View profile →</div>
      </a>
    `;
  }).join("");
})();
