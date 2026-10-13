import * as THREE from 'three';
import { pointInPolygon, parkingLights } from '../world/siteLayout.js';
import { createCharacterModel } from './characterModel.js';

export const pedestrianRadius = .3;
const margin = .015;

export function distanceToOutline(x, z, outline) {
  let distance = Infinity, normal = { x: 0, z: 0 };
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
    const dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const nx = x - ax - dx * t, nz = z - az - dz * t, d = Math.hypot(nx, nz);
    if (d < distance) { distance = d; normal = { x: nx / (d || 1), z: nz / (d || 1) }; }
  }
  return { distance, normal };
}

export function vehicleOutline(car) {
  const length = car.userData.footprint?.halfLength ?? 1.96;
  const width = car.userData.footprint?.halfWidth ?? 1.04;
  const c = Math.cos(car.rotation.y), s = Math.sin(car.rotation.y);
  return [[-length, -width], [length, -width], [length, width], [-length, width]].map(([x, z]) =>
    [car.position.x + c * x + s * z, car.position.z - s * x + c * z]);
}

/** DOM-free controller. A circle sweeps in <= .025 m steps; no physics engine. */
export function createPedestrian({ scene, camera, controls, parked, people = [],
  visitors = [], drifters = [], staticObstacles = [], parkingOutline, islandOutline,
  isWalkable = () => true, getGroundHeight = () => -.12 }) {
  const { model, animate } = createCharacterModel(scene);
  const keys = new Set();
  const state = { active: false, speed: 0, yaw: 0, cameraYaw: 0, phase: 0, stride: 0, contact: false };
  let savedView, lastSafe;

  function collision(x, z) {
    const radius = pedestrianRadius + margin;
    for (const outline of [islandOutline]) {
      if (!pointInPolygon(x, z, outline) || distanceToOutline(x, z, outline).distance < radius) return { x: 0, z: 0 };
    }
    if (!isWalkable(x, z)) return { x: 0, z: 0 };
    // Sample the whole footprint against the raised stadium exclusion.
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      if (!isWalkable(x + Math.cos(a) * radius, z + Math.sin(a) * radius)) return { x: 0, z: 0 };
    }
    const hitPolygon = outline => {
      const near = distanceToOutline(x, z, outline);
      return pointInPolygon(x, z, outline) || near.distance < radius ? near.normal : null;
    };
    for (const car of [...parked, ...visitors.filter(c => c.o.visible).map(c => c.o), ...drifters.map(c => c.o)]) {
      if (Math.hypot(x - car.position.x, z - car.position.z) > 5) continue;
      const hit = hitPolygon(vehicleOutline(car)); if (hit) return hit;
    }
    const y = getGroundHeight(x, z);
    for (const box of staticObstacles) {
      if (box.minY > y + 1.72 || box.maxY < y + .12 || x < box.minX - radius || x > box.maxX + radius
        || z < box.minZ - radius || z > box.maxZ + radius) continue;
      const hit = hitPolygon(box.outline); if (hit) return hit;
    }
    for (const [px, pz, r] of [ ...people.map(p => [p.position.x, p.position.z, .28]),
      ...parkingLights.map(p => [...p, .25]), [8, 12, .85], [-25, -12, .85]]) {
      const d = Math.hypot(x - px, z - pz);
      if (d < radius + r) return { x: (x - px) / (d || 1), z: (z - pz) / (d || 1) };
    }
    return null;
  }

  function findSpawn(near = { x: -18, z: -8 }) {
    // Deterministic search in the parking area, including after a moving car
    // or a newly loaded GLB covers the previous safe point.
    for (let r = 0; r < 80; r++) for (let i = 0; i < (r ? 32 : 1); i++) {
      const a = i * Math.PI / 16, x = near.x + Math.cos(a) * r * .5, z = near.z + Math.sin(a) * r * .5;
      if (pointInPolygon(x, z, parkingOutline) && !collision(x, z)) return new THREE.Vector3(x, getGroundHeight(x, z), z);
    }
    return null;
  }

  function clearKeys() { keys.clear(); }
  function setKey(code, pressed) {
    if (!state.active) return;
    if (pressed) keys.add(code); else keys.delete(code);
  }
  function updateCamera(dt, snap = false) {
    if (!state.active) return;
    const direction = new THREE.Vector3(Math.sin(state.cameraYaw), 0, -Math.cos(state.cameraYaw));
    const target = model.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const desired = target.clone().addScaledVector(direction, -5).add(new THREE.Vector3(0, 2.9, 0));
    const blend = snap ? 1 : 1 - Math.exp(-dt * 7);
    camera.position.lerp(desired, blend); controls.target.lerp(target, blend);
    camera.lookAt(controls.target);
  }
  function setWalking(active) {
    if (Boolean(active) === state.active) return state.active;
    clearKeys();
    if (active) {
      const spawn = findSpawn(); if (!spawn) return false;
      // Flush OrbitControls' residual damping before saving the overview.
      const damping = controls.enableDamping;
      controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
      savedView = { position: camera.position.clone(), target: controls.target.clone(), enabled: controls.enabled };
      model.position.copy(spawn); lastSafe = spawn.clone();
      state.cameraYaw = 0; state.yaw = Math.PI; state.phase = state.stride = state.speed = 0;
      model.rotation.y = state.yaw; state.active = model.visible = true;
      controls.enabled = false; animate(0, 0); updateCamera(1, true);
    } else {
      state.active = model.visible = false; state.speed = state.stride = 0; animate(0, 0);
      if (savedView) { camera.position.copy(savedView.position); controls.target.copy(savedView.target); controls.enabled = savedView.enabled; }
      controls.update();
    }
    return state.active;
  }
  function resetPosition() {
    clearKeys();
    const spawn = findSpawn();
    if (spawn) { model.position.copy(spawn); lastSafe.copy(spawn); state.speed = 0; updateCamera(1, true); }
  }
  function update(dt) {
    if (!state.active || dt <= 0 || !Number.isFinite(dt)) return;
    if (collision(model.position.x, model.position.z)) {
      const safe = lastSafe && !collision(lastSafe.x, lastSafe.z) ? lastSafe : findSpawn(model.position);
      if (safe) model.position.copy(safe); else { setWalking(false); return; }
    }
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const norm = Math.hypot(forward, right) || 1;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.4 : 2.2;
    const dx = (Math.sin(state.cameraYaw) * forward + Math.cos(state.cameraYaw) * right) / norm * speed;
    const dz = (-Math.cos(state.cameraYaw) * forward + Math.sin(state.cameraYaw) * right) / norm * speed;
    const start = model.position.clone();
    const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
    state.contact = false;
    for (let i = 0; i < steps; i++) {
      const p = model.position, mx = dx * h, mz = dz * h;
      const hit = collision(p.x + mx, p.z + mz);
      if (!hit) { p.x += mx; p.z += mz; }
      else {
        state.contact = true;
        const dot = Math.min(0, mx * hit.x + mz * hit.z);
        const sx = mx - hit.x * dot, sz = mz - hit.z * dot;
        if ((Math.abs(sx) + Math.abs(sz) > 1e-8) && !collision(p.x + sx, p.z + sz)) { p.x += sx; p.z += sz; }
        else if (!collision(p.x + mx, p.z)) p.x += mx;
        else if (!collision(p.x, p.z + mz)) p.z += mz;
      }
    }
    model.position.y = getGroundHeight(model.position.x, model.position.z);
    lastSafe.copy(model.position);
    state.speed = Math.hypot(model.position.x - start.x, model.position.z - start.z) / dt;
    if (forward || right) {
      const desired = Math.atan2(dx, dz);
      const delta = Math.atan2(Math.sin(desired - state.yaw), Math.cos(desired - state.yaw));
      state.yaw += delta * (1 - Math.exp(-dt * 12)); model.rotation.y = state.yaw;
    }
    state.phase += state.speed * dt * 4.5;
    state.stride += ((state.speed > .05 ? 1 : 0) - state.stride) * (1 - Math.exp(-dt * 14));
    animate(state.phase, state.stride);
  }
  return { state, model, keys, setWalking, setKey, clearKeys, update, updateCamera, resetPosition,
    collision, findSpawn, rotateCamera: delta => { if (state.active) state.cameraYaw += delta; } };
}
