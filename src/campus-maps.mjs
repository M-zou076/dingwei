import { ROUTINE_AREAS } from './student-routine.mjs';

// Traced in full-image coordinates from the five user-supplied illustrated maps.
// These are illustrative image footprints, NOT geographic campus boundaries.
export const HUNNU_MAP_VERSION = 'hunnu-illustrated-20261015';
const place = (id, name, category, x, y, rx = .018, ry = .012, weight = 1, kind) =>
  ({ id, name, category, x, y, rx, ry, rotation: 0, weight, ...(kind ? { kind } : {}) });
const rectangle = (left, top, right, bottom) => [[left,top],[right,top],[right,bottom],[left,bottom]];
const west = [
  [[.24,.26],[.31,.32],[.39,.43],[.50,.49],[.53,.78],[.27,.78],[.15,.71],[.15,.45]],
  [[.40,.43],[.54,.31],[.71,.23],[.82,.28],[.88,.62],[.74,.67],[.65,.78],[.51,.73],[.46,.55]],
  [[.71,.13],[.83,.07],[.89,.35],[.76,.37]]
];

const maps = {
  csuft: { polygons: west, excludedPolygons: [], areas: ROUTINE_AREAS, roads: [], sportShare: .35 },
  'hunnu-nanyuan': {
    polygons: [
      [[.15,.22],[.29,.21],[.30,.18],[.37,.18],[.40,.28],[.58,.31],[.61,.39],[.55,.435],[.30,.49],[.18,.44],[.12,.34]],
      [[.33,.49],[.55,.43],[.67,.46],[.835,.455],[.835,.65],[.69,.71],[.53,.72],[.36,.65]],
      [[.28,.46],[.58,.405],[.60,.46],[.34,.54]]
    ],
    excludedPolygons: [rectangle(.185,.255,.278,.298)], // marked parking, not buildings
    areas: [
      place('nyi-yi','弈艺楼','teaching',.330,.199,.018,.008),
      place('nyi-yinyue','音乐楼','teaching',.345,.270,.025,.009,1.4),
      place('nyi-design','设计楼','teaching',.354,.331,.027,.015,1.6),
      place('nyi-theatre','实验剧院','teaching',.240,.358,.024,.012),
      place('nyi-zhiwu','知物楼','teaching',.240,.313,.020,.010),
      place('nyi-art','美术楼','teaching',.370,.425,.025,.010,1.4),
      place('nyi-hele','和乐楼','teaching',.463,.379,.030,.014,1.4),
      place('nyi-dele','德乐楼','teaching',.548,.336,.026,.010),
      place('nyi-qinle','勤乐楼','study',.444,.410,.018,.007),
      place('nyi-zhiya','韶乐楼','study',.451,.435,.024,.008),
      place('nyi-sport-teach','体育教学楼','teaching',.612,.669,.022,.026,1.3),
      place('nyi-dorm-6','南院6栋','dorm',.199,.231,.014,.007),
      place('nyi-dorm-5','南院5栋','dorm',.251,.231,.014,.007),
      place('nyi-dorm-4','南院4栋','dorm',.402,.520,.026,.012),
      place('nyi-dorm-2','南院2栋','dorm',.498,.543,.028,.010),
      place('nyi-dorm-1','南院1栋','dorm',.473,.583,.028,.010),
      place('nyi-dorm-3','南院3栋','dorm',.532,.583,.012,.010),
      place('nyi-dining-north','北区食堂','dining',.172,.335,.011,.014),
      place('nyi-dining-south','南院食堂','dining',.393,.575,.012,.026,1.6),
      place('nyi-stadium','田径场','outdoor',.759,.557,.032,.055,1.8,'sport'),
      place('nyi-gym','行健馆','outdoor',.615,.505,.028,.037,1.4,'sport'),
      place('nyi-swim','游泳馆','outdoor',.505,.632,.027,.015,1,'sport')
    ],
    roads: [
      [[.180,.246],[.176,.335],[.205,.398],[.283,.452],[.386,.468],[.537,.426],[.576,.386],[.548,.354]],
      [[.283,.452],[.354,.517],[.425,.522],[.446,.555],[.555,.555],[.574,.619],[.571,.686],[.646,.690]],
      [[.425,.522],[.393,.550],[.424,.612],[.505,.615],[.574,.619]],
      [[.555,.555],[.683,.552],[.690,.486],[.804,.486],[.808,.646],[.683,.654],[.574,.619]],
      [[.205,.398],[.289,.365],[.295,.302],[.300,.246],[.330,.223]],
      [[.289,.365],[.384,.366],[.386,.415],[.386,.468]]
    ],
    sportShare: .60, profile: 'arts'
  },
  'hunnu-xianjiahu': {
    polygons: [
      [[.297,.045],[.550,.040],[.741,.062],[.771,.674],[.719,.765],[.590,.769],[.590,.958],[.302,.979],[.185,.690],[.173,.461],[.240,.321]],
      [[.050,.724],[.181,.714],[.236,.975],[.065,.982]],
      rectangle(.155,.730,.300,.782)
    ],
    excludedPolygons: [],
    areas: [
      place('xjh-main','医学院教学综合楼','teaching',.390,.126,.064,.042,2),
      place('xjh-renyi','仁医楼','teaching',.657,.160,.050,.071,1.8),
      place('xjh-pharmacy','药学系','teaching',.420,.250,.045,.020,1.2),
      place('xjh-yaren','雅人楼','teaching',.282,.396,.064,.018,1.2),
      place('xjh-qinyi','勤医楼','teaching',.411,.468,.033,.022),
      place('xjh-selfstudy','教学综合楼自习区','study',.390,.168,.045,.012),
      place('xjh-a','医学院宿舍A栋','dorm',.279,.523,.041,.022),
      place('xjh-b','B栋','dorm',.245,.642,.027,.023),
      place('xjh-c','C栋','dorm',.306,.640,.027,.023),
      place('xjh-d','D栋','dorm',.420,.626,.044,.026),
      place('xjh-student-1','学生公寓1栋','dorm',.437,.911,.080,.022,1.5),
      place('xjh-student-2','学生公寓2栋','dorm',.471,.792,.060,.013),
      place('xjh-student-3','学生公寓3栋','dorm',.391,.846,.070,.012),
      place('xjh-west-1','西侧1栋','dorm',.151,.807,.016,.052),
      place('xjh-west-2','西侧2栋','dorm',.145,.952,.057,.015),
      place('xjh-food','医学院食堂','dining',.289,.736,.046,.019),
      place('xjh-track','田径场','outdoor',.649,.484,.050,.091,2,'sport')
    ],
    roads: [
      [[.302,.291],[.507,.289],[.520,.238],[.522,.058]],
      [[.507,.289],[.514,.426],[.522,.544],[.512,.688],[.568,.746],[.570,.879],[.539,.958],[.304,.964]],
      [[.302,.291],[.219,.432],[.345,.439],[.353,.532],[.393,.577],[.384,.675],[.512,.688]],
      [[.384,.675],[.236,.690],[.242,.766],[.415,.765],[.568,.746]],
      [[.242,.766],[.176,.755],[.103,.764],[.107,.907],[.185,.924]],
      [[.415,.765],[.407,.813],[.304,.830],[.304,.879],[.570,.879]],
      [[.522,.544],[.613,.616],[.728,.619],[.737,.304],[.514,.426]]
    ], sportShare: .35, profile: 'medical'
  },
  'hunnu-erlb': {
    polygons: [
      [[.160,.278],[.340,.267],[.430,.299],[.483,.353],[.483,.420],[.355,.440],[.392,.610],[.435,.699],[.514,.723],[.560,.780],[.460,.830],[.264,.824],[.252,.763],[.170,.760],[.112,.630],[.132,.440]],
      [[.632,.505],[.750,.499],[.739,.750],[.682,.813],[.550,.805],[.537,.666],[.600,.621]],
      [[.397,.735],[.550,.741],[.646,.774],[.646,.808],[.462,.821],[.397,.785]]
    ],
    excludedPolygons: [],
    areas: [
      place('elb-jingde','景德楼','teaching',.188,.324,.020,.012),
      place('elb-jingwei','经纬楼','teaching',.250,.343,.022,.018),
      place('elb-wenyuan','文渊楼','teaching',.225,.397,.039,.012,1.5),
      place('elb-zhonghe','中和楼','teaching',.227,.476,.039,.016,1.5),
      place('elb-chemistry','化学楼','teaching',.334,.490,.018,.025,1.4),
      place('elb-mulan','木兰楼','teaching',.255,.546,.020,.019),
      place('elb-zhishan','至善楼','teaching',.265,.752,.021,.027,1.5),
      place('elb-biology','生物楼','teaching',.450,.365,.017,.032,1.4),
      place('elb-tiangong','天工楼','teaching',.409,.711,.021,.026,1.3),
      place('elb-gewu','格物楼','teaching',.450,.796,.026,.013),
      place('elb-library','逸夫图书馆','study',.337,.596,.028,.035,2),
      place('elb-dorm-4','二里半4栋','dorm',.192,.570,.016,.019),
      place('elb-dorm-5','二里半5栋','dorm',.249,.605,.016,.018),
      place('elb-dorm-3','二里半3栋','dorm',.263,.668,.020,.010),
      place('elb-dorm-2','二里半2栋','dorm',.197,.704,.014,.012),
      place('elb-dorm-1','二里半宿舍1栋','dorm',.198,.749,.020,.010),
      place('elb-dorm-6','二里半6栋','dorm',.122,.600,.010,.014),
      place('elb-dorm-9','二里半9栋','dorm',.406,.320,.013,.012),
      place('elb-river-3','江边宿舍3栋','dorm',.683,.575,.015,.012),
      place('elb-river-2','江边宿舍2栋','dorm',.683,.616,.015,.012),
      place('elb-river-1','江边宿舍1栋','dorm',.675,.658,.019,.012),
      place('elb-river-4','江边宿舍4栋','dorm',.714,.581,.009,.014),
      place('elb-shiyuan','仕园食堂','dining',.196,.622,.012,.018,1.4),
      place('elb-guilan','桂兰苑食堂','dining',.198,.663,.014,.014),
      place('elb-track','田径场','outdoor',.596,.704,.022,.050,1.6,'sport'),
      place('elb-jiangwan','江湾体育馆','outdoor',.345,.720,.025,.017,1.3,'sport'),
      place('elb-tennis','网球场','outdoor',.263,.704,.018,.012,1,'sport')
    ],
    roads: [
      [[.168,.430],[.263,.431],[.309,.446],[.304,.531],[.310,.622],[.301,.688],[.303,.757],[.407,.763],[.503,.779],[.575,.788],[.666,.783]],
      [[.168,.430],[.161,.544],[.151,.620],[.185,.688],[.214,.748],[.303,.757]],
      [[.263,.431],[.264,.362],[.320,.312],[.367,.320],[.413,.350],[.426,.408],[.309,.446]],
      [[.310,.622],[.367,.645],[.393,.684],[.407,.763]],
      [[.666,.783],[.706,.703],[.725,.635],[.728,.549],[.672,.541],[.654,.636],[.623,.657],[.575,.788]],
      [[.185,.688],[.245,.655],[.310,.622]]
    ], sportShare: .45, profile: 'comprehensive'
  },
  'hunnu-taohuaping': {
    polygons: [
      [[.080,.265],[.297,.200],[.514,.185],[.516,.384],[.607,.392],[.618,.422],[.780,.340],[.964,.310],[.926,.780],[.820,.840],[.600,.890],[.380,.860],[.345,.810],[.160,.810],[.070,.700],[.030,.450]],
      [[.640,.172],[.965,.130],[.979,.310],[.793,.344],[.633,.344]]
    ],
    // Label explicitly says 田径场食堂综合体（待建）. Do not populate it.
    excludedPolygons: [rectangle(.485,.205,.650,.376), rectangle(.030,.812,.347,.990)],
    areas: [
      place('thp-third','第三教学楼','teaching',.790,.405,.067,.022,1.7),
      place('thp-second-block','第二楼','teaching',.770,.465,.072,.020,1.4),
      place('thp-second','第二教学楼','teaching',.785,.516,.055,.012,1.5),
      place('thp-first','第一教学楼','teaching',.790,.557,.057,.014,1.5),
      place('thp-sisheng','四生教学楼','teaching',.124,.566,.055,.023),
      place('thp-10','10栋','teaching',.537,.479,.040,.014),
      place('thp-9','9栋','teaching',.556,.523,.027,.010),
      place('thp-shuda','树达楼','teaching',.806,.677,.042,.029,1.4),
      place('thp-library','图书馆','study',.584,.589,.036,.022,2),
      place('thp-dorm-1','树达学生公寓1栋','dorm',.120,.459,.052,.018),
      place('thp-dorm-18','18栋','dorm',.160,.648,.037,.023),
      place('thp-dorm-17','17栋','dorm',.300,.630,.044,.022),
      place('thp-dorm-16','16栋','dorm',.191,.733,.042,.024),
      place('thp-dorm-15','15栋','dorm',.322,.713,.043,.022),
      place('thp-dorm-14','14栋','dorm',.319,.793,.063,.014,1.4),
      place('thp-food','食堂','dining',.478,.674,.016,.035,2),
      place('thp-north-court','北侧篮球场','outdoor',.242,.356,.037,.015,1,'sport'),
      place('thp-west-court','西侧篮球场','outdoor',.269,.457,.040,.019,1.2,'sport')
    ],
    roads: [
      [[.108,.394],[.190,.402],[.334,.387],[.344,.509],[.399,.563],[.492,.564],[.612,.565],[.645,.485],[.715,.426],[.894,.426]],
      [[.190,.402],[.174,.506],[.214,.579],[.344,.579],[.399,.563]],
      [[.214,.579],[.219,.674],[.251,.780],[.417,.781],[.439,.699],[.433,.620],[.399,.563]],
      [[.492,.564],[.515,.622],[.515,.733],[.548,.788],[.654,.789],[.658,.654],[.612,.565]],
      [[.612,.565],[.715,.579],[.860,.578],[.882,.477],[.894,.426]],
      [[.658,.654],[.705,.744],[.857,.748],[.897,.632],[.860,.578]]
    ], sportShare: .50, profile: 'normal'
  },
  'hunnu-zhanggongling': {
    polygons: [[[.180,.100],[.550,.100],[.610,.227],[.800,.370],[.800,.826],[.566,.832],[.470,.780],[.270,.729],[.090,.789],[.090,.530],[.180,.366]]],
    excludedPolygons: [],
    areas: [
      place('zgl-teaching','教学楼','teaching',.533,.580,.055,.042,2),
      place('zgl-comprehensive','综合楼教室','teaching',.210,.441,.038,.024),
      place('zgl-classroom','医务室旁教室','teaching',.720,.610,.045,.012),
      place('zgl-library','图书馆','study',.720,.688,.044,.024,2),
      place('zgl-mixed-dorm','综合楼宿舍','dorm',.210,.410,.038,.012),
      place('zgl-west-1','西侧学生宿舍1','dorm',.165,.539,.044,.016),
      place('zgl-west-2','西侧学生宿舍2','dorm',.170,.624,.046,.018),
      place('zgl-west-3','西侧学生宿舍3','dorm',.175,.704,.046,.018),
      place('zgl-middle-dorm','中部学生宿舍','dorm',.352,.615,.046,.018),
      place('zgl-east-dorm','东侧学生宿舍','dorm',.720,.400,.045,.017),
      place('zgl-food','食堂','dining',.351,.520,.045,.024,2),
      place('zgl-track','田径场','outdoor',.400,.230,.117,.059,2,'sport'),
      place('zgl-court','篮球场','outdoor',.500,.405,.058,.018,1.2,'sport'),
      place('zgl-shelter','风雨棚','outdoor',.723,.547,.043,.027,1,'sport')
    ],
    roads: [
      [[.270,.370],[.390,.370],[.601,.400],[.757,.444],[.653,.451],[.644,.595],[.636,.724],[.510,.758],[.347,.709],[.267,.719],[.267,.528],[.270,.370]],
      [[.267,.528],[.427,.530],[.433,.451],[.653,.451]],
      [[.427,.530],[.426,.653],[.347,.709]],
      [[.267,.719],[.132,.740],[.126,.581],[.145,.489],[.267,.528]],
      [[.270,.370],[.267,.317],[.337,.307],[.564,.308],[.575,.168],[.497,.123],[.251,.124],[.223,.262],[.267,.317]]
    ], sportShare: .65, profile: 'compact'
  }
};

const campusNames = { 'hunnu-nanyuan':'南院校区', 'hunnu-xianjiahu':'咸嘉湖校区', 'hunnu-erlb':'二里半校区', 'hunnu-taohuaping':'桃花坪校区', 'hunnu-zhanggongling':'张公岭校区' };
export const SCHOOLS = [
  { id:'csuft', universityId:'csuft', name:'中南林业科技大学', campusName:'长沙校区', mapType:'image', mapPath:'/maps/csuft-campus.jpg?v=pdf-west-20261013', mapVersion:'pdf-west-20261013', coordinateSystem:'bd09ll', bounds:{west:112.99174,east:113.01177,south:28.13487,north:28.13862}, grid:{columns:18,rows:12,yellowAt:4,redAt:8}, simulationSupported:true, simulationOnly:false, sharedLocationEnabled:true, calibration:{mode:'bounds',status:'approximate',pointCount:0}, calibrationNote:'第一阶段近似标定，可根据实测控制点继续校准。' },
  ...Object.entries(campusNames).map(([id,campusName]) => ({ id, universityId:'hunnu', name:'湖南师范大学', campusName, mapType:'image', mapPath:`/maps/${id}.jpg?v=${HUNNU_MAP_VERSION}`, mapVersion:HUNNU_MAP_VERSION, coordinateSystem:'image-normalized', grid:{columns:24,rows:24,yellowAt:4,redAt:8}, simulationSupported:true, simulationOnly:true, sharedLocationEnabled:false, calibration:{mode:'uncalibrated',status:'uncalibrated',pointCount:0}, calibrationNote:'用户提供的手绘示意图，尚无地理配准；仅支持本校区图上模拟，不接受GPS或客户端图片坐标上报。' }))
];
export const getSchool = id => SCHOOLS.find(school => school.id === id) || null;
export const getCampusSimulation = id => maps[id] || null;

export function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1; i<polygon.length; j=i++) {
    const [xi,yi] = polygon[i], [xj,yj] = polygon[j];
    const cross = (x-xi)*(yj-yi)-(y-yi)*(xj-xi);
    if (Math.abs(cross)<1e-10 && x>=Math.min(xi,xj)-1e-10 && x<=Math.max(xi,xj)+1e-10 && y>=Math.min(yi,yj)-1e-10 && y<=Math.max(yi,yj)+1e-10) return true;
    if ((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
export function insideCampus(id, x, y) {
  const map = maps[id];
  return Boolean(map && Number.isFinite(x) && Number.isFinite(y) && map.polygons.some(p=>insidePolygon(x,y,p)) && !map.excludedPolygons.some(p=>insidePolygon(x,y,p)));
}
export function simulationConfig(id) {
  const map = maps[id];
  return map ? {polygons:map.polygons,excludedPolygons:map.excludedPolygons,areas:map.areas,roads:map.roads} : null;
}
