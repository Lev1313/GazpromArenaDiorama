# Legacy vs Vite — headless WebGL comparison

Browser: msedge 155.0.4283.45
Viewport: 1400 × 850; DPR=1; software WebGL (SwiftShader).
Production Vite build vs untouched legacy; simulation paused at t=3s.
Three sequential repetitions, alternating version order; 10 warmup + 30 measured frames per view/run.
Draw calls/triangles include shadow passes; triangles are submitted primitives, not unique scene geometry.

**Caution:** Headless rAF frequency and JS callback timing are not
real gaming FPS or GPU frame latency. Do not infer user-visible
performance from headless Hz alone. Compare per-view draw calls
and triangles primarily; visuals must also be independently checked.

| Scene | Legacy calls | Vite calls | Δ calls | Legacy triangles | Vite triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| overview | 1919 | 1919 | 0 | 159292 | 159292 |
| meet | 1656 | 1656 | 0 | 154278 | 154278 |
| arena | 1022 | 1022 | 0 | 137128 | 137128 |
| zsd | 1891 | 1891 | 0 | 158732 | 158732 |
| top | 1864 | 1864 | 0 | 158184 | 158184 |
| drift | 1335 | 1335 | 0 | 143264 | 143264 |

| Scene | Legacy callback median / p95 ms | Vite callback median / p95 ms | Legacy rAF median ms | Vite rAF median ms |
| --- | ---: | ---: | ---: | ---: |
| overview | 8 / 10.1 | 9.4 / 12.8 | 200 | 200.2 |
| meet | 7.05 / 9.6 | 8.1 / 10.6 | 516.7 | 538.8 |
| arena | 5.2 / 6.7 | 5.9 / 8.2 | 366.6 | 366.9 |
| zsd | 8 / 9.8 | 8.7 / 11 | 355.5 | 355.5 |
| top | 8 / 11.1 | 8.65 / 10.9 | 294.5 | 299.9 |
| drift | 6.3 / 9 | 6.65 / 8.8 | 466.7 | 466.7 |

Detailed frame timing estimates and environment metadata
are in report.json. Do not change the approved screenshot references
to accommodate a benchmark difference.
