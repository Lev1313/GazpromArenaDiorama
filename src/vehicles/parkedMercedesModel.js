import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Replace one existing parked car with the prepared Obsidian Black GL. */
export async function replaceWithParkedMercedes(car) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/cars/mercedes_gl_x166_obsidian_black.glb`);
  const model = gltf.scene;
  model.name = 'mercedes-gl-x166-model';
  // The source is Y-up with its nose/headlights along -Z; slots use +X.
  model.rotation.y = -Math.PI / 2;
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
  model.position.set(-centre.x, -.12 - bounds.min.y, -centre.z);
  car.clear();
  car.add(model);
  car.userData.frontWheels = [];
  car.userData.footprint = { halfLength: size.x / 2, halfWidth: size.z / 2, height: size.y };
  car.userData.attribution = {
    title: 'Mercedes GL X166 — Obsidian Black', author: null, license: null,
    note: 'User-supplied prepared asset; author and license were not provided.',
  };
  return model;
}
