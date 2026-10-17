// Transport-neutral immutable parking/seat metadata. No models or renderer on the server.
export const seatIds=['driver','front-passenger','rear-left','rear-right'];
export const specialVehicles={
  2:{vehicleId:'parked-golf-red',displayName:'Golf VI · красный',anchorY:-.28,frontX:-.25,rearX:-.85,width:2.079115033,length:4.274852991},
  5:{vehicleId:'parked-golf-player',displayName:'Golf VI · серебристый',anchorY:.05},
  16:{vehicleId:'parked-mercedes-gl',displayName:'Mercedes GL',anchorY:.15,frontX:-.25,rearX:-.85,width:2.264,length:5.120},
  17:{vehicleId:'parked-lexus-rx',displayName:'Lexus RX',anchorY:-.02,frontX:-.25,rearX:-.85,width:2.152501,length:4.865382},
  18:{vehicleId:'parked-mercedes-gla-x156',displayName:'Mercedes-Benz GLA X156',anchorY:-.20,frontX:-.15,rearX:-.88,width:2.015698,length:4.421901},
};
export const vehicleCatalog=Array.from({length:19},(_,index)=>{
  const definition=specialVehicles[index]??{},j=index%7;
  let x=index<7?-22.4:index<14?6.1:-19+(index-14)*7;
  let z=index<14?-24+j*8:33,yaw=index<7?0:index<14?Math.PI:Math.PI/2;
  if(index===10){x=5.5;z=-37;yaw=Math.PI/2;}if(index===18){x=6.5;z=37;yaw=-Math.PI/2;}
  return Object.freeze({index,vehicleId:definition.vehicleId??`parked-${String(index).padStart(2,'0')}`,
    x,y:0,z,yaw,halfLength:(definition.length??3.92)/2,halfWidth:(definition.width??2.08)/2,...definition});
});
export const catalogById=new Map(vehicleCatalog.map(v=>[v.vehicleId,v]));
export function seatPoint(vehicle,seatId,entry=true){
  const def=catalogById.get(vehicle.vehicleId),front=['driver','front-passenger'].includes(seatId),side=['driver','rear-left'].includes(seatId)?-1:1;
  const x=(front?def.frontX??.3:def.rearX??-.72)*def.halfLength/1.96;
  const z=side*(entry?def.halfWidth+.65:def.halfWidth*.34),c=Math.cos(vehicle.yaw),s=Math.sin(vehicle.yaw);
  return {x:vehicle.x+c*x+s*z,y:(vehicle.y??0)+(entry?-.12:def.anchorY??.05),z:vehicle.z-s*x+c*z};
}
