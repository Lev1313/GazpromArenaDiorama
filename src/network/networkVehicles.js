import { setWheelDistances } from '../vehicles/wheelAnimation.js';
import {catalogById} from './vehicleCatalog.js';
import {Vector3} from 'three';
const lerp=(a,b,t)=>a+(b-a)*t;
const errors={'seat-occupied':'Место уже занято','too-far':'Подойди ближе к выбранной двери',
  'vehicle-moving':'Останови автомобиль перед посадкой или выходом','not-driver':'Управлять может только водитель',
  'unsafe-exit':'Небезопасная точка выхода','movement-rejected':'Сервер отклонил перемещение; машина остановлена',
  'reset-blocked':'Парковочное место занято','not-seated':'Место уже освобождено','already-seated':'Ты уже в автомобиле'};

/** Existing roots only. Driver predicts locally; others render a bounded snapshot buffer. */
export function createNetworkVehicles({registry,drive,seating,pedestrian,modes,remotes,drift,
  getTransport,now=()=>performance.now()}){
  const records=new Map();let ready=false,pending=null,exitPoint=null;
  const transport=()=>getTransport(),connected=()=>transport().getStatus().phase==='connected';
  function request(type,payload,point=null){
    if(!ready||!connected())return seating.feedback('Нет связи с сервером');
    if(pending)return seating.feedback('Ожидание подтверждения сервера');
    transport().flushPose();const id=transport().command(type,payload);if(id===null)return false;
    pending={id,type,time:now()};exitPoint=point;seating.feedback('Ожидание подтверждения сервера');return false;
  }
  const adapter={enter:(v,s)=>request('seat-enter',{vehicleId:v.vehicleId,seatId:s.seatId}),
    speed:id=>drive.state.active&&drive.golf.userData.vehicleId===id?drive.state.speed:records.get(id)?.state.speed??0,
    exit:point=>request('seat-exit',{pose:{x:point.x,y:point.y,z:point.z,yaw:Math.atan2(Math.sin(pedestrian.state.yaw),Math.cos(pedestrian.state.yaw)),moving:false}},point)};
  function apply(car,state){car.position.set(state.x,state.y,state.z);car.rotation.y=state.yaw;
    setWheelDistances(car,state.frontDistance,state.rearDistance,state.steer);}
  function receive(v,snap=false){
    const old=records.get(v.vehicleId);if(old&&v.revision<old.revision)return;
    const samples=snap?[]:old?.samples??[];
    if(!old||v.revision>old.revision||snap){samples.push({time:now(),state:{...v.state}});if(samples.length>32)samples.shift();}
    records.set(v.vehicleId,{...v,samples,lastRear:old?.lastRear??null,smokeTime:old?.smokeTime??0});
    const car=registry.get(v.vehicleId).car,self=transport().getStatus().playerId;
    if(snap&&(!drive.state.active||v.seats.driver!==self||pending?.type==='vehicle-reset'))apply(car,v.state);
  }
  function world(message){
    const first=!ready;ready=true;
    for(const v of message.vehicles){receive(v,true);const vehicle=registry.get(v.vehicleId);
      for(const seat of vehicle.seats)seat.occupiedBy=v.seats[seat.seatId];}
    const self=transport().getStatus().playerId,bindings=new Map();let occupied=null;
    for(const v of message.vehicles)for(const [seatId,id] of Object.entries(v.seats))if(id){bindings.set(id,{vehicleId:v.vehicleId,seatId});if(id===self)occupied={vehicleId:v.vehicleId,seatId};}
    remotes.bindSeats(bindings,registry);
    seating.applyNetworkSeat(occupied?.vehicleId??null,occupied?.seatId??null,exitPoint);
    if(pending?.type==='vehicle-reset'&&occupied?.seatId==='driver'){
      drive.state.speed=drive.state.steer=drive.state.slip=0;drive.state.lastRear=null;drive.clearKeys();}
    if(occupied?.seatId==='driver'&&(first||!drive.state.active))drive.state.speed=0;
    if(pending?.type==='seat-exit'&&!occupied){pending=null;exitPoint=null;}
  }
  function action(message){
    if(message.code==='movement-rejected'){
      const v=records.get(pedestrian.state.vehicleId);if(v){apply(registry.get(v.vehicleId).car,v.state);drive.state.speed=0;drive.clearKeys();}
    }
    if(pending?.id===message.requestId){pending=null;exitPoint=null;seating.feedback(message.ok?'':errors[message.code]??'Запрос отклонён сервером');}
    else if(!message.ok)seating.feedback(errors[message.code]??'Запрос отклонён сервером');
  }
  function start(){seating.setNetworkAdapter(adapter);drive.setResetHandler(()=>{
    if(!drive.state.active)return false;
    const r=records.get(pedestrian.state.vehicleId);if(!r||r.seats.driver!==transport().getStatus().playerId)return false;
    if(Math.abs(drive.state.speed)>.5)return seating.feedback('Останови автомобиль перед сбросом');
    const home=catalogById.get(r.vehicleId);
    if(drive.blocked(new Vector3(home.x,home.y,home.z),home.yaw))return seating.feedback('Парковочное место перекрыто');
    return request('vehicle-reset',{vehicleId:r.vehicleId});});modes.setNetworkMode(true);}
  function disconnected(){ready=false;drive.clearKeys();if(drive.state.active)drive.stopDriving({restoreCamera:false});pending=null;exitPoint=null;
    for(const v of registry.vehicles)v.car.userData.networkDriver=false;}
  function clear(){disconnected();seating.setNetworkAdapter(null);drive.setResetHandler(null);
    if(seating.isSeated())seating.applyNetworkSeat(null,null);
    for(const v of registry.vehicles){for(const seat of v.seats)seat.occupiedBy=null;v.car.userData.networkMoving=false;v.car.userData.networkDriver=false;}
    remotes.bindSeats(new Map(),registry);records.clear();modes.setNetworkMode(false);}
  function update(dt){
    if(!ready)return;
    if(pending&&now()-pending.time>6000){seating.feedback('Сервер не подтвердил запрос. Переподключись');pending=null;exitPoint=null;}
    const time=now()-120,self=transport().getStatus().playerId;
    for(const record of records.values()){
      const car=registry.get(record.vehicleId).car;
      car.userData.networkDriver=Boolean(record.seats.driver)&&record.seats.driver!==self;
      if(record.seats.driver===self&&drive.state.active){car.userData.networkMoving=false;continue;}
      const samples=record.samples;while(samples.length>2&&samples[1].time<=time)samples.shift();
      const a=samples[0],b=samples[1]??a,t=a===b?0:Math.max(0,Math.min(1,(time-a.time)/Math.max(1,b.time-a.time)));
      const state={...b.state};for(const k of ['x','y','z','speed','steer','frontDistance','rearDistance'])state[k]=lerp(a.state[k],b.state[k],t);
      state.yaw=a.state.yaw+Math.atan2(Math.sin(b.state.yaw-a.state.yaw),Math.cos(b.state.yaw-a.state.yaw))*t;
      const distance=Math.hypot(car.position.x-state.x,car.position.z-state.z);apply(car,state);
      car.userData.networkMoving=Boolean(record.seats.driver)&&Math.abs(state.speed)>.05;
      if(drift&&distance>.001&&state.handbrake&&Math.abs(state.speed)>2){
        const rear=drift.rearPoints(car);if(record.lastRear){for(let j=0;j<2;j++)drift.addSkid(record.lastRear[j],rear[j]);drift.refreshSkids();}
        record.lastRear=rear;record.smokeTime+=dt;
        if(drift.smokeEnabled&&record.smokeTime>.12){drift.emitSmoke(rear[0],car.rotation.y);record.smokeTime=0;}
      }else record.lastRear=null;
    }
  }
  return {start,clear,disconnected,world,receive,action,update,
    get ready(){return ready;},get remoteDriver(){return registry.vehicles.find(v=>v.car.userData.networkDriver)?.car??null;},
    localState(){
      if(!ready||!drive.state.active||!connected()||pedestrian.state.mode!=='driver'||pending)return null;
      const id=pedestrian.state.vehicleId,r=records.get(id);if(r?.seats.driver!==transport().getStatus().playerId)return null;
      const car=registry.get(id).car,wheels=car.userData.wheels??[];
      return {vehicleId:id,state:{x:car.position.x,y:car.position.y,z:car.position.z,
        yaw:Math.atan2(Math.sin(car.rotation.y),Math.cos(car.rotation.y)),speed:drive.state.speed,steer:drive.state.steer,
        handbrake:drive.keys.has('Space'),frontDistance:wheels.find(w=>w.front)?.distance??0,rearDistance:wheels.find(w=>!w.front)?.distance??0}};
    },snapshot:()=>({ready,pending:pending?{id:pending.id,type:pending.type}:null,
      vehicles:[...records.values()].map(v=>({vehicleId:v.vehicleId,revision:v.revision,seats:v.seats,state:v.state,samples:v.samples.length}))})};
}
