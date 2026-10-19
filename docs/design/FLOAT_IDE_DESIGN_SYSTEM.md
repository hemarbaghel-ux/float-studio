# FLOAT IDE design system

This is an original, Cursor-inspired design layer for FLOAT. It reproduces broad, visible conventions used by modern coding environments—compact panels, neutral surfaces, restrained borders, clear hierarchy, keyboard focus states and a dark-first palette—without copying Cursor's proprietary application source.

## Files

- `src/styles/float-ide-design.css`: CSS variables and opt-in utility classes.
- `src/features/shell/IDEWorkspace.tsx`: workspace root opts into the design layer.
- `src/main.tsx`: loads the stylesheet.

## Tokens

| Token group | Purpose |
| --- | --- |
| `--float-ide-canvas`, `--float-ide-surface*` | Canvas and panel surfaces |
| `--float-ide-border*` | Low-contrast panel and divider borders |
| `--float-ide-text*` | Primary, muted and subtle text |
| `--float-ide-space-*` | 4px spacing scale |
| `--float-ide-radius-*` | Small, consistent corner radii |
| `--float-ide-motion-*` | Fast, restrained interaction transitions |

The stylesheet supports `html.dark` and `html.light`. Existing Tailwind styles and business logic remain in place. The new panel utility classes are opt-in, so they can be applied gradually after visual review.

## Usage

Use `float-ide-panel` for panel surfaces, `float-ide-panel-raised` for elevated surfaces, `float-ide-muted` and `float-ide-subtle` for secondary text, and `float-ide-scrollbar` for thin scrollbars.

## Scope and validation

This is a foundation, not a complete recreation of Cursor's desktop application. It does not add missing IDE functionality or replace FLOAT's existing components. Run the project's normal typecheck, tests and production build before merging.
