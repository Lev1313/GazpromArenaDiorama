import { Vector3 } from 'three';
import { createWalkingClient } from './walkingClient.js';
import { createRemotePlayers, createNameLabel } from './remotePlayers.js';

/** One local controller plus one presentation-only remote model in the existing scene. */
export function createMultiplayer({scene,pedestrian,modes,hud}) {
  const remotes=createRemotePlayers(scene),originalId=pedestrian.state.playerId;
  let ownLabel=null;
  function clearLabel(){if(ownLabel){pedestrian.model.remove(ownLabel);ownLabel.userData.dispose();ownLabel=null;}}
  const transport=createWalkingClient({
    getPose(){const p=pedestrian.model.position;return {x:p.x,y:p.y,z:p.z,
      yaw:Math.atan2(Math.sin(pedestrian.state.yaw),Math.cos(pedestrian.state.yaw)),
      moving:hud.state.running&&pedestrian.state.speed>.05};},
    onRoster:list=>remotes.roster(list),onPose:state=>remotes.receive(state),
    onSession(session) {
      clearLabel();
      if(!session){pedestrian.state.playerId=originalId;return;}
      pedestrian.state.playerId=session.playerId;
      if(!session.resumed) {
        const p=new Vector3(session.pose.x,session.pose.y,session.pose.z);
        const safe=pedestrian.findSpawn(p);
        if(!safe||!pedestrian.resumeAt(safe,session.pose.yaw)){transport.leave();modes.setWalkingOnly(false);return;}
      }
      ownLabel=createNameLabel(session.nickname);pedestrian.model.add(ownLabel);
    },
  });
  return {
    connect(options) {
      if(!modes.setWalkingOnly(true))throw Error('exit-vehicle-first');
      try{transport.connect(options);}catch(error){if(!transport.active)modes.setWalkingOnly(false);throw error;}
    },
    leave(){transport.leave();modes.setWalkingOnly(false);},
    reconnect:()=>transport.reconnect(),
    getStatus:()=>transport.getStatus(),
    get active(){return transport.active;},
    update:dt=>remotes.update(dt),
    snapshot:()=>({status:transport.getStatus(),remotes:remotes.snapshot()}),
    dispose(){transport.dispose();modes.setWalkingOnly(false);remotes.clear();clearLabel();},
  };
}
