const MAX_FILES = 20;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const folderInput = $('#folder');
const maxWidthInput = $('#maxWidth');
const qualityInput = $('#quality');
const queue = $('#queue');
const uploadBtn = $('#uploadBtn');
const clearBtn = $('#clearBtn');
const progressWrap = $('#progressWrap');
const progressBar = $('#progressBar');
const progressText = $('#progressText');
const statusBadge = $('#statusBadge');
const resultPanel = $('#resultPanel');
const codeOutput = $('#codeOutput');
const copyBtn = $('#copyBtn');
const uploadedGrid = $('#uploadedGrid');
const fileCount = $('#fileCount');
const totalBefore = $('#totalBefore');
const totalAfter = $('#totalAfter');

let selectedFiles = [];
let uploadedItems = [];
let activeTab = 'url';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const kb = bytes / 1024;
  const mb = kb / 1024;
  return mb < 0.1 ? `${Math.round(kb)} KB` : `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(text) {
  statusBadge.textContent = text.toUpperCase();
}

function setProgress(percent, text) {
  progressWrap.hidden = false;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressText.textContent = text;
}

function updateStats() {
  fileCount.textContent = selectedFiles.length;
  totalBefore.textContent = formatBytes(selectedFiles.reduce((sum, f) => sum + f.size, 0));
  totalAfter.textContent = formatBytes(uploadedItems.reduce((sum, f) => sum + (f.blob?.size || 0), 0));
}

function renderQueue() {
  updateStats();
  uploadBtn.disabled = selectedFiles.length === 0;

  if (!selectedFiles.length) {
    queue.className = 'queue empty';
    queue.textContent = '선택된 이미지가 없습니다.';
    return;
  }

  queue.className = 'queue';
  queue.innerHTML = '';

  selectedFiles.forEach((file) => {
    const preview = URL.createObjectURL(file);
    const card = document.createElement('article');
    card.className = 'queue-card';
    card.innerHTML = `
      <img src="${preview}" alt="">
      <div class="meta">
        <strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong>
        <span>${formatBytes(file.size)}</span>
      </div>`;
    queue.appendChild(card);
  });
}

function addFiles(fileList) {
  const incoming = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type));
  if (!incoming.length) {
    alert('JPG, PNG, WEBP 이미지만 선택할 수 있습니다.');
    return;
  }

  const space = MAX_FILES - selectedFiles.length;
  if (space <= 0) return;
  selectedFiles = [...selectedFiles, ...incoming.slice(0, space)];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('WebP 변환에 실패했습니다.')), 'image/webp', quality);
  });
}

async function optimize(file) {
  const image = await loadImage(file);
  const maxWidth = Number(maxWidthInput.value);
  const quality = Number(qualityInput.value);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, quality);

  return { original: file, blob, width, height };
}

async function upload(item) {
  const form = new FormData();
  form.append('file', item.blob, item.original.name.replace(/\.[^/.]+$/, '') + '.webp');
  form.append('name', item.original.name);
  form.append('folder', folderInput.value.trim() || 'test');

  const response = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `업로드 오류 (${response.status})`);
  return { ...item, ...data };
}

function getCode(type) {
  if (type === 'html') {
    return uploadedItems.map((item) => `<img src="${item.cdnUrl}" alt="" loading="lazy">`).join('\n');
  }
  if (type === 'css') {
    return uploadedItems.map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  background-image: url("${item.cdnUrl}");\n}`).join('\n\n');
  }
  return uploadedItems.map((item) => item.cdnUrl).join('\n');
}

function renderResults() {
  resultPanel.hidden = false;
  codeOutput.textContent = getCode(activeTab);
  uploadedGrid.innerHTML = '';

  uploadedItems.forEach((item) => {
    const preview = URL.createObjectURL(item.blob);
    const card = document.createElement('article');
    card.className = 'uploaded-card';
    card.innerHTML = `
      <img src="${preview}" alt="">
      <div class="meta">
        <strong title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</strong>
        <span>${item.width} × ${item.height} · ${formatBytes(item.blob.size)}</span>
        <div class="url-line" title="${escapeHtml(item.cdnUrl)}">${escapeHtml(item.cdnUrl)}</div>
        <div class="card-actions">
          <button class="mini copy-url" type="button">COPY URL</button>
          <button class="mini copy-html" type="button">COPY HTML</button>
          <a class="mini" href="${item.cdnUrl}" target="_blank" rel="noreferrer">OPEN</a>
        </div>
      </div>`;

    card.querySelector('.copy-url').addEventListener('click', () => navigator.clipboard.writeText(item.cdnUrl));
    card.querySelector('.copy-html').addEventListener('click', () => navigator.clipboard.writeText(`<img src="${item.cdnUrl}" alt="" loading="lazy">`));
    uploadedGrid.appendChild(card);
  });
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});

['dragenter', 'dragover'].forEach((type) => dropzone.addEventListener(type, (event) => {
  event.preventDefault();
  dropzone.classList.add('dragover');
}));

['dragleave', 'drop'].forEach((type) => dropzone.addEventListener(type, (event) => {
  event.preventDefault();
  dropzone.classList.remove('dragover');
}));

dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
});

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;
  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  uploadedItems = [];
  resultPanel.hidden = true;
  setStatus('WORKING');

  try {
    for (let i = 0; i < selectedFiles.length; i += 1) {
      const file = selectedFiles[i];
      const base = (i / selectedFiles.length) * 100;
      const span = 100 / selectedFiles.length;
      setProgress(base + span * 0.25, `WebP 변환 중 ${i + 1}/${selectedFiles.length} · ${file.name}`);
      const optimized = await optimize(file);
      setProgress(base + span * 0.65, `R2 업로드 중 ${i + 1}/${selectedFiles.length} · ${file.name}`);
      const uploaded = await upload(optimized);
      uploadedItems.push(uploaded);
      updateStats();
      setProgress(base + span, `완료 ${i + 1}/${selectedFiles.length}`);
    }

    setProgress(100, `${uploadedItems.length}개 CDN URL 생성 완료`);
    setStatus('DONE');
    renderResults();
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    setProgress(0, error.message);
    alert(error.message);
  } finally {
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((item) => item.classList.remove('active'));
  tab.classList.add('active');
  activeTab = tab.dataset.tab;
  codeOutput.textContent = getCode(activeTab);
}));

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(getCode(activeTab));
  const old = copyBtn.textContent;
  copyBtn.textContent = 'COPIED';
  setTimeout(() => { copyBtn.textContent = old; }, 1000);
});

renderQueue();
