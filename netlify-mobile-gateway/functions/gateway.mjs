// Generated from the tested fixed-upstream gateway. No dependencies or credentials.
const gateway = (() => {
const UPSTREAM_ORIGIN = 'https://dingwei.3531679736.workers.dev';
const GATEWAY_REVISION = '2.8.0';
const MAX_JSON_BYTES = 32 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const SCHOOL_MAP_PATHS = new Map([
  ['csuft', '/maps/csuft-campus.jpg'],
  ['hunnu-nanyuan', '/maps/hunnu-nanyuan.jpg'],
  ['hunnu-xianjiahu', '/maps/hunnu-xianjiahu.jpg'],
  ['hunnu-erlb', '/maps/hunnu-erlb.jpg'],
  ['hunnu-taohuaping', '/maps/hunnu-taohuaping.jpg'],
  ['hunnu-zhanggongling', '/maps/hunnu-zhanggongling.jpg']
]);

const ROUTES = new Map([
  ['/health', { method: 'GET', query: [] }],
  ['/api/v1/schools', { method: 'GET', query: [] }],
  ['/api/v1/crowd', { method: 'GET', query: ['schoolId'], schoolQuery: true }],
  ['/api/v1/location', { method: 'POST', query: [] }],
  ['/api/v1/leave', { method: 'POST', query: [] }],
  ['/api/v3/weather', { method: 'GET', query: ['schoolId'], schoolQuery: true }],
  ['/api/v3/recommendation', { method: 'GET', query: ['schoolId', 'purpose'], schoolQuery: true }],
  ...[...SCHOOL_MAP_PATHS.values()].map(mapPath => [mapPath, { method: 'GET', query: ['v'] }]),
  ['/', { method: 'GET', query: [] }],
  ['/index.html', { method: 'GET', query: [] }]
]);

function publicHeaders(extra = {}) {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  });
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: publicHeaders({ 'Content-Type': 'application/json; charset=utf-8', ...extra })
  });
}

class GatewayError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function requestJson(request) {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength && Number(declaredLength) > MAX_JSON_BYTES) {
    throw new GatewayError('请求内容过大，最多允许 32 KB JSON', 413);
  }
  const contentType = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
    throw new GatewayError('请使用 application/json 发送请求', 415);
  }
  if (!request.body) throw new GatewayError('请求需要 JSON 内容', 400);
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new GatewayError('请求内容过大，最多允许 32 KB JSON', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('object required');
  } catch {
    throw new GatewayError('JSON 格式无效，请发送 JSON 对象', 400);
  }
  // Relay the original JSON, including precision and all supported upstream fields.
  return text;
}

function authorizeAnonymousWrite(body) {
  const data = JSON.parse(body);
  // Existing Android clients keep a random UUIDv4 private per installation.
  // It is a bearer capability scoped to that installation's own report; it is
  // never included in public crowd responses. No arbitrary report IDs allowed.
  if (data.schoolId !== 'csuft' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.anonymousId || '')) {
    throw new GatewayError('缺少有效的设备匿名凭据', 403);
  }
}

async function upstreamRequest(url, method, body) {
  const controller = new AbortController();
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new GatewayError('连接人流上游服务超时，请稍后重试'));
    }, UPSTREAM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      (async () => {
        const headers = new Headers({ Accept: 'application/json, text/html, image/jpeg' });
        if (body !== undefined) headers.set('Content-Type', 'application/json');
        const response = await fetch(url, {
          method, headers, body, signal: controller.signal, redirect: 'manual'
        });
        // Do not follow redirects to another server or expose such redirects to clients.
        if (response.status >= 300 && response.status < 400) {
          throw new GatewayError('上游服务返回了未允许的重定向');
        }
        const bytes = await response.arrayBuffer();
        return { response, bytes };
      })(),
      timedOut
    ]);
  } catch (error) {
    if (error instanceof GatewayError) throw error;
    throw new GatewayError('网关暂时无法连接人流上游服务，请稍后重试');
  } finally {
    clearTimeout(timer);
  }
}

function relay({ response, bytes }) {
  const headers = publicHeaders();
  for (const name of ['Content-Type', 'ETag', 'Last-Modified']) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.status === 204 ? null : bytes, {
    status: response.status, statusText: response.statusText, headers
  });
}

function parseUpstreamJson(bytes) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new GatewayError('上游服务返回的数据格式无效');
  }
}

function rewriteSchools(result, origin) {
  if (!result.response.ok) return relay(result);
  const data = parseUpstreamJson(result.bytes);
  if (!data || !Array.isArray(data.schools)) throw new GatewayError('上游学校数据格式无效');
  for (const school of data.schools) {
    const expectedMapPath = school && SCHOOL_MAP_PATHS.get(school.id);
    if (!expectedMapPath) throw new GatewayError('上游校园不在当前入口支持范围内');
    let mapUrl;
    try {
      mapUrl = new URL(school.mapUrl || school.mapPath, UPSTREAM_ORIGIN);
    } catch {
      throw new GatewayError('上游学校地图地址无效');
    }
    if (mapUrl.origin !== UPSTREAM_ORIGIN || mapUrl.username || mapUrl.password || mapUrl.hash ||
        mapUrl.pathname !== expectedMapPath ||
        [...mapUrl.searchParams.keys()].some(key => key !== 'v') || mapUrl.searchParams.getAll('v').length > 1) {
      throw new GatewayError('上游学校地图地址不在允许范围内');
    }
    school.mapUrl = `${origin}${mapUrl.pathname}${mapUrl.search}`;
  }
  return json(data, result.response.status);
}

async function health() {
  try {
    const result = await upstreamRequest(`${UPSTREAM_ORIGIN}/health`, 'GET');
    if (!result.response.ok) {
      throw new GatewayError(`人流上游服务返回 HTTP ${result.response.status}`);
    }
    const upstream = parseUpstreamJson(result.bytes);
    if (upstream?.ok !== true) throw new GatewayError('人流上游服务尚未就绪');
    return json({
      ok: true, service: 'campus-mobile-gateway', upstreamConnected: true,
      revision: upstream.revision ?? null, gatewayRevision: GATEWAY_REVISION, time: Date.now()
    });
  } catch (error) {
    return json({
      ok: false, service: 'campus-mobile-gateway', upstreamConnected: false,
      revision: null, gatewayRevision: GATEWAY_REVISION, error: error.message, time: Date.now()
    }, 503);
  }
}

function landing() {
  return new Response(`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>校园人流服务入口</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 24px;line-height:1.8;color:#13463c;background:#f5faf7}a{display:inline-block;margin:8px 12px 8px 0;padding:12px 20px;background:#075443;color:white;border-radius:12px;text-decoration:none}small{color:#526963}</style></head>
<body><h1>校园人流服务入口</h1><p>手机与电脑通过这个入口访问同一套校园人流数据，按所选校区读取校园图与人流。</p><p><a href="/health">检查手机连接状态</a><a href="${UPSTREAM_ORIGIN}/simulator?v=2.8">电脑模拟后台（原入口）</a></p><p>先检查连接状态：显示 <code>ok: true</code> 和 <code>upstreamConnected: true</code> 表示入口已连接人流服务。手机也能打开后，可将这个网站地址填入 App 的服务地址。</p><small>请在电脑原后台修改模拟人数和时段。本入口不开放模拟管理。湖南师范大学五个手绘校区仅展示模拟人流，不接收真实位置共享；每个校区独立读取，不混用其他校区数据。</small></body></html>`, {
    headers: publicHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
  });
}

return {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const route = ROUTES.get(url.pathname);
    // The destination is always the fixed origin; arbitrary paths and encoded
    // separators are rejected before any upstream request is made.
    if (!route || /[%\\]/.test(url.pathname)) return json({ error: '接口不存在' }, 404);
    if (url.search.length > 2048 || [...url.searchParams.keys()].some(key => !route.query.includes(key) || url.searchParams.getAll(key).length > 1)) {
      return json({ error: '请求包含未允许的查询参数' }, 400);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: publicHeaders() });
    }
    if (request.method !== route.method) {
      return json({ error: '请求方法不允许' }, 405, { Allow: `${route.method},OPTIONS` });
    }
    if (route.schoolQuery && !SCHOOL_MAP_PATHS.has(url.searchParams.get('schoolId'))) {
      return json({ error: '学校不存在' }, 404);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return landing();
    if (url.pathname === '/health') return health();
    try {
      const body = request.method === 'POST' ? await requestJson(request) : undefined;
      if (body !== undefined) authorizeAnonymousWrite(body);
      const result = await upstreamRequest(`${UPSTREAM_ORIGIN}${url.pathname}${url.search}`, route.method, body);
      if (url.pathname === '/api/v1/schools') return rewriteSchools(result, url.origin);
      return relay(result);
    } catch (error) {
      return json({ error: error.message || '网关请求失败' }, error.status || 502);
    }
  }
};

})();

// Netlify supplies the site's canonical URL. Never trust Host/Forwarded headers
// when rewriting map URLs returned to Android.
export default async function handler(request, context) {
  let origin;
  try {
    const site = new URL(context?.site?.url);
    if (site.protocol !== 'https:' || site.username || site.password) throw new Error();
    origin = site.origin;
  } catch {
    return Response.json({ ok: false, error: '部署入口信息缺失，请检查 Netlify 函数配置' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
    });
  }
  const incoming = new URL(request.url);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const canonicalRequest = new Request(`${origin}${incoming.pathname}${incoming.search}`, {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
    ...(hasBody ? { body: request.body, duplex: 'half' } : {})
  });
  return gateway.fetch(canonicalRequest, {}, context);
}

// Literal paths are extracted at deployment time. No SPA rewrite or arbitrary
// proxy endpoint: the existing gateway still rejects unknown methods/queries.
export const config = {
  path: [
    '/', '/index.html', '/health', '/api/v1/schools', '/api/v1/crowd',
    '/api/v1/location', '/api/v1/leave', '/api/v3/weather',
    '/api/v3/recommendation', '/maps/csuft-campus.jpg',
    '/maps/hunnu-nanyuan.jpg', '/maps/hunnu-xianjiahu.jpg',
    '/maps/hunnu-erlb.jpg', '/maps/hunnu-taohuaping.jpg',
    '/maps/hunnu-zhanggongling.jpg'
  ]
};
