import * as THREE from 'three';

/** Procedural 1.76 m character, in the same scale/style as parking spectators. */
export function createCharacterModel(scene) {
  const model = new THREE.Group();
  model.name = 'pedestrian';
  const body = new THREE.Group();
  model.add(body);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3295b8, roughness: .9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd7ad8f, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x233449, roughness: .95 });
  function mesh(geometry, material, parent, x, y, z) {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  mesh(new THREE.CylinderGeometry(.23, .27, .65, 5), cloth, body, 0, 1.04, 0);
  mesh(new THREE.IcosahedronGeometry(.22, 1), skin, body, 0, 1.5, 0);
  // A small cap and visor make the facing direction readable from behind.
  mesh(new THREE.BoxGeometry(.38, .12, .38), dark, body, 0, 1.7, 0);
  mesh(new THREE.BoxGeometry(.34, .04, .18), dark, body, 0, 1.66, .2);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .13, .72, 0); body.add(leg);
    mesh(new THREE.BoxGeometry(.16, .57, .19), dark, leg, 0, -.285, 0);
    mesh(new THREE.BoxGeometry(.19, .15, .29), dark, leg, 0, -.645, .035);
    legs.push(leg);
    const arm = new THREE.Group(); arm.position.set(side * .31, 1.29, 0); body.add(arm);
    mesh(new THREE.BoxGeometry(.14, .43, .16), cloth, arm, 0, -.215, 0);
    mesh(new THREE.BoxGeometry(.14, .14, .15), skin, arm, 0, -.48, 0);
    arms.push(arm);
  }
  model.visible = false;
  scene.add(model);
  function animate(phase, amount) {
    const swing = Math.sin(phase) * .55 * amount;
    legs[0].rotation.x = swing; legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * .8; arms[1].rotation.x = swing * .8;
    body.position.y = Math.abs(Math.sin(phase)) * .035 * amount;
  }
  return { model, animate };
}
