import { Box3, Vector3, Group, Mesh, BoxGeometry, CylinderGeometry, MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const blackFinishes = {
  black_matt: { color: 0x151719, roughness: .9 },
  black_shiny: { color: 0x090c10, roughness: .18 },
  black: { color: 0x111315, roughness: .72 },
  tire_mat4: { color: 0x17191b, roughness: .96 },
};

/** A single accent SUV, retaining the slot and correcting only black trim. */
export async function replaceWithParkedLexus(car) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/cars/lexus_rx_deep_blue_mica.glb`);
  const model = gltf.scene;
  model.name = 'lexus-rx-deep-blue-mica-model';
  // Source geometry is Z-up, with its headlights/nose at -X.
  model.rotation.x = -Math.PI / 2;
  const orientation = new Group();
  orientation.rotation.y = Math.PI;
  orientation.add(model);
  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = false; o.receiveShadow = true;
      for (const material of (Array.isArray(o.material) ? o.material : [o.material])) {
        const finish = blackFinishes[material.name];
        if (!finish) continue;
        material.color.setHex(finish.color);
        material.roughness = finish.roughness;
        material.metalness = 0;
      }
    }
  });
  orientation.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(orientation);
  const size = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
  orientation.position.set(-centre.x, -.12 - bounds.min.y, -centre.z);
  // Avoid rendering 1.7M SUV triangles again into the directional shadow map.
  const shadow = new Group();
  shadow.name = 'lexus-shadow-proxy';
  const shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const bodyShadow = new Mesh(new BoxGeometry(size.x * .94, size.y * .7, size.z * .85), shadowMaterial);
  bodyShadow.position.y = -.12 + size.y * .57;
  bodyShadow.castShadow = true;
  shadow.add(bodyShadow);
  // Wheel contact shadows keep the grounded SUV from appearing to hover.
  const radius = size.y * .225;
  const wheelGeometry = new CylinderGeometry(radius, radius, .24, 8);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const wheel = new Mesh(wheelGeometry, shadowMaterial);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x * size.x * .28, -.12 + radius, z * size.z * .37);
    wheel.castShadow = true;
    shadow.add(wheel);
  }
  car.clear();
  car.add(orientation, shadow);
  car.userData.frontWheels = [];
  car.userData.footprint = { halfLength: size.x / 2, halfWidth: size.z / 2, height: size.y };
  car.userData.attribution = {
    title: 'Lexus RX — Deep Blue Mica', author: null, license: null,
    note: 'User-supplied prepared asset; author and license were not provided.',
  };
  return model;
}
