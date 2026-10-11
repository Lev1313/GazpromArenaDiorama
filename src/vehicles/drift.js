import * as THREE from 'three';
import { createSmokeTexture } from '../materials/textures.js';

// Legacy layout: the two drifters orbit (-8.1, 0) on an elongated oval.
// This function is intentionally identical to the original driftPose().
export function driftPose(t, phase) {
  const a = t * .43 - phase, r = 7.4 + .25 * Math.sin(a * 3);
  const x = -8.1 + r * Math.cos(a), z = 18.5 * Math.sin(a);
  const dr = .75 * Math.cos(a * 3);
  const dx = dr * Math.cos(a) - r * Math.sin(a), dz = 18.5 * Math.cos(a);
  return { x, z, angle: -Math.atan2(dz, dx) + .43 + .09 * Math.sin(a * 2) };
}

/**
 * Two original drift cars, finite tire-mark buffer and 90 reusable smoke sprites.
 *
 * Created after static batching and material-cache separation, just like
 * the legacy scene. No DOM/controls required; update() runs from main's RAF.
 *
 * The optional texture factory is for Node unit tests (no browser canvas).
 * When the drive-mode module arrives, supply its Golf position/active state
 * to update() for the same yielding behaviour as the legacy updateTraffic().
 */
export function createDriftSystem(
  scene,
  { car },
  { makeSmokeTexture = createSmokeTexture } = {},
) {
  const driftCenter = new THREE.Vector2(-8.1, 0);
  const drifters = [
    { o: car(0xffa24e, { sport: true }), phase: 0, lastRear: null },
    { o: car(0x4ed8d4, { sport: true }), phase: 1.1, lastRear: null },
  ];

  // Legacy circular skid buffer: fixed storage for 4,000 line segments.
  const skidCapacity = 4000;
  const skidPositions = new Float32Array(skidCapacity * 6);
  const skidGeometry = new THREE.BufferGeometry();
  skidGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(skidPositions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  skidGeometry.setDrawRange(0, 0);
  const skidLines = new THREE.LineSegments(
    skidGeometry,
    new THREE.LineBasicMaterial({
      color: 0x07111a, transparent: true, opacity: .54,
    }),
  );
  skidLines.frustumCulled = false;
  scene.add(skidLines);
  let skidCursor = 0, skidCount = 0;

  function rearPoints(o) {
    return [-.65, .65].map(z => new THREE.Vector3(-1.25, .015, z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y)
      .add(o.position));
  }

  function addSkid(a, b) {
    const i = skidCursor * 6;
    skidPositions.set([a.x, .014, a.z, b.x, .014, b.z], i);
    skidCursor = (skidCursor + 1) % skidCapacity;
    skidCount = Math.min(skidCapacity, skidCount + 1);
  }

  function refreshSkids() {
    skidGeometry.attributes.position.needsUpdate = true;
    skidGeometry.setDrawRange(0, skidCount * 2);
  }

  const smokeTexture = makeSmokeTexture();
  const smokePool = [];
  for (let i = 0; i < 90; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTexture, transparent: true, depthWrite: false,
      opacity: 0, color: 0xc6d9e4,
    }));
    sprite.visible = false;
    scene.add(sprite);
    smokePool.push({ o: sprite, age: 10, life: 2.3, vx: 0, vz: 0 });
  }

  let smokeIndex = 0, smokeTimer = 0, smokeEnabled = true;
  let simTime = 0, trackTimer = 0, driftTime = 0, driftWaiting = false;

  function emitSmoke(point, heading) {
    const p = smokePool[smokeIndex];
    smokeIndex = (smokeIndex + 1) % smokePool.length;
    p.age = 0;
    p.o.position.copy(point);
    p.o.position.y = .3;
    p.o.visible = true;
    p.vx = -Math.cos(heading) * .6 + .18;
    p.vz = Math.sin(heading) * .6;
    p.o.material.rotation = simTime * 1.7;
  }

  // The three lightly visible pre-laid rings are already present at t=0.
  const prelaidTracks = [];
  for (const offset of [-.5, .4, 1]) {
    const points = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 2;
      points.push(new THREE.Vector3(
        driftCenter.x + (7.4 + offset) * Math.cos(a),
        .006,
        (18.5 + offset) * Math.sin(a),
      ));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x131d25, transparent: true, opacity: .5,
      }),
    );
    scene.add(line);
    prelaidTracks.push(line);
  }

  function setSmokeEnabled(enabled) {
    smokeEnabled = Boolean(enabled);
    if (!smokeEnabled) {
      for (const p of smokePool) p.o.visible = false;
    }
  }

  /**
   * @param {number} dt - simulation seconds (already scaled for speed)
   * @param {{ driving?:boolean, golfPosition?:THREE.Vector3|null, people?:THREE.Group[] }} options
   */
  function update(dt, { driving = false, golfPosition = null, people = [] } = {}) {
    simTime += dt;
    trackTimer += dt;
    smokeTimer += dt;

    driftWaiting = Boolean(driving && golfPosition && drifters.some(c => {
      const p = driftPose(driftTime + dt + .3, c.phase);
      return Math.hypot(p.x - golfPosition.x, p.z - golfPosition.z) < 5;
    }));
    if (!driftWaiting) driftTime += dt;

    for (const c of drifters) {
      const p = driftPose(driftTime, c.phase);
      c.o.position.set(p.x, 0, p.z);
      c.o.rotation.y = p.angle;
      for (const wheel of c.o.userData.frontWheels) wheel.rotation.y = -.4;

      const rear = rearPoints(c.o);
      if (trackTimer >= .045) {
        if (c.lastRear) {
          for (let j = 0; j < 2; j++) addSkid(c.lastRear[j], rear[j]);
        }
        c.lastRear = rear;
      }
      if (!driftWaiting && smokeEnabled && smokeTimer >= .075) {
        for (const point of rear) emitSmoke(point, p.angle);
      }
    }

    if (trackTimer >= .045) {
      trackTimer = 0;
      refreshSkids();
    }
    if (smokeTimer >= .075) smokeTimer = 0;

    for (const p of smokePool) {
      p.age += dt;
      if (p.age >= p.life || !smokeEnabled) {
        p.o.visible = false;
        continue;
      }
      p.o.position.x += p.vx * dt;
      p.o.position.z += p.vz * dt;
      p.o.position.y += dt * .4;
      const size = .6 + p.age * 1.2;
      p.o.scale.set(size, size, 1);
      p.o.material.opacity = .32 * (1 - p.age / p.life);
    }

    // Spectators' subtle swaying comes from the same legacy updateTraffic().
    for (let i = 0; i < people.length; i++) {
      people[i].rotation.z = Math.sin(simTime * 1.4 + i) * .015;
    }
  }

  // Position both drifters before the first frame, as updateTraffic(0) does.
  update(0);

  return {
    drifters,
    driftCenter,
    skidCapacity,
    skidGeometry,
    skidLines,
    skidPositions,
    smokePool,
    smokeTexture,
    prelaidTracks,
    rearPoints,
    addSkid,
    refreshSkids,
    emitSmoke,
    update,
    setSmokeEnabled,
    get smokeEnabled() { return smokeEnabled; },
    get driftWaiting() { return driftWaiting; },
    get driftTime() { return driftTime; },
    get simTime() { return simTime; },
    get skidCount() { return skidCount; },
  };
}
