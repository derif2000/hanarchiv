'use strict';
/**
 * Utilidades de parseo y normalización para el descargador.
 *
 * Soporta dos orígenes de datos:
 *  - 'manifest': el manifiesto embebido (manifest.json), que es la captura más
 *     reciente del sitio con todos los archivos, fechas y vínculos.
 *  - 'live':     el HTML completamente renderizado del sitio. El Ministerio de
 *     Defensa sirve actualmente una "shell" JS, pero si en algún momento vuelve a
 *     servir las listas de archivos en el HTML, este módulo lo detecta y lo usa
 *     automáticamente (datos más frescos).
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://www.mindefensa.gov.co';
const SITE_ID = 'Sitio-Web-Ministerio-Defensa';

/** Construye la URL "published" que descarga el archivo sin requerir autenticación. */
function nativeUrl(asset) {
  return `${SITE}/sites/web/content/published/api/v1.1/assets/${encodeURIComponent(asset)}/native?download=true&siteId=${SITE_ID}`;
}

/**
 * Normaliza "16/9/2026, 10:03:01" a un número de fecha (ms).
 * Devuelve null si no puede parsearse.
 */
function toEpoch(str) {
  if (!str) return null;
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})/.exec(String(str).trim());
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  // Se interpreta en UTC para que la comparación sea estable entre consultas.
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Devuelve la extensión de archivo (sin punto) a partir del Content-Type. */
function extFromMime(ct) {
  const map = [
    ['application/pdf', 'pdf'],
    ['spreadsheetml', 'xlsx'],
    ['vnd.ms-excel', 'xls'],
    ['vnd.ms-powerpoint', 'ppt'],
    ['presentationml', 'pptx'],
    ['wordprocessingml', 'docx'],
    ['msword', 'doc'],
    ['zip', 'zip'],
    ['csv', 'csv'],
  ];
  const lower = (ct || '').toLowerCase();
  for (const [k, e] of map) if (lower.includes(k)) return e;
  return null;
}

/** Sanea un nombre de archivo para que sea seguro en cualquier SO/móvil. */
function sanitizeFilename(name, fallback) {
  const base = String(name || '').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return (base || fallback || 'archivo').trim() || 'archivo';
}

/** Parsea el HTML renderizado. Devuelve null si no contiene las listas de archivos. */
function parseRenderedHtml(html) {
  if (!html || !String(html).includes('scs-file-list-folder-title')) return null;

  // Fecha de publicación
  let fechaPublicacion = '';
  const fm = /Fecha de publicaci[oó]n:\s*([^<\n]+)/i.exec(html);
  if (fm) fechaPublicacion = fm[1].trim();

  const secciones = [];
  const reSection = /scs-file-list-folder-title"\s*>([\s\S]*?)<\/span>([\s\S]*?)scsCompComponentImpl: componentFactory/g;
  let sm;
  while ((sm = reSection.exec(html)) !== null) {
    const titulo = sm[1].replace(/<[^>]+>/g, '').trim();
    const block = sm[2];
    const archivos = [];
    const reFile = /scs-file-list-row([\s\S]*?)(?=<\/li>)/g;
    // parse cada <li>
    const liRe = /<li>([\s\S]*?)<\/li>/g;
    let lm;
    while ((lm = liRe.exec(block)) !== null) {
      const li = lm[1];
      const t = (/scs-file-list-file-title"[^>]*>(?:<!--\s*)?([\s\S]*?)(?:\s*-->)?<\/span>/.exec(li) ||
        /scs-file-list-file-title"[^>]*>([\s\S]*?)<\/span>/.exec(li));
      if (!t) continue;
      const tituloArchivo = t[1].replace(/<[^>]+>/g, '').trim();
      const lastMod = (/scs-file-list-file-lastModified"[^>]*>([\s\S]*?)<\/span>/.exec(li) || [])[1];
      const modPor = (/scs-file-list-last-modifier"[^>]*>([\s\S]*?)<\/span>/.exec(li) || [])[1];
      const asset = (/assets\/(CONT[A-F0-9]{32})\//.exec(li) || [])[1];
      if (!asset || !tituloArchivo) continue;
      archivos.push({
        titulo: tituloArchivo,
        asset,
        ultimaModificacion: (lastMod || '').trim(),
        modificadoPor: (modPor || '').trim(),
      });
    }
    if (archivos.length) secciones.push({ titulo, archivos });
  }

  if (!secciones.length) return null;
  return { fechaPublicacion, secciones };
}

/** Carga el manifiesto embebido. */
function loadManifest() {
  const p = path.join(__dirname, '..', 'manifest.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

module.exports = {
  SITE,
  SITE_ID,
  nativeUrl,
  toEpoch,
  extFromMime,
  sanitizeFilename,
  parseRenderedHtml,
  loadManifest,
};