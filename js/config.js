/* =========================================================================
   config.js — CONFIGURACIÓN DE LA APP
   -------------------------------------------------------------------------
   Aquí van los "ajustes" que dependen de servicios externos. Se cargan
   ANTES que el resto de scripts para que estén disponibles en todas partes.

   👉  SIGN IN WITH GOOGLE
   Para que el botón "Continue with Google" funcione necesitas UN dato:
   tu "Client ID" de Google. Se saca gratis, así:

     1. Entra a  https://console.cloud.google.com/
     2. Crea un proyecto (arriba, "Select a project" → "New project").
     3. Menú ☰ → "APIs & Services" → "Credentials".
     4. "Configure consent screen" (una sola vez): tipo "External",
        pon el nombre de la app (The Vendors Hub) y tu correo. Guarda.
     5. "Credentials" → "Create credentials" → "OAuth client ID".
     6. Application type: "Web application".
     7. En "Authorized JavaScript origins" agrega EXACTAMENTE estas URLs
        (una por línea), según dónde abras el sitio:
            http://localhost:5500
            http://127.0.0.1:5500
        y cuando lo subas a GitHub Pages, agrega también tu URL, por ej:
            https://josevegalafuente.github.io
        (OJO: solo el dominio, sin la parte /The-Vendors-Hub/ y sin "/" al final)
     8. "Create" → copia el "Client ID" (algo como 1234-abc.apps.googleusercontent.com)
     9. Pégalo abajo entre las comillas, reemplazando el texto de ejemplo.

   Mientras no lo configures, el botón de Google se oculta solo y el resto
   del login (correo + contraseña) sigue funcionando normal.
   ========================================================================= */
window.APP_CONFIG = {
  // ⬇️  TU CLIENT ID DE GOOGLE  ⬇️
  // (El "Client Secret" NO va aquí: es solo para backends y no se usa en este login.)
  GOOGLE_CLIENT_ID: "841764123921-ua6hk653o35vmg9a92nov6jgsrgokc6i.apps.googleusercontent.com"
};
