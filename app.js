const MAX_FILES = 10;
const DEFAULT_FOLDER = 'nineworks/test';
const STORAGE_KEY = 'nineworks_cloudinary_config';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const cloudNameInput = $('#cloudName');
const uploadPresetInput = $('#uploadPreset');
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
  if (mb < 0.1) return `${Math.round(kb)} KB`;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function slugify(value, fallback = 'image') {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_/]+|[-_/]+$/g, '');
  return normalized || fallback;
}

function safeFolder(value) {
  return slugify(value || DEFAULT_FOLDER, DEFAULT_FOLDER).replace(/\/{2,}/g, '/');
}

function safeName(name, index) {
  const base = name.replace(/\.[^/.]+$/, '');
  const normalized = slugify(base, `image-${String(index + 1).padStart(2, '0')}`).replaceAll('/', '-');
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const token = Math.random().toString(36).slice(2, 7);
  return `${stamp}-${normalized}-${token}`;
}

function getConfig() {
  return {
    cloudName: cloudNameInput.value.trim(),
    uploadPreset: uploadPresetInput.value.trim(),
    folder: safeFolder(folderInput.value.trim() || DEFAULT_FOLDER)
  };
}

function saveConfig() {
  const config = getConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.cloudName) cloudNameInput.value = saved.cloudName;
    if (saved.uploadPreset) uploadPresetInput.value = saved.uploadPreset;
    if (saved.folder) folderInput.value = saved.folder;
  } catch {}
  if (!folderInput.value.trim()) folderInput.value = DEFAULT_FOLDER;
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
  totalBefore.textContent = formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0));
  totalAfter.textContent = formatBytes(uploadedItems.reduce((sum, file) => sum + (file.blob?.size || 0), 0));
}

function renderQueue() {
  updateStats();
  uploadBtn.disabled = selectedFiles.length === 0;

  if (!selectedFiles.length) {
    queue.className = 'queue empty';
    queue.innerHTML = '<p>선택된 이미지가 없습니다.</p>';
    return;
  }

  queue.className = 'queue';
  queue.innerHTML = '';

  selectedFiles.forEach((file) => {
    const card = document.createElement('div');
    card.className = 'queue-item';
    const preview = URL.createObjectURL(file);
    card.innerHTML = `
      <div class="queue-thumb"><img src="${preview}" alt=""></div>
      <div class="queue-meta">
        <div class="queue-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="queue-size">${formatBytes(file.size)}</div>
      </div>
    `;
    queue.appendChild(card);
  });
}

function addFiles(fileList) {
  const images = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type));
  if (!images.length) {
    alert('JPG, PNG, WEBP 이미지만 선택할 수 있습니다.');
    return;
  }

  const available = MAX_FILES - selectedFiles.length;
  if (available <= 0) {
    alert(`한 번에 최대 ${MAX_FILES}장까지만 처리합니다.`);
    return;
  }

  selectedFiles = [...selectedFiles, ...images.slice(0, available)];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();

  if (images.length > available) {
    alert(`최대 ${MAX_FILES}장까지만 추가했습니다.`);
  }
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
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('WebP 변환에 실패했습니다.'));
    }, 'image/webp', quality);
  });
}

async function convertFile(file, index) {
  const image = await loadImage(file);
  const maxWidth = Number(maxWidthInput.value);
  const quality = Number(qualityInput.value);
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, quality);
  return {
    original: file,
    blob,
    width,
    height,
    publicId: safeName(file.name, index)
  };
}

async function uploadToCloudinary(item, config) {
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`;
  const formData = new FormData();
  formData.append('file', item.blob, `${item.publicId}.webp`);
  formData.append('upload_preset', config.uploadPreset);
  formData.append('folder', config.folder);
  formData.append('public_id', item.publicId);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Cloudinary 업로드에 실패했습니다.');
  }

  return {
    ...item,
    secureUrl: data.secure_url,
    publicIdFull: data.public_id,
    format: data.format || 'webp'
  };
}

function cloudinaryDeliveryUrl(config, publicIdFull) {
  return `https://res.cloudinary.com/${encodeURIComponent(config.cloudName)}/image/upload/f_auto,q_auto/${publicIdFull}`;
}

function getCode(type) {
  if (type === 'html') {
    return uploadedItems
      .map((item) => `<img src="${item.cdnUrl}" alt="" loading="lazy">`)
      .join('\n');
  }

  if (type === 'css') {
    return uploadedItems
      .map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  background-image: url("${item.cdnUrl}");\n  background-size: cover;\n  background-position: center;\n}`)
      .join('\n\n');
  }

  return uploadedItems.map((item) => item.cdnUrl).join('\n');
}

function renderResults() {
  resultPanel.hidden = false;
  codeOutput.textContent = getCode(activeTab);
  uploadedGrid.innerHTML = '';

  uploadedItems.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'uploaded-card';
    card.innerHTML = `
      <img src="${item.cdnUrl}" alt="">
      <div class="uploaded-info">
        <strong title="${escapeHtml(item.publicIdFull)}">${escapeHtml(item.publicIdFull)}</strong>
        <span>${item.width} × ${item.height} · ${formatBytes(item.blob.size)}</span>
        <div class="uploaded-actions">
          <button class="mini-button copy-url" type="button">COPY URL</button>
          <button class="mini-button copy-html" type="button">COPY HTML</button>
          <a class="mini-button" href="${item.cdnUrl}" target="_blank" rel="noreferrer">OPEN</a>
        </div>
      </div>
    `;

    card.querySelector('.copy-url').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(item.cdnUrl);
      const button = event.currentTarget;
      const previous = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = previous; }, 1000);
    });

    card.querySelector('.copy-html').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`<img src="${item.cdnUrl}" alt="" loading="lazy">`);
      const button = event.currentTarget;
      const previous = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = previous; }, 1000);
    });

    uploadedGrid.appendChild(card);
  });

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateSetup() {
  const config = getConfig();
  if (!config.cloudName) throw new Error('Cloud name을 입력해주세요.');
  if (!config.uploadPreset) throw new Error('Upload preset을 입력해주세요.');
  return config;
}

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  let config;
  try {
    config = validateSetup();
  } catch (error) {
    alert(error.message);
    return;
  }

  saveConfig();
  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  uploadedItems = [];
  resultPanel.hidden = true;
  setStatus('WORKING');

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      setProgress((index / selectedFiles.length) * 45, `WebP 변환 중 ${index + 1}/${selectedFiles.length} · ${selectedFiles[index].name}`);
      const converted = await convertFile(selectedFiles[index], index);
      setProgress(45 + (index / selectedFiles.length) * 45, `CDN 업로드 중 ${index + 1}/${selectedFiles.length} · ${selectedFiles[index].name}`);
      const uploaded = await uploadToCloudinary(converted, config);
      uploadedItems.push({
        ...uploaded,
        cdnUrl: cloudinaryDeliveryUrl(config, uploaded.publicIdFull)
      });
      updateStats();
    }

    setProgress(100, `${uploadedItems.length}개 이미지 업로드 완료`);
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

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
});

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});

['dragenter', 'dragover'].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    codeOutput.textContent = getCode(activeTab);
  });
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(getCode(activeTab));
  const previous = copyBtn.textContent;
  copyBtn.textContent = 'COPIED';
  setTimeout(() => { copyBtn.textContent = previous; }, 1000);
});

[cloudNameInput, uploadPresetInput, folderInput].forEach((input) => {
  input.addEventListener('change', saveConfig);
  input.addEventListener('blur', saveConfig);
});

loadConfig();
renderQueue();