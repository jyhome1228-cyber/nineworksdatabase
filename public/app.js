const MAX_FILES = 20;
const MAX_OUTPUT_DIMENSION = 3000;
const MAX_WEBP_BYTES = 24 * 1024 * 1024;
const SETTINGS_KEY = 'nineworks_asset_settings_v2';
const UNCATEGORIZED = 'uncategorized';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const folderSelect = $('#folderSelect');
const newFolderField = $('#newFolderField');
const newFolderInput = $('#newFolder');
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

function cleanFolder(value) {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[-_/]+|[-_/]+$/g, '');
  return cleaned || UNCATEGORIZED;
}

function currentFolder() {
  if (folderSelect.value === '__new__') return cleanFolder(newFolderInput.value);
  return folderSelect.value || UNCATEGORIZED;
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
  if (space <= 0) {
    alert(`한 번에 최대 ${MAX_FILES}장까지 처리할 수 있습니다.`);
    return;
  }

  selectedFiles = [...selectedFiles, ...incoming.slice(0, space)];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();

  if (incoming.length > space) alert(`최대 ${MAX_FILES}장까지만 추가했습니다.`);
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
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('WebP 변환에 실패했습니다.')),
      'image/webp',
      quality
    );
  });
}

async function optimize(file) {
  const image = await loadImage(file);
  const requested = Number(maxWidthInput.value) || MAX_OUTPUT_DIMENSION;
  const maxDimension = Math.min(MAX_OUTPUT_DIMENSION, Math.max(1, requested));
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maxDimension / longestSide);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('이미지 변환 기능을 사용할 수 없습니다.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);

  let quality = Math.min(0.95, Math.max(0.55, Number(qualityInput.value) || 0.84));
  let blob = await canvasToBlob(canvas, quality);

  // Very detailed 3000px images can exceed the Worker upload cap.
  // Keep the 3000px dimensions and lower WebP quality gradually instead.
  while (blob.size > MAX_WEBP_BYTES && quality > 0.58) {
    quality = Math.max(0.58, quality - 0.06);
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > MAX_WEBP_BYTES) {
    throw new Error(`${file.name}: 3000px 변환 후 파일 용량이 너무 큽니다. 다른 이미지 또는 낮은 품질을 사용해주세요.`);
  }

  return { original: file, blob, width, height, quality };
}

async function upload(item, folder) {
  const form = new FormData();
  form.append('file', item.blob, item.original.name.replace(/\.[^/.]+$/, '') + '.webp');
  form.append('name', item.original.name);
  form.append('folder', folder);

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
          <button class="mini copy-url" type="button">URL 복사</button>
          <button class="mini copy-html" type="button">HTML 복사</button>
          <a class="mini" href="${item.cdnUrl}" target="_blank" rel="noreferrer">열기</a>
        </div>
      </div>`;

    card.querySelector('.copy-url').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(item.cdnUrl);
      flashButton(event.currentTarget, '복사됨');
    });
    card.querySelector('.copy-html').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`<img src="${item.cdnUrl}" alt="" loading="lazy">`);
      flashButton(event.currentTarget, '복사됨');
    });
    uploadedGrid.appendChild(card);
  });

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function flashButton(button, message) {
  const old = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = old; }, 1000);
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    folder: folderSelect.value,
    customFolder: newFolderInput.value,
    maxWidth: maxWidthInput.value,
    quality: qualityInput.value
  }));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (saved.maxWidth) maxWidthInput.value = String(Math.min(MAX_OUTPUT_DIMENSION, Number(saved.maxWidth) || MAX_OUTPUT_DIMENSION));
    if (saved.quality) qualityInput.value = saved.quality;
    if (saved.customFolder) newFolderInput.value = saved.customFolder;
    return saved;
  } catch {
    return {};
  }
}

function renderFolderOptions(folders, preferred) {
  const existing = new Set([...folderSelect.options].map((option) => option.value));
  folders.forEach((folder) => {
    if (!folder || folder === UNCATEGORIZED || existing.has(folder)) return;
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    folderSelect.insertBefore(option, folderSelect.querySelector('option[value="__new__"]'));
  });

  if (preferred && [...folderSelect.options].some((option) => option.value === preferred)) {
    folderSelect.value = preferred;
  }
  toggleNewFolder();
}

async function loadFolders(preferred) {
  try {
    const response = await fetch('/api/folders', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && Array.isArray(data.folders)) {
      renderFolderOptions(data.folders, preferred);
      return;
    }
  } catch {}
  renderFolderOptions([], preferred);
}

function toggleNewFolder() {
  const show = folderSelect.value === '__new__';
  newFolderField.hidden = !show;
  if (show) newFolderInput.focus();
  saveSettings();
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

  const folder = currentFolder();
  if (folderSelect.value === '__new__' && !newFolderInput.value.trim()) {
    alert('새 프로젝트 폴더 이름을 입력해주세요.');
    newFolderInput.focus();
    return;
  }

  saveSettings();
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
      const uploaded = await upload(optimized, folder);
      uploadedItems.push(uploaded);
      updateStats();
      setProgress(base + span, `완료 ${i + 1}/${selectedFiles.length}`);
    }

    setProgress(100, `${uploadedItems.length}개 CDN URL 생성 완료`);
    setStatus('DONE');
    renderResults();
    await loadFolders(folder);
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

folderSelect.addEventListener('change', toggleNewFolder);
newFolderInput.addEventListener('input', saveSettings);
maxWidthInput.addEventListener('change', () => {
  const value = Math.min(MAX_OUTPUT_DIMENSION, Number(maxWidthInput.value) || MAX_OUTPUT_DIMENSION);
  maxWidthInput.value = String(value);
  saveSettings();
});
qualityInput.addEventListener('change', saveSettings);

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((item) => {
    item.classList.remove('active');
    item.setAttribute('aria-selected', 'false');
  });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  activeTab = tab.dataset.tab;
  codeOutput.textContent = getCode(activeTab);
}));

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(getCode(activeTab));
  flashButton(copyBtn, '복사됨');
});

const savedSettings = loadSettings();
if (!savedSettings.maxWidth) maxWidthInput.value = String(MAX_OUTPUT_DIMENSION);
loadFolders(savedSettings.folder || UNCATEGORIZED);
renderQueue();
