import { Box3, Group, Sphere, Vector3 } from 'three';

const axle=new Vector3(0,0,1);
export const wheelIds=['front-left','front-right','rear-left','rear-right'];

/** All rigs use vehicle-local +X forward, +Y up, +Z axle. Imported mesh transforms are preserved. */
export function createWheel(car,{id,center,radius,steeringPivot=new Group(),rollingParts=[],fixedParts=[]}) {
  if(!wheelIds.includes(id)||!(radius>0))throw new Error('Invalid wheel definition');
  if(!steeringPivot.parent){steeringPivot.position.copy(center);car.add(steeringPivot);}
  steeringPivot.name='steering-'+id;
  const rollingPivot=new Group();rollingPivot.name='rolling-'+id;steeringPivot.add(rollingPivot);
  car.updateWorldMatrix(true,true);
  for(const part of rollingParts)rollingPivot.attach(part);
  for(const part of fixedParts)steeringPivot.attach(part);
  const wheel={id,front:id.startsWith('front'),radius,center:steeringPivot.position.clone(),
    steeringPivot,rollingPivot,angle:0,distance:0};
  car.userData.wheels??=[];car.userData.wheels.push(wheel);
  car.userData.frontWheels=car.userData.wheels.filter(w=>w.front).map(w=>w.steeringPivot);
  return wheel;
}

export function steerWheels(car,angle) {
  if(car.userData.wheels)for(const wheel of car.userData.wheels)wheel.steeringPivot.rotation.y=wheel.front?angle:0;
  else for(const pivot of car.userData.frontWheels??[])pivot.rotation.y=angle;
}

/** Signed accepted horizontal displacement, never commanded speed or elapsed time. */
export function advanceWheels(car,distance,steer,{handbrake=false}={}) {
  steerWheels(car,steer);
  for(const wheel of car.userData.wheels??[]) {
    if(handbrake&&!wheel.front)continue;
    wheel.distance+=distance;wheel.angle+=distance/wheel.radius;
    // Positive distance rolls about -Z: the bottom of the tire moves opposite to +X travel.
    wheel.rollingPivot.quaternion.setFromAxisAngle(axle,-(wheel.angle%(2*Math.PI)));
  }
}

export function resetWheels(car) {
  steerWheels(car,0);
  for(const wheel of car.userData.wheels??[]){wheel.angle=wheel.distance=0;wheel.rollingPivot.quaternion.identity();}
}

/** Absolute signed axle distances from the agreed network state; calipers stay fixed. */
export function setWheelDistances(car,front,rear,steer){
  steerWheels(car,steer);
  for(const wheel of car.userData.wheels??[]){wheel.distance=wheel.front?front:rear;wheel.angle=wheel.distance/wheel.radius;
    wheel.rollingPivot.quaternion.setFromAxisAngle(axle,-(wheel.angle%(2*Math.PI)));}
}

/** Partitioned primitives share original vertex accessors; bounds must use their own indices. */
export function prepareWheelBounds(model) {
  const v=new Vector3();
  model.traverse(part=>{
    if(!part.isMesh||!part.userData.wheelPart)return;
    const geometry=part.geometry,position=geometry.attributes.position,index=geometry.index,box=new Box3();
    for(let i=0;i<index.count;i++)box.expandByPoint(v.fromBufferAttribute(position,index.getX(i)));
    geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new Sphere());
  });
}

/** Reparent real tire/rim/caliper meshes once at loading, without cloning geometry or materials. */
export function installImportedWheels(car,model) {
  const parts=[];model.traverse(part=>{if(part.isMesh&&part.userData.wheelPart)parts.push(part);});
  if(!parts.length)throw new Error('Model has no partitioned wheel meshes');
  car.userData.wheels=[];car.userData.frontWheels=[];car.updateWorldMatrix(true,true);
  for(const id of wheelIds) {
    const selected=parts.filter(p=>p.userData.wheelPart===id),tires=selected.filter(p=>p.userData.wheelTire);
    if(tires.length!==1)throw new Error('Expected one real tire per wheel: '+id);
    const tire=tires[0],box=tire.geometry.boundingBox.clone();
    // Source orientation and all original ancestor transforms are included before normalising axes.
    box.applyMatrix4(car.matrixWorld.clone().invert().multiply(tire.matrixWorld));
    const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
    createWheel(car,{id,center,radius:(size.x+size.y)/4,
      rollingParts:selected.filter(p=>p.userData.wheelBehavior==='rolling'),
      fixedParts:selected.filter(p=>p.userData.wheelBehavior==='fixed')});
  }
  return car.userData.wheels;
}
