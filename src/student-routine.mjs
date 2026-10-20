// Illustrative weekday routines, not measured enrollment or a real timetable.
// Image-space centers were read from the user's pdf-west-20261013 campus map.
export const ROUTINE_MAP_VERSION = 'pdf-west-20261013';

const area = (id, name, category, x, y, rx, ry, rotation = 0) =>
  Object.freeze({ id, name, category, x, y, rx, ry, rotation });

export const ROUTINE_AREAS = Object.freeze([
  area('zhishan', '至善楼', 'teaching', .340, .453, .020, .009, -12),
  area('chengyi', '诚意楼', 'teaching', .319, .475, .020, .010, 12),
  area('jiangxin', '匠心楼', 'teaching', .356, .491, .018, .010, 12),
  area('zhiyu', '知语楼', 'teaching', .416, .513, .019, .010, 12),
  area('derun', '德润楼', 'teaching', .314, .535, .024, .013, 12),
  area('yifu', '逸夫楼', 'teaching', .694, .267, .016, .023, -15),
  area('jingshi', '经世楼', 'teaching', .660, .333, .015, .017, -15),
  area('qiushi', '求是楼', 'teaching', .717, .397, .015, .011, -15),
  area('qiuxin', '求新楼', 'teaching', .728, .449, .014, .011, -15),
  area('chongde', '崇德楼', 'teaching', .804, .562, .020, .009, 15),
  area('library-east', '图书馆东馆', 'study', .612, .459, .020, .022, 15),
  area('library-west', '图书馆西馆', 'study', .297, .385, .019, .014, 15),
  area('west-1', '西园1栋', 'dorm', .271, .503, .013, .009, 15),
  area('west-3', '西园3栋', 'dorm', .270, .535, .013, .009, 15),
  area('west-6', '西园6栋', 'dorm', .304, .574, .014, .008, 15),
  area('west-9', '西园9栋', 'dorm', .259, .648, .009, .015, 15),
  area('west-13', '西园13栋', 'dorm', .279, .663, .013, .009, 15),
  area('west-21', '西园21栋', 'dorm', .422, .653, .015, .010, 15),
  area('east-1', '东园1栋', 'dorm', .500, .357, .011, .006, -15),
  area('east-4', '东园4栋', 'dorm', .521, .375, .013, .008, -15),
  area('east-7', '东园7栋', 'dorm', .511, .420, .013, .008, -15),
  area('east-10', '东园10栋', 'dorm', .536, .426, .013, .008, -15),
  area('east-12', '东园12栋', 'dorm', .526, .482, .013, .008, -15),
  area('east-17', '东园17栋', 'dorm', .553, .508, .010, .008, -15),
  area('east-21', '东园21栋', 'dorm', .543, .585, .013, .008, 8),
  area('east-25', '东园25栋', 'dorm', .571, .610, .013, .008, 8),
  area('east-29', '东园29栋', 'dorm', .674, .639, .013, .008, 25),
  area('east-31', '东园31栋', 'dorm', .649, .704, .012, .008, -5),
  area('dining-linhai', '林海餐厅', 'dining', .511, .374, .012, .009, -15),
  area('dining-linyuan', '林苑餐厅', 'dining', .412, .582, .013, .010, 12),
  area('dining-linxin', '林馨餐厅', 'dining', .312, .595, .013, .010, 12),
  area('outdoor-west', '西园道路与操场周边', 'outdoor', .335, .623, .060, .065),
  area('outdoor-east', '东园道路与操场周边', 'outdoor', .586, .457, .060, .080)
]);

const categories = ['teaching', 'dorm', 'dining', 'study', 'outdoor'];
const byCategory = category => ROUTINE_AREAS.filter(place => place.category === category);
const dorms = byCategory('dorm'), classrooms = byCategory('teaching');
const diningRooms = byCategory('dining'), studyRooms = byCategory('study');

// Anchors start a staggered departure window. Most people reach the next
// activity within 30 minutes. The 8% outdoor cohort persists all day.
const PHASES = [
  { start: 0, id: 'night', label: '夜间：宿舍休息为主', weights: { teaching: 0, dorm: .89, dining: 0, study: .03, outdoor: .08 } },
  { start: 410, id: 'breakfast', label: '早餐与课前准备', weights: { teaching: .07, dorm: .50, dining: .35, study: 0, outdoor: .08 } },
  { start: 455, id: 'morning', label: '上午：教学楼上课为主', weights: { teaching: .80, dorm: .08, dining: 0, study: .04, outdoor: .08 } },
  { start: 720, id: 'lunch', label: '午餐：从教学楼前往食堂与宿舍', weights: { teaching: .04, dorm: .35, dining: .50, study: .03, outdoor: .08 } },
  { start: 765, id: 'rest', label: '午休：宿舍为主，少量就餐与自习', weights: { teaching: .04, dorm: .72, dining: .12, study: .04, outdoor: .08 } },
  { start: 815, id: 'afternoon', label: '下午：教学楼上课为主', weights: { teaching: .77, dorm: .09, dining: 0, study: .06, outdoor: .08 } },
  { start: 1080, id: 'dinner', label: '晚餐：食堂与宿舍为主', weights: { teaching: .04, dorm: .36, dining: .48, study: .04, outdoor: .08 } },
  { start: 1140, id: 'evening', label: '晚间：部分晚课、图书馆自习与宿舍', weights: { teaching: .36, dorm: .30, dining: 0, study: .26, outdoor: .08 } },
  { start: 1320, id: 'night', label: '夜间：宿舍休息为主', weights: { teaching: 0, dorm: .89, dining: 0, study: .03, outdoor: .08 } }
];

function unit(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function normalizeTime(value) {
  const minute = Number(value);
  return Number.isFinite(minute) ? ((minute % 1440) + 1440) % 1440 : 0;
}

export function shanghaiTimeMinutes(timestamp = Date.now()) {
  return normalizeTime(Number(timestamp) / 60000 + 480);
}

function phaseAt(minute) {
  let index = 0;
  for (let i = 1; i < PHASES.length; i++) if (minute >= PHASES[i].start) index = i;
  return { phase: PHASES[index], previous: PHASES[Math.max(0, index - 1)] };
}

export function routineSummary(timeMinutes) {
  const minute = normalizeTime(timeMinutes), { phase } = phaseAt(minute);
  return {
    label: phase.label, period: phase.id,
    timeLabel: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(Math.floor(minute % 60)).padStart(2, '0')}`,
    weights: { ...phase.weights },
    note: '按工作日作息假设生成，人数和比例为模拟参数，不代表学校实测数据。'
  };
}

function categoryFor(student, phase) {
  const pick = unit(`${student}:activity`);
  if (pick < phase.weights.outdoor) return 'outdoor';
  let threshold = phase.weights.outdoor;
  // Consistent quantiles retain a student's evening-course membership instead
  // of rerolling the whole population on each request.
  for (const category of ['teaching', 'dining', 'study', 'dorm']) {
    threshold += phase.weights[category];
    if (pick < threshold) return category;
  }
  return 'dorm';
}

function select(items, student, salt) {
  return items[Math.floor(unit(`${student}:${salt}`) * items.length)];
}

function homeFor(student) { return select(dorms, student, 'home'); }

function targetArea(student, category, phase) {
  const home = homeFor(student);
  if (category === 'dorm') return home;
  if (category === 'study') return select(studyRooms, student, 'study');
  if (category === 'dining') {
    const nearest = [...diningRooms].sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
    // Most students use a canteen near their dorm, with some cross-campus use.
    return unit(`${student}:canteen-choice`) < .76 ? nearest[0] : select(diningRooms, student, 'canteen');
  }
  const local = classrooms.filter(place => (home.x < .46) === (place.x < .46));
  return unit(`${student}:${phase.id}:same-campus`) < .80
    ? select(local, student, `${phase.id}:classroom`)
    : select(classrooms, student, `${phase.id}:classroom`);
}

function pointAtArea(place, student) {
  // Truncated Gaussian inside a small rotated ellipse, tied to a named
  // building footprint. Independent axes avoid diagonal strips or box edges.
  for (let attempt = 0; attempt < 24; attempt++) {
    const radius = Math.sqrt(-2 * Math.log(Math.max(.000001, unit(`${student}:${place.id}:${attempt}:radius`)))) * .42;
    if (radius > 1) continue;
    const angle = unit(`${student}:${place.id}:${attempt}:angle`) * Math.PI * 2;
    const dx = Math.cos(angle) * radius * place.rx, dy = Math.sin(angle) * radius * place.ry;
    const turn = place.rotation * Math.PI / 180;
    return { x: place.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: place.y + dx * Math.sin(turn) + dy * Math.cos(turn) };
  }
  return { x: place.x, y: place.y };
}

// Approximate campus corridors traced on the same map. Routes pass through
// 林科大桥 between east/west dorm zones instead of crossing the grey background.
const NODES = [
  [.246,.417], [.309,.440], [.370,.474], [.405,.508], [.417,.568], [.337,.622], [.273,.544],
  [.478,.434], [.505,.548], [.520,.639], [.516,.381], [.549,.464], [.590,.549],
  [.633,.443], [.708,.392], [.653,.291], [.754,.547], [.677,.654]
];
const LINKS = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,1],[3,8],[2,7],[7,10],[10,11],[11,8],[8,9],[8,12],[12,13],[13,14],[14,15],[15,10],[14,16],[16,17],[17,9],[12,17],[11,13]];
const graph = NODES.map(() => []);
for (const [a,b] of LINKS) {
  const distance = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
  graph[a].push({ node: b, distance }); graph[b].push({ node: a, distance });
}

function nearestNode(point) {
  let result = 0, distance = Infinity;
  NODES.forEach(([x,y], index) => {
    const candidate = Math.hypot(x - point.x, y - point.y);
    if (candidate < distance) { distance = candidate; result = index; }
  });
  return result;
}

const pathCache = new Map();
function corridorPath(fromNode, toNode) {
  const key = `${fromNode}:${toNode}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const distances = NODES.map(() => Infinity), previous = NODES.map(() => -1), visited = new Set();
  distances[fromNode] = 0;
  while (visited.size < NODES.length) {
    let current = -1;
    for (let i = 0; i < NODES.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current === toNode || !Number.isFinite(distances[current])) break;
    visited.add(current);
    for (const edge of graph[current]) {
      const next = distances[current] + edge.distance;
      if (next < distances[edge.node]) { distances[edge.node] = next; previous[edge.node] = current; }
    }
  }
  const route = [];
  for (let node = toNode; node >= 0; node = previous[node]) { route.unshift({ x: NODES[node][0], y: NODES[node][1] }); if (node === fromNode) break; }
  pathCache.set(key, route);
  return route;
}

function routeBetween(from, to) {
  if (Math.hypot(to.x - from.x, to.y - from.y) < .04) return [from, to];
  return [from, ...corridorPath(nearestNode(from), nearestNode(to)), to];
}

function pathLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
  return length;
}

function alongPath(path, progress) {
  let remaining = pathLength(path) * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length && length > 0) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return { ...path[path.length - 1] };
}

function outdoorPoint(student, minute) {
  const route = unit(`${student}:outdoor-zone`) < .45 ? [1,2,3,4,5,6,1] : [10,11,13,14,15,10];
  const path = route.map(index => ({ x: NODES[index][0], y: NODES[index][1] }));
  // A visible illustrative stroll, not a measured walking speed. Sixteen
  // minutes divides a full day exactly, so wrapping the clock at midnight
  // cannot jump a person to a different point on this closed corridor loop.
  const progress = (minute / 16 + unit(`${student}:walking-phase`)) % 1;
  const point = alongPath(path, progress);
  return { x: point.x + (unit(`${student}:lane-x`) - .5) * .005, y: point.y + (unit(`${student}:lane-y`) - .5) * .005 };
}

export function generateRoutine({ count, seed = 'weekday', timeMinutes = shanghaiTimeMinutes() } = {}) {
  const total = Number.isFinite(Number(count)) ? Math.max(0, Math.min(10000, Math.floor(Number(count)))) : 0;
  const minute = normalizeTime(timeMinutes), { phase, previous } = phaseAt(minute);
  const counts = Object.fromEntries(categories.map(category => [category, 0]));
  const points = [];
  for (let index = 0; index < total; index++) {
    const id = `routine-${index}`, student = `${String(seed)}:${id}`;
    let category = categoryFor(student, phase), place, point, moving = false;
    if (category === 'outdoor') {
      point = outdoorPoint(student, minute); place = '校园道路'; moving = true;
    } else {
      const target = targetArea(student, category, phase), targetPoint = pointAtArea(target, student);
      if (phase === previous || minute >= phase.start + 30) {
        // Stable lesson/rest periods need no route construction at all.
        point = targetPoint; place = target.name;
      } else {
        const oldCategory = categoryFor(student, previous), oldPlace = targetArea(student, oldCategory, previous), fromPoint = pointAtArea(oldPlace, student);
        const departure = phase.start + unit(`${student}:${phase.start}:depart`) * 15;
        const route = routeBetween(fromPoint, targetPoint);
        const duration = 5 + Math.min(7, pathLength(route) * 15) + unit(`${student}:${phase.start}:duration`) * 3;
        const progress = (minute - departure) / duration;
        if (progress <= 0) { point = fromPoint; category = oldCategory; place = oldPlace.name; }
        else if (progress < 1 && oldPlace.id !== target.id) {
          point = alongPath(route, progress); category = 'outdoor'; place = `前往${target.name}`; moving = true;
        } else { point = targetPoint; place = target.name; }
      }
    }
    counts[category]++;
    points.push({ id, x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000, category, place, moving });
  }
  return { points, summary: { ...routineSummary(minute), counts } };
}
