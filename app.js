const OWNER = 'jyhome1228-cyber';
const REPO = 'nineworksdatabase';
const BRANCH = 'main';
const MAX_FILES_PER_BATCH = 50;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const projectInput = $('#project');
const tokenInput = $('#token');
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
let convertedFiles = [];
let uploadedItems = [];
let activeTab = 'url';

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
  return Math.random().toString(36).slice(2, 8);
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
  selectedFiles.forEach((file, i) => {
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

async function convertToWebP(file, index, folder) {
  const img = await loadImage(file);
  const maxWidth = Number(maxWidthInput.value);
  const quality = Number(qualityInput.value);
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error(`${file.name} WebP 변환에 실패했습니다.`)), 'image/webp', quality);
  });

  const name = `${safeBaseName(file.name, index)}-${randomId()}.webp`;
  const path = `images/${folder}/${name}`;
  return { original: file, blob, name, path, width, height };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function githubRequest(path, token, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data.message || JSON.stringify(data);
    } catch {
      detail = await res.text();
    }
    throw new Error(`GitHub API ${res.status}: ${detail}`);
  }
  return res.status === 204 ? null : res.json();
}

async function validateAccess(token) {
  await githubRequest(`/repos/${OWNER}/${REPO}`, token, { method: 'GET' });
}

async function uploadBatch(files, token) {
  const ref = await githubRequest(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, token, { method: 'GET' });
  const parentSha = ref.object.sha;
  const parentCommit = await githubRequest(`/repos/${OWNER}/${REPO}/git/commits/${parentSha}`, token, { method: 'GET' });
  const baseTreeSha = parentCommit.tree.sha;

  const treeEntries = [];
  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    setProgress(45 + (i / files.length) * 35, `GitHub에 저장 중 ${i + 1}/${files.length} · ${item.name}`);
    const base64 = await blobToBase64(item.blob);
    const createdBlob = await githubRequest(`/repos/${OWNER}/${REPO}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content: base64, encoding: 'base64' })
    });
    treeEntries.push({ path: item.path, mode: '100644', type: 'blob', sha: createdBlob.sha });
  }

  setProgress(82, '파일 트리를 생성하고 있습니다…');
  const tree = await githubRequest(`/repos/${OWNER}/${REPO}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
  });

  setProgress(88, '하나의 커밋으로 묶고 있습니다…');
  const commit = await githubRequest(`/repos/${OWNER}/${REPO}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: `Upload ${files.length} optimized image${files.length > 1 ? 's' : ''}`,
      tree: tree.sha,
      parents: [parentSha]
    })
  });

  setProgress(94, 'main 브랜치에 반영하고 있습니다…');
  await githubRequest(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return commit.sha;
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
  setTimeout(() => copyBtn.textContent = old, 1200);
});

uploadBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) return;

  const token = tokenInput.value.trim();
  const folder = slugify(projectInput.value, 'uncategorized');
  if (!token) {
    alert('GitHub Fine-grained PAT를 입력해주세요. 토큰은 페이지에 저장되지 않습니다.');
    tokenInput.focus();
    return;
  }

  uploadBtn.disabled = true;
  clearBtn.disabled = true;
  setStatus('WORKING');
  convertedFiles = [];
  uploadedItems = [];
  resultPanel.hidden = true;

  try {
    setProgress(3, 'GitHub 접근 권한을 확인하고 있습니다…');
    await validateAccess(token);

    for (let i = 0; i < selectedFiles.length; i++) {
      setProgress(8 + (i / selectedFiles.length) * 34, `WebP 변환 중 ${i + 1}/${selectedFiles.length} · ${selectedFiles[i].name}`);
      const converted = await convertToWebP(selectedFiles[i], i, folder);
      convertedFiles.push(converted);
      updateStats();
    }

    setProgress(44, `변환 완료 · ${formatBytes(convertedFiles.reduce((a, f) => a + f.blob.size, 0))}`);
    const commitSha = await uploadBatch(convertedFiles, token);
    uploadedItems = buildUrls(convertedFiles);

    setProgress(100, `업로드 완료 · commit ${commitSha.slice(0, 7)}`);
    setStatus('DONE');
    renderResult();
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    setProgress(0, error.message);
    alert(`업로드에 실패했습니다.\n\n${error.message}\n\n토큰이 이 저장소의 Contents Read/Write 권한을 갖고 있는지 확인해주세요.`);
  } finally {
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
  }
});

renderQueue();
