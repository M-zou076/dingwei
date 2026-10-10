const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ACTIVE_MS = 3 * 60 * 1000;
const MAX_ACCURACY_METERS = 80;
const MIN_DOT_GROUP = 3;
const schoolsFile = path.join(__dirname, 'schools.json');
const mapDir = path.join(__dirname, 'maps');
const adminFile = path.join(__dirname, 'admin.html');
const adminTokenFile = path.join(__dirname, 'admin-token.txt');
const active = new Map();
const weatherCache = new Map();

function loadSchools() {
  return JSON.parse(fs.readFileSync(schoolsFile, 'utf8'));
}

function saveSchools(schools) {
  const temporary = `${schoolsFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(schools, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, schoolsFile);
}

function solve3(matrix, values) {
  const a = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error('控制点分布无法计算，请选择不在同一直线上的点');
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j < 4; j++) a[col][j] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j < 4; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return [a[0][3], a[1][3], a[2][3]];
}

function calibrationFor(school) {
  const points = Array.isArray(school.controlPoints) ? school.controlPoints.filter(p =>
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) &&
    Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) : [];
  if (points.length < 3) return { mode: 'bounds', status: 'approximate', pointCount: points.length };
  const originLng = points.reduce((sum, p) => sum + Number(p.longitude), 0) / points.length;
  const originLat = points.reduce((sum, p) => sum + Number(p.latitude), 0) / points.length;
  let sUU = 0, sUV = 0, sU = 0, sVV = 0, sV = 0;
  const bx = [0, 0, 0], by = [0, 0, 0];
  for (const p of points) {
    const u = Number(p.longitude) - originLng, v = Number(p.latitude) - originLat;
    sUU += u * u; sUV += u * v; sU += u; sVV += v * v; sV += v;
    bx[0] += u * Number(p.x); bx[1] += v * Number(p.x); bx[2] += Number(p.x);
    by[0] += u * Number(p.y); by[1] += v * Number(p.y); by[2] += Number(p.y);
  }
  try {
    const normal = [[sUU, sUV, sU], [sUV, sVV, sV], [sU, sV, points.length]];
    const x = solve3(normal, bx), y = solve3(normal, by);
    let squared = 0;
    for (const p of points) {
      const u = Number(p.longitude) - originLng, v = Number(p.latitude) - originLat;
      const dx = x[0] * u + x[1] * v + x[2] - Number(p.x);
      const dy = y[0] * u + y[1] * v + y[2] - Number(p.y);
      squared += dx * dx + dy * dy;
    }
    return { mode: 'affine', status: points.length >= 4 ? 'calibrated' : 'basic', pointCount: points.length, originLng, originLat, x, y, rmse: Math.sqrt(squared / points.length) };
  } catch (error) {
    return { mode: 'bounds', status: 'invalid', pointCount: points.length, error: error.message };
  }
}

function send(res, status, data, type = 'application/json; charset=utf-8') {
  const body = Buffer.isBuffer(data) ? data : type.startsWith('application/json') ? Buffer.from(JSON.stringify(data)) : Buffer.from(data);
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJson(req, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('请求过大'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('JSON 格式错误')); }
    });
    req.on('error', reject);
  });
}

function publicSchool(s, req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  return { ...s, mapUrl: `${protocol}://${host}${s.mapPath}`, calibration: calibrationFor(s) };
}

function normalized(school, latitude, longitude) {
  const calibration = calibrationFor(school);
  if (calibration.mode === 'affine') {
    const u = longitude - calibration.originLng, v = latitude - calibration.originLat;
    const x = calibration.x[0] * u + calibration.x[1] * v + calibration.x[2];
    const y = calibration.y[0] * u + calibration.y[1] * v + calibration.y[2];
    return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
  }
  const b = school.bounds;
  const x = (longitude - b.west) / (b.east - b.west);
  const y = (b.north - latitude) / (b.north - b.south);
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

function isAdmin(req) {
  const fileToken = fs.existsSync(adminTokenFile) ? fs.readFileSync(adminTokenFile, 'utf8') : '';
  const expected = String(process.env.ADMIN_TOKEN || fileToken).trim();
  return expected && req.headers['x-admin-token'] === expected;
}

function safeSchool(input, existing) {
  const id = String(input.id || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(id)) throw new Error('学校 ID 只能包含小写字母、数字和短横线');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('学校名称不能为空');
  const points = Array.isArray(input.controlPoints) ? input.controlPoints.map((p, index) => ({
    label: String(p.label || `控制点${index + 1}`).slice(0, 40),
    x: Number(p.x), y: Number(p.y), latitude: Number(p.latitude), longitude: Number(p.longitude)
  })) : [];
  for (const p of points) {
    if (![p.x, p.y, p.latitude, p.longitude].every(Number.isFinite) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) throw new Error('控制点数据不合法');
  }
  const bounds = input.bounds || existing?.bounds;
  if (!bounds) throw new Error('缺少校园坐标范围');
  const gridInput = input.grid || existing?.grid || {};
  return {
    id, name,
    mapPath: existing?.mapPath || `/maps/${id}.jpg`,
    coordinateSystem: 'bd09ll',
    bounds: { west: Number(bounds.west), east: Number(bounds.east), south: Number(bounds.south), north: Number(bounds.north) },
    grid: { columns: Math.max(4, Math.min(40, Number(gridInput.columns) || 18)), rows: Math.max(4, Math.min(30, Number(gridInput.rows) || 12)), yellowAt: Math.max(2, Number(gridInput.yellowAt) || 4), redAt: Math.max(3, Number(gridInput.redAt) || 8) },
    controlPoints: points,
    calibrationNote: points.length >= 4 ? '已使用多控制点仿射校准' : '控制点不足，当前仍使用坐标边界近似映射'
  };
}

function cleanup(now = Date.now()) {
  for (const [key, value] of active) {
    if (now - value.receivedAt > ACTIVE_MS) active.delete(key);
  }
}

function crowdFor(school) {
  cleanup();
  const cfg = school.grid;
  const cells = new Map();
  const people = [];
  for (const entry of active.values()) {
    if (entry.schoolId !== school.id) continue;
    const p = normalized(school, entry.latitude, entry.longitude);
    if (!p.inside) continue;
    const col = Math.min(cfg.columns - 1, Math.floor(p.x * cfg.columns));
    const row = Math.min(cfg.rows - 1, Math.floor(p.y * cfg.rows));
    const key = `${col}:${row}`;
    if (!cells.has(key)) cells.set(key, { col, row, count: 0, people: [] });
    const cell = cells.get(key);
    cell.count += 1;
    cell.people.push(p);
    people.push(p);
  }
  const grids = [...cells.values()].map(cell => ({
    col: cell.col,
    row: cell.row,
    x: cell.col / cfg.columns,
    y: cell.row / cfg.rows,
    width: 1 / cfg.columns,
    height: 1 / cfg.rows,
    count: cell.count,
    level: cell.count >= cfg.redAt ? 'red' : cell.count >= cfg.yellowAt ? 'yellow' : 'green'
  }));
  const dots = [];
  for (const cell of cells.values()) {
    if (cell.count < MIN_DOT_GROUP) continue;
    for (const p of cell.people) {
      const seed = crypto.createHash('sha256').update(`${school.id}:${cell.col}:${cell.row}:${Math.floor(Date.now() / 60000)}`).digest();
      const jitterX = ((seed[dots.length % seed.length] / 255) - 0.5) * (0.7 / cfg.columns);
      const jitterY = ((seed[(dots.length + 7) % seed.length] / 255) - 0.5) * (0.7 / cfg.rows);
      dots.push({ x: Math.max(0, Math.min(1, p.x + jitterX)), y: Math.max(0, Math.min(1, p.y + jitterY)) });
    }
  }
  return { schoolId: school.id, generatedAt: Date.now(), activeUsers: people.length, dataWindowSeconds: ACTIVE_MS / 1000, grids, dots, privacy: { minDotGroup: MIN_DOT_GROUP, exactCoordinatesExposed: false } };
}

function weatherText(code) {
  if (code === 0) return '晴';
  if (code <= 3) return '多云';
  if (code === 45 || code === 48) return '有雾';
  if (code >= 51 && code <= 67) return '有雨';
  if (code >= 71 && code <= 77) return '有雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 85 && code <= 86) return '阵雪';
  if (code >= 95) return '雷雨';
  return '天气变化';
}

function getRemoteJson(address, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const request = https.get(address, { headers: { 'User-Agent': 'CampusTravelAssistant/1.3' } }, response => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(new Error(`天气服务 HTTP ${response.statusCode}`)); return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('天气服务返回格式错误')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('天气服务连接超时')));
    request.on('error', reject);
  });
}

async function weatherFor(school) {
  const cached = weatherCache.get(school.id);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) return cached.data;
  const center = school.weatherCoordinates || {
    latitude: (school.bounds.north + school.bounds.south) / 2,
    longitude: (school.bounds.east + school.bounds.west) / 2
  };
  const query = new URLSearchParams({
    latitude: String(center.latitude), longitude: String(center.longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    timezone: 'Asia/Shanghai', forecast_days: '1'
  });
  const raw = await getRemoteJson(`https://api.open-meteo.com/v1/forecast?${query}`);
  const current = raw.current || {}, daily = raw.daily || {};
  const data = {
    source: 'Open-Meteo', observedAt: current.time,
    condition: weatherText(Number(current.weather_code)), weatherCode: Number(current.weather_code),
    temperature: Number(current.temperature_2m), apparentTemperature: Number(current.apparent_temperature),
    precipitation: Number(current.precipitation), windSpeed: Number(current.wind_speed_10m),
    maximum: Number(daily.temperature_2m_max?.[0]), minimum: Number(daily.temperature_2m_min?.[0]),
    precipitationProbability: Number(daily.precipitation_probability_max?.[0]), uvIndex: Number(daily.uv_index_max?.[0])
  };
  weatherCache.set(school.id, { fetchedAt: Date.now(), data });
  return data;
}

function adviceFor(purpose, weather, crowd) {
  const labels = { class: '上课', study: '学习', sport: '运动', eat: '吃饭', walk: '散步' };
  const known = Object.prototype.hasOwnProperty.call(labels, purpose) ? purpose : 'class';
  const rain = weather && (weather.precipitation > 0 || weather.precipitationProbability >= 50 || (weather.weatherCode >= 51 && weather.weatherCode <= 99));
  const hot = weather && weather.temperature >= 30;
  const cold = weather && weather.temperature <= 8;
  const windy = weather && weather.windSpeed >= 30;
  const highUv = weather && weather.uvIndex >= 6;
  const weatherParts = [];
  if (!weather) weatherParts.push('天气数据暂不可用，请自行查看实时天气');
  else {
    if (rain) weatherParts.push('有降雨可能，带伞并优先选择有连廊或室内路线');
    if (hot) weatherParts.push('气温较高，避开暴晒路段并及时补水');
    if (cold) weatherParts.push('气温较低，注意保暖');
    if (windy) weatherParts.push('风力较强，避免树下和临时搭建物附近停留');
    if (highUv && !rain) weatherParts.push('紫外线较强，建议防晒');
    if (!rain && !hot && !cold && !windy) weatherParts.push('天气适合校园出行');
  }
  const purposeAdvice = {
    class: rain ? '建议提前 10 分钟出发，优先走教学楼之间的短路线。' : '建议按课程时间提前出发，优先选择距离较短的教学区路线。',
    study: '优先前往图书馆或安静自习区；到达前查看地图上的实时拥挤网格。',
    sport: !weather ? '天气数据不可用，暂不判断是否适合户外运动；可根据地图人流选择场地。' : rain || windy ? '不建议户外运动，可选择室内体育馆或宿舍内训练。' : hot ? '适合傍晚或清晨运动，避免正午高温。' : '适合户外运动，可前往体育场并避开拥挤区域。',
    eat: '优先选择绿色人流区域附近的食堂；黄色或红色时建议错峰 15–30 分钟。',
    walk: !weather ? '天气数据不可用，暂不判断是否适合散步；请先查看实际天气。' : rain || windy ? '暂不推荐长时间户外散步，可改为教学楼或图书馆室内活动。' : highUv ? '建议傍晚散步，选择林荫道路。' : '适合校园散步，优先选择林荫和绿色低拥挤区域。'
  };
  let crowdAdvice = '当前暂无真实人流数据，不能判断拥挤程度。';
  if (crowd.activeUsers > 0) {
    const red = crowd.grids.filter(g => g.level === 'red').length;
    crowdAdvice = red > 0 ? `当前 ${crowd.activeUsers} 人在线，发现 ${red} 个红色拥挤网格，请绕行。` : `当前 ${crowd.activeUsers} 人在线，暂未发现红色拥挤网格。`;
  }
  return { purpose: known, purposeLabel: labels[known], summary: purposeAdvice[known], weatherAdvice: weatherParts.join('；') + '。', crowdAdvice };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const schools = loadSchools();

  if (req.method === 'GET' && url.pathname === '/health') {
    cleanup();
    return send(res, 200, { ok: true, activeReports: active.size, time: Date.now() });
  }
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    return send(res, 200, fs.readFileSync(adminFile), 'text/html; charset=utf-8');
  }
  if (req.method === 'POST' && url.pathname === '/api/v2/admin/school') {
    if (!isAdmin(req)) return send(res, 401, { saved: false, error: '管理口令错误' });
    try {
      const body = await readJson(req, 15 * 1024 * 1024);
      const index = schools.findIndex(s => s.id === body.id);
      const existing = index >= 0 ? schools[index] : null;
      const school = safeSchool(body, existing);
      if (body.imageData) {
        const match = String(body.imageData).match(/^data:image\/(png|jpeg);base64,(.+)$/);
        if (!match) return send(res, 400, { saved: false, error: '只支持 PNG 或 JPEG 地图图片' });
        const extension = match[1] === 'png' ? 'png' : 'jpg';
        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length > 10 * 1024 * 1024) return send(res, 413, { saved: false, error: '地图图片不能超过 10MB' });
        const fileName = `${school.id}.${extension}`;
        fs.writeFileSync(path.join(mapDir, fileName), buffer);
        school.mapPath = `/maps/${fileName}`;
      } else if (!existing) {
        return send(res, 400, { saved: false, error: '新增学校必须上传地图图片' });
      }
      if (index >= 0) schools[index] = school; else schools.push(school);
      saveSchools(schools);
      return send(res, 200, { saved: true, school: publicSchool(school, req) });
    } catch (error) {
      return send(res, 400, { saved: false, error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/v2/admin/control-point') {
    if (!isAdmin(req)) return send(res, 401, { saved: false, error: '管理口令错误' });
    try {
      const body = await readJson(req);
      const index = schools.findIndex(s => s.id === body.schoolId);
      if (index < 0) return send(res, 404, { saved: false, error: '学校不存在' });
      const point = { label: String(body.label || '手机采点').slice(0, 40), x: Number(body.x), y: Number(body.y), latitude: Number(body.latitude), longitude: Number(body.longitude) };
      if (![point.x, point.y, point.latitude, point.longitude].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return send(res, 400, { saved: false, error: '控制点数据不合法' });
      schools[index].controlPoints = Array.isArray(schools[index].controlPoints) ? schools[index].controlPoints : [];
      schools[index].controlPoints.push(point);
      schools[index].calibrationNote = schools[index].controlPoints.length >= 4 ? '已使用多控制点仿射校准' : '控制点不足，当前仍使用坐标边界近似映射';
      saveSchools(schools);
      return send(res, 200, { saved: true, calibration: calibrationFor(schools[index]), point });
    } catch (error) {
      return send(res, 400, { saved: false, error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/schools') {
    return send(res, 200, { schools: schools.map(s => publicSchool(s, req)) });
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/crowd') {
    const school = schools.find(s => s.id === url.searchParams.get('schoolId'));
    return school ? send(res, 200, crowdFor(school)) : send(res, 404, { error: '学校不存在' });
  }
  if (req.method === 'GET' && url.pathname === '/api/v3/weather') {
    const school = schools.find(s => s.id === url.searchParams.get('schoolId'));
    if (!school) return send(res, 404, { available: false, error: '学校不存在' });
    try { return send(res, 200, { available: true, schoolId: school.id, weather: await weatherFor(school) }); }
    catch (error) { return send(res, 503, { available: false, error: error.message }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/v3/recommendation') {
    const school = schools.find(s => s.id === url.searchParams.get('schoolId'));
    if (!school) return send(res, 404, { available: false, error: '学校不存在' });
    let weather = null;
    try { weather = await weatherFor(school); } catch { /* 推荐仍可使用人流数据 */ }
    const crowd = crowdFor(school);
    return send(res, 200, { available: true, schoolId: school.id, weatherAvailable: Boolean(weather), weather, crowd: { activeUsers: crowd.activeUsers, redCells: crowd.grids.filter(g => g.level === 'red').length }, recommendation: adviceFor(url.searchParams.get('purpose'), weather, crowd) });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/location') {
    try {
      const body = await readJson(req);
      const school = schools.find(s => s.id === body.schoolId);
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const accuracy = Number(body.accuracy);
      if (!school || !body.anonymousId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
        return send(res, 400, { accepted: false, error: '参数不完整' });
      }
      if (accuracy <= 0 || accuracy > MAX_ACCURACY_METERS) {
        return send(res, 422, { accepted: false, error: `定位精度需优于 ${MAX_ACCURACY_METERS} 米` });
      }
      if (!normalized(school, latitude, longitude).inside) {
        return send(res, 422, { accepted: false, error: '位置不在当前校园地图范围内' });
      }
      active.set(`${school.id}:${body.anonymousId}`, { schoolId: school.id, latitude, longitude, accuracy, receivedAt: Date.now() });
      return send(res, 200, { accepted: true, expiresInSeconds: ACTIVE_MS / 1000 });
    } catch (error) {
      return send(res, 400, { accepted: false, error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/leave') {
    try {
      const body = await readJson(req);
      active.delete(`${body.schoolId}:${body.anonymousId}`);
      return send(res, 200, { removed: true });
    } catch (error) {
      return send(res, 400, { removed: false, error: error.message });
    }
  }
  if (req.method === 'GET' && url.pathname.startsWith('/maps/')) {
    const name = path.basename(url.pathname);
    const file = path.join(mapDir, name);
    if (!fs.existsSync(file)) return send(res, 404, { error: '地图不存在' });
    return send(res, 200, fs.readFileSync(file), name.endsWith('.png') ? 'image/png' : 'image/jpeg');
  }
  send(res, 404, { error: '接口不存在' });
});

server.listen(PORT, HOST, () => {
  console.log(`校园人流服务已启动：http://${HOST}:${PORT}`);
  console.log('手机需与电脑在同一局域网，并在 App 中填写电脑局域网 IP。');
});
