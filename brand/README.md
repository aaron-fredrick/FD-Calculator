# FD Cal brand system

This directory is the canonical source for shared visual identity tokens used by the web application and documentation site.

## Source of truth

- `tokens.css` — canonical colors, semantic roles, font stacks, and shared design primitives.
- `report-tokens.js` — generated copy of the canonical `:root` block embedded into standalone HTML reports. Do not edit it by hand; regenerate with `npm run build:report-tokens` and verify with `npm run check:report-tokens`.
- `src/web/styles.css` — web-app component/layout styling. It should consume brand tokens rather than redefine brand values.
- `docs/.vitepress/theme/custom.css` — VitePress theme mapping. It imports the same token file and maps VitePress variables to FD Cal tokens.

Do not introduce a second palette or independently select brand typography in either surface. Add or change a token here, then consume it from the relevant component stylesheet.

## Color palette

| Token | Value | Role |
|---|---|---|
| `--fd-color-bg` | `#0b0e13` | Main page background |
| `--fd-color-bg-raised` | `#10151d` | Raised/deep surface |
| `--fd-color-panel` | `#131923` | Primary panel |
| `--fd-color-panel-raised` | `#192230` | Secondary panel / hover surface |
| `--fd-color-panel-inset` | `#0e141d` | Inputs and inset controls |
| `--fd-color-border` | `#293445` | Standard borders and dividers |
| `--fd-color-border-strong` | `#344256` | Emphasised borders |
| `--fd-color-text` | `#e8edf5` | Primary text |
| `--fd-color-text-muted` | `#9ba8b8` | Secondary text |
| `--fd-color-text-subtle` | `#738195` | Low-emphasis text |
| `--fd-color-text-soft` | `#c4d0df` | Soft/high-contrast secondary text |
| `--fd-color-accent` | `#56b4e9` | Brand blue, links, focus and active states |
| `--fd-color-accent-hover` | `#326b93` | Accent hover state |
| `--fd-color-accent-surface` | `#172433` | Accent-tinted surfaces |
| `--fd-color-positive` | `#55c99a` | Success and positive results |
| `--fd-color-danger` | `#ef7777` | Errors and destructive states |
| `--fd-color-warning` | `#e9ad58` | Warnings |
| `--fd-color-strategy` | `#bd93f9` | Strategy-specific emphasis |

## Typography

- Sans-serif: `--fd-font-sans` — Inter first, then platform system UI fallbacks.
- Monospace: `--fd-font-mono` — SF Mono / Consolas / Liberation Mono fallbacks.
- Keep body copy readable and preserve the web app's responsive type scale.
- Do not add a remote font dependency without an explicit performance and licensing review.

## Usage rules

1. Use semantic tokens (for example, positive/danger/accent) rather than raw hex values for brand-level styling.
2. Component-specific shades may remain local only when they are genuinely structural details; shared surface, text, border, and status colors belong here.
3. Preserve the dark appearance across the app and documentation.
4. Maintain accessible contrast and visible keyboard focus states.
5. When changing a token, regenerate the report token module, then check `/web/`, `/docs/` and a newly generated standalone report at desktop and mobile widths. The report embeds the token block; it never fetches `tokens.css` when opened.
