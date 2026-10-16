import { prepareWheelBounds, installImportedWheels } from './wheelAnimation.js';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Replace only the visual children, preserving the parking slot/reference. */
export async function replaceWithParkedGolf(car) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/cars/golf6_red_v2_wheels.glb`);
  const model = gltf.scene;
  prepareWheelBounds(model);
  model.name = 'golf6-red-v2-model';
  // V2 nose is +Z; procedural cars use +X. Keep the parking slot's world yaw.
  model.rotation.y = Math.PI / 2;
  model.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
  // Keep the prepared metre scale; centre the footprint and ground the actual
  // lowest vertex, rather than assuming the asset's origin is exactly Y=0.
  model.position.set(-centre.x, -.12 - bounds.min.y, -centre.z);
  car.clear();
  car.add(model);
  installImportedWheels(car,model);
  car.userData.footprint = { halfLength: size.x / 2, halfWidth: size.z / 2, height: size.y };
  car.userData.attribution = {
    title: 'Volkswagen golf 6', author: 'bimboit34', license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/volkswagen-golf-6-2b90c2664b9f447cb0be80c7f4bba26f',
  };
  return model;
}
