import * as THREE from 'three';

/**
 * Set the legacy night-time background, fog, hemisphere and sun.
 * Day/night switching is intentionally NOT part of Stage 2.
 * @param {THREE.Scene} scene
 */
export function createLighting(scene) {
  scene.background = new THREE.Color(0x101725);
  scene.fog = new THREE.Fog(0x101725, 220, 440);

  const hemi = new THREE.HemisphereLight(0xc1d1e2, 0x39493f, 1.8);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffd29a, 2.5);
  sun.position.set(-40, 85, 35);
  sun.castShadow = true;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  scene.add(sun);

  return { hemi, sun };
}
