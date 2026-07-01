/* =========================================================================
   PM Markets — directorio con BÚSQUEDA UNIVERSAL.
   La barra de búsqueda entiende tres tipos de consulta:
     1) Estado  → "Florida", "FL"        → tarjetas de estado
     2) Servicio→ "plumbing", "electrical"→ en qué mercados hay y cuántos
     3) Ciudad  → "Ocala"                 → vendors que cubren esa ciudad
   Sin texto, muestra todos los estados (filtrables por región).
   ========================================================================= */
(function(){
  const user = Auth.requireRole("pm", "auth.html?role=pm");
  if(!user) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Markets" }
  ], true);

  // Ilustración del hero: cambia AL AZAR en cada carga / regreso a la página.
  UI.pickRandomIllustration("heroIllustration");

  const STATES_LIST = Object.entries(STATES_DATA).map(([abbr, data]) => ({
    abbr, name: data.name, region: data.region
  })).sort((a, b) => a.name.localeCompare(b.name));

  const vendors = Storage.getAllVendors();

  // Conteo total de vendors por estado (para la vista por defecto)
  const vendorsByState = {};
  STATES_LIST.forEach(s => { vendorsByState[s.abbr] = 0; });
  vendors.forEach(v => {
    Object.keys((v.profile && v.profile.coverage) || {}).forEach(abbr => {
      if(vendorsByState[abbr] !== undefined) vendorsByState[abbr] += 1;
    });
  });

  // ─── Stats superiores ────────────────────────────────
  document.getElementById("statVendors").textContent = vendors.length.toLocaleString();
  document.getElementById("statCategories").textContent = VENDOR_CATEGORIES.length;
  (function(){
    let sum = 0, n = 0;
    vendors.forEach(v => {
      const r = Storage.getRatingSummary(v);
      if(r.count > 0){ sum += r.avg; n++; }
    });
    document.getElementById("statAvgRating").textContent = n > 0 ? (sum / n).toFixed(1) : "N/A";
  })();

  // ─── Utilidades de coincidencia ──────────────────────
  // Sinónimos comunes (oficio → servicio en la base de datos)
  const SYNONYMS = {
    plumber: "plumbing", plumbers: "plumbing",
    electrician: "electrical", electricians: "electrical",
    painter: "painting", painters: "painting",
    roofer: "roofing", roofers: "roofing",
    cleaner: "cleaning", cleaners: "cleaning",
    landscaper: "landscaping", landscapers: "landscaping",
    mover: "moving", movers: "moving"
  };

  // ¿"haystack" (un servicio/categoría) coincide con la consulta q?
  function termMatch(haystack, q){
    if(q.length < 2) return false;
    if(haystack.includes(q) || q.includes(haystack)) return true;
    if(SYNONYMS[q] && haystack.includes(SYNONYMS[q])) return true;
    // prefijo compartido de 4+ letras (cubre "plumber" ↔ "plumbing")
    let n = 0;
    while(n < haystack.length && n < q.length && haystack[n] === q[n]) n++;
    return n >= 4;
  }

  function avatarInner(p){
    return p.avatar
      ? `<img src="${p.avatar}" alt="${UI.escapeHtml(p.businessName)}"/>`
      : UI.escapeHtml(UI.initials(p.businessName, 2));
  }

  // count: número; suffix: texto opcional tras "vendor(s)" (ej. "registered")
  function stateCard(abbr, name, region, count, href, suffix){
    const noun = count === 1 ? "vendor" : "vendors";
    const tail = suffix ? " " + suffix : "";
    return `
      <a class="state-card" href="${href}">
        <span class="region-tag">${region}</span>
        <div class="abbr">${abbr}</div>
        <div class="name">${UI.escapeHtml(name)}</div>
        <div class="vendors ${count === 0 ? 'zero' : ''}">
          <strong>${count}</strong> ${noun}${tail}
        </div>
      </a>`;
  }

  function vendorRow(v, cityLabel){
    const p = v.profile || {};
    const r = Storage.getRatingSummary(v);
    const svc = (p.services || []).slice(0, 3);
    const ratingTag = r.count > 0
      ? `<span class="tag">${UI.starString(r.avg)} ${r.avg.toFixed(1)} (${r.count})</span>` : "";
    return `
      <a class="vendor-row" href="vendor.html?id=${v.id}">
        <div class="vendor-avatar">${avatarInner(p)}</div>
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
                `market.html?state=${s.abbr}`, "registered")
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
            ${stateMatches.map(s => {
              const c = vendorsByState[s.abbr] || 0;
              return stateCard(s.abbr, s.name, s.region, c, `market.html?state=${s.abbr}`);
            }).join("")}
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

      const rows = STATES_LIST.map(s => {
        const cnt = vendors.filter(v =>
          Storage.vendorCoversState(v, s.abbr) &&
          (v.profile.services || []).some(sv => svcSet.has(sv))
        ).length;
        return { s, cnt };
      }).filter(r => r.cnt > 0).sort((a, b) => b.cnt - a.cnt || a.s.name.localeCompare(b.s.name));

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
              ? `category.html?state=${s.abbr}&cat=${single.id}`
              : `market.html?state=${s.abbr}`;
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
      const hits = [];
      const lim = 60;
      for(const abbr in STATES_DATA){
        const sd = STATES_DATA[abbr];
        for(const county in sd.counties){
          for(const city of sd.counties[county]){
            if(city.toLowerCase().includes(q)){
              hits.push({ abbr, stateName: sd.name, county, city });
            }
          }
        }
        if(hits.length > 400) break;
      }
      // Prioriza coincidencias exactas de ciudad
      const exact = hits.filter(h => h.city.toLowerCase() === q);
      const useHits = (exact.length ? exact : hits).slice(0, lim);

      if(useHits.length){
        // vendors que cubren alguna de esas ciudades
        const seenVendor = new Set();
        const cityVendors = [];
        vendors.forEach(v => {
          const loc = useHits.find(h => Storage.vendorCoversCity(v, h.abbr, h.county, h.city));
          if(loc && !seenVendor.has(v.id)){
            seenVendor.add(v.id);
            cityVendors.push({ v, loc });
          }
        });

        const cityName = exact.length ? exact[0].city : query.trim();
        // Si no hay vendors en la ciudad, solo mostramos el aviso cuando la
        // búsqueda apunta CLARAMENTE a una ciudad (sin coincidencias de estado
        // ni de servicio); así evitamos secciones vacías redundantes.
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
  document.getElementById("stateSearch").addEventListener("input", e => {
    query = e.target.value;
    render();
  });
  regionEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      regionEl.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      regionFilter = btn.dataset.region;
      if(query.trim() === "") renderDefault();
    });
  });

  render();
})();
