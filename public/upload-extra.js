(() => {
  const newTaskBtn = document.querySelector('#newTaskBtn');
  const clearBtn = document.querySelector('#clearBtn');
  const dropzone = document.querySelector('#dropzone');
  if (!newTaskBtn || !clearBtn || !dropzone) return;

  newTaskBtn.addEventListener('click', () => {
    clearBtn.click();
    requestAnimationFrame(() => {
      dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();
