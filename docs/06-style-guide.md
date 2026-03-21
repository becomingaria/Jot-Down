# Jot-Down Style Guide

Notion-inspired, minimal, calm. The UI should stay out of the way and let the content breathe.

---

## Brand Color

| Usage                | Light                  | Dark                   |
| -------------------- | ---------------------- | ---------------------- |
| Primary accent       | `#E5484D`              | `#FF5A5F`              |
| Accent hover         | `#CC3237`              | `#E54549`              |
| Accent dim (bg tint) | `rgba(229,72,77,0.15)` | `rgba(255,90,95,0.18)` |
| Accent focus (ring)  | `rgba(229,72,77,0.13)` | `rgba(255,90,95,0.15)` |

Use the accent for:

- Primary action buttons (`contained`)
- Focused input rings
- Active/selected list items
- Checkbox and caret color
- Inline code mark highlight glow
- CSV "add row" hover, type menu active state

**Do not** use the accent for borders, headings, or decorative elements.

---

## Full Token Reference

All tokens are CSS custom properties declared in `:root` inside [`src/index.css`](../src/index.css). Dark mode overrides live in `@media (prefers-color-scheme: dark)`. The same values are mirrored in the `T = { light, dark }` object inside [`src/App.jsx`](../src/App.jsx) for MUI theming — **update both together**.

### Backgrounds

| Token             | Light     | Dark      | Usage                              |
| ----------------- | --------- | --------- | ---------------------------------- |
| `--clr-bg`        | `#FFFFFF` | `#191919` | Page background                    |
| `--clr-surface`   | `#F7F7F8` | `#242424` | Cards, inputs, drawer              |
| `--clr-surface-2` | `#EEEEEF` | `#2D2D2D` | Secondary panels, hover on surface |

### Borders

| Token              | Light              | Dark                     | Usage                            |
| ------------------ | ------------------ | ------------------------ | -------------------------------- |
| `--clr-border`     | `#E5E5E7`          | `#333333`                | All outlines, dividers           |
| `--clr-border-dim` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.07)` | Subtle inner borders (CSV cells) |

### Text

| Token              | Light                 | Dark                     | Usage                                 |
| ------------------ | --------------------- | ------------------------ | ------------------------------------- |
| `--clr-text`       | `#111111`             | `#F5F5F5`                | Primary content                       |
| `--clr-text-2`     | `#6B6B6B`             | `#A1A1A1`                | Secondary / metadata                  |
| `--clr-text-dim`   | `rgba(17,17,17,0.38)` | `rgba(245,245,245,0.40)` | Placeholders                          |
| `--clr-text-muted` | `rgba(17,17,17,0.18)` | `rgba(245,245,245,0.20)` | Ghost state (delete btn before hover) |

### Interactions

| Token             | Light                  | Dark                     | Usage                         |
| ----------------- | ---------------------- | ------------------------ | ----------------------------- |
| `--clr-hover`     | `rgba(0,0,0,0.03)`     | `rgba(255,255,255,0.04)` | Row/block hover               |
| `--clr-hover-2`   | `rgba(0,0,0,0.06)`     | `rgba(255,255,255,0.07)` | Button hover, menu item hover |
| `--clr-selection` | `rgba(229,72,77,0.20)` | `rgba(255,90,95,0.25)`   | Text selection highlight      |

### Block Editor Specific

| Token              | Light     | Dark      | Usage                              |
| ------------------ | --------- | --------- | ---------------------------------- |
| `--clr-code-bg`    | `#F3F3F4` | `#2A2A2A` | Code block background, inline code |
| `--clr-callout-bg` | `#FFF8E1` | `#2A2519` | Callout block background           |
| `--clr-mark-bg`    | `#FFF3B0` | `#3A360A` | `<mark>` highlight in editor       |

---

## Typography

**Font family:** Inter (loaded via Google Fonts in `index.html`) → system-ui stack fallback.

| Role    | Size             | Weight | Notes                           |
| ------- | ---------------- | ------ | ------------------------------- |
| h1      | 2rem             | 600    | Page/wiki title                 |
| h2      | 1.5rem           | 600    | Section heading                 |
| h3      | 1.25rem          | 500    | Sub-section                     |
| body1   | 0.9375rem (15px) | 400    | Default text                    |
| body2   | 0.875rem (14px)  | 400    | Secondary text                  |
| caption | 0.8125rem (13px) | 400    | Meta, timestamps                |
| button  | 0.875rem         | 500    | No uppercase, no letter-spacing |

---

## Spacing (8px grid)

| Step | Value | Usage                               |
| ---- | ----- | ----------------------------------- |
| 1    | 4px   | Tight padding (icon buttons, tags)  |
| 2    | 8px   | Default control padding, small gaps |
| 3    | 12px  | Mid gap, card content               |
| 4    | 16px  | Standard content padding            |
| 6    | 24px  | Section spacing                     |
| 8    | 32px  | Large section gap                   |
| 12   | 48px  | Page-level whitespace               |

---

## Border Radius

| Name    | Value | Usage                          |
| ------- | ----- | ------------------------------ |
| sm      | 4–6px | Tags, small chips, inner items |
| default | 8px   | Buttons, inputs, panels        |
| card    | 10px  | Cards, wiki tiles              |
| dialog  | 12px  | Modals, dialogs                |

---

## Motion

| Name        | Value            | Usage                                     |
| ----------- | ---------------- | ----------------------------------------- |
| interaction | `150ms ease`     | Hover color, border transitions           |
| shadow      | `200ms ease`     | Box-shadow fade on cards                  |
| menu        | `120ms ease-out` | Slash menu / type menu slide-in           |
| hide delay  | `+120ms`         | Block plus-button hide (prevents flicker) |

---

## Component Conventions

### Buttons

- **Contained primary** — accent fill, white text. Use for the single main CTA per view.
- **Outlined** — gray border (`--clr-border`), gray text. Use for secondary actions.
- **Text** — no border, muted text. Use for tertiary / destructive confirm actions.
- All buttons: `border-radius: 7px`, `disableElevation`, `font-weight: 500`, `textTransform: none`.

### Inputs

- Background: `--clr-surface`
- Border: `--clr-border` → `--clr-text-2` on hover → `--clr-accent` on focus
- Focus ring: `box-shadow: 0 0 0 3px var(--clr-accent-focus)`

### Cards

- Variant: `outlined` (no shadow by default)
- Border: `--clr-border` → `--clr-text-2` on hover, gains subtle shadow

### AppBar

- White (or `--clr-surface` in dark mode), `border-bottom: 1px solid --clr-border`, no shadow.

### Menus & Dropdowns

- Background: `--clr-bg`, border: `1px solid --clr-border`, `border-radius: 8px`
- Shadow: light `0 4px 24px rgba(0,0,0,0.10)` — not heavy

### Tooltips

- Dark pill: `#1a1a1a` light / `#3a3a3a` dark, `border-radius: 5px`, `font-size: 0.75rem`

---

## Dark Mode

Dark mode follows the system preference via `@media (prefers-color-scheme: dark)` in CSS and `useMediaQuery("(prefers-color-scheme: dark)")` in React. No manual toggle is exposed — the app respects the OS setting.

---

## File Map

| File                                                                      | Purpose                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`src/index.css`](../src/index.css)                                       | CSS custom properties (`:root`), dark overrides, global reset, markdown preview styles |
| [`src/App.jsx`](../src/App.jsx)                                           | MUI theme — mirrors all tokens in `T = { light, dark }`, `buildTheme()`                |
| [`src/components/editor/blocks.css`](../src/components/editor/blocks.css) | Block editor styles — uses `var(--clr-*)` throughout                                   |
| [`index.html`](../index.html)                                             | Inter font preconnect + load                                                           |
