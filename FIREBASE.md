# Fase B — Migración a Firebase

Este documento explica **por qué** hace falta un backend y **cómo** conectarlo.
No hay que hacerlo hoy: el sitio funciona sin él. Pero hay tres cosas que
*solo* se pueden arreglar aquí.

---

## Por qué no basta con el navegador

El sitio actual es 100 % estático: se sirve desde GitHub Pages y todo el
código se ejecuta en el equipo del visitante. Eso impone tres límites que
ninguna cantidad de código de cliente puede superar:

| Problema | Estado hoy | Solución real |
|---|---|---|
| **Los datos de vendors son públicos** | Cualquiera puede descargar `data/vendors-data.js`. Por eso los correos se sacaron a un archivo local que no se publica. | Firestore con `allow read: if signedIn()` — sin sesión no se sirve ni un byte. |
| **El rol de administrador es una sugerencia** | `ADMIN_EMAILS` se comprueba en el navegador. Alguien puede editar su propio `localStorage` y ponerse `role: "admin"`. | *Custom claims* en el token de Firebase Auth: solo se establecen desde el servidor. |
| **Los datos viven en un solo navegador** | Si borras el perfil de Chrome, se pierde todo. Por eso el panel tiene "Exportar copia". | Firestore: los datos están en la nube y se comparten entre dispositivos y usuarios. |

Una aclaración importante sobre el segundo punto: que alguien se ponga
`admin` en su navegador **no le da acceso a datos de nadie más**, porque hoy
cada navegador guarda solo los suyos. Es un problema real, pero no es una
filtración: es que la restricción no es verificable.

---

## Pasos de la migración

### 1. Crear el proyecto

1. Entra en <https://console.firebase.google.com> y pulsa **Add project**.
2. Nombre: `the-vendors-hub`. Puedes desactivar Google Analytics.
3. En el menú lateral: **Build → Authentication → Get started**.
   Activa los proveedores **Email/Password** y **Google**.
4. **Build → Firestore Database → Create database**. Empieza en modo
   *production* (denegar todo); las reglas correctas las publicamos en el paso 3.
5. **Project settings → General → Your apps → Web (`</>`)**. Registra la app y
   copia el objeto `firebaseConfig`.

### 2. Pegar la configuración

En [js/config.js](js/config.js), rellena el bloque `FIREBASE` y pon
`ENABLED: true`:

```js
FIREBASE: {
  ENABLED: true,
  apiKey: "AIza…",
  authDomain: "the-vendors-hub.firebaseapp.com",
  projectId: "the-vendors-hub",
  storageBucket: "the-vendors-hub.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
}
```

> Estos valores **son públicos por diseño** y van en el HTML de cualquier
> sitio que use Firebase. No son un secreto y no hay que ocultarlos: la
> seguridad la dan las reglas del paso siguiente, no esconder la config.
> Lo que **nunca** debe subirse es una *service account key* (`firebase-service-account*.json`,
> ya está en `.gitignore`).

En **Authentication → Settings → Authorized domains** añade `thevendorshub.work`
y `localhost`.

### 3. Publicar las reglas de seguridad

Las reglas ya están escritas y comentadas en [firestore.rules](firestore.rules).

```bash
npm install -g firebase-tools
firebase login
firebase init firestore     # elige el proyecto; usa el firestore.rules existente
firebase deploy --only firestore:rules
```

Compruébalas en **Firestore → Rules → Playground** antes de dar por buena la
migración: simula un usuario `pm` intentando escribir en `listings/` y
confirma que se deniega.

### 4. Nombrar al administrador

El rol vive en un *custom claim* del token, no en la base de datos. Esto es
deliberado: si el rol se leyera de un documento, cualquiera podría escribir
`admin` en el suyo.

Los claims solo se establecen desde el servidor. Una vez, desde tu equipo:

```bash
npm install firebase-admin
```

```js
// set-admin.js — ejecútalo UNA vez y bórralo.
// Necesita una service account key: Project settings → Service accounts →
// Generate new private key. NO subas ese archivo al repositorio.
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(require("./firebase-service-account.json"))
});

admin.auth().getUserByEmail("jose.vega.lafuente@gmail.com")
  .then(user => admin.auth().setCustomUserClaims(user.uid, { role: "admin" }))
  .then(() => console.log("Listo. Cierra sesión y vuelve a entrar para refrescar el token."))
  .catch(console.error);
```

El token se refresca al volver a iniciar sesión (o pasada 1 hora).

### 5. Subir los datos

Los 1.179 vendors de `data/vendors-data.js` y los correos de
`data/vendors-contacts.local.js` se combinan y se suben a la colección
`listings`. Un script único con `firebase-admin`, ejecutado desde tu equipo,
hace la carga. A partir de ahí:

- `data/vendors-data.js` se puede **borrar del repositorio**: los datos ya no
  se sirven en abierto.
- `data/vendors-contacts.local.js` deja de hacer falta.
- El problema de exposición de datos personales queda **cerrado de verdad**.

### 6. Cambiar la capa de datos

Toda la app habla solo con `window.DB` ([js/db.js](js/db.js)) — ninguna página
toca `localStorage` directamente. Por eso la migración consiste en escribir un
`js/db-firebase.js` con las **mismas funciones** (`getAllVendors`,
`updateUser`, `addOrUpdateReview`…) devolviendo promesas, y cargar uno u otro
según `APP_CONFIG.FIREBASE.ENABLED`.

Las páginas necesitarán `await` en las llamadas a datos; es un cambio
mecánico y acotado, no una reescritura.

---

## Lo que queda arreglado al terminar

- Los correos de los vendors dejan de ser descargables por cualquiera.
- El rol de administrador pasa a ser una restricción real de servidor.
- Las contraseñas las gestiona Firebase Auth (con recuperación por correo,
  verificación y limitación de intentos de verdad).
- Los datos dejan de vivir en un solo navegador.
- El token de Google se verifica en el servidor, con firma comprobada.
- Desaparece el límite de 5 MB: los avatares y licencias van a Firebase Storage.

---

## Coste

Para el volumen de este proyecto (~1.200 fichas, decenas de usuarios), el
plan gratuito **Spark** sobra: 50.000 lecturas y 20.000 escrituras al día,
1 GiB almacenado. Solo haría falta pasar a Blaze si se activa Firebase
Storage con mucho tráfico de archivos.
