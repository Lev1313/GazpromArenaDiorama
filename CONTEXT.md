
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
