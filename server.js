'use strict';
/**
 * Descargador de Información Estadística – Ministerio de Defensa.
 * Sirve la interfaz (PC y móvil) y proporciona:
 *   GET /api/archivos   -> lista de documentos + secciones (origen: manifest o live)
 *   GET /api/download   -> descarga proxy del archivo (evita CORS, funciona en móvil)
 *
 * Despliegue en Render: exponer esta app en el puerto $PORT.
 */

const express = require('express');
const path = require('path');
const { Readable } = require('stream');
const parse = require('./lib/parse');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/*  Datos: manifest embebido como base + intento de lectura "live"     */
/* ------------------------------------------------------------------ */
const PAGINA =
  'https://www.mindefensa.gov.co/defensa-y-seguridad/datos-y-cifras/informacion-estadistica';

/**
 * Intenta leer la página en vivo. Si el HTML trae las listas de archivos
 * (render completo) lo usa; si no (shell JS actual) devuelve null.
 */
async function tryFetchLiveData() {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(PAGINA, {
      headers: { 'User-Agent': 'Mozilla/5.0 (descargador-mindefensa/1.0)' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parse.parseRenderedHtml(html);
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** Normaliza un archivo del manifiesto a la forma pública. */
function normalizeFile(f, seccion, orden) {
  const epoch = parse.toEpoch(f.ultimaModificacion);
  return {
    id: f.asset,
    seccion,
    orden,
    titulo: f.titulo,
    asset: f.asset,
    ultimaModificacion: f.ultimaModificacion || '',
    modificadoPor: f.modificadoPor || '',
    ultimaModificacionEpoch: epoch,
    url: parse.nativeUrl(f.asset),
    formato: f.formato || null,
    nombreDescarga: f.nombreDescarga || null,
  };
}

function buildData(manifest, origen) {
  const ahora = new Date().toISOString();
  const mainDocs = (manifest.documentosPrincipales || []).map((d, i) =>
    normalizeFile(
      {
        titulo: d.titulo,
        asset: d.asset,
        ultimaModificacion: d.ultimaModificacion || '',
        modificadoPor: d.modificadoPor || '',
        formato: d.formato,
        nombreDescarga: d.nombreDescarga,
      },
      d.seccion,
      i
    )
  );

  const secciones = (manifest.secciones || []).map((s, si) => ({
    id: `sec-${si}`,
    titulo: s.titulo,
    archivos: (s.archivos || []).map((f, fi) =>
      normalizeFile(f, s.titulo, fi)
    ),
  }));

  const total = secciones.reduce((n, s) => n + s.archivos.length, 0) + mainDocs.length;

  return {
    origen,
    generadoEl: ahora,
    fuente: manifest.fuente || PAGINA,
    tituloPagina: manifest.tituloPagina,
    fechaPublicacion: manifest.fechaPublicacion || '',
    documentosPrincipales: mainDocs,
    secciones,
    resumen: {
      secciones: secciones.length,
      archivosDesagregados: total - mainDocs.length,
      total,
    },
  };
}

app.get('/api/archivos', async (req, res) => {
  try {
    const manifest = parse.loadManifest();

    // 1) Intentar datos en vivo (más frescos si el sitio sirve el HTML completo).
    const live = await tryFetchLiveData();
    if (live && live.secciones && live.secciones.length) {
      const data = buildData(
        { ...manifest, secciones: live.secciones, fechaPublicacion: live.fechaPublicacion || manifest.fechaPublicacion },
        'live'
      );
      return res.json(data);
    }

    // 2) Manifiesto embebido (situación actual del sitio).
    return res.json(buildData(manifest, 'manifest'));
  } catch (err) {
    console.error('[api/archivos]', err.message);
    return res.status(500).json({ error: 'No se pudo consultar la lista de archivos.' });
  }
});
/* ------------------------------------------------------------------ */
/*  Descarga proxy                                                     */
/* ------------------------------------------------------------------ */
app.get('/api/download', async (req, res) => {
  const { asset, titulo, formato } = req.query;
  if (!asset || !/^CONT[A-F0-9]{32}$/i.test(String(asset))) {
    return res.status(400).json({ error: 'Identificador de archivo inválido.' });
  }

  const url = parse.nativeUrl(asset);
  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (descargador-mindefensa/1.0)' },
      redirect: 'follow',
    });
  } catch (err) {
    console.error('[api/download] fetch', err.message);
    return res.status(502).json({ error: 'No se pudo contactar el servidor del Ministerio.' });
  }

  if (!upstream.ok || !upstream.body) {
    return res.status(502).json({ error: `El Ministerio respondió ${upstream.status}.` });
  }

  const ct = upstream.headers.get('content-type') || '';
  // Resolver extensión: primero la declarada, luego del Content-Type.
  let ext = formato ? String(formato).replace(/^\./, '').toLowerCase() : parse.extFromMime(ct);
  if (!ext) ext = 'bin';
  const safe = parse.sanitizeFilename(titulo, 'archivo');

  res.setHeader('Content-Type', ct || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safe}.${ext}"`
  );
  const len = upstream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');

  Readable.fromWeb(upstream.body).on('error', (e) => {
    console.error('[api/download] stream', e.message);
    if (!res.headersSent) res.status(502).end();
    else res.end();
  }).pipe(res);
});

app.get('/api/estado', (_req, res) => {
  res.json({ ok: true, servicio: 'mindefensa-descargador', version: '1.0.0' });
});

// Fallback SPA para la raíz
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[descargador] escuchando en http://localhost:${PORT}`);
});