(() => {
  const KEY = 'nineworks_asset_console_booted_v1';
  const params = new URLSearchParams(location.search);
  const force = params.get('boot') === '1';

  let alreadyBooted = false;
  try {
    alreadyBooted = sessionStorage.getItem(KEY) === '1';
  } catch {}

  if (alreadyBooted && !force) return;

  document.documentElement.classList.add('nw-boot-pending');

  const style = document.createElement('style');
  style.id = 'nw-boot-style';
  style.textContent = `
    html.nw-boot-pending, html.nw-boot-pending body { background:#fff !important; }
    html.nw-boot-pending body > * { visibility:hidden !important; }
    html.nw-boot-pending body > .nw-boot-screen { visibility:visible !important; }
    .nw-boot-screen {
      position:fixed; inset:0; z-index:99999; overflow:hidden;
      display:grid; grid-template-rows:auto 1fr auto;
      padding:24px 28px 22px; background:#fff; color:#111;
      font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;
      opacity:1; transition:opacity 280ms cubic-bezier(.2,.8,.2,1);
    }
    .nw-boot-screen.is-leaving { opacity:0; }
    .nw-boot-top {
      display:flex; align-items:center; justify-content:space-between; gap:20px;
      padding-bottom:14px; border-bottom:1px solid #111;
      font-size:10px; line-height:16px; letter-spacing:.08em; text-transform:uppercase;
    }
    .nw-boot-top strong { font-weight:700; }
    .nw-boot-status { display:inline-flex; align-items:center; gap:8px; }
    .nw-boot-status::before { content:""; width:7px; height:7px; border-radius:50%; background:#111; }
    .nw-boot-body { display:grid; align-content:center; width:min(920px,100%); min-height:0; }
    .nw-boot-title { margin:0 0 20px; font-size:12px; line-height:18px; font-weight:700; letter-spacing:.08em; }
    .nw-boot-log {
      min-height:300px; margin:0; overflow:hidden;
      font-size:12px; line-height:1.75; letter-spacing:-.01em;
    }
    .nw-boot-line { display:block; white-space:pre-wrap; word-break:break-word; }
    .nw-boot-line::before { content:"> "; color:#888; }
    .nw-boot-line.ok::before { content:"✓ "; color:#111; }
    .nw-boot-line.final { margin-top:12px; font-weight:700; }
    .nw-boot-cursor { display:inline-block; width:7px; height:13px; margin-left:4px; vertical-align:-2px; background:#111; animation:nwBootBlink .55s steps(1,end) infinite; }
    .nw-boot-bottom {
      display:grid; grid-template-columns:1fr auto; gap:20px; align-items:end;
      padding-top:14px; border-top:1px solid #111; color:#777;
      font-size:9px; line-height:14px; letter-spacing:.08em; text-transform:uppercase;
    }
    .nw-boot-progress { height:2px; margin-top:9px; background:#e5e5e2; overflow:hidden; }
    .nw-boot-progress span { display:block; width:0; height:100%; background:#111; transition:width 120ms linear; }
    @keyframes nwBootBlink { 0%,48%{opacity:1} 49%,100%{opacity:0} }
    @media (max-width:640px) {
      .nw-boot-screen { padding:18px 16px; }
      .nw-boot-body { align-content:start; padding-top:18vh; }
      .nw-boot-log { min-height:280px; font-size:11px; line-height:1.7; }
      .nw-boot-bottom { grid-template-columns:1fr; }
    }
    @media (prefers-reduced-motion:reduce) {
      .nw-boot-screen { transition:none; }
      .nw-boot-cursor { animation:none; }
    }
  `;
  document.head.appendChild(style);

  const lines = [
    '[00.014] initializing nineworks asset console',
    '[00.082] runtime ............... cloudflare workers',
    '[00.156] storage ............... r2 object storage',
    '[00.238] bucket ................ nineworks-assets',
    '[00.341] binding ............... IMAGE_BUCKET',
    '[00.468] route ................. /cdn/*',
    '[00.594] encoder ............... webp pipeline ready',
    '[00.721] project index ......... scanning prefixes',
    '[00.884] library ............... object metadata loaded',
    '[01.032] edge cache ............ immutable',
    '[01.224] upload endpoint ....... /api/upload',
    '[01.412] asset endpoint ........ /api/assets',
    '[01.608] database connection ... online',
    '[01.822] permissions ........... read / write / delete'
  ];

  const createScreen = () => {
    const screen = document.createElement('div');
    screen.className = 'nw-boot-screen';
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.innerHTML = `
      <div class="nw-boot-top">
        <strong>NINEWORKS / ASSET SYSTEM</strong>
        <span class="nw-boot-status">BOOT SEQUENCE</span>
      </div>
      <div class="nw-boot-body">
        <p class="nw-boot-title">SYSTEM INITIALIZATION</p>
        <div class="nw-boot-log" id="nwBootLog"></div>
      </div>
      <div class="nw-boot-bottom">
        <div>
          <span id="nwBootPhase">Loading system modules...</span>
          <div class="nw-boot-progress"><span id="nwBootProgress"></span></div>
        </div>
        <span>R2 / WORKERS / EDGE CDN</span>
      </div>
    `;
    document.body.prepend(screen);
    return screen;
  };

  const waitForBody = (callback) => {
    if (document.body) callback();
    else document.addEventListener('DOMContentLoaded', callback, { once:true });
  };

  waitForBody(() => {
    const screen = createScreen();
    const log = screen.querySelector('#nwBootLog');
    const progress = screen.querySelector('#nwBootProgress');
    const phase = screen.querySelector('#nwBootPhase');
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();

    const appendTypedLine = (text, index) => new Promise((resolve) => {
      const row = document.createElement('span');
      row.className = 'nw-boot-line';
      log.appendChild(row);

      if (reduceMotion) {
        row.textContent = text;
        resolve();
        return;
      }

      let i = 0;
      const timer = setInterval(() => {
        row.textContent = text.slice(0, ++i);
        if (i >= text.length) {
          clearInterval(timer);
          resolve();
        }
      }, index < 4 ? 4 : 3);
    });

    (async () => {
      for (let i = 0; i < lines.length; i += 1) {
        await appendTypedLine(lines[i], i);
        progress.style.width = `${Math.round(((i + 1) / (lines.length + 1)) * 100)}%`;
        if (i === 4) phase.textContent = 'Mounting R2 storage...';
        if (i === 8) phase.textContent = 'Indexing project objects...';
        if (i === 11) phase.textContent = 'Validating API routes...';
        await new Promise((r) => setTimeout(r, reduceMotion ? 18 : 38));
      }

      const finalLine = document.createElement('span');
      finalLine.className = 'nw-boot-line ok final';
      finalLine.innerHTML = 'SYSTEM READY <span class="nw-boot-cursor" aria-hidden="true"></span>';
      log.appendChild(finalLine);
      phase.textContent = 'Initialization complete.';
      progress.style.width = '100%';

      const elapsed = performance.now() - start;
      const remaining = Math.max(450, 2850 - elapsed);
      await new Promise((r) => setTimeout(r, remaining));

      try { sessionStorage.setItem(KEY, '1'); } catch {}
      screen.classList.add('is-leaving');
      await new Promise((r) => setTimeout(r, reduceMotion ? 0 : 280));
      screen.remove();
      document.documentElement.classList.remove('nw-boot-pending');
    })();
  });
})();