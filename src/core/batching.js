import * as THREE from 'three';

/**
 * Legacy static architecture batching, extracted without geometry changes.
 *
 * Precondition: call once after all static architecture/environment objects
 * have been added, BEFORE any parked/moving cars, drift effects and Golf.
 *
 * Preserves the original grouping by material UUID, castShadow and
 * receiveShadow; ignores transparent meshes and multi-material objects.
 * Vertices are baked using matrixWorld, so nested/group transforms survive.
 *
 * Returns the number of original meshes removed (as in legacy).
 *
 * IMPORTANT: do not call twice as part of a frame/update loop.
 */
export function batchArchitecture(scene){scene.updateMatrixWorld(true);const groups=new Map();scene.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.material.transparent||!o.geometry.attributes.position)return;const key=o.material.uuid+'/'+o.castShadow+'/'+o.receiveShadow;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);});let removed=0;for(const list of groups.values()){if(list.length<3)continue;const geometries=list.map(o=>{const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);return g;});const count=geometries.reduce((n,g)=>n+g.attributes.position.count,0),positions=new Float32Array(count*3),normals=new Float32Array(count*3),uvs=new Float32Array(count*2);let offset=0;for(const g of geometries){const n=g.attributes.position.count;positions.set(g.attributes.position.array,offset*3);if(g.attributes.normal)normals.set(g.attributes.normal.array,offset*3);if(g.attributes.uv)uvs.set(g.attributes.uv.array,offset*2);offset+=n;g.dispose();}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geo.computeBoundingSphere();const merged=new THREE.Mesh(geo,list[0].material);merged.castShadow=list[0].castShadow;merged.receiveShadow=list[0].receiveShadow;scene.add(merged);for(const o of list){o.removeFromParent();removed++;}}return removed;}
