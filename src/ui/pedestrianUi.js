import './pedestrianUi.css';

export function installPedestrianUi(root, pedestrian, modes, hud, canvas) {
  const button = document.createElement('button');
  button.id = 'walk'; button.type = 'button';
  root.querySelector('#drive').after(button);
  const panel = document.createElement('section');
  panel.id = 'pedestrianPanel'; panel.setAttribute('aria-label', 'Прогулка');
  panel.innerHTML = `<strong>Прогулка по парковке</strong>
    <p>WASD — ходьба · Shift — быстрее<br>Перетаскивай сцену — повернуть камеру</p>
    <p id="walkStatus" role="status"></p>
    <button type="button" id="walkReset">В свободную точку</button>
    <button type="button" id="walkExit">Завершить прогулку</button>`;
  root.appendChild(panel);
  const codes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight']);
  function render() {
    const active = pedestrian.state.active;
    button.textContent = active ? 'Завершить прогулку' : 'Прогулка';
    button.setAttribute('aria-pressed', String(active)); panel.hidden = !active;
    root.querySelector('#full-hud').classList.toggle('walking', active);
    if (active) root.querySelector('#hint').textContent = 'WASD — ходьба · Shift — быстрее · мышь — камера · Esc — обзор';
    panel.querySelector('#walkStatus').textContent = !hud.state.running ? 'Пауза'
      : pedestrian.state.contact ? 'Препятствие — обойди сбоку' : 'Осмотри автомобили';
  }
  button.addEventListener('click', () => { modes.walk(!pedestrian.state.active); render(); });
  panel.querySelector('#walkExit').addEventListener('click', () => { modes.walk(false); render(); });
  panel.querySelector('#walkReset').addEventListener('click', () => { pedestrian.resetPosition(); render(); });
  const typing = e => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
  function keydown(e) {
    if (!pedestrian.state.active || typing(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    if (codes.has(e.code)) { e.preventDefault(); if (hud.state.running) pedestrian.setKey(e.code, true); }
    if (e.code === 'Escape' && !e.repeat) { modes.walk(false); render(); }
  }
  function keyup(e) { pedestrian.setKey(e.code, false); }
  const clear = () => pedestrian.clearKeys();
  const visibility = () => { if (document.hidden) clear(); };
  let pointer = null;
  function down(e) {
    if (!pedestrian.state.active || e.button !== 0) return;
    pointer = { id: e.pointerId, x: e.clientX }; canvas.setPointerCapture(e.pointerId);
  }
  function move(e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    pedestrian.rotateCamera((e.clientX - pointer.x) * -.006); pointer.x = e.clientX;
  }
  const release = () => { pointer = null; };
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, release);
  render();
  return { render, dispose() {
    clear(); button.remove(); panel.remove();
    window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
    window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(event, release);
  } };
}
