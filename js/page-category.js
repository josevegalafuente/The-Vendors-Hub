/* =========================================================================
   PM Category View — list vendors in a state for a given category.
   Shows real registered vendors only. Empty state otherwise.
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  const stateAbbr = UI.getQueryParam("state");
  const catId = UI.getQueryParam("cat");
  const stateData = STATES_DATA[stateAbbr];
  // cat="all" → lista TODOS los vendors del estado (sin filtrar por servicio).
  const category = catId === "all"
    ? { id: "all", name: "All vendors", icon: "📋", services: null }
    : VENDOR_CATEGORIES.find(c => c.id === catId);

  if(!stateData || !category){
    window.location.href = "markets.html";
    return;
  }

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" },
    { label: stateData.name, href: `market.html?state=${stateAbbr}` },
    { label: category.name }
  ], true);

  document.title = `${category.name} in ${stateData.name} · VendorHub`;
  document.getElementById("catIcon").textContent = category.icon;
  document.getElementById("catTitle").innerHTML = `${UI.escapeHtml(category.name)} <em>in ${UI.escapeHtml(stateData.name)}</em>`;
  document.getElementById("crumbsInline").innerHTML =
    `<a href="markets.html">Markets</a> / <a href="market.html?state=${stateAbbr}">${UI.escapeHtml(stateData.name)}</a> / ${UI.escapeHtml(category.name)}`;

  // Back button → return to the state's market page
  const back = document.getElementById("backLink");
  back.href = `market.html?state=${stateAbbr}`;
  document.getElementById("backLinkText").textContent = `Back to ${stateData.name} categories`;

  // ─── Filter vendors ──────────────────────────────────
  const allVendors = Storage.getAllVendors();
  const matches = allVendors.filter(v => {
    if(!Storage.vendorCoversState(v, stateAbbr)) return false;
    if(!category.services) return true;   // "all" → no filtra por servicio
    const services = (v.profile && v.profile.services) || [];
    return category.services.some(s => services.includes(s));
  });

  document.getElementById("resultCount").textContent = matches.length;

  const list = document.getElementById("vendorList");
  if(matches.length === 0){
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">${category.icon}</div>
        <h3>No ${UI.escapeHtml(category.name)} vendors in ${UI.escapeHtml(stateData.name)} yet</h3>
        <p>As vendors offering ${UI.escapeHtml(category.name)} services register and add ${UI.escapeHtml(stateData.name)} to their coverage areas, they'll appear here.</p>
        <a class="btn btn-secondary" href="market.html?state=${stateAbbr}">Browse other categories in ${UI.escapeHtml(stateData.name)}</a>
      </div>
    `;
    return;
  }

  list.className = "vendor-list";
  list.innerHTML = matches.map(v => {
    const p = v.profile;
    const cityState = [p.city, p.state].filter(Boolean).join(", ");
    const matchingServices = category.services ? category.services.filter(s => (p.services || []).includes(s)) : [];
    const otherServices = (p.services || []).filter(s => !matchingServices.includes(s)).slice(0, 2);
    const initials = UI.initials(p.businessName, 2);
    const avatarInner = p.avatar
      ? `<img src="${p.avatar}" alt="${UI.escapeHtml(p.businessName)}"/>`
      : UI.escapeHtml(initials);

    return `
      <a class="vendor-row" href="vendor.html?id=${v.id}&state=${stateAbbr}&cat=${category.id}">
        <div class="vendor-avatar">${avatarInner}</div>
        <div class="vendor-info">
          <h4>${UI.escapeHtml(p.businessName)}</h4>
          <div class="tags">
            ${cityState ? `<span class="tag">${UI.escapeHtml(cityState)}</span>` : ""}
            ${matchingServices.slice(0, 3).map(s => `<span class="tag hl">${UI.escapeHtml(s)}</span>`).join("")}
            ${otherServices.map(s => `<span class="tag">${UI.escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div class="vendor-cta">View profile →</div>
      </a>
    `;
  }).join("");
})();
