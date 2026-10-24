import {DoubleSide,Mesh,MeshBasicMaterial,RingGeometry,Vector3} from 'three';
import {pickerEntries,pickerSeatSummary,selectPickerEntry} from './vehiclePickerState.js';
import './vehiclePicker.css';

// Swatches describe the existing original parking palette, not an extra car asset.
const palette=['#b4dbfa','#242e40','#ef525e','#e8c96a','#6376d3','#e4e8e9','#37baa6'];
const specialPaint={2:'#d42d3c',5:'#bdc8d1',16:'#17191f',17:'#103772',18:'#080a0e'};
function paint(index){return specialPaint[index]??palette[index<7?index:index<14?(index%7+2)%7:(index-14)%7];}

/** A lightweight vehicle locator: no duplicate renderer, GLB or driving controller. */
export function installVehiclePicker(root,{scene,camera,controls,registry,pedestrian,seating,drive,multiplayer}){
  const toggle=document.createElement('button');
  toggle.id='vehiclePickerToggle';toggle.type='button';toggle.textContent='Автомобили · 19';
  toggle.setAttribute('aria-controls','vehiclePickerPanel');
  toggle.setAttribute('aria-expanded','false');
  root.querySelector('#full-hud .hud-buttons').appendChild(toggle);
  const panel=document.createElement('section');
  panel.id='vehiclePickerPanel';panel.hidden=true;panel.setAttribute('aria-label','Выбор автомобиля');
  panel.innerHTML=`<header class="vehicle-picker-head">
    <strong>Выбор автомобиля</strong>
    <button type="button" id="vehiclePickerClose" aria-label="Закрыть каталог">×</button>
  </header>
  <p>Выбери машину, найди её на парковке и подойди к двери. Посадка по E остаётся обычной.</p>
  <label class="vehicle-picker-search">Поиск
    <input id="vehiclePickerSearch" type="search" placeholder="Golf, Lexus, Mercedes…" autocomplete="off">
  </label>
  <div id="vehiclePickerList" role="group" aria-label="Автомобили на парковке"></div>
  <div id="vehiclePickerSelected" hidden>
    <strong id="vehiclePickerName"></strong>
    <p id="vehiclePickerSeats" role="status"></p>
    <p id="vehiclePickerDistance"></p>
    <div class="vehicle-picker-actions">
      <button type="button" id="vehiclePickerLook">Показать машину</button>
      <button type="button" id="vehiclePickerClear">Снять выбор</button>
    </div>
  </div>`;
  root.appendChild(panel);
  const $=id=>panel.querySelector('#'+id);
  const worldmark=document.createElement('div');
  worldmark.id='vehiclePickerWorldmark';worldmark.hidden=true;worldmark.setAttribute('aria-hidden','true');
  root.appendChild(worldmark);
  const material=new MeshBasicMaterial({color:0x62ddff,transparent:true,opacity:.88,depthTest:false,depthWrite:false,side:DoubleSide});
  const geometry=new RingGeometry(1,1.085,48),marker=new Mesh(geometry,material);
  marker.name='selected-vehicle-marker';marker.rotation.x=-Math.PI/2;marker.renderOrder=1000;marker.visible=false;scene.add(marker);
  const projected=new Vector3(),lookingAt=new Vector3(),eye=new Vector3();
  const peekCamera=camera.clone();
  let selected=null,peekUntil=0,savedView=null,signature='',lastListAt=0;
  const active=()=>multiplayer.active,ready=()=>multiplayer.getStatus().ready;
  const current=()=>selected&&selectPickerEntry(registry,selected);
  const cameraMode=()=>JSON.stringify([pedestrian.state.active,pedestrian.state.mode,
    pedestrian.state.vehicleId,pedestrian.state.seatId,drive.state.active,drive.state.view]);
  function restoreView(){
    const damping=controls.enableDamping;
    if(controls.enabled){controls.enableDamping=false;controls.update();controls.enableDamping=damping;}
    camera.position.copy(savedView.position);camera.quaternion.copy(savedView.quaternion);
    controls.target.copy(savedView.target);camera.updateMatrixWorld();
  }
  function stopPeek(){
    if(savedView&&savedView.mode===cameraMode())restoreView();
    savedView=null;peekUntil=0;
  }
  function startPeek(){
    // Render the temporary view with a lightweight camera, so mode transitions
    // never save the catalog view as their own overview/chase camera.
    savedView={position:camera.position.clone(),quaternion:camera.quaternion.clone(),
      target:controls.target.clone(),mode:cameraMode()};
    restoreView(); // Clear orbit inertia without changing the captured visible pose.
    peekUntil=performance.now()+3000;
  }

  function choose(id){
    if(!registry.get(id))return;
    stopPeek();selected=id;signature='';render(true);
  }
  function clear(){stopPeek();selected=null;marker.visible=false;worldmark.hidden=true;signature='';render(true);}
  function open(value){
    panel.hidden=!value;toggle.setAttribute('aria-expanded',String(value));
    if(value){render(true);$('vehiclePickerSearch').focus();}
    else {stopPeek();toggle.focus();}
  }
  function listEntries(){
    const data=pickerEntries(registry,{connected:active(),ready:ready()});
    const filter=$('vehiclePickerSearch').value.trim().toLocaleLowerCase('ru');
    const filtered=data.filter(e=>e.name.toLocaleLowerCase('ru').includes(filter)
      ||String(e.index+1).includes(filter)||e.vehicleId.toLowerCase().includes(filter));
    const sig=JSON.stringify([selected,filter,...data.map(e=>[e.vehicleId,e.free,e.driverOccupied])]);
    if(sig===signature)return;signature=sig;
    const list=$('vehiclePickerList'),scroll=list.scrollTop;
    const focusedId=list.contains(document.activeElement)?document.activeElement.dataset.vehicleId:null;
    const fragment=document.createDocumentFragment();
    for(const entry of filtered){
      const button=document.createElement('button');button.type='button';
      button.className='vehicle-picker-item';button.dataset.vehicleId=entry.vehicleId;
      button.setAttribute('aria-pressed',String(entry.vehicleId===selected));
      const swatch=document.createElement('span');swatch.className='vehicle-picker-swatch';
      swatch.style.backgroundColor=paint(entry.index);swatch.setAttribute('aria-hidden','true');
      const labels=document.createElement('span');labels.className='vehicle-picker-labels';
      const name=document.createElement('strong');name.textContent=entry.name;
      const summary=document.createElement('small');summary.textContent=pickerSeatSummary(entry);
      labels.append(name,summary);button.append(swatch,labels);fragment.append(button);
    }
    if(!filtered.length){const p=document.createElement('p');p.textContent='Ничего не найдено';fragment.append(p);}
    list.replaceChildren(fragment);
    if(focusedId){
      [...list.children].find(button=>button.dataset.vehicleId===focusedId)?.focus({preventScroll:true});
    }
    list.scrollTop=scroll;
  }
  function render(force=false){
    if(!force&&panel.hidden)return;
    listEntries();
    const v=current(),visible=Boolean(v);
    $('vehiclePickerSelected').hidden=!visible;
    if(!visible)return;
    const entry=pickerEntries(registry,{connected:active(),ready:ready()})[v.index];
    $('vehiclePickerName').textContent=v.displayName;
    $('vehiclePickerSeats').textContent=pickerSeatSummary(entry);
    const seated=seating.isSeated()||drive.state.active;
    $('vehiclePickerLook').disabled=seated;
    $('vehiclePickerLook').textContent=peekUntil>performance.now()?'Вернуться':'Показать машину';
    if(seated)$('vehiclePickerDistance').textContent='Показ камеры недоступен во время поездки';
    else {
      const distance=Math.hypot(v.car.position.x-pedestrian.model.position.x,v.car.position.z-pedestrian.model.position.z);
      $('vehiclePickerDistance').textContent='До автомобиля: '+distance.toFixed(1)+' м · Подойди и нажми E';
    }
  }
  toggle.addEventListener('click',()=>open(panel.hidden));
  $('vehiclePickerClose').addEventListener('click',()=>open(false));
  $('vehiclePickerSearch').addEventListener('input',()=>{signature='';render(true);});
  $('vehiclePickerList').addEventListener('click',event=>{
    const b=event.target.closest('button[data-vehicle-id]');
    if(b)choose(b.dataset.vehicleId);
  });
  $('vehiclePickerClear').addEventListener('click',clear);
  $('vehiclePickerLook').addEventListener('click',()=>{
    if(seating.isSeated()||drive.state.active)return;
    if(savedView)stopPeek();else startPeek();
    render(true);
  });
  function onKey(event){
    if(event.key==='Escape'&&!panel.hidden&&!seating.isSeated()){
      event.preventDefault();event.stopImmediatePropagation();open(false);
    }
  }
  window.addEventListener('keydown',onKey,true);

  function update(){
    if(savedView&&(peekUntil<=performance.now()||savedView.mode!==cameraMode()
      ||seating.isSeated()||drive.state.active)){stopPeek();render(true);}
    const v=current();
    if(!v){stopPeek();marker.visible=false;worldmark.hidden=true;return;}
    if(savedView){
      peekCamera.copy(camera);
      lookingAt.copy(v.car.position).add(new Vector3(0,1,0));
      eye.set(8,6,9).applyAxisAngle(new Vector3(0,1,0),v.car.rotation.y);
      peekCamera.position.copy(lookingAt).add(eye);peekCamera.lookAt(lookingAt);
      peekCamera.updateMatrixWorld();
    }
    const car=v.car,extent=car.userData.footprint;
    marker.visible=true;
    marker.position.set(car.position.x,car.position.y+.07,car.position.z);
    marker.scale.set((extent?.halfLength??1.96)+.6,(extent?.halfWidth??1.04)+.6,1);
    projected.set(car.position.x,car.position.y+2.45,car.position.z).project(savedView?peekCamera:camera);
    const inView=projected.z>=-1&&projected.z<=1&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1;
    worldmark.hidden=!inView;
    if(inView){
      worldmark.textContent=v.displayName;
      worldmark.style.left=((projected.x+1)*50).toFixed(2)+'%';
      worldmark.style.top=((1-projected.y)*50).toFixed(2)+'%';
    }
    if(!panel.hidden&&performance.now()-lastListAt>500){lastListAt=performance.now();render();}
  }
  return {update,select:choose,clear,render,get renderCamera(){return savedView?peekCamera:camera;},dispose(){
    stopPeek();
    scene.remove(marker);geometry.dispose();material.dispose();
    window.removeEventListener('keydown',onKey,true);
    toggle.remove();panel.remove();worldmark.remove();
  }};
}
