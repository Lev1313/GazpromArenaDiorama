import * as THREE from 'three';
import { carOverlap } from './golfDrive.js';
import { createSmokeTexture } from '../materials/textures.js';

// Keep the parking-centre envelope; vary both radius and pace independently.
function routePoint(t, phase) {
  const a=t*.41-phase+.16*Math.sin(t*.29+phase)+.1*Math.sin(t*.133+phase*1.9);
  const rx=7.25+.5*Math.sin(t*.19+phase*.8)+.25*Math.cos(2*a+phase);
  const rz=18+.9*Math.sin(t*.16+phase*1.4);
  return {a,x:-8.1+.18*Math.sin(t*.11+phase)+rx*Math.cos(a),z:rz*Math.sin(a)+.35*Math.sin(2*a+phase)};
}

export function driftPose(t, phase) {
  const p=routePoint(t,phase), e=.02, before=routePoint(t-e,phase),after=routePoint(t+e,phase);
  const vx=(after.x-before.x)/(2*e),vz=(after.z-before.z)/(2*e);
  const ax=(after.x-2*p.x+before.x)/(e*e),az=(after.z-2*p.z+before.z)/(e*e);
  const speed=Math.hypot(vx,vz),curvature=(vx*az-vz*ax)/(speed**3);
  const blend=THREE.MathUtils.smoothstep(Math.abs(Math.sin(p.a)),.16,.82);
  const slip=-Math.tanh(curvature*25)*(.02+(.58+.11*Math.sin(t*.233+phase*.6))*blend);
  const travelAngle=-Math.atan2(vz,vx);
  const intensity=THREE.MathUtils.clamp(speed*Math.abs(Math.sin(slip))/2.2,0,1);
  const wheelAngle=THREE.MathUtils.clamp(-slip*.85-Math.atan(2.65*curvature)*.22,-.55,.55);
  return {x:p.x,z:p.z,angle:travelAngle+slip,travelAngle,slip,speed,intensity,wheelAngle};
}

/**
 * Two original drift cars, finite tire-mark buffer and 90 reusable smoke sprites.
 *
 * Created after static batching and material-cache separation, just like
 * the legacy scene. No DOM/controls required; update() runs from main's RAF.
 *
 * The optional texture factory is for Node unit tests (no browser canvas).
 * Golf position/active state preserves the existing yielding behavior.
 */
export function createDriftSystem(
  scene,
  { car },
  { makeSmokeTexture = createSmokeTexture } = {},
) {
  const driftCenter = new THREE.Vector2(-8.1, 0);
  const drifters = [
    { o: car(0xffa24e, { sport: true }), phase: 0, lastRear: null, smokeTimer: 0 },
    { o: car(0x4ed8d4, { sport: true }), phase: 2.4, lastRear: null, smokeTimer: 0 },
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
    const fp=o.userData.footprint;
    return [-1,1].map(side => new THREE.Vector3(-(fp?.halfLength ?? 1.96)*1.13/1.96, -.108, side*(fp?.halfWidth ?? 1.04)*.88/1.04)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), o.rotation.y)
      .add(o.position));
  }

  function addSkid(a, b) {
    const i = skidCursor * 6;
    skidPositions.set([a.x, a.y, a.z, b.x, b.y, b.z], i);
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

  let smokeIndex = 0, smokeEnabled = true;
  let simTime = 0, trackTimer = 0, driftTime = 0, driftWaiting = false;

  function emitSmoke(point, heading, intensity = 1, speed = 0) {
    const p = smokePool[smokeIndex];
    smokeIndex = (smokeIndex + 1) % smokePool.length;
    p.age = 0;
    p.o.position.copy(point);
    p.o.position.y = point.y + .3;
    p.o.visible = true;
    p.life=1.25+.85*intensity;
    p.opacity=.12+.22*intensity;
    p.size=.35+.3*intensity;
    p.growth=.9+.5*intensity;
    p.vx = -Math.cos(heading) * (.25+speed*.03) + .1*Math.sin(smokeIndex*2.3);
    p.vz = Math.sin(heading) * (.25+speed*.03) + .08*Math.cos(smokeIndex*1.7);
    p.o.material.rotation = simTime * 1.7;
  }

  // Faint historical tyre rings; fresh rear-wheel marks show the actual path.
  const prelaidTracks = [];
  for (const offset of [-.5, .4, 1]) {
    const points = [];
    for (let i = 0; i <= 128; i++) {
      const a = i / 128 * Math.PI * 2;
      points.push(new THREE.Vector3(
        driftCenter.x + (7.4 + offset) * Math.cos(a),
        -.114,
        (18.5 + offset) * Math.sin(a),
      ));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0x131d25, transparent: true, opacity: .12,
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
  function update(dt, { driving = false, golfPosition = null, people = [], obstacles = [] } = {}) {
    simTime += dt;
    trackTimer += dt;

    driftWaiting = drifters.some(c=>{
      const p=driftPose(driftTime+dt+.3,c.phase);
      return obstacles.some(o=>carOverlap({x:p.x,z:p.z},p.angle,o,.4));
    }) || Boolean(driving && golfPosition && drifters.some(c => {
      const p = driftPose(driftTime + dt + .3, c.phase);
      return Math.hypot(p.x - golfPosition.x, p.z - golfPosition.z) < 5;
    }));
    if (!driftWaiting) driftTime += dt;

    for (const c of drifters) {
      const p = driftPose(driftTime, c.phase);
      c.o.position.set(p.x, 0, p.z);
      c.o.rotation.y += Math.atan2(Math.sin(p.angle-c.o.rotation.y),Math.cos(p.angle-c.o.rotation.y));
      c.slip=p.slip;c.speed=driftWaiting?0:p.speed;c.intensity=driftWaiting?0:p.intensity;
      c.travelAngle=p.travelAngle;
      for (const wheel of c.o.userData.frontWheels) wheel.rotation.y = p.wheelAngle;

      const rear = rearPoints(c.o);
      if (!driftWaiting && p.intensity > .2 && trackTimer >= .045) {
        if (c.lastRear) {
          for (let j = 0; j < 2; j++) addSkid(c.lastRear[j], rear[j]);
        }
        c.lastRear = rear;
      } else if(driftWaiting || p.intensity<=.2) c.lastRear=null;
      if (!driftWaiting && smokeEnabled && p.intensity > .12) {
        c.smokeTimer+=dt;
        const interval=.2-.11*p.intensity;
        const count=Math.min(3,Math.floor(c.smokeTimer/interval));
        if(count){c.smokeTimer%=interval;for(let i=0;i<count;i++)for(const point of rear)emitSmoke(point,p.travelAngle,p.intensity,p.speed);}
      } else {
        c.smokeTimer=0;
      }
    }

    if (trackTimer >= .045) {
      trackTimer = 0;
      refreshSkids();
    }

    for (const p of smokePool) {
      p.age += dt;
      if (p.age >= p.life || !smokeEnabled) {
        p.o.visible = false;
        continue;
      }
      p.o.position.x += (p.vx+.14) * dt;
      p.o.position.z += (p.vz+.025) * dt;
      const damping=Math.exp(-dt*.65);p.vx*=damping;p.vz*=damping;
      p.o.position.y += dt * .35;
      const size = p.size + p.age * p.growth;
      p.o.scale.set(size, size, 1);
      p.o.material.opacity = p.opacity*Math.min(1,p.age/.1)*(1-p.age/p.life)**1.5;
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
