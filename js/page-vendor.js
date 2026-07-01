/* =========================================================================
   page-vendor.js — Perfil público de un vendor (visto por el PM).
   Muestra toda la información y permite calificar con 5 estrellas.
   Regla: un property manager solo deja UNA reseña por vendor (la edita
   si vuelve a calificar).
   ========================================================================= */
(function () {
  const user = Storage.getCurrentUser();
  if (!user) { window.location.href = "auth.html"; return; }

  const id = UI.getQueryParam("id");
  const stateAbbr = UI.getQueryParam("state");
  const catId = UI.getQueryParam("cat");

  const vendor = Storage.getVendorById(id);
  if (!vendor) { window.location.href = "markets.html"; return; }
  const p = vendor.profile || {};

  const $ = sel => document.querySelector(sel);

  // ─── Migas de pan + botón "atrás" ────────────────────
  const crumbs = [
    { label: "Home", href: "index.html" },
    { label: "Markets", href: "markets.html" }
  ];
  const stateData = stateAbbr ? STATES_DATA[stateAbbr] : null;
  const category = catId ? VENDOR_CATEGORIES.find(c => c.id === catId) : null;
  if (stateData) crumbs.push({ label: stateData.name, href: `market.html?state=${stateAbbr}` });
  if (stateData && category) crumbs.push({ label: category.name, href: `category.html?state=${stateAbbr}&cat=${catId}` });
  crumbs.push({ label: p.businessName || "Vendor" });
  UI.mountChrome(crumbs, true);

  // ¿El que mira es el DUEÑO de este perfil (el propio vendor)?
  const isOwner = user.role === "vendor" && user.id === vendor.id;

  const back = $("#backLink");
  if (isOwner) {
    back.href = "vendor-dashboard.html";
    $("#backLinkText").textContent = "Back to edit";
  } else if (stateData && category) {
    back.href = `category.html?state=${stateAbbr}&cat=${catId}`;
    $("#backLinkText").textContent = `Back to ${category.name}`;
  } else if (stateData) {
    back.href = `market.html?state=${stateAbbr}`;
    $("#backLinkText").textContent = `Back to ${stateData.name}`;
  } else {
    $("#backLinkText").textContent = "Back to markets";
  }

  document.title = `${p.businessName || "Vendor"} · VendorHub`;

  // ─── Hero (avatar, nombre, rating, meta, acciones) ───
  const summary = Storage.getRatingSummary(vendor);
  $("#heroAvatar").innerHTML = p.avatar
    ? `<img src="${p.avatar}" alt="${UI.escapeHtml(p.businessName)}"/>`
    : UI.escapeHtml(UI.initials(p.businessName, 2));

  $("#vendorName").innerHTML = `${UI.escapeHtml(p.businessName || "Vendor")}`;

  $("#ratingLine").innerHTML = summary.count > 0
    ? `<span class="stars">${UI.starString(summary.avg)}</span>
       <span class="meta">${summary.avg.toFixed(1)} · ${summary.count} ${summary.count === 1 ? "review" : "reviews"}</span>`
    : `<span class="new-badge">New · no reviews yet</span>`;

  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  $("#vendorMeta").innerHTML = [
    cityState ? `<span>📍 ${UI.escapeHtml(cityState)}</span>` : "",
    p.yearsActive ? `<span>📅 ${UI.escapeHtml(p.yearsActive)} yrs in business</span>` : "",
    p.employees ? `<span>👥 ${UI.escapeHtml(p.employees)} employees</span>` : ""
  ].filter(Boolean).join("");

  // El DUEÑO solo ve "Edit profile". Los Property Managers ven los botones
  // de contacto (Visit website / Call / Email).
  $("#heroActions").innerHTML = isOwner
    ? `<a class="btn btn-primary" href="vendor-dashboard.html">Edit profile</a>`
    : [
        p.website ? `<a class="btn btn-primary" href="${encodeURI(p.website)}" target="_blank" rel="noopener">Visit website</a>` : "",
        p.phone ? `<a class="btn btn-secondary" href="tel:${UI.escapeHtml(p.phone)}">Call</a>` : "",
        vendor.email ? `<a class="btn btn-secondary" href="mailto:${UI.escapeHtml(vendor.email)}">Email</a>` : ""
      ].filter(Boolean).join("");

  // Aviso de "Profile incomplete" — solo visible para el propio vendor.
  if (isOwner) {
    const status = Storage.getProfileCompleteness(vendor);
    const box = $("#ownerStatus");
    if (status.complete) {
      box.innerHTML = `
        <div class="status-banner complete">
          <span class="status-ico">✓</span>
          <div><strong>Profile complete</strong> · property managers can now see your full profile.</div>
        </div>`;
    } else {
      box.innerHTML = `
        <div class="status-banner incomplete">
          <span class="status-ico">!</span>
          <div>
            <strong>Profile incomplete</strong> · ${status.filled} of ${status.total} done. Still missing:
            ${status.missing.map(m => `<span class="miss-tag">${UI.escapeHtml(m)}</span>`).join(" ")}
            <a href="vendor-dashboard.html" class="status-link">Complete it →</a>
          </div>
        </div>`;
    }
  }

  // ─── About ───────────────────────────────────────────
  $("#aboutBlock").innerHTML = p.about
    ? `<p class="about-text">${UI.escapeHtml(p.about)}</p>`
    : `<p class="about-text muted">This vendor hasn't added a description yet.</p>`;

  // ─── Services ────────────────────────────────────────
  const services = p.services || [];
  $("#servicesBlock").innerHTML = services.length
    ? services.map(s => {
        const isMatch = category && category.services.includes(s);
        return `<span class="tag ${isMatch ? "hl" : ""}">${UI.escapeHtml(s)}</span>`;
      }).join("")
    : `<p class="about-text muted">No services listed.</p>`;

  // ─── Coverage ────────────────────────────────────────
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
      const detail = counties.map(([county, cities]) => {
        return cities && cities.length
          ? `${UI.escapeHtml(county)} (${cities.map(UI.escapeHtml).join(", ")})`
          : `${UI.escapeHtml(county)} (all cities)`;
      }).join(" · ");
      return `<div class="state-block">
        <div class="state-name">${UI.escapeHtml(stateName)}
          <span class="scope-badge">${counties.length} ${counties.length === 1 ? "county" : "counties"}</span></div>
        <div class="scope-detail">${detail || "No counties selected"}</div>
      </div>`;
    }).join("");
  }

  // ─── Contact (sidebar) ───────────────────────────────
  function row(label, valueHtml) {
    return `<div class="contact-row"><div class="label">${label}</div><div class="value">${valueHtml}</div></div>`;
  }
  $("#contactBlock").innerHTML = [
    p.vendorMeldName ? row("Vendor Meld Name", UI.escapeHtml(p.vendorMeldName)) : "",
    p.contactName ? row("Contact", UI.escapeHtml(p.contactName)) : "",
    vendor.email ? row("Email", `<a href="mailto:${UI.escapeHtml(vendor.email)}">${UI.escapeHtml(vendor.email)}</a>`) : "",
    p.phone ? row("Phone", `<a href="tel:${UI.escapeHtml(p.phone)}">${UI.escapeHtml(p.phone)}</a>`) : "",
    p.website ? row("Website", `<a href="${encodeURI(p.website)}" target="_blank" rel="noopener">${UI.escapeHtml(p.website)}</a>`) : "",
    cityState ? row("Location", UI.escapeHtml([p.addressLine, cityState, p.zip].filter(Boolean).join(", "))) : ""
  ].filter(Boolean).join("") || `<p class="about-text muted">No contact info.</p>`;

  // ─── Licenses (sidebar) ──────────────────────────────
  const licenses = Array.isArray(p.licenses) ? p.licenses : [];
  let licenseHtml = "";
  if (p.license) licenseHtml += row("License #", UI.escapeHtml(p.license));
  if (licenses.length) {
    licenseHtml += `<div class="license-docs">` + licenses.map(f =>
      `<a class="file-chip" href="${f.dataURL}" target="_blank" rel="noopener" download="${UI.escapeHtml(f.name)}">
         <span class="file-ico">${f.type && f.type.indexOf("pdf") > -1 ? "📄" : "🖼️"}</span>
         <span class="file-name">${UI.escapeHtml(f.name)}</span>
       </a>`).join("") + `</div>`;
  }
  $("#licenseBlock").innerHTML = licenseHtml || `<p class="about-text muted">No licenses on file.</p>`;

  // ─── Reviews summary + list ──────────────────────────
  function renderReviews() {
    const fresh = Storage.getVendorById(id);
    const sum = Storage.getRatingSummary(fresh);
    const reviews = (fresh.reviews || []).slice().sort((a, b) => b.createdAt - a.createdAt);

    $("#reviewsSummary").innerHTML = sum.count > 0
      ? `<div class="rating-big">${sum.avg.toFixed(1)}</div>
         <div class="rating-meta">
           <div class="stars">${UI.starString(sum.avg)}</div>
           <div>${sum.count} ${sum.count === 1 ? "review" : "reviews"}</div>
         </div>`
      : `<p class="about-text muted" style="margin:0">Be the first to review this vendor.</p>`;

    // refresca también la línea del hero
    $("#ratingLine").innerHTML = sum.count > 0
      ? `<span class="stars">${UI.starString(sum.avg)}</span>
         <span class="meta">${sum.avg.toFixed(1)} · ${sum.count} ${sum.count === 1 ? "review" : "reviews"}</span>`
      : `<span class="new-badge">New · no reviews yet</span>`;

    const list = $("#reviewsList");
    if (reviews.length === 0) {
      list.innerHTML = "";
      return;
    }
    list.className = "review-list";
    list.innerHTML = reviews.map(r => `
      <div class="review-item">
        <div class="review-head">
          <span class="reviewer">${UI.escapeHtml(r.pmName)}</span>
          <span class="review-date">${new Date(r.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="stars">${UI.starString(r.stars)}</div>
        ${r.comment ? `<div class="review-text">${UI.escapeHtml(r.comment)}</div>` : ""}
      </div>
    `).join("");
  }
  renderReviews();

  // ─── Rating form (solo Property Managers) ────────────
  if (user.role === "pm") {
    const myReview = (vendor.reviews || []).find(r => r.pmId === user.id);
    let chosen = myReview ? myReview.stars : 0;

    const box = $("#rateBox");
    box.innerHTML = `
      <div class="rate-box">
        <div class="rate-title">${myReview ? "Update your rating" : "Rate this vendor"}</div>
        <div class="star-input" id="starInput">
          ${[1, 2, 3, 4, 5].map(n => `<span data-star="${n}">★</span>`).join("")}
        </div>
        <textarea class="field-textarea" id="reviewComment" placeholder="Share your experience (optional)…">${myReview ? UI.escapeHtml(myReview.comment) : ""}</textarea>
        <button class="btn btn-primary" id="submitReview">${myReview ? "Update review" : "Submit review"}</button>
      </div>
    `;

    const starEls = box.querySelectorAll("#starInput span");
    function paintStars(value) {
      starEls.forEach(el => {
        el.classList.toggle("on", Number(el.dataset.star) <= value);
      });
    }
    paintStars(chosen);

    starEls.forEach(el => {
      el.addEventListener("mouseenter", () => paintStars(Number(el.dataset.star)));
      el.addEventListener("click", () => { chosen = Number(el.dataset.star); paintStars(chosen); });
    });
    box.querySelector("#starInput").addEventListener("mouseleave", () => paintStars(chosen));

    $("#submitReview").addEventListener("click", () => {
      if (chosen < 1) {
        UI.showToast("Please pick a star rating first.", "error");
        return;
      }
      const pmName = (user.profile && user.profile.company) || (user.profile && user.profile.fullName) || user.email;
      Storage.addOrUpdateReview(id, {
        pmId: user.id,
        pmName,
        stars: chosen,
        comment: $("#reviewComment").value
      });
      UI.showToast("Thanks! Your review was saved.", "success");
      renderReviews();
    });
  }

})();
