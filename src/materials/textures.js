import * as THREE from 'three';

/** The deterministic 256 x 256 asphalt grain from the original HTML. */
export function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(256, 256);

  let grainSeed = 1701;
  for (let i = 0; i < pixels.data.length; i += 4) {
    grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
    const value = 215 + (grainSeed % 30);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }

  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.27, 0.27);
  return texture;
}

/** Assign the texture to the shared asphalt material, as legacy does. */
export function applyAsphaltTexture(asphaltMaterial) {
  asphaltMaterial.map = createAsphaltTexture();
  asphaltMaterial.needsUpdate = true;
  return asphaltMaterial;
}

/** Same radial gradient used by the legacy drifting smoke sprites. */
export function createSmokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(220,229,235,.65)');
  gradient.addColorStop(0.4, 'rgba(196,210,222,.35)');
  gradient.addColorStop(1, 'rgba(160,182,204,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
