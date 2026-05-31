/**
 * WH3 Texture Converter — Main App Logic (GitHub Pages, pure client-side)
 * Imports: dds-codec.js, texture-ops.js
 */
import { decodeDDS, encodeDDS, DXGI_BC1_SRGB, DXGI_BC3 } from './dds-codec.js';
import { orangeToBlue, blueToOrange, splitMaterialChannels, mergeMaterialChannels } from './texture-ops.js';

// ── State ────────────────────────────────────────────────────
const ddsQueue = [];   // { file, id, detectedType }
const encFiles = {};   // key → { file, rgba, width, height }
let queueId = 0;

const FORMAT = {
  colour:   DXGI_BC1_SRGB,
  material: DXGI_BC1_SRGB,
  normal:   DXGI_BC3,
  mask:     DXGI_BC3,
};

// ── Startup ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  log('logDds',    'Ready. Drop DDS files above.', 'info');
  log('logEncode', 'Ready. Drop PNG files into the correct slots above.', 'info');
  setupDropZone('dropZoneDds', null, handleDropDds);
  setupEncodeDropZones();
});

// ── Helpers: image loading ───────────────────────────────────
async function fileToRgba(file) {
  const url  = URL.createObjectURL(file);
  const img  = await createImageBitmap(await (await fetch(url)).blob());
  URL.revokeObjectURL(url);
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx    = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, img.width, img.height);
  return { rgba: id.data, width: img.width, height: img.height };
}

function rgbaToBlob(rgba, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx    = canvas.getContext('2d');
  const id     = ctx.createImageData(width, height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadBuffer(buf, name) {
  downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), name);
}

// ── Type detection ───────────────────────────────────────────
function detectType(name) {
  const n = name.toLowerCase();
  if (n.includes('_normal') || n.includes('_nrm'))                      return 'normal';
  if (n.includes('_material') || n.includes('_mat'))                    return 'material';
  if (n.includes('_base_colour')||n.includes('_colour')||n.includes('_color')||n.includes('_diffuse')) return 'colour';
  if (n.includes('_mask'))                                               return 'mask';
  return 'unknown';
}

// ── DDS → PNG panel ──────────────────────────────────────────
function setupDropZone(id, _unused, handler) {
  const el = document.getElementById(id);
  el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag-over'); handler(e); });
}

function handleDropDds(e) {
  const files = [...e.dataTransfer.files].filter(f => f.name.toLowerCase().endsWith('.dds'));
  if (!files.length) { log('logDds','No DDS files found in drop.','warn'); return; }
  files.forEach(addToDdsQueue);
}
window.handleFileDds = (input) => [...input.files].forEach(addToDdsQueue);

function addToDdsQueue(file) {
  const id   = ++queueId;
  const type = detectType(file.name);
  ddsQueue.push({ file, id, type });
  renderDdsQueue();
  document.getElementById('btnConvertDds').disabled = false;
}

function renderDdsQueue() {
  const el = document.getElementById('queueDds');
  el.innerHTML = '';
  ddsQueue.forEach(item => {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.id = `qi-${item.id}`;
    div.innerHTML = `
      <span class="queue-status" id="qs-${item.id}">⏳</span>
      <span class="queue-name">${esc(item.file.name)}</span>
      <span class="queue-badge badge-${item.type}">${item.type}</span>
      <button class="queue-remove" onclick="removeDdsItem(${item.id})">✕</button>`;
    el.appendChild(div);
  });
}

window.removeDdsItem = (id) => {
  const i = ddsQueue.findIndex(x => x.id === id);
  if (i !== -1) ddsQueue.splice(i, 1);
  renderDdsQueue();
  if (!ddsQueue.length) document.getElementById('btnConvertDds').disabled = true;
};

window.clearDdsQueue = () => {
  ddsQueue.length = 0;
  document.getElementById('queueDds').innerHTML = '';
  document.getElementById('btnConvertDds').disabled = true;
};

// Convert all queued DDS files
window.convertAllDds = async () => {
  const btn = document.getElementById('btnConvertDds');
  btn.disabled = true;

  for (const item of ddsQueue) {
    setQStatus(item.id, '🔄');
    try {
      const buf  = await item.file.arrayBuffer();
      const { rgba, width, height } = decodeDDS(buf);
      const stem = item.file.name.replace(/\.dds$/i, '');
      const type = item.type;

      if (type === 'normal') {
        const blueRgba = orangeToBlue(rgba, width, height);
        const blob = await rgbaToBlob(blueRgba, width, height);
        downloadBlob(blob, `${stem}_blue.png`);
        log('logDds', `✔ ${item.file.name} → ${stem}_blue.png`, 'ok');

      } else if (type === 'material') {
        // Merged
        const mergedBlob = await rgbaToBlob(rgba, width, height);
        downloadBlob(mergedBlob, `${stem}_merged.png`);
        // Split channels: R=Metalness, G=Roughness, A=AO (B is always 0, skipped)
        const { metalness, roughness, ao } = splitMaterialChannels(rgba, width, height);
        downloadBlob(await rgbaToBlob(metalness,  width, height), `${stem}_metalness.png`);
        downloadBlob(await rgbaToBlob(roughness,  width, height), `${stem}_roughness.png`);
        downloadBlob(await rgbaToBlob(ao,         width, height), `${stem}_ao.png`);
        log('logDds', `✔ ${item.file.name} → merged + metalness + roughness + ao`, 'ok');

      } else {
        const blob = await rgbaToBlob(rgba, width, height);
        downloadBlob(blob, `${stem}.png`);
        log('logDds', `✔ ${item.file.name} → ${stem}.png`, 'ok');
      }

      setQStatus(item.id, '✅');
    } catch (err) {
      setQStatus(item.id, '❌');
      log('logDds', `✘ ${item.file.name}: ${err.message}`, 'err');
      console.error(err);
    }
  }
  btn.disabled = false;
};

function setQStatus(id, s) {
  const el = document.getElementById(`qs-${id}`);
  if (el) el.textContent = s;
}

// ── PNG → DDS panel ──────────────────────────────────────────
function setupEncodeDropZones() {
  const zones = [
    { dropId:'dropColour',    key:'colour'       },
    { dropId:'dropNormal',    key:'normal'       },
    { dropId:'dropMatMerged', key:'mat_merged'   },
    { dropId:'dropMatR',      key:'mat_metallic' },
    { dropId:'dropMatG',      key:'mat_roughness'},
    { dropId:'dropMatB',      key:'mat_ao'       },
    { dropId:'dropMask',      key:'mask'         },
  ];
  zones.forEach(({ dropId, key }) => {
    const el = document.getElementById(dropId);
    if (!el) return;
    el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async e => {
      e.preventDefault(); el.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) await setEncFile(key, file);
    });
  });
}

async function setEncFile(key, file) {
  try {
    const { rgba, width, height } = await fileToRgba(file);
    encFiles[key] = { file, rgba, width, height };
    const listId = {
      colour:'fileListColour', normal:'fileListNormal',
      mat_merged:'fileListMatMerged', mat_metallic:'fileListMatR',
      mat_roughness:'fileListMatG', mat_ao:'fileListMatB',
      mask:'fileListMask',
    }[key];
    renderFileList(listId, key, file.name);
    log('logEncode', `Loaded ${file.name} for ${key}`, 'info');
  } catch(err) {
    log('logEncode', `✘ Could not load ${file?.name}: ${err.message}`, 'err');
  }
}

// Called by inline onchange on file inputs
window.handleEncodeFile = async (input, key) => {
  if (input.files[0]) await setEncFile(key, input.files[0]);
};

function renderFileList(listId, key, name) {
  const el = document.getElementById(listId);
  if (!el) return;
  el.innerHTML = `<div class="file-list-item"><span>${esc(name)}</span>
    <button class="file-list-remove" onclick="removeEncFile('${key}','${listId}')">✕</button></div>`;
}
window.removeEncFile = (key, listId) => {
  delete encFiles[key];
  const el = document.getElementById(listId);
  if (el) el.innerHTML = '';
};

window.encodeType = async (type) => {
  const mipmaps = document.getElementById('cbMipmaps').checked;
  const fmt = FORMAT[type];
  let rgba, width, height, stem;

  try {
    if (type === 'colour' || type === 'mask') {
      const e = encFiles[type];
      if (!e) { log('logEncode', `No ${type} PNG loaded.`, 'warn'); return; }
      ({ rgba, width, height } = e);
      stem = e.file.name.replace(/\.[^.]+$/, '');

    } else if (type === 'normal') {
      const e = encFiles.normal;
      if (!e) { log('logEncode', 'No normal map PNG loaded.', 'warn'); return; }
      ({ width, height } = e);
      stem = e.file.name.replace(/\.[^.]+$/, '');
      rgba = blueToOrange(e.rgba, width, height);   // convert blue → orange before DDS encode

    } else if (type === 'material') {
      const merged = encFiles.mat_merged;
      const met    = encFiles.mat_metallic;
      const rough  = encFiles.mat_roughness;
      const ao     = encFiles.mat_ao;
      if (!merged && !met && !rough && !ao) {
        log('logEncode', 'No material PNGs loaded.', 'warn'); return;
      }
      // Use merged if present, else build from channels
      if (merged) {
        ({ rgba, width, height } = merged);
        stem = merged.file.name.replace(/\.[^.]+$/, '');
      } else {
        const ref = met || rough || ao;
        ({ width, height } = ref);
        stem = ref.file.name.replace(/\.[^.]+$/, '');
        rgba = mergeMaterialChannels(
          met?.rgba   || null,
          rough?.rgba || null,
          ao?.rgba    || null,
          width, height
        );
      }
    }

    log('logEncode', `Encoding ${stem} as ${type} (${fmt})…`, 'info');
    const buf = encodeDDS(rgba, width, height, fmt, mipmaps);
    downloadBuffer(buf, `${stem}.dds`);
    log('logEncode', `✔ ${stem}.dds downloaded.`, 'ok');

  } catch(err) {
    log('logEncode', `✘ ${err.message}`, 'err');
    console.error(err);
  }
};

// ── Tab switching ────────────────────────────────────────────
window.switchTab = (tab) => {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (tab === 'ddstopng') {
    document.getElementById('tabDdsToPng').classList.add('active');
    document.getElementById('panelDdsToPng').classList.add('active');
  } else {
    document.getElementById('tabPngToDds').classList.add('active');
    document.getElementById('panelPngToDds').classList.add('active');
  }
};

// ── Drag-over for main DDS zone (called from HTML) ───────────
window.handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
window.handleDragLeave = (e, id) => document.getElementById(id)?.classList.remove('drag-over');
window.handleDropDds   = handleDropDds;

// ── Log ──────────────────────────────────────────────────────
function log(panelId, msg, level = 'info') {
  const el   = document.getElementById(panelId);
  const line = document.createElement('div');
  line.className = `log-line log-${level}`;
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  line.textContent = `[${ts}] ${msg}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
