import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchArchitecture } from '../src/core/batching.js';
import { createMaterialSystem } from '../src/materials/materials.js';

function vertexSet(meshes) {
  const vertices = [];
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const positions = geo.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertices.push([
        positions.getX(i).toFixed(4),
        positions.getY(i).toFixed(4),
        positions.getZ(i).toFixed(4),
      ].join(','));
    }
    geo.dispose();
  }
  return vertices.sort();
}

test('batching reduces 4 meshes to 1 without changing world-space vertices', () => {
  const scene = new THREE.Scene();
  const parent = new THREE.Group();
  parent.position.set(11, 2, -7);
  parent.rotation.y = Math.PI / 6;
  scene.add(parent);
  const material = new THREE.MeshStandardMaterial({ color: 0x778899 });

  const original = [];
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1 + i, 2, 3), material);
    box.position.set(i * 3, i / 2, -i);
    box.rotation.z = i * 0.2;
    box.castShadow = true;
    box.receiveShadow = true;
    (i % 2 ? scene : parent).add(box);
    original.push(box);
  }

  const before = vertexSet(original);
  const vertexCount = before.length;
  const removed = batchArchitecture(scene);
  assert.equal(removed, 4);
  const mergedMeshes = [];
  scene.traverse(o => { if (o.isMesh) mergedMeshes.push(o); });
  assert.equal(mergedMeshes.length, 1);
  const merged = mergedMeshes[0];
  assert.strictEqual(merged.material, material);
  assert.equal(merged.castShadow, true);
  assert.equal(merged.receiveShadow, true);
  assert.equal(merged.geometry.index, null);
  assert.equal(merged.geometry.attributes.position.count, vertexCount);
  assert.equal(merged.geometry.attributes.normal.count, vertexCount);
  assert.equal(merged.geometry.attributes.uv.count, vertexCount);
  assert.deepEqual(vertexSet([merged]), before);
  assert.ok(original.every(o => o.parent === null));
});

test('legacy groups by material UUID and shadow flags; skips transparent and multi-material meshes', () => {
  const scene = new THREE.Scene();
  const common = new THREE.MeshStandardMaterial({ color: 0xaabbcc });
  const transparent = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.6 });
  const other = new THREE.MeshStandardMaterial({ color: 0xffffff });

  function add(n, material, cast, receive) {
    const objects = [];
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
      mesh.position.x = i;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      scene.add(mesh);
      objects.push(mesh);
    }
    return objects;
  }
  const groupA = add(3, common, true, true);
  const groupB = add(3, common, false, false);
  const tooSmall = add(2, common, true, false);
  const skippedTransparent = add(3, transparent, true, true);
  const skippedArrayMaterial = add(3, [common, other], true, true);
  const isolated = add(1, other, true, true);

  assert.equal(batchArchitecture(scene), 6);
  const remaining = scene.children.filter(x => x.isMesh);
  assert.equal(remaining.length, 11);
  assert.equal(remaining.filter(x => x.material === common).length, 4);
  assert.ok(remaining.includes(tooSmall[0]));
  assert.ok(remaining.includes(tooSmall[1]));
  assert.ok(remaining.includes(isolated[0]));
  assert.ok(skippedTransparent.every(x => x.parent === scene));
  assert.ok(skippedArrayMaterial.every(x => x.parent === scene));
  assert.ok([...groupA, ...groupB].every(x => x.parent === null));
  const merged = remaining.filter(x =>
    x.material === common && x.geometry.attributes.position.count === 108
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.filter(x => x.castShadow && x.receiveShadow).length, 1);
  assert.equal(merged.filter(x => !x.castShadow && !x.receiveShadow).length, 1);
});

test('unbatched singleton, doubleton and sprites keep their identity', () => {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const objects = Array.from({ length: 2 }, () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
    scene.add(mesh);
    return mesh;
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  scene.add(sprite);
  assert.equal(batchArchitecture(scene), 0);
  assert.deepEqual(scene.children, [...objects, sprite]);
});

test('material caching switches off only after geometry has been merged', () => {
  const scene = new THREE.Scene();
  const { mat, stopSharingStaticMaterials } = createMaterialSystem();
  const material = mat(0x335577);
  for (let i = 0; i < 3; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(0x335577));
    scene.add(box);
  }
  assert.equal(batchArchitecture(scene), 3);
  assert.strictEqual(scene.children[0].material, material);
  stopSharingStaticMaterials();
  const carPaintA = mat(0x335577);
  const carPaintB = mat(0x335577);
  assert.notStrictEqual(carPaintA, carPaintB);
  assert.notStrictEqual(carPaintA, material);
});
