const UNCATEGORIZED = 'uncategorized';
const PAGE_SIZE = 100;

const $ = (s) => document.querySelector(s);

const projectIndex = $('#projectIndex');
const searchInput = $('#librarySearch');
const refreshBtn = $('#refreshBtn');
const statusBadge = $('#statusBadge');
const assetCount = $('#assetCount');
const assetSize = $('#assetSize');
const folderLabel = $('#folderLabel');
const assetSummary = $('#assetSummary');
const codeList = $('#codeList');
const emptyLibrary = $('#emptyLibrary');
const loadMoreBtn = $('#loadMoreBtn');
const copyAllUrlBtn = $('#copyAllUrlBtn');
const copyAllHtmlBtn = $('#copyAllHtmlBtn');
const copyAllCssBtn = $('#copyAllCssBtn');
const selectAllCheckbox = $('#selectAllCheckbox');
const selectedCount = $('#selectedCount');
const clearSelectionBtn = $('#clearSelectionBtn');
const deleteSelectedBtn = $('#deleteSelectedBtn');
const deleteModal = $('#deleteModal');
const deleteSummary = $('#deleteSummary');
const cancelDeleteBtn = $('#cancelDeleteBtn');
const confirmDeleteBtn = $('#confirmDeleteBtn');
const toast = $('#toast');

let folders = [UNCATEGORIZED];
let currentFolderName = UNCATEGORIZED;
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
  return mb < 0.1 ? `${Math.round(kb)} KB` : `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
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

function displayFolder(value) {
  return value === UNCATEGORIZED ? '미분류' : value;
}

function itemName(item) {
  return item.originalName || item.fileName || item.key.split('/').pop();
}

function setStatus(text) {
  statusBadge.textContent = text.toUpperCase();
}

function filteredItems() {
  const query = searchInput.value.trim().toLowerCase();
  const items = query
    ? allItems.filter((item) => itemName(item).toLowerCase().includes(query) || item.cdnUrl.toLowerCase().includes(query))
    : allItems;
  return [...items].sort((a, b) => new Date(b.uploaded || 0) - new Date(a.uploaded || 0));
}

function codeForItem(item, type) {
  if (type === 'html') return `<img src="${item.cdnUrl}" alt="" loading="lazy">`;
  if (type === 'css') return `background-image: url("${item.cdnUrl}");`;
  return item.cdnUrl;
}

function codeForItems(items, type) {
  if (type === 'css') {
    return items.map((item, index) => `.image-${String(index + 1).padStart(2, '0')} {\n  ${codeForItem(item, 'css')}\n}`).join('\n\n');
  }
  return items.map((item) => codeForItem(item, type)).join('\n');
}

function flashButton(button, message = '복사됨') {
  const original = button.textContent;
  button.textContent = message;
  setTimeout(() => { button.textContent = original; }, 900);
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
  }, 2400);
}

function updateFolderUrl(folder) {
  const url = new URL(location.href);
  url.searchParams.set('folder', folder);
  history.replaceState({}, '', url);
}

function renderProjectIndex() {
  projectIndex.innerHTML = '';
  folders.forEach((folder, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `project-index-item${folder === currentFolderName ? ' active' : ''}`;
    button.dataset.folder = folder;
    button.innerHTML = `
      <span class="project-index-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="project-index-name">${escapeHtml(displayFolder(folder))}</span>`;
    button.addEventListener('click', async () => {
      if (folder === currentFolderName) return;
      currentFolderName = folder;
      updateFolderUrl(folder);
      searchInput.value = '';
      selectedKeys.clear();
      renderProjectIndex();
      await loadAssets();
    });
    projectIndex.appendChild(button);
  });
}

async function loadFolders(preferred) {
  const requested = preferred || new URLSearchParams(location.search).get('folder') || currentFolderName;
  try {
    const response = await fetch('/api/folders', { cache: 'no-store' });
    const data = await response.json();
    if (response.ok && Array.isArray(data.folders) && data.folders.length) {
      folders = data.folders;
    } else {
      folders = [UNCATEGORIZED];
    }
  } catch {
    folders = [UNCATEGORIZED];
  }

  currentFolderName = folders.includes(requested) ? requested : (folders.includes(UNCATEGORIZED) ? UNCATEGORIZED : folders[0]);
  updateFolderUrl(currentFolderName);
  renderProjectIndex();
  return currentFolderName;
}

function updateStats() {
  const items = filteredItems();
  assetCount.textContent = items.length;
  assetSize.textContent = formatBytes(items.reduce((sum, item) => sum + (item.size || 0), 0));
  folderLabel.textContent = displayFolder(currentFolderName);
  assetSummary.textContent = searchInput.value.trim()
    ? `${items.length}개 검색됨`
    : `${items.length}개의 코드 기록`;
}

function updateSelectionUI() {
  const visible = filteredItems();
  const selectedVisible = visible.filter((item) => selectedKeys.has(item.key)).length;
  const allSelected = visible.length > 0 && selectedVisible === visible.length;

  selectedCount.textContent = `${selectedKeys.size}개 선택`;
  selectAllCheckbox.checked = allSelected;
  selectAllCheckbox.disabled = visible.length === 0;
  clearSelectionBtn.disabled = selectedKeys.size === 0;
  deleteSelectedBtn.disabled = selectedKeys.size === 0;
}

function renderList() {
  const items = filteredItems();
  const known = new Set(allItems.map((item) => item.key));
  selectedKeys = new Set([...selectedKeys].filter((key) => known.has(key)));

  codeList.innerHTML = '';
  emptyLibrary.hidden = items.length !== 0 || loading;

  items.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = `code-row${selectedKeys.has(item.key) ? ' selected' : ''}`;
    row.dataset.key = item.key;
    const name = itemName(item);

    row.innerHTML = `
      <label class="row-select">
        <input class="row-checkbox" type="checkbox" ${selectedKeys.has(item.key) ? 'checked' : ''} aria-label="${escapeHtml(name)} 선택">
        <span aria-hidden="true"></span>
      </label>
      <div class="row-index">${String(index + 1).padStart(3, '0')}</div>
      <div class="row-main">
        <div class="row-title-line">
          <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
          <span>${escapeHtml(formatDate(item.uploaded))}</span>
        </div>
        <code class="row-code" title="${escapeHtml(item.cdnUrl)}">${escapeHtml(item.cdnUrl)}</code>
        <div class="row-meta">${formatBytes(item.size)} · ${escapeHtml(displayFolder(currentFolderName))}</div>
      </div>
      <div class="row-actions">
        <button class="row-action copy-url" type="button">URL</button>
        <button class="row-action copy-html" type="button">HTML</button>
        <button class="row-action copy-css" type="button">CSS</button>
        <a class="row-action" href="${item.cdnUrl}" target="_blank" rel="noreferrer">열기</a>
        <button class="row-action danger delete-one" type="button">삭제</button>
      </div>`;

    const checkbox = row.querySelector('.row-checkbox');
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedKeys.add(item.key);
      else selectedKeys.delete(item.key);
      row.classList.toggle('selected', checkbox.checked);
      updateSelectionUI();
    });

    row.querySelector('.copy-url').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(codeForItem(item, 'url'));
      flashButton(event.currentTarget);
    });
    row.querySelector('.copy-html').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(codeForItem(item, 'html'));
      flashButton(event.currentTarget);
    });
    row.querySelector('.copy-css').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(codeForItem(item, 'css'));
      flashButton(event.currentTarget);
    });
    row.querySelector('.delete-one').addEventListener('click', (event) => {
      requestDelete([item.key], name, event.currentTarget);
    });

    codeList.appendChild(row);
  });

  updateStats();
  updateSelectionUI();
  loadMoreBtn.hidden = !nextCursor || searchInput.value.trim().length > 0;

  const hasItems = items.length > 0;
  [copyAllUrlBtn, copyAllHtmlBtn, copyAllCssBtn].forEach((button) => { button.disabled = !hasItems; });
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
    codeList.innerHTML = '<div class="library-loading">코드 기록을 불러오는 중입니다.</div>';
    emptyLibrary.hidden = true;
  }

  try {
    const params = new URLSearchParams({ folder: currentFolderName, limit: String(PAGE_SIZE) });
    if (append && nextCursor) params.set('cursor', nextCursor);
    const response = await fetch(`/api/assets?${params.toString()}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '코드 기록을 불러오지 못했습니다.');

    const incoming = Array.isArray(data.items) ? data.items : [];
    allItems = append ? [...allItems, ...incoming] : incoming;
    nextCursor = data.cursor || null;
    setStatus('READY');
  } catch (error) {
    console.error(error);
    allItems = [];
    nextCursor = null;
    setStatus('ERROR');
    showToast(error.message, 'error');
  } finally {
    loading = false;
    refreshBtn.disabled = false;
    loadMoreBtn.disabled = false;
    renderList();
  }
}

function requestDelete(keys, label, trigger) {
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  if (!uniqueKeys.length) return;
  pendingDeleteKeys = uniqueKeys;
  lastFocusedElement = trigger || document.activeElement;
  deleteSummary.textContent = uniqueKeys.length === 1 ? label : `${uniqueKeys.length}개 기록`;
  confirmDeleteBtn.textContent = uniqueKeys.length === 1 ? '삭제' : `${uniqueKeys.length}개 삭제`;
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
    if (!response.ok) throw new Error(data.message || '삭제하지 못했습니다.');

    selectedKeys.clear();
    closeDeleteModal();
    showToast(`${data.deleted || keys.length}개 기록이 삭제되었습니다.`);
    const previousFolder = currentFolderName;
    await loadFolders(previousFolder);
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

function bindCopyAll(button, type) {
  button.addEventListener('click', async () => {
    const items = filteredItems();
    if (!items.length) return;
    await navigator.clipboard.writeText(codeForItems(items, type));
    flashButton(button);
  });
}

searchInput.addEventListener('input', () => {
  selectedKeys.clear();
  renderList();
});

refreshBtn.addEventListener('click', async () => {
  selectedKeys.clear();
  await loadFolders(currentFolderName);
  await loadAssets();
});

loadMoreBtn.addEventListener('click', () => loadAssets({ append: true }));

selectAllCheckbox.addEventListener('change', () => {
  if (selectAllCheckbox.checked) filteredItems().forEach((item) => selectedKeys.add(item.key));
  else filteredItems().forEach((item) => selectedKeys.delete(item.key));
  renderList();
});

clearSelectionBtn.addEventListener('click', () => {
  selectedKeys.clear();
  renderList();
});

deleteSelectedBtn.addEventListener('click', (event) => {
  requestDelete([...selectedKeys], `${selectedKeys.size}개 기록`, event.currentTarget);
});

cancelDeleteBtn.addEventListener('click', closeDeleteModal);
confirmDeleteBtn.addEventListener('click', performDelete);
deleteModal.addEventListener('click', (event) => {
  if (event.target === deleteModal) closeDeleteModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !deleteModal.hidden) closeDeleteModal();
});

bindCopyAll(copyAllUrlBtn, 'url');
bindCopyAll(copyAllHtmlBtn, 'html');
bindCopyAll(copyAllCssBtn, 'css');

(async function init() {
  await loadFolders();
  await loadAssets();
})();