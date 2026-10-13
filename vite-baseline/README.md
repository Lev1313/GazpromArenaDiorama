# Vite visual regression baseline

This suite protects the **new modular Vite application**. It is separate from the
untouched original HTML regression suite at `tools/baseline.mjs` and
`baseline/screenshots/`.

## Workflow (Windows PowerShell)

1. `npm.cmd run vite:shots` — run Chromium via installed Microsoft Edge, boot
   an independent temporary Vite server on a free loopback port, and save 15
   deterministic PNG candidates plus `report.json` to
   `vite-baseline/_current/`.
2. **Open and inspect the PNG files yourself.** Pay attention to stadium/ZSD,
   the parking meet, night/day, shadows, GUI overlays and Golf cameras.
   The script captures 13 desktop and 2 mobile scenarios.
3. Only after the candidates are visually approved:
   `npm.cmd run vite:approve`. This copies the PNG files to
   `vite-baseline/screenshots/` and writes `vite-baseline/reference.json`.
   Existing references are protected against accidental overwrite. For an
   intentional later reference revision, after documenting/approving the
   visual change, use `npm.cmd run vite:approve -- --replace`.
4. Run `npm.cmd run vite:verify` to regenerate images and pixel-compare them.
   This is expected to fail before references have been approved.
5. Once verification passes, commit the **approved references**:
   `git add vite-baseline/screenshots vite-baseline/reference.json`.
   `vite-baseline/_current/` remains gitignored. No baseline files are
   automatically committed or pushed by the harness.

Visual comparison uses `pixelmatch` and requires at most 0.1% differing
pixels per image with pixelmatch's per-pixel threshold 0.1. It is designed
for repeat runs on the **same Windows machine**, installed Edge version,
graphics settings and font environment. Rendering can change across
hardware/browser/driver versions; investigate differences instead of blindly
approving replacement references.

## Scope

Images: overview night; meet; arena; ZSD; top; drift; camera reset;
day overview and day arena; smoke disabled; Golf chase and overhead cameras;
open photo sources; mobile overview and mobile Golf.

The runner manually advances a 60 fps clock via overridden
`requestAnimationFrame` and `performance.now`, and uses SwiftShader.
It does not capture real-time FPS (that belongs to stage 5.2), and does not
yet replace the future comprehensive Vite functional tests (stage 5.3).

## If anything fails

- Ensure MS Edge is installed, as for the legacy baseline runner.
- Read `vite-baseline/_current/report.json` and terminal diagnostics.
- If `vite:shots` reports failures, do **not** approve its reference.
- Check `npm.cmd run build`, `npm.cmd run test:core` and
  `npm.cmd run baseline:verify` separately.
- Do not delete or update the original `baseline/screenshots/` to make the
  new Vite snapshots pass.
