const ACTIVE_MS = 3 * 60 * 1000;
const MAX_ACCURACY_METERS = 80;
const MIN_DOT_GROUP = 3;

const schools = [{
  id: 'csuft',
  name: '中南林业科技大学',
  mapPath: '/maps/csuft-campus.jpg',
  coordinateSystem: 'bd09ll',
  bounds: { west: 112.99174, east: 113.01177, south: 28.13487, north: 28.13862 },
  grid: { columns: 18, rows: 12, yellowAt: 4, redAt: 8 },
  calibrationNote: '第一阶段近似标定，可根据实测控制点继续校准。'
}];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: cors });
}

function normalized(school, latitude, longitude) {
  const b = school.bounds;
  const x = (longitude - b.west) / (b.east - b.west);
  const y = (b.north - latitude) / (b.north - b.south);
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

function publicSchool(school, origin) {
  return {
    ...school,
    mapUrl: `${origin}${school.mapPath}`,
    calibration: { mode: 'bounds', status: 'approximate', pointCount: 0 }
  };
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

async function weatherFor(school) {
  const center = {
    latitude: (school.bounds.north + school.bounds.south) / 2,
    longitude: (school.bounds.east + school.bounds.west) / 2
  };
  const query = new URLSearchParams({
    latitude: String(center.latitude),
    longitude: String(center.longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    timezone: 'Asia/Shanghai',
    forecast_days: '1'
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`天气服务 HTTP ${response.status}`);
  const raw = await response.json();
  const current = raw.current || {};
  const daily = raw.daily || {};
  return {
    source: 'Open-Meteo', observedAt: current.time,
    condition: weatherText(Number(current.weather_code)), weatherCode: Number(current.weather_code),
    temperature: Number(current.temperature_2m), apparentTemperature: Number(current.apparent_temperature),
    precipitation: Number(current.precipitation), windSpeed: Number(current.wind_speed_10m),
    maximum: Number(daily.temperature_2m_max?.[0]), minimum: Number(daily.temperature_2m_min?.[0]),
    precipitationProbability: Number(daily.precipitation_probability_max?.[0]), uvIndex: Number(daily.uv_index_max?.[0])
  };
}

function adviceFor(purpose, weather, crowd) {
  const labels = { class: '上课', study: '学习', sport: '运动', eat: '吃饭', walk: '散步' };
  const known = Object.hasOwn(labels, purpose) ? purpose : 'class';
  const rain = weather && (weather.precipitation > 0 || weather.precipitationProbability >= 50 || weather.weatherCode >= 51);
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
    class: '建议按课程时间提前出发，优先选择距离较短的教学区路线。',
    study: '优先前往图书馆或安静自习区；到达前查看地图上的实时拥挤网格。',
    sport: rain || windy ? '不建议户外运动，可选择室内体育馆。' : hot ? '适合傍晚或清晨运动，避免正午高温。' : '适合户外运动，可前往体育场并避开拥挤区域。',
    eat: '优先选择绿色人流区域附近的食堂；黄色或红色时建议错峰15至30分钟。',
    walk: rain || windy ? '暂不推荐长时间户外散步。' : highUv ? '建议傍晚散步，选择林荫道路。' : '适合校园散步，优先选择绿色低拥挤区域。'
  };
  let crowdAdvice = '当前暂无真实人流数据，不能判断拥挤程度。';
  if (crowd.activeUsers > 0) {
    const red = crowd.grids.filter(item => item.level === 'red').length;
    crowdAdvice = red ? `当前${crowd.activeUsers}人在线，发现${red}个红色拥挤网格，请绕行。` : `当前${crowd.activeUsers}人在线，暂未发现红色拥挤网格。`;
  }
  return { purpose: known, purposeLabel: labels[known], summary: purposeAdvice[known], weatherAdvice: `${weatherParts.join('；')}。`, crowdAdvice };
}

async function crowdRequest(env, path, init = {}) {
  const id = env.CROWD_HUB.idFromName('campus-crowd-global');
  const stub = env.CROWD_HUB.get(id);
  return stub.fetch(`https://crowd.internal${path}`, init);
}

export class CrowdHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/location') {
      const body = await request.json();
      const key = `location:${body.schoolId}:${body.anonymousId}`;
      await this.state.storage.put(key, { ...body, receivedAt: Date.now() });
      await this.state.storage.setAlarm(Date.now() + ACTIVE_MS);
      return json({ accepted: true, expiresInSeconds: ACTIVE_MS / 1000 });
    }
    if (request.method === 'POST' && url.pathname === '/leave') {
      const body = await request.json();
      await this.state.storage.delete(`location:${body.schoolId}:${body.anonymousId}`);
      return json({ removed: true });
    }
    if (request.method === 'GET' && url.pathname === '/reports') {
      const schoolId = url.searchParams.get('schoolId') || '';
      const entries = await this.state.storage.list({ prefix: `location:${schoolId}:` });
      const now = Date.now();
      const reports = [];
      const expired = [];
      for (const [key, value] of entries) {
        if (now - value.receivedAt > ACTIVE_MS) expired.push(key);
        else reports.push(value);
      }
      if (expired.length) await this.state.storage.delete(expired);
      return json({ reports });
    }
    return json({ error: '内部接口不存在' }, 404);
  }

  async alarm() {
    const entries = await this.state.storage.list({ prefix: 'location:' });
    const now = Date.now();
    const expired = [];
    let hasActive = false;
    for (const [key, value] of entries) {
      if (now - value.receivedAt > ACTIVE_MS) expired.push(key);
      else hasActive = true;
    }
    if (expired.length) await this.state.storage.delete(expired);
    if (hasActive) await this.state.storage.setAlarm(now + ACTIVE_MS);
  }
}

function hashUnit(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967295;
}

async function crowdFor(env, school) {
  const response = await crowdRequest(env, `/reports?schoolId=${encodeURIComponent(school.id)}`);
  const { reports } = await response.json();
  const cfg = school.grid;
  const cells = new Map();
  for (const entry of reports) {
    const point = normalized(school, Number(entry.latitude), Number(entry.longitude));
    if (!point.inside) continue;
    const col = Math.min(cfg.columns - 1, Math.floor(point.x * cfg.columns));
    const row = Math.min(cfg.rows - 1, Math.floor(point.y * cfg.rows));
    const key = `${col}:${row}`;
    if (!cells.has(key)) cells.set(key, { col, row, people: [] });
    cells.get(key).people.push(point);
  }
  const grids = [...cells.values()].map(cell => ({
    col: cell.col, row: cell.row, x: cell.col / cfg.columns, y: cell.row / cfg.rows,
    width: 1 / cfg.columns, height: 1 / cfg.rows, count: cell.people.length,
    level: cell.people.length >= cfg.redAt ? 'red' : cell.people.length >= cfg.yellowAt ? 'yellow' : 'green'
  }));
  const dots = [];
  const minute = Math.floor(Date.now() / 60000);
  for (const cell of cells.values()) {
    if (cell.people.length < MIN_DOT_GROUP) continue;
    cell.people.forEach((point, index) => {
      const jitterX = (hashUnit(`${school.id}:${cell.col}:${cell.row}:${minute}:${index}:x`) - 0.5) * (0.7 / cfg.columns);
      const jitterY = (hashUnit(`${school.id}:${cell.col}:${cell.row}:${minute}:${index}:y`) - 0.5) * (0.7 / cfg.rows);
      dots.push({ x: Math.max(0, Math.min(1, point.x + jitterX)), y: Math.max(0, Math.min(1, point.y + jitterY)) });
    });
  }
  return {
    schoolId: school.id, generatedAt: Date.now(), activeUsers: reports.length,
    dataWindowSeconds: ACTIVE_MS / 1000, grids, dots,
    privacy: { minDotGroup: MIN_DOT_GROUP, exactCoordinatesExposed: false }
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const school = schools.find(item => item.id === url.searchParams.get('schoolId'));

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, platform: 'cloudflare-workers', time: Date.now() });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/schools') {
      return json({ schools: schools.map(item => publicSchool(item, url.origin)) });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/crowd') {
      return school ? json(await crowdFor(env, school)) : json({ error: '学校不存在' }, 404);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/location') {
      try {
        const body = await request.json();
        const target = schools.find(item => item.id === body.schoolId);
        const latitude = Number(body.latitude);
        const longitude = Number(body.longitude);
        const accuracy = Number(body.accuracy);
        if (!target || !body.anonymousId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return json({ accepted: false, error: '参数不完整' }, 400);
        if (accuracy <= 0 || accuracy > MAX_ACCURACY_METERS) return json({ accepted: false, error: `定位精度需优于${MAX_ACCURACY_METERS}米` }, 422);
        if (!normalized(target, latitude, longitude).inside) return json({ accepted: false, error: '位置不在当前校园地图范围内' }, 422);
        return crowdRequest(env, '/location', { method: 'POST', body: JSON.stringify({ schoolId: target.id, anonymousId: String(body.anonymousId).slice(0, 100), latitude, longitude, accuracy }) });
      } catch (error) {
        return json({ accepted: false, error: error.message }, 400);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/leave') {
      try {
        const body = await request.json();
        return crowdRequest(env, '/leave', { method: 'POST', body: JSON.stringify({ schoolId: body.schoolId, anonymousId: body.anonymousId }) });
      } catch (error) {
        return json({ removed: false, error: error.message }, 400);
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/v3/weather') {
      if (!school) return json({ available: false, error: '学校不存在' }, 404);
      try { return json({ available: true, schoolId: school.id, weather: await weatherFor(school) }); }
      catch (error) { return json({ available: false, error: error.message }, 503); }
    }
    if (request.method === 'GET' && url.pathname === '/api/v3/recommendation') {
      if (!school) return json({ available: false, error: '学校不存在' }, 404);
      let weather = null;
      try { weather = await weatherFor(school); } catch { /* 人流推荐仍然可用 */ }
      const crowd = await crowdFor(env, school);
      return json({
        available: true, schoolId: school.id, weatherAvailable: Boolean(weather), weather,
        crowd: { activeUsers: crowd.activeUsers, redCells: crowd.grids.filter(item => item.level === 'red').length },
        recommendation: adviceFor(url.searchParams.get('purpose'), weather, crowd)
      });
    }
    if (url.pathname.startsWith('/api/')) return json({ error: '接口不存在' }, 404);
    return env.ASSETS.fetch(request);
  }
};
