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
const selectedCount = $('#selectedCount');
const selectAllBtn = $('#selectAllBtn');
const clearSelectionBtn = $('#clearSelectionBtn');
const deleteSelectedBtn = $('#deleteSelectedBtn');
const deleteModal = $('#deleteModal');
const deleteSummary = $('#deleteSummary');
const cancelDeleteBtn = $('#cancelDeleteBtn');
const confirmDeleteBtn = $('#confirmDeleteBtn');
const toast = $('#toast');

let activeTab = 'url';
let allItems = [];
let nextCursor = null;
let loading = false;
let selectedKeys = new Set();
let pendingDeleteKeys = [];
let lastFocusedElement = null;
let toastTimer = null;

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

function updateSelectionUI() {
  const visible = filteredItems();
  const visibleKeys = visible.map((item) => item.key);
  const selectedVisible = visibleKeys.filter((key) => selectedKeys.has(key)).length;
  const allVisibleSelected = visible.length > 0 && selectedVisible === visible.length;

  selectedCount.textContent = `${selectedKeys.size}개 선택`;
  clearSelectionBtn.disabled = selectedKeys.size === 0;
  deleteSelectedBtn.disabled = selectedKeys.size === 0;
  selectAllBtn.disabled = visible.length === 0 || allVisibleSelected;
  selectAllBtn.textContent = allVisibleSelected ? '현재 목록 선택됨' : '현재 목록 전체 선택';
}

function flashButton(button, message = '복사됨') {
  const old = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = old; }, 1000);
}

function showToast(message, kind = 'success') {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 180);
  }, 2600);
}

function renderGrid() {
  const items = filteredItems();
  const existingKeys = new Set(allItems.map((item) => item.key));
  selectedKeys = new Set([...selectedKeys].filter((key) => existingKeys.has(key)));

  libraryGrid.innerHTML = '';
  emptyLibrary.hidden = items.length !== 0 || loading;

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = `library-card${selectedKeys.has(item.key) ? ' selected' : ''}`;
    card.dataset.key = item.key;
    card.innerHTML = `
      <div class="library-card-image">
        <label class="asset-select" title="선택">
          <input class="asset-checkbox" type="checkbox" ${selectedKeys.has(item.key) ? 'checked' : ''} aria-label="${escapeHtml(item.fileName)} 선택">
          <span aria-hidden="true"></span>
        </label>
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
          <button class="mini mini-critical delete-one" type="button">삭제</button>
        </div>
      </div>`;

    const checkbox = card.querySelector('.asset-checkbox');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedKeys.add(item.key);
      else selectedKeys.delete(item.key);
      card.classList.toggle('selected', checkbox.checked);
      updateSelectionUI();
    });

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

    card.querySelector('.delete-one').addEventListener('click', (event) => {
      requestDelete([item.key], item.fileName, event.currentTarget);
    });

    libraryGrid.appendChild(card);
  });

  updateStats();
  updateCode();
  updateSelectionUI();
  loadMoreBtn.hidden = !nextCursor || searchInput.value.trim().length > 0;
}

function updateFolderUrl(folder) {
  const url = new URL(location.href);
  url.searchParams.set('folder', folder);
  history.replaceState({}, '', url);
}

async function loadFolders(preferred) {
  const requested = preferred || new URLSearchParams(location.search).get('folder') || currentFolder();
  try {
    const response = await fetch('/api/folders', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.folders)) return currentFolder();

    folderSelect.innerHTML = '';
    data.folders.forEach((folder) => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = displayFolder(folder);
      folderSelect.appendChild(option);
    });

    const hasRequested = [...folderSelect.options].some((option) => option.value === requested);
    folderSelect.value = hasRequested ? requested : UNCATEGORIZED;
    updateFolderUrl(folderSelect.value);
    return folderSelect.value;
  } catch {
    return currentFolder();
  }
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
    selectedKeys.clear();
    libraryGrid.innerHTML = '<div class="library-loading">이미지를 불러오는 중입니다.</div>';
    emptyLibrary.hidden = true;
    updateSelectionUI();
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
  } catch (error) {
    console.error(error);
    setStatus('ERROR');
    assetSummary.textContent = error.message;
    allItems = [];
    nextCursor = null;
    showToast(error.message, 'error');
  } finally {
    loading = false;
    refreshBtn.disabled = false;
    loadMoreBtn.disabled = false;
    renderGrid();
  }
}

function requestDelete(keys, label, trigger) {
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  if (!uniqueKeys.length) return;

  pendingDeleteKeys = uniqueKeys;
  lastFocusedElement = trigger || document.activeElement;
  deleteSummary.textContent = uniqueKeys.length === 1
    ? label || uniqueKeys[0].split('/').pop()
    : `${uniqueKeys.length}개 이미지가 선택되었습니다.`;
  confirmDeleteBtn.textContent = uniqueKeys.length === 1 ? '이미지 삭제' : `${uniqueKeys.length}개 삭제`;
  deleteModal.hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => cancelDeleteBtn.focus(), 20);
}

function closeDeleteModal() {
  pendingDeleteKeys = [];
  deleteModal.hidden = true;
  document.body.classList.remove('modal-open');
  confirmDeleteBtn.disabled = false;
  if (lastFocusedElement && document.contains(lastFocusedElement)) lastFocusedElement.focus();
  lastFocusedElement = null;
}

async function performDelete() {
  const keys = [...pendingDeleteKeys];
  if (!keys.length) return;

  confirmDeleteBtn.disabled = true;
  cancelDeleteBtn.disabled = true;
  setStatus('DELETING');

  try {
    const response = await fetch('/api/assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '이미지를 삭제하지 못했습니다.');

    selectedKeys.clear();
    closeDeleteModal();
    showToast(`${data.deleted || keys.length}개 이미지가 삭제되었습니다.`);

    const previousFolder = currentFolder();
    const targetFolder = await loadFolders(previousFolder);
    if (targetFolder !== previousFolder) searchInput.value = '';
    await loadAssets();
  } catch (error) {
    console.error(error);
    closeDeleteModal();
    setStatus('ERROR');
    showToast(error.message, 'error');
  } finally {
    confirmDeleteBtn.disabled = false;
    cancelDeleteBtn.disabled = false;
  }
}

folderSelect.addEventListener('change', () => {
  updateFolderUrl(currentFolder());
  searchInput.value = '';
  selectedKeys.clear();
  loadAssets();
});

searchInput.addEventListener('input', () => {
  selectedKeys.clear();
  renderGrid();
});

refreshBtn.addEventListener('click', () => {
  selectedKeys.clear();
  loadAssets();
});

loadMoreBtn.addEventListener('click', () => loadAssets({ append: true }));

selectAllBtn.addEventListener('click', () => {
  filteredItems().forEach((item) => selectedKeys.add(item.key));
  renderGrid();
});

clearSelectionBtn.addEventListener('click', () => {
  selectedKeys.clear();
  renderGrid();
});

deleteSelectedBtn.addEventListener('click', (event) => {
  requestDelete([...selectedKeys], `${selectedKeys.size}개 이미지`, event.currentTarget);
});

cancelDeleteBtn.addEventListener('click', closeDeleteModal);
confirmDeleteBtn.addEventListener('click', performDelete);

deleteModal.addEventListener('click', (event) => {
  if (event.target === deleteModal) closeDeleteModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !deleteModal.hidden) closeDeleteModal();
});

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
