/* =========================================================================
   ui.js — UTILIDADES DE INTERFAZ (UI helpers)
   -------------------------------------------------------------------------
   Funciones que usan TODAS las páginas: pintar el encabezado y el pie de
   página (mountChrome), mostrar avisos (showToast), escapar texto para
   evitar errores/seguridad, leer parámetros de la URL, etc.
   ========================================================================= */
window.UI = (function () {

  /* Escapa caracteres peligrosos para que un nombre como "Bob & Co <b>"
     no rompa el HTML ni permita inyección. SIEMPRE escapar texto que
     viene del usuario antes de meterlo en innerHTML. */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Lee un parámetro de la URL. Ej: en "market.html?state=FL" →
     getQueryParam("state") devuelve "FL". */
  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* Iniciales a partir de un nombre. "BlueWave Plumbing" → "BP". */
  function initials(name, max) {
    max = max || 2;
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";
    return words.slice(0, max).map(w => w[0].toUpperCase()).join("");
  }

  /* Dibuja las estrellas como texto. Ej: starString(4) → "★★★★☆". */
  function starString(value) {
    const full = Math.round(Number(value) || 0);
    return "★★★★★☆☆☆☆☆".slice(5 - full, 10 - full);
  }

  /* Aviso flotante arriba a la derecha. type: "success" | "error" | "" */
  function showToast(message, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(120%)";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* =======================================================================
     mountChrome(crumbs, showNav)
     Dibuja el <header> y el <footer> que ya existen vacíos en cada página.
       - crumbs:  arreglo de migas de pan, ej: [{label:"Home", href:"index.html"}, {label:"Markets"}]
       - showNav: true para mostrar el bloque de usuario (avatar + cerrar sesión)
     ===================================================================== */
  function mountChrome(crumbs, showNav) {
    crumbs = crumbs || [];
    const user = Storage.getCurrentUser();

    // ---- migas de pan ----
    const crumbsHtml = crumbs.map((c, i) => {
      const sep = i < crumbs.length - 1 ? `<span class="sep">/</span>` : "";
      const label = escapeHtml(c.label);
      return c.href
        ? `<a href="${c.href}">${label}</a>${sep}`
        : `<span>${label}</span>${sep}`;
    }).join("");

    // ---- bloque de usuario a la derecha ----
    let navHtml = "";
    if (showNav && user) {
      const isVendor = user.role === "vendor";
      const name = isVendor
        ? (user.profile && user.profile.businessName) || user.email
        : (user.profile && user.profile.company) || user.email;
      const homeLink = isVendor
        ? `<a class="header-btn" href="vendor-dashboard.html">My profile</a>`
        : `<a class="header-btn" href="markets.html">Markets</a>`;
      navHtml = `
        ${homeLink}
        <span class="user-pill">
          <span class="avatar">${escapeHtml(initials(name, 2))}</span>
          <span class="pill-name">${escapeHtml(name)}</span>
        </span>
        <button class="header-btn" data-action="logout">Sign out</button>
      `;
    } else if (showNav) {
      navHtml = `<a class="header-btn primary" href="auth.html">Sign in</a>`;
    }

    // ---- header ----
    const header = document.querySelector(".site-header");
    if (header) {
      header.innerHTML = `
        <div class="header-inner">
          <a class="logo" href="index.html">The Vendors Hub</a>
          <div class="header-nav">
            ${crumbs.length ? `<nav class="crumbs">${crumbsHtml}</nav>` : ""}
            ${navHtml}
          </div>
        </div>
      `;
      const logoutBtn = header.querySelector('[data-action="logout"]');
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
          Auth.logout();
          window.location.href = "index.html";
        });
      }
    }

    // ---- footer ----
    const footer = document.querySelector(".site-footer");
    if (footer) {
      const year = new Date().getFullYear();
      footer.innerHTML = `
        <div class="footer-inner">
          <div>
            <div class="footer-brand">The Vendors Hub</div>
            <p>The professional network connecting property managers with verified vendors across every U.S. market.</p>
          </div>
          <div>
            <h4>Platform</h4>
            <a href="index.html">Home</a>
            <a href="markets.html">Markets</a>
            <a href="auth.html">Sign in</a>
          </div>
          <div>
            <h4>For Vendors</h4>
            <a href="auth.html?role=vendor&mode=register">Register</a>
            <a href="vendor-dashboard.html">My profile</a>
          </div>
          <div>
            <h4>Demo</h4>
            <a data-action="reset">Reset demo data</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${year} The Vendors Hub · Internal tool</span>
          <span>Established 2025</span>
        </div>
      `;
      const resetBtn = footer.querySelector('[data-action="reset"]');
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          if (confirm("This will erase all accounts and reload the demo vendors. Continue?")) {
            Storage.resetDemo();
            Auth.logout();
            window.location.href = "index.html";
          }
        });
      }
    }
  }

  /* =======================================================================
     Ilustración aleatoria del hero (compartida por markets.html y market.html).
     Cambia en cada carga y al volver con el botón "atrás" (bfcache), y evita
     repetir la misma imagen dos veces seguidas.
     ===================================================================== */
  const ILLUSTRATION_POOL = [
    "market-1.png", "market-2.png",               // apretón de manos
    "market-3.png", "market-4.png", "market-5.png", // escritorios
    "market-6.png",                                // contratista al teléfono
    "market-7.png",                                // pareja (pm-woman + contratista)
    "handyman.png", "contractor.png", "pm-man.png" // personajes individuales
  ];
  function pickRandomIllustration(imgId){
    const img = document.getElementById(imgId);
    if(!img) return;
    function pick(){
      const last = sessionStorage.getItem("tvh_lastHero");
      let choice = ILLUSTRATION_POOL[Math.floor(Math.random() * ILLUSTRATION_POOL.length)];
      let guard = 0;
      while(choice === last && ILLUSTRATION_POOL.length > 1 && guard++ < 12){
        choice = ILLUSTRATION_POOL[Math.floor(Math.random() * ILLUSTRATION_POOL.length)];
      }
      sessionStorage.setItem("tvh_lastHero", choice);
      img.src = "assets/" + choice;
    }
    pick();
    window.addEventListener("pageshow", function(e){ if(e.persisted) pick(); });
  }

  return { escapeHtml, getQueryParam, initials, starString, showToast, mountChrome, pickRandomIllustration };
})();
