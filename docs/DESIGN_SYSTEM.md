# FoconFlow Design System

## Overview

FoconFlow uses a semantic design token architecture that separates **brand
identity** (Fócon teal/green) from **structural surfaces** (backgrounds, cards,
borders) and **semantic status colors** (success, warning, danger, info).

The system is built on CSS custom properties defined in `src/index.css`, with
utility classes that components consume via Tailwind v4. Both light and dark
themes share the same utility classes — the CSS variables resolve to different
values per theme.

## Theme Architecture

- **ThemeProvider** manages the `.dark` class on `<html>`.
- **Tailwind v4 custom variant**: `@custom-variant dark (&:where(.dark, .dark *))`
  — dark mode is class-driven, not OS-driven.
- **No-flash bootstrap**: `index.html` applies the stored theme synchronously
  before first paint.
- **ThemeToggle** component lets users switch between light and dark.

## Fócon Brand Palette

Defined in `@theme` block in `src/index.css`:

| Token | Hex | Usage |
|-------|-----|-------|
| `focon-50` | `#eff9f9` | Light tint backgrounds |
| `focon-100` | `#d9f0f0` | Light tint backgrounds |
| `focon-200` | `#b6dede` | Light borders/accents |
| `focon-300` | `#80c2c3` | Light accents |
| `focon-400` | `#38a2a4` | Primary hover (dark) |
| `focon-500` | `#14898b` | Primary (dark) |
| `focon-600` | `#007678` | Primary (light) / sidebar active |
| `focon-700` | `#005f61` | Pressed states |
| `focon-800` | `#064d50` | Sidebar hover / scrollbar |
| `focon-900` | `#073f42` | Dark surfaces (auth pages) |
| `focon-950` | `#022a2c` | Sidebar background / darkest |

## Semantic Design Tokens

### Light Mode (`:root`)

| Token | Value | Description |
|-------|-------|-------------|
| `--app-canvas` | `#f8fafc` | Page background |
| `--surface-primary` | `#ffffff` | Cards, modals |
| `--surface-secondary` | `#f8fafc` | Secondary surfaces |
| `--surface-elevated` | `#ffffff` | Raised surfaces |
| `--text-primary` | `#0f172a` | Primary text |
| `--text-secondary` | `#475569` | Secondary text |
| `--text-muted` | `#64748b` | Muted text |
| `--border-primary` | `#e2e8f0` | Default borders |
| `--border-strong` | `#cbd5e1` | Strong borders |
| `--input-background` | `#ffffff` | Input fields |
| `--input-border` | `#cbd5e1` | Input borders |
| `--hover-surface` | `#f8fafc` | Hover backgrounds |
| `--primary` | `#007678` | Brand primary (focon-600) |
| `--primary-hover` | `#14898b` | Brand hover (focon-500) |
| `--primary-soft` | `rgba(0,118,120,0.10)` | Soft primary tint |
| `--modal-bg` | `#ffffff` | Modal background |
| `--popover-bg` | `#ffffff` | Popover background |

### Dark Mode — Fócon Identity (`.dark`)

The dark palette is derived from the Fócon green-teal brand, not generic navy.

| Token | Value | Description |
|-------|-------|-------------|
| `--app-canvas` | `#06100f` | Near-black green background |
| `--surface-primary` | `#0b1917` | Petrol green cards |
| `--surface-secondary` | `#10211f` | Slightly lighter petrol |
| `--surface-elevated` | `#142826` | Raised petrol surface |
| `--text-primary` | `#f5f7f7` | Warm white text |
| `--text-secondary` | `#c4d4d2` | Light green-gray |
| `--text-muted` | `#9fb5b2` | Muted green-gray |
| `--border-primary` | `#1e3a36` | Dark green-neutral border |
| `--border-strong` | `#285048` | Stronger green border |
| `--input-background` | `#0b1917` | Input surface |
| `--input-border` | `#285048` | Input border |
| `--hover-surface` | `#142826` | Hover background |
| `--primary` | `#14898b` | Brand primary (focon-500, brighter for dark) |
| `--primary-hover` | `#38a2a4` | Brand hover (focon-400) |
| `--primary-soft` | `rgba(20,137,139,0.15)` | Soft primary tint |
| `--modal-bg` | `#10211f` | Modal background |
| `--popover-bg` | `#10211f` | Popover background |

## Semantic Utility Classes

| Class | Property | Token |
|-------|----------|-------|
| `bg-app-canvas` | background | `--app-canvas` |
| `bg-surface-primary` | background | `--surface-primary` |
| `bg-surface-secondary` | background | `--surface-secondary` |
| `bg-surface-elevated` | background | `--surface-elevated` |
| `bg-hover-surface` | background (hover) | `--hover-surface` |
| `bg-input` | background | `--input-background` |
| `bg-modal` | background | `--modal-bg` |
| `bg-popover` | background | `--popover-bg` |
| `bg-primary-soft` | background | `--primary-soft` |
| `text-app-primary` | color | `--text-primary` |
| `text-app-secondary` | color | `--text-secondary` |
| `text-app-muted` | color | `--text-muted` |
| `text-primary-brand` | color | `--primary` |
| `border-app-primary` | border-color | `--border-primary` |
| `border-app-strong` | border-color | `--border-strong` |
| `border-primary-brand` | border-color | `--primary` |
| `divide-table-divider` | border-color (divide) | `--table-divider` |
| `focus-ring` | outline + box-shadow | `--primary` |

## Semantic Status Colors

Status colors are **not** replaced by brand green. They remain semantically
correct in both themes:

| Status | Light | Dark |
|--------|-------|------|
| Success/Approved | `bg-green-100 text-green-800` | `dark:bg-green-900/30 dark:text-green-400` |
| Pending/Warning | `bg-yellow-100 text-yellow-800` | `dark:bg-yellow-900/30 dark:text-yellow-400` |
| Rejected/Error | `bg-red-100 text-red-800` | `dark:bg-red-900/30 dark:text-red-400` |
| Info/Planned | `bg-blue-100 text-blue-800` | `dark:bg-blue-900/30 dark:text-blue-400` |

## Chart Colors

Centralized in `src/lib/chartTheme.ts`:

- **Primary series**: Fócon teal (`#14898b`)
- **Categorical palette**: teal → emerald → amber → red → violet → pink → cyan → orange
- **Axis/grid/tooltip**: theme-aware via `getChartTheme(isDark)`
- **Budget vs Actual**: blue (planned) vs amber (actual)

## Scrollbars

- `.sidebar-scrollbar` — always-dark, uses focon-800/600 thumb (sidebar is focon-950 in both themes)
- `.app-scrollbar` — theme-aware, uses `--app-scrollbar-thumb` token

## Print / PDF

`@media print` preserves white background and dark text regardless of theme.
Sidebar, header, nav, and buttons are hidden. Tables span multiple pages.

## PWA

- `theme_color`: `#007678` (focon-600)
- `background_color`: `#06100f` (Fócon dark canvas)
- Meta `theme-color` in `index.html`: `#007678`

## Focus Accessibility

All interactive controls should use perceptible focus indicators. The
`.focus-ring` utility provides a Fócon teal ring via `box-shadow`. Components
can also use `focus:ring-focon-600` for Tailwind's built-in ring utility.

## Reduced Motion

`prefers-reduced-motion` is respected for animations. This is independent of
theme — it only affects motion accessibility.
