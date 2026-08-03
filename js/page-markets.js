/* =========================================================================
   page-markets.js — directorio con BÚSQUEDA UNIVERSAL.
   La barra de búsqueda entiende tres tipos de consulta:
     1) Estado   → "Florida", "FL"          → tarjetas de estado
     2) Servicio → "plumbing", "electrical" → en qué mercados hay y cuántos
     3) Ciudad   → "Ocala"                  → vendors que cubren esa ciudad
   Sin texto, muestra todos los estados (filtrables por región).

   RENDIMIENTO
   Con 1.179 vendors, la versión anterior recorría ~59.000 combinaciones en
   CADA pulsación de tecla, más los 455 KB del archivo de ciudades. Ahora:
     · los índices vendor→estado y vendor→servicio los construye db.js una
       sola vez por carga;
     · el índice de ciudades se construye aquí una vez, no en cada tecla;
     · la búsqueda espera 180 ms a que dejes de escribir (debounce).
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets" }
  ], true);

  UI.pickRandomIllustration("heroIllustration");

  const STATES_LIST = Object.entries(STATES_DATA).map(([abbr, data]) => ({
    abbr, name: data.name, region: data.region
  })).sort((a, b) => a.name.localeCompare(b.name));

  const vendors = DB.getAllVendors();
  const vendorsByState = DB.countVendorsByState();

  // ─── Stats superiores ────────────────────────────────
  document.getElementById("statVendors").textContent = vendors.length.toLocaleString();
  document.getElementById("statCategories").textContent = VENDOR_CATEGORIES.length;
  (function(){
    let sum = 0, n = 0;
    vendors.forEach(v => {
      const r = DB.getRatingSummary(v);
      if(r.count > 0){ sum += r.avg; n++; }
    });
    document.getElementById("statAvgRating").textContent = n > 0 ? (sum / n).toFixed(1) : "N/A";
  })();

  /* ─── Índice de ciudades ──────────────────────────────
     Se construye la PRIMERA vez que alguien busca algo que parece una
     ciudad, no al cargar la página: así no penalizamos a quien solo quiere
     ver la lista de estados. */
  let cityIndex = null;
  function getCityIndex(){
    if(cityIndex) return cityIndex;
    cityIndex = [];
    for(const abbr in STATES_DATA){
      const sd = STATES_DATA[abbr];
      for(const county in sd.counties){
        for(const city of sd.counties[county]){
          cityIndex.push({ abbr, stateName: sd.name, county, city, lower: city.toLowerCase() });
        }
      }
    }
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
    // prefijo compartido de 4+ letras (cubre "plumber" ↔ "plumbing")
    let n = 0;
    while(n < haystack.length && n < q.length && haystack[n] === q[n]) n++;
    return n >= 4;
  }

  // count: número; suffix: texto opcional tras "vendor(s)" (ej. "registered")
  function stateCard(abbr, name, region, count, href, suffix){
    const noun = count === 1 ? "vendor" : "vendors";
    const tail = suffix ? " " + suffix : "";
    return `
      <a class="state-card" href="${UI.escapeHtml(href)}">
        <span class="region-tag">${UI.escapeHtml(region)}</span>
        <div class="abbr">${UI.escapeHtml(abbr)}</div>
        <div class="name">${UI.escapeHtml(name)}</div>
        <div class="vendors ${count === 0 ? 'zero' : ''}">
          <strong>${count}</strong> ${noun}${tail}
        </div>
      </a>`;
  }

  function vendorRow(v, cityLabel){
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
            ${cityLabel ? `<span class="tag hl">${UI.escapeHtml(cityLabel)}</span>` : ""}
            ${ratingTag}
            ${svc.map(s => `<span class="tag">${UI.escapeHtml(s)}</span>`).join("")}
          </div>
        </div>
        <div class="vendor-cta">View profile →</div>
      </a>`;
  }

  // ─── Estado de filtros ───────────────────────────────
  let regionFilter = "all";
  let query = "";

  const statesGrid    = document.getElementById("statesGrid");
  const searchResults = document.getElementById("searchResults");
  const regionEl      = document.getElementById("regionFilter");

  // ─── Vista por defecto (sin búsqueda) ────────────────
  function renderDefault(){
    searchResults.innerHTML = "";
    regionEl.style.display = "";
    const filtered = STATES_LIST.filter(s => regionFilter === "all" || s.region === regionFilter);
    statesGrid.innerHTML = filtered.map(s =>
      stateCard(s.abbr, s.name, s.region, vendorsByState[s.abbr] || 0,
                `market.html?state=${encodeURIComponent(s.abbr)}`, "registered")
    ).join("");
  }

  // ─── Vista de búsqueda ───────────────────────────────
  function renderSearch(){
    const q = query.trim().toLowerCase();
    statesGrid.innerHTML = "";
    regionEl.style.display = "none";
    const sections = [];

    // 1) ESTADOS por nombre/abreviatura
    const stateMatches = STATES_LIST.filter(s =>
      s.name.toLowerCase().includes(q) || s.abbr.toLowerCase() === q);
    if(stateMatches.length){
      sections.push(`
        <div class="search-section">
          <h3 class="search-section-title">States matching “${UI.escapeHtml(query)}”</h3>
          <div class="states-grid">
            ${stateMatches.map(s => stateCard(
                s.abbr, s.name, s.region, vendorsByState[s.abbr] || 0,
                `market.html?state=${encodeURIComponent(s.abbr)}`
              )).join("")}
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

      // Usa el índice de db.js en vez de recorrer todos los vendors por estado.
      const rows = STATES_LIST
        .map(s => ({ s, cnt: DB.countVendorsInStateWithServices(s.abbr, svcSet) }))
        .filter(r => r.cnt > 0)
        .sort((a, b) => b.cnt - a.cnt || a.s.name.localeCompare(b.s.name));

      const label = matchedCats.map(c => c.name).join(", ");
      let body;
      if(rows.length === 0){
        body = `<div class="empty-state"><div class="icon">🔍</div>
          <h3>No vendors offer ${UI.escapeHtml(label)} yet</h3>
          <p>As vendors register and add coverage, the markets where they operate will appear here.</p></div>`;
      } else {
        body = `<div class="states-grid">
          ${rows.map(({s, cnt}) => {
            const href = single
              ? `category.html?state=${encodeURIComponent(s.abbr)}&cat=${encodeURIComponent(single.id)}`
              : `market.html?state=${encodeURIComponent(s.abbr)}`;
            return stateCard(s.abbr, s.name, s.region, cnt, href);
          }).join("")}
        </div>`;
      }
      sections.push(`
        <div class="search-section">
          <h3 class="search-section-title">Markets with “${UI.escapeHtml(label)}” vendors</h3>
          ${body}
        </div>`);
    }

    // 3) CIUDADES (consulta de 3+ letras)
    if(q.length >= 3){
      const all = getCityIndex();
      const exact = [];
      const partial = [];
      for(const h of all){
        if(h.lower === q) exact.push(h);
        else if(partial.length < 400 && h.lower.includes(q)) partial.push(h);
      }
      const useHits = (exact.length ? exact : partial).slice(0, 60);

      if(useHits.length){
        const seenVendor = new Set();
        const cityVendors = [];
        // Solo miramos vendors de los estados implicados, no los 1.179.
        const statesInvolved = Array.from(new Set(useHits.map(h => h.abbr)));
        statesInvolved.forEach(abbr => {
          DB.vendorsInState(abbr).forEach(v => {
            if(seenVendor.has(v.id)) return;
            const loc = useHits.find(h => h.abbr === abbr && DB.vendorCoversCity(v, h.abbr, h.county, h.city));
            if(loc){ seenVendor.add(v.id); cityVendors.push({ v, loc }); }
          });
        });

        const cityName = exact.length ? exact[0].city : query.trim();
        // Si no hay vendors en la ciudad, solo mostramos el aviso cuando la
        // búsqueda apunta CLARAMENTE a una ciudad (sin coincidencias de
        // estado ni de servicio); así evitamos secciones vacías redundantes.
        const showCitySection = cityVendors.length > 0 ||
          (stateMatches.length === 0 && matchedCats.length === 0);

        if(showCitySection){
          const body = cityVendors.length === 0
            ? `<div class="empty-state"><div class="icon">📍</div>
                 <h3>No vendors cover ${UI.escapeHtml(cityName)} yet</h3>
                 <p>No registered vendor lists this area in their coverage. Try a nearby city or a broader search.</p></div>`
            : `<div class="vendor-list">
                 ${cityVendors.map(({v, loc}) => vendorRow(v, `${loc.city}, ${loc.abbr}`)).join("")}
               </div>`;
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
        <p>Try a state (Florida), a service (plumbing, electrical, HVAC) or a city (Ocala).</p>
      </div>`;
      return;
    }
    searchResults.innerHTML = sections.join("");
  }

  function render(){
    if(query.trim() === "") renderDefault();
    else renderSearch();
  }

  // ─── Eventos ─────────────────────────────────────────
  const searchEl = document.getElementById("stateSearch");
  const runSearch = UI.debounce(render, 180);

  searchEl.addEventListener("input", e => {
    query = e.target.value;
    // Volver a la vista por defecto es instantáneo; buscar espera al debounce.
    if(query.trim() === "") render();
    else runSearch();
  });

  regionEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      regionEl.querySelectorAll("button").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      regionFilter = btn.dataset.region;
      if(query.trim() === "") renderDefault();
    });
  });

  render();
})();
