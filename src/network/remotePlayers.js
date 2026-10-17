import { CanvasTexture, Sprite, SpriteMaterial, Vector3 } from 'three';
import { createCharacterModel } from '../player/characterModel.js';

export function createNameLabel(nickname) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#11243de6';ctx.fillRect(0,0,512,80);
  ctx.fillStyle='#d7f4ff';ctx.font='bold 32px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(nickname,256,40,480); // Text, never HTML or markup.
  const texture=new CanvasTexture(canvas),material=new SpriteMaterial({map:texture,depthWrite:false});
  const label=new Sprite(material);label.position.y=2.08;label.scale.set(2.5,.39,1);
  label.userData.dispose=()=>{texture.dispose();material.dispose();};return label;
}

/** Arrival-time interpolation, independent of local controls, collisions and camera. */
export function createRemotePlayers(scene,{delayMs=120,now=()=>performance.now(),makeLabel=createNameLabel}={}) {
  const players=new Map();
  function remove(id) {
    const p=players.get(id);if(!p)return;
    scene.remove(p.model);p.label.userData.dispose();p.model.remove(p.label);
    const geometries=new Set(),materials=new Set();
    p.model.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());players.delete(id);
  }
  function receive({playerId,pose,seq}) {
    const p=players.get(playerId);if(!p||seq<=p.seq)return;
    p.seq=seq;p.samples.push({time:now(),pose:{...pose}});
    if(p.samples.length>32)p.samples.shift();
  }
  function roster(list) {
    const ids=new Set(list.map(p=>p.playerId));for(const id of players.keys())if(!ids.has(id))remove(id);
    for(const record of list) {
      if(players.has(record.playerId))continue;
      const {model,animate}=createCharacterModel(scene),label=makeLabel(record.nickname);
      model.name='remote-player';model.userData.remotePlayerId=record.playerId;model.add(label);model.visible=true;
      model.position.set(record.pose.x,record.pose.y,record.pose.z);model.rotation.y=record.pose.yaw;
      players.set(record.playerId,{model,animate,label,nickname:record.nickname,seq:record.seq,phase:0,stride:0,
        samples:[{time:now(),pose:{...record.pose}}]});
    }
  }
  const position=new Vector3();
  function update(dt) {
    const time=now()-delayMs;
    for(const p of players.values()) {
      while(p.samples.length>2&&p.samples[1].time<=time)p.samples.shift();
      const a=p.samples[0],b=p.samples[1]??a;
      const t=a===b?0:Math.max(0,Math.min(1,(time-a.time)/Math.max(1,b.time-a.time)));
      const x=a.pose.x+(b.pose.x-a.pose.x)*t,y=a.pose.y+(b.pose.y-a.pose.y)*t,z=a.pose.z+(b.pose.z-a.pose.z)*t;
      position.set(x,y,z);const distance=p.model.position.distanceTo(position);
      p.model.position.copy(position);
      p.model.rotation.y=a.pose.yaw+Math.atan2(Math.sin(b.pose.yaw-a.pose.yaw),Math.cos(b.pose.yaw-a.pose.yaw))*t;
      p.phase+=Math.min(distance,2)*4.5;
      const moving=distance>.0001&&b.pose.moving&&now()-b.time<350;
      p.stride+=((moving?1:0)-p.stride)*(1-Math.exp(-Math.max(0,dt)*14));p.animate(p.phase,p.stride);
    }
  }
  return {roster,receive,update,clear(){for(const id of players.keys())remove(id);},
    snapshot:()=>[...players].map(([playerId,p])=>({playerId,nickname:p.nickname,position:p.model.position.toArray(),
      yaw:p.model.rotation.y,stride:p.stride,seq:p.seq,samples:p.samples.length}))};
}
