# EduIDE customization

Experience levels and per-element customization.

A level is a **preset over the element catalogue, not a cage**: every element can
be switched on or off individually at every level, expert included. `expert` is
not a configuration — it is EduIDE with nothing applied, so it doubles as the
control condition for the evaluation.

The concept this implements lives in Outline, *IDE Customization* (v2).

## Layout

| File | What it is |
|---|---|
| `src/common/customization.ts` | The element catalogue. This table is the specification; the levels are presets over it |
| `src/browser/customization-service.ts` | Resolves the level and overrides, and applies them to the running frontend |
| `src/browser/customization-contribution.ts` | The menu: status-bar indicator, level quick pick, commands, Help entry |
| `src/browser/customize-widget.tsx` | The Customize panel, rendered straight from the catalogue |
| `src/browser/startup-file-contribution.ts` | Opens the exercise file on start while `startup.openFile` is on |
| `src/browser/customization-preferences.ts` | `eduide.level` and `eduide.overrides` |

## Opening the menu

Three routes, all landing on the same state:

- the `🎓 <level>` indicator in the status bar, clicked;
- `EduIDE: Experience Level` or `EduIDE: Customize…` in the command palette;
- `Help ▸ Experience Level…`.

The quick pick's last row opens the Customize panel, so the discoverable entry
point is not a dead end for anyone who wants more than a level.

## How it applies

`ContributionFilter` is evaluated once, when the DI container is assembled, so
it cannot carry a level the student flips at runtime. It stays in the product
extension for the things EduIDE never wants at any level. Everything here uses
runtime APIs instead:

| Change | Mechanism |
|---|---|
| Settings | `PreferenceService.set(key, value, PreferenceScope.User)` |
| Views | `WidgetManager.onWillCreateWidget` rejection, plus `ApplicationShell.closeWidget` for anything already open |
| Toolbar buttons | `elementId` on `AbstractSplitButtonContribution`, gating `isVisible` |
| Level for `when` clauses | the `eduide.level` context key |

`SidePanelHandler` has no `removeTab` in Theia 1.74.1, so views are hidden by
blocking and closing their widgets rather than by removing tabs.

**Installed VS Code extensions are never toggled per level.** They cannot be
without restarting the frontend, so every extension ships at every level and the
levels differ only in how those extensions are configured.

## What is not enforced yet

The catalogue is complete, because it is the specification. Elements the runtime
does not enforce yet carry a `pending` reason and render disabled in the
Customize panel, so the panel stays a truthful picture rather than promising
switches that do nothing:

- menu trimming (`menu.*`)
- the task allow-list (`task.*`)
- the Advanced refactoring toolbar (`toolbar.rename` and friends)
- the Iris "Explain this error" action (`assist.*`)
- `view.memoryInspector` — `@theia/memory-inspector` is not a dependency of the
  browser app yet
- `view.terminal` — needs the terminal commands and menu gated, not just a
  widget hidden
- `startup.walkthrough` — `contributes.walkthroughs` needs Theia 1.75
