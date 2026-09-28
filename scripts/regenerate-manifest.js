'use strict';
/**
 * Regenera manifest.json a partir de un HTML del sitio "Información Estadística".
 *
 * Uso:
 *   node scripts/regenerate-manifest.js <ruta-al-html>
 *
 * Si el HTML contiene las listas de archivos (render completo), reconstruye el
 * manifiesto con las fechas y vínculos más recientes.
 */

const fs = require('fs');
const path = require('path');
const parse = require('../lib/parse');

function sacarMainDocs(html) {
  const docs = [];
  const re = /class="scs-image-link"[\s\S]*?href="([^"]+)"[\s\S]*?download="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].replace(/&amp;/g, '&');
    const nomb = m[2].trim();
    const asset = /assets\/(CONT[A-F0-9]{32})/.exec(href);
    if (!asset || !nomb) continue;
    const ultimo = nomb.split(/\s+/).pop(); // p.ej. PPTX / PDF / XLSX / XLS
    const formato = /(PPTX?|PDF|XLSX?|DOCX?)$/i.test(ultimo) ? ultimo.toUpperCase() : null;
    docs.push({
      seccion: 'Documentos principales',
      formato,
      titulo: nomb.replace(/\s+(PPTX?|PDF|XLSX?|DOCX?)$/i, '').replace(/\s+/g, ' ').trim(),
      nombreDescarga: nomb,
      asset: asset[1],
    });
  }
  return docs;
}

const entrada = process.argv[2];
if (!entrada) {
  console.error('Uso: node scripts/regenerate-manifest.js <ruta-al-html>');
  process.exit(1);
}

const html = fs.readFileSync(entrada, 'utf8');
const parsed = parse.parseRenderedHtml(html);
if (!parsed) {
  console.error('El HTML no contiene las listas de archivos (render completo).');
  console.error('El sitio actual sirve una shell JS; copie el código fuente completo de la página.');
  process.exit(1);
}

const mainDocs = sacarMainDocs(html);
const actual = path.join(__dirname, '..', 'manifest.json');
const previo = JSON.parse(fs.readFileSync(actual, 'utf8'));

const nuevo = {
  _comentario: previo._comentario || 'Manifiesto de archivos capturado del sitio.',
  fuente: previo.fuente || 'https://www.mindefensa.gov.co/defensa-y-seguridad/datos-y-cifras/informacion-estadistica',
  manifestGeneradoEl: new Date(Date.now()).toISOString().slice(0, 10),
  tituloPagina: previo.tituloPagina || 'Información Estadística',
  fechaPublicacion: parsed.fechaPublicacion || previo.fechaPublicacion || '',
  documentosPrincipales: mainDocs.length ? mainDocs : previo.documentosPrincipales || [],
  secciones: parsed.secciones,
};

fs.writeFileSync(actual, JSON.stringify(nuevo, null, 2), 'utf8');
console.log('Manifiesto regenerado:', actual);
console.log(`- Secciones: ${nuevo.secciones.length}`);
console.log(`- Archivos desagregados: ${nuevo.secciones.reduce((n, s) => n + s.archivos.length, 0)}`);
console.log(`- Documentos principales: ${nuevo.documentosPrincipales.length}`);