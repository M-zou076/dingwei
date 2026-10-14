// Generated from the tested gateway and Node adapter. No external dependencies.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const gateway = (() => {
const UPSTREAM_ORIGIN = 'https://dingwei.3531679736.workers.dev';
const GATEWAY_REVISION = '1.1.0';
const MAX_JSON_BYTES = 32 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const MAP_PATH = '/maps/csuft-campus.jpg';

const ROUTES = new Map([
  ['/health', { method: 'GET', query: [] }],
  ['/api/v1/schools', { method: 'GET', query: [] }],
  ['/api/v1/crowd', { method: 'GET', query: ['schoolId'] }],
  ['/api/v1/location', { method: 'POST', query: [] }],
  ['/api/v1/leave', { method: 'POST', query: [] }],
  ['/api/v3/weather', { method: 'GET', query: ['schoolId'] }],
  ['/api/v3/recommendation', { method: 'GET', query: ['schoolId', 'purpose'] }],
  [MAP_PATH, { method: 'GET', query: ['v'] }],
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
    let mapUrl;
    try {
      mapUrl = new URL(school.mapUrl || school.mapPath, UPSTREAM_ORIGIN);
    } catch {
      throw new GatewayError('上游学校地图地址无效');
    }
    if (mapUrl.origin !== UPSTREAM_ORIGIN || mapUrl.pathname !== MAP_PATH ||
        [...mapUrl.searchParams.keys()].some(key => key !== 'v')) {
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
<body><h1>校园人流服务入口</h1><p>手机与电脑通过这个入口访问同一套校园人流数据。</p><p><a href="/health">检查手机连接状态</a><a href="${UPSTREAM_ORIGIN}/simulator?v=2.6">电脑模拟后台（原入口）</a></p><p>先检查连接状态：显示 <code>ok: true</code> 和 <code>upstreamConnected: true</code> 表示入口已连接人流服务。手机也能打开后，可将这个网站地址填入 App 的服务地址。</p><small>请在电脑原后台修改模拟人数和时段。本入口不开放修改全校模拟的接口；手机会读取同一套结果，不会另建一套模拟数据。</small></body></html>`, {
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
    if (url.search.length > 2048 || [...url.searchParams.keys()].some(key => !route.query.includes(key))) {
      return json({ error: '请求包含未允许的查询参数' }, 400);
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: publicHeaders() });
    }
    if (request.method !== route.method) {
      return json({ error: '请求方法不允许' }, 405, { Allow: `${route.method},OPTIONS` });
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

const MAX_BODY_BYTES = 32 * 1024;
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

class AdapterError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

function canonicalOrigin(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('PUBLIC_ORIGIN 或 RENDER_EXTERNAL_URL 必须是有效的网站根地址'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('公开地址必须是 http(s) 网站根地址，不能包含用户凭据或接口路径');
  }
  return url.origin;
}

function readBody(request, signal) {
  const declared = request.headers['content-length'];
  if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
    return Promise.reject(new AdapterError('请求内容过大，最多允许 32 KB JSON', 413));
  }
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let length = 0;
    const cleanup = () => {
      request.off('data', onData); request.off('end', onEnd);
      request.off('error', onError); signal.removeEventListener('abort', onAbort);
    };
    const fail = error => { cleanup(); request.pause(); reject(error); };
    const onData = chunk => {
      length += chunk.byteLength;
      if (length > MAX_BODY_BYTES) return fail(new AdapterError('请求内容过大，最多允许 32 KB JSON', 413));
      chunks.push(chunk);
    };
    const onEnd = () => { cleanup(); resolveBody(Buffer.concat(chunks, length)); };
    const onError = () => fail(new AdapterError('读取请求内容失败', 400));
    const onAbort = () => fail(signal.reason);
    request.on('data', onData); request.once('end', onEnd);
    request.once('error', onError); signal.addEventListener('abort', onAbort, { once: true });
  });
}

function invokeGateway(request, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolveResponse, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => gateway.fetch(request)).then(response => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) {
        response.body?.cancel().catch(() => {});
        return;
      }
      resolveResponse(response);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
  });
}

async function writeResponse(response, outgoing, signal) {
  if (!(response instanceof Response)) throw new AdapterError('网关返回的数据格式无效', 502);
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (!HOP_HEADERS.has(name.toLowerCase())) outgoing.setHeader(name, value);
  }
  if (!response.body) { outgoing.end(); return; }
  await pipeline(Readable.fromWeb(response.body), outgoing, { signal });
}

function writeError(outgoing, status, message) {
  if (outgoing.destroyed) return;
  if (outgoing.headersSent) { outgoing.destroy(); return; }
  const body = Buffer.from(JSON.stringify({ error: message }));
  outgoing.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.byteLength,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'close'
  });
  outgoing.end(body);
}

/** Render origin is configuration, never an incoming Host / Forwarded header. */
export function createGatewayServer({
  publicOrigin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL,
  allowLocalFallback = false,
  requestTimeoutMs = 15000
} = {}) {
  const configuredOrigin = publicOrigin ? canonicalOrigin(publicOrigin) : null;
  if (!configuredOrigin && !allowLocalFallback) {
    throw new Error('请设置 RENDER_EXTERNAL_URL 或 PUBLIC_ORIGIN；本地测试可显式启用 GATEWAY_LOCAL_QA=1');
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw new Error('请求超时参数无效');

  const server = createServer({
    requestTimeout: requestTimeoutMs,
    headersTimeout: Math.min(requestTimeoutMs, 10000),
    keepAliveTimeout: 5000,
    maxHeaderSize: 16 * 1024
  }, async (incoming, outgoing) => {
    const controller = new AbortController();
    let stage = 'body';
    const timer = setTimeout(() => controller.abort(new AdapterError(
      stage === 'body' ? '读取请求内容超时' : '网关请求超时，请稍后重试', stage === 'body' ? 408 : 504
    )), requestTimeoutMs);
    const onAborted = () => controller.abort(new AdapterError('客户端已断开连接', 499));
    const onClose = () => { if (!outgoing.writableEnded) onAborted(); };
    // Keep a transport error listener for the lifetime of this message,
    // including errors emitted just after an incomplete body is cancelled.
    incoming.on('error', onAborted);
    outgoing.on('error', onAborted);
    incoming.once('aborted', onAborted);
    outgoing.once('close', onClose);
    try {
      // Origin-form paths only. An absolute-form request cannot choose an
      // upstream destination or poison the map URL returned to the phone.
      if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
        throw new AdapterError('请求地址无效', 400);
      }
      const address = server.address();
      const origin = configuredOrigin || `http://127.0.0.1:${address.port}`;
      const url = new URL(`${origin}${incoming.url}`);
      if (url.origin !== origin) throw new AdapterError('请求地址无效', 400);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (name === 'host' || HOP_HEADERS.has(name)) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) headers.append(name, item);
        }
      }
      const bytes = await readBody(incoming, controller.signal);
      const method = incoming.method || 'GET';
      const request = new Request(url, {
        method, headers, signal: controller.signal,
        ...(method !== 'GET' && method !== 'HEAD' ? { body: bytes } : {})
      });
      stage = 'gateway';
      await writeResponse(await invokeGateway(request, controller.signal), outgoing, controller.signal);
    } catch (error) {
      if (controller.signal.aborted && controller.signal.reason?.status === 499) return;
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      writeError(outgoing, failure instanceof AdapterError ? failure.status : 502,
        failure instanceof AdapterError ? failure.message : '网关处理请求失败，请稍后重试');
      incoming.resume();
    } finally {
      clearTimeout(timer);
      incoming.off('aborted', onAborted);
      outgoing.off('close', onClose);
    }
  });
  server.on('clientError', (_error, socket) => {
    if (!socket.writable) return;
    const body = '{"error":"HTTP 请求格式无效"}';
    socket.end(`HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  return server;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 10000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须是有效的端口号');
  const server = createGatewayServer({ allowLocalFallback: process.env.GATEWAY_LOCAL_QA === '1' });
  server.listen(port, '0.0.0.0', () => {
    console.log(`Campus mobile gateway listening on 0.0.0.0:${server.address().port}`);
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
