/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * The three experience levels.
 *
 * `expert` is not a configuration: it is EduIDE with nothing applied. Beginner
 * and advanced are presets over the element catalogue below, and every element
 * can be overridden individually at every level, expert included.
 */
export type EduIdeLevel = 'beginner' | 'advanced' | 'expert';

export const EDU_IDE_LEVELS: readonly EduIdeLevel[] = ['beginner', 'advanced', 'expert'];

export const DEFAULT_LEVEL: EduIdeLevel = 'beginner';

export function isEduIdeLevel(value: unknown): value is EduIdeLevel {
    return typeof value === 'string' && (EDU_IDE_LEVELS as readonly string[]).includes(value);
}

export namespace CustomizationPreferences {
    export const LEVEL = 'eduide.level';
    export const OVERRIDES = 'eduide.overrides';
}

/** Environment variable EduIDE-Cloud passes through `LaunchRequest.env.fromMap`. */
export const EDUIDE_LEVEL_ENV = 'EDUIDE_LEVEL';

/** Context key mirroring the active level, for `when` clauses. */
export const EDUIDE_LEVEL_CONTEXT_KEY = 'eduide.level';

export type ElementGroup =
    | 'views'
    | 'toolbar'
    | 'tasks'
    | 'editor'
    | 'diagnostics'
    | 'menus'
    | 'statusBar'
    | 'startup'
    | 'assistance';

export const ELEMENT_GROUP_LABELS: Record<ElementGroup, string> = {
    views: 'Views',
    toolbar: 'Editor toolbar',
    tasks: 'Run configurations',
    editor: 'Editor',
    diagnostics: 'Diagnostics',
    menus: 'Menus',
    statusBar: 'Status bar',
    startup: 'Startup',
    assistance: 'Assistance'
};

/** Preference key/value pairs written when an element is switched on or off. */
export type PreferenceValues = Readonly<Record<string, unknown>>;

export type ViewArea = 'left' | 'right' | 'bottom';

/**
 * A Theia widget an element shows and hides.
 *
 * `match: 'includes'` is for views contributed by VS Code extensions, whose
 * container id (`plugin-view-container:<publisher>.<extension>.<view>`) is only
 * known once the plugin is resolved; the value is then matched
 * case-insensitively against the widget id.
 */
export interface ManagedView {
    readonly id: string;
    readonly area: ViewArea;
    readonly match?: 'exact' | 'includes';
}

export interface CustomizableElement {
    /** Stable id, e.g. `view.scm`. Also the key under `eduide.overrides`. */
    readonly id: string;
    /** What the student sees in the Customize panel. */
    readonly label: string;
    readonly group: ElementGroup;
    /** Where the element starts at each level. Every cell is overridable. */
    readonly defaults: Readonly<Record<EduIdeLevel, boolean>>;
    /** Written verbatim through `PreferenceService` when the element flips. */
    readonly preferences?: { readonly on?: PreferenceValues; readonly off?: PreferenceValues };
    /** Theia widgets this element shows and hides. */
    readonly views?: readonly ManagedView[];
    /**
     * Set when the catalogue lists an element the runtime does not enforce yet.
     * The Customize panel shows it, disabled, with this text as the reason, so
     * the panel stays a truthful picture of the catalogue.
     */
    readonly pending?: string;
}

const ON = { beginner: true, advanced: true, expert: true } as const;
const ADVANCED_UP = { beginner: false, advanced: true, expert: true } as const;
const EXPERT_ONLY = { beginner: false, advanced: false, expert: true } as const;
const ADVANCED_ONLY = { beginner: false, advanced: true, expert: false } as const;
const BEGINNER_ONLY = { beginner: true, advanced: false, expert: false } as const;
const SCAFFOLDING = { beginner: true, advanced: true, expert: false } as const;
const OFF = { beginner: false, advanced: false, expert: false } as const;

/**
 * The catalogue. This table is the specification: the levels are presets over
 * it, and the Customize panel renders it directly, so the two cannot drift.
 */
export const ELEMENT_CATALOGUE: readonly CustomizableElement[] = [
    // ── Views ────────────────────────────────────────────────────────
    { id: 'view.explorer', label: 'Explorer', group: 'views', defaults: ON, views: [{ id: 'explorer-view-container', area: 'left' }] },
    { id: 'view.search', label: 'Search', group: 'views', defaults: ON, views: [{ id: 'search-view-container', area: 'left' }] },
    {
        id: 'view.artemis', label: 'Artemis', group: 'views', defaults: ON,
        views: [{ id: 'artemis', area: 'left', match: 'includes' }, { id: 'scorpio', area: 'left', match: 'includes' }]
    },
    { id: 'view.problems', label: 'Problems', group: 'views', defaults: ON, views: [{ id: 'problems', area: 'bottom' }] },
    { id: 'view.scm', label: 'Source Control', group: 'views', defaults: ADVANCED_UP, views: [{ id: 'scm-view-container', area: 'left' }] },
    { id: 'view.testing', label: 'Testing', group: 'views', defaults: ADVANCED_UP, views: [{ id: 'test-view-container', area: 'left' }] },
    { id: 'view.gradle', label: 'Gradle tasks', group: 'views', defaults: ADVANCED_UP, views: [{ id: 'gradle', area: 'left', match: 'includes' }] },
    { id: 'view.output', label: 'Output', group: 'views', defaults: ADVANCED_UP, views: [{ id: 'outputView', area: 'bottom' }] },
    { id: 'view.debug', label: 'Run and Debug', group: 'views', defaults: EXPERT_ONLY, views: [{ id: 'debug', area: 'left' }] },
    { id: 'view.debugConsole', label: 'Debug Console', group: 'views', defaults: EXPERT_ONLY, views: [{ id: 'debug-console', area: 'bottom' }] },
    { id: 'view.outline', label: 'Outline', group: 'views', defaults: EXPERT_ONLY, views: [{ id: 'outline-view', area: 'right' }] },
    {
        id: 'view.memoryInspector', label: 'Memory Inspector', group: 'views', defaults: EXPERT_ONLY,
        pending: '@theia/memory-inspector is not a dependency of the browser app yet'
    },
    {
        id: 'view.terminal', label: 'Shell terminal', group: 'views', defaults: ADVANCED_UP,
        pending: 'needs the terminal commands and menu gated, not just a widget hidden'
    },

    // ── Editor toolbar ───────────────────────────────────────────────
    { id: 'toolbar.run', label: 'Run split button', group: 'toolbar', defaults: ON },
    { id: 'toolbar.debug', label: 'Debug split button', group: 'toolbar', defaults: EXPERT_ONLY },
    { id: 'toolbar.rename', label: 'Rename', group: 'toolbar', defaults: ADVANCED_ONLY, pending: 'toolbar contribution not written yet' },
    { id: 'toolbar.comment', label: 'Un-/Comment', group: 'toolbar', defaults: ADVANCED_ONLY, pending: 'toolbar contribution not written yet' },
    { id: 'toolbar.extractMethod', label: 'Extract method', group: 'toolbar', defaults: ADVANCED_ONLY, pending: 'toolbar contribution not written yet' },
    { id: 'toolbar.generateAccessors', label: 'Generate getters/setters', group: 'toolbar', defaults: ADVANCED_ONLY, pending: 'toolbar contribution not written yet' },

    // ── Run configurations ───────────────────────────────────────────
    { id: 'task.build', label: 'Build task', group: 'tasks', defaults: ADVANCED_UP, pending: 'task allow-list not wired into the Run button yet' },
    { id: 'task.checkstyle', label: 'Check style task', group: 'tasks', defaults: ADVANCED_UP, pending: 'the Gradle template does not ship the task yet' },

    // ── Editor ───────────────────────────────────────────────────────
    {
        id: 'editor.bracketGuides', label: 'Bracket-pair guides and colours', group: 'editor', defaults: SCAFFOLDING,
        preferences: {
            on: {
                'editor.bracketPairColorization.enabled': true,
                'editor.guides.bracketPairs': 'active',
                'editor.guides.highlightActiveIndentation': true
            },
            off: {
                'editor.bracketPairColorization.enabled': false,
                'editor.guides.bracketPairs': false,
                'editor.guides.highlightActiveIndentation': false
            }
        }
    },
    {
        id: 'editor.formatOnSave', label: 'Format on save', group: 'editor', defaults: ON,
        preferences: { on: { 'editor.formatOnSave': true }, off: { 'editor.formatOnSave': false } }
    },
    {
        id: 'editor.organizeImportsOnSave', label: 'Organize imports on save', group: 'editor', defaults: ON,
        preferences: { on: { 'java.saveActions.organizeImports': true }, off: { 'java.saveActions.organizeImports': false } }
    },
    {
        id: 'editor.lightbulb', label: 'Quick-fix lightbulb', group: 'editor', defaults: ON,
        preferences: { on: { 'editor.lightbulb.enabled': 'on' }, off: { 'editor.lightbulb.enabled': 'off' } }
    },
    {
        id: 'editor.minimap', label: 'Minimap', group: 'editor', defaults: ADVANCED_UP,
        preferences: { on: { 'editor.minimap.enabled': true }, off: { 'editor.minimap.enabled': false } }
    },
    {
        id: 'editor.breadcrumbs', label: 'Breadcrumbs', group: 'editor', defaults: ADVANCED_UP,
        preferences: { on: { 'breadcrumbs.enabled': true }, off: { 'breadcrumbs.enabled': false } }
    },
    {
        id: 'editor.stickyScroll', label: 'Sticky scroll', group: 'editor', defaults: ADVANCED_UP,
        preferences: { on: { 'editor.stickyScroll.enabled': true }, off: { 'editor.stickyScroll.enabled': false } }
    },
    {
        id: 'editor.inlayHints', label: 'Inlay hints', group: 'editor', defaults: ADVANCED_UP,
        preferences: {
            on: { 'editor.inlayHints.enabled': 'onUnlessPressed', 'java.inlayHints.parameterNames.enabled': 'literals' },
            off: { 'editor.inlayHints.enabled': 'off', 'java.inlayHints.parameterNames.enabled': 'none' }
        }
    },
    {
        id: 'editor.referencesCodeLens', label: 'References CodeLens', group: 'editor', defaults: ADVANCED_UP,
        preferences: { on: { 'java.referencesCodeLens.enabled': true }, off: { 'java.referencesCodeLens.enabled': false } }
    },
    {
        id: 'editor.runDebugCodeLens', label: 'Run | Debug CodeLens above main', group: 'editor', defaults: EXPERT_ONLY,
        preferences: {
            on: { 'java.debug.settings.enableRunDebugCodeLens': true },
            off: { 'java.debug.settings.enableRunDebugCodeLens': false }
        }
    },

    // ── Diagnostics ──────────────────────────────────────────────────
    {
        id: 'diag.errorLensWarnings', label: 'Warnings inline, not only errors', group: 'diagnostics', defaults: BEGINNER_ONLY,
        preferences: {
            on: { 'errorLens.enabledDiagnosticLevels': ['error', 'warning'] },
            off: { 'errorLens.enabledDiagnosticLevels': ['error'] }
        }
    },
    { id: 'diag.checkstyleLive', label: 'Checkstyle findings in Problems', group: 'diagnostics', defaults: ADVANCED_ONLY, pending: 'no Checkstyle ruleset in the image yet' },
    { id: 'diag.sonar', label: 'SonarQube for IDE', group: 'diagnostics', defaults: OFF, pending: 'held until the per-session memory budget is measured' },

    // ── Menus ────────────────────────────────────────────────────────
    { id: 'menu.runDebug', label: 'Debug entries in the Run menu', group: 'menus', defaults: EXPERT_ONLY, pending: 'core menu trimming not written yet' },
    { id: 'menu.terminal', label: 'Terminal menu', group: 'menus', defaults: ADVANCED_UP, pending: 'core menu trimming not written yet' },
    { id: 'menu.go', label: 'Go menu', group: 'menus', defaults: ADVANCED_UP, pending: 'core menu trimming not written yet' },

    // ── Status bar ───────────────────────────────────────────────────
    { id: 'status.level', label: 'Experience level indicator', group: 'statusBar', defaults: ON },
    { id: 'status.editorInfo', label: 'Encoding, EOL, indentation, language', group: 'statusBar', defaults: ADVANCED_UP, pending: 'status bar entry ids not gated yet' },

    // ── Startup ──────────────────────────────────────────────────────
    {
        id: 'startup.welcomePage', label: 'EduIDE Welcome page', group: 'startup', defaults: EXPERT_ONLY,
        preferences: { on: { 'workbench.startupEditor': 'welcomePage' }, off: { 'workbench.startupEditor': 'none' } }
    },
    { id: 'startup.openFile', label: 'Open the exercise file on start', group: 'startup', defaults: SCAFFOLDING },
    { id: 'startup.walkthrough', label: 'Offer the level walkthrough', group: 'startup', defaults: BEGINNER_ONLY, pending: 'contributes.walkthroughs needs Theia 1.75' },

    // ── Assistance ───────────────────────────────────────────────────
    { id: 'assist.irisExplain', label: '"Explain this error" action', group: 'assistance', defaults: SCAFFOLDING, pending: 'Iris code action not written yet' },
    { id: 'assist.irisHint', label: 'Include a hint toward a fix', group: 'assistance', defaults: BEGINNER_ONLY, pending: 'Iris code action not written yet' }
];

export const ELEMENTS_BY_ID: ReadonlyMap<string, CustomizableElement> =
    new Map(ELEMENT_CATALOGUE.map(element => [element.id, element]));

/** The file opened on startup while `startup.openFile` is on, per build tool. */
export const STARTUP_FILE_CANDIDATES: readonly string[] = [
    'src/main/java/com/example/App.java',
    'src/main/java/Main.java',
    'README.md'
];
