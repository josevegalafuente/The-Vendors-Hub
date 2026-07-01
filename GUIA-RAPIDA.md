# 🚀 The Vendors Hub — Guía rápida

Prototipo funcional (Fase A). Todo corre en el navegador con datos de ejemplo.
No necesitas instalar nada para verlo.

---

## ▶️ Cómo lanzarlo en VS Code

**Opción A — La más fácil (extensión Live Server)**
1. Abre la carpeta `The-Vendors-Hub` en VS Code (`File → Open Folder`).
2. Instala la extensión **"Live Server"** (de Ritwick Dey) desde el panel de extensiones.
3. Haz clic derecho en `index.html` → **"Open with Live Server"**.
4. Se abrirá en tu navegador en `http://127.0.0.1:5500`.

**Opción B — Sin extensiones (doble clic)**
- Simplemente abre `index.html` con doble clic. Funciona casi todo.
  *(Live Server es mejor porque simula un servidor real, como será con Firebase.)*

---

## 🔑 Cuentas de demostración (ya creadas)

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Property Manager | `manager@demo.com` | `demo123` |
| Vendor (BlueWave Plumbing) | `contact@bluewaveplumbing.com` | `demo123` |
| Vendor (Summit Electric) | `hello@summitelectric.com` | `demo123` |
| Vendor (Evergreen Exteriors) | `team@evergreenexteriors.com` | `demo123` |

También puedes **crear cuentas nuevas** desde la página de inicio.

> Para borrar todo y volver a los datos de ejemplo: pie de página → **"Reset demo data"**.

---

## 🧭 Qué probar

- **Como Property Manager:** inicia sesión → *Markets* → elige un estado → categoría →
  abre un vendor → **califícalo con estrellas** (puedes editar tu calificación).
- **Como Vendor:** inicia sesión → *My profile* → edita datos, **adjunta una licencia**,
  marca **servicios** y define tu **cobertura** (Estado → Condado → Ciudad) → *Save profile*.

---

## 📁 Estructura del proyecto

```
The-Vendors-Hub/
├── index.html              Bienvenida (elegir rol)
├── auth.html               Registro / Login
├── vendor-dashboard.html   Perfil editable del vendor
├── markets.html            Directorio de estados (PM)
├── market.html             Categorías dentro de un estado (PM)
├── category.html           Lista de vendors por categoría (PM)
├── vendor.html             Perfil del vendor + calificación ⭐ (PM)
│
├── css/styles.css          Todos los estilos
│
├── data/
│   ├── locations.js        Estados → Condados → Ciudades
│   └── services.js         Categorías y servicios
│
└── js/
    ├── storage.js          ⭐ "Base de datos" (localStorage). Aquí conectaremos Firebase.
    ├── ui.js               Header, footer, avisos y utilidades
    ├── auth.js             Registro / login / sesión
    ├── page-auth.js        Lógica de la página de login
    ├── page-markets.js     Lógica del directorio
    ├── page-market.js      Lógica de categorías por estado
    ├── page-category.js    Lógica de la lista de vendors
    ├── page-vendor.js      Lógica del perfil + estrellas
    └── page-vendor-dashboard.js  Lógica del editor de perfil
```

---

## ⚠️ Importante (limitaciones de esta Fase A)

- Los datos viven **solo en tu navegador** (localStorage). Otra persona en otra
  computadora **no** verá tus vendors. Eso se resuelve en la **Fase B con Firebase**.
- Las licencias y fotos se guardan como texto dentro del navegador, con un límite
  (~5 MB total). Sirve para probar, no para uso real.

## ➡️ Siguiente paso: Fase B (Firebase)
Toda la app habla con `js/storage.js`. Para volverla profesional y compartida solo
reemplazamos ese archivo por llamadas a Firebase (base de datos + login + archivos).
El resto de las páginas **no cambian**. Cuando quieras, te guío paso a paso.
