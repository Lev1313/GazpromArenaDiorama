import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * The camera, target and OrbitControls settings from the original diorama.
 * @param {HTMLCanvasElement} canvas
 */
export function createCamera(canvas) {
  const camera = new THREE.PerspectiveCamera(
    44,
    window.innerWidth / window.innerHeight,
    0.1,
    450,
  );
  camera.position.set(-115, 150, 190);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-4, 12, -25);
  controls.enableDamping = true;
  controls.maxPolarAngle = 1.52;
  controls.minDistance = 18;
  controls.maxDistance = 320;
  controls.update();

  return { camera, controls };
}
