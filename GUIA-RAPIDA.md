# 🚀 The Vendors Hub — Guía rápida

Prototipo funcional (Fase A). Todo corre en el navegador.
No necesitas instalar nada para verlo.

---

## ▶️ Cómo lanzarlo en VS Code

**Opción A — La recomendada (extensión Live Server)**
1. Abre la carpeta `The-Vendors-Hub` en VS Code (`File → Open Folder`).
2. Instala la extensión **"Live Server"** (de Ritwick Dey).
3. Clic derecho en `index.html` → **"Open with Live Server"**.
4. Se abrirá en `http://127.0.0.1:5500`.

**Opción B — Doble clic en `index.html`**
Funciona, pero **no lo uses para probar contraseñas**: con `file://` el navegador
desactiva `crypto.subtle` y el hashing cae a un método mucho más débil (verás un
aviso en la consola). Usa Live Server.

---

## 🔑 Cuentas

**Ya no hay contraseñas de demostración.** Estaban escritas en el código, que es
público, así que cualquiera podía entrar con ellas. Crea tu cuenta desde
`auth.html` → *Create account*.

| Rol | Cómo se obtiene |
|-----|-----------------|
| **Administrador** | Regístrate con `jose.vega.lafuente@gmail.com` (definido en `js/config.js` → `ADMIN_EMAILS`). El rol se asigna solo. |
| **Property Manager** | Requiere un correo `@purehomeriver.com`. |
| **Vendor** | Cualquier correo de empresa que no sea `@purehomeriver.com`. |

Las contraseñas deben tener **10 caracteres como mínimo**. Una frase corta que
recuerdes (`galletas-verdes-2026`) es mucho más segura que `P@ssw0rd!`.

> Para reiniciar los datos: **panel de Admin → Data & backup → Reset all data**.
> Ya no está en el pie de página, donde cualquier visitante podía borrarlo todo.

---

## 🧭 Qué probar

- **Como Property Manager:** *Markets* → busca un estado, un servicio (`plumbing`)
  o una ciudad (`Ocala`) → abre un vendor → **califícalo con estrellas**.
- **Como Vendor:** *My profile* → datos, **adjunta una licencia**, marca
  **servicios** y define tu **cobertura** (Estado → Condado → Ciudad) → *Save profile*.
  Si tu negocio ya está en el directorio, ábrelo y pulsa **"Claim this listing"**.
- **Como Administrador:** *Admin* → aprueba reclamaciones, gestiona cuentas,
  oculta fichas y **exporta una copia de seguridad**.

---

## 🔒 Datos de contacto de los vendors

Los correos reales de los 1.179 vendors importados **ya no están en el repositorio**.
Antes vivían dentro de `data/vendors-data.js`, que se publica tal cual: cualquiera
podía descargar la lista completa desde el sitio.

Ahora:

- `data/vendors-data.js` → **público**, sin correos (nombre, categoría, mercados).
- `data/vendors-contacts.local.js` → **privado**, en `.gitignore`. No se sube ni
  se publica. El sitio solo lo pide cuando lo abres desde `localhost`; en
  producción **no se solicita nunca**.

Si el archivo no existe, todo funciona igual: las fichas aparecen sin correo.
Para recrearlo, copia `data/vendors-contacts.example.js` y rellénalo.

La solución definitiva es Firestore con reglas de seguridad → [FIREBASE.md](FIREBASE.md).

---

## 📁 Estructura del proyecto

```
The-Vendors-Hub/
├── index.html              Bienvenida (elegir rol)
├── auth.html               Registro / Login
├── admin.html              ⭐ Panel de administración
├── vendor-dashboard.html   Perfil editable del vendor
├── markets.html            Directorio de estados (PM)
├── market.html             Categorías dentro de un estado (PM)
├── category.html           Lista de vendors por categoría (PM)
├── vendor.html             Perfil del vendor + calificación ⭐
│
├── firestore.rules         🔒 Reglas de seguridad para la Fase B
├── FIREBASE.md             Guía de migración a Firebase
│
├── css/styles.css          Todos los estilos
│
├── data/
│   ├── locations.js               Estados → Condados → Ciudades
│   ├── services.js                Categorías y servicios
│   ├── vendors-data.js            Directorio público (SIN correos)
│   ├── vendors-contacts.local.js  🔒 Correos reales (no versionado)
│   └── vendors-contacts.example.js  Plantilla del anterior
│
└── js/
    ├── config.js           ⚙️ Admins, dominio, límites y config de Firebase
    ├── db.js               ⭐ "Base de datos". Aquí conectaremos Firebase.
    ├── auth.js             Registro / login / sesión / hashing
    ├── ui.js               Header, footer, avisos, URLs seguras
    ├── page-index.js       Lógica de la portada
    ├── page-auth.js        Lógica de acceso
    ├── page-admin.js       Lógica del panel de administración
    ├── page-markets.js     Directorio y búsqueda universal
    ├── page-market.js      Categorías por estado
    ├── page-category.js    Lista de vendors
    ├── page-vendor.js      Perfil + estrellas
    └── page-vendor-dashboard.js  Editor de perfil
```

> `js/storage.js` se renombró a `js/db.js` y el objeto global pasó de
> `Storage` a `DB`: `Storage` es un nombre que **ya usa el navegador**
> (la interfaz de `localStorage`) y pisarlo rompía cosas de forma sutil.

---

## ⚠️ Qué puede y qué no puede hacer este sitio

Está corregido todo lo que se puede corregir sin servidor: contraseñas con
PBKDF2, bloqueo por intentos, sin credenciales en el código, sin datos personales
publicados, URLs saneadas y escapado estricto de HTML.

Lo que **no** se puede garantizar mientras el sitio sea 100 % estático:

- **Los datos viven solo en tu navegador.** Otra persona en otra computadora no
  verá tus vendors. Si borras el perfil del navegador sin copia, se pierde todo
  → **exporta copias desde el panel de Admin**.
- **El rol de administrador no es verificable.** Se comprueba en el navegador del
  visitante, así que alguien con conocimientos podría dárselo en SU equipo. No le
  daría acceso a datos de nadie más (cada navegador guarda los suyos), pero
  tampoco es una restricción real.
- **El token de Google no se verifica de verdad.** Comprobamos destinatario,
  caducidad, emisor y correo verificado, pero la firma requiere un servidor.
- **Límite de ~5 MB** entre fotos y licencias.

Las cuatro se resuelven en la Fase B.

---

## ➡️ Siguiente paso: Fase B (Firebase)

Toda la app habla con `js/db.js`. Para volverla profesional, compartida y
**verificablemente segura**, se reemplaza esa capa por Firebase (Auth + Firestore
+ Storage). Las reglas ya están escritas en [firestore.rules](firestore.rules) y
el paso a paso en [FIREBASE.md](FIREBASE.md).
