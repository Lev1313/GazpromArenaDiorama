import { advanceWheels, steerWheels, resetWheels } from './wheelAnimation.js';
import * as THREE from 'three';
import { vehicleTuning } from './vehicleTuning.js';
import { pointInPolygon, parkingLights } from '../world/siteLayout.js';
const defaultFootprint = {halfLength:1.96,halfWidth:1.04};

// Original low-poly Golf footprint collision math, moved out of the HTML.
// All measurements use the same world coordinates as the parking lot.
export function pointInLot(x, z, lotOutline) {
  return pointInPolygon(x, z, lotOutline);
}

function axes(yaw) {
  return [
    { x: Math.cos(yaw), z: -Math.sin(yaw) },
    { x: Math.sin(yaw), z: Math.cos(yaw) },
  ];
}

export function carOverlap(pos, yaw, other, pad = 0, footprint = defaultFootprint) {
  const otherFootprint=other.userData.footprint ?? defaultFootprint;
  // Conservative broad phase avoids SAT vectors for distant parked vehicles.
  const reach=footprint.halfLength+footprint.halfWidth+2*pad
    +otherFootprint.halfLength+otherFootprint.halfWidth;
  if(Math.abs(other.position.x-pos.x)>reach || Math.abs(other.position.z-pos.z)>reach)return false;
  const a = axes(yaw), b = axes(other.rotation.y);
  const d = { x: other.position.x - pos.x, z: other.position.z - pos.z };
  for (const axis of [...a, ...b]) {
    const dot = (u, v) => u.x * v.x + u.z * v.z;
    const ra = (footprint.halfLength + pad) * Math.abs(dot(axis, a[0]))
      + (footprint.halfWidth + pad) * Math.abs(dot(axis, a[1]));
    const rb = (other.userData.footprint?.halfLength ?? 1.96) * Math.abs(dot(axis, b[0]))
      + (other.userData.footprint?.halfWidth ?? 1.04) * Math.abs(dot(axis, b[1]));
    if (Math.abs(dot(d, axis)) > ra + rb) return false;
  }
  return true;
}

export function circleOverlap(pos, yaw, x, z, r, footprint = defaultFootprint) {
  const a = axes(yaw), dx = x - pos.x, dz = z - pos.z;
  const localX = dx * a[0].x + dz * a[0].z;
  const localZ = dx * a[1].x + dz * a[1].z;
  return Math.hypot(
    Math.max(Math.abs(localX) - footprint.halfLength, 0),
    Math.max(Math.abs(localZ) - footprint.halfWidth, 0),
  ) < r;
}

export function polygonOverlap(pos, yaw, outline, footprint = defaultFootprint) {
  const a=axes(yaw);
  const separated=axis=>{
    const centre=pos.x*axis.x+pos.z*axis.z;
    const radius=footprint.halfLength*Math.abs(axis.x*a[0].x+axis.z*a[0].z)+footprint.halfWidth*Math.abs(axis.x*a[1].x+axis.z*a[1].z);
    let min=Infinity,max=-Infinity;
    for(const [x,z] of outline){const p=x*axis.x+z*axis.z;min=Math.min(min,p);max=Math.max(max,p);}
    return max<centre-radius || min>centre+radius;
  };
  if(a.some(separated))return false;
  for(let i=0;i<outline.length;i++){
    const p=outline[i],q=outline[(i+1)%outline.length];
    if(separated({x:-(q[1]-p[1]),z:q[0]-p[0]}))return false;
  }
  return true;
}

export const viewNames = ['Сзади', 'Сверху', 'Свободно'];

/**
 * Shared selected-vehicle driving with a legacy Golf adapter: acceleration, reverse, steering, braking, SAT
 * collisions, skid/smoke effects, view cycling and camera restoration.
 *
 * This module intentionally has no DOM/event dependencies; the small
 * driveUi.js adapter supplies input and renders status. Future full
 * HUD/day-night controls can reuse the same controller.
 */
export function createVehicleDrive({
  golf, golfLabel, parked, people, visitors, drifters,
  drift, camera, controls, lotOutline,
  isDriveable = (x, z) => pointInLot(x, z, lotOutline),
  staticObstacles = [],
  getStaticObstacles = () => staticObstacles,
  getGroundHeight = () => 0,
}) {
  const legacyGolf = golf;
  const homes = new Map(parked.map(car => [car, {position:car.position.clone(),yaw:car.rotation.y}]));
  let physical = false;
  let tuning = vehicleTuning(golf.userData.vehicleId);
  const footprint = () => golf.userData.footprint ?? defaultFootprint;
  const golfHome = golf.position.clone();
  const golfHeading = golf.rotation.y;
  const keys = new Set();
  const state = {
    active: false, speed: 0, steer: 0, view: 0, contact: 0,
    skidTime: 0, lastRear: null,
    slip: 0,
  };
  let savedView = null;

  function blocked(pos, yaw) {
    const a = axes(yaw), fp = footprint();
    for (const dx of [-fp.halfLength, fp.halfLength]) {
      for (const dz of [-fp.halfWidth, fp.halfWidth]) {
        if (!isDriveable(
          pos.x + a[0].x * dx + a[1].x * dz,
          pos.z + a[0].z * dx + a[1].z * dz,
        )) return true;
      }
    }
    for (const o of parked) {
      if (o !== golf && carOverlap(pos, yaw, o, .08, fp)) return true;
    }
    for (const p of people) {
      if (circleOverlap(pos, yaw, p.position.x, p.position.z, .5, fp)) return true;
    }
    for (const [x, z] of parkingLights) {
        if (circleOverlap(pos, yaw, x, z, .45, fp)) return true;
    }
    for (const [x, z] of [[8, 12], [-25, -12]]) {
      if (circleOverlap(pos, yaw, x, z, 1, fp)) return true;
    }
    for (const c of drifters) {
      if (carOverlap(pos, yaw, c.o, .12, fp)) return true;
    }
    for (const c of visitors) {
      if (c.o.visible && carOverlap(pos, yaw, c.o, .12, fp)) return true;
    }
    for (const box of getStaticObstacles(fp)) {
      if(box.minY>pos.y+(fp.height ?? 1.7) || box.maxY<pos.y-.1)continue;
      const dx=(box.minX+box.maxX)/2-pos.x, dz=(box.minZ+box.maxZ)/2-pos.z;
      const hx=(box.maxX-box.minX)/2, hz=(box.maxZ-box.minZ)/2;
      if(Math.abs(dx)>hx+Math.hypot(fp.halfLength,fp.halfWidth) || Math.abs(dz)>hz+Math.hypot(fp.halfLength,fp.halfWidth))continue;
      if (polygonOverlap(pos,yaw,box.outline,fp)) return true;
    }
    return false;
  }

  function updateDriveCamera(dt, snap = false) {
    if (!state.active || state.view === 2) return;
    const p = golf.position;
    const f = new THREE.Vector3(
      Math.cos(golf.rotation.y), 0, -Math.sin(golf.rotation.y),
    );
    const desired = state.view === 0
      ? p.clone().addScaledVector(f, -9).add(new THREE.Vector3(0, 6.5, 0))
      : p.clone().add(new THREE.Vector3(0, 27, 13));
    const target = p.clone()
      .addScaledVector(f, state.view === 0 ? 2 : 0)
      .add(new THREE.Vector3(0, .8, 0));
    const blend = snap ? 1 : 1 - Math.exp(-dt * 6);
    camera.position.lerp(desired, blend);
    controls.target.lerp(target, blend);
    camera.lookAt(controls.target);
  }

  function resetGolf() {
    keys.clear();
    const home=homes.get(golf);
    if(blocked(home.position,home.yaw)){state.contact=.65;return false;}
    golf.position.copy(home.position);
    golf.rotation.y=home.yaw;
    state.speed = 0;
    state.steer = 0;
    state.slip = 0;
    state.contact = 0;
    state.lastRear = null;
    steerWheels(golf,0);
    resetWheels(golf);
    if (state.active) updateDriveCamera(1, true);
  }

  function selectVehicle(car) {
    if(state.active) throw new Error('Stop the active driver before selecting a vehicle');
    if(!homes.has(car)) throw new Error('Unknown vehicle');
    golf=car; tuning=vehicleTuning(car.userData.vehicleId);
  }
  function startVehicle(vehicle) {selectVehicle(vehicle.car);physical=true;setDriving(true);}
  function startLegacy() {
    if(state.active)return;
    selectVehicle(legacyGolf);physical=false;setDriving(true);
  }
  function setDriving(active) {
    if (Boolean(active) === state.active) return;
    keys.clear();
    if (active) {
      savedView = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      state.active = true;
      state.view = 0;
      state.speed = 0;
      state.steer = 0;
      state.slip = 0;
      if (golfLabel) golfLabel.visible = false;
      controls.enabled = false;
      updateDriveCamera(1, true);
    } else {
      state.active = false;
      if (!physical) resetGolf();
      controls.enabled = true;
      if (golfLabel) golfLabel.visible = true;
      if (savedView) {
        camera.position.copy(savedView.position);
        controls.target.copy(savedView.target);
      }
      controls.update();
    }
  }

  /**
   * Release the physically occupied driver seat without returning the Golf home.
   * Seating validates a safe exit speed and position before calling this method.
   * The legacy setDriving(false) and explicit resetGolf() keep their home reset.
   * restoreCamera:false transfers camera ownership to the pedestrian controller.
   */
  function stopDriving({ restoreCamera = true } = {}) {
    keys.clear();
    state.active = false;
    state.speed = 0;
    state.steer = 0;
    state.slip = 0;
    state.contact = 0;
    state.skidTime = 0;
    state.lastRear = null;
    state.view = 0;
    steerWheels(golf,0);
    if (golfLabel) golfLabel.visible = true;
    if (restoreCamera) {
      controls.enabled = true;
      if (savedView) {
        camera.position.copy(savedView.position);
        controls.target.copy(savedView.target);
      }
      controls.update();
    }
  }

  function cycleDriveView() {
    if (!state.active) return;
    state.view = (state.view + 1) % 3;
    controls.enabled = state.view === 2;
    if (state.view === 2) {
      controls.target.copy(golf.position);
      controls.update();
    } else {
      updateDriveCamera(1, true);
    }
  }

  function setKey(code, pressed) {
    if (!state.active) return;
    if (pressed) keys.add(code);
    else keys.delete(code);
  }

  function clearKeys() { keys.clear(); }

  function updateDriving(dt) {
    if (!state.active) return;
    const steps = Math.max(1, Math.ceil(dt / .012)), h = dt / steps;
    const forward = keys.has('KeyW') || keys.has('ArrowUp');
    const backward = keys.has('KeyS') || keys.has('ArrowDown');
    const brake = keys.has('Space');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');

    for (let i = 0; i < steps; i++) {
      const desired = ((left ? 1 : 0) - (right ? 1 : 0))
        * tuning.steerAngle / (1 + Math.abs(state.speed) * .025);
      state.steer += (desired - state.steer) * (1 - Math.exp(-h * tuning.steerRate / tuning.inertia));
      let v = state.speed;
      if (brake) {
        // Rear-wheel handbrake: lose speed gradually while retaining momentum.
        const drag=forward && !backward && v>2 ? tuning.handbrakeDrag * .289 : tuning.handbrakeDrag;
        v = Math.sign(v) * Math.max(0, Math.abs(v) - h * drag);
      } else if (forward && !backward) {
        v += h * (v < -.15 ? tuning.braking : tuning.acceleration / tuning.inertia);
      } else if (backward && !forward) {
        v -= h * (v > .15 ? tuning.braking : tuning.reverseAcceleration);
      } else {
        v = Math.sign(v) * Math.max(0,
          Math.abs(v) - h * (1.4 + .025 * v * v));
      }

      v = THREE.MathUtils.clamp(v, -tuning.reverseSpeed, tuning.maxSpeed);
      const sliding=brake && Math.abs(v)>2;
      const turn=v*Math.tan(state.steer)/tuning.wheelbase*h*(sliding?tuning.handbrakeTurn:1);
      const yaw = golf.rotation.y + turn;
      // With locked rear wheels the body rotates ahead of its travel direction.
      // Releasing the handbrake smoothly restores lateral grip.
      state.slip=THREE.MathUtils.clamp((state.slip-(sliding?turn:0))*Math.exp(-h*(sliding?tuning.slideGrip:tuning.grip)),-tuning.maxSlip,tuning.maxSlip);
      const travelYaw=yaw+state.slip;
      const next = golf.position.clone().add(new THREE.Vector3(
        Math.cos(travelYaw) * v * h, 0, -Math.sin(travelYaw) * v * h,
      ));
      if (blocked(next, yaw)) {
        state.speed = 0;
        state.slip = 0;
        state.contact = .65;
      } else {
        next.y += (getGroundHeight(next.x,next.z)-next.y)*(1-Math.exp(-h*15));
        const distance=Math.hypot(next.x-golf.position.x,next.z-golf.position.z)*Math.sign(v);
        advanceWheels(golf,distance,state.steer,{handbrake:brake});
        golf.position.copy(next);
        golf.rotation.y = yaw;
        state.speed = v;
      }
    }

    state.contact = Math.max(0, state.contact - dt);
    steerWheels(golf,state.steer);

    if ((brake || Math.abs(state.slip)>.08) && Math.abs(state.speed) > 2) {
      state.skidTime += dt;
      const rear = drift.rearPoints(golf);
      if (state.lastRear) {
        for (let j = 0; j < 2; j++) {
          drift.addSkid(state.lastRear[j], rear[j]);
        }
      }
      state.lastRear = rear;
      drift.refreshSkids();
      if (drift.smokeEnabled && state.skidTime > .12) {
        drift.emitSmoke(rear[0], golf.rotation.y);
        state.skidTime = 0;
      }
    } else {
      state.lastRear = null;
    }
  }

  function getStatus() {
    return {
      vehicleId:golf.userData.vehicleId,
      vehicleName: golf.userData.displayName ?? tuning.name,
      speedKmh: Math.round(Math.abs(state.speed) * 3.6),
      gear: state.speed < -.1 ? 'R' : Math.abs(state.speed) < .1 ? 'N' : 'D',
      message: state.contact > 0
        ? 'Препятствие — сдай назад'
        : drift.driftWaiting ? 'Дрифтеры пропускают тебя'
          : Math.abs(state.slip)>.12 ? 'Дрифт · отпусти ручник для сцепления'
            : keys.has('Space') ? 'Ручной тормоз' : 'Свободный заезд',
      viewName: viewNames[state.view],
      active: state.active,
    };
  }

  return {
    state, get golf(){return golf;}, legacyGolf, keys, golfHome, golfHeading,
    startVehicle, startLegacy, get physical(){return physical;},
    blocked, setKey, clearKeys, setDriving, stopDriving, resetGolf,
    cycleDriveView, updateDriving, updateDriveCamera, getStatus,
  };
}
