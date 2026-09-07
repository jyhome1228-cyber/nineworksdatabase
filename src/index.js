function cleanSegment(value, fallback = 'uploads') {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[-_/]+|[-_/]+$/g, '');
  return cleaned || fallback;
}

function cleanFileName(value) {
  const base = String(value || 'image')
    .replace(/\.[^/.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'image';
}

function objectUrl(origin, key) {
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${origin}/cdn/${encoded}`;
}

async function uploadImage(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  if (origin && origin !== url.origin) {
    return Response.json({ ok: false, message: 'Cross-origin upload blocked.' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const folder = cleanSegment(form.get('folder') || 'uncategorized', 'uncategorized');
  const originalName = String(form.get('name') || file?.name || 'image.webp');

  if (!(file instanceof File)) {
    return Response.json({ ok: false, message: 'Image file is required.' }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ ok: false, message: 'Image is too large. Maximum is 10 MB.' }, { status: 413 });
  }

  if (!['image/webp', 'image/jpeg', 'image/png'].includes(file.type)) {
    return Response.json({ ok: false, message: 'Only JPG, PNG and WEBP are allowed.' }, { status: 415 });
  }

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
  const random = crypto.randomUUID().slice(0, 8);
  const key = `${folder}/${stamp}-${cleanFileName(originalName)}-${random}.webp`;

  await env.IMAGE_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: { originalName }
  });

  return Response.json({
    ok: true,
    key,
    folder,
    fileName: key.split('/').pop(),
    cdnUrl: objectUrl(url.origin, key)
  });
}

async function listFolders(env) {
  const folders = new Set(['uncategorized']);
  let cursor;

  do {
    const page = await env.IMAGE_BUCKET.list({ delimiter: '/', cursor, limit: 1000 });
    for (const prefix of page.delimitedPrefixes || []) {
      const folder = prefix.replace(/\/$/, '');
      if (folder) folders.add(folder);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return Response.json({
    ok: true,
    folders: [...folders].sort((a, b) => {
      if (a === 'uncategorized') return -1;
      if (b === 'uncategorized') return 1;
      return a.localeCompare(b);
    })
  });
}

async function listAssets(request, env) {
  const url = new URL(request.url);
  const folder = cleanSegment(url.searchParams.get('folder') || 'uncategorized', 'uncategorized');
  const cursor = url.searchParams.get('cursor') || undefined;
  const requestedLimit = Number(url.searchParams.get('limit') || 100);
  const limit = Math.max(1, Math.min(1000, Number.isFinite(requestedLimit) ? requestedLimit : 100));
  const prefix = `${folder}/`;

  const page = await env.IMAGE_BUCKET.list({
    prefix,
    cursor,
    limit,
    include: ['httpMetadata', 'customMetadata']
  });

  const items = (page.objects || []).map((object) => ({
    key: object.key,
    folder,
    fileName: object.key.slice(prefix.length),
    size: object.size || 0,
    uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : object.uploaded || null,
    etag: object.httpEtag || object.etag || null,
    originalName: object.customMetadata?.originalName || null,
    cdnUrl: objectUrl(url.origin, object.key)
  }));

  return Response.json({
    ok: true,
    folder,
    items,
    truncated: Boolean(page.truncated),
    cursor: page.truncated ? page.cursor : null
  });
}

async function serveImage(request, env) {
  const url = new URL(request.url);
  const encodedKey = url.pathname.replace(/^\/cdn\//, '');
  if (!encodedKey) return new Response('Not found', { status: 404 });

  const key = encodedKey.split('/').map(decodeURIComponent).join('/');
  const object = await env.IMAGE_BUCKET.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');

  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/upload' && request.method === 'POST') {
      return uploadImage(request, env);
    }

    if (url.pathname === '/api/folders' && request.method === 'GET') {
      return listFolders(env);
    }

    if (url.pathname === '/api/assets' && request.method === 'GET') {
      return listAssets(request, env);
    }

    if (url.pathname.startsWith('/cdn/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveImage(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ ok: false, message: 'Not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
