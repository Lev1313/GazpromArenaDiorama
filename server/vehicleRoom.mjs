import { vehicleCatalog,seatIds,seatPoint,catalogById } from '../src/network/vehicleCatalog.js';
import { exact,validPose,validSequence } from '../src/network/protocol.js';
import { validVehicleId,validSeatId,validVehicleState } from '../src/network/vehicleProtocol.js';

export function createVehicleRoom(){return {revision:0,vehicles:new Map(vehicleCatalog.map(v=>[v.vehicleId,{
  vehicleId:v.vehicleId,revision:0,lastTime:performance.now(),motionCredit:6,yawCredit:1.2,state:{x:v.x,y:v.y,z:v.z,yaw:v.yaw,speed:0,steer:0,handbrake:false,frontDistance:0,rearDistance:0},
  seats:Object.fromEntries(seatIds.map(id=>[id,null]))}]))};}
export function occupied(room,id){for(const v of room.fleet.vehicles.values())for(const seatId of seatIds)if(v.seats[seatId]===id)return {vehicle:v,seatId};return null;}
const publicVehicle=v=>({vehicleId:v.vehicleId,state:{...v.state},revision:v.revision,seats:{...v.seats}});
export function vehicleSnapshot(room){return {type:'world',revision:room.fleet.revision,vehicles:[...room.fleet.vehicles.values()].map(publicVehicle)};}
export function broadcastWorld(room,send){const world=vehicleSnapshot(room);for(const p of room.players.values())if(p.vehicles)send(p.ws,world);}
function touch(room,v){v.revision++;room.fleet.revision++;}
export function stopPlayerVehicle(room,player,send,release=false){
  const seat=occupied(room,player.id);if(!seat)return;
  const v=seat.vehicle;
  if(seat.seatId==='driver'){v.state={...v.state,speed:0,steer:0,handbrake:true};v.lastTime=performance.now();v.motionCredit=6;v.yawCredit=1.2;}
  if(release)v.seats[seat.seatId]=null;
  touch(room,v);broadcastWorld(room,send);
}
function updateRiders(room,v){for(const [seatId,id] of Object.entries(v.seats)){
  const p=room.players.get(id),yaw=Math.PI/2+v.state.yaw;if(p)p.pose={...seatPoint({...v.state,vehicleId:v.vehicleId},seatId,false),yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw)),moving:false};
}}
function homeBlocked(room,car,home){
  const a=catalogById.get(car.vehicleId);
  for(const v of room.fleet.vehicles.values()){
    if(v===car)continue;const b=catalogById.get(v.vehicleId),s=v.state;
    const axes=[home.yaw,home.yaw+Math.PI/2,s.yaw,s.yaw+Math.PI/2];
    if(axes.every(yaw=>{const x=Math.cos(yaw),z=-Math.sin(yaw),project=(def,y)=>def.halfLength*Math.abs(x*Math.cos(y)-z*Math.sin(y))+def.halfWidth*Math.abs(x*Math.sin(y)+z*Math.cos(y));
      return Math.abs((s.x-home.x)*x+(s.z-home.z)*z)<project(a,home.yaw)+project(b,s.yaw)+.08;}))return true;
  }return false;
}

/** Returns false for walking traffic, otherwise consumes a socket-owned command. */
export function handleVehicleMessage(room,player,m,send,reject){
  if(!['seat-enter','seat-exit','vehicle-state','vehicle-reset'].includes(m?.type))return false;
  if(!player.vehicles){reject(player.ws,'unsupported-message');return true;}
  const fields={ 'seat-enter':['vehicleId','seatId'], 'seat-exit':['pose'], 'vehicle-state':['vehicleId','state'], 'vehicle-reset':['vehicleId'] };
  if(!exact(m,['type','roomId','playerId','seq',...fields[m.type]])||!validSequence(m.seq)||m.seq<=player.seq){reject(player.ws,'invalid-state');return true;}
  player.seq=m.seq;
  const reply=(ok,code='')=>send(player.ws,{type:'action-result',requestId:m.seq,ok,code});
  const deny=code=>{reply(false,code);return true;};
  const seat=occupied(room,player.id);
  if(m.type==='seat-enter'){
    if(!validVehicleId(m.vehicleId)||!validSeatId(m.seatId)){reject(player.ws,'invalid-seat');return true;}
    const v=room.fleet.vehicles.get(m.vehicleId);
    if(seat)return deny('already-seated');if(v.seats[m.seatId])return deny('seat-occupied');
    if(Math.abs(v.state.speed)>.5)return deny('vehicle-moving');
    const door=seatPoint({...v.state,vehicleId:v.vehicleId},m.seatId);
    if(Math.hypot(door.x-player.pose.x,door.z-player.pose.z)>1.2)return deny('too-far');
    v.seats[m.seatId]=player.id;v.lastTime=performance.now();if(m.seatId==='driver'){v.motionCredit=6;v.yawCredit=1.2;}touch(room,v);updateRiders(room,v);broadcastWorld(room,send);reply(true);return true;
  }
  if(m.type==='seat-exit'){
    if(!validPose(m.pose)){reject(player.ws,'invalid-state');return true;}
    if(!seat)return deny('not-seated');if(Math.abs(seat.vehicle.state.speed)>.5)return deny('vehicle-moving');
    const door=seatPoint({...seat.vehicle.state,vehicleId:seat.vehicle.vehicleId},seat.seatId);
    const state=seat.vehicle.state,side=['driver','rear-left'].includes(seat.seatId)?-1:1;
    const localZ=(m.pose.x-state.x)*Math.sin(state.yaw)+(m.pose.z-state.z)*Math.cos(state.yaw);
    if(Math.hypot(door.x-m.pose.x,door.z-m.pose.z)>1.9||side*localZ<catalogById.get(seat.vehicle.vehicleId).halfWidth+.25)return deny('unsafe-exit');
    stopPlayerVehicle(room,player,send,true);player.pose=m.pose;reply(true);return true;
  }
  if(!validVehicleId(m.vehicleId)){reject(player.ws,'invalid-vehicle');return true;}
  if(!seat||seat.seatId!=='driver'||seat.vehicle.vehicleId!==m.vehicleId)return deny('not-driver');
  const v=seat.vehicle;
  if(m.type==='vehicle-reset'){
    if(Math.abs(v.state.speed)>.5)return deny('vehicle-moving');
    const home=catalogById.get(v.vehicleId);if(homeBlocked(room,v,home))return deny('reset-blocked');
    v.state={x:home.x,y:home.y,z:home.z,yaw:home.yaw,speed:0,steer:0,handbrake:false,frontDistance:0,rearDistance:0};
    v.motionCredit=6;v.yawCredit=1.2;
  }else{
    if(!validVehicleState(m.state,m.vehicleId)){reject(player.ws,'invalid-state');return true;}
    const now=performance.now(),s=m.state,old=v.state,dt=Math.min(.5,Math.max(0,(now-v.lastTime)/1000));
    const distance=Math.hypot(s.x-old.x,s.z-old.z),yaw=Math.abs(Math.atan2(Math.sin(s.yaw-old.yaw),Math.cos(s.yaw-old.yaw)));
    // A websocket proxy can deliver multiple legitimate 10 Hz snapshots almost at once.
    // A bounded refill budget tolerates bursts without allowing large teleports.
    const travelBudget=Math.min(6,(v.motionCredit??6)+18*dt);
    const turnBudget=Math.min(1.2,(v.yawCredit??1.2)+6*dt);
    const invalidMotion=distance>Math.min(3.5,travelBudget)+1e-6
      ||Math.abs(s.y-old.y)>4*dt+.35||yaw>Math.min(.7,turnBudget)+1e-6
      ||Math.abs(s.frontDistance-old.frontDistance)>distance+.5
      ||Math.abs(s.rearDistance-old.rearDistance)>distance+.5;
    if(invalidMotion){
      if(now-(v.lastRejectLog??-Infinity)>5000){
        console.warn('[vehicle] movement-rejected (distance='+distance.toFixed(2)+'m, gap='+dt.toFixed(3)+'s, budget='+travelBudget.toFixed(2)+'m)');
        v.lastRejectLog=now;
      }
      // Stop at the last agreed pose; still reject arbitrary teleports.
      stopPlayerVehicle(room,player,send);return deny('movement-rejected');
    }
    v.motionCredit=Math.max(0,travelBudget-distance);v.yawCredit=Math.max(0,turnBudget-yaw);
    v.state={...s};
  }
  v.lastTime=performance.now();touch(room,v);updateRiders(room,v);
  if(m.type==='vehicle-reset'){broadcastWorld(room,send);reply(true);}
  else for(const p of room.players.values())if(p.vehicles)send(p.ws,{type:'vehicle',vehicle:publicVehicle(v)});
  return true;
}
