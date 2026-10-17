import { roomLink } from '../network/walkingClient.js';
import { ROOM_RE } from '../network/protocol.js';
import './multiplayerUi.css';

const reasons={
  'invalid-url':'Нужен адрес ws://…/ws или wss://…/ws без пароля и параметров.',
  'secure-url-required':'Для HTTPS-страницы нужен защищённый адрес wss://…/ws.',
  'invalid-input':'Ник: 1–24 видимых символа. Код комнаты: 16 символов из ссылки.',
  'exit-vehicle-first':'Сначала остановитесь и выйдите из автомобиля.',
  'room-not-found':'Комната не найдена. Проверьте код или создайте новую.',
  'room-full':'В комнате уже два игрока; отключённое место сохраняется до 10 секунд.',
  'resume-expired':'Сессия истекла. Нажмите «Переподключиться», чтобы войти заново.',
  'session-active':'Этот игрок уже подключён.',
  'connection-failed':'Сервер недоступен. Проверьте адрес и запуск отдельного процесса.',
  'connection-lost':'Связь потеряна.', 'connection-timeout':'Сервер не ответил вовремя.',
  'rate-limit':'Сервер отклонил слишком частые сообщения.', 'server-full':'Сервер заполнен.',
  'protocol-error':'Несовместимый сетевой протокол.',
};
export function installMultiplayerUi(root,multiplayer) {
  const toggle=document.createElement('button');toggle.id='multiplayerToggle';toggle.type='button';
  toggle.setAttribute('aria-controls','multiplayerPanel');toggle.setAttribute('aria-expanded','false');
  root.querySelector('.hud-buttons').appendChild(toggle);
  const panel=document.createElement('section');panel.id='multiplayerPanel';panel.hidden=true;
  panel.setAttribute('aria-label','Сетевая прогулка');
  panel.innerHTML=`<button id="mpClose" type="button" aria-label="Закрыть сетевую панель">×</button>
    <strong>Сетевая прогулка · 2 игрока</strong>
    <p>В комнате доступна только прогулка. Автомобили, трафик и дрифт у каждого локальные.</p>
    <form id="mpForm">
      <label>WebSocket-сервер<input id="mpServer" type="url" placeholder="ws://127.0.0.1:8787/ws" maxlength="256" autocomplete="off" required></label>
      <label>Никнейм<input id="mpNickname" maxlength="48" autocomplete="off" required></label>
      <label>Код комнаты<input id="mpCode" maxlength="16" autocomplete="off" spellcheck="false"></label>
      <div><button id="mpCreate" type="button">Создать комнату</button><button id="mpJoin" type="submit">Войти</button></div>
    </form>
    <p id="mpStatus" role="status" aria-live="polite"></p>
    <p id="mpIdentity"></p>
    <label id="mpShare" hidden>Ссылка для второго игрока<input id="mpLink" readonly aria-label="Ссылка комнаты"></label>
    <button id="mpCopy" type="button" hidden>Копировать ссылку</button>
    <button id="mpReconnect" type="button" hidden>Переподключиться</button>
    <button id="mpLeave" type="button" hidden>Одиночный режим</button>`;
  root.appendChild(panel);const $=id=>panel.querySelector('#'+id);
  const query=new URL(location.href).searchParams;
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  $('mpServer').value=(query.get('ws')??import.meta.env.VITE_MULTIPLAYER_URL??(local?'ws://127.0.0.1:8787/ws':'')).slice(0,256);
  $('mpNickname').value='Игрок-'+crypto.getRandomValues(new Uint16Array(1))[0]%1000;
  if(ROOM_RE.test(query.get('room')??''))$('mpCode').value=query.get('room');
  let localMessage='',last='';
  function open(value){panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));}
  toggle.addEventListener('click',()=>open(panel.hidden));$('mpClose').addEventListener('click',()=>open(false));
  function connect(create) {
    localMessage='';
    try {multiplayer.connect({url:$('mpServer').value.trim(),nickname:$('mpNickname').value.trim(),
      roomId:$('mpCode').value.trim(),create,securePage:location.protocol==='https:'});$('mpNickname').blur();}
    catch(error){localMessage=reasons[error.message]??'Не удалось подключиться.';}
    render(true);
  }
  $('mpCreate').addEventListener('click',()=>connect(true));
  $('mpForm').addEventListener('submit',event=>{event.preventDefault();connect(false);});
  $('mpLeave').addEventListener('click',()=>{localMessage='';multiplayer.leave();render(true);});
  $('mpReconnect').addEventListener('click',()=>{localMessage='';multiplayer.reconnect();render(true);});
  $('mpCopy').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText($('mpLink').value);localMessage='Ссылка скопирована.';}
    catch{localMessage='Скопируйте ссылку из поля выше.';}
    render(true);
  });
  const guarded=['drive','walk','walkExit','reset','meet','arena','high','map','drift'];
  const previousButtons=new Map();
  function render(force=false) {
    const s=multiplayer.getStatus(),active=multiplayer.active;
    for(const id of guarded){const button=root.querySelector('#'+id);if(!button)continue;
      if(active){if(!previousButtons.has(button))previousButtons.set(button,{disabled:button.disabled,title:button.title});
        button.disabled=true;button.title='Сначала выйдите из комнаты';}
      else if(previousButtons.has(button)){Object.assign(button,previousButtons.get(button));previousButtons.delete(button);}}
    if(active){const prompt=root.querySelector('#seatPrompt');if(prompt)prompt.disabled=true;}
    const signature=JSON.stringify([s,localMessage]);if(!force&&signature===last)return;last=signature;
    toggle.textContent=s.phase==='connected'?`В комнате: ${s.peers+1}/2`:active?'Сеть: '+(s.phase==='error'?'ошибка':'подключение'):'Два игрока';
    const phase={offline:'Одиночный режим',connecting:'Подключение…',connected:`Подключено · ${s.peers+1}/2`,
      reconnecting:`Переподключение · попытка ${s.attempt}/5`,error:'Ошибка подключения'}[s.phase];
    $('mpStatus').textContent=localMessage||[phase,reasons[s.reason]??(s.reason?'Ошибка сети.':'')].filter(Boolean).join(' · ');
    $('mpIdentity').textContent=s.playerId?`${s.nickname} · Вы`:'';
    for(const id of ['mpCreate','mpJoin','mpServer','mpNickname','mpCode'])$(id).disabled=active;
    $('mpLeave').hidden=!active;$('mpReconnect').hidden=!active||!['error','reconnecting'].includes(s.phase);
    const share=Boolean(s.roomId);$('mpShare').hidden=$('mpCopy').hidden=!share;
    if(share){$('mpCode').value=s.roomId;$('mpLink').value=roomLink(location.href,s.roomId,$('mpServer').value.trim());}
  }
  const pagehide=()=>multiplayer.dispose();window.addEventListener('pagehide',pagehide);
  render();return {render,dispose(){window.removeEventListener('pagehide',pagehide);multiplayer.dispose();toggle.remove();panel.remove();}};
}
