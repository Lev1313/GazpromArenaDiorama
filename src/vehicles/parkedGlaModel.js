import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareWheelBounds, installImportedWheels } from './wheelAnimation.js';

/** One background load into the stable nineteenth root; seating never reloads it. */
export async function replaceWithParkedGla(car) {
  const { scene: model } = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/cars/mercedes_gla_x156_black_wheels.glb`);
  prepareWheelBounds(model);
  model.name = 'mercedes-gla-x156-model';
  // Source is Y-up, +Z nose and X axle. Normalised car axes: +X nose, Z axle.
  model.rotation.y = Math.PI / 2;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  model.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
  model.position.set(-centre.x, -.12 - bounds.min.y, -centre.z);
  car.clear();
  car.add(model);
  installImportedWheels(car, model);
  car.userData.footprint = { halfLength: size.x / 2, halfWidth: size.z / 2, height: size.y };
  car.userData.attribution = {
    title: 'Mercedes-Benz GLA X156', author: 'ItsDiyor', license: 'CC BY 4.0',
    source: 'https://sketchfab.com/3d-models/mercedes-benz-gla-class-2020-ab7b5df3ba634f38a14effde3d542466',
  };
  return model;
}
