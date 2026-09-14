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
- `View ▸ Experience Level…`, at the top of the menu.

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
| Menu bar | top-level nodes moved out of and back into the `menubar` compound node |
| Terminals | `kind === 'user'` widgets closed and blocked; task terminals untouched |
| Status bar entries | `StatusBar.removeElement`, re-applied on every editor change |
| Advanced toolbar | `RefactorToolbarContribution` in the product extension, gated per element |
| Run configurations | `TaskToolbarContribution.fetchConfigurations` filtered by `isTaskAllowed` (see below) |
| Level for `when` clauses | the `eduide.level` context key |

`MenuModelRegistry` fires its change event when a registration is **disposed**,
not when one is added, and the browser menu bar rebuilds on that event. Moving
nodes around therefore fires nothing, so the bar is redrawn by registering a
throwaway action and disposing it — see `refreshMenuBar`. The throwaway group
sits inside Help so nothing is left behind at the top level.

Theia labels `menubar/6_debug` "Run" and it holds nothing but debug entries, so
that menu travels with the debugger rather than with the Run split button. At
Beginner the menu bar is therefore **File · Edit · Help**; the concept's mockup
shows a Run menu there, and the mockup is the thing that is wrong.

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

- the Iris "Explain this error" action (`assist.*`) — needs the Artemis
  extension's own API, which is not available to build against here
- `diag.checkstyleLive` — needs a Checkstyle ruleset in the image, which is an
  image change rather than IDE code
- `diag.sonar` — held until the per-session memory budget is measured
- `startup.walkthrough` — `contributes.walkthroughs` needs Theia 1.75

## What an exercise can ask for

An exercise may ship `.vscode/eduide.json`, next to its `launch.json` and
`tasks.json`:

```jsonc
{
    "level": "beginner",
    "overrides": { "view.scm": true }
}
```

It **seeds, it does not enforce**. The values apply only to a student who has
no level of their own; the moment they pick one, the file stops having an
opinion and stays quiet on every later start. Nothing here disables the quick
pick, and nothing here is a boundary — the file lives in the student's own
clone, where they can edit it, and it travels back to Artemis on submit.

Comments and trailing commas are fine, since instructors write this by hand. A
malformed file, an unknown level or an unknown element id is logged and
skipped: a course cannot break a student's session with a typo. The templates
ship an entirely commented-out copy, which parses to nothing and exists to show
the shape.

Two limits worth knowing before relying on it:

- **It seeds per session, not per student.** A student's preferences live in
  the container, so unless a persistent home is mounted, every new session
  starts with no level of their own and the file applies again. Whether that
  is right depends on whether a level is meant to follow the student or the
  exercise — the question is open.
- **It is one of three authorities**, with the student's own choice and the
  launch environment. Only this one is built; the precedence between them is
  still to be designed.

## Terminals and status bar entries

`view.terminal` hides terminals a student opened themselves and blocks new
ones, **leaving the terminals tasks create alone** — a beginner still has to
read what `Run` printed. Terminal widgets carry a `kind`, and only `'user'`
ones are touched. A blocked attempt fails with a sentence naming the way back
rather than a bare error, because the student is about to wonder why nothing
happened.

`status.editorInfo` takes the editor entries off the status bar. They are re-set
whenever the editor changes, so they are removed again on every
`onCurrentEditorChanged`. That costs a frame of flicker, and it is the price of
not rebinding Theia's `StatusBar` — `bindStatusBar` binds `StatusBar` with
`.to(StatusBarImpl)` rather than `toService`, so intercepting it cleanly is not
as simple as it looks.

## Run configurations

The Run button's configurations are **not ours**. `TaskToolbarContribution` reads
`tasks.json` from the workspace, and in the Artemis flow that workspace is the
exercise repository Scorpio clones — so the task set is whatever the instructor
wrote, in whatever language the course uses. It cannot be catalogued task by
task. Three rules decide, in order:

1. `task.showAll` on — everything is offered. Without this switch, tasks would
   be the one thing a student could not get back without changing level.
2. The task declares its own level. `TaskCustomization` has an index signature,
   so a custom property written in `tasks.json` survives to the toolbar:

   ```jsonc
   {
     "label": "Check style",
     "type": "shell",
     "command": "./gradlew checkstyleMain",
     "eduide": { "minLevel": "advanced" }
   }
   ```

   This is authoritative, because whoever wrote the task knows what it is for.
   A `minLevel` that is not a level is ignored, with a warning.
3. Otherwise the task's **group** decides, which every `tasks.json` already has:
   the default build task and test tasks are beginner work, anything else needs
   advanced. A task with no group at all is treated as advanced.

Against the four shipped templates that gives:

| Template | Beginner | Advanced |
|---|---|---|
| java-17 gradle, maven | Run, Test | Run, Build, Test |
| c make, bazel | Run | Run, Build |

which is what the concept asks for, without a single task label hardcoded
anywhere.
