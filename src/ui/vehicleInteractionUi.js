import './vehicleInteractionUi.css';

export function installVehicleInteractionUi(root, seating, drive, hud) {
  const layer=document.createElement('div'); layer.id='seating-ui';
  layer.innerHTML=`<button type="button" id="seatPrompt" hidden></button>
    <p id="seatFeedback" role="status" hidden></p>
    <section id="seatPanel" hidden aria-label="Место в автомобиле">
      <strong id="seatVehicle"></strong><p id="seatRole"></p>
      <p id="seatMessage" role="status"></p>
      <button type="button" id="seatCamera">C · Вид автомобиля</button>
      <button type="button" id="seatExit">E · Выйти</button>
    </section>`;
  root.appendChild(layer);
  const $=s=>layer.querySelector(s);
  const roleNames={driver:'Водитель', 'front-passenger':'Передний пассажир', 'rear-left':'Сзади слева', 'rear-right':'Сзади справа'};
  function render() {
    const status=seating.getStatus();
    $('#seatPrompt').hidden=!status.target;
    $('#seatPrompt').textContent=status.message || `${status.prompt} · ${status.vehicleName}`;
    $('#seatPrompt').disabled=Boolean(status.target?.seat.occupiedBy);
    $('#seatFeedback').hidden=!status.message || status.seated || Boolean(status.target);
    $('#seatFeedback').textContent=status.message;
    $('#seatPanel').hidden=!status.seated;
    $('#seatVehicle').textContent=status.vehicleName;
    $('#seatRole').textContent=roleNames[status.seatId] || '';
    $('#seatMessage').textContent=status.message || (drive.state.active
      ? 'WASD — ехать · Пробел — ручник · остановись перед выходом'
      : 'Осмотр из автомобиля · E / Esc — выйти');
    $('#seatExit').disabled=Boolean(status.waitingExit);
    $('#seatCamera').hidden=drive.state.active;
    $('#seatPanel').classList.toggle('driving',drive.state.active);
    if(status.seated && !drive.state.active) root.querySelector('#hint').textContent='E / Esc — выйти · C — вид автомобиля';
  }
  const interact=()=>{ if(seating.isSeated()) seating.exit();else if(hud.state.running) seating.enter();render(); };
  $('#seatPrompt').addEventListener('click',interact);$('#seatExit').addEventListener('click',interact);
  $('#seatCamera').addEventListener('click',()=>{seating.cycleCamera();render();});
  function keydown(e) {
    if(e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target?.isContentEditable
      || ['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;
    if((e.code==='KeyE' && (seating.isSeated() || seating.state.active)) || (e.code==='Escape' && seating.isSeated())) {
      e.preventDefault();e.stopImmediatePropagation();interact();
    } else if(e.code==='KeyC' && seating.isSeated() && !drive.state.active) {
      e.preventDefault();e.stopImmediatePropagation();seating.cycleCamera();
    }
  }
  // Capture prevents one Esc from exiting a seat AND subsequently hiding the
  // resumed pedestrian through the legacy drive/walk bubble listeners.
  window.addEventListener('keydown',keydown,true);
  render();
  return {render,dispose(){window.removeEventListener('keydown',keydown,true);layer.remove();}};
}
