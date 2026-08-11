/* =========================================================================
   page-auth.js — pestañas de acceso / registro, selección de rol y envío.
   ========================================================================= */
(function(){
  // ¿Ya tiene sesión? Lo mandamos a su panel.
  // Solo si el rol es VÁLIDO; si la sesión trae un rol corrupto, la limpiamos
  // y dejamos que inicie sesión de nuevo (así no se genera un bucle con las
  // páginas protegidas que rebotan a auth.html).
  const existing = DB.getCurrentUser();
  if(existing && ["vendor", "pm", "admin"].indexOf(existing.role) > -1){
    window.location.replace(Auth.homeForRole(existing.role));
    return;
  }
  if(existing) DB.clearSession();

  UI.mountChrome([], false);

  let mode = UI.getQueryParam("mode") === "register" ? "register" : "signin";
  const roleParam = UI.getQueryParam("role");
  let role = (roleParam === "vendor" || roleParam === "pm") ? roleParam : null;

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
  const passwordEl = $("#passwordInput");

  // Aviso si el guard nos echó por cuenta suspendida.
  if(UI.getQueryParam("suspended")){
    showAlert("This account has been suspended. Please contact the administrator.");
  }

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
      authFoot.innerHTML = `Already have an account? <a data-switch="signin" tabindex="0" role="button">Sign in</a>`;
      passwordEl.placeholder = `At least ${Auth.MIN_PASSWORD} characters`;
      passwordEl.setAttribute("minlength", String(Auth.MIN_PASSWORD));
      passwordEl.setAttribute("autocomplete", "new-password");
    } else {
      formTitle.textContent = "Sign in to your account";
      formLede.textContent = "Enter your credentials to continue.";
      heroBadge.textContent = "Account access";
      heroTitle.innerHTML = "Welcome <em>back.</em>";
      heroDesc.textContent = "Sign in to access your VendorHub account or create a new one to get started.";
      submitBtn.textContent = "Sign in";
      roleSection.style.display = "none";
      confirmGrp.style.display = "none";
      authFoot.innerHTML = `Don't have an account? <a data-switch="register" tabindex="0" role="button">Create one</a>`;
      passwordEl.placeholder = "Your password";
      passwordEl.removeAttribute("minlength");
      passwordEl.setAttribute("autocomplete", "current-password");
    }

    // Imagen del hero según la pestaña.
    const heroPanel = document.querySelector(".auth-hero");
    if(heroPanel) heroPanel.classList.toggle("hero-signin", mode !== "register");

    authFoot.querySelectorAll("[data-switch]").forEach(a => {
      a.addEventListener("click", () => setMode(a.dataset.switch));
      a.addEventListener("keydown", e => {
        if(e.key === "Enter" || e.key === " "){ e.preventDefault(); setMode(a.dataset.switch); }
      });
    });
    clearAlert();
    updateEmailHint();
    updatePasswordHint();
  }

  function setRole(newRole){
    role = newRole;
    document.querySelectorAll(".role-card[data-role]").forEach(card => {
      card.classList.toggle("selected", card.dataset.role === role);
      card.setAttribute("aria-pressed", String(card.dataset.role === role));
    });
    updateEmailHint();
  }

  // Pista bajo el campo de correo según el rol elegido.
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

  // Medidor de contraseña en tiempo real (solo al crear cuenta).
  function updatePasswordHint(){
    const hint = $("#passwordHint");
    if(!hint) return;
    if(mode !== "register"){ hint.style.display = "none"; return; }

    const value = passwordEl.value;
    hint.style.display = "block";
    if(!value){
      hint.textContent = `Use at least ${Auth.MIN_PASSWORD} characters. A short phrase works great.`;
      hint.className = "pwd-hint";
      return;
    }
    const problem = Auth.validatePassword(value, $("#emailInput").value);
    if(problem){
      hint.textContent = problem;
      hint.className = "pwd-hint weak";
    } else {
      hint.textContent = value.length >= 16 ? "Strong password ✓" : "Good password ✓";
      hint.className = "pwd-hint ok";
    }
  }

  function showAlert(msg, type = "error"){
    alertBox.innerHTML = `<div class="alert alert-${type}" role="alert">${UI.escapeHtml(msg)}</div>`;
  }
  function clearAlert(){ alertBox.innerHTML = ""; }

  // Pestañas
  tabsEl.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  // Tarjetas de rol
  document.querySelectorAll(".role-card[data-role]").forEach(card => {
    card.addEventListener("click", () => setRole(card.dataset.role));
  });

  passwordEl.addEventListener("input", updatePasswordHint);
  $("#emailInput").addEventListener("input", updatePasswordHint);

  // ─── Envío del formulario ───────────────────────────────────────
  let submitting = false;

  $("#authForm").addEventListener("submit", async e => {
    e.preventDefault();
    if(submitting) return;              // doble clic / doble Enter
    clearAlert();

    const email = $("#emailInput").value;
    const password = passwordEl.value;

    submitting = true;
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    // PBKDF2 tarda ~100 ms a propósito; avisamos para que no parezca colgado.
    submitBtn.textContent = mode === "register" ? "Creating account…" : "Signing in…";

    try{
      if(mode === "register"){
        const confirmValue = $("#confirmInput").value;
        if(!role){
          showAlert("Please select a role above (Vendor or Property Manager).");
          return;
        }
        if(password !== confirmValue){
          showAlert("Passwords do not match.");
          return;
        }
        const result = await Auth.register({ email, password, role });
        if(!result.ok){ showAlert(result.error); return; }

        UI.showToast("Account created! Welcome to The Vendors Hub.", "success");
        const target = Auth.homeForRole(result.user.role);
        setTimeout(() => { window.location.replace(target); }, 600);
      } else {
        const result = await Auth.login({ email, password });
        if(!result.ok){ showAlert(result.error); return; }

        UI.showToast(`Welcome back, ${result.user.email}`, "success");
        const target = Auth.homeForRole(result.user.role);
        setTimeout(() => { window.location.replace(target); }, 500);
      }
    } catch(err){
      console.error(err);
      showAlert("Something went wrong. Please try again.");
    } finally {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  /* =====================================================================
     SIGN IN WITH GOOGLE
     ===================================================================== */

  /* Decodifica el id_token (JWT) de Google para leer correo y nombre.

     ⚠️  La FIRMA no se verifica aquí: hacerlo requiere un servidor con las
         claves públicas de Google. Lo que sí comprobamos es todo lo demás:
         que el token sea para NUESTRA aplicación (aud), que no haya
         caducado (exp), que lo emita Google (iss) y que el correo esté
         verificado. Con Firebase Auth esta comprobación pasa al servidor. */
  function decodeJwt(token){
    try{
      const parts = String(token || "").split(".");
      if(parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(json);
    }catch(e){
      console.error("Could not read the Google token", e);
      return null;
    }
  }

  function validateGooglePayload(payload){
    const clientId = (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID) || "";
    if(!payload) return "We couldn't read your Google account. Please try again.";
    if(payload.aud !== clientId) return "That Google sign-in was not issued for this site.";
    if(["https://accounts.google.com", "accounts.google.com"].indexOf(payload.iss) === -1){
      return "That sign-in token did not come from Google.";
    }
    if(!payload.exp || Date.now() / 1000 > payload.exp){
      return "Your Google sign-in expired. Please try again.";
    }
    if(payload.email_verified === false){
      return "Your Google email is not verified. Verify it with Google and try again.";
    }
    if(!payload.email) return "Google did not return an email address.";
    return null;
  }

  function handleGoogleCredential(response){
    clearAlert();
    const payload = decodeJwt(response && response.credential);
    const problem = validateGooglePayload(payload);
    if(problem){ showAlert(problem); return; }

    const result = Auth.signInWithGoogle({ email: payload.email, name: payload.name, role });

    // Cuenta nueva sin rol elegido: llevamos al usuario a "Create account".
    if(!result.ok && result.needsRole){
      if(mode !== "register") setMode("register");
      showAlert(result.error, "error");
      return;
    }
    if(!result.ok){ showAlert(result.error); return; }

    UI.showToast(result.created
      ? "Account created with Google! Welcome to The Vendors Hub."
      : `Welcome back, ${result.user.email}`, "success");

    const target = Auth.homeForRole(result.user.role);
    setTimeout(() => { window.location.replace(target); }, 600);
  }

  /* Arranca la librería de Google y dibuja el botón oficial. El script de
     Google se carga con "async", así que puede no estar listo todavía. */
  function initGoogle(attempt){
    attempt = attempt || 0;
    const clientId = (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID) || "";
    const section = document.getElementById("googleSection");
    if(!section) return;

    if(!clientId){
      section.style.display = "none";     // sin Client ID → solo correo/contraseña
      return;
    }

    if(!(window.google && google.accounts && google.accounts.id)){
      if(attempt < 40) setTimeout(() => initGoogle(attempt + 1), 150);
      else section.style.display = "none";
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    const btnHost = document.getElementById("googleBtn");
    btnHost.innerHTML = "";
    google.accounts.id.renderButton(btnHost, {
      theme: "outline", size: "large", text: "continue_with",
      shape: "rectangular", logo_alignment: "center", width: 320
    });

    section.style.display = "block";
  }

  initGoogle();

  setMode(mode);
  if(role) setRole(role);
})();
