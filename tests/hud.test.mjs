import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHudController } from '../src/ui/hudController.js';
import { createLighting, configureNightLighting, setLightingMode } from '../src/core/lighting.js';

function setup() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101725);
  scene.fog = new THREE.Fog(0x101725, 220, 440);
  const renderer = { toneMappingExposure: 1.55 };
  const camera = new THREE.PerspectiveCamera(44, 1, .1, 450);
  camera.position.set(-115, 150, 190);
  const controls = {
    target: new THREE.Vector3(-4, 12, -25),
    updates: 0,
    update() { this.updates++; },
  };
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const drift = {
    drifters: [{}, {}],
    smokeEnabled: true,
    setSmokeEnabled(value) { this.smokeEnabled = Boolean(value); },
  };
  const traffic = { parkedVisitorCount: 0 };
  const drive = {
    state: { active: false },
    clears: 0,
    exits: 0,
    clearKeys() { this.clears++; },
    setDriving(active) {
      if (!active) this.exits++;
      this.state.active = Boolean(active);
    },
  };
  const people = Array.from({ length: 32 }, () => ({}));
  const hud = createHudController({
    scene, renderer, camera, controls, hemi, sun, arenaX: 41,
    drift, traffic, drive, staticCount: 18, people,
  });
  return {
    hud, scene, renderer, camera, controls, hemi, sun,
    drift, traffic, drive, people,
  };
}

test('moving-car headlights follow the car and switch off for parked, hidden and daytime cars', () => {
  const scene=new THREE.Scene(), {hemi,sun}=createLighting(scene);
  const cars=[new THREE.Group(),new THREE.Group(),new THREE.Group()];
  cars.forEach(c=>scene.add(c));
  const active=[true,true,false];
  const update=configureNightLighting(scene,{arenaX:50,headlightCars:cars.map((car,i)=>({car,isActive:()=>active[i],projector:i===0}))});
  const entries=scene.userData.headlights;
  assert.deepEqual(entries.map(e=>e.beam.visible),[true,true,false]);
  assert.strictEqual(entries[0].beam.geometry,entries[1].beam.geometry);
  cars[0].position.set(10,0,20);cars[0].rotation.y=Math.PI/2;
  scene.updateMatrixWorld(true);
  const target=entries[0].light.target.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(target.x-10)<1e-8 && target.z<20,'Beam points forward in car coordinates');
  active[0]=false;cars[1].visible=false;active[2]=true;update();
  assert.deepEqual(entries.map(e=>e.beam.visible),[false,false,true]);
  assert.equal(entries[0].light.intensity,0);
  setLightingMode(scene,{toneMappingExposure:1},hemi,sun,true);
  assert.ok(entries.every(e=>!e.beam.visible));
  setLightingMode(scene,{toneMappingExposure:1},hemi,sun,false);
  assert.equal(entries[2].beam.visible,true);
});

test('HUD starts with the night light scheme, normal tempo and smoke', () => {
  const { hud, renderer, hemi, sun } = setup();
  assert.deepEqual(hud.state, { running: true, day: false, speedScale: 1 });
  assert.equal(hud.isSmokeEnabled(), true);
  assert.equal(renderer.toneMappingExposure, 1.15);
  assert.equal(hemi.intensity, .4);
  assert.equal(sun.intensity, .65);
});

test('pause and resume preserve the original key-release behaviour', () => {
  const { hud, drive } = setup();
  assert.equal(hud.togglePause(), false);
  assert.equal(drive.clears, 1);
  assert.equal(hud.togglePause(), true);
  assert.equal(drive.clears, 2);
});

test('day/night controls update sky, fog, lights and ACES exposure', () => {
  const { hud, scene, renderer, hemi, sun } = setup();
  assert.equal(hud.toggleDay(), true);
  assert.equal(scene.background.getHex(), 0x91c5e4);
  assert.equal(scene.fog.color.getHex(), 0x91c5e4);
  assert.equal(hemi.intensity, 3);
  assert.equal(sun.intensity, 4);
  assert.equal(renderer.toneMappingExposure, 1.25);

  assert.equal(hud.toggleDay(), false);
  assert.equal(scene.background.getHex(), 0x101725);
  assert.equal(scene.fog.color.getHex(), 0x101725);
  assert.equal(hemi.intensity, .4);
  assert.equal(sun.intensity, .65);
  assert.equal(sun.color.getHex(), 0x9cbcff);
  assert.equal(renderer.toneMappingExposure, 1.15);
});

test('tempo slider preserves original range and ignores invalid numbers', () => {
  const { hud } = setup();
  assert.equal(hud.setSpeedScale('1.7'), 1.7);
  assert.equal(hud.state.speedScale, 1.7);
  assert.equal(hud.setSpeedScale(2.5), 2);
  assert.equal(hud.setSpeedScale(0.1), .3);
  assert.equal(hud.setSpeedScale('bad'), .3);
  assert.equal(hud.setSpeedScale(Infinity), .3);
  assert.equal(hud.state.speedScale, .3);
});

test('smoke toggle reuses existing drift pool rather than making particles', () => {
  const { hud, drift } = setup();
  assert.equal(hud.toggleSmoke(), false);
  assert.equal(drift.smokeEnabled, false);
  assert.equal(hud.isSmokeEnabled(), false);
  assert.equal(hud.toggleSmoke(), true);
  assert.equal(drift.smokeEnabled, true);
});

test('all five legacy camera presets exit Golf before changing camera', () => {
  const { hud, camera, controls, drive } = setup();
  for (const [name, expectedPosition, expectedTarget] of [
    ['meet', [-20, 64, 64], [-8, 0, 0]],
    ['drift', [-9, 44, 37], [-8, 1, 0]],
    ['arena', [-6, 29, 54], [41, 9, 0]],
    ['high', [-85, 95, 95], [-27, 12, -17]],
    ['map', [0, 230, -23.99], [0, 0, -24]],
  ]) {
    drive.state.active = true;
    assert.equal(hud.setCameraPreset(name), name);
    assert.equal(drive.state.active, false);
    assert.deepEqual(camera.position.toArray(), expectedPosition);
    assert.deepEqual(controls.target.toArray(), expectedTarget);
  }
  assert.equal(controls.updates, 5);
  assert.equal(drive.exits, 5);
});

test('reset camera and bad preset handling preserve original overview', () => {
  const { hud, camera, controls } = setup();
  hud.setCameraPreset('map');
  assert.equal(hud.setCameraPreset('reset'), 'reset');
  assert.deepEqual(camera.position.toArray(), [-115, 150, 190]);
  assert.deepEqual(controls.target.toArray(), [-4, 12, -25]);
  assert.throws(() => hud.setCameraPreset('nope'), RangeError);
});

test('statistics reflect Golf departure and current visitor parking', () => {
  const { hud, drive, traffic, people, drift } = setup();
  assert.equal(
    hud.getStats(), 'Дрифт: 2 авто · на парковке: 18 · зрителей: 32',
  );
  traffic.parkedVisitorCount = 2;
  assert.equal(
    hud.getStats(), 'Дрифт: 2 авто · на парковке: 20 · зрителей: 32',
  );
  drive.state.active = true;
  assert.equal(
    hud.getStats(), 'Дрифт: 2 авто · на парковке: 19 · зрителей: 32',
  );
  people.pop();
  drift.drifters.pop();
  assert.equal(
    hud.getStats(), 'Дрифт: 1 авто · на парковке: 19 · зрителей: 31',
  );
});
