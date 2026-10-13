import * as THREE from 'three';

/**
 * Global moon/sky lighting; the same directional source becomes the daytime sun.
 * @param {THREE.Scene} scene
 */
export function createLighting(scene) {
  scene.background = new THREE.Color(0x101725);
  scene.fog = new THREE.Fog(0x101725, 220, 440);

  const hemi = new THREE.HemisphereLight(0x829ac7, 0x172321, .4);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0x9cbcff, .65);
  sun.position.set(-40, 85, 35);
  sun.castShadow = true;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  scene.add(sun);

  return { hemi, sun };
}

/** Install bounded, shadow-free local sources after the scene has been built. */
export function configureNightLighting(scene, { arenaX, headlightCars = [] }) {
  // Reuse the sixteen actual lamp fixtures rather than adding duplicate lights.
  scene.traverse(o => {
    if (o.isPointLight) o.userData.nightIntensity = o.intensity === 15 ? 180 : 55;
  });
  for (const z of [-38, 38]) {
    const light = new THREE.SpotLight(0x83caff, 380, 75, Math.PI / 3, .7, 2);
    light.position.set(arenaX, 14, z);
    light.target.position.set(arenaX, 12, 0);
    light.userData.nightIntensity = 380;
    scene.add(light, light.target);
  }
  // Cheap road light footprints for all moving cars; only two near-field
  // cars also use real projectors. No extra shadow maps or per-frame allocation.
  const pixels = new Uint8Array(64 * 16 * 4);
  for (let x=0;x<64;x++) for (let z=0;z<16;z++) {
    const i=(z*64+x)*4, edge=Math.sin(Math.PI*z/15);
    pixels.set([255,255,255,Math.round(210*(1-x/63)**2*edge**2)],i);
  }
  const texture = new THREE.DataTexture(pixels,64,16);
  texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([2,-.07,-.7,2,-.07,.7,13,-.07,-2.5,13,-.07,2.5],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0,1,1],2));
  geometry.setIndex([0,1,2,1,3,2]);
  const beamMaterial = new THREE.MeshBasicMaterial({map:texture,color:0xaccfff,
    transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const headlights = headlightCars.map(({car,isActive,projector=false}) => {
    const material=beamMaterial.clone();
    // Guest cars are clipped at the east edge, including their light footprint.
    const body=car.children.find(o=>o.isMesh);
    material.clippingPlanes=body?.material.clippingPlanes || null;
    const beam=new THREE.Mesh(geometry,material);
    car.add(beam);
    let light;
    if (projector) {
      light=new THREE.SpotLight(0xe1eeff,65,22,.48,.65,2);
      light.position.set(1.9,.8,0);
      light.target.position.set(13,-.1,0);
      light.userData.nightIntensity=65;
      car.add(light,light.target);
    }
    return {car,isActive,beam,light};
  });
  let daytime=false;
  const updateHeadlights = (day=daytime) => {
    daytime=day;
    for (const {car,isActive,beam,light} of headlights) {
      const enabled=!day && car.visible && isActive();
      beam.visible=enabled;
      if(light)light.intensity=enabled?65:0;
    }
  };
  scene.userData.updateHeadlights=updateHeadlights;
  scene.userData.headlights=headlights;
  updateHeadlights();
  const materials = new Set();
  scene.traverse(o => {
    if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material]))
      if (m.isMeshStandardMaterial) materials.add(m);
  });
  const windows = new Set([0x1b2d38, 0x5e9ec0, 0x7ea8ba, 0x8eb3c0, 0x6994a9]);
  scene.userData.nightMaterials = [...materials].filter(m => m.emissive.getHex() || windows.has(m.color.getHex())).map(m => ({
    material: m, originalColor: m.emissive.clone(), originalIntensity: m.emissiveIntensity,
    window: windows.has(m.color.getHex()),
  }));
  return updateHeadlights;
}

/** Apply a complete, repeatable light scheme, including existing emissive windows. */
export function setLightingMode(scene, renderer, hemi, sun, day) {
  scene.background.set(day ? 0x91c5e4 : 0x101725);
  scene.fog.color.copy(scene.background);
  scene.fog.near = 220;
  scene.fog.far = 440;
  hemi.color.set(day ? 0xc1d1e2 : 0x829ac7);
  hemi.groundColor.set(day ? 0x39493f : 0x172321);
  hemi.intensity = day ? 3 : .4;
  sun.color.set(day ? 0xffd29a : 0x9cbcff);
  sun.intensity = day ? 4 : .65;
  renderer.toneMappingExposure = day ? 1.25 : 1.15;
  scene.traverse(o => {
    if (o.userData.nightIntensity !== undefined) o.intensity = day ? 0 : o.userData.nightIntensity;
  });
  for (const entry of scene.userData.nightMaterials || []) {
    const m = entry.material;
    m.emissive.copy(entry.originalColor);
    if (entry.window && !day) m.emissive.set(0x927752);
    m.emissiveIntensity = entry.window ? (day ? entry.originalIntensity : .32)
      : entry.originalIntensity * (day ? .18 : 1.8);
  }
  scene.userData.updateHeadlights?.(day);
}
