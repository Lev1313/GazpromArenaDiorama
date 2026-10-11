import * as THREE from 'three';

/**
 * Exact implementation of the legacy mat(color, extra) cache and defaults.
 * Call stopSharingStaticMaterials() immediately after architecture batching,
 * before creating cars, so their paint materials remain independently editable.
 */
export function createMaterialSystem() {
  const materialCache = new Map();
  let shareStaticMaterials = true;

  function mat(color, extra = {}) {
    const key = JSON.stringify([color, extra]);
    if (shareStaticMaterials && materialCache.has(key)) {
      return materialCache.get(key);
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.72,
      metalness: 0.08,
      ...extra,
    });
    if (shareStaticMaterials) materialCache.set(key, material);
    return material;
  }

  function stopSharingStaticMaterials() {
    shareStaticMaterials = false;
  }

  return { mat, stopSharingStaticMaterials };
}

/** Legacy initial palette. Keep creation order/parameters when wiring terrain. */
export function createBaseMaterials(mat) {
  return {
    asphalt: mat(0x4b5056),
    road: mat(0x353d44),
    slab: mat(0x889390),
    white: mat(0xdae9f2),
    blue: mat(0x1689ff, { emissive: 0x0752ce, emissiveIntensity: 1.2 }),
    gold: mat(0xffb95e, { emissive: 0xca7627, emissiveIntensity: 1.4 }),
    sea: mat(0x122e48, { metalness: 0.3, roughness: 0.35 }),
    forest: mat(0x254d40),
    concrete: mat(0xadb4b2),
    glass: mat(0x5e9ec0, { metalness: 0.65, roughness: 0.24 }),
  };
}
