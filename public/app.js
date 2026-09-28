'use strict';

/* ---------------------------------- estado ---------------------------------- */
const HIST_KEY = 'mdnHist_v1';
let DATA = null; // respuesta de /api/archivos
let FILTRO = '';

function loadHist() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '{}'); }
  catch { return {}; }
}
function saveHist(h) { localStorage.setItem(HIST_KEY, JSON.stringify(h)); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------- estado de archivo ------------------------------- */
function estadoDe(f) {
  const hist = loadHist();
  const r = hist[f.asset];
  if (!r) return { key: 'nuevo', texto: 'Nuevo' };
  if (f.ultimaModificacionEpoch && r.versionEpoch && f.ultimaModificacionEpoch > r.versionEpoch)
    return { key: 'upd', texto: 'Actualizado' };
  return { key: 'ok', texto: 'Al día' };
}

function badgeHtml(st, conRegistro) {
  const etiqueta = conRegistro ? 'Descargado · ' + st.texto : st.texto;
  return `<span class="badge ${st.key}">${esc(etiqueta)}</span>`;
}

/* --------------------------------- render: resumen -------------------------------- */
function renderSummary() {
  const chips = document.getElementById('summaryChips');
  const todas = [...DATA.documentosPrincipales];
  DATA.secciones.forEach((s) => s.archivos.forEach((f) => todas.push(f)));

  let nuevo = 0, upd = 0, ok = 0;
  for (const f of todas) { const st = estadoDe(f); if (st.key === 'nuevo') nuevo++; else if (st.key === 'upd') upd++; else ok++; }

  chips.innerHTML =
    `<span class="chip total">Total <b>${todas.length}</b></span>` +
    `<span class="chip nuevo">Nuevos <b>${nuevo}</b></span>` +
    `<span class="chip upd">Actualizados <b>${upd}</b></span>` +
    `<span class="chip ok">Al día <b>${ok}</b></span>`;
}

/* --------------------------------- render: documentos principales -------------------------------- */
function renderMainDocs() {
  const el = document.getElementById('mainDocsList');
  const lista = DATA.documentosPrincipales || [];
  if (!lista.length) { el.innerHTML = ''; return; }
  const hs = loadHist();
  el.innerHTML = lista.map((f) => {
    const st = estadoDe(f);
    const tiene = !!hs[f.asset];
    const nombre = f.titulo || f.asset;
    const ext = (f.formato || '').toLowerCase();
    return `<div class="card">
      <div class="card-head">
        <h3>${esc(nombre)}</h3>
        ${ext ? `<span class="ext">${esc(ext.toUpperCase())}</span>` : ''}
      </div>
      <div class="meta">${esc(f.seccion || '')}</div>
      ${badgeHtml(st, tiene)}
      <button class="dl-btn" data-asset="${esc(f.asset)}" data-titulo="${esc(f.nombreDescarga || nombre)}" data-formato="${esc(f.formato || '')}">
        Descargar
      </button>
    </div>`;
  }).join('');
}

/* --------------------------------- render: secciones -------------------------------- */
function archivoCoincide(f) {
  if (!FILTRO) return true;
  const q = FILTRO.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = (f.titulo + ' ' + (f.seccion || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return t.includes(q);
}

function renderSecciones() {
  const el = document.getElementById('sectionsList');
  const hs = loadHist();
  let html = '';
  DATA.secciones.forEach((sec, i) => {
    const visibles = sec.archivos.filter(archivoCoincide);
    if (!visibles.length) return;
    const filas = visibles.map((f) => {
      const st = estadoDe(f);
      const tiene = !!hs[f.asset];
      const ext = (f.formato || '').toLowerCase();
      const fecha = f.ultimaModificacion ? ` · Modificación: ${esc(f.ultimaModificacion)}` : '';
      const quien = f.modificadoPor ? ` · ${esc(f.modificadoPor)}` : '';
      return `<div class="file">
        <div class="info">
          <div class="title">${esc(f.titulo)}${ext ? `&nbsp;<span class="ext">${esc(ext.toUpperCase())}</span>` : ''}</div>
          <div class="sub">${esc(f.seccion)}${fecha}${quien}</div>
        </div>
        <div class="actions">
          ${badgeHtml(st, tiene)}
          <button class="dl-btn" data-asset="${esc(f.asset)}" data-titulo="${esc(f.titulo)}" data-formato="">
            Descargar
          </button>
        </div>
      </div>`;
    }).join('');
    if (!filas) return;
    const updEnSeccion = visibles.some((f) => estadoDe(f).key === 'upd');
    const badgeSec = updEnSeccion ? '<span class="badge upd">Hay actualizaciones</span>' : '';
    html += `<details class="section" ${i === 0 ? 'open' : ''}>
      <summary>
        <span>${esc(sec.titulo)} ${badgeSec}</span>
        <span class="count">
          <button class="sec-dl-btn" type="button" data-sec="${i}" title="Descargar todos los archivos de esta sección">⬇️ ${sec.archivos.length}</button>
          <span class="caret">›</span>
        </span>
      </summary>
      <div class="files">${filas}</div>
    </details>`;
  });
  el.innerHTML = html || '<div class="empty">No hay coincidencias.</div>';
}

/* --------------------------------- render general -------------------------------- */
function renderTodo() {
  renderSummary();
  renderMainDocs();
  renderSecciones();
  const fuente = document.getElementById('sourceBadge');
  const esLive = DATA.origen === 'live';
  fuente.textContent = esLive ? '● Datos en vivo' : '● Datos: manifiesto';
  fuente.className = 'source ' + (esLive ? 'live' : 'manifest');
  document.getElementById('fechaPublicacion').textContent = DATA.fechaPublicacion || '';
  const h = loadHist();
  const tot = Object.keys(h).length;
  document.getElementById('hintBar').textContent = tot
    ? `Registro local: ${tot} descarga${tot !== 1 ? 's' : ''} en este dispositivo.`
    : 'Aún no has descargado archivos: los verás como “Nuevo”.';
  document.getElementById('footnote').textContent =
    `Resumen: ${DATA.resumen.total} archivos en total · ${DATA.resumen.archivosDesagregados} en secciones desagregadas · generado ${new Date(DATA.generadoEl).toLocaleString()}`;
}
/* --------------------------------- descarga ---------------------------------- */
async function descargar(btn) {
  const asset = btn.dataset.asset;
  const f = buscarArchivo(asset);
  if (!f) { alert('Archivo no encontrado.'); return; }
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Descargando…';
  try {
    const { blob, name } = await fetchArchivo(f);
    guardarBlob(blob, name);
    registrarDescarga(f);
    renderTodo();
  } catch (err) {
    alert('No se pudo descargar: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* --------------------------- descarga de archivo (núcleo) --------------------------- */
async function fetchArchivo(f) {
  const url = `/api/download?asset=${encodeURIComponent(f.asset)}&titulo=${encodeURIComponent(f.titulo || f.nombreDescarga || '')}&formato=${encodeURIComponent(f.formato || '')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  let name = f.titulo || f.nombreDescarga || 'archivo';
  const m = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
  if (m) name = decodeURIComponent(m[1]);
  return { blob, name };
}

function guardarBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function registrarDescarga(f) {
  const hist = loadHist();
  hist[f.asset] = {
    versionEpoch: f.ultimaModificacionEpoch != null ? f.ultimaModificacionEpoch : null,
    versionLabel: f.ultimaModificacion || '',
    whenISO: new Date().toISOString(),
  };
  saveHist(hist);
}

function buscarArchivo(asset) {
  for (const f of DATA.documentosPrincipales) if (f.asset === asset) return f;
  for (const s of DATA.secciones) for (const f of s.archivos) if (f.asset === asset) return f;
  return null;
}

function todosLosArchivos() {
  return [...DATA.documentosPrincipales].concat(DATA.secciones.flatMap((s) => s.archivos));
}

/* --------------------------- descarga masiva con progreso --------------------------- */
let descargaActiva = false;
let cancelarDescarga = false;
let progressHideTimer = null;

function mostrarProgreso(visible, total) {
  const panel = document.getElementById('progressPanel');
  if (progressHideTimer) { clearTimeout(progressHideTimer); progressHideTimer = null; }
  panel.hidden = !visible;
  document.getElementById('btnDownloadAll').disabled = visible;
  if (visible) {
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('progressSub').textContent = `0 / ${total}`;
  }
}

/** Oculta el panel tras unos segundos para poder leer el mensaje final. */
function ocultarProgresoDiferido(ms) {
  if (progressHideTimer) clearTimeout(progressHideTimer);
  progressHideTimer = setTimeout(() => {
    document.getElementById('progressPanel').hidden = true;
    progressHideTimer = null;
  }, ms);
}

function actualizarProgreso(hechos, total, nombreActual, errores) {
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressSub').textContent =
    `${hechos} / ${total}${nombreActual ? ' — ' + nombreActual : ''}${errores ? ' · fallos: ' + errores : ''}`;
}

async function descargarLista(lista, label) {
  if (descargaActiva) return;
  const total = lista.length;
  if (!total) { alert('No hay archivos para descargar.'); return; }
  descargaActiva = true;
  cancelarDescarga = false;
  document.getElementById('progressLabel').textContent = label;
  mostrarProgreso(true, total);
  let hechos = 0, errores = 0;

  try {
    for (const f of lista) {
      if (cancelarDescarga) break;
      actualizarProgreso(hechos, total, f.titulo, errores || null);
      try {
        const { blob, name } = await fetchArchivo(f);
        guardarBlob(blob, name);
        registrarDescarga(f);
        hechos++;
      } catch (err) {
        errores++;
        console.warn('Falló descarga de', f.titulo, err.message);
      }
    }
    renderTodo();
    actualizarProgreso(hechos, total, '', errores || null);
    document.getElementById('progressLabel').textContent =
      cancelarDescarga ? `Descarga cancelada (${hechos}/${total})`
        : `Descarga terminada ✅ ${hechos}/${total}${errores ? ' · fallos: ' + errores : ''}`;
  } finally {
    descargaActiva = false;
    document.getElementById('btnDownloadAll').disabled = false;
    if (errores) alert(`Completado con ${errores} error(es) durante la descarga de los archivos.`);
    ocultarProgresoDiferido(6000);
  }
}

function descargarTodo() { descargarLista(todosLosArchivos(), 'Descargando todos los archivos…'); }
function descargarSeccion(idx) {
  const sec = DATA.secciones[idx];
  if (sec) descargarLista(sec.archivos, `Descargando sección: ${sec.titulo}…`);
}

/* --------------------------------- carga de datos --------------------------------- */
async function cargar() {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Consultando…';
  document.getElementById('mainDocsList').innerHTML =
    '<div class="empty">Consultando el Ministerio de Defensa…</div>';
  try {
    const res = await fetch('/api/archivos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
    if (!DATA.secciones.length) {
      document.getElementById('mainDocsList').innerHTML =
        '<div class="empty">No se pudo obtener la lista de archivos. Reintente más tarde.</div>';
    }
    renderTodo();
  } catch (err) {
    document.getElementById('mainDocsList').innerHTML =
      `<div class="empty">Error al consultar: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🔄 Comprobar actualizaciones';
  }
}

/* --------------------------------- eventos --------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRefresh').addEventListener('click', cargar);
  document.getElementById('btnDownloadAll').addEventListener('click', descargarTodo);
  document.getElementById('btnCancelAll').addEventListener('click', () => { cancelarDescarga = true; });
  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('¿Borrar el historial de descargas de este dispositivo?')) {
      localStorage.removeItem(HIST_KEY);
      renderTodo();
    }
  });
  document.getElementById('search').addEventListener('input', (e) => {
    FILTRO = e.target.value.trim();
    renderSecciones();
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.dl-btn');
    if (btn) { descargar(btn); return; }
    const secBtn = e.target.closest('.sec-dl-btn');
    if (secBtn) {
      e.preventDefault();   // evita que el clic abra/cierre el <details>
      e.stopPropagation();
      descargarSeccion(parseInt(secBtn.dataset.sec, 10));
    }
  });
  cargar();
});