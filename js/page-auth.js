/* =========================================================================
   Auth page logic — sign in / register tabs, role selection, submit
   ========================================================================= */
(function(){
  // Already signed in? Bounce to dashboard.
  const existing = Storage.getCurrentUser();
  if(existing){
    window.location.href = existing.role === "vendor" ? "vendor-dashboard.html" : "markets.html";
    return;
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
  $("#authForm").addEventListener("submit", e => {
    e.preventDefault();
    clearAlert();
    const email = $("#emailInput").value;
    const password = $("#passwordInput").value;

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
      const result = Auth.register({ email, password, role });
      if(!result.ok){
        showAlert(result.error);
        return;
      }
      UI.showToast("Account created! Welcome to The Vendors Hub.", "success");
      setTimeout(() => {
        window.location.href = role === "vendor" ? "vendor-dashboard.html" : "markets.html";
      }, 600);
    } else {
      const result = Auth.login({ email, password });
      if(!result.ok){
        showAlert(result.error);
        return;
      }
      UI.showToast(`Welcome back, ${result.user.email}`, "success");
      setTimeout(() => {
        window.location.href = result.user.role === "vendor" ? "vendor-dashboard.html" : "markets.html";
      }, 500);
    }
  });

  // Initialize from URL params
  setMode(mode);
  if(role) setRole(role);
})();
