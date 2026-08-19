/* =========================================================================
   page-markets.js — directorio de MERCADOS con búsqueda universal.

   Antes esta página listaba los 50 estados. El sitio ofrecía cobertura en
   sitios donde la empresa no tiene ni una propiedad: 24 tarjetas vacías que
   solo servían para hacer perder el tiempo. Ahora lista los 35 mercados
   reales de HomeRiver Group.

   La barra de búsqueda entiende cuatro tipos de consulta:
     1) Mercado  → "Florida", "Dallas"      → tarjetas de mercado
     2) Servicio → "plumbing", "electrical" → en qué mercados hay y cuántos
     3) Ciudad   → "Ocala"                  → vendors que la cubren
     4) ZIP      → "34470"                  → vendors que atienden ese código
   ========================================================================= */
/* Espera a que la capa de datos esté lista antes de pintar. Con localStorage
   la promesa ya viene resuelta y no cambia nada; con Firestore da tiempo a
   cargar la sesión y el directorio. Si la carga falla, se pinta igual con lo
   que haya en lugar de dejar la página en blanco. */
DB.ready.catch(function(){}).then(function(){

  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets" }
  ], true);

  UI.pickRandomIllustration("heroIllustration");

  const MARKETS = DB.getMarkets();
  const vendors = DB.getAllVendors();
  const countByMarket = DB.countVendorsByMarket();

  // ─── Stats superiores ────────────────────────────────
  document.getElementById("statVendors").textContent = vendors.length.toLocaleString();
  document.getElementById("statCategories").textContent = VENDOR_CATEGORIES.length;
  const statMarkets = document.getElementById("statMarkets");
  if(statMarkets) statMarkets.textContent = MARKETS.length;
  (function(){
    let sum = 0, n = 0;
    vendors.forEach(v => {
      const r = DB.getRatingSummary(v);
      if(r.count > 0){ sum += r.avg; n++; }
    });
    document.getElementById("statAvgRating").textContent = n > 0 ? (sum / n).toFixed(1) : "N/A";
  })();

  /* Índice de ciudades y ZIP. Se construye la primera vez que hace falta,
     no al cargar: quien solo quiere ver la lista de mercados no lo paga. */
  let cityIndex = null;
  function getCityIndex(){
    if(cityIndex) return cityIndex;
    cityIndex = [];
    MARKETS.forEach(m => {
      const market = DB.getMarket(m.id);
      Object.keys(market.counties).forEach(cty => {
        const info = market.counties[cty];
        Object.keys(info.cities).forEach(city => {
          cityIndex.push({
            marketId: m.id, marketName: m.name, county: cty,
            state: info.state, city, zips: info.cities[city],
            lower: city.toLowerCase()
          });
        });
      });
    });
    return cityIndex;
  }

  // ─── Utilidades de coincidencia ──────────────────────
  const SYNONYMS = {
    plumber: "plumbing", plumbers: "plumbing",
    electrician: "electrical", electricians: "electrical",
    painter: "painting", painters: "painting",
    roofer: "roofing", roofers: "roofing",
    cleaner: "cleaning", cleaners: "cleaning",
    landscaper: "landscaping", landscapers: "landscaping",
    mover: "moving", movers: "moving"
  };

  function termMatch(haystack, q){
    if(q.length < 2) return false;
    if(haystack.includes(q) || q.includes(haystack)) return true;
    if(SYNONYMS[q] && haystack.includes(SYNONYMS[q])) return true;
    let n = 0;
    while(n < haystack.length && n < q.length && haystack[n] === q[n]) n++;
    return n >= 4;
  }

  function marketCard(m, count, href, suffix){
    const noun = count === 1 ? "vendor" : "vendors";
    const tail = suffix ? " " + suffix : "";
    return `
      <a class="state-card" href="${UI.escapeHtml(href)}">
        <span class="region-tag">${UI.escapeHtml((m.states || []).join(" · "))}</span>
        <div class="market-name">${UI.escapeHtml(m.name)}</div>
        <div class="market-zips">${m.zipCount.toLocaleString()} ZIP codes</div>
        <div class="vendors ${count === 0 ? 'zero' : ''}">
          <strong>${count}</strong> ${noun}${tail}
        </div>
      </a>`;
  }

  function vendorRow(v, label){
    const p = v.profile || {};
    const r = DB.getRatingSummary(v);
    const svc = (p.services || []).slice(0, 3);
    const ratingTag = r.count > 0
      ? `<span class="tag">${UI.starString(r.avg)} ${r.avg.toFixed(1)} (${r.count})</span>` : "";
    return `
      <a class="vendor-row" href="vendor.html?id=${encodeURIComponent(v.id)}">
        <div class="vendor-avatar">${UI.avatarHtml(p.avatar, p.businessName)}</div>
        <div class="vendor-info">
          <h4>${UI.escapeHtml(p.businessName)}</h4>
          <div class="tags">
            ${label ? `<span class="tag hl">${UI.escapeHtml(label)}</span>` : ""}
            ${ratingTag}
            ${svc.map(s => `<span class="tag">${UI.escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div class="vendor-cta">View profile →</div>
      </a>`;
  }

  // ─── Estado de filtros ───────────────────────────────
  let query = "";

  const statesGrid    = document.getElementById("statesGrid");
  const searchResults = document.getElementById("searchResults");
  /* Sin filtro por estado: son 35 mercados y caben de una sola vez. Una
     barra con 25 siglas ocupaba toda la pantalla y ahorraba menos que
     escribir dos letras en el buscador, que ya entiende siglas de estado. */
  function renderDefault(){
    searchResults.innerHTML = "";
    statesGrid.innerHTML = MARKETS.map(m =>
      marketCard(m, countByMarket[m.id] || 0,
                 `market.html?market=${encodeURIComponent(m.id)}`, "registered")
    ).join("");
  }

  function renderSearch(){
    const q = query.trim().toLowerCase();
    statesGrid.innerHTML = "";
    const sections = [];

    // 1) MERCADOS por nombre o por sigla de estado
    const marketMatches = MARKETS.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.states || []).some(s => s.toLowerCase() === q));
    if(marketMatches.length){
      sections.push(`
        <div class="search-section">
          <h3 class="search-section-title">Markets matching “${UI.escapeHtml(query)}”</h3>
          <div class="states-grid">
            ${marketMatches.map(m => marketCard(m, countByMarket[m.id] || 0,
              `market.html?market=${encodeURIComponent(m.id)}`)).join("")}
          </div>
        </div>`);
    }

    // 2) SERVICIOS / CATEGORÍAS
    const matchedCats = VENDOR_CATEGORIES.filter(cat => {
      const hay = [cat.name].concat(cat.services).map(x => x.toLowerCase());
      return hay.some(h => termMatch(h, q));
    });
    if(matchedCats.length){
      const svcSet = new Set();
      matchedCats.forEach(c => c.services.forEach(s => svcSet.add(s)));
      const single = matchedCats.length === 1 ? matchedCats[0] : null;

      const rows = MARKETS
        .map(m => ({ m, cnt: DB.countVendorsInMarketWithServices(m.id, svcSet) }))
        .filter(r => r.cnt > 0)
        .sort((a, b) => b.cnt - a.cnt || a.m.name.localeCompare(b.m.name));

      const label = matchedCats.map(c => c.name).join(", ");
      const body = rows.length === 0
        ? `<div class="empty-state"><div class="icon">🔍</div>
             <h3>No vendors offer ${UI.escapeHtml(label)} yet</h3>
             <p>As vendors register and add coverage, the markets where they operate will appear here.</p></div>`
        : `<div class="states-grid">
             ${rows.map(({m, cnt}) => marketCard(m, cnt, single
                ? `category.html?market=${encodeURIComponent(m.id)}&cat=${encodeURIComponent(single.id)}`
                : `market.html?market=${encodeURIComponent(m.id)}`)).join("")}
           </div>`;
      sections.push(`
        <div class="search-section">
          <h3 class="search-section-title">Markets with “${UI.escapeHtml(label)}” vendors</h3>
          ${body}
        </div>`);
    }

    // 3) CÓDIGO POSTAL exacto
    if(/^\d{5}$/.test(q)){
      const where = DB.lookupZip(q);
      const inZip = DB.vendorsInZip(q);
      const place = where.length
        ? `${where[0].city}, ${where[0].state} · ${where[0].marketName}`
        : "";
      const body = inZip.length === 0
        ? `<div class="empty-state"><div class="icon">📮</div>
             <h3>No vendors cover ${UI.escapeHtml(q)} yet</h3>
             <p>${where.length ? UI.escapeHtml(place) : "That ZIP code is not in any of our markets."}</p></div>`
        : `<div class="vendor-list">${inZip.map(v => vendorRow(v, place)).join("")}</div>`;
      sections.push(`
        <div class="search-section">
          <h3 class="search-section-title">Vendors covering ZIP ${UI.escapeHtml(q)}</h3>
          ${body}
        </div>`);
    }

    // 4) CIUDADES (3+ letras)
    else if(q.length >= 3){
      const all = getCityIndex();
      const exact = [], partial = [];
      for(const r of all){
        if(r.lower === q) exact.push(r);
        else if(partial.length < 200 && r.lower.includes(q)) partial.push(r);
      }
      const hits = (exact.length ? exact : partial).slice(0, 40);

      if(hits.length){
        const zipSet = new Set();
        hits.forEach(h => h.zips.forEach(z => zipSet.add(z)));

        const seen = new Set();
        const found = [];
        zipSet.forEach(z => {
          DB.vendorsInZip(z).forEach(v => {
            if(seen.has(v.id)) return;
            seen.add(v.id);
            const h = hits.find(x => x.zips.indexOf(z) > -1);
            found.push({ v, label: h ? `${h.city}, ${h.state}` : z });
          });
        });

        const cityName = exact.length ? exact[0].city : query.trim();
        const show = found.length > 0 || (marketMatches.length === 0 && matchedCats.length === 0);
        if(show){
          const body = found.length === 0
            ? `<div class="empty-state"><div class="icon">📍</div>
                 <h3>No vendors cover ${UI.escapeHtml(cityName)} yet</h3>
                 <p>No registered vendor lists those ZIP codes. Try a nearby city or a broader search.</p></div>`
            : `<div class="vendor-list">${found.map(f => vendorRow(f.v, f.label)).join("")}</div>`;
          sections.push(`
            <div class="search-section">
              <h3 class="search-section-title">Vendors available in “${UI.escapeHtml(cityName)}”</h3>
              ${body}
            </div>`);
        }
      }
    }

    if(sections.length === 0){
      searchResults.innerHTML = `<div class="empty-state">
        <div class="icon">🔎</div>
        <h3>No results for “${UI.escapeHtml(query)}”</h3>
        <p>Try a market (Florida, Dallas), a service (plumbing, HVAC),
           a city (Ocala) or a ZIP code (34470).</p>
      </div>`;
      return;
    }
    searchResults.innerHTML = sections.join("");
  }

  function render(){
    if(query.trim() === "") renderDefault();
    else renderSearch();
  }

  const searchEl = document.getElementById("stateSearch");
  const runSearch = UI.debounce(render, 180);
  searchEl.addEventListener("input", e => {
    query = e.target.value;
    if(query.trim() === "") render();
    else runSearch();
  });

  render();
});
