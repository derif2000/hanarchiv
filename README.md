# Descargador — Información Estadística (Ministerio de Defensa)

Aplicación web que permite **descargar los archivos estadísticos publicados** por el
Ministerio de Defensa de Colombia (página *Información Estadística*) desde **PC y móvil**,
y **verificar si cada archivo fue actualizado** respecto a la última descarga hecha en ese
dispositivo.

Página de origen: https://www.mindefensa.gov.co/defensa-y-seguridad/datos-y-cifras/informacion-estadistica

---

## Cómo funciona

El sitio del Ministerio **ya no sirve las listas de archivos en el HTML** (ahora es una
"shell" que se renderiza con JavaScript y su API de contenidos pública está deshabilitada).
Por eso la aplicación usa:

1. **Un manifiesto embebido** (`manifest.json`) con los documentos (título, fecha de
   modificación, autor y enlace) capturados del sitio. Es la base de datos del catálogo.
2. **Descarga por proxy** (`/api/download`): los archivos se bajan desde el servidor
   usando la URL "published" del Ministerio, que funciona sin autenticación, y se entregan
   con el nombre/extensión correcta. Esto también evita problemas de **CORS en el móvil**.
3. **Verificación de actualizaciones**: la app guarda en `localStorage` del dispositivo la
   fecha de modificación de cada archivo en el momento de la descarga. Cada vez que se
   consulta, compara esa fecha con la del sitio y marca cada archivo como:
   - **Nuevo** — no se ha descargado en ese dispositivo.
   - **Actualizado** — ya se descargó, pero en el sitio hay una versión más reciente.
   - **Al día** — la versión descargada es la vigente.

El servidor, además, intenta re-leer la página en cada consulta (`/api/archivos`): si el
sitio vuelve a servir las listas completas en el HTML, usará automáticamente los datos en
vivo (badge "Datos en vivo"); si no, usa el manifiesto (badge "Datos: manifiesto").

---

## Descargar todo (descarga masiva)

El botón **⬇️ Descargar todo** (verde, en la barra superior) baja **de una sola vez los 47
archivos** del catálogo (documentos principales + todas las secciones desagregadas):

- Las descargas se hacen **una por una (en cola)**, no todas a la vez, para no saturar la red
  ni la memoria del móvil, y para que el navegador no bloquee descargas simultáneas.
- Aparece un **panel de progreso** con barra, contador y el nombre del archivo en curso
  (`12 / 47 — …`), además de un botón **Cancelar** para detener la cola cuando se quiera.
- Cada archivo descargado se registra en el historial del dispositivo, así que **los estados
  (Nuevo / Actualizado / Al día) se actualizan solos** al terminar.
- Cada **sección** tiene su propio botón `⬇️ N` en el encabezado para descargar solo ese
  grupo de archivos con el mismo mecanismo.

> **Nota sobre el navegador:** al ser muchas descargas seguidas, el navegador puede pedir
> permiso la primera vez ("Permitir descargas múltiples / automáticas"). Acéptalo para que
> la cola corra sin interrupciones. No se genera un ZIP porque el archivo más pesado
> (PPTX de 53 MB) haría inviable armarlo en el servidor y volvería la descarga mucho más
> lenta en móvil; bajarlos por separado es más rápido y reanudable.

---

## Puesta en marcha local

Requiere Node.js 18 o superior.

```bash
npm install
npm start
# Abre http://localhost:3000
```

## Despliegue en Render.com (PC y móvil)

El proyecto ya trae un **Blueprint** (`render.yaml`, en la raíz) con toda la configuración.

### Paso a paso (Blueprint)

1. **Sube el proyecto a GitHub** (ver "Subir a GitHub" abajo).
2. Entra a <https://render.com> y crea una cuenta (puedes usar *Sign up with GitHub*).
3. En el panel: **New +** → **Blueprint**.
4. **Connect GitHub** y autoriza a Render; elige el repositorio del proyecto y pulsa **Connect**.
5. Render detecta `render.yaml` y muestra el servicio `mindefensa-descargador`
   (plan **Free**, región **oregon**). Pulsa **Deploy Blueprint** / **Apply**.
6. Espera el **build + deploy** (2–5 min la primera vez). Revisa los logs si algo falla.
7. Abre la URL `https://<nombre>.onrender.com` que aparece arriba en el panel. Listo.

### Alternativa: crear el Web Service a mano (sin Blueprint)

**New +** → **Web Service** → conecta el repositorio y pon:

| Campo | Valor |
|-------|-------|
| Name | `mindefensa-descargador` (define la URL `*.onrender.com`) |
| Language / Runtime | `Node` |
| Branch | `main` |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | `Free` |
| Health Check Path | `/api/estado` |

> ⚠️ **No definas la variable `PORT`.** Render la inyecta sola (10000) y `server.js`
> ya escucha en `process.env.PORT`.

### Notas del plan Free

- El servicio **se duerme tras ~15 min sin visitas**; la primera visita después tarda
  unos segundos en despertar (cold start). Basta con recargar.
- Incluye tráfico suficiente para este uso (una descarga completa son ~284 MB).
- No hace falta base de datos ni disco persistente: el historial de descargas vive en el
  `localStorage` de cada dispositivo.

### Actualizaciones posteriores

Con **Auto-Deploy** activo, cada `git push` a la rama `main` redespliega la app.
Si el Ministerio publica cambios en los archivos, actualiza el manifiesto y sube el cambio:

```bash
npm run build:manifest
git add manifest.json && git commit -m "Actualizar manifiesto" && git push
```

### Dominio propio (opcional)

En el servicio: **Settings** → **Custom Domains** → **Add Custom Domain**, y sigue las
instrucciones de DNS (CNAME) que muestra Render.

### Subir a GitHub (si aún no tienes repositorio)

```bash
git init
git add .
git commit -m "Descargador Información Estadística - Mindefensa"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

`node_modules/` ya está en `.gitignore`, así que no se sube (Render ejecuta `npm install`).


---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/archivos` | Lista de documentos principales + secciones desagregadas (JSON). |
| GET | `/api/download?asset=CONT…&titulo=…&formato=…` | Descarga el archivo por proxy. |
| GET | `/api/estado` | Health-check. |
| GET | `/` | Interfaz web. |

---

## Mantener el manifiesto actualizado

Cuando el Ministerio publique una nueva versión, si el sitio llegara a servir de nuevo el
HTML completo con las listas, basta con:

1. Abrir la página en el navegador y copiar el código fuente (**Ver código fuente** / Ctrl+U).
2. Guardarlo como `pagina.html` y ejecutar:

```bash
node scripts/regenerate-manifest.js pagina.html
```

Esto reconstruye `manifest.json` con las secciones, fechas y enlaces más recientes. Si el
HTML no contiene las listas (shell JS), el script lo indica y conviene actualizar el
manifiesto de forma manual (o ajustar el parseo a la API que el Ministerio utilice entonces).

---

## Estructura

```
server.js                 # API Express + proxy de descarga
lib/parse.js              # utilidades: URL, fechas, extensiones, parseo del HTML
manifest.json             # catálogo de archivos (fuente actual)
public/index.html         # interfaz (responsive)
public/app.js             # lógica del cliente (estados, descarga individual y "Descargar todo")
public/style.css          # estilos
scripts/regenerate-manifest.js
render.yaml               # configuración para Render
```