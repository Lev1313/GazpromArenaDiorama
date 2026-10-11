import * as THREE from 'three';

/**
 * Shared car factory, migrated unchanged from the original diorama.
 * Vehicle geometry is local to +X (forward); createCar adds each group to
 * the scene, and all body-paint materials are independently generated.
 *
 * Create this factory AFTER batchArchitecture(scene) and
 * stopSharingStaticMaterials() have completed.
 */
export function createCarFactory(scene, mat) {
// Shared low-poly cars. Local +X is forward.
const palette=[0xb4dbfa,0x242e40,0xef525e,0xe8c96a,0x6376d3,0xe4e8e9,0x37baa6];
const rubber=mat(0x10151d),rim=mat(0xa7b6c7,{metalness:.65,roughness:.25}),windows=mat(0x193449,{metalness:.55,roughness:.2}),headMat=new THREE.MeshBasicMaterial({color:0xe8f5ff}),tailMat=new THREE.MeshBasicMaterial({color:0xff3042});
function car(color,{sport=false,hatch=false}={}){
 const g=new THREE.Group(),paint=mat(color,{roughness:.3,metalness:.4});
 const add=(geo,m,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o};
 add(new THREE.BoxGeometry(3.7,.62,1.7),paint,0,.72,0);add(new THREE.BoxGeometry(3.55,.16,1.78),rubber,0,.41,0);
 add(new THREE.BoxGeometry(hatch?2.1:1.75,.62,1.43),windows,hatch?-.35:-.15,1.25,0);add(new THREE.BoxGeometry(hatch?2.1:1.55,.09,1.49),paint,hatch?-.35:-.23,1.6,0);
 add(new THREE.BoxGeometry(.12,.68,1.5),paint,-.42,1.22,0);add(new THREE.BoxGeometry(.08,.22,.6),rubber,1.88,.68,0);
 g.userData.frontWheels=[];
 for(const x of [-1.13,1.15])for(const z of [-.88,.88]){const pivot=new THREE.Group();pivot.position.set(x,.4,z);g.add(pivot);const t=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.23,12),rubber);t.rotation.x=Math.PI/2;pivot.add(t);const r=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.25,8),rim);r.rotation.x=Math.PI/2;pivot.add(r);if(x>0)g.userData.frontWheels.push(pivot);}
 for(const z of [-.57,.57]){add(new THREE.BoxGeometry(.06,.19,.37),headMat,1.88,.79,z);add(new THREE.BoxGeometry(.06,.17,.32),tailMat,-1.88,.79,z);}
 if(sport){add(new THREE.BoxGeometry(.16,.4,.1),rubber,-1.5,1.14,-.57);add(new THREE.BoxGeometry(.16,.4,.1),rubber,-1.5,1.14,.57);add(new THREE.BoxGeometry(.45,.1,2.05),rubber,-1.5,1.36,0);add(new THREE.BoxGeometry(1.1,.04,.58),rubber,.99,1.06,0);}
 scene.add(g);return g;
}

  return { car, palette, rubber, rim, windows, headMat, tailMat };
}
