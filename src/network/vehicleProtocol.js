import { exact, validId, validPose, validSequence } from './protocol.js';
import { catalogById,seatIds } from './vehicleCatalog.js';
import { vehicleTuning } from '../vehicles/vehicleTuning.js';
export const validVehicleId=id=>typeof id==='string'&&catalogById.has(id);
export const validSeatId=id=>typeof id==='string'&&seatIds.includes(id);
export function validVehicleState(s,id){
  return exact(s,['x','y','z','yaw','speed','steer','handbrake','frontDistance','rearDistance'])
    &&validPose({x:s.x,y:s.y,z:s.z,yaw:s.yaw,moving:false})
    &&[s.speed,s.steer,s.frontDistance,s.rearDistance].every(Number.isFinite)
    &&Math.abs(s.frontDistance)<=1e7&&Math.abs(s.rearDistance)<=1e7
    &&s.speed>=-vehicleTuning(id).reverseSpeed-.01&&s.speed<=vehicleTuning(id).maxSpeed+.01
    &&Math.abs(s.steer)<=.55&&typeof s.handbrake==='boolean';
}
export function validVehicle(v){return exact(v,['vehicleId','state','revision','seats'])&&validVehicleId(v.vehicleId)
  &&validVehicleState(v.state,v.vehicleId)&&validSequence(v.revision)&&exact(v.seats,seatIds)
  &&Object.values(v.seats).every(id=>id===null||validId(id));}
export function validWorld(w){
  if(!exact(w,['type','revision','vehicles'])||w.type!=='world'||!validSequence(w.revision)
    ||!Array.isArray(w.vehicles)||w.vehicles.length!==19||!w.vehicles.every(validVehicle)
    ||new Set(w.vehicles.map(v=>v.vehicleId)).size!==19)return false;
  const owners=w.vehicles.flatMap(v=>Object.values(v.seats)).filter(Boolean);
  return owners.length<=2&&new Set(owners).size===owners.length;
}
