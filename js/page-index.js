/* =========================================================================
   page-index.js — portada.
   Si ya hay sesión iniciada, lleva a cada quien a su panel.

   Antes esto era un <script> en línea dentro de index.html. Sacarlo a su
   propio archivo permite activar una Content-Security-Policy estricta más
   adelante (sin 'unsafe-inline'), que es una de las defensas más efectivas
   contra la inyección de scripts.
   ========================================================================= */
(function(){
  const user = DB.getCurrentUser();
  if(user && ["vendor", "pm", "admin"].indexOf(user.role) > -1){
    window.location.replace(Auth.homeForRole(user.role));
    return;
  }
  UI.mountChrome([], true);
})();
