import { Vector3 } from 'three';

export const seatReach = .95;
export const safeExitSpeed = .5; // m/s, below walking pace

/** One actor/state; vehicles/seats are independent of GLB child meshes. */
export function createVehicleInteraction({ registry, pedestrian, drive, modes, camera, controls }) {
  const state = pedestrian.state;
  let message = '', messageTime = 0, cameraView = 0;
  const isSeated = () => state.vehicleId !== null;
  const current = () => {
    const vehicle = registry.get(state.vehicleId);
    return vehicle ? {vehicle, seat:vehicle.seats.find(s=>s.seatId===state.seatId)} : null;
  };
  function feedback(text) { message=text; messageTime=3; return false; }
  function nearest() {
    if (!pedestrian.state.active || isSeated()) return null;
    let best = null;
    for (const vehicle of registry.vehicles) {
      registry.refresh(vehicle);
      vehicle.car.updateWorldMatrix(true,false);
      const local = vehicle.car.worldToLocal(pedestrian.model.position.clone());
      for (const seat of vehicle.seats) {
        // Never choose a door through the body or across the opposite side.
        if (local.z * seat.side < 0) continue;
        const entry = registry.worldPosition(vehicle, seat);
        const distance = Math.hypot(entry.x-pedestrian.model.position.x, entry.z-pedestrian.model.position.z);
        if (distance <= seatReach && (!best || distance < best.distance)) best={vehicle,seat,entry,distance};
      }
    }
    return best;
  }
  function updatePose() {
    const occupied = current(); if (!occupied) return;
    registry.refresh(occupied.vehicle);
    const position = registry.worldPosition(occupied.vehicle,occupied.seat,'localPosition');
    const origin = occupied.vehicle.car.localToWorld(new Vector3());
    const front = occupied.vehicle.car.localToWorld(new Vector3(1,0,0)).sub(origin);
    pedestrian.setSeatedPose(position,Math.atan2(front.x,front.z));
  }
  function enter(target = nearest()) {
    if(modes.canEnterVehicle?.()===false)return feedback('В комнате доступна только прогулка — выйди из комнаты для поездки');
    if (isSeated()) return feedback('Ты уже занимаешь место');
    if (!pedestrian.state.active || !target) return feedback('Подойди к двери автомобиля');
    // Recompute proximity on commit: stale UI targets never bypass reach/side.
    const nearby=nearest();
    if (!nearby || nearby.vehicle.vehicleId!==target.vehicle.vehicleId || nearby.seat.seatId!==target.seat.seatId)
      return feedback('Подойди ближе к выбранной двери');
    const {vehicle,seat}=nearby;
    if (!registry.claim(vehicle.vehicleId,seat.seatId,state.playerId)) return feedback('Это место занято');
    pedestrian.suspendWalking();
    state.vehicleId=vehicle.vehicleId; state.seatId=seat.seatId; state.mode=seat.role;
    cameraView=0; message=''; messageTime=0;
    if (vehicle.canDrive && seat.role==='driver') modes.beginSeatedDriving(vehicle);
    controls.enabled=false; updatePose(); updateCamera(1,true);
    return true;
  }
  function findExit() {
    const occupied=current(); if (!occupied) return null;
    const {vehicle,seat}=occupied; registry.refresh(vehicle);
    // Search only the chosen door's immediate exterior, up to 1.25 m along it.
    // Never fall back to the parking spawn or opposite side of the vehicle.
    for (const outward of [0,.25,.5,.75]) for (const along of [0,-.25,.25,-.5,.5,-.75,.75,-1,1]) {
      const local=seat.entryPoint.clone(); local.x+=along; local.z+=outward*seat.side;
      const point=vehicle.car.localToWorld(local);
      if (!pedestrian.collision(point.x,point.z)) {
        point.y=pedestrian.getGroundHeight(point.x,point.z); return point;
      }
    }
    return null;
  }
  function exit() {
    const occupied=current(); if (!occupied) return false;
    if (occupied.vehicle.canDrive && drive.state.active && Math.abs(drive.state.speed)>safeExitSpeed)
      return feedback('Останови автомобиль перед высадкой');
    const point=findExit();
    if (!point) return feedback('У двери нет свободного места для высадки');
    // Clear the seat only after the checked ground point is accepted.
    if (!pedestrian.resumeAt(point,state.yaw)) return feedback('Место для высадки перекрыто');
    if (occupied.vehicle.canDrive && drive.state.active) modes.finishSeatedDriving();
    registry.release(state.vehicleId,state.seatId,state.playerId);
    state.vehicleId=state.seatId=null; state.mode='onFoot';
    message=''; messageTime=0; return true;
  }
  function update(dt) { messageTime=Math.max(0,messageTime-dt); updatePose(); }
  function updateCamera(dt,snap=false) {
    const occupied=current(); if (!occupied) return;
    if (drive.state.active) { drive.updateDriveCamera(dt,snap); return; }
    const {car}=occupied.vehicle, side=occupied.seat.side;
    const desired=car.localToWorld(new Vector3(cameraView ? -4 : 4,3.3,side*5.5));
    const target=car.localToWorld(new Vector3(0,1,0)), blend=snap?1:1-Math.exp(-dt*7);
    camera.position.lerp(desired,blend);controls.target.lerp(target,blend);camera.lookAt(controls.target);
  }
  function getStatus() {
    const occupied=current(), target=nearest();
    return { seated:isSeated(), vehicleName:occupied?.vehicle.displayName ?? target?.vehicle.displayName ?? '',
      role:state.mode, seatId:state.seatId, target,
      message:messageTime>0?message:'',
      prompt:target ? target.seat.occupiedBy ? 'Место занято' : 'E — сесть' : '' };
  }
  function canLegacyDrive() {
    const vehicle=registry.vehicles.find(v=>v.car===drive.legacyGolf);
    return !vehicle?.seats.find(s=>s.role==='driver')?.occupiedBy || feedback('Водительское место Golf занято');
  }
  function golfBlocksTraffic() {
    const p=drive.legacyGolf.position,home=drive.golfHome;
    return drive.state.active || Math.hypot(p.x-home.x,p.z-home.z)>.1;
  }
  modes.attachSeating?.({isSeated,exit,canLegacyDrive});
  return { state, isSeated, nearest, enter, exit, findExit, update, updateCamera, getStatus,canLegacyDrive,golfBlocksTraffic,
    cycleCamera() { cameraView=1-cameraView; updateCamera(1,true); },
    serialize() { return {playerId:state.playerId,mode:state.mode,vehicleId:state.vehicleId,seatId:state.seatId,
      position:pedestrian.model.position.toArray(),yaw:state.yaw}; } };
}
