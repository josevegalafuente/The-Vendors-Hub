/* =========================================================================
   page-admin.js — PANEL DE ADMINISTRACIÓN
   -------------------------------------------------------------------------
   Solo accesible para los correos listados en APP_CONFIG.ADMIN_EMAILS.

   ⚠️  Recordatorio honesto: mientras el sitio no tenga servidor, este guard
       protege la NAVEGACIÓN, no los datos. Alguien con conocimientos podría
       darse el rol de admin en su propio navegador — pero solo vería SUS
       propios datos, porque cada navegador guarda los suyos. Cuando pasemos
       a Firebase, las reglas de firestore.rules harán que esto sea una
       restricción real de servidor. Ver FIREBASE.md
   ========================================================================= */
/* Espera a que la capa de datos esté lista antes de pintar. Con localStorage
   la promesa ya viene resuelta y no cambia nada; con Firestore da tiempo a
   cargar la sesión y el directorio. Si la carga falla, se pinta igual con lo
   que haya en lugar de dejar la página en blanco. */
DB.ready.catch(function(){}).then(function(){

  const admin = Auth.requireAdmin();
  if(!admin) return;

  UI.mountChrome([
    { label: "Home", href: "index.html" },
    { label: "Admin" }
  ], true);

  const $ = sel => document.querySelector(sel);

  /* =====================================================================
     RESUMEN
     ===================================================================== */
  function renderStats(){
    const users = DB.getUsers();
    const listings = DB.getListings();
    const claims = DB.getClaims();
    const usage = DB.getStorageUsage();

    const vendors = users.filter(u => u.role === "vendor").length;
    const pms = users.filter(u => u.role === "pm").length;
    const admins = users.filter(u => u.role === "admin").length;
    const pendingClaims = claims.filter(c => c.status === "pending").length;
    const claimed = listings.filter(l => l.claimedBy).length;

    $("#adminStats").innerHTML = [
      ["Accounts", users.length, `${vendors} vendors · ${pms} PMs · ${admins} admin`],
      ["Directory listings", listings.length.toLocaleString(), `${claimed} claimed`],
      ["Pending claims", pendingClaims, pendingClaims ? "needs your review" : "all clear"],
      ["Browser storage", usage.percent + "%", `${(usage.bytes / 1024 / 1024).toFixed(2)} MB of 5 MB`]
    ].map(([label, value, sub]) => `
      <div class="admin-stat${label === "Pending claims" && pendingClaims ? " alert" : ""}">
        <div class="admin-stat-value">${UI.escapeHtml(String(value))}</div>
        <div class="admin-stat-label">${UI.escapeHtml(label)}</div>
        <div class="admin-stat-sub">${UI.escapeHtml(sub)}</div>
      </div>
    `).join("");

    // Aviso cuando el almacenamiento del navegador se acerca al límite.
    const warn = $("#storageWarning");
    if(usage.percent >= 80){
      warn.innerHTML = `<div class="status-banner incomplete">
        <span class="status-ico">!</span>
        <div><strong>Browser storage is ${usage.percent}% full.</strong>
        Export a backup and consider moving to Firebase before it fills up.</div>
      </div>`;
    } else {
      warn.innerHTML = "";
    }
  }

  /* =====================================================================
     SOLICITUDES DE RECLAMACIÓN
     ===================================================================== */
  function renderClaims(){
    const claims = DB.getClaims()
      .slice()
      .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || b.createdAt - a.createdAt);

    const box = $("#claimsList");
    if(claims.length === 0){
      box.innerHTML = `<div class="admin-empty">No claim requests yet. When a vendor claims a directory
        listing, it will appear here for your approval.</div>`;
      return;
    }

    box.innerHTML = claims.map(c => {
      const listing = DB.getListingByRef(c.ref);
      const requester = DB.getUserById(c.userId);
      const isPending = c.status === "pending";
      return `
        <div class="admin-row claim-${UI.escapeHtml(c.status)}">
          <div class="admin-row-main">
            <div class="admin-row-title">
              ${UI.escapeHtml(listing ? listing.name : c.ref)}
              <span class="status-chip ${UI.escapeHtml(c.status)}">${UI.escapeHtml(c.status)}</span>
            </div>
            <div class="admin-row-sub">
              Requested by ${UI.escapeHtml(requester ? requester.email : "deleted account")}
              · ${UI.escapeHtml(UI.formatDate(c.createdAt))}
            </div>
            ${c.note ? `<div class="admin-row-note">“${UI.escapeHtml(c.note)}”</div>` : ""}
          </div>
          ${isPending ? `
            <div class="admin-row-actions">
              <button class="btn btn-sm btn-primary" data-claim-approve="${UI.escapeHtml(c.id)}">Approve</button>
              <button class="btn btn-sm btn-danger" data-claim-reject="${UI.escapeHtml(c.id)}">Reject</button>
            </div>` : ""}
        </div>`;
    }).join("");

    box.querySelectorAll("[data-claim-approve]").forEach(btn => {
      btn.addEventListener("click", () => resolveClaim(btn.dataset.claimApprove, "approved"));
    });
    box.querySelectorAll("[data-claim-reject]").forEach(btn => {
      btn.addEventListener("click", () => resolveClaim(btn.dataset.claimReject, "rejected"));
    });
  }

  function resolveClaim(claimId, decision){
    const verb = decision === "approved" ? "approve" : "reject";
    if(!UI.confirmAction(`Are you sure you want to ${verb} this claim?`)) return;
    const res = DB.resolveClaim(claimId, decision, admin);
    if(res.ok){
      UI.showToast(`Claim ${decision}.`, "success");
      renderAll();
    } else {
      UI.showToast(res.error, "error");
    }
  }

  /* =====================================================================
     CUENTAS
     ===================================================================== */
  let userQuery = "";

  function renderUsers(){
    const q = userQuery.trim().toLowerCase();
    let users = DB.getUsers().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if(q){
      users = users.filter(u =>
        String(u.email || "").toLowerCase().includes(q) ||
        String((u.profile || {}).businessName || "").toLowerCase().includes(q) ||
        String((u.profile || {}).company || "").toLowerCase().includes(q));
    }

    $("#userCount").textContent = users.length;
    const box = $("#usersList");

    if(users.length === 0){
      box.innerHTML = `<div class="admin-empty">No accounts match “${UI.escapeHtml(userQuery)}”.</div>`;
      return;
    }

    box.innerHTML = users.map(u => {
      const p = u.profile || {};
      const name = p.businessName || p.company || p.fullName || "—";
      const suspended = u.status === "suspended";
      const isSelf = u.id === admin.id;
      return `
        <div class="admin-row${suspended ? " is-suspended" : ""}">
          <div class="admin-row-main">
            <div class="admin-row-title">
              ${UI.escapeHtml(u.email)}
              <span class="status-chip role-${UI.escapeHtml(u.role)}">${UI.escapeHtml(u.role)}</span>
              ${suspended ? `<span class="status-chip rejected">suspended</span>` : ""}
              ${u.provider === "google" ? `<span class="status-chip">google</span>` : ""}
            </div>
            <div class="admin-row-sub">
              ${UI.escapeHtml(name)} · joined ${UI.escapeHtml(UI.formatDate(u.createdAt))}
              ${u.lastLoginAt ? ` · last seen ${UI.escapeHtml(UI.formatDate(u.lastLoginAt))}` : ""}
            </div>
          </div>
          <div class="admin-row-actions">
            ${isSelf ? `<span class="admin-row-note">This is you</span>` : `
              <button class="btn btn-sm btn-secondary" data-user-toggle="${UI.escapeHtml(u.id)}">
                ${suspended ? "Reactivate" : "Suspend"}
              </button>
              <button class="btn btn-sm btn-danger" data-user-delete="${UI.escapeHtml(u.id)}">Delete</button>
            `}
          </div>
        </div>`;
    }).join("");

    box.querySelectorAll("[data-user-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.userToggle;
        const u = DB.getUserById(id);
        if(!u) return;
        const next = u.status === "suspended" ? "active" : "suspended";
        if(!UI.confirmAction(`${next === "suspended" ? "Suspend" : "Reactivate"} ${u.email}?`)) return;
        DB.updateUser(id, { status: next });
        DB.logAction(admin, "user.status", { userId: id, email: u.email, status: next });
        UI.showToast(`Account ${next}.`, "success");
        renderAll();
      });
    });

    box.querySelectorAll("[data-user-delete]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.userDelete;
        const u = DB.getUserById(id);
        if(!u) return;
        if(!UI.confirmAction(
          `Permanently delete ${u.email}?\n\nThis cannot be undone. Their profile and reviews will be removed.`)) return;
        DB.deleteUser(id);
        DB.logAction(admin, "user.delete", { userId: id, email: u.email });
        UI.showToast("Account deleted.", "success");
        renderAll();
      });
    });
  }

  /* =====================================================================
     DIRECTORIO
     ===================================================================== */
  let listingQuery = "";
  const LISTING_PAGE_SIZE = 25;
  let listingLimit = LISTING_PAGE_SIZE;

  function renderListings(){
    const q = listingQuery.trim().toLowerCase();
    let listings = DB.getListings();
    if(q){
      listings = listings.filter(l =>
        String(l.name || "").toLowerCase().includes(q) ||
        String(l.ref || "").toLowerCase().includes(q) ||
        (l.states || []).some(s => s.toLowerCase() === q));
    }
    listings = listings.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));

    $("#listingCount").textContent = listings.length.toLocaleString();
    const shown = listings.slice(0, listingLimit);
    const box = $("#listingsList");

    if(listings.length === 0){
      box.innerHTML = `<div class="admin-empty">No listings match “${UI.escapeHtml(listingQuery)}”.</div>`;
      return;
    }

    box.innerHTML = shown.map(l => {
      const owner = l.claimedBy ? DB.getUserById(l.claimedBy) : null;
      return `
        <div class="admin-row${l.hidden ? " is-suspended" : ""}">
          <div class="admin-row-main">
            <div class="admin-row-title">
              ${UI.escapeHtml(l.name)}
              ${l.claimedBy ? `<span class="status-chip approved">claimed</span>` : ""}
              ${l.hidden ? `<span class="status-chip rejected">hidden</span>` : ""}
            </div>
            <div class="admin-row-sub">
              ${UI.escapeHtml((l.states || []).join(", ") || "no markets")}
              ${l.cat ? ` · ${UI.escapeHtml(l.cat)}` : ""}
              ${owner ? ` · owner: ${UI.escapeHtml(owner.email)}` : ""}
              ${(l.reviews || []).length ? ` · ${l.reviews.length} review(s)` : ""}
            </div>
          </div>
          <div class="admin-row-actions">
            <a class="btn btn-sm btn-secondary" href="vendor.html?id=l_${encodeURIComponent(l.ref)}">View</a>
            <button class="btn btn-sm btn-secondary" data-listing-toggle="${UI.escapeHtml(l.ref)}">
              ${l.hidden ? "Show" : "Hide"}
            </button>
          </div>
        </div>`;
    }).join("");

    if(listings.length > shown.length){
      box.innerHTML += `<div class="admin-more">
        <button class="btn btn-secondary" id="loadMoreListings">
          Show more (${shown.length} of ${listings.length.toLocaleString()})
        </button></div>`;
      $("#loadMoreListings").addEventListener("click", () => {
        listingLimit += LISTING_PAGE_SIZE;
        renderListings();
      });
    }

    box.querySelectorAll("[data-listing-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const ref = btn.dataset.listingToggle;
        const l = DB.getListingByRef(ref);
        if(!l) return;
        DB.updateListing(ref, { hidden: !l.hidden });
        DB.logAction(admin, "listing.visibility", { ref, hidden: !l.hidden });
        UI.showToast(l.hidden ? "Listing is visible again." : "Listing hidden from the directory.", "success");
        renderListings();
        renderStats();
      });
    });
  }

  /* =====================================================================
     REGISTRO DE ACTIVIDAD
     ===================================================================== */
  function renderAudit(){
    const log = DB.getAuditLog().slice(0, 50);
    const box = $("#auditList");
    if(log.length === 0){
      box.innerHTML = `<div class="admin-empty">No activity recorded yet.</div>`;
      return;
    }
    box.innerHTML = log.map(entry => `
      <div class="audit-item">
        <span class="audit-time">${UI.escapeHtml(new Date(entry.at).toLocaleString())}</span>
        <span class="audit-action">${UI.escapeHtml(entry.action)}</span>
        <span class="audit-actor">${UI.escapeHtml(entry.actorEmail || "system")}</span>
      </div>
    `).join("");
  }

  /* =====================================================================
     COPIA DE SEGURIDAD
     Mientras los datos vivan solo en este navegador, esto es lo único que
     separa "se perdió todo" de "no pasó nada". Bórrate el perfil del
     navegador sin copia y no hay forma de recuperarlo.
     ===================================================================== */
  $("#exportBtn").addEventListener("click", () => {
    const data = DB.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `vendorshub-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    DB.logAction(admin, "data.export", {});
    UI.showToast("Backup downloaded.", "success");
    renderAudit();
  });

  $("#importBtn").addEventListener("click", () => $("#importFile").click());

  $("#importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    e.target.value = "";
    if(!file) return;
    if(!UI.confirmAction(
      "Restoring a backup REPLACES every account and listing in this browser.\n\nContinue?")) return;

    const reader = new FileReader();
    reader.onload = ev => {
      let payload;
      try{
        payload = JSON.parse(ev.target.result);
      }catch(err){
        UI.showToast("That file is not valid JSON.", "error");
        return;
      }
      const res = DB.importData(payload, admin);
      if(res.ok){
        UI.showToast("Backup restored.", "success");
        setTimeout(() => window.location.reload(), 800);
      } else {
        UI.showToast(res.error, "error");
      }
    };
    reader.onerror = () => UI.showToast("Could not read that file.", "error");
    reader.readAsText(file);
  });

  /* Reiniciar los datos de demostración. Vive AQUÍ y no en el pie de página
     de todo el sitio: antes cualquier visitante podía borrarlo todo con dos
     clics desde el footer. */
  $("#resetBtn").addEventListener("click", () => {
    if(!UI.confirmAction(
      "This erases ALL accounts, listings, reviews and claims in this browser and reloads the demo data.\n\n" +
      "Export a backup first if you need one. Continue?")) return;
    if(!UI.confirmAction("Last confirmation — this cannot be undone. Erase everything?")) return;
    DB.resetDemo();
    UI.showToast("Demo data reloaded.", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 800);
  });

  /* =====================================================================
     BÚSQUEDAS Y PESTAÑAS
     ===================================================================== */
  $("#userSearch").addEventListener("input", UI.debounce(e => {
    userQuery = e.target.value;
    renderUsers();
  }, 180));

  $("#listingSearch").addEventListener("input", UI.debounce(e => {
    listingQuery = e.target.value;
    listingLimit = LISTING_PAGE_SIZE;
    renderListings();
  }, 180));

  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      document.querySelectorAll(".admin-panel").forEach(p => {
        p.classList.toggle("active", p.id === "panel-" + tab.dataset.panel);
      });
    });
  });

  function renderAll(){
    renderStats();
    renderClaims();
    renderUsers();
    renderListings();
    renderAudit();
  }
  renderAll();

  // Aviso del estado de los datos de contacto (solo informativo).
  DB.contactsReady.then(renderContactsNote);
  renderContactsNote();

  function renderContactsNote(){
    const contactNote = $("#contactsNote");
    if(!contactNote) return;
    const loaded = Object.keys(window.VENDOR_CONTACTS || {}).length;
    contactNote.innerHTML = loaded
      ? `<strong>${loaded.toLocaleString()}</strong> vendor contact emails loaded from your local file.
         They are never published.`
      : `Vendor contact emails are <strong>not loaded</strong>. They live in
         <code>data/vendors-contacts.local.js</code>, which is excluded from the repository so it never
         reaches the public site. Add that file locally to see contact emails here.`;
  }
});
