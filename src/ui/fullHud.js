import './fullHud.css';

/**
 * Full original diorama HUD. Reuses (moves, does not duplicate) the
 * existing Golf VI button and hint from driveUi. The Golf controller,
 * keyboard, touch controls and driving panel remain owned by driveUi.
 *
 * @param {HTMLElement} root
 * @param {ReturnType<import('./hudController.js').createHudController>} controller
 * @param {ReturnType<import('./driveUi.js').installDriveUi>} driveUi
 * @param {ReturnType<import('../vehicles/golfDrive.js').createGolfDrive>} drive
 */
export function installFullHud(root, controller, driveUi, drive) {
  const hud = document.createElement('section');
  hud.id = 'full-hud';
  hud.className = 'hud';
  hud.setAttribute('aria-label', 'Управление диорамой');
  hud.innerHTML = `
    <h1>Газпром Арена · миниатюра</h1>
    <p class="hud-description">Арена и ЗСД · модели по фотографиям
      <small>Парковка, набережная и автосходка.
      Low-poly; расстояния между объектами сжаты.</small>
    </p>
    <div class="hud-buttons">
      <button type="button" id="pause">⏸ Пауза</button>
      <button type="button" id="day">☀ День</button>
      <button type="button" id="reset">↺ Камера</button>
      <button type="button" id="meet">◎ Автосходка</button>
      <button type="button" id="arena">Арена</button>
      <button type="button" id="high">↗ ЗСД</button>
      <button type="button" id="map">⌖ Сверху</button>
      <button type="button" id="drift">◉ Дрифт</button>
      <button type="button" id="smoke">Дым: вкл.</button>
    </div>
    <label class="hud-tempo" for="speed">Темп
      <input id="speed" type="range" min="0.3" max="2" step="0.1" value="1" />
    </label>
    <p id="stats" aria-live="off"></p>
    <p id="err" role="alert"></p>
  `;
  root.appendChild(hud);

  // Move the already-wired Golf button; retain its existing event listener.
  // The toolbar is empty after the move, so there is no duplicated UI.
  const toolbar = driveUi.element.querySelector('.golf-toolbar');
  const driveButton = driveUi.element.querySelector('#drive');
  const hint = driveUi.element.querySelector('#hint');
  if (!toolbar || !driveButton || !hint) {
    hud.remove();
    throw new Error('Existing Golf UI controls not found');
  }
  driveButton.classList.add('primary');
  hud.querySelector('.hud-buttons').before(driveButton);
  hint.classList.add('full-hint');
  root.appendChild(hint);

  const details = document.createElement('details');
  details.id = 'photoSources';
  details.innerHTML = `
    <summary>Фото-основа</summary>
    <div>
      <a href="https://gazprom-arena.com/locations/parkovki/" target="_blank" rel="noopener">Арена и парковки · официальный сайт</a>
      <a href="https://gazprom-arena.com/technologies/" target="_blank" rel="noopener">Раздвижная крыша · устройство</a>
      <a href="https://35photo.pro/sergd/albums/12214/" target="_blank" rel="noopener">ЗСД у Арены · Сергей Дегтярёв</a>
      <a href="https://peterburg.center/ln/marshrut-krestovskiy-ostrov-1-chasovaya-progulka-ot-stanciy-metro-krestovskiy-ostrov-do.html" target="_blank" rel="noopener">Общий вид эстакады и района</a>
      <small>Формы воссозданы вручную по фотографиям.
      География и масштаб макета упрощены.</small>
    </div>
  `;
  root.appendChild(details);

  const pauseButton = hud.querySelector('#pause');
  const dayButton = hud.querySelector('#day');
  const smokeButton = hud.querySelector('#smoke');
  const speedInput = hud.querySelector('#speed');
  const stats = hud.querySelector('#stats');
  let wasDriving = null;

  function render() {
    pauseButton.textContent = controller.state.running ? '⏸ Пауза' : '▶ Продолжить';
    dayButton.textContent = controller.state.day ? '🌙 Ночь' : '☀ День';
    smokeButton.textContent = controllerDriftSmokeText();
    const status = drive.state.active;
    if (status !== wasDriving) {
      hud.classList.toggle('driving', status);
      details.hidden = status;
      wasDriving = status;
    }
    const text = controller.getStats();
    if (stats.textContent !== text) stats.textContent = text;
  }

  function controllerDriftSmokeText() {
    return controller.isSmokeEnabled() ? 'Дым: вкл.' : 'Дым: выкл.';
  }

  const buttons = {
    pause: () => controller.togglePause(),
    day: () => controller.toggleDay(),
    reset: () => controller.setCameraPreset('reset'),
    meet: () => controller.setCameraPreset('meet'),
    arena: () => controller.setCameraPreset('arena'),
    high: () => controller.setCameraPreset('high'),
    map: () => controller.setCameraPreset('map'),
    drift: () => controller.setCameraPreset('drift'),
    smoke: () => controller.toggleSmoke(),
  };
  function onClick(e) {
    const btn = e.target.closest('button');
    if (!btn || !hud.contains(btn)) return;
    if (buttons[btn.id]) {
      buttons[btn.id]();
      // setCameraPreset exits Golf mode; redraw its panel immediately.
      driveUi.render();
      render();
    }
  }
  hud.addEventListener('click', onClick);
  function onTempo() { controller.setSpeedScale(speedInput.value); }
  speedInput.addEventListener('input', onTempo);

  function onError() {
    hud.querySelector('#err').textContent =
      'Не удалось обновить 3D-сцену. Проверь консоль браузера.';
  }
  window.addEventListener('error', onError);

  render();
  return {
    element: hud,
    photoSources: details,
    render,
    dispose() {
      hud.removeEventListener('click', onClick);
      speedInput.removeEventListener('input', onTempo);
      window.removeEventListener('error', onError);
      toolbar.appendChild(driveButton);
      toolbar.appendChild(hint);
      driveButton.classList.remove('primary');
      hint.classList.remove('full-hint');
      hud.remove();
      details.remove();
    },
  };
}
