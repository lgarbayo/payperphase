# Gantt browser proof (WP-05)

Real-Chromium screenshots of `/gantt-lab` at 1440×900, Bryntum Gantt trial 7.3.8. They were taken on 2026-11-11, before the dark theme (#27, #28), so they show the earlier light theme rather than the current `svalbard-dark` one.

| File | Shows |
| --- | --- |
| 01-golden | lagged dependency arrows, hatched healing windows, status-coloured diamonds, simulated-today line, clinical-deadline flags |
| 02-delay-baseline-ghost | baseline ghost after a what-if, translucent ghost-shift bars |
| 03-paid-today | paid phase (green diamond + check) |
| 04-late-deadline | 6-month deadline line + red exceeded healing window |
| 05-en | EN locale |
| 06 / 07 | illegal drag: tooltip with the approved clinician note, then snap-back with the message |
| 08 / 09 | legal drag follow, then cascade of successors after drop |

Reproduce: `npx next dev -p <free port>`, then `CHROME=<chrome-headless-shell> node shots.mjs <port> <outdir>` and `node drag.mjs <port> <outdir>`.
