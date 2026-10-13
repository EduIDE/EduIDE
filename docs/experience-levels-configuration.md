# Experience levels: the exercise configuration file

EduIDE has three experience levels — `beginner`, `advanced`, `expert` — that
decide how much of the IDE a student meets. This document covers the one file
an exercise can ship to influence that, how it reaches a student's session from
an Artemis exercise, and where the default lives if you want to move it.

For what each level actually shows, see
[`theia-extensions/customization/README.md`](../theia-extensions/customization/README.md).
The catalogue in
[`src/common/customization.ts`](../theia-extensions/customization/src/common/customization.ts)
is the specification; everything below is about configuring it from outside.

## The file

```
<workspace root>/.vscode/eduide.json
```

Next to the `launch.json` and `tasks.json` the exercise already ships. The path
is `DELIVERED_CONFIG_SEGMENTS` in `src/common/customization.ts`.

```jsonc
{
    // "beginner", "advanced" or "expert"
    "level": "beginner",

    // individual elements on top of that level, by catalogue id
    "overrides": {
        "view.scm": true,
        "view.terminal": false
    }
}
```

Both keys are optional. A file with neither does nothing.

### It seeds, it does not enforce

This is the part worth understanding before relying on it.

The values apply **only to a student who has not chosen a level for
themselves**. The moment a student picks one — from the status-bar indicator,
the `Experience Levels` menu or the command palette — the file stops having any
effect, on that session and every later one.

The test is literal: `seedFromExercise()` writes the delivered value only when
`inspectInScope(key, PreferenceScope.User)` is `undefined`, i.e. the student's
own setting is empty. `level` and `overrides` are seeded independently.

So this file **cannot pin a student to a level**. There is deliberately no
mechanism that can, and this one is the wrong place to add it: the file lives in
the student's own clone, where they can edit or delete it, and it travels back
to Artemis when they submit. Enforcement — exam mode, a course minimum — would
have to come from a channel the student cannot write to, and would have to
explain itself in the UI rather than silently disabling the picker.

### Writing it by hand is expected

Instructors edit this file directly, so the reader is deliberately forgiving:

- **JSONC** — comments and trailing commas are fine.
- **An empty or all-comments file is silently ignored.** It says nothing, which
  is not the same as saying something wrong. The commented example the templates
  ship is exactly this shape.
- **Anything malformed is reported and skipped, never fatal.** Bad JSON, an
  unknown level, an unknown element id, a non-boolean override — each produces
  its own warning in the IDE log and the rest of the file still applies. A
  course cannot break a student's session with a typo.

The reader is
[`src/browser/delivered-config-reader.ts`](../theia-extensions/customization/src/browser/delivered-config-reader.ts).

### Override ids

48 elements, each `true` or `false`. The ids as of EduIDE 1.4.0:

| group | ids |
|---|---|
| views | `view.explorer` `view.search` `view.artemis` `view.problems` `view.scm` `view.testing` `view.gradle` `view.output` `view.debug` `view.debugConsole` `view.outline` `view.memoryInspector` `view.terminal` `view.callHierarchy` `view.typeHierarchy` `view.plugins` |
| toolbar | `toolbar.run` `toolbar.debug` `toolbar.rename` `toolbar.comment` `toolbar.refactor` `toolbar.sourceAction` |
| tasks | `task.showAll` |
| editor | `editor.bracketGuides` `editor.formatOnSave` `editor.organizeImportsOnSave` `editor.lightbulb` `editor.minimap` `editor.breadcrumbs` `editor.stickyScroll` `editor.inlayHints` `editor.referencesCodeLens` `editor.runDebugCodeLens` |
| diagnostics | `diag.errorLensWarnings` `diag.checkstyleLive`¹ `diag.sonar`¹ |
| menus | `menu.selection` `menu.view` `menu.go` `menu.run` `menu.terminal` |
| status bar | `status.level` `status.editorInfo` |
| startup | `startup.welcomePage` `startup.openFile` `startup.walkthrough`¹ |
| assistance | `assist.irisExplain`¹ `assist.irisHint`¹ |

¹ declared but not enforced yet — they render disabled in the Customize panel
with the reason. Setting them has no effect.

`view.memoryInspector` has an extra condition: it is also hidden whenever no
debug session is running, because it can only read memory from a live adapter.
An explicit override still wins.

The authoritative list is `ELEMENT_CATALOGUE`; the Customize panel shows the
same ids next to their labels.

## Getting it there from Artemis

Nothing on the Artemis side needs new code. Exercise templates live at

```
src/main/resources/templates/<language>/<project-type>/exercise/.vscode/
```

which is already where `tasks.json` and `launch.json` are shipped. Adding
`eduide.json` beside them is enough:

- `ResourceLoaderService` globs templates with a bare `**`, and
  `FileUtil.replaceVariablesInFileRecursive` walks every subdirectory except
  `.git`, so dot-directories are copied into the student's repository verbatim.
  `${packageName}`-style substitution works inside them too.
- Scorpio clones that repository directly into `/home/project`, which is the
  workspace root the reader looks under.

So the chain is:

```
Artemis template  →  student's exercise repo  →  Scorpio clone into /home/project
                  →  /home/project/.vscode/eduide.json  →  seeded on session start
```

**Rollout order does not matter.** An EduIDE without the reader sees an unknown
file and ignores it; a reader with no file seeds nothing. The two repositories
do not have to ship in lockstep.

### What this can and cannot express

It is a property of the **exercise template** — identical for every exercise
generated from that language and project type. It is not per-course, not
per-exercise unless someone edits the generated repository, and it does not
follow the student.

A per-student or per-course level needs the launch environment instead:
`EDUIDE_LEVEL` is reserved for that in `src/common/customization.ts` but **is
not read by anything yet**. Artemis knows the student and the course; the
repository only knows the exercise.

### Persistence caveat

"Seeded once" assumes the student's setting outlives the session. User
preferences live in the container, so unless a persistent home is mounted, every
new session starts with no setting and the file seeds again. That is defensible
— the exercise decides, every time — but it is a different product from
"seeded once, then theirs", and which one you get should be a decision rather
than an accident of how the environment is deployed.

## Changing the default level

The default is one constant:

```ts
// theia-extensions/customization/src/common/customization.ts:21
export const DEFAULT_LEVEL: EduIdeLevel = 'expert';
```

Everything else derives from it, so this is the only edit needed:

- `customization-preferences.ts` uses it as the `eduide.level` schema default,
  which is what a student with no setting resolves to.
- `customization-service.ts` falls back to it when the stored value is missing
  or not a valid level.

Changing it affects **every installation and every user who has not chosen a
level**, since nothing presets one today. On an installation with existing
users, that is a visible change to everybody's IDE on their next session, not a
new-user default — worth announcing rather than shipping quietly.

### Per-installation instead of per-build

There is no way to set the default per deployment today. The alternatives, in
increasing order of work:

1. **Ship `.vscode/eduide.json` in the exercise templates** — per exercise type,
   no EduIDE change, available now.
2. **Change `DEFAULT_LEVEL`** — global to the image, needs a release.
3. **Read `EDUIDE_LEVEL` from the launch environment** — per student or per
   course, the constant exists but nothing consumes it yet.

## Where things live

| | |
|---|---|
| Levels, catalogue, default, file path | `theia-extensions/customization/src/common/customization.ts` |
| Reading and validating the file | `theia-extensions/customization/src/browser/delivered-config-reader.ts` |
| Seeding, and applying a level | `theia-extensions/customization/src/browser/customization-service.ts` |
| Preference schema (`eduide.level`, `eduide.overrides`) | `theia-extensions/customization/src/browser/customization-preferences.ts` |
| Commented example shipped in the images | `images/java-{17,25}-templates/templates/{gradle,maven}/.vscode/eduide.json` |
