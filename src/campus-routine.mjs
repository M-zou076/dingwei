import { generateRoutine, routineSummary, shanghaiTimeMinutes } from './student-routine.mjs';
import { getCampusSimulation, insideCampus } from './campus-maps.mjs';

// Illustrative weekday models, not enrollment measurements or actual timetables.
const categories = ['teaching','dorm','dining','study','outdoor'];
const starts = [0,410,455,720,765,815,1080,1140,1320];
const profiles = {
  arts: {morning:[.77,.08,0,.07,.08],afternoon:[.75,.09,0,.08,.08],evening:[.42,.29,0,.21,.08]},
  medical: {morning:[.82,.06,0,.04,.08],afternoon:[.81,.06,0,.05,.08],evening:[.32,.33,0,.27,.08]},
  comprehensive: {morning:[.78,.07,0,.07,.08],afternoon:[.76,.08,0,.08,.08],evening:[.34,.28,0,.30,.08]},
  normal: {morning:[.79,.07,0,.06,.08],afternoon:[.77,.08,0,.07,.08],evening:[.38,.30,0,.24,.08]},
  compact: {morning:[.74,.12,0,.06,.08],afternoon:[.72,.13,0,.07,.08],evening:[.30,.38,0,.24,.08]}
};
export function unit(text) {
  let hash=2166136261;
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;hash=Math.imul(hash,0x846ca68b);hash^=hash>>>16;
  return (hash>>>0)/4294967296;
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const point=([x,y])=>({x,y});
const normalizeTime=n=>Number.isFinite(Number(n))?((Number(n)%1440)+1440)%1440:0;
const quantize=p=>({x:Math.round(p.x*10000)/10000,y:Math.round(p.y*10000)/10000});
function safeQuantize(id,p) {
  const q=quantize(p);if(insideCampus(id,q.x,q.y))return q;
  // A corridor grazing a polygon corner or 4-decimal rounding can put a dot
  // just outside the traced outline. Keep it on the adjacent permitted pixel,
  // never drop an individual or move it to a different campus/building.
  for(let radius=1;radius<=20;radius++)for(const [dx,dy]of [[radius,0],[-radius,0],[0,radius],[0,-radius],[radius,radius],[-radius,radius],[radius,-radius],[-radius,-radius]]){
    const candidate=quantize({x:q.x+dx/10000,y:q.y+dy/10000});
    if(insideCampus(id,candidate.x,candidate.y))return candidate;
  }
  throw new Error(`Routine leaves ${id}: ${q.x}/${q.y}`);
}
function segmentInside(id,a,b) {
  const steps=Math.max(3,Math.ceil(distance(a,b)/.008));
  for(let i=0;i<=steps;i++) if(!insideCampus(id,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps)) return false;
  return true;
}
const networks=new Map();
function roadNetwork(id) {
  if(networks.has(id))return networks.get(id);
  const nodes=[],edges=[],indexes=new Map();
  const node=p=>{const key=p.join(':');if(indexes.has(key))return indexes.get(key);const index=nodes.length;nodes.push(point(p));edges.push([]);indexes.set(key,index);return index;};
  for(const road of getCampusSimulation(id).roads) for(let i=1;i<road.length;i++){
    const a=node(road[i-1]),b=node(road[i]);
    if(!segmentInside(id,nodes[a],nodes[b]))throw new Error(`Road leaves ${id}: ${a}/${b}`);
    const length=distance(nodes[a],nodes[b]);edges[a].push({node:b,length});edges[b].push({node:a,length});
  }
  const network={nodes,edges,paths:new Map()};networks.set(id,network);return network;
}
function nearestNode(id,p) {
  const {nodes}=roadNetwork(id);
  const sorted=nodes.map((node,index)=>({index,distance:distance(p,node)})).sort((a,b)=>a.distance-b.distance);
  return sorted.find(item=>segmentInside(id,p,nodes[item.index]))?.index??null;
}
function nodePath(id,from,to) {
  const graph=roadNetwork(id),key=`${from}:${to}`;
  if(graph.paths.has(key))return graph.paths.get(key);
  const lengths=graph.nodes.map(()=>Infinity),previous=graph.nodes.map(()=>-1),visited=new Set();lengths[from]=0;
  while(visited.size<graph.nodes.length){
    let current=-1;
    for(let i=0;i<lengths.length;i++)if(!visited.has(i)&&(current<0||lengths[i]<lengths[current]))current=i;
    if(current===to||!Number.isFinite(lengths[current]))break;
    visited.add(current);
    for(const edge of graph.edges[current])if(lengths[current]+edge.length<lengths[edge.node]){lengths[edge.node]=lengths[current]+edge.length;previous[edge.node]=current;}
  }
  if(!Number.isFinite(lengths[to]))throw new Error(`Disconnected roads in ${id}`);
  const path=[];for(let node=to;node>=0;node=previous[node]){path.unshift(graph.nodes[node]);if(node===from)break;}
  graph.paths.set(key,path);return path;
}
function route(id,from,to) {
  if(distance(from,to)<.04&&segmentInside(id,from,to))return[from,to];
  const a=nearestNode(id,from),b=nearestNode(id,to);
  if(a===null||b===null)throw new Error(`Building is not connected to ${id} roads`);
  return[from,...nodePath(id,a,b),to];
}
const buildingRoutes=new Map();
function buildingRoute(id,origin,destination,from,to) {
  const key=`${id}:${origin.id}:${destination.id}`;
  let path=buildingRoutes.get(key);
  if(!path){path=route(id,origin,destination);buildingRoutes.set(key,path);}
  return[from,...path,to];
}
const pathLength=path=>path.slice(1).reduce((sum,p,i)=>sum+distance(p,path[i]),0);
function along(path,progress) {
  let remaining=pathLength(path)*Math.max(0,Math.min(1,progress));
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=distance(a,b);
    if(remaining<=length&&length>0){const t=remaining/length;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
    remaining-=length;
  }
  return{...path.at(-1)};
}
function weighted(items,salt) {
  let remaining=unit(salt)*items.reduce((sum,p)=>sum+(p.weight??1),0);
  for(const item of items){remaining-=item.weight??1;if(remaining<=0)return item;}
  return items.at(-1);
}
export function pointNearCampus(id,salt,center,rx,ry) {
  for(let attempt=0;attempt<40;attempt++){
    const radius=Math.sqrt(-2*Math.log(Math.max(.000001,unit(`${salt}:${attempt}:r`))))*.42;
    if(radius>1)continue;
    const angle=unit(`${salt}:${attempt}:a`)*Math.PI*2;
    const candidate=quantize({x:center.x+Math.cos(angle)*radius*rx,y:center.y+Math.sin(angle)*radius*ry});
    if(insideCampus(id,candidate.x,candidate.y))return candidate;
  }
  return randomCampusPoint(id,`${salt}:fallback`);
}
function atArea(id,area,salt){return pointNearCampus(id,`${salt}:${area.id}`,area,area.rx,area.ry);}
export function randomCampusPoint(id,salt) {
  const map=getCampusSimulation(id);
  if(!map)throw new Error('Unknown campus');
  if(id==='csuft'){
    for(let attempt=0;attempt<100;attempt++){
      const x=.15+unit(`${salt}:${attempt}:x`)*.75,y=.06+unit(`${salt}:${attempt}:y`)*.73;
      if(insideCampus(id,x,y))return{x,y};
    }
    return{x:.5,y:.5};
  }
  // People occupy buildings and roads, not the blank parchment around the drawing.
  if(unit(`${salt}:kind`)<.55){const area=weighted(map.areas,`${salt}:area`);return atArea(id,area,salt);}
  const road=map.roads[Math.floor(unit(`${salt}:road`)*map.roads.length)].map(point);
  const candidate=quantize(along(road,unit(`${salt}:progress`)));
  return insideCampus(id,candidate.x,candidate.y)?candidate:quantize(road[0]);
}

export function campusRoutineSummary(schoolId,timeMinutes) {
  const map=getCampusSimulation(schoolId);if(!map)throw new Error('Unknown campus');
  const summary=routineSummary(timeMinutes),custom=profiles[map.profile]?.[summary.period];
  return {...summary,schoolId,weights:custom?Object.fromEntries(categories.map((category,i)=>[category,custom[i]])):summary.weights,
    note:'按各校区图中建筑与假设工作日作息生成；人数、比例、步行速度均为模拟参数，不代表学校实测数据。'};
}
function activity(student,summary) {
  const pick=unit(`${student}:activity`);let total=summary.weights.outdoor;
  if(pick<total)return'outdoor';
  for(const category of ['teaching','dining','study','dorm']){total+=summary.weights[category];if(pick<total)return category;}
  return'dorm';
}
function target(id,student,category,phase) {
  const areas=getCampusSimulation(id).areas;
  const candidates=areas.filter(area=>area.category===category);
  return weighted(candidates,`${student}:${category}:${category==='teaching'?phase.period:'stable'}`);
}
function outdoor(id,student,minute) {
  const map=getCampusSimulation(id),sports=map.areas.filter(area=>area.kind==='sport');
  if(unit(`${student}:sport-or-road`)<map.sportShare){const area=weighted(sports,`${student}:sport`);return{...atArea(id,area,student),place:area.name,moving:false};}
  const road=map.roads[Math.floor(unit(`${student}:road`)*map.roads.length)].map(point);
  const cycle=(minute/120+unit(`${student}:walk-phase`)*2)%2;
  return{...along(road,cycle<=1?cycle:2-cycle),place:'校区道路',moving:true};
}
export function generateCampusRoutine({schoolId='csuft',count,seed='weekday',timeMinutes=shanghaiTimeMinutes()}={}) {
  if(schoolId==='csuft')return generateRoutine({count,seed,timeMinutes}); // Preserve the v2.6 CSuft model exactly.
  if(!getCampusSimulation(schoolId))throw new Error('Unknown campus');
  const total=Number.isFinite(Number(count))?Math.max(0,Math.min(10000,Math.floor(Number(count)))):0;
  const minute=normalizeTime(timeMinutes),summary=campusRoutineSummary(schoolId,minute);
  const start=starts.filter(n=>n<=minute).at(-1),previous=campusRoutineSummary(schoolId,start===0?1439:start-.001);
  const counts=Object.fromEntries(categories.map(category=>[category,0])),points=[];
  for(let i=0;i<total;i++){
    const id=`${schoolId}-routine-${i}`,student=`${seed}:${id}`;
    let category=activity(student,summary),position,place,moving=false;
    if(category==='outdoor'){const p=outdoor(schoolId,student,minute);position=p;place=p.place;moving=p.moving;}
    else{
      const destination=target(schoolId,student,category,summary),end=atArea(schoolId,destination,student);
      position=end;place=destination.name;
      if(start!==0&&minute<start+30){
        const oldCategory=activity(student,previous),origin=target(schoolId,student,oldCategory,previous),begin=atArea(schoolId,origin,student);
        const departure=start+unit(`${student}:${start}:depart`)*15;
        if(minute<=departure){position=begin;category=oldCategory;place=origin.name;}
        else if(origin.id!==destination.id){
          const path=buildingRoute(schoolId,origin,destination,begin,end),duration=5+Math.min(7,pathLength(path)*15)+unit(`${student}:${start}:duration`)*3;
          const progress=(minute-departure)/duration;
          if(progress<1){position=along(path,progress);category='outdoor';place=`前往${destination.name}`;moving=true;}
        }
      }
    }
    const q=safeQuantize(schoolId,position);
    counts[category]++;points.push({id,...q,category,place,moving});
  }
  return{points,summary:{...summary,counts}};
}
