import * as THREE from 'three';
import { pointInPolygon, parkingLights } from '../world/siteLayout.js';

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

export function carOverlap(pos, yaw, other, pad = 0) {
  const a = axes(yaw), b = axes(other.rotation.y);
  const d = { x: other.position.x - pos.x, z: other.position.z - pos.z };
  for (const axis of [...a, ...b]) {
    const dot = (u, v) => u.x * v.x + u.z * v.z;
    const ra = (1.96 + pad) * Math.abs(dot(axis, a[0]))
      + (1.04 + pad) * Math.abs(dot(axis, a[1]));
    const rb = 1.96 * Math.abs(dot(axis, b[0]))
      + 1.04 * Math.abs(dot(axis, b[1]));
    if (Math.abs(dot(d, axis)) > ra + rb) return false;
  }
  return true;
}

export function circleOverlap(pos, yaw, x, z, r) {
  const a = axes(yaw), dx = x - pos.x, dz = z - pos.z;
  const localX = dx * a[0].x + dz * a[0].z;
  const localZ = dx * a[1].x + dz * a[1].z;
  return Math.hypot(
    Math.max(Math.abs(localX) - 1.96, 0),
    Math.max(Math.abs(localZ) - 1.04, 0),
  ) < r;
}

export const viewNames = ['Сзади', 'Сверху', 'Свободно'];

/**
 * Legacy Golf VI driving: acceleration, reverse, steering, braking, SAT
 * collisions, skid/smoke effects, view cycling and camera restoration.
 *
 * This module intentionally has no DOM/event dependencies; the small
 * driveUi.js adapter supplies input and renders status. Future full
 * HUD/day-night controls can reuse the same controller.
 */
export function createGolfDrive({
  golf, golfLabel, parked, people, visitors, drifters,
  drift, camera, controls, lotOutline,
  isDriveable = (x, z) => pointInLot(x, z, lotOutline),
}) {
  const golfHome = golf.position.clone();
  const golfHeading = golf.rotation.y;
  const keys = new Set();
  const state = {
    active: false, speed: 0, steer: 0, view: 0, contact: 0,
    skidTime: 0, lastRear: null,
  };
  let savedView = null;

  function blocked(pos, yaw) {
    const a = axes(yaw);
    for (const dx of [-1.96, 1.96]) {
      for (const dz of [-1.04, 1.04]) {
        if (!isDriveable(
          pos.x + a[0].x * dx + a[1].x * dz,
          pos.z + a[0].z * dx + a[1].z * dz,
        )) return true;
      }
    }
    for (const o of parked) {
      if (o !== golf && carOverlap(pos, yaw, o, .08)) return true;
    }
    for (const p of people) {
      if (circleOverlap(pos, yaw, p.position.x, p.position.z, .5)) return true;
    }
    for (const [x, z] of parkingLights) {
        if (circleOverlap(pos, yaw, x, z, .45)) return true;
    }
    for (const [x, z] of [[8, 12], [-25, -12]]) {
      if (circleOverlap(pos, yaw, x, z, 1)) return true;
    }
    for (const c of drifters) {
      if (carOverlap(pos, yaw, c.o, .12)) return true;
    }
    for (const c of visitors) {
      if (c.o.visible && carOverlap(pos, yaw, c.o, .12)) return true;
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
    golf.position.copy(golfHome);
    golf.rotation.y = golfHeading;
    state.speed = 0;
    state.steer = 0;
    state.contact = 0;
    state.lastRear = null;
    for (const wheel of golf.userData.frontWheels) wheel.rotation.y = 0;
    if (state.active) updateDriveCamera(1, true);
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
      golfLabel.visible = false;
      controls.enabled = false;
      updateDriveCamera(1, true);
    } else {
      state.active = false;
      resetGolf();
      controls.enabled = true;
      golfLabel.visible = true;
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
        * .53 / (1 + Math.abs(state.speed) * .025);
      state.steer += (desired - state.steer) * (1 - Math.exp(-h * 9));
      let v = state.speed;
      if (brake) {
        v = Math.sign(v) * Math.max(0, Math.abs(v) - h * 19);
      } else if (forward && !backward) {
        v += h * (v < -.15 ? 13 : 6.2);
      } else if (backward && !forward) {
        v -= h * (v > .15 ? 14 : 4.2);
      } else {
        v = Math.sign(v) * Math.max(0,
          Math.abs(v) - h * (1.4 + .025 * v * v));
      }

      v = THREE.MathUtils.clamp(v, -4.5, 15);
      const yaw = golf.rotation.y + v * Math.tan(state.steer) / 2.65 * h;
      const next = golf.position.clone().add(new THREE.Vector3(
        Math.cos(yaw) * v * h, 0, -Math.sin(yaw) * v * h,
      ));
      if (blocked(next, yaw)) {
        state.speed = 0;
        state.contact = .65;
      } else {
        golf.position.copy(next);
        golf.rotation.y = yaw;
        state.speed = v;
      }
    }

    state.contact = Math.max(0, state.contact - dt);
    for (const wheel of golf.userData.frontWheels) {
      wheel.rotation.y = state.steer;
    }

    if (brake && Math.abs(state.speed) > 2) {
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
      speedKmh: Math.round(Math.abs(state.speed) * 3.6),
      gear: state.speed < -.1 ? 'R' : Math.abs(state.speed) < .1 ? 'N' : 'D',
      message: state.contact > 0
        ? 'Препятствие — сдай назад'
        : drift.driftWaiting ? 'Дрифтеры пропускают тебя'
          : 'Свободный заезд',
      viewName: viewNames[state.view],
      active: state.active,
    };
  }

  return {
    state, golf, keys, golfHome, golfHeading,
    blocked, setKey, clearKeys, setDriving, resetGolf,
    cycleDriveView, updateDriving, updateDriveCamera, getStatus,
  };
}
