const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const stage = document.getElementById('stage');
const previewImg = document.getElementById('previewImg');
const outputBox = document.getElementById('outputBox');
const outputImg = document.getElementById('outputImg');
const origMeta = document.getElementById('origMeta');
const outMeta = document.getElementById('outMeta');

const sizeButtons = document.getElementById('sizeButtons');
const formatSelect = document.getElementById('formatSelect');
const qualityGroup = document.getElementById('qualityGroup');
const qualityRange = document.getElementById('qualityRange');
const qualityValue = document.getElementById('qualityValue');

const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

const TARGET_LONG_EDGES = [4096, 3072, 2048, 1600, 1280, 1024, 800, 640];

let originalFile = null;
let originalBitmap = null;
let originalObjectUrl = null;
let selectedLongEdge = 1280;
let lastBlob = null;
let lastBlobUrl = null;

function humanBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let b = bytes;
  let u = 0;
  while (b >= 1024 && u < units.length - 1) {
    b /= 1024;
    u += 1;
  }
  return `${b.toFixed(u === 0 ? 0 : 2)} ${units[u]}`;
}

function setOutMeta(info) {
  outMeta.textContent = info;
}

function resetState() {
  if (originalObjectUrl) URL.revokeObjectURL(originalObjectUrl);
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);

  originalFile = null;
  originalBitmap = null;
  originalObjectUrl = null;
  lastBlob = null;
  lastBlobUrl = null;

  previewImg.src = '';
  outputImg.src = '';
  outputBox.classList.add('hidden');

  fileInput.value = '';
  fileName.textContent = 'No file selected';
  stage.classList.add('hidden');
  downloadBtn.disabled = true;
  resetBtn.disabled = true;
  origMeta.textContent = '—';
  setOutMeta('—');
}

function renderSizeButtons() {
  sizeButtons.innerHTML = '';
  for (const px of TARGET_LONG_EDGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = `${px}px`;
    b.dataset.px = String(px);
    if (px === selectedLongEdge) b.style.outline = '2px solid rgba(47,124,255,.8)';
    b.addEventListener('click', async () => {
      selectedLongEdge = px;
      renderSizeButtons();
      await regenerate();
    });
    sizeButtons.appendChild(b);
  }
}

function shouldShowQuality(mime) {
  return mime === 'image/jpeg' || mime === 'image/webp';
}

function updateQualityUI() {
  const mime = formatSelect.value;
  qualityGroup.style.display = shouldShowQuality(mime) ? 'block' : 'none';
}

function computeTargetSize(w, h, longEdge) {
  const maxEdge = Math.max(w, h);
  if (maxEdge <= longEdge) return { w, h, scale: 1 };
  const scale = longEdge / maxEdge;
  return { w: Math.round(w * scale), h: Math.round(h * scale), scale };
}

async function regenerate() {
  if (!originalBitmap) return;

  const { width: ow, height: oh } = originalBitmap;
  const { w, h } = computeTargetSize(ow, oh, selectedLongEdge);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });

  // Higher quality downscaling.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(originalBitmap, 0, 0, w, h);

  const mime = formatSelect.value;
  const q = parseFloat(qualityRange.value);

  const blob = await new Promise((resolve) => {
    if (shouldShowQuality(mime)) {
      canvas.toBlob(resolve, mime, q);
    } else {
      canvas.toBlob(resolve, mime);
    }
  });

  if (!blob) {
    setOutMeta('Failed to generate output');
    downloadBtn.disabled = true;
    outputBox.classList.add('hidden');
    return;
  }

  lastBlob = blob;
  downloadBtn.disabled = false;

  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = URL.createObjectURL(blob);
  outputImg.src = lastBlobUrl;
  outputBox.classList.remove('hidden');

  const fmt = mime === 'image/jpeg' ? 'JPEG' : mime === 'image/webp' ? 'WebP' : 'PNG';
  const qText = shouldShowQuality(mime) ? `, q=${q.toFixed(2)}` : '';
  setOutMeta(`${w}×${h}, ${fmt}${qText}, ${humanBytes(blob.size)}`);
}

function downloadBlob() {
  if (!lastBlob || !originalFile) return;

  const base = originalFile.name.replace(/\.[^/.]+$/, '');
  const mime = formatSelect.value;
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const outName = `${base}-${selectedLongEdge}px.${ext}`;

  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

fileInput.addEventListener('change', async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;

  resetBtn.disabled = false;

  originalFile = f;
  fileName.textContent = f.name;

  if (originalObjectUrl) URL.revokeObjectURL(originalObjectUrl);
  originalObjectUrl = URL.createObjectURL(f);
  previewImg.src = originalObjectUrl;

  stage.classList.remove('hidden');

  // Decode.
  try {
    originalBitmap = await createImageBitmap(f);
  } catch (e) {
    originalBitmap = null;
    origMeta.textContent = `Could not read image (${String(e)})`;
    downloadBtn.disabled = true;
    return;
  }

  origMeta.textContent = `${originalBitmap.width}×${originalBitmap.height}, ${humanBytes(f.size)}`;
  renderSizeButtons();
  updateQualityUI();
  await regenerate();
});

formatSelect.addEventListener('change', async () => {
  updateQualityUI();
  await regenerate();
});

qualityRange.addEventListener('input', () => {
  qualityValue.textContent = Number.parseFloat(qualityRange.value).toFixed(2);
});
qualityRange.addEventListener('change', regenerate);

downloadBtn.addEventListener('click', downloadBlob);
resetBtn.addEventListener('click', resetState);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Note: service workers require secure context (https) OR localhost.
  // On iPhone, you'll likely need https for offline support.
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Initial
qualityValue.textContent = Number.parseFloat(qualityRange.value).toFixed(2);
renderSizeButtons();
updateQualityUI();
registerServiceWorker();
