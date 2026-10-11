/**
 * Original diorama HUD actions with no DOM dependency.
 *
 * The driving UI already owns Golf's button, controls and cameras.
 * This module restores scene-wide toggles, camera presets and statistics.
 * Keep legacy numbers unchanged while migrating.
 */
export function createHudController({
  scene, renderer, camera, controls, hemi, sun, arenaX,
  drift, traffic, drive, staticCount, people,
}) {
  const state = { running: true, day: false, speedScale: 1 };

  function togglePause() {
    state.running = !state.running;
    drive.clearKeys(); // same as legacy pause button
    return state.running;
  }

  function toggleDay() {
    state.day = !state.day;
    scene.background.set(state.day ? 0x91c5e4 : 0x101725);
    scene.fog.color.set(state.day ? 0x91c5e4 : 0x101725);
    // The legacy toggler uses night hemisphere intensity 2, while
    // the untouched startup value in createLighting() is 1.8.
    hemi.intensity = state.day ? 3 : 2;
    sun.intensity = state.day ? 4 : 2.5;
    renderer.toneMappingExposure = state.day ? 1.25 : 1.55;
    return state.day;
  }

  function setSpeedScale(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return state.speedScale;
    state.speedScale = Math.max(.3, Math.min(2, n));
    return state.speedScale;
  }

  function toggleSmoke() {
    drift.setSmokeEnabled(!drift.smokeEnabled);
    return drift.smokeEnabled;
  }

  const cameraPresets = {
    meet: { position: [-20, 64, 64], target: [-8, 0, 0] },
    drift: { position: [-9, 44, 37], target: [-8, 1, 0] },
    arena: { position: [-6, 29, 54], target: [arenaX, 9, 0] },
    high: { position: [-85, 95, 95], target: [-27, 12, -17] },
    map: { position: [0, 230, -23.99], target: [0, 0, -24] },
    reset: { position: [-115, 150, 190], target: [-4, 12, -25] },
  };

  function setCameraPreset(name) {
    const preset = cameraPresets[name];
    if (!preset) throw new RangeError('Unknown camera preset: ' + name);
    // Original camera buttons always exit driving mode first.
    drive.setDriving(false);
    camera.position.set(...preset.position);
    controls.target.set(...preset.target);
    controls.update();
    return name;
  }

  function getStats() {
    return `Дрифт: ${drift.drifters.length} авто · на парковке: ${staticCount - (drive.state.active ? 1 : 0) + traffic.parkedVisitorCount} · зрителей: ${people.length}`;
  }

  return {
    state,
    cameraPresets,
    togglePause,
    toggleDay,
    setSpeedScale,
    toggleSmoke,
    setCameraPreset,
    getStats,
  };
}
