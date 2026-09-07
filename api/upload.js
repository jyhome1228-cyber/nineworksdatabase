const OWNER = 'jyhome1228-cyber';
const REPO = 'nineworksdatabase';
const BRANCH = 'main';

const ALLOWED_ORIGINS = new Set([
  'https://jyhome1228-cyber.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function originAllowed(origin = '') {
  return ALLOWED_ORIGINS.has(origin) || /^https:\/\/nineworksdatabase(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
}

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (originAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function safeBaseName(name = 'image') {
  const base = String(name).replace(/\.[^/.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || 'image';
}

function uniqueName(originalName) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '-',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0')
  ].join('');
  const random = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${safeBaseName(originalName)}-${random}.webp`;
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const origin = req.headers.origin || '';
  if (!originAllowed(origin)) {
    return res.status(403).json({ ok: false, message: 'Origin not allowed' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const token = process.env.GITHUB_IMAGE_TOKEN;
  if (!token) {
    return res.status(503).json({ ok: false, message: 'GITHUB_IMAGE_TOKEN is not configured yet.' });
  }

  const { name, content } = req.body || {};
  if (typeof name !== 'string' || typeof content !== 'string' || !content.length) {
    return res.status(400).json({ ok: false, message: 'Invalid image payload.' });
  }

  // Roughly 1.6 MB binary after base64 overhead. Enough for this test utility.
  if (content.length > 2_200_000) {
    return res.status(413).json({ ok: false, message: 'Optimized image is too large. Lower max width or quality.' });
  }

  const fileName = uniqueName(name);
  const path = `images/test/${fileName}`;

  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload ${fileName} via image test`,
        content,
        branch: BRANCH
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        message: data.message || 'GitHub upload failed.'
      });
    }

    const cdnUrl = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${path}`;
    return res.status(200).json({
      ok: true,
      path,
      fileName,
      cdnUrl,
      commit: data.commit?.sha || null
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: error.message || 'Upload failed.' });
  }
};
