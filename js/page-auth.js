/* =========================================================================
   Auth page logic — sign in / register tabs, role selection, submit
   ========================================================================= */
(function(){
  // ¿Ya tiene sesión? Lo mandamos a su panel.
  // Solo si el rol es VÁLIDO; si la sesión trae un rol corrupto, la limpiamos
  // y dejamos que inicie sesión de nuevo (así no se genera un bucle con las
  // páginas protegidas que rebotan a auth.html).
  const existing = Storage.getCurrentUser();
  if(existing && (existing.role === "vendor" || existing.role === "pm")){
    window.location.href = existing.role === "vendor" ? "vendor-dashboard.html" : "markets.html";
    return;
  }
  if(existing){
    Storage.clearSession();
  }

  UI.mountChrome([], false);

  let mode = UI.getQueryParam("mode") || "signin";  // "signin" | "register"
  let role = UI.getQueryParam("role") || null;      // "vendor" | "pm" | null

  const $ = sel => document.querySelector(sel);
  const tabsEl     = $("#modeTabs");
  const formTitle  = $("#formTitle");
  const formLede   = $("#formLede");
  const heroBadge  = $("#heroBadge");
  const heroTitle  = $("#heroTitle");
  const heroDesc   = $("#heroDesc");
  const submitBtn  = $("#submitBtn");
  const roleSection= $("#roleSection");
  const confirmGrp = $("#confirmPasswordGroup");
  const authFoot   = $("#authFootText");
  const alertBox   = $("#alertContainer");

  function setMode(newMode){
    mode = newMode;
    tabsEl.querySelectorAll("button").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });

    if(mode === "register"){
      formTitle.textContent = "Create your account";
      formLede.textContent = "Start by selecting your role below.";
      heroBadge.textContent = "Get started";
      heroTitle.innerHTML = "Join the <em>network.</em>";
      heroDesc.textContent = "Create your VendorHub account in under a minute. Free to register, no credit card required.";
      submitBtn.textContent = "Create account";
      roleSection.style.display = "block";
      confirmGrp.style.display = "block";
      authFoot.innerHTML = `Already have an account? <a data-switch="signin">Sign in</a>`;
    } else {
      formTitle.textContent = "Sign in to your account";
      formLede.textContent = "Enter your credentials to continue.";
      heroBadge.textContent = "Account access";
      heroTitle.innerHTML = "Welcome <em>back.</em>";
      heroDesc.textContent = "Sign in to access your VendorHub account or create a new one to get started.";
      submitBtn.textContent = "Sign in";
      roleSection.style.display = "none";
      confirmGrp.style.display = "none";
      authFoot.innerHTML = `Don't have an account? <a data-switch="register">Create one</a>`;
    }

    // Imagen del hero según la pestaña: "Sign in" usa hero-signin, "Create account" la otra.
    const heroPanel = document.querySelector(".auth-hero");
    if(heroPanel) heroPanel.classList.toggle("hero-signin", mode !== "register");

    // Wire footer switch links
    authFoot.querySelectorAll("[data-switch]").forEach(a => {
      a.addEventListener("click", () => setMode(a.dataset.switch));
    });
    clearAlert();
    updateEmailHint();
  }

  function setRole(newRole){
    role = newRole;
    document.querySelectorAll(".role-card[data-role]").forEach(card => {
      card.classList.toggle("selected", card.dataset.role === role);
    });
    updateEmailHint();
  }

  // Muestra una pista bajo el campo de correo según el rol elegido.
  function updateEmailHint(){
    const input = $("#emailInput");
    const hint = $("#emailHint");
    if(!hint) return;
    if(mode === "register" && role === "pm"){
      hint.textContent = `Property Managers must use a @${Auth.COMPANY_DOMAIN} email.`;
      hint.style.display = "block";
      input.placeholder = `you@${Auth.COMPANY_DOMAIN}`;
    } else {
      hint.style.display = "none";
      input.placeholder = "you@company.com";
    }
  }

  function showAlert(msg, type = "error"){
    alertBox.innerHTML = `<div class="alert alert-${type}">${UI.escapeHtml(msg)}</div>`;
  }
  function clearAlert(){ alertBox.innerHTML = ""; }

  // Wire tab buttons
  tabsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Wire role cards
  document.querySelectorAll(".role-card[data-role]").forEach(card => {
    card.addEventListener("click", () => setRole(card.dataset.role));
  });

  // Form submit
  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault();
    clearAlert();
    const email = $("#emailInput").value;
    const password = $("#passwordInput").value;
    const submitBtn = $("#authForm").querySelector('button[type="submit"]');
    if(submitBtn) submitBtn.disabled = true;   // evita doble envío mientras se procesa

    try{
      if(mode === "register"){
        const confirm = $("#confirmInput").value;
        if(!role){
          showAlert("Please select a role above (Vendor or Property Manager).");
          return;
        }
        if(password !== confirm){
          showAlert("Passwords do not match.");
          return;
        }
        const result = await Auth.register({ email, password, role });
        if(!result.ok){
          showAlert(result.error);
          return;
        }
        UI.showToast("Account created! Welcome to The Vendors Hub.", "success");
        setTimeout(() => {
          window.location.href = role === "vendor" ? "vendor-dashboard.html" : "markets.html";
        }, 600);
      } else {
        const result = await Auth.login({ email, password });
        if(!result.ok){
          showAlert(result.error);
          return;
        }
        UI.showToast(`Welcome back, ${result.user.email}`, "success");
        setTimeout(() => {
          window.location.href = result.user.role === "vendor" ? "vendor-dashboard.html" : "markets.html";
        }, 500);
      }
    } finally {
      if(submitBtn) submitBtn.disabled = false;
    }
  });

  // ───────────────────────────────────────────────────────────────
  // SIGN IN WITH GOOGLE
  // ───────────────────────────────────────────────────────────────

  // Decodifica el "id_token" (JWT) que manda Google para leer el correo y el nombre.
  // No verificamos la firma aquí (eso se hace en el backend en producción); para el
  // prototipo confiamos en que el token viene directo de la librería de Google.
  function decodeJwt(token){
    try{
      const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(json);
    }catch(e){
      console.error("No se pudo leer el token de Google", e);
      return null;
    }
  }

  // Se ejecuta cuando el usuario elige una cuenta en el popup de Google.
  function handleGoogleCredential(response){
    clearAlert();
    const payload = decodeJwt(response && response.credential);
    if(!payload || !payload.email){
      showAlert("We couldn't read your Google account. Please try again.");
      return;
    }

    const result = Auth.signInWithGoogle({ email: payload.email, name: payload.name, role });

    // Cuenta nueva pero sin rol elegido: llevamos al usuario a "Create account"
    // para que elija Vendor o Property Manager y vuelva a pulsar el botón.
    if(!result.ok && result.needsRole){
      if(mode !== "register") setMode("register");
      showAlert(result.error, "error");
      return;
    }
    if(!result.ok){
      showAlert(result.error);
      return;
    }

    const msg = result.created
      ? "Account created with Google! Welcome to The Vendors Hub."
      : `Welcome back, ${result.user.email}`;
    UI.showToast(msg, "success");
    setTimeout(() => {
      window.location.href = result.user.role === "vendor" ? "vendor-dashboard.html" : "markets.html";
    }, 600);
  }

  // Arranca la librería de Google y dibuja el botón oficial. Como el script de
  // Google se carga con "async", puede que aún no esté listo: reintentamos un poco.
  function initGoogle(attempt){
    attempt = attempt || 0;
    const clientId = (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID) || "";
    const configured = clientId && clientId.indexOf("PASTE_") === -1;
    const section = document.getElementById("googleSection");
    if(!section) return;

    // Sin Client ID configurado → dejamos el botón oculto y seguimos con correo/contraseña.
    if(!configured){
      section.style.display = "none";
      return;
    }

    // ¿Ya cargó la librería de Google?
    if(!(window.google && google.accounts && google.accounts.id)){
      if(attempt < 40){ setTimeout(() => initGoogle(attempt + 1), 150); }
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential
    });

    const btnHost = document.getElementById("googleBtn");
    btnHost.innerHTML = "";
    google.accounts.id.renderButton(btnHost, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "center",
      width: 320
    });

    section.style.display = "block";
  }

  initGoogle();

  // Initialize from URL params
  setMode(mode);
  if(role) setRole(role);
})();
