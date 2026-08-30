# helio — brand marks & colors

The mark is a sun: a filled disc with an orbit ring, cut at 45 degrees. Helio is the
assistant layer on helius.dev, so the mark leans warm against the otherwise cold
infrastructure palette.

Assets are placeholders until the set is redrawn — the geometry and file names are fixed,
the pixels are not.

## Assets (`docs/`)

| File | What | Size |
|------|------|------|
| `logo.png` | icon — the disc | 512×512 |
| `logo-wordmark.png` | disc + `helio` | 1000×229 |
| `logo-word.png` | `helio` word only | 792×187 |

Transparent background. Single accent hue, no gradients, no shadow.

## Color by background

| Background | fill | ring |
|-----------|------|------|
| dark | `#f5b544` | `#7a5218` |
| light / white | `#a16207` | `#4a2f06` |

## Where used

- **Dashboard header** (`dashboard/src/components/Sidebar.tsx`) → wordmark, swapped by theme.
- **Web landing nav** (`web/src/sections/Nav.tsx`) → wordmark, dark page only.
- **Favicon** (`dashboard/public/logo.png`, `web/public/logo.png`) → disc, deep variant.
- **Social card** (`web/public/og.png`).

## Rules

- The word is always lowercase `helio`, never `Helio` in the mark, always `Helio` in prose.
- Minimum clear space is the height of the disc on all sides.
- Never place the mark on a photograph without a scrim.
- Never recolor the disc outside the two pairs above.
