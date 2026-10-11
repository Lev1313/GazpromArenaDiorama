import * as THREE from 'three';

/**
 * Primitive helpers preserve the legacy signatures and defaults.
 * In legacy they add to the global scene. Here the scene is injected.
 * Optionally pass a parent group in the final argument.
 * Note: line() intentionally DOES NOT cast/receive shadows in the original.
 */
export function createPrimitives(scene) {
  function cube(w, h, d, material, x, y, z, rot = 0, parent = scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cyl(rt, rb, h, material, x, y, z, n = 12, parent = scene) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, n),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function line(a, b, material, r = 0.13, parent = scene) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const diff = B.clone().sub(A);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, diff.length(), 6),
      material,
    );
    mesh.position.copy(A.add(B).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      diff.normalize(),
    );
    parent.add(mesh);
    return mesh;
  }

  function polygon(points, y, material, parent = scene) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], i) => (
      i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)
    ));
    shape.closePath();

    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  return { cube, cyl, line, polygon };
}
