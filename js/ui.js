/* =========================================================================
   ui.js — UTILIDADES DE INTERFAZ
   -------------------------------------------------------------------------
   Funciones que usan TODAS las páginas: pintar el encabezado y el pie
   (mountChrome), avisos (showToast), escapado de texto, URLs seguras,
   compresión de imágenes, etc.

   REGLA DE ORO DE ESTE ARCHIVO
   Todo lo que venga del usuario y acabe dentro de innerHTML pasa por
   escapeHtml(). Todo lo que acabe en un href/src pasa además por safeUrl()
   o safeImageSrc(): escapar comillas NO basta, porque `javascript:alert(1)`
   no tiene comillas y aun así ejecuta código.
   ========================================================================= */
window.UI = (function () {

  /* Escapa caracteres peligrosos para que un nombre como "Bob & Co <b>"
     no rompa el HTML ni permita inyección. */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* =======================================================================
     URLs SEGURAS
     ===================================================================== */

  /* Para enlaces externos (el "Website" de un vendor). Devuelve null si el
     esquema no es http/https — bloquea javascript:, data:, vbscript:, file: */
  function safeUrl(raw) {
    return (window.Auth && Auth.sanitizeUrl) ? Auth.sanitizeUrl(raw) : null;
  }

  /* Para imágenes. Acepta solo imágenes en base64 (las que genera el propio
     navegador al subir un avatar) o archivos locales de assets/. */
  function safeImageSrc(src) {
    const s = String(src || "").trim();
    if (!s) return null;
    if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s.replace(/\s+/g, ""))) {
      return s.replace(/\s+/g, "");
    }
    if (/^assets\/[A-Za-z0-9._-]+$/.test(s)) return s;
    return null;
  }

  /* Para documentos adjuntos (licencias): PDF o imagen, siempre en base64. */
  function safeFileSrc(src) {
    const s = String(src || "").trim().replace(/\s+/g, "");
    if (/^data:(application\/pdf|image\/(png|jpeg|jpg|webp));base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    return null;
  }

  /* Devuelve el <img> ya montado y seguro, o las iniciales como respaldo. */
  function avatarHtml(src, name, fallbackInitials) {
    const safe = safeImageSrc(src);
    return safe
      ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(name || "")}" loading="lazy" />`
      : escapeHtml(fallbackInitials != null ? fallbackInitials : initials(name, 2));
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
    const full = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return "★★★★★☆☆☆☆☆".slice(5 - full, 10 - full);
  }

  /* Fecha corta y legible. */
  function formatDate(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleDateString(); } catch (e) { return ""; }
  }

  /* Retrasa la ejecución hasta que el usuario deja de escribir.
     Sin esto, cada tecla en el buscador dispara un recorrido completo del
     directorio y la escritura se siente pegajosa. */
  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), wait || 200);
    };
  }

  /* =======================================================================
     COMPRESIÓN DE IMÁGENES
     Un avatar de 4 MB se convierte en ~10 MB al pasarlo a base64 y revienta
     la cuota de localStorage (5 MB) él solo. Lo reescalamos antes de guardar.
     ===================================================================== */
  function compressImage(file, maxDimension, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = ev => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file is not a valid image."));
        img.onload = () => {
          const max = maxDimension || 512;
          let { width, height } = img;
          if (width > max || height > max) {
            const ratio = Math.min(max / width, max / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          // Fondo blanco: si no, un PNG transparente sale con fondo negro en JPEG.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality || 0.82));
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* Lee un archivo como data URL sin transformarlo (para PDFs). */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.onload = ev => resolve(ev.target.result);
      reader.readAsDataURL(file);
    });
  }

  /* Aviso flotante arriba a la derecha. type: "success" | "error" | "" */
  function showToast(message, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;                    // textContent = nunca inyecta HTML
    el.setAttribute("role", type === "error" ? "alert" : "status");
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(120%)";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* Diálogo de confirmación simple (envuelve confirm para poder sustituirlo
     por un modal propio más adelante sin tocar las páginas). */
  function confirmAction(message) {
    return window.confirm(message);
  }

  /* =======================================================================
     mountChrome(crumbs, showNav)
     Dibuja el <header> y el <footer> que ya existen vacíos en cada página.
       - crumbs:  [{label:"Home", href:"index.html"}, {label:"Markets"}]
       - showNav: true para mostrar el bloque de usuario
     ===================================================================== */
  function mountChrome(crumbs, showNav) {
    crumbs = crumbs || [];
    const user = DB.getCurrentUser();

    // ---- migas de pan ----
    const crumbsHtml = crumbs.map((c, i) => {
      const sep = i < crumbs.length - 1 ? `<span class="sep">/</span>` : "";
      const label = escapeHtml(c.label);
      return c.href
        ? `<a href="${escapeHtml(c.href)}">${label}</a>${sep}`
        : `<span>${label}</span>${sep}`;
    }).join("");

    // ---- bloque de usuario a la derecha ----
    let navHtml = "";
    if (showNav && user) {
      const isVendor = user.role === "vendor";
      const isAdmin = user.role === "admin";
      const p = user.profile || {};
      const name = isVendor
        ? (p.businessName || user.email)
        : (p.company || p.fullName || user.email);

      const links = [];
      if (isAdmin) links.push(`<a class="header-btn admin-btn" href="admin.html">Admin</a>`);
      if (isVendor) links.push(`<a class="header-btn" href="vendor-dashboard.html">My profile</a>`);
      else links.push(`<a class="header-btn" href="markets.html">Markets</a>`);

      navHtml = `
        ${links.join("")}
        <span class="user-pill${isAdmin ? " is-admin" : ""}">
          <span class="avatar">${escapeHtml(initials(name, 2))}</span>
          <span class="pill-name">${escapeHtml(name)}</span>
          ${isAdmin ? `<span class="role-chip">Admin</span>` : ""}
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
            ${crumbs.length ? `<nav class="crumbs" aria-label="Breadcrumb">${crumbsHtml}</nav>` : ""}
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
      const adminLink = (user && user.role === "admin")
        ? `<a href="admin.html">Admin panel</a>` : "";
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
            <h4>Account</h4>
            ${adminLink}
            <a href="auth.html">Sign in</a>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${year} The Vendors Hub · Internal tool</span>
          <span>Established 2025</span>
        </div>
      `;
    }
  }

  /* =======================================================================
     Ilustración aleatoria del hero (markets.html y market.html).
     Cambia en cada carga y al volver con el botón "atrás" (bfcache), y
     evita repetir la misma imagen dos veces seguidas.
     ===================================================================== */
  const ILLUSTRATION_POOL = [
    "market-1.png", "market-2.png",                // apretón de manos
    "market-3.png", "market-4.png", "market-5.png", // escritorios
    "market-6.png",                                 // contratista al teléfono
    "market-7.png",                                 // pareja (pm-woman + contratista)
    "handyman.png", "contractor.png", "pm-man.png"  // personajes individuales
  ];

  function pickRandomIllustration(imgId) {
    const img = document.getElementById(imgId);
    if (!img) return;
    function pick() {
      const last = sessionStorage.getItem("tvh_lastHero");
      let choice = ILLUSTRATION_POOL[Math.floor(Math.random() * ILLUSTRATION_POOL.length)];
      let guard = 0;
      while (choice === last && ILLUSTRATION_POOL.length > 1 && guard++ < 12) {
        choice = ILLUSTRATION_POOL[Math.floor(Math.random() * ILLUSTRATION_POOL.length)];
      }
      sessionStorage.setItem("tvh_lastHero", choice);
      img.src = "assets/" + choice;
    }
    pick();
    window.addEventListener("pageshow", e => { if (e.persisted) pick(); });
  }

  return {
    escapeHtml, getQueryParam, initials, starString, formatDate, debounce,
    safeUrl, safeImageSrc, safeFileSrc, avatarHtml,
    compressImage, readFileAsDataURL,
    showToast, confirmAction, mountChrome, pickRandomIllustration
  };
})();
