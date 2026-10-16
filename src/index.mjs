import { shanghaiTimeMinutes } from './student-routine.mjs';
import { SCHOOLS as schools, getSchool, getCampusSimulation, insideCampus as insideCampusMap, simulationConfig } from './campus-maps.mjs';
import { generateCampusRoutine, randomCampusPoint as randomMapPoint, pointNearCampus } from './campus-routine.mjs';

const ACTIVE_MS = 3 * 60 * 1000;
const MAX_ACCURACY_METERS = 80;
const MIN_DOT_GROUP = 3;
const API_REVISION = '2.8.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store'
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: cors });
}

function numericValue(value) {
  if (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function locationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {error:'请求需为JSON对象',status:400};
  const school = getSchool(body.schoolId);
  if (!school) return { error: '学校不存在', status: 404 };
  if (!school.sharedLocationEnabled) return { error: '此校区手绘图尚未地理配准，仅支持模拟；不接受GPS或客户端图片坐标上报', status: 422 };
  const latitude = numericValue(body.latitude), longitude = numericValue(body.longitude), accuracy = numericValue(body.accuracy);
  if (!body.anonymousId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) return { error: '参数不完整', status: 400 };
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return { error: '经纬度不在有效范围内', status: 422 };
  if (accuracy <= 0 || accuracy > MAX_ACCURACY_METERS) return { error: `定位精度需优于${MAX_ACCURACY_METERS}米`, status: 422 };
  const hasProjection = ['mapX','mapY','mapProjection','mapVersion'].some(key => Object.hasOwn(body,key));
  const projection = {};
  if (hasProjection) {
    if (body.mapVersion !== school.mapVersion) return { error: '地图版本不匹配，请更新地图后重新校准', status: 422 };
    if (!validPersonalMapPoint(school,body)) return { error: '个人校准位置无效，请在校园地图区域内重新校准', status: 422 };
    Object.assign(projection,{mapX:body.mapX,mapY:body.mapY,mapProjection:'personal-control',mapVersion:school.mapVersion});
  } else if (!normalized(school,latitude,longitude).inside) return { error: '位置不在当前校园地图范围内', status: 422 };
  return { value:{schoolId:school.id,anonymousId:String(body.anonymousId).slice(0,100),latitude,longitude,accuracy,...projection} };
}

function simulationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {error:'请求需为JSON对象',status:400};
  const school = getSchool(body.schoolId);
  if (!school || !school.simulationSupported) return {error:'学校不存在或不支持模拟',status:404};
  if (body.action === 'stop' || Object.hasOwn(body,'count') && numericValue(body.count) === 0) return {value:{schoolId:school.id,action:'stop',count:0}};
  const count = numericValue(body.count);
  if (!Number.isFinite(count) || count < 1 || count > 10000) return {error:'模拟人数需为1至10000',status:422};
  const mode = body.mode || 'routine';
  if (!['routine','random','clusters','point'].includes(mode)) return {error:'模拟分布方式无效',status:422};
  const timeMode = body.timeMode === undefined ? 'auto' : body.timeMode;
  if (!['auto','manual'].includes(timeMode)) return {error:'时间模式无效',status:422};
  const timeMinutes = body.timeMinutes === undefined ? 0 : numericValue(body.timeMinutes);
  if (!Number.isFinite(timeMinutes) || timeMinutes < 0 || timeMinutes > 1439) return {error:'手动时间需为0至1439分钟',status:422};
  const centerX = numericValue(body.centerX), centerY = numericValue(body.centerY);
  if (mode === 'point' && !insideCampusMap(school.id,centerX,centerY)) return {error:'请在当前校区可用地图区域内选点',status:400};
  return {value:{schoolId:school.id,count:Math.round(count),mode,timeMode,timeMinutes:Math.round(timeMinutes),
    centerX:Number.isFinite(centerX)?centerX:.5,centerY:Number.isFinite(centerY)?centerY:.5,
    seed:String(body.seed || Date.now()).slice(0,100),startedAt:Date.now()}};
}

function normalized(school, latitude, longitude) {
  const b = school.bounds;
  if (!school.sharedLocationEnabled || !b) return { x: NaN, y: NaN, inside: false };
  const x = (longitude - b.west) / (b.east - b.west);
  const y = (b.north - latitude) / (b.north - b.south);
  return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

function validPersonalMapPoint(school, entry) {
  return school.sharedLocationEnabled && entry.mapProjection === 'personal-control' && entry.mapVersion === school.mapVersion &&
    typeof entry.mapX === 'number' && typeof entry.mapY === 'number' &&
    Number.isFinite(entry.mapX) && Number.isFinite(entry.mapY) &&
    entry.mapX >= 0 && entry.mapX <= 1 && entry.mapY >= 0 && entry.mapY <= 1 &&
    insideCampusMap(school.id, entry.mapX, entry.mapY);
}

function reportPoint(school, entry) {
  // A personal control point changes only this report's projection, never the
  // school's shared bounds or calibration used by other people.
  if (validPersonalMapPoint(school, entry)) return { x: entry.mapX, y: entry.mapY, inside: true };
  return normalized(school, Number(entry.latitude), Number(entry.longitude));
}

function publicSchool(school, origin) {
  return {
    ...school,
    mapUrl: `${origin}${school.mapPath}`,
    simulationConfig: simulationConfig(school.id)
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
  if (!school.bounds) throw new Error('此校区手绘图尚无地理配准，不能从图片坐标推算天气经纬度');
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
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?${query}`;
  const cache = caches.default;
  const cacheKey = new Request(`${weatherUrl}&campus_cache=v2`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();
  const response = await fetch(weatherUrl, { signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error(`天气服务 HTTP ${response.status}`);
  const raw = await response.json();
  const current = raw.current || {};
  const daily = raw.daily || {};
  const result = {
    source: 'Open-Meteo', observedAt: current.time,
    condition: weatherText(Number(current.weather_code)), weatherCode: Number(current.weather_code),
    temperature: Number(current.temperature_2m), apparentTemperature: Number(current.apparent_temperature),
    precipitation: Number(current.precipitation), windSpeed: Number(current.wind_speed_10m),
    maximum: Number(daily.temperature_2m_max?.[0]), minimum: Number(daily.temperature_2m_min?.[0]),
    precipitationProbability: Number(daily.precipitation_probability_max?.[0]), uvIndex: Number(daily.uv_index_max?.[0])
  };
  const cachedResponse = Response.json(result, { headers: { 'Cache-Control': 'public, max-age=600' } });
  await cache.put(cacheKey, cachedResponse);
  return result;
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
    const red = crowd.redCells;
    const people = crowd.simulatedUsers > 0 ? `模拟${crowd.simulatedUsers}人、真实共享${crowd.realUsers}人` : `真实共享${crowd.realUsers}人`;
    crowdAdvice = red ? `当前${people}，发现${red}个较密区域，可错峰出行。` : `当前${people}，暂未发现红色较密区域。`;
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
    this.snapshots = new Map();
    this.snapshotVersions = new Map();
    this.pendingSnapshots = new Map();
  }

  invalidateSnapshot(schoolId) {
    this.snapshots.delete(schoolId);
    this.snapshotVersions.set(schoolId, (this.snapshotVersions.get(schoolId) || 0) + 1);
  }

  async reportsFor(schoolId, now = Date.now()) {
    const entries = await this.state.storage.list({ prefix: `location:${schoolId}:` });
    const reports = [], expired = [];
    for (const [key, value] of entries) {
      if (now - value.receivedAt > ACTIVE_MS) expired.push(key);
      else reports.push(value);
    }
    if (expired.length) {
      await this.state.storage.delete(expired);
      this.invalidateSnapshot(schoolId);
    }
    const simulation = await this.state.storage.get(`simulation:${schoolId}`);
    return { reports, simulation: simulation || null };
  }

  async snapshotFor(school) {
    const now = Date.now(), minute = Math.floor(now / 60000);
    const version = this.snapshotVersions.get(school.id) || 0;
    const cached = this.snapshots.get(school.id);
    if (cached && cached.version === version && cached.expiresAt > now) return cached;
    const pending = this.pendingSnapshots.get(school.id);
    if (pending && pending.version === version && pending.minute === minute) return pending.promise;

    const task = { version, minute };
    task.promise = this.buildSnapshot(school).finally(() => {
      if (this.pendingSnapshots.get(school.id) === task) this.pendingSnapshots.delete(school.id);
    });
    this.pendingSnapshots.set(school.id, task);
    return task.promise;
  }

  async buildSnapshot(school) {
    // Mutation may interleave while storage is read. Do not publish a snapshot
    // from the previous configuration after its invalidation has completed.
    while (true) {
      const version = this.snapshotVersions.get(school.id) || 0;
      const payload = await this.reportsFor(school.id);
      if (version !== (this.snapshotVersions.get(school.id) || 0)) continue;
      const now = Date.now();
      const realExpiry = payload.reports.reduce((expiry, entry) =>
        Math.min(expiry, entry.receivedAt + ACTIVE_MS + 1), Infinity);
      const crowd = buildCrowd(school, payload, now);
      const summary = {
        schoolId: school.id, generatedAt: crowd.generatedAt,
        activeUsers: crowd.activeUsers, realUsers: crowd.realUsers,
        simulatedUsers: crowd.simulatedUsers,
        redCells: crowd.grids.filter(item => item.level === 'red').length
      };
      const snapshot = {
        version, expiresAt: Math.min((Math.floor(now / 60000) + 1) * 60000, realExpiry,
          payload.simulation && payload.simulation.mode !== 'routine' ? (Math.floor(now / 30000) + 1) * 30000 : Infinity),
        body: JSON.stringify(crowd), summaryBody: JSON.stringify(summary)
      };
      this.snapshots.set(school.id, snapshot);
      return snapshot;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/location') {
      const input = locationInput(await request.json());
      if (input.error) return json({accepted:false,error:input.error},input.status);
      const body = input.value;
      const key = `location:${body.schoolId}:${body.anonymousId}`;
      await this.state.storage.put(key, { ...body, receivedAt: Date.now() });
      this.invalidateSnapshot(body.schoolId);
      await this.state.storage.setAlarm(Date.now() + ACTIVE_MS);
      return json({ accepted: true, expiresInSeconds: ACTIVE_MS / 1000, positionalSource: body.mapProjection === 'personal-control' ? 'personal-map' : 'gps-bounds' });
    }
    if (request.method === 'POST' && url.pathname === '/leave') {
      const body = await request.json();
      const school = getSchool(body.schoolId);
      if (!school) return json({removed:false,error:'学校不存在'},404);
      if (!school.sharedLocationEnabled) return json({removed:false,error:'此校区未开启共享定位'},422);
      if (!body.anonymousId) return json({removed:false,error:'匿名编号缺失'},400);
      await this.state.storage.delete(`location:${body.schoolId}:${body.anonymousId}`);
      this.invalidateSnapshot(body.schoolId);
      return json({ removed: true });
    }
    if (request.method === 'POST' && url.pathname === '/simulation') {
      const input = simulationInput(await request.json());
      if (input.error) return json({error:input.error},input.status);
      const body = input.value;
      const key = `simulation:${body.schoolId}`;
      if (body.action === 'stop' || Number(body.count) <= 0) {
        await this.state.storage.delete(key);
        this.invalidateSnapshot(body.schoolId);
        return json({ schoolId:body.schoolId, running: false, count: 0 });
      }
      const config = body;
      await this.state.storage.put(key, config);
      this.invalidateSnapshot(body.schoolId);
      return json({ running: true, ...config });
    }
    if (request.method === 'GET' && (url.pathname === '/crowd' || url.pathname === '/crowd-summary')) {
      const school = schools.find(item => item.id === url.searchParams.get('schoolId'));
      if (!school) return json({ error: '学校不存在' }, 404);
      const snapshot = await this.snapshotFor(school);
      return new Response(url.pathname === '/crowd' ? snapshot.body : snapshot.summaryBody,
        { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    }
    if (request.method === 'GET' && url.pathname === '/reports') {
      const schoolId = url.searchParams.get('schoolId') || '';
      if (!getSchool(schoolId)) return json({error:'学校不存在'},404);
      return json(await this.reportsFor(schoolId));
    }
    return json({ error: '内部接口不存在' }, 404);
  }

  async alarm() {
    const entries = await this.state.storage.list({ prefix: 'location:' });
    const now = Date.now();
    const expired = [];
    const changedSchools = new Set();
    let hasActive = false;
    for (const [key, value] of entries) {
      if (now - value.receivedAt > ACTIVE_MS) { expired.push(key); changedSchools.add(value.schoolId); }
      else hasActive = true;
    }
    if (expired.length) await this.state.storage.delete(expired);
    for (const schoolId of changedSchools) this.invalidateSnapshot(schoolId);
    if (hasActive) await this.state.storage.setAlarm(now + ACTIVE_MS);
  }
}

function hashUnit(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  // FNV alone leaves neighbouring x/y inputs correlated, producing diagonal bands.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function buildCrowd(school, payload, now = Date.now()) {
  // Uncalibrated illustrated campuses can never consume real GPS/image reports,
  // including stale records from an older configuration in durable storage.
  const reports = school.sharedLocationEnabled ? [...(payload.reports || [])] : [];
  const simulation = payload.simulation;
  let routine = null;
  if (simulation && simulation.count > 0 && simulation.mode === 'routine') {
    const timeMinutes = simulation.timeMode === 'manual' ? simulation.timeMinutes : shanghaiTimeMinutes(now);
    const generated = generateCampusRoutine({ schoolId:school.id, count: simulation.count, seed: simulation.seed, timeMinutes });
    routine = generated.summary;
    for (const person of generated.points) reports.push({ anonymousId: person.id, imageX: person.x, imageY: person.y, simulated: true });
  } else if (simulation && simulation.count > 0) {
    const minute = Math.floor(now / 30000);
    const hotspots = school.id === 'csuft' ? [
      [.30, .48, .045, .038], [.54, .47, .065, .045],
      [.76, .34, .045, .050], [.43, .67, .055, .045],
      [.75, .61, .055, .040]
    ] : getCampusSimulation(school.id).areas.filter(area=>area.category!=='outdoor').map(area=>[area.x,area.y,area.rx,area.ry]);
    for (let index = 0; index < simulation.count; index++) {
      const pick = hashUnit(`${simulation.seed}:${minute}:${index}:pick`);
      let point;
      if (simulation.mode === 'point' && pick >= .35) {
        point = pointNearCampus(school.id,`${simulation.seed}:${minute}:${index}`,{x:simulation.centerX,y:simulation.centerY},.055,.045);
      } else if (simulation.mode === 'clusters' && pick >= .35) {
        const choice = hashUnit(`${simulation.seed}:${minute}:${index}:hotspot`);
        const center = hotspots[Math.min(hotspots.length - 1, Math.floor(choice * hotspots.length))];
        point = pointNearCampus(school.id,`${simulation.seed}:${minute}:${index}`,{x:center[0],y:center[1]},center[2],center[3]);
      } else {
        point = randomMapPoint(school.id,`${simulation.seed}:${minute}:${index}`);
      }
      const { x, y } = point;
      reports.push({
        anonymousId: `sim-${index}`,
        imageX:x,imageY:y,
        simulated: true
      });
    }
  }
  const cfg = school.grid;
  const cells = new Map();
  const dots = [];
  for (const entry of reports) {
    const point = entry.simulated && Number.isFinite(entry.imageX) && Number.isFinite(entry.imageY)
      ? { x: entry.imageX, y: entry.imageY, inside: true } : reportPoint(school, entry);
    if (!point.inside || entry.simulated && school.id !== 'csuft' && !insideCampusMap(school.id,point.x,point.y)) continue;
    if (entry.simulated) dots.push({ x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 });
    const col = Math.min(cfg.columns - 1, Math.floor(point.x * cfg.columns));
    const row = Math.min(cfg.rows - 1, Math.floor(point.y * cfg.rows));
    const key = `${col}:${row}`;
    if (!cells.has(key)) cells.set(key, { col, row, people: [] });
    cells.get(key).people.push({ ...point, simulated: Boolean(entry.simulated) });
  }
  const grids = [...cells.values()].map(cell => ({
    col: cell.col, row: cell.row, x: cell.col / cfg.columns, y: cell.row / cfg.rows,
    width: 1 / cfg.columns, height: 1 / cfg.rows, count: cell.people.length,
    level: cell.people.length >= cfg.redAt ? 'red' : cell.people.length >= cfg.yellowAt ? 'yellow' : 'green'
  }));
  const minute = Math.floor(now / 60000);
  for (const cell of cells.values()) {
    const realPeople = cell.people.filter(point => !point.simulated);
    if (realPeople.length < MIN_DOT_GROUP) continue;
    realPeople.forEach((point, index) => {
      const jitterX = (hashUnit(`${school.id}:${cell.col}:${cell.row}:${minute}:${index}:x`) - 0.5) * (0.7 / cfg.columns);
      const jitterY = (hashUnit(`${school.id}:${cell.col}:${cell.row}:${minute}:${index}:y`) - 0.5) * (0.7 / cfg.rows);
      dots.push({ x: Math.max(0, Math.min(1, point.x + jitterX)), y: Math.max(0, Math.min(1, point.y + jitterY)) });
    });
  }
  return {
    schoolId: school.id, generatedAt: now, activeUsers: reports.length,
    realUsers: reports.filter(entry => !entry.simulated).length,
    simulatedUsers: reports.filter(entry => entry.simulated).length,
    dataWindowSeconds: ACTIVE_MS / 1000, grids, dots,
    simulation: simulation ? { schoolId:school.id, running: true, count: simulation.count, mode: simulation.mode, startedAt: simulation.startedAt, seed:simulation.seed, centerX:simulation.centerX, centerY:simulation.centerY, timeMode: simulation.timeMode || 'auto', timeMinutes: simulation.timeMinutes || 0, routine } : { schoolId:school.id, running: false, count: 0 },
    privacy: { minDotGroup: MIN_DOT_GROUP, exactCoordinatesExposed: false }
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    const school = schools.find(item => item.id === url.searchParams.get('schoolId'));

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, platform: 'cloudflare-workers', revision: API_REVISION, time: Date.now() });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/schools') {
      return json({ schools: schools.map(item => publicSchool(item, url.origin)) });
    }
    if (request.method === 'GET' && url.pathname === '/api/v1/crowd') {
      // Keep expensive generation/aggregation in the Durable Object. Relaying
      // its Response avoids parsing and encoding 10,000 dots in this Worker.
      return school ? crowdRequest(env, `/crowd?schoolId=${encodeURIComponent(school.id)}`) : json({ error: '学校不存在' }, 404);
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/location') {
      try {
        const input = locationInput(await request.json());
        if (input.error) return json({accepted:false,error:input.error},input.status);
        return crowdRequest(env, '/location', { method:'POST',body:JSON.stringify(input.value) });
      } catch (error) {
        return json({ accepted: false, error: error.message }, 400);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/leave') {
      try {
        const body = await request.json();
        const target = getSchool(body.schoolId);
        if (!target) return json({removed:false,error:'学校不存在'},404);
        if (!target.sharedLocationEnabled) return json({removed:false,error:'此校区未开启共享定位'},422);
        if (!body.anonymousId) return json({removed:false,error:'匿名编号缺失'},400);
        return crowdRequest(env, '/leave', { method: 'POST', body: JSON.stringify({ schoolId: body.schoolId, anonymousId: body.anonymousId }) });
      } catch (error) {
        return json({ removed: false, error: error.message }, 400);
      }
    }
    if (request.method === 'POST' && url.pathname === '/api/v1/simulation') {
      try {
        const input = simulationInput(await request.json());
        if (input.error) return json({error:input.error},input.status);
        return crowdRequest(env, '/simulation', { method:'POST',body:JSON.stringify(input.value) });
      } catch (error) {
        return json({ error: error.message }, 400);
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
      const crowdResponse = await crowdRequest(env, `/crowd-summary?schoolId=${encodeURIComponent(school.id)}`);
      const crowd = await crowdResponse.json();
      return json({
        available: true, schoolId: school.id, weatherAvailable: Boolean(weather), weather,
        crowd: { activeUsers: crowd.activeUsers, redCells: crowd.redCells },
        recommendation: adviceFor(url.searchParams.get('purpose'), weather, crowd)
      });
    }
    if (url.pathname.startsWith('/api/')) return json({ error: '接口不存在' }, 404);
    return env.ASSETS.fetch(request);
  }
};

