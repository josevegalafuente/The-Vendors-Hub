/* =========================================================================
   page-vendor.js — perfil público de un vendor.
   Muestra toda la información y permite calificar con 5 estrellas.
   Regla: un property manager solo deja UNA reseña por vendor (la edita si
   vuelve a calificar).
   ========================================================================= */
(function () {
  const user = DB.getCurrentUser();
  if (!user) { window.location.replace("auth.html"); return; }

  const id = UI.getQueryParam("id");
  const stateAbbr = UI.getQueryParam("state");
  const catId = UI.getQueryParam("cat");

  const vendor = DB.getVendorById(id);
  if (!vendor) { window.location.replace("markets.html"); return; }
  const p = vendor.profile || {};

  const $ = sel => document.querySelector(sel);

  // ─── Migas de pan + botón "atrás" ────────────────────
  const crumbs = [
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" }
  ];
  const stateData = stateAbbr ? STATES_DATA[stateAbbr] : null;
  const category = catId ? VENDOR_CATEGORIES.find(c => c.id === catId) : null;
  if (stateData) crumbs.push({ label: stateData.name, href: `market.html?state=${encodeURIComponent(stateAbbr)}` });
  if (stateData && category) {
    crumbs.push({ label: category.name,
      href: `category.html?state=${encodeURIComponent(stateAbbr)}&cat=${encodeURIComponent(catId)}` });
  }
  crumbs.push({ label: p.businessName || "Vendor" });
  UI.mountChrome(crumbs, true);

  // ¿El que mira es el DUEÑO de este perfil?
  const isOwner = user.role === "vendor" && user.id === vendor.id;
  // ¿Es una ficha del directorio que nadie ha reclamado todavía?
  const isUnclaimedListing = vendor.kind === "listing" && !vendor.claimed;

  const back = $("#backLink");
  if (isOwner) {
    back.href = "vendor-dashboard.html";
    $("#backLinkText").textContent = "Back to edit";
  } else if (stateData && category) {
    back.href = `category.html?state=${encodeURIComponent(stateAbbr)}&cat=${encodeURIComponent(catId)}`;
    $("#backLinkText").textContent = `Back to ${category.name}`;
  } else if (stateData) {
    back.href = `market.html?state=${encodeURIComponent(stateAbbr)}`;
    $("#backLinkText").textContent = `Back to ${stateData.name}`;
  } else {
    back.href = "markets.html";
    $("#backLinkText").textContent = "Back to markets";
  }

  document.title = `${p.businessName || "Vendor"} · VendorHub`;

  // ─── Hero ────────────────────────────────────────────
  const summary = DB.getRatingSummary(vendor);
  $("#heroAvatar").innerHTML = UI.avatarHtml(p.avatar, p.businessName);
  $("#vendorName").textContent = p.businessName || "Vendor";

  function ratingLineHtml(sum){
    return sum.count > 0
      ? `<span class="stars">${UI.starString(sum.avg)}</span>
         <span class="meta">${sum.avg.toFixed(1)} · ${sum.count} ${sum.count === 1 ? "review" : "reviews"}</span>`
      : `<span class="new-badge">New · no reviews yet</span>`;
  }
  $("#ratingLine").innerHTML = ratingLineHtml(summary);

  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  $("#vendorMeta").innerHTML = [
    cityState ? `<span>📍 ${UI.escapeHtml(cityState)}</span>` : "",
    p.yearsActive ? `<span>📅 ${UI.escapeHtml(p.yearsActive)} yrs in business</span>` : "",
    p.employees ? `<span>👥 ${UI.escapeHtml(p.employees)} employees</span>` : "",
    isUnclaimedListing ? `<span class="unclaimed-chip">Directory listing · unclaimed</span>` : ""
  ].filter(Boolean).join("");

  /* Botones de contacto.
     El sitio web pasa por Auth.sanitizeUrl: si alguien escribió
     `javascript:…` en su perfil, el enlace simplemente no se pinta. Antes se
     usaba encodeURI(), que NO bloquea ese esquema y permitía ejecutar código
     al pulsar el botón. */
  const websiteUrl = UI.safeUrl(p.website);
  const telHref = String(p.phone || "").replace(/[^0-9+]/g, "");

  function renderHeroActions(email){
    $("#heroActions").innerHTML = isOwner
      ? `<a class="btn btn-primary" href="vendor-dashboard.html">Edit profile</a>`
      : [
          websiteUrl ? `<a class="btn btn-primary" href="${UI.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">Visit website</a>` : "",
          telHref ? `<a class="btn btn-secondary" href="tel:${UI.escapeHtml(telHref)}">Call</a>` : "",
          email ? `<a class="btn btn-secondary" href="mailto:${encodeURIComponent(email)}">Email</a>` : ""
        ].filter(Boolean).join("");
  }
  renderHeroActions(vendor.email);

  // ─── Aviso de perfil incompleto (solo el dueño) ──────
  if (isOwner) {
    const status = DB.getProfileCompleteness(vendor);
    const box = $("#ownerStatus");
    box.innerHTML = status.complete
      ? `<div class="status-banner complete">
           <span class="status-ico">✓</span>
           <div><strong>Profile complete</strong> · property managers can now see your full profile.</div>
         </div>`
      : `<div class="status-banner incomplete">
           <span class="status-ico">!</span>
           <div>
             <strong>Profile incomplete</strong> · ${status.filled} of ${status.total} done. Still missing:
             ${status.missing.map(m => `<span class="miss-tag">${UI.escapeHtml(m)}</span>`).join(" ")}
             <a href="vendor-dashboard.html" class="status-link">Complete it →</a>
           </div>
         </div>`;
  }

  /* ─── Reclamar esta ficha ─────────────────────────────
     Si un vendor con cuenta ve una ficha del directorio sin dueño, puede
     pedir que se la asignen. NO se asigna sola: la solicitud queda pendiente
     y el administrador decide. Así nadie se apropia del negocio de otro. */
  if (user.role === "vendor" && isUnclaimedListing) {
    const box = $("#ownerStatus");
    const alreadyClaimed = !!user.claimedRef;
    const pending = DB.getClaims().some(c =>
      c.userId === user.id && c.ref === vendor.ref && c.status === "pending");

    if (pending) {
      box.innerHTML = `<div class="status-banner pending">
          <span class="status-ico">⏳</span>
          <div><strong>Claim pending</strong> · an administrator is reviewing your request for this listing.</div>
        </div>`;
    } else if (!alreadyClaimed) {
      box.innerHTML = `<div class="status-banner claim">
          <span class="status-ico">🏷️</span>
          <div>
            <strong>Is this your business?</strong> Claim this listing and an administrator will review it.
            <button class="btn btn-sm btn-primary" id="claimBtn" type="button">Claim this listing</button>
          </div>
        </div>`;
      $("#claimBtn").addEventListener("click", () => {
        const note = window.prompt(
          "Tell the administrator how we can verify this is your business (license number, phone, website…):", "");
        if (note === null) return;
        const res = DB.createClaim(user.id, vendor.ref, note);
        if (res.ok) {
          UI.showToast("Request sent. An administrator will review it.", "success");
          setTimeout(() => window.location.reload(), 900);
        } else {
          UI.showToast(res.error, "error");
        }
      });
    }
  }

  // ─── About ───────────────────────────────────────────
  $("#aboutBlock").innerHTML = p.about
    ? `<p class="about-text">${UI.escapeHtml(p.about)}</p>`
    : `<p class="about-text muted">This vendor hasn't added a description yet.</p>`;

  // ─── Servicios ───────────────────────────────────────
  const services = p.services || [];
  $("#servicesBlock").innerHTML = services.length
    ? services.map(s => {
        const isMatch = category && category.services && category.services.includes(s);
        return `<span class="tag ${isMatch ? "hl" : ""}">${UI.escapeHtml(s)}</span>`;
      }).join("")
    : `<p class="about-text muted">No services listed.</p>`;

  // ─── Cobertura ───────────────────────────────────────
  const coverage = p.coverage || {};
  const stateKeys = Object.keys(coverage);
  if (stateKeys.length === 0) {
    $("#coverageBlock").innerHTML = `<p class="about-text muted">No coverage areas defined.</p>`;
  } else {
    $("#coverageBlock").innerHTML = stateKeys.map(abbr => {
      const sd = STATES_DATA[abbr];
      const c = coverage[abbr];
      const stateName = sd ? sd.name : abbr;
      if (c.mode === "full") {
        return `<div class="state-block">
          <div class="state-name">${UI.escapeHtml(stateName)}
            <span class="scope-badge">Full state</span></div>
        </div>`;
      }
      const counties = Object.entries(c.counties || {});
      const detail = counties.map(([county, cities]) =>
        cities && cities.length
          ? `${UI.escapeHtml(county)} (${cities.map(UI.escapeHtml).join(", ")})`
          : `${UI.escapeHtml(county)} (all cities)`
      ).join(" · ");
      return `<div class="state-block">
        <div class="state-name">${UI.escapeHtml(stateName)}
          <span class="scope-badge">${counties.length} ${counties.length === 1 ? "county" : "counties"}</span></div>
        <div class="scope-detail">${detail || "No counties selected"}</div>
      </div>`;
    }).join("");
  }

  // ─── Contacto (barra lateral) ────────────────────────
  function row(label, valueHtml) {
    return `<div class="contact-row"><div class="label">${UI.escapeHtml(label)}</div>` +
           `<div class="value">${valueHtml}</div></div>`;
  }
  function renderContactBlock(email){
    $("#contactBlock").innerHTML = [
      p.vendorMeldName ? row("Vendor Meld Name", UI.escapeHtml(p.vendorMeldName)) : "",
      p.contactName ? row("Contact", UI.escapeHtml(p.contactName)) : "",
      email ? row("Email", `<a href="mailto:${encodeURIComponent(email)}">${UI.escapeHtml(email)}</a>`) : "",
      telHref ? row("Phone", `<a href="tel:${UI.escapeHtml(telHref)}">${UI.escapeHtml(p.phone)}</a>`) : "",
      websiteUrl ? row("Website", `<a href="${UI.escapeHtml(websiteUrl)}" target="_blank" rel="noopener noreferrer">${UI.escapeHtml(p.website)}</a>`) : "",
      cityState ? row("Location", UI.escapeHtml([p.addressLine, cityState, p.zip].filter(Boolean).join(", "))) : ""
    ].filter(Boolean).join("") || `<p class="about-text muted">No contact info.</p>`;
  }
  renderContactBlock(vendor.email);

  /* Los correos de las fichas importadas solo se cargan cuando el sitio se
     abre en local (ver db.js → loadLocalContacts). Como llegan un instante
     después, repintamos el contacto en cuanto estén disponibles. */
  DB.contactsReady.then(loaded => {
    if(!loaded) return;
    const fresh = DB.getVendorById(id);
    if(fresh && fresh.email && fresh.email !== vendor.email){
      renderContactBlock(fresh.email);
      renderHeroActions(fresh.email);
    }
  });

  // ─── Licencias (barra lateral) ───────────────────────
  const licenses = Array.isArray(p.licenses) ? p.licenses : [];
  let licenseHtml = "";
  if (p.license) licenseHtml += row("License #", UI.escapeHtml(p.license));
  if (licenses.length) {
    const chips = licenses.map(f => {
      // Solo se enlaza si el adjunto es realmente un PDF o una imagen.
      const src = UI.safeFileSrc(f.dataURL);
      if (!src) return "";
      const isPdf = src.indexOf("data:application/pdf") === 0;
      return `<a class="file-chip" href="${UI.escapeHtml(src)}" target="_blank" rel="noopener noreferrer"
                 download="${UI.escapeHtml(f.name)}">
                <span class="file-ico">${isPdf ? "📄" : "🖼️"}</span>
                <span class="file-name">${UI.escapeHtml(f.name)}</span>
              </a>`;
    }).join("");
    if (chips) licenseHtml += `<div class="license-docs">${chips}</div>`;
  }
  $("#licenseBlock").innerHTML = licenseHtml || `<p class="about-text muted">No licenses on file.</p>`;

  // ─── Reseñas ─────────────────────────────────────────
  function renderReviews() {
    const fresh = DB.getVendorById(id) || vendor;
    const sum = DB.getRatingSummary(fresh);
    const reviews = (fresh.reviews || []).slice().sort((a, b) => b.createdAt - a.createdAt);

    $("#reviewsSummary").innerHTML = sum.count > 0
      ? `<div class="rating-big">${sum.avg.toFixed(1)}</div>
         <div class="rating-meta">
           <div class="stars">${UI.starString(sum.avg)}</div>
           <div>${sum.count} ${sum.count === 1 ? "review" : "reviews"}</div>
         </div>`
      : `<p class="about-text muted" style="margin:0">Be the first to review this vendor.</p>`;

    $("#ratingLine").innerHTML = ratingLineHtml(sum);

    const list = $("#reviewsList");
    if (reviews.length === 0) { list.innerHTML = ""; return; }
    list.className = "review-list";
    list.innerHTML = reviews.map(r => `
      <div class="review-item">
        <div class="review-head">
          <span class="reviewer">${UI.escapeHtml(r.pmName)}</span>
          <span class="review-date">${UI.escapeHtml(UI.formatDate(r.createdAt))}</span>
        </div>
        <div class="stars">${UI.starString(r.stars)}</div>
        ${r.comment ? `<div class="review-text">${UI.escapeHtml(r.comment)}</div>` : ""}
      </div>
    `).join("");
  }
  renderReviews();

  // ─── Formulario de calificación (solo Property Managers) ──
  if (user.role === "pm") {
    const myReview = (vendor.reviews || []).find(r => r.pmId === user.id);
    let chosen = myReview ? myReview.stars : 0;

    const box = $("#rateBox");
    box.innerHTML = `
      <div class="rate-box">
        <div class="rate-title">${myReview ? "Update your rating" : "Rate this vendor"}</div>
        <div class="star-input" id="starInput" role="radiogroup" aria-label="Rating">
          ${[1, 2, 3, 4, 5].map(n =>
            `<span data-star="${n}" role="radio" tabindex="0" aria-label="${n} star${n === 1 ? "" : "s"}"
                   aria-checked="false">★</span>`).join("")}
        </div>
        <textarea class="field-textarea" id="reviewComment" maxlength="1000"
          placeholder="Share your experience (optional)…"></textarea>
        <button class="btn btn-primary" id="submitReview" type="button">${myReview ? "Update review" : "Submit review"}</button>
      </div>
    `;
    // El comentario se asigna por valor, no por innerHTML: nada de lo que
    // escriba un usuario puede acabar interpretándose como HTML.
    $("#reviewComment").value = myReview ? myReview.comment : "";

    const starEls = box.querySelectorAll("#starInput span");
    function paintStars(value) {
      starEls.forEach(el => {
        const on = Number(el.dataset.star) <= value;
        el.classList.toggle("on", on);
        el.setAttribute("aria-checked", String(Number(el.dataset.star) === value));
      });
    }
    paintStars(chosen);

    starEls.forEach(el => {
      el.addEventListener("mouseenter", () => paintStars(Number(el.dataset.star)));
      el.addEventListener("click", () => { chosen = Number(el.dataset.star); paintStars(chosen); });
      // Accesible por teclado (antes solo funcionaba con ratón).
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          chosen = Number(el.dataset.star);
          paintStars(chosen);
        }
      });
    });
    box.querySelector("#starInput").addEventListener("mouseleave", () => paintStars(chosen));

    $("#submitReview").addEventListener("click", () => {
      if (chosen < 1) { UI.showToast("Please pick a star rating first.", "error"); return; }
      const pmName = (user.profile && user.profile.company) ||
                     (user.profile && user.profile.fullName) || user.email;
      const ok = DB.addOrUpdateReview(id, {
        pmId: user.id, pmName, stars: chosen, comment: $("#reviewComment").value
      });
      if (ok) {
        UI.showToast("Thanks! Your review was saved.", "success");
        renderReviews();
      } else {
        UI.showToast("Could not save your review. Please try again.", "error");
      }
    });
  }
})();
