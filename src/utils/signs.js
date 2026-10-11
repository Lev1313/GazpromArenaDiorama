import * as THREE from 'three';

/**
 * Surface sign from the legacy HTML. Caller places and adds returned mesh.
 */
export function surfaceSign(text, color, bg, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + bg.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 68px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 66, 990);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
}

/** Floating landmark label from the original, added to the supplied scene. */
export function label(scene, text, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#142234dd';
  ctx.fillRect(0, 0, 512, 80);
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d6ebf9';
  ctx.fillText(text, 256, 52);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, 5, z);
  sprite.scale.set(24, 3.75, 1);
  scene.add(sprite);
  return sprite;
}
