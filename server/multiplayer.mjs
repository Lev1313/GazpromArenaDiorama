import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { VERSION, MAX_BYTES, validRoom, validId, validToken, exact, validNickname, validPose, validSequence } from '../src/network/protocol.js';

/** Memory-only two-person rooms. IDs and ownership always belong to the socket. */
export async function startMultiplayerServer({ host='127.0.0.1', port=8787, origins=[],
  graceMs=10000, heartbeatMs=15000, handshakeMs=5000, maxRooms=64, maxConnections=128,
  rate=30, burst=30 } = {}) {
  const rooms=new Map();
  const http=createServer((req,res)=>{
    if(req.method==='GET' && req.url==='/health') {
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      res.end(JSON.stringify({ok:true,rooms:rooms.size,connections:wss.clients.size}));
    } else res.writeHead(404).end();
  });
  http.headersTimeout=5000;http.requestTimeout=5000;
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX_BYTES,perMessageDeflate:false});
  const originAllowed=origin=>{
    if(!origin)return true; // Native clients; this is not account authentication.
    if(origins.includes(origin))return true;
    try {const u=new URL(origin);return ['http:','https:'].includes(u.protocol)
      && ['localhost','127.0.0.1','[::1]'].includes(u.hostname) && u.origin===origin;} catch{return false;}
  };
  http.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws' || !originAllowed(req.headers.origin) || wss.clients.size>=maxConnections) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  function send(ws,message) {
    if(ws?.readyState!==WebSocket.OPEN)return;
    if(ws.bufferedAmount>65536){ws.close(1013,'slow-client');return;}
    ws.send(JSON.stringify(message));
  }
  const publicPlayer=p=>({playerId:p.id,nickname:p.nickname,pose:p.pose,seq:p.seq});
  const players=room=>[...room.players.values()].filter(p=>p.ws?.readyState===WebSocket.OPEN).map(publicPlayer);
  function roster(room){const message={type:'roster',roomId:room.id,players:players(room)};
    for(const p of room.players.values())send(p.ws,message);}
  function remove(room,p) {room.players.delete(p.id);if(!room.players.size)rooms.delete(room.id);}
  function reject(ws,code){send(ws,{type:'error',code});ws.close(1008,code);}
  wss.on('connection',ws=>{
    let membership=null,handshaken=false,tokens=burst,last=performance.now(),alive=true;
    const deadline=setTimeout(()=>reject(ws,'handshake-timeout'),handshakeMs);deadline.unref();
    ws.on('pong',()=>{alive=true;});
    ws.on('error',()=>{}); // Protocol/oversize errors close this socket, never the process.
    ws.on('message',(bytes,binary)=>{
      if(ws.readyState!==WebSocket.OPEN)return;
      const now=performance.now();tokens=Math.min(burst,tokens+(now-last)*rate/1000);last=now;
      if(tokens<1){reject(ws,'rate-limit');return;}tokens--;
      if(binary || bytes.length>MAX_BYTES){reject(ws,'invalid-message');return;}
      let m;try{m=JSON.parse(bytes.toString());}catch{reject(ws,'invalid-json');return;}
      if(!handshaken) {
        const create=m?.type==='create',join=m?.type==='join';
        if((!create&&!join) || !exact(m,create?['type','v','nickname']:['type','v','nickname','roomId'],join?['playerId','resumeToken']:[])
          || m.v!==VERSION || !validNickname(m.nickname) || (join&&!validRoom(m.roomId))
          || (join&&(Object.hasOwn(m,'playerId')!==Object.hasOwn(m,'resumeToken')))
          || (join&&m.playerId!==undefined&&(!validId(m.playerId)||!validToken(m.resumeToken)))) {
          reject(ws,'invalid-handshake');return;
        }
        let room;
        if(create) {
          if(rooms.size>=maxRooms){reject(ws,'server-full');return;}
          const id=randomBytes(12).toString('base64url');room={id,players:new Map()};rooms.set(id,room);
        } else room=rooms.get(m.roomId);
        if(!room){reject(ws,'room-not-found');return;}
        let player;
        if(m.resumeToken!==undefined) {
          player=room.players.get(m.playerId);
          if(!player || player.token!==m.resumeToken){reject(ws,'resume-expired');return;}
          if(player.ws){reject(ws,'session-active');return;}
          if(Date.now()>player.expires){reject(ws,'resume-expired');return;}
        } else {
          if(room.players.size>=2){reject(ws,'room-full');return;}
          const slot=[0,1].find(n=>![...room.players.values()].some(p=>p.slot===n)),spawn=-18+slot*2;
          player={id:randomUUID(),token:randomBytes(24).toString('base64url'),nickname:m.nickname,slot,
            pose:{x:spawn,y:-.12,z:-8,yaw:Math.PI,moving:false},seq:0,ws:null,expires:Infinity};
          room.players.set(player.id,player);
        }
        player.ws=ws;player.expires=Infinity;membership={room,player};handshaken=true;clearTimeout(deadline);
        send(ws,{type:'welcome',v:VERSION,roomId:room.id,playerId:player.id,resumeToken:player.token,players:players(room)});
        roster(room);return;
      }
      const {room,player}=membership;
      if(rooms.get(room.id)!==room || room.players.get(player.id)!==player || player.ws!==ws
        || m?.roomId!==room.id || m?.playerId!==player.id){reject(ws,'identity-mismatch');return;}
      if(m.type==='leave' && exact(m,['type','roomId','playerId'])) {
        player.ws=null;membership=null;remove(room,player);roster(room);ws.close(1000,'left');return;
      }
      if(m.type!=='pose' || !exact(m,['type','roomId','playerId','seq','pose']) || !validSequence(m.seq)
        || m.seq<=player.seq || !validPose(m.pose)){reject(ws,'invalid-state');return;}
      player.pose=m.pose;player.seq=m.seq;
      for(const other of room.players.values())if(other!==player)send(other.ws,{type:'pose',roomId:room.id,playerId:player.id,seq:player.seq,pose:player.pose});
    });
    ws.on('close',()=>{
      clearTimeout(deadline);if(!membership)return;
      const {room,player}=membership;
      if(player.ws!==ws)return;
      player.ws=null;player.pose={...player.pose,moving:false};player.expires=Date.now()+graceMs;roster(room);
    });
    ws.isAlive=()=>alive;
    ws.markWaiting=()=>{alive=false;};
  });
  const cleanup=setInterval(()=>{
    for(const room of rooms.values())for(const p of room.players.values())if(!p.ws&&p.expires<=Date.now())remove(room,p);
  },Math.min(1000,Math.max(20,graceMs/2)));cleanup.unref();
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive()){ws.terminate();continue;}ws.markWaiting();ws.ping();}},heartbeatMs);heartbeat.unref();
  await new Promise((done,fail)=>{http.once('error',fail);http.listen(port,host,done);});
  return {http,wss,rooms,address:()=>http.address(),async close(){clearInterval(cleanup);clearInterval(heartbeat);
    for(const ws of wss.clients)ws.terminate();await new Promise(done=>wss.close(done));await new Promise(done=>http.close(done));rooms.clear();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=await startMultiplayerServer({host:process.env.HOST??'127.0.0.1',port:Number(process.env.PORT??8787),
    origins:(process.env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean)});
  console.log(`Walking WebSocket server: ws://${server.address().address}:${server.address().port}/ws (two players per room)`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close().then(()=>process.exit(0));});
}
