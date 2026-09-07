const OWNER = 'jyhome1228-cyber';
const REPO = 'nineworksdatabase';
const BRANCH = 'main';
const MAX_FILES_PER_BATCH = 50;
const MAX_OPTIMIZED_BYTES = 2.2 * 1024 * 1024;
const MAX_REQUEST_BASE64 = 3_150_000;
const DEFAULT_API_URL = 'https://nineworksdatabase.vercel.app/api/upload';
const API_URL = localStorage.getItem('nineworks_api_url') || (location.hostname.endsWith('.vercel.app') ? '/api/upload' : DEFAULT_API_URL);
const ACCESS_STORAGE_KEY = 'nineworks_access_code';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const projectInput = $('#project');
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
const connectBtn = $('#connectBtn');
const connectionText = $('#connectionText');
const connectionNote = $('#connectionNote');
const authModal = $('#authModal');
const accessCodeInput = $('#accessCode');
const saveAccessBtn = $('#saveAccessBtn');
const forgetBtn = $('#forgetBtn');
const authError = $('#authError');

let selectedFiles = [];
let convertedFiles = [];
let uploadedItems = [];
let activeTab = 'url';
let connected = false;

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 0.1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function slugify(value, fallback = 'project') {
  const normalized = (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return normalized || fallback;
}

function safeBaseName(name, index) {
  const base = name.replace(/\.[^/.]+$/, '');
  const safe = slugify(base, `image-${String(index + 1).padStart(2, '0')}`);
  return safe.slice(0, 80);
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function setStatus(text) {
  statusBadge.textContent = text.toUpperCase();
}

function setProgress(percent, text) {
  progressWrap.hidden = false;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  progressText.textContent = text;
}

function setConnection(kind, label, message) {
  connectBtn.className = `connection ${kind || ''}`.trim();
  connectionText.textContent = label;
  connectionNote.className = `connection-note ${kind === 'connected' ? 'connected' : kind === 'error' ? 'error' : ''}`.trim();
  connectionNote.innerHTML = `<b>UPLOAD SERVER</b><span>${escapeHtml(message)}</span>`;
  connected = kind === 'connected';
}

function updateStats() {
  fileCount.textContent = selectedFiles.length;
  totalBefore.textContent = formatBytes(selectedFiles.reduce((a, f) => a + f.size, 0));
  totalAfter.textContent = formatBytes(convertedFiles.reduce((a, f) => a + f.blob.size, 0));
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
    const url = URL.createObjectURL(file);
    card.innerHTML = `
      <div class="queue-thumb"><img src="${url}" alt=""></div>
      <div class="queue-meta">
        <div class="queue-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        <div class="queue-size">${formatBytes(file.size)}</div>
      </div>`;
    queue.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function addFiles(fileList) {
  const incoming = [...fileList].filter((file) => /^image\/(jpeg|png|webp)$/i.test(file.type));
  if (!incoming.length) {
    alert('JPG, PNG, WEBP 이미지만 선택할 수 있습니다.');
    return;
  }

  const remaining = MAX_FILES_PER_BATCH - selectedFiles.length;
  if (remaining <= 0) {
    alert(`한 번에 최대 ${MAX_FILES_PER_BATCH}장까지 처리할 수 있습니다.`);
    return;
  }

  const accepted = incoming.slice(0, remaining);
  selectedFiles = [...selectedFiles, ...accepted];
  convertedFiles = [];
  totalAfter.textContent = '0 MB';
  renderQueue();

  if (incoming.length > accepted.length) {
    alert(`브라우저 안정성을 위해 한 번에 최대 ${MAX_FILES_PER_BATCH}장까지만 추가했습니다.`);
  }
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';
});

['dragenter', 'dragover'].forEach((type) => {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((type) => {
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

clearBtn.addEventListener('click', () => {
  selectedFiles = [];
  convertedFiles = [];
  uploadedItems = [];
  resultPanel.hidden = true;
  progressWrap.hidden = true;
  setStatus('READY');
  renderQueue();
});

function openAuthModal(message = '') {
  authModal.hidden = false;
  authError.textContent = message;
  accessCodeInput.value = localStorage.getItem(ACCESS_STORAGE_KEY) || '';
  setTimeout(() => accessCodeInput.focus(), 30);
}

function closeAuthModal() {
  authModal.hidden = true;
  authError.textContent = '';
}

connectBtn.addEventListener('click', () => openAuthModal());
authModal.addEventListener('click', (e) => {
  if (e.target === authModal) closeAuthModal();
});
accessCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveAccessBtn.click();
});

forgetBtn.addEventListener('click', () => {
  localStorage.removeItem(ACCESS_STORAGE_KEY);
  accessCodeInput.value = '';
  connected = false;
  setConnection('locked', 'CONNECT', '관리자 코드를 연결하면 이후 이 브라우저에서 자동으로 사용합니다.');
});

async function verifyConnection(code, showError = false) {
  if (!code) {
    setConnection('locked', 'CONNECT', '관리자 코드를 한 번 연결해주세요. GitHub 토큰은 필요하지 않습니다.');
    return false;
  }

  try {
    setConnection('', 'CHECKING', '업로드 서버와 연결을 확인하고 있습니다.');
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: { 'X-Access-Code': code }
    });

    if (response.ok) {
      setConnection('connected', 'CONNECTED', 'Nineworks GitHub 이미지 저장소에 연결되었습니다.');
      return true;
    }

    let data = {};
    try { data = await response.json(); } catch {}

    if (response.status === 401) {
      setConnection('locked', 'LOCKED', '관리자 코드가 필요하거나 올바르지 않습니다.');
      if (showError) authError.textContent = '관리자 코드가 올바르지 않습니다.';
      return false;
    }

    const message = data.message || `업로드 서버 응답 오류 (${response.status})`;
    setConnection('error', 'SERVER ERROR', message);
    if (showError) authError.textContent = message;
    return false;
  } catch (error) {
    setConnection('error', 'OFFLINE', '업로드 서버가 아직 배포되지 않았거나 연결할 수 없습니다.');
    if (showError) authError.textContent = '업로드 서버 연결이 아직 완료되지 않았습니다.';
    return false;
  }
}

saveAccessBtn.addEventListener('click', async () => {
  const code = accessCodeInput.value.trim();
  if (!code) {
    authError.textContent = '관리자 코드를 입력해주세요.';
    return;
  }
  saveAccessBtn.disabled = true;
  const ok = await verifyConnection(code, true);
  saveAccessBtn.disabled = false;
  if (ok) {
    localStorage.setItem(ACCESS_STORAGE_KEY, code);
    closeAuthModal();
  }
});

async function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
    };
    img.src = url;
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

async function convertToWebP(file, index, folder) {
  const img = await loadImage(file);
  const maxWidth = Number(maxWidthInput.value);
  const selectedQuality = Number(qualityInput.value);
  const initialScale = Math.min(1, maxWidth / img.naturalWidth);
  let width = Math.max(1, Math.round(img.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(img.naturalHeight * initialScale));
  let quality = selectedQuality;
  let blob = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    blob = await canvasToBlob(canvas, quality);

    if (blob.size <= MAX_OPTIMIZED_BYTES) break;

    if (quality > 0.62) {
      quality = Math.max(0.62, quality - 0.08);
    } else {
      width = Math.max(960, Math.round(width * 0.82));
      height = Math.max(1, Math.round(img.naturalHeight * (width / img.naturalWidth)));
    }
  }

  if (!blob || blob.size > MAX_OPTIMIZED_BYTES) {
    throw new Error(`${file.name}의 최적화 후 용량이 너무 큽니다. Max width를 낮춰주세요.`);
  }

  const name = `${safeBaseName(file.name, index)}-${randomId()}.webp`;
  const path = `images/${folder}/${name}`;
  return { original: file, blob, name, path, width, height, quality };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function prepareUploadChunks(files) {
  const prepared = [];
  for (let i = 0; i < files.length; i += 1) {
    setProgress(45 + (i / files.length) * 12, `업로드 데이터 준비 중 ${i + 1}/${files.length}`);
    prepared.push({
      path: files[i].path,
      content: await blobToBase64(files[i].blob)
    });
  }

  const chunks = [];
  let chunk = [];
  let size = 0;

  for (const file of prepared) {
    const nextSize = file.content.length + file.path.length + 300;
    if (chunk.length && (size + nextSize > MAX_REQUEST_BASE64 || chunk.length >= 20)) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(file);
    size += nextSize;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

async function uploadChunks(chunks, code) {
  const commits = [];
  for (let i = 0; i < chunks.length; i += 1) {
    setProgress(60 + (i / chunks.length) * 36, `GitHub에 저장 중 ${i + 1}/${chunks.length}`);
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Access-Code': code
      },
      body: JSON.stringify({ files: chunks[i] })
    });

    let data = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(ACCESS_STORAGE_KEY);
        connected = false;
        throw new Error('관리자 코드가 만료되었거나 올바르지 않습니다. 다시 연결해주세요.');
      }
      throw new Error(data.message || `업로드 서버 오류 (${response.status})`);
    }
    commits.push(data.commit);
  }
  return commits;
}

function buildUrls(files) {
  return files.map((item) => {
    const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
    const pageUrl = `https://${OWNER}.github.io/${REPO}/${encodedPath}`;
    const rawUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${encodedPath}`;
    return { ...item, pageUrl, rawUrl };
  });
}

function getCode(type) {
  if (type === 'html') {
    return uploadedItems.map((item) => `<img src="${item.pageUrl}" alt="" loading="lazy">`).join('\n');
  }
  if (type === 'css') {
    return uploadedItems.map((item, i) => `.image-${String(i + 1).padStart(2, '0')} {\n  background-image: url("${item.pageUrl}");\n}`).join('\n\n');
  }
  return uploadedItems.map((item) => item.pageUrl).join('\n');
}

function renderResult() {
  resultPanel.hidden = false;
  codeOutput.textContent = getCode(activeTab);
  uploadedGrid.innerHTML = '';

  uploadedItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'uploaded-card';
    const preview = URL.createObjectURL(item.blob);
    card.innerHTML = `
      <img src="${preview}" alt="">
      <div title="${escapeHtml(item.name)}">${escapeHtml(item.name)} · ${formatBytes(item.blob.size)}</div>`;
    uploadedGrid.appendChild(card);
  });

  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    codeOutput.textContent = getCode(activeTab);
  });
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(getCode(activeTab));
  const old = copyBtn.textContent;
  copyBtn.textContent = 'COPIED';
  setTimeout(() => { copyBtn.textContent = old; }, 1200);
});

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  const accessCode = localStorage.getItem(ACCESS_STORAGE_KEY) || '';
  if (!accessCode) {
    openAuthModal('처음 한 번만 관리자 코드를 연결해주세요.');
    return;
  }

  if (!connected) {
    const ok = await verifyConnection(accessCode);
    if (!ok) {
      openAuthModal('업로드 서버 연결을 확인해주세요.');
      return;
    }
  }

  const folder = slugify(projectInput.value, 'uncategorized');
  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  setStatus('WORKING');
  convertedFiles = [];
  uploadedItems = [];
  resultPanel.hidden = true;

  try {
    for (let i = 0; i < selectedFiles.length; i += 1) {
      setProgress(5 + (i / selectedFiles.length) * 38, `WebP 최적화 중 ${i + 1}/${selectedFiles.length} · ${selectedFiles[i].name}`);
      const converted = await convertToWebP(selectedFiles[i], i, folder);
      convertedFiles.push(converted);
      updateStats();
    }

    setProgress(44, `최적화 완료 · ${formatBytes(convertedFiles.reduce((a, f) => a + f.blob.size, 0))}`);
    const chunks = await prepareUploadChunks(convertedFiles);
    const commits = await uploadChunks(chunks, accessCode);
    uploadedItems = buildUrls(convertedFiles);

    setProgress(100, `업로드 완료 · ${convertedFiles.length} images · ${commits.length} commit batch`);
    setStatus('DONE');
    renderResult();
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    setProgress(0, error.message);
    alert(`업로드에 실패했습니다.\n\n${error.message}`);
  } finally {
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

async function initConnection() {
  const code = localStorage.getItem(ACCESS_STORAGE_KEY) || '';
  if (!code) {
    setConnection('locked', 'CONNECT', '관리자 코드를 한 번 연결하면 GitHub 토큰 없이 사용할 수 있습니다.');
    return;
  }
  await verifyConnection(code);
}

renderQueue();
initConnection();
