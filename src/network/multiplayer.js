import { Vector3 } from 'three';
import { createWalkingClient } from './walkingClient.js';
import { createRemotePlayers, createNameLabel } from './remotePlayers.js';
import {createNetworkVehicles} from './networkVehicles.js';

/** One local controller plus one presentation-only remote model in the existing scene. */
export function createMultiplayer({scene,pedestrian,modes,hud,registry,drive,seating,drift}) {
  const remotes=createRemotePlayers(scene),originalId=pedestrian.state.playerId;
  let ownLabel=null;
  const vehicles=createNetworkVehicles({registry,drive,seating,pedestrian,modes,remotes,drift,getTransport:()=>transport});
  function clearLabel(){if(ownLabel){pedestrian.model.remove(ownLabel);ownLabel.userData.dispose();ownLabel=null;}}
  const transport=createWalkingClient({
    onWorld:message=>vehicles.world(message),onVehicle:v=>vehicles.receive(v),onAction:m=>vehicles.action(m),
    getVehicleState:()=>vehicles.localState(),
    onStatus:status=>{if(['reconnecting','error'].includes(status.phase))vehicles.disconnected();},
    getPose(){const p=pedestrian.model.position;return {x:p.x,y:p.y,z:p.z,
      yaw:Math.atan2(Math.sin(pedestrian.state.yaw),Math.cos(pedestrian.state.yaw)),
      moving:hud.state.running&&pedestrian.state.speed>.05};},
    onRoster:list=>remotes.roster(list),onPose:state=>remotes.receive(state),
    onSession(session) {
      clearLabel();
      if(!session){pedestrian.state.playerId=originalId;return;}
      pedestrian.state.playerId=session.playerId;
      if(!session.resumed) {
        if(seating.isSeated())seating.applyNetworkSeat(null,null);
        const p=new Vector3(session.pose.x,session.pose.y,session.pose.z);
        const safe=pedestrian.findSpawn(p);
        if(!safe||!pedestrian.resumeAt(safe,session.pose.yaw)){transport.leave();vehicles.clear();modes.setWalkingOnly(false);return;}
      }
      ownLabel=createNameLabel(session.nickname);pedestrian.model.add(ownLabel);
    },
  });
  return {
    connect(options) {
      if(!modes.setWalkingOnly(true))throw Error('exit-vehicle-first');
      try{transport.connect(options);vehicles.start();}catch(error){if(!transport.active){vehicles.clear();modes.setWalkingOnly(false);}throw error;}
    },
    leave(){transport.leave();vehicles.clear();modes.setWalkingOnly(false);},
    reconnect:()=>transport.reconnect(),
    getStatus:()=>({...transport.getStatus(),role:pedestrian.state.mode,seatId:pedestrian.state.seatId,
      vehicleName:registry.get(pedestrian.state.vehicleId)?.displayName??'',ready:vehicles.ready}),
    get active(){return transport.active;},
    get remoteDriver(){return vehicles.remoteDriver;},
    update(dt){vehicles.update(dt);remotes.update(dt);
      if(ownLabel)ownLabel.position.y=pedestrian.state.mode==='driver'?2.4:pedestrian.state.mode==='passenger'?3:2.08;},
    snapshot:()=>({status:transport.getStatus(),remotes:remotes.snapshot(),fleet:vehicles.snapshot()}),
    dispose(){transport.dispose();vehicles.clear();modes.setWalkingOnly(false);remotes.clear();clearLabel();},
  };
}
