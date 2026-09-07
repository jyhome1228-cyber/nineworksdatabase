const UNCATEGORIZED = 'uncategorized';
const PAGE_SIZE = 100;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const folderSelect = $('#libraryFolder');
const searchInput = $('#librarySearch');
const refreshBtn = $('#refreshBtn');
const statusBadge = $('#statusBadge');
const assetCount = $('#assetCount');
const assetSize = $('#assetSize');
const folderLabel = $('#folderLabel');
const assetSummary = $('#assetSummary');
const libraryGrid = $('#libraryGrid');
const emptyLibrary = $('#emptyLibrary');
const loadMoreBtn = $('#loadMoreBtn');
const libraryCode = $('#libraryCode');
const copyFolderBtn = $('#copyFolderBtn');

let activeTab = 'url';
let allItems = [];
let nextCursor = null;
let loading = false;

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb < 0.1) return `${Math.round(kb)} KB`;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
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

function currentFolder() {
  return folderSelect.value || UNCATEGORIZED;
}

function displayFolder(value) {
  return value === UNCATEGORIZED ? '미분류' : value;
}

function filteredItems() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return allItems;
  return allItems.filter((item) => item.fileName.toLowerCase().includes(query) || item.key.toLowerCase().includes(query));
}

function codeFor(items, type) {
  if (type === 'html') {
    return items.map((item) => `<img src="${item.cdnUrl}" alt="" loading="lazy">`).join('\n');
  }
  if (type === 'css') {
    return items.map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  background-image: url("${item.cdnUrl}");\n}`).join('\n\n');
  }
  return items.map((item) => item.cdnUrl).join('\n');
}

function updateCode() {
  const items = filteredItems();
  libraryCode.textContent = items.length ? codeFor(items, activeTab) : '현재 조건에 맞는 이미지가 없습니다.';
  copyFolderBtn.disabled = items.length === 0;
}

function updateStats() {
  const items = filteredItems();
  const total = items.reduce((sum, item) => sum + (item.size || 0), 0);
  assetCount.textContent = items.length;
  assetSize.textContent = formatBytes(total);
  folderLabel.textContent = displayFolder(currentFolder());
  assetSummary.textContent = searchInput.value.trim()
    ? `${displayFolder(currentFolder())} · 검색 결과 ${items.length}개`
    : `${displayFolder(currentFolder())} · ${items.length}개 이미지`;
}

function flashButton(button, message = '복사됨') {
  const old = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = old; }, 1000);
}

function renderGrid() {
  const items = filteredItems();
  libraryGrid.innerHTML = '';
  emptyLibrary.hidden = items.length !== 0 || loading;

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'library-card';
    card.innerHTML = `
      <div class="library-card-image">
        <img src="${item.cdnUrl}" alt="" loading="lazy">
      </div>
      <div class="library-card-body">
        <strong class="library-card-title" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</strong>
        <div class="library-card-meta">
          <span>${formatBytes(item.size)}</span>
          <span>${escapeHtml(formatDate(item.uploaded))}</span>
        </div>
        <div class="url-line" title="${escapeHtml(item.cdnUrl)}">${escapeHtml(item.cdnUrl)}</div>
        <div class="card-actions">
          <button class="mini copy-url" type="button">URL 복사</button>
          <button class="mini copy-html" type="button">HTML 복사</button>
          <button class="mini copy-css" type="button">CSS 복사</button>
          <a class="mini" href="${item.cdnUrl}" target="_blank" rel="noreferrer">열기</a>
        </div>
      </div>`;

    card.querySelector('.copy-url').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(item.cdnUrl);
      flashButton(event.currentTarget);
    });

    card.querySelector('.copy-html').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`<img src="${item.cdnUrl}" alt="" loading="lazy">`);
      flashButton(event.currentTarget);
    });

    card.querySelector('.copy-css').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(`background-image: url("${item.cdnUrl}");`);
      flashButton(event.currentTarget);
    });

    libraryGrid.appendChild(card);
  });

  updateStats();
  updateCode();
  loadMoreBtn.hidden = !nextCursor || searchInput.value.trim().length > 0;
}

async function loadFolders() {
  const preferred = new URLSearchParams(location.search).get('folder') || currentFolder();
  try {
    const response = await fetch('/api/folders', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.folders)) return;

    folderSelect.innerHTML = '';
    data.folders.forEach((folder) => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = displayFolder(folder);
      folderSelect.appendChild(option);
    });

    if ([...folderSelect.options].some((option) => option.value === preferred)) {
      folderSelect.value = preferred;
    }
  } catch {}
}

async function loadAssets({ append = false } = {}) {
  if (loading) return;
  loading = true;
  setStatus('LOADING');
  refreshBtn.disabled = true;
  loadMoreBtn.disabled = true;

  if (!append) {
    allItems = [];
    nextCursor = null;
    libraryGrid.innerHTML = '<div class="library-loading">이미지를 불러오는 중입니다.</div>';
    emptyLibrary.hidden = true;
  }

  try {
    const params = new URLSearchParams({ folder: currentFolder(), limit: String(PAGE_SIZE) });
    if (append && nextCursor) params.set('cursor', nextCursor);

    const response = await fetch(`/api/assets?${params.toString()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '라이브러리를 불러오지 못했습니다.');

    const incoming = Array.isArray(data.items) ? data.items : [];
    allItems = append ? [...allItems, ...incoming] : incoming;
    nextCursor = data.cursor || null;
    setStatus('READY');
    renderGrid();
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    assetSummary.textContent = error.message;
    libraryGrid.innerHTML = '';
    emptyLibrary.hidden = false;
  } finally {
    loading = false;
    refreshBtn.disabled = false;
    loadMoreBtn.disabled = false;
  }
}

folderSelect.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('folder', currentFolder());
  history.replaceState({}, '', url);
  searchInput.value = '';
  loadAssets();
});

searchInput.addEventListener('input', renderGrid);
refreshBtn.addEventListener('click', () => loadAssets());
loadMoreBtn.addEventListener('click', () => loadAssets({ append: true }));

$$('.tab').forEach((tab) => tab.addEventListener('click', () => {
  $$('.tab').forEach((item) => {
    item.classList.remove('active');
    item.setAttribute('aria-selected', 'false');
  });
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  activeTab = tab.dataset.tab;
  updateCode();
}));

copyFolderBtn.addEventListener('click', async () => {
  const items = filteredItems();
  if (!items.length) return;
  await navigator.clipboard.writeText(codeFor(items, activeTab));
  flashButton(copyFolderBtn);
});

(async function init() {
  await loadFolders();
  await loadAssets();
})();
