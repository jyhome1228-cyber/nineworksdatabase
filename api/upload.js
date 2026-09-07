const OWNER = 'jyhome1228-cyber';
const REPO = 'nineworksdatabase';
const BRANCH = 'main';
const ALLOWED_ORIGINS = new Set([
  'https://jyhome1228-cyber.github.io',
  'https://nineworksdatabase.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin) || origin.endsWith('.vercel.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Access-Code');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, status, data) {
  res.status(status).json(data);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function gh(path, token, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body.message || JSON.stringify(body);
    } catch {
      detail = await response.text();
    }
    throw new Error(`GitHub API ${response.status}: ${detail}`);
  }

  return response.status === 204 ? null : response.json();
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 20) {
    throw new Error('한 요청에는 1~20개의 파일만 전송할 수 있습니다.');
  }

  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      throw new Error('잘못된 파일 데이터입니다.');
    }
    if (!/^images\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/i.test(file.path)) {
      throw new Error(`허용되지 않은 저장 경로입니다: ${file.path}`);
    }
    if (file.content.length > 3_600_000) {
      throw new Error(`${file.path} 파일이 업로드 제한보다 큽니다.`);
    }
  }
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const githubToken = process.env.GITHUB_IMAGE_TOKEN;
  const accessCode = process.env.NINEWORKS_ACCESS_CODE;

  if (!githubToken || !accessCode) {
    return json(res, 503, {
      ok: false,
      code: 'SERVER_NOT_CONFIGURED',
      message: '업로드 서버의 비밀키 설정이 아직 완료되지 않았습니다.'
    });
  }

  const suppliedCode = String(req.headers['x-access-code'] || '');
  const authorized = safeEqual(suppliedCode, accessCode);

  if (req.method === 'GET') {
    if (!authorized) return json(res, 401, { ok: false, code: 'LOCKED' });
    return json(res, 200, { ok: true, owner: OWNER, repo: REPO, branch: BRANCH });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return json(res, 405, { ok: false, message: 'Method not allowed' });
  }

  if (!authorized) return json(res, 401, { ok: false, code: 'INVALID_ACCESS_CODE', message: '관리자 코드가 올바르지 않습니다.' });

  try {
    const files = req.body?.files;
    validateFiles(files);

    const ref = await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, githubToken, { method: 'GET' });
    const parentSha = ref.object.sha;
    const parentCommit = await gh(`/repos/${OWNER}/${REPO}/git/commits/${parentSha}`, githubToken, { method: 'GET' });
    const treeEntries = [];

    for (const file of files) {
      const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs`, githubToken, {
        method: 'POST',
        body: JSON.stringify({ content: file.content, encoding: 'base64' })
      });
      treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const tree = await gh(`/repos/${OWNER}/${REPO}/git/trees`, githubToken, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries })
    });

    const commit = await gh(`/repos/${OWNER}/${REPO}/git/commits`, githubToken, {
      method: 'POST',
      body: JSON.stringify({
        message: `Upload ${files.length} optimized image${files.length === 1 ? '' : 's'} via Image Database`,
        tree: tree.sha,
        parents: [parentSha]
      })
    });

    await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, githubToken, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false })
    });

    return json(res, 200, {
      ok: true,
      commit: commit.sha,
      files: files.map((file) => ({ path: file.path }))
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { ok: false, message: error.message || 'Upload failed' });
  }
};
