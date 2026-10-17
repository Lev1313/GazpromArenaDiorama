import { VERSION, MAX_BYTES, validRoom, validId, validToken, exact, validNickname, validPose, validPlayers, validSequence } from './protocol.js';
import {validWorld,validVehicle} from './vehicleProtocol.js';

export function websocketURL(value, securePage=false) {
  const url=new URL(value);
  if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||url.pathname!=='/ws')throw Error('invalid-url');
  if(securePage&&url.protocol!=='wss:')throw Error('secure-url-required');
  return url.href;
}
export function roomLink(base,roomId,server) {
  if(!validRoom(roomId))throw Error('invalid-room');
  const url=new URL(base);url.searchParams.set('room',roomId);url.searchParams.set('ws',websocketURL(server));
  url.hash='';return url.href;
}

/** Native browser WebSocket only. Secrets live in this closure, never URLs/storage. */
export function createWalkingClient({ getPose, onRoster=()=>{}, onPose=()=>{}, onSession=()=>{}, onStatus=()=>{},
  WebSocketImpl=globalThis.WebSocket, sendMs=100, retryMs=500, maxRetries=5, welcomeMs=6000,
  onWorld=null,onVehicle=()=>{},onAction=()=>{},getVehicleState=()=>null }={}) {
  let socket=null,epoch=0,interval=null,deadline=null,retry=null,intent=null,credentials=null,seq=0,attempt=0;
  let status={phase:'offline',roomId:null,playerId:null,nickname:'',peers:0,reason:'',attempt:0};
  const publish=patch=>{status={...status,...patch};onStatus({...status});};
  function timers(){clearInterval(interval);clearTimeout(deadline);clearTimeout(retry);interval=deadline=retry=null;}
  function clearRemote(){onRoster([]);publish({peers:0});}
  function send(message){if(socket?.readyState===1&&socket.bufferedAmount<16384)socket.send(JSON.stringify(message));}
  function pose(){if(status.phase!=='connected'||!credentials)return;const value=getPose();if(validPose(value))send({type:'pose',
    roomId:credentials.roomId,playerId:credentials.playerId,seq:++seq,pose:value});
    const vehicle=getVehicleState();if(onWorld&&vehicle)command('vehicle-state',vehicle);
  }
  function command(type,payload){if(status.phase!=='connected'||!credentials||socket?.readyState!==1)return null;
    const id=++seq;send({type,roomId:credentials.roomId,playerId:credentials.playerId,seq:id,...payload});return id;}
  function start() {
    timers();const generation=++epoch;const previous=socket;socket=null;previous?.close();
    publish({phase:attempt?'reconnecting':'connecting',attempt,reason:''});
    let ws;try{ws=new WebSocketImpl(intent.url);}catch{publish({phase:'error',reason:'invalid-url'});return;}
    socket=ws;let terminal=false;
    const current=()=>generation===epoch;
    const protocolError=()=>{terminal=true;publish({phase:'error',reason:'protocol-error'});ws.close(1008,'protocol-error');};
    deadline=setTimeout(()=>{if(current()){publish({reason:'connection-timeout'});ws.close();}},welcomeMs);
    ws.addEventListener('open',()=>{
      if(!current())return;
      const message=credentials?{type:'join',v:VERSION,nickname:intent.nickname,roomId:credentials.roomId,
        playerId:credentials.playerId,resumeToken:credentials.resumeToken}
        :{type:intent.create?'create':'join',v:VERSION,nickname:intent.nickname,...(intent.create?{}:{roomId:intent.roomId})};
      send(onWorld?{...message,vehicles:true}:message);
    });
    ws.addEventListener('message',event=>{
      if(!current())return;
      if(typeof event.data!=='string'||new TextEncoder().encode(event.data).length>(onWorld?32768:MAX_BYTES*3)){protocolError();return;}
      let m;try{m=JSON.parse(event.data);}catch{protocolError();return;}
      if(exact(m,['type','code'])&&m.type==='error'&&typeof m.code==='string'&&m.code.length<64) {
        terminal=true;if(m.code==='resume-expired')credentials=null;
        publish({phase:'error',reason:m.code});clearTimeout(deadline);ws.close();return;
      }
      if(m?.type==='welcome') {
        if(status.phase==='connected'||!exact(m,['type','v','roomId','playerId','resumeToken','players'])||m.v!==VERSION
          ||!validRoom(m.roomId)||(!intent.create&&m.roomId!==intent.roomId)||!validId(m.playerId)||!validToken(m.resumeToken)||!validPlayers(m.players)
          ||!m.players.some(p=>p.playerId===m.playerId)||(credentials&&(m.playerId!==credentials.playerId||m.roomId!==credentials.roomId))) {protocolError();return;}
        const resumed=Boolean(credentials);credentials={roomId:m.roomId,playerId:m.playerId,resumeToken:m.resumeToken};
        intent={...intent,create:false,roomId:m.roomId};attempt=0;clearTimeout(deadline);
        const self=m.players.find(p=>p.playerId===m.playerId);
        publish({phase:'connected',roomId:m.roomId,playerId:m.playerId,nickname:self.nickname,reason:'',attempt:0});
        onSession({playerId:m.playerId,nickname:self.nickname,pose:self.pose,resumed});
        if(!current()||status.phase!=='connected'||!credentials)return;
        onRoster(m.players.filter(p=>p.playerId!==m.playerId));publish({peers:m.players.length-1});
        interval=setInterval(pose,sendMs);pose();return;
      }
      if(status.phase==='connected'&&onWorld){
        if(m?.type==='world'&&validWorld(m)){onWorld(m);return;}
        if(m?.type==='vehicle'&&exact(m,['type','vehicle'])&&validVehicle(m.vehicle)){onVehicle(m.vehicle);return;}
        if(m?.type==='action-result'&&exact(m,['type','requestId','ok','code'])&&validSequence(m.requestId)&&typeof m.ok==='boolean'&&typeof m.code==='string'&&m.code.length<64){onAction(m);return;}
      }
      if(status.phase!=='connected'||m?.roomId!==credentials?.roomId){protocolError();return;}
      if(m.type==='roster'&&exact(m,['type','roomId','players'])&&validPlayers(m.players)
        &&m.players.some(p=>p.playerId===credentials.playerId)) {
        onRoster(m.players.filter(p=>p.playerId!==credentials.playerId));publish({peers:m.players.length-1});return;
      }
      if(m.type==='pose'&&exact(m,['type','roomId','playerId','seq','pose'])&&validId(m.playerId)
        &&m.playerId!==credentials.playerId&&validSequence(m.seq)&&validPose(m.pose)) {onPose(m);return;}
      protocolError();
    });
    ws.addEventListener('error',()=>{if(current()&&!terminal)publish({reason:'connection-failed'});});
    ws.addEventListener('close',()=>{
      if(!current())return;
      clearInterval(interval);clearTimeout(deadline);interval=deadline=null;clearRemote();
      if(terminal)return;
      if(attempt>=maxRetries){publish({phase:'error',reason:'connection-lost'});return;}
      attempt++;publish({phase:'reconnecting',attempt,reason:'connection-lost'});
      retry=setTimeout(start,Math.min(5000,retryMs*2**(attempt-1)));
    });
  }
  function connect({url,nickname,roomId='',create=false,securePage=false}) {
    const checked=websocketURL(url,securePage);
    if(!validNickname(nickname)||(!create&&!validRoom(roomId)))throw Error('invalid-input');
    leave();intent={url:checked,nickname,roomId,create};seq=attempt=0;start();
  }
  function leave() {
    if(credentials)send({type:'leave',roomId:credentials.roomId,playerId:credentials.playerId});
    ++epoch;timers();socket?.close();socket=null;credentials=intent=null;seq=attempt=0;
    clearRemote();onSession(null);publish({phase:'offline',roomId:null,playerId:null,nickname:'',reason:'',attempt:0});
  }
  function reconnect(){if(!intent)return false;attempt=0;start();return true;}
  return {connect,leave,reconnect,command,flushPose:pose,dispose:leave,getStatus:()=>({...status}),get active(){return intent!==null;}};
}
