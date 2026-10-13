
# Gazprom Arena Diorama

## Goal
Build an interactive low-poly 3D diorama of the Gazprom Arena surroundings in Saint Petersburg.

## Main objects
- Gazprom Arena stadium
- Western High-Speed Diameter (ZSD)
- Parking lot for car meetups
- Lakhta Center
- Surrounding roads and environment

## Geography
Preserve the agreed composition:
- ZSD is to the left of the parking area.
- Parking is farther right.
- Use real maps and reference photographs.

## Parking area
- Parked cars around the edges
- Spectators around the perimeter
- Two cars drifting in the center
- Tire smoke and skid marks

## Visual style
- Detailed low-poly
- Realistic proportions
- Recognizable architecture
- Attractive lighting

## Existing features
Inspect the original HTML and preserve:
- Moving cars
- Controllable Golf
- Camera controls
- Day/night lighting
- Drift effects

## Current priority
Improve architectural accuracy and geographic realism before detailing vehicles.

## Development
Keep a progress log in PROGRESS.md.

## Technical notes (from audit 2026-10-11)
- Source of truth: `legacy/gazprom_arena_diorama.html` (byte-identical copy of the original, never edit). Three.js r164 + OrbitControls embedded as base64; runs from file:// or `npm run serve:legacy`.
- Visual/functional regression: `npm run baseline:verify [-- --url <page>]` compares against `baseline/screenshots/` (deterministic clock, SwiftShader; 27 checks, 23 shots). Re-baseline (`npm run baseline`) only on purpose, after an approved visual change.
- Scene axes: north = -Z, east = +X. Arena center x = 41; parking lot x -28..12, z -40..40; ZSD axis west of the lot; Lakhta at (-62, -102), distance compressed.
- Migration to Vite + modular Three.js: proposed in PROGRESS.md section 7, not yet approved. Transfer must be 1:1 (same three version, same coordinates) before any improvements.

## Architecture milestone — static batching
- After terrain, stadium, ZSD, Lakhta and surroundings have been created, call `batchArchitecture(scene)` exactly once, then `stopSharingStaticMaterials()`, BEFORE adding any moving cars or interactive objects.
- Preserve the original grouping by shared material identity and shadow flags, and do not batch transparent signs, smoke, or dynamic vehicle meshes.
- Optimization changes the scene graph structure; any future object references must be created after batching or explicitly excluded from it. The static grouping must be visually regression-tested against the preceding branch.
- Stage 3.6 is under review in `review/stage3-static-batching`; do not treat it as merged or tested yet.


## Vehicles migration — stage 4.1
- Static architecture is batched BEFORE any vehicle groups are created. Car creation follows `stopSharingStaticMaterials()`; separate vehicle paint materials must not be shared accidentally.
- The original parking layout contains 18 parked car groups and 32 spectator groups, with 28 painted parking-space lines and 14 short boundary bollards. No drifters or highway/visitor traffic are in stage 4.1.
- `parked[5]` is the silver Golf VI (paint `0xbdc8d1`, position x=-22.4, z=16). Preserve this object as the future controllable car when reintroducing drive mode.
- Future traffic and drifters should reuse the `car()` factory from `src/vehicles/car.js` and avoid batching dynamic car groups.
- Implementation awaits local review in `review/stage4-parked-cars`.


## Drift migration — stage 4.2
- `src/vehicles/drift.js` owns the two drifting cars, a fixed 4,000-segment tire-mark buffer, 90 reusable smoke sprites, three pre-existing tire rings, and `driftPose(t, phase)`.
- Call `createDriftSystem(scene, carFactory)` after static batching and parked-vehicle creation, then call `drift.update(dt, { people, driving, golfPosition })` from the animation loop. The default stage 4.2 loop passes `people` only; Golf integration will supply the other parameters later.
- Keep the legacy 0.045 s tire updates, 0.075 s smoke emission, phase difference 1.1, and maximum frame dt 0.06 s. Expose `setSmokeEnabled()` to the later UI without inventing new behaviour.
- The smoke CanvasTexture comes from `src/materials/textures.js`; Node tests inject a THREE.Texture to avoid needing a DOM canvas.
- Review branch: `review/stage4-drift`. Await local unit tests and visual inspection before merging.


## Traffic migration — stage 4.3
- `src/vehicles/traffic.js` creates 14 moving ZSD vehicles plus 3 visitors, after static batching and before `createDriftSystem()`.
- It needs `createZsd()`'s `highwayCurve/highwayPoint`, the common `createCarFactory()` and `createParkingMeet()`'s parking `markings` material. The objects stay dynamic and must never be merged with static architecture.
- Preserve the legacy speed/direction maths for ZSD (`dt*.025`) and visitor arrival/parking/departure on CatmullRomCurve3 (`dt*3 / route.getLength()`), including starting delays 0/12/24 seconds and dwell times 22/28/34 seconds.
- For future Golf drive mode call `traffic.update(dt, {driving:driveState.active, golfPosition:golf.position})`; moving visitors yield at separation <4.6.
- The preexisting drift module remains independent and continues to be updated after traffic. Traffic module exposes `parkedVisitorCount` for future stats UI.
- Review branch `review/stage4-traffic` awaits local tests and visual approval before merging.


## Golf VI control — stage 4.4
- Silver Golf is `parked[5]` and is controlled by `src/vehicles/golfDrive.js`, which is a DOM-free controller; `src/ui/driveUi.js` owns keyboard/touch buttons and the temporary driving HUD.
- Use the original parking `parkingOutline` from `createTerrain()`; collision checks must include the other parked cars, spectators, lamp posts, tables, drifting vehicles and active visitors. No traffic/car meshes are ever statically batched.
- RAF order: `drive.updateDriving(dt)`, `traffic.update(dt,{driving,golfPosition})`, `drift.update(dt,{people,driving,golfPosition})`, then either `drive.updateDriveCamera(dt)` or `controls.update()`, then render. Keep max dt .06s.
- Original drive camera views: chase, overhead, free; exit restores orbit camera/target and car starting position. Golf braking must reuse the drift module's smoke and skid resources.
- The full original HUD, camera presets and day/night, speed-scale, pause toggles remain a distinct next stage. Branch `review/stage4-golf-drive` needs local tests and manual browser validation before merging.


## Stage 4.5 — complete HUD, old controls and smoke/camera integration
- New `src/ui/hudController.js` handles pause/day/night/tempo/smoke/preset-camera state without DOM, reusing original scene/camera/light constants. `src/ui/fullHud.js` mounts the original scene-wide buttons, live stats and four photo-source links.
- Full HUD **reparents the existing #drive button and #hint** from `installDriveUi()`; never create duplicates of either. The old driveUi retains the Golf event listeners, drive panel and touch pedals. On drive, scenery presets are hidden while Golf, pause and day buttons stay accessible.
- The frame loop must freeze driving, traffic and drifting when paused; when running, update Golf with unscaled `dt`, traffic/drift with `dt * speedScale`. Always update camera/OrbitControls and render even on pause.
- UI stats use `staticCount - Number(drive.state.active) + traffic.parkedVisitorCount`, along with the current spectator/drifter arrays. Refresh from state after Golf enters/exits and visitors park.
- After local approval, plan a **separate Vite browser regression suite** in addition to `baseline:verify`, which exclusively checks the untouched legacy file. No visual improvements/geographic adjustments until the modular migration is accepted.
- Review branch: `review/stage4-full-hud`, awaiting local unit tests, Vite build, and manual functional/visual validation before merging into master.


## Stage 5.1 — new Vite visual regression, not legacy screenshots
- The modular application has its own deterministic Playwright+Edge+SwiftShader screenshots in `tools/vite-baseline.mjs`, completely independent of `tools/baseline.mjs` and `baseline/screenshots/` (legacy).
- `vite:shots` generates **unapproved** candidate PNGs and report under `vite-baseline/_current/` (gitignored); visually inspect first. `vite:approve` explicitly creates approved PNGs in `vite-baseline/screenshots/` and `vite-baseline/reference.json`. `vite:verify` compares new screenshots against approved references. Never auto-approve or auto-overwrite reference images.
- Scenarios include the six view presets, day/night, smoke toggle, Golf two camera views, photo panel and desktop/mobile layout. All captures use controlled 1/60-second requestAnimationFrame and a private Vite server on a free localhost port.
- User approved the 15 candidates on 2026-10-13. `vite:approve` created references and `vite:verify` passed all 12 checks and 15 pixel comparisons at 0.000% difference.
- Stage 5.2 performance measurement and stage 5.3 comprehensive Vite browser functional coverage remain separate after this baseline is accepted.

## Stage 5.1 local review — 2026-10-13
- Actual checkout on arrival was clean `master` at `88b8b29`, also the tip of `review/stage5-vite-visual-baseline`; older pending-merge notes above are historical, not current branch evidence. Continued on the review branch without changing master.
- Local checks passed: 51 core tests, production build, legacy 27 checks / 23 images at 0.000% difference, Vite 12 checks / 15 candidate images, no browser errors (Edge 155.0.4283.45, Windows, SwiftShader).
- The deterministic Vite runner must advance one RAF after `#driveExit` before accessing photo sources: fullHud observes drive state in the frame loop. Added a check that exit restores scene controls and photo sources; application code was not changed.
- Candidate gallery: `vite-baseline/_current/review.html`; JSON report and PNGs in the same ignored directory. Mobile Golf HUD partially covers the car; retain current layout pending user review.
- Regenerate the gallery with `node tools/vite-review.mjs` (UTF-8 source/output). Do not pipe Cyrillic JavaScript through Windows PowerShell's default native-process encoding: it replaced the original gallery text with question marks. The repaired gallery was checked in Edge, including all 15 image URLs.
- Visual approval received on 2026-10-13; references created and verified. User authorized commit/push of the review branch followed by stage 5.2. Fetch revealed existing `origin/review/stage5-performance` at `5d6300f` with `tools/perf-compare.mjs`; inspect/reuse it, preserving the accepted 5.1 work and master.

## Stage 5.2 measurements — 2026-10-13
- Stage 5.1 was pushed as `a0a8215` to `review/stage5-vite-visual-baseline`. Work continued on existing `review/stage5-performance`, merging accepted 5.1 via `e61f3ad`. Master remains unchanged.
- `npm run perf:compare` builds production assets and compares them to legacy using actual Edge/SwiftShader. Both simulations first advance to t=3s and pause; measurements then use native clocks/RAF, not synthetic timing.
- Three alternating repetitions, six camera presets, 10 warmup + 30 measured frames per view/run: 1,080 measured frames. Draw calls and submitted triangles match exactly for all views; counts include shadows.
- Vite callback median was 0.35–1.40ms higher in this experiment. Treat as a profiling lead, not a proven root cause. No optimization or application changes were made.
- This establishes the static software-rendering comparison only; it does not measure gaming GPU FPS, active driving/simulation, load time or memory growth. Stage 5.3 functional coverage remains separate.
- Preserved results: `performance/reports/2026-10-13-swiftshader/RESULTS.md`, `report.md`, `report.json` (raw frames, environment and source hashes). Method: `performance/README.md`. Build and all 51 core tests passed.
