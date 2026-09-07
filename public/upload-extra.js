(() => {
  const newTaskBtn = document.querySelector('#newTaskBtn');
  const clearBtn = document.querySelector('#clearBtn');
  const dropzone = document.querySelector('#dropzone');
  const maxWidth = document.querySelector('#maxWidth');

  // Migrate the old 2400px default once. Users can still choose a smaller size later.
  if (maxWidth) {
    const MIGRATION_KEY = 'nineworks_3000_default_migrated_v1';
    try {
      if (localStorage.getItem(MIGRATION_KEY) !== '1') {
        maxWidth.value = '3000';
        const settingsKey = 'nineworks_asset_settings_v2';
        const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
        saved.maxWidth = '3000';
        localStorage.setItem(settingsKey, JSON.stringify(saved));
        localStorage.setItem(MIGRATION_KEY, '1');
      }
    } catch {
      maxWidth.value = '3000';
    }

    maxWidth.addEventListener('change', () => {
      const value = Number(maxWidth.value) || 3000;
      if (value > 3000) maxWidth.value = '3000';
    });
  }

  if (!newTaskBtn || !clearBtn || !dropzone) return;

  newTaskBtn.addEventListener('click', () => {
    clearBtn.click();
    requestAnimationFrame(() => {
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();
