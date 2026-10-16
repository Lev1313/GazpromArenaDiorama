import './driveUi.css';

const driveKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Space',
]);

/**
 * Small, self-contained UI adapter for the Golf controller. This is not the
 * complete legacy HUD (presets/day-night/tempo are the next migration step).
 *
 * @param {HTMLElement} root
 * @param {ReturnType<import('../vehicles/golfDrive.js').createGolfDrive>} drive
 */
export function installDriveUi(root, drive) {
  const layer = document.createElement('div');
  layer.id = 'golf-ui';
  layer.innerHTML = `
    <div class="golf-toolbar">
      <button type="button" id="drive" aria-pressed="false">За руль Golf VI</button>
      <span id="hint">ЛКМ — вращение · колесо — масштаб · ПКМ — перемещение</span>
    </div>
    <section id="drivePanel" hidden aria-label="Управление автомобилем">
      <div class="driveHeading"><b id="vehicleName">GOLF VI</b> <span>Свободный заезд</span></div>
      <div class="instrument">
        <strong id="kmh">0</strong><span>км/ч</span><b id="gear">N</b>
      </div>
      <p id="driveMessage" role="status">Свободный заезд по парковке</p>
      <div class="driveControls">
        <button type="button" id="driveCamera">C · <span id="viewName">Сзади</span></button>
        <button type="button" id="driveReset">R · На место</button>
        <button type="button" id="driveExit">Выйти</button>
      </div>
      <div class="keyHelp">W / ↑ — газ · S / ↓ — тормоз и задний ход<br>A D / ← → — руль · Пробел — ручник / дрифт</div>
    </section>
    <div class="touchControls" aria-label="Педали и руль">
      <button type="button" data-drive-key="KeyA" aria-label="Руль влево">←</button>
      <button type="button" data-drive-key="KeyD" aria-label="Руль вправо">→</button>
      <button type="button" data-drive-key="KeyS" aria-label="Тормоз и назад">↓</button>
      <button type="button" data-drive-key="Space" class="handbrake" aria-label="Ручной тормоз для дрифта">Ручник</button>
      <button type="button" data-drive-key="KeyW" aria-label="Газ">↑</button>
    </div>
  `;
  root.appendChild(layer);

  const $ = selector => layer.querySelector(selector);
  const button = $('#drive'), panel = $('#drivePanel');
  const hint = $('#hint');
  function render() {
    const status = drive.getStatus();
    $('#vehicleName').textContent = status.vehicleName;
    $('#kmh').textContent = String(status.speedKmh);
    $('#gear').textContent = status.gear;
    $('#driveMessage').textContent = status.message;
    $('#viewName').textContent = status.viewName;
    panel.hidden = !status.active;
    button.textContent = status.active ? 'Выйти из машины' : 'За руль Golf VI';
    button.setAttribute('aria-pressed', String(status.active));
    layer.classList.toggle('driving', status.active);
    hint.textContent = status.active
      ? 'WASD / стрелки — ехать · Пробел — ручник / дрифт · C — камера · R — вернуть машину · Esc — выйти'
      : 'ЛКМ — вращение · колесо — масштаб · ПКМ — перемещение';
  }

  button.addEventListener('click', () => {
    drive.setDriving(!drive.state.active);
    render();
  });
  $('#driveCamera').addEventListener('click', () => {
    drive.cycleDriveView(); render();
  });
  $('#driveReset').addEventListener('click', () => {
    drive.resetGolf(); render();
  });
  $('#driveExit').addEventListener('click', () => {
    drive.setDriving(false); render();
  });

  function onKeyDown(e) {
    if (!drive.state.active || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
      return;
    }
    if (driveKeys.has(e.code)) {
      e.preventDefault();
      drive.setKey(e.code, true);
    }
    if (!e.repeat) {
      if (e.code === 'KeyC') drive.cycleDriveView();
      if (e.code === 'KeyR') drive.resetGolf();
      if (e.code === 'Escape') drive.setDriving(false);
    }
    render();
  }
  function onKeyUp(e) {
    drive.setKey(e.code, false);
    if (drive.state.active && driveKeys.has(e.code)) e.preventDefault();
  }
  function onBlur() { drive.clearKeys(); }
  function onVisibilityChange() { if (document.hidden) drive.clearKeys(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);

  for (const btn of layer.querySelectorAll('[data-drive-key]')) {
    const code = btn.dataset.driveKey;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!drive.state.active) return;
      btn.setPointerCapture(e.pointerId);
      drive.setKey(code, true);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      btn.addEventListener(event, () => drive.setKey(code, false));
    }
  }

  render();
  return {
    render,
    element: layer,
    dispose() {
      drive.clearKeys();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      layer.remove();
    },
  };
}
