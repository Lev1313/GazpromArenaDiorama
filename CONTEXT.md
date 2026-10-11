
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
