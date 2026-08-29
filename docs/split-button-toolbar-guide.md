# Split Button Toolbar Guide

This guide explains the split button toolbar architecture used for the **Run** and **Debug** buttons in the Theia IDE editor toolbar, and how to add new split buttons.

## Overview

The toolbar provides split buttons that appear in the editor tab bar. Each button has:
- A **main action** (left side) — executes the last-used or first available configuration
- A **dropdown menu** (chevron on right) — lists all available configurations for selection

The architecture follows a **Template Method** pattern via `AbstractSplitButtonContribution<TConfig>`, which handles all shared logic. Concrete subclasses only define how to fetch, execute, and label their specific configuration type.

## Architecture

```
AbstractSplitButtonContribution<TConfig>      (base class — shared logic)
├── TaskToolbarContribution                   (reads tasks.json, runs tasks)
├── DebugToolbarContribution                  (reads launch.json, starts debug sessions)
└── YourCustomContribution                    (your new button)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/browser/toolbar/abstract-split-button-contribution.tsx` | Abstract base class with all shared logic |
| `src/browser/toolbar/task-toolbar-contribution.tsx` | Run button — executes tasks from `tasks.json` |
| `src/browser/toolbar/debug-toolbar-contribution.tsx` | Debug button — starts debug sessions from `launch.json` |
| `src/browser/toolbar/split-button.tsx` | Reusable React `SplitButton` UI component |
| `src/browser/toolbar/split-button.css` | Button styling |
| `src/browser/theia-ide-frontend-module.ts` | DI module — registers all contributions |

### What the Base Class Provides

The `AbstractSplitButtonContribution<TConfig>` handles:

- **Toolbar registration** — creates and registers the toolbar item
- **Configuration caching** — stores fetched configurations with debounced refresh
- **Last-run memory** — re-executes the most recently used configuration on main button click
- **Split button rendering** — renders the `SplitButton` React component with correct props
- **Dropdown menu** — builds and displays a context menu listing all configurations
- **Visibility** — only shows the button when an `EditorWidget` is active
- **Workspace awareness** — refreshes configurations when the workspace changes

## Adding a New Split Button

### Step 1: Create the Contribution Class

Create a new file in `src/browser/toolbar/`, e.g. `test-toolbar-contribution.tsx`:

```typescript
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls, MenuPath } from '@theia/core';
import { AbstractSplitButtonContribution } from './abstract-split-button-contribution';

// Your configuration type — whatever your provider returns
interface TestConfiguration {
    name: string;
    command: string;
}

export const TEST_TOOLBAR_MENU: MenuPath = ['test-toolbar', 'test'];

@injectable()
export class TestToolbarContribution extends AbstractSplitButtonContribution<TestConfiguration> {

    // Inject your specific services
    // @inject(TestService) protected readonly testService: TestService;

    // ── Required properties ──────────────────────────────────────
    protected readonly toolbarId = 'test-toolbar-button';
    protected readonly menuPath = TEST_TOOLBAR_MENU;
    protected readonly icon = 'beaker';           // Codicon name
    protected readonly group = 'navigation';
    protected readonly priority = 2;              // Position after run (0) and debug (1)
    protected readonly refreshDelayMs = 600;

    // ── Lifecycle ────────────────────────────────────────────────
    @postConstruct()
    protected init(): void {
        // Wire up your change listeners
        // this.testService.onDidChange(() => this.refreshConfigurations());

        this.workspaceService.onWorkspaceChanged(async () => {
            await this.workspaceService.ready;
            this.refreshConfigurations();
        });

        this.initialize();
    }

    // ── Required abstract method implementations ─────────────────

    protected async fetchConfigurations(): Promise<TestConfiguration[]> {
        // Return all available configurations from your provider
        // return this.testService.getConfigurations();
        return [];
    }

    protected async executeConfiguration(config: TestConfiguration): Promise<void> {
        // Execute the configuration
        // await this.testService.run(config);
    }

    protected getConfigurationLabel(config: TestConfiguration): string {
        return config.name;
    }

    protected getTooltip(config: TestConfiguration | undefined, hasConfigs: boolean): string {
        if (!hasConfigs) {
            return nls.localize('theia/test-toolbar/noConfigs', 'No test configurations available');
        }
        if (config) {
            return nls.localize('theia/test-toolbar/run', 'Test: {0}', config.name);
        }
        return nls.localize('theia/test-toolbar/runDefault', 'Run Tests');
    }

    protected getMenuTooltip(): string {
        return nls.localize('theia/test/selectConfig', 'Select test configuration');
    }

    protected getLastExecutedConfig(): TestConfiguration | undefined {
        // Return the most recently executed config, or undefined
        // return this.testService.lastRun;
        return undefined;
    }
}
```

### Step 2: Register in the DI Module

In `src/browser/theia-ide-frontend-module.ts`, add:

```typescript
import { TestToolbarContribution } from './toolbar/test-toolbar-contribution';

// Inside the ContainerModule callback:
bind(TestToolbarContribution).toSelf().inSingletonScope();
bind(TabBarToolbarContribution).toService(TestToolbarContribution);
```

### Step 3: Add Dependencies (if needed)

If your contribution depends on a Theia package not yet listed, add it to `package.json`:

```json
{
  "dependencies": {
    "@theia/your-package": "1.68.2"
  }
}
```

### Step 4: Build

```bash
cd theia-extensions/product
yarn build
```

## Abstract Methods Reference

| Method | Purpose | Return Type |
|--------|---------|-------------|
| `fetchConfigurations()` | Load all available configurations from your provider | `Promise<TConfig[]>` |
| `executeConfiguration(config)` | Execute a single configuration | `Promise<void>` |
| `getConfigurationLabel(config)` | Human-readable label for dropdown menu items | `string` |
| `getTooltip(config, hasConfigs)` | Main button tooltip text | `string` |
| `getMenuTooltip()` | Dropdown chevron tooltip text | `string` |
| `getLastExecutedConfig()` | Most recently executed config (for "repeat last" behavior) | `TConfig \| undefined` |

## Abstract Properties Reference

| Property | Type | Purpose | Example |
|----------|------|---------|---------|
| `toolbarId` | `string` | Unique toolbar item ID | `'task-run-toolbar-button'` |
| `menuPath` | `MenuPath` | Context menu path for the dropdown | `['task-toolbar', 'run']` |
| `icon` | `string` | Codicon name for the button icon | `'play'`, `'debug-alt'`, `'beaker'` |
| `group` | `string` | Toolbar group | `'navigation'` |
| `priority` | `number` | Order within group (lower = further left) | `0`, `1`, `2` |
| `refreshDelayMs` | `number` | Debounce delay for configuration refresh | `600` |

## Available Codicons

Common icons for toolbar buttons (see [Codicon reference](https://microsoft.github.io/vscode-codicons/dist/codicon.html)):

- `play` — Run / Execute
- `debug-alt` — Debug
- `beaker` — Test
- `rocket` — Deploy
- `terminal` — Terminal / Shell
- `gear` — Settings / Configure
- `tools` — Build tools

## Existing Implementations

### TaskToolbarContribution (Run Button)

- **Icon:** `play`
- **Priority:** `0` (leftmost)
- **Config source:** `tasks.json` via `TaskConfigurations.getTasks()`
- **Execution:** `TaskService.run()`
- **Last-run tracking:** `TaskService.getLastTask()`
- **Listeners:** `TaskConfigurationManager.onDidChangeTaskConfig`, `TaskWatcher.onTaskCreated`

### DebugToolbarContribution (Debug Button)

- **Icon:** `debug-alt`
- **Priority:** `1` (right of run)
- **Config source:** `launch.json` via `DebugConfigurationManager.all`
- **Execution:** `DebugSessionManager.start()`
- **Last-run tracking:** `DebugSessionManager.currentSession`
- **Listeners:** `DebugConfigurationManager.onDidChange`

## Tips

- **Keep priority values sequential** to maintain predictable button ordering
- **Use descriptive `toolbarId` values** — they appear in DOM and debug output
- **Always call `this.initialize()`** at the end of your `@postConstruct` method
- **Wire up change listeners before `initialize()`** so the first refresh captures initial state
- **The button auto-hides** when `fetchConfigurations()` returns an empty array
- **The dropdown chevron auto-hides** when there are zero configurations (and shows when >= 1)
