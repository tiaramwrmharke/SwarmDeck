# swarmdeck — brand marks & colors

8-bit pixel mosaic of a woven knot (piki + **loom** = weaving). Cyan brand color, with a
deep-cyan variant for light backgrounds.

## Assets (`docs/`)

| File | What | Size |
|------|------|------|
| `logo.png` | icon — the knot | 502×512 |
| `logo-wordmark.png` | knot + `swarmdeck` | 1000×229 |
| `logo-word.png` | `swarmdeck` word only | 792×187 |

Transparent background, brand cyan `#45e0f5` (mosaic grid edge `#144349`).

## Color by background

| Background | fill | edge |
|-----------|------|------|
| dark | `#45e0f5` (cyan) | `#144349` |
| light / white | `#0e7490` (deep cyan) | `#06333c` |

## Where used

- **Dashboard header** (`dashboard/src/components/Sidebar.tsx`) → wordmark, swapped by
  theme: cyan PNG on dark, deep-cyan `logo-wordmark-light.png` on light.
- **Web landing nav** (`web/src/sections/Nav.tsx`) → cyan wordmark PNG (page is always dark).
- **Browser tab / favicon** (`dashboard/public/logo.png`, `web/public/logo.png`) → the knot
