const MAX_FILES = 10;
const MAX_OPTIMIZED_BYTES = 1.3 * 1024 * 1024;
const DEFAULT_API_URL = 'https://nineworksdatabase.vercel.app/api/upload';
const API_URL = location.hostname.endsWith('.vercel.app') ? '/api/upload' : DEFAULT_API_URL;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
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
const convertedGrid = $('#convertedGrid');
const fileCount = $('#fileCount');
const totalBefore = $('#totalBefore');
const totalAfter = $('#totalAfter');

let selectedFiles = [];
let uploadedFiles = [];
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
  totalAfter.textContent = formatBytes(uploadedFiles.reduce((sum, file) => sum + file.blob.size, 0));
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
    alert(`테스트에서는 한 번에 최대 ${MAX_FILES}장까지 처리합니다.`);
    return;
  }

  selectedFiles = [...selectedFiles, ...images.slice(0, available)];
  uploadedFiles = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();

  if (images.length > available) alert(`최대 ${MAX_FILES}장까지만 추가했습니다.`);
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function optimizeFile(file) {
  const image = await loadImage(file);
  const maxWidth = Number(maxWidthInput.value);
  const selectedQuality = Number(qualityInput.value);

  let scale = Math.min(1, maxWidth / image.naturalWidth);
  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));
  let quality = selectedQuality;
  let blob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    blob = await canvasToBlob(canvas, quality);

    if (blob.size <= MAX_OPTIMIZED_BYTES) break;

    if (quality > 0.66) {
      quality = Math.max(0.66, quality - 0.07);
    } else {
      width = Math.max(1200, Math.round(width * 0.84));
      height = Math.max(1, Math.round(image.naturalHeight * (width / image.naturalWidth)));
    }
  }

  if (!blob || blob.size > MAX_OPTIMIZED_BYTES) {
    throw new Error(`${file.name} 최적화 용량이 너무 큽니다. Max width를 낮춰주세요.`);
  }

  return { original: file, blob, width, height, quality };
}

async function uploadOptimized(item) {
  const content = await blobToBase64(item.blob);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: item.original.name,
      content
    })
  });

  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('CDN 업로드 서버가 아직 연결되지 않았습니다. Vercel에 GITHUB_IMAGE_TOKEN을 한 번 설정해야 합니다.');
    }
    throw new Error(data.message || `업로드 오류 (${response.status})`);
  }

  return { ...item, ...data };
}

function getCode(type) {
  if (type === 'html') {
    return uploadedFiles
      .map((item) => `<img src="${item.cdnUrl}" alt="" loading="lazy">`)
      .join('\n');
  }

  if (type === 'css') {
    return uploadedFiles
      .map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  background-image: url("${item.cdnUrl}");\n}`)
      .join('\n\n');
  }

  return uploadedFiles.map((item) => item.cdnUrl).join('\n');
}

function renderResults() {
  resultPanel.hidden = false;
  codeOutput.textContent = getCode(activeTab);
  convertedGrid.innerHTML = '';

  uploadedFiles.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'converted-card';
    const preview = URL.createObjectURL(item.blob);
    card.innerHTML = `
      <img src="${preview}" alt="">
      <div class="converted-info">
        <strong title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</strong>
        <span>${item.width} × ${item.height} · ${formatBytes(item.blob.size)}</span>
        <div class="cdn-line" title="${escapeHtml(item.cdnUrl)}">${escapeHtml(item.cdnUrl)}</div>
        <div class="card-actions">
          <button class="mini-button copy-url" type="button">COPY URL</button>
          <button class="mini-button copy-html" type="button">COPY HTML</button>
        </div>
      </div>
    `;

    card.querySelector('.copy-url').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(item.cdnUrl);
      const button = event.currentTarget;
      const before = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = before; }, 1000);
    });

    card.querySelector('.copy-html').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`<img src="${item.cdnUrl}" alt="" loading="lazy">`);
      const button = event.currentTarget;
      const before = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = before; }, 1000);
    });

    convertedGrid.appendChild(card);
  });

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

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

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  uploadedFiles = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
});

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  uploadedFiles = [];
  resultPanel.hidden = true;
  setStatus('WORKING');

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const start = (index / selectedFiles.length) * 100;
      const span = 100 / selectedFiles.length;

      setProgress(start + span * 0.15, `WebP 변환 중 ${index + 1}/${selectedFiles.length} · ${file.name}`);
      const optimized = await optimizeFile(file);

      setProgress(start + span * 0.55, `GitHub 저장 중 ${index + 1}/${selectedFiles.length} · ${file.name}`);
      const uploaded = await uploadOptimized(optimized);
      uploadedFiles.push(uploaded);
      updateStats();

      setProgress(start + span, `CDN 생성 완료 ${index + 1}/${selectedFiles.length}`);
    }

    setProgress(100, `${uploadedFiles.length}개 CDN URL 생성 완료`);
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

renderQueue();
