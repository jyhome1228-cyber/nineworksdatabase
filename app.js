const MAX_FILES = 20;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const maxWidthInput = $('#maxWidth');
const qualityInput = $('#quality');
const queue = $('#queue');
const convertBtn = $('#convertBtn');
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
let convertedFiles = [];
let activeTab = 'base64';

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

function safeName(name, index) {
  const base = name.replace(/\.[^/.]+$/, '');
  const normalized = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return `${normalized || `image-${String(index + 1).padStart(2, '0')}`}.webp`;
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
  totalAfter.textContent = formatBytes(convertedFiles.reduce((sum, file) => sum + file.blob.size, 0));
}

function renderQueue() {
  updateStats();
  convertBtn.disabled = selectedFiles.length === 0;

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
  convertedFiles = [];
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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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
  const dataUrl = await blobToDataUrl(blob);

  return {
    original: file,
    name: safeName(file.name, index),
    blob,
    dataUrl,
    width,
    height
  };
}

function getCode(type) {
  if (type === 'html') {
    return convertedFiles
      .map((item) => `<img src="${item.dataUrl}" alt="" loading="lazy">`)
      .join('\n');
  }

  if (type === 'css') {
    return convertedFiles
      .map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  background-image: url("${item.dataUrl}");\n  background-size: cover;\n  background-position: center;\n}`)
      .join('\n\n');
  }

  return convertedFiles.map((item) => item.dataUrl).join('\n\n');
}

function renderResults() {
  resultPanel.hidden = false;
  codeOutput.textContent = getCode(activeTab);
  convertedGrid.innerHTML = '';

  convertedFiles.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'converted-card';
    card.innerHTML = `
      <img src="${item.dataUrl}" alt="">
      <div class="converted-info">
        <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
        <span>${item.width} × ${item.height} · ${formatBytes(item.blob.size)}</span>
        <div class="card-actions">
          <button class="mini-button copy-one" type="button">COPY HTML</button>
          <button class="mini-button download-one" type="button">WEBP</button>
        </div>
      </div>
    `;

    card.querySelector('.copy-one').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`<img src="${item.dataUrl}" alt="" loading="lazy">`);
      const button = event.currentTarget;
      const previous = button.textContent;
      button.textContent = 'COPIED';
      setTimeout(() => { button.textContent = previous; }, 1000);
    });

    card.querySelector('.download-one').addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(item.blob);
      link.download = item.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
  convertedFiles = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
});

convertBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  convertBtn.disabled = true;
  clearBtn.disabled = true;
  convertedFiles = [];
  resultPanel.hidden = true;
  setStatus('WORKING');

  try {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      setProgress((index / selectedFiles.length) * 90, `변환 중 ${index + 1}/${selectedFiles.length} · ${selectedFiles[index].name}`);
      convertedFiles.push(await convertFile(selectedFiles[index], index));
      updateStats();
    }

    setProgress(100, `${convertedFiles.length}개 이미지 코드 생성 완료`);
    setStatus('DONE');
    renderResults();
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    setProgress(0, error.message);
    alert(error.message);
  } finally {
    convertBtn.disabled = false;
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
