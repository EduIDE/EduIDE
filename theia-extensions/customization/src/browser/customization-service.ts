/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ILogger } from '@theia/core/lib/common/logger';
import {
    ApplicationShell,
    FrontendApplication,
    FrontendApplicationContribution,
    Widget,
    WidgetManager
} from '@theia/core/lib/browser';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { CompoundMenuNode, MenuModelRegistry, MenuNode, MutableCompoundMenuNode } from '@theia/core/lib/common/menu';
import { TaskConfiguration, TaskCustomization } from '@theia/task/lib/common/task-protocol';
import { TERMINAL_WIDGET_FACTORY_ID } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar';
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DeliveredConfigReader } from './delivered-config-reader';
import {
    CustomizableElement,
    CustomizationPreferences,
    DEFAULT_LEVEL,
    DeliveredConfig,
    EduIdeLevel,
    EDUIDE_LEVEL_CONTEXT_KEY,
    ELEMENT_CATALOGUE,
    EduIdeTaskAnnotation,
    EDUIDE_TASK_PROPERTY,
    ELEMENTS_BY_ID,
    isAtLeast,
    isEduIdeLevel,
    ManagedView,
    MENU_REFRESH_PATH
} from '../common/customization';

/**
 * Owns the active experience level and applies it to the running frontend.
 *
 * A level is a preset over the element catalogue, never a cage: `isEnabled`
 * resolves the student's override first and only then the level default, so
 * every element can be switched individually at every level, expert included.
 *
 * Everything here is reversible at runtime. Theia's `ContributionFilter` is
 * evaluated once, when the DI container is assembled, so it cannot carry a
 * level the student flips; it stays in the product extension for the things
 * EduIDE never wants at any level.
 */
@injectable()
export class CustomizationService implements FrontendApplicationContribution {

    @inject(PreferenceService)
    protected readonly preferences: PreferenceService;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;
    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;
    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;
    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;
    @inject(StatusBarImpl)
    protected readonly statusBar: StatusBarImpl;
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(DeliveredConfigReader)
    protected readonly deliveredConfig: DeliveredConfigReader;
    @inject(DebugSessionManager)
    protected readonly debugSessions: DebugSessionManager;

    protected levelContextKey: ContextKey<string> | undefined;

    /** Widget ids currently blocked from being created. */
    protected readonly blockedWidgetIds = new Set<string>();
    /** Area a managed widget was in when we closed it, for putting it back. */
    protected readonly rememberedAreas = new Map<string, ApplicationShell.Area>();
    /** Top-level menus we took out of the menu bar, kept so we can put them back. */
    protected readonly removedMenus = new Map<string, MenuNode>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** Fires whenever the level or any override changes. */
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected applying = false;
    protected viewSweepTimer: ReturnType<typeof setTimeout> | undefined;

    @postConstruct()
    protected init(): void {
        // A session starting or ending changes what `requiresDebugSession`
        // elements resolve to, so the same sweep that follows a level change
        // has to follow this too.
        const onSessionChange = () => {
            this.apply().catch(error =>
                this.logger.warn('EduIDE customization: could not apply after a debug session change', error));
        };
        this.debugSessions.onDidCreateDebugSession(onSessionChange);
        this.debugSessions.onDidDestroyDebugSession(onSessionChange);

        this.preferences.onPreferenceChanged(event => {
            if (event.preferenceName === CustomizationPreferences.LEVEL
                || event.preferenceName === CustomizationPreferences.OVERRIDES) {
                this.apply();
            }
        });
    }

    // ── State ────────────────────────────────────────────────────────

    get level(): EduIdeLevel {
        const stored = this.preferences.get<string>(CustomizationPreferences.LEVEL);
        return isEduIdeLevel(stored) ? stored : DEFAULT_LEVEL;
    }

    protected get overrides(): Record<string, boolean> {
        return this.preferences.get<Record<string, boolean>>(CustomizationPreferences.OVERRIDES) ?? {};
    }

    /** Whether the element is on, taking the student's override into account. */
    isEnabled(elementId: string): boolean {
        const element = ELEMENTS_BY_ID.get(elementId);
        if (!element) {
            return true;
        }
        const override = this.overrides[elementId];
        if (typeof override === 'boolean') {
            // An explicit choice is final, debug session or not. The promise
            // that every element is switchable is worth more than tidiness.
            return override;
        }
        if (element.requiresDebugSession && this.debugSessions.sessions.length === 0) {
            return false;
        }
        return element.defaults[this.level];
    }

    /** Whether the element differs from the current level's preset. */
    isOverridden(elementId: string): boolean {
        return typeof this.overrides[elementId] === 'boolean';
    }

    /**
     * Whether the split buttons show their dropdown.
     *
     * Only at expert, where the IDE is stock. Below it the levels leave a
     * single configuration, and a chevron that opens a one-line menu is
     * furniture rather than a choice.
     */
    offersConfigurationMenu(): boolean {
        return this.level === 'expert';
    }

    /**
     * Whether toolbar buttons carry a word as well as an icon.
     *
     * Only at beginner. ▷ is learned, not obvious, and a student who has never
     * used an IDE has no reason to read it as "run"; by advanced it is familiar
     * and the word is just width. Here rather than in the toolbar so the
     * button does not hardcode a level.
     */
    labelsToolbarButtons(): boolean {
        return this.level === 'beginner';
    }

    /**
     * Whether a task may be offered by the Run button at the current level.
     *
     * The task set comes from the workspace — in the Artemis flow, from the
     * exercise repository Scorpio clones — so it cannot be catalogued task by
     * task. Three rules, in order:
     *
     * 1. `task.showAll` on: everything is offered.
     * 2. The task declares `eduide.minLevel`: that is authoritative, because
     *    whoever wrote the task knows what it is for.
     * 3. Otherwise fall back to the task's group, which every `tasks.json`
     *    already has: below expert the only task offered is the **default
     *    build task** — the one the Run button runs, which compiles and then
     *    runs in every template we ship. Everything else, tests included, is
     *    expert work. A student who has not met the debugger has usually not
     *    met a test runner either, and `Build` is redundant when `Run` builds.
     */
    isTaskAllowed(task: TaskConfiguration): boolean {
        if (this.isEnabled('task.showAll')) {
            return true;
        }
        const declared = this.declaredMinLevel(task);
        if (declared) {
            return isAtLeast(this.level, declared);
        }
        if (TaskCustomization.isDefaultBuildTask(task)) {
            return true;
        }
        return isAtLeast(this.level, 'expert');
    }

    protected declaredMinLevel(task: TaskConfiguration): EduIdeLevel | undefined {
        const annotation = task[EDUIDE_TASK_PROPERTY] as EduIdeTaskAnnotation | undefined;
        const declared = annotation?.minLevel;
        if (declared === undefined) {
            return undefined;
        }
        if (!isEduIdeLevel(declared)) {
            this.logger.warn(
                `EduIDE customization: task '${task.label}' declares eduide.minLevel '${declared}', which is not a level; ignoring it`
            );
            return undefined;
        }
        return declared;
    }

    // ── Mutation ─────────────────────────────────────────────────────

    async setLevel(level: EduIdeLevel): Promise<void> {
        await this.preferences.set(CustomizationPreferences.LEVEL, level, PreferenceScope.User);
    }

    /**
     * Set or clear one override. Passing `undefined` drops the override and
     * hands the element back to the level preset.
     */
    async setOverride(elementId: string, enabled: boolean | undefined): Promise<void> {
        const next = { ...this.overrides };
        if (enabled === undefined) {
            delete next[elementId];
        } else {
            next[elementId] = enabled;
        }
        await this.preferences.set(CustomizationPreferences.OVERRIDES, next, PreferenceScope.User);
    }

    /** Drop every override, so the level preset is all that is left. */
    async resetOverrides(): Promise<void> {
        await this.preferences.set(CustomizationPreferences.OVERRIDES, {}, PreferenceScope.User);
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    initialize(): void {
        this.levelContextKey = this.contextKeyService.createKey<string>(EDUIDE_LEVEL_CONTEXT_KEY, this.level);
        // Registered before the layout is restored, so a view that is off never
        // gets rebuilt from a workspace layout saved at a higher level.
        this.widgetManager.onWillCreateWidget(event => {
            if (this.blockedWidgetIds.has(event.factoryId)) {
                event.waitUntil(Promise.reject(
                    new Error(`Widget '${event.factoryId}' is hidden by the EduIDE ${this.level} level.`)
                ));
            }
            if (event.factoryId === TERMINAL_WIDGET_FACTORY_ID
                && this.isUserTerminal(event.widget)
                && !this.userTerminalsAllowed()) {
                // Worth a real sentence: the student is about to wonder why
                // nothing happened, and this is the way back.
                event.waitUntil(Promise.reject(new Error(
                    `The terminal is hidden at the EduIDE ${this.level} level. `
                    + 'Turn "Shell terminal" on in EduIDE: Customize… to get it back.'
                )));
            }
        });
        // Views contributed by VS Code extensions are created well after the
        // layout is initialised, so the startup sweep never sees them. Re-run it
        // when a widget appears that a disabled element claims.
        this.widgetManager.onDidCreateWidget(event => {
            if (this.claimedByDisabledElement(event.widget)) {
                this.scheduleViewSweep();
            }
        });
        this.refreshBlockedWidgetIds();
    }

    protected claimedByDisabledElement(widget: Widget): boolean {
        return ELEMENT_CATALOGUE.some(element =>
            !element.pending
            && element.views !== undefined
            && !this.isEnabled(element.id)
            && element.views.some(view => this.viewMatches(view, widget)));
    }

    protected scheduleViewSweep(): void {
        if (this.viewSweepTimer) {
            clearTimeout(this.viewSweepTimer);
        }
        this.viewSweepTimer = setTimeout(() => {
            this.viewSweepTimer = undefined;
            this.applyViews().catch(error =>
                this.logger.warn('EduIDE customization: view sweep failed', error));
        }, 100);
    }

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        await this.seedFromExercise();
        await this.apply();
    }

    // ── Seeding from the exercise ────────────────────────────────────

    /**
     * Adopts what the exercise asked for, but only for a student who has not
     * chosen for themselves.
     *
     * `inspectInScope(..., User)` is the test for "has chosen": it sees the
     * student's own value and nothing else, so a level that came from a
     * previous seed and a level the student picked are indistinguishable here
     * — which is the point. Once a value is theirs, the exercise stops having
     * an opinion, and the seed writes into the same scope so the status bar,
     * the quick pick and the Customize panel all agree about where the level
     * came from.
     */
    protected async seedFromExercise(): Promise<void> {
        let delivered: DeliveredConfig | undefined;
        try {
            delivered = await this.deliveredConfig.read();
        } catch (error) {
            this.logger.warn('EduIDE customization: could not read the exercise configuration', error);
            return;
        }
        if (!delivered) {
            return;
        }
        if (delivered.level !== undefined && !this.hasOwnValue(CustomizationPreferences.LEVEL)) {
            await this.preferences.set(CustomizationPreferences.LEVEL, delivered.level, PreferenceScope.User);
            this.logger.info(`EduIDE customization: starting at ${delivered.level}, as the exercise asks`);
        }
        if (delivered.overrides !== undefined && !this.hasOwnValue(CustomizationPreferences.OVERRIDES)) {
            await this.preferences.set(CustomizationPreferences.OVERRIDES, { ...delivered.overrides }, PreferenceScope.User);
        }
    }

    /** Whether the student has set this preference themselves. */
    protected hasOwnValue(preferenceName: string): boolean {
        return this.preferences.inspectInScope(preferenceName, PreferenceScope.User) !== undefined;
    }

    // ── Applying ─────────────────────────────────────────────────────

    async apply(): Promise<void> {
        if (this.applying) {
            return;
        }
        this.applying = true;
        try {
            this.levelContextKey?.set(this.level);
            this.refreshBlockedWidgetIds();
            await this.applyPreferences();
            await this.applyViews();
            await this.applyTerminals();
            this.applyStatusBarItems();
            this.applyMenus();
        } finally {
            this.applying = false;
        }
        this.onDidChangeEmitter.fire();
    }

    protected refreshBlockedWidgetIds(): void {
        this.blockedWidgetIds.clear();
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.views || this.isEnabled(element.id)) {
                continue;
            }
            for (const view of element.views) {
                if (view.match !== 'includes') {
                    this.blockedWidgetIds.add(view.id);
                }
            }
        }
    }

    protected async applyPreferences(): Promise<void> {
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.preferences) {
                continue;
            }
            const values = this.isEnabled(element.id) ? element.preferences.on : element.preferences.off;
            if (!values) {
                continue;
            }
            for (const [key, value] of Object.entries(values)) {
                try {
                    await this.preferences.set(key, value, PreferenceScope.User);
                } catch (error) {
                    this.logger.warn(`EduIDE customization: could not set '${key}'`, error);
                }
            }
        }
    }

    protected async applyViews(): Promise<void> {
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.views) {
                continue;
            }
            const enabled = this.isEnabled(element.id);
            for (const view of element.views) {
                if (enabled) {
                    await this.showView(element, view);
                } else {
                    await this.hideView(view);
                }
            }
        }
    }

    protected async hideView(view: ManagedView): Promise<void> {
        for (const widget of this.matchingWidgets(view)) {
            const area = this.shell.getAreaFor(widget);
            if (area) {
                this.rememberedAreas.set(widget.id, area);
            }
            try {
                await this.shell.closeWidget(widget.id, { save: false });
            } catch (error) {
                this.logger.warn(`EduIDE customization: could not hide '${widget.id}'`, error);
            }
        }
    }

    protected async showView(element: CustomizableElement, view: ManagedView): Promise<void> {
        if (this.matchingWidgets(view).length > 0) {
            return;
        }
        if (element.requiresDebugSession) {
            // Becoming available is the whole job here. Creating it ourselves
            // produces a widget its own view contribution never set up — it
            // attaches without a side-bar tab — so we stop at lifting the
            // block and let the student open it the ordinary way, which hands
            // the work to the contribution that knows how.
            return;
        }
        if (view.match === 'includes') {
            // The container id is only known once the plugin is resolved, so we
            // cannot create it ourselves. It comes back on the next reload.
            return;
        }
        try {
            const widget = await this.widgetManager.getOrCreateWidget(view.id);
            this.shell.addWidget(widget, { area: this.rememberedAreas.get(view.id) ?? view.area });
        } catch (error) {
            this.logger.warn(
                `EduIDE customization: could not restore '${view.id}' for '${element.id}'; it returns on the next reload`,
                error
            );
        }
    }

    // ── Terminals ────────────────────────────────────────────────────

    /**
     * Terminals a task opened stay: a beginner still has to read what `Run`
     * printed. Only the ones a student opened themselves are hidden.
     */
    protected userTerminalsAllowed(): boolean {
        const element = ELEMENT_CATALOGUE.find(candidate => candidate.userTerminals);
        return element ? this.isEnabled(element.id) : true;
    }

    protected isUserTerminal(widget: Widget): boolean {
        return (widget as { kind?: string }).kind === 'user';
    }

    protected async applyTerminals(): Promise<void> {
        if (this.userTerminalsAllowed()) {
            return;
        }
        for (const widget of this.shell.widgets.filter(candidate => this.isUserTerminal(candidate))) {
            try {
                await this.shell.closeWidget(widget.id, { save: false });
            } catch (error) {
                this.logger.warn(`EduIDE customization: could not close terminal '${widget.id}'`, error);
            }
        }
    }

    // ── Status bar ───────────────────────────────────────────────────

    /**
     * Whether a status bar entry is suppressed at the current level.
     *
     * The entries are re-set on every editor change, so removing them once
     * loses the race. `LevelAwareStatusBar` asks this on the way in instead;
     * `applyStatusBarItems` only clears what was already on screen when the
     * level dropped.
     */
    isStatusBarItemHidden(id: string): boolean {
        for (const element of ELEMENT_CATALOGUE) {
            if (element.statusBarItems?.includes(id)) {
                return !this.isEnabled(element.id);
            }
        }
        return false;
    }

    protected applyStatusBarItems(): void {
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.statusBarItems || this.isEnabled(element.id)) {
                continue;
            }
            for (const id of element.statusBarItems) {
                this.statusBar.removeElement(id).catch(error =>
                    this.logger.warn(`EduIDE customization: could not remove status bar item '${id}'`, error));
            }
        }
    }

    // ── Menu bar ─────────────────────────────────────────────────────

    protected applyMenus(): void {
        let changed = false;
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.menus) {
                continue;
            }
            const enabled = this.isEnabled(element.id);
            for (const path of element.menus) {
                changed = this.toggleMenuNode(path, enabled) || changed;
            }
        }
        if (changed) {
            this.refreshMenuBar();
        }
    }

    /**
     * Takes one node out of its parent menu, or puts it back.
     *
     * The path is the node's own: everything but the last segment addresses the
     * parent, the last segment is the node. That covers a whole menu hanging off
     * the menu bar and a single entry inside one with the same code, which is
     * what View needs — trimming the bar never reached inside a menu, so View
     * went on listing every view the level had just taken away.
     *
     * Nodes are kept rather than discarded, because putting one back is how a
     * level change upwards restores it.
     */
    protected toggleMenuNode(path: readonly string[], enabled: boolean): boolean {
        const parentPath = path.slice(0, -1);
        const id = path[path.length - 1];
        const parent = this.menus.getMenu([...parentPath]);
        if (!parent || !MutableCompoundMenuNode.is(parent) || !CompoundMenuNode.is(parent)) {
            return false;
        }
        const key = `${parentPath.join('/')}/${id}`;
        const present = parent.children.find(child => child.id === id);
        if (enabled && !present) {
            const removed = this.removedMenus.get(key);
            if (!removed) {
                return false;
            }
            parent.addNode(removed);
            this.removedMenus.delete(key);
            return true;
        }
        if (!enabled && present) {
            this.removedMenus.set(key, present);
            parent.removeNode(present);
            return true;
        }
        return false;
    }

    /**
     * `MenuModelRegistry` fires a change event when a registration is disposed,
     * not when it is added, and the browser menu bar rebuilds on that event.
     * Registering a throwaway action and disposing it is therefore the
     * public-API way to make the bar redraw after we moved nodes around.
     */
    protected refreshMenuBar(): void {
        try {
            this.menus.registerMenuAction([...MENU_REFRESH_PATH], {
                commandId: 'eduide.internal.menuRefresh',
                label: ''
            }).dispose();
        } catch (error) {
            this.logger.warn('EduIDE customization: could not refresh the menu bar', error);
        }
    }

    protected viewMatches(view: ManagedView, widget: Widget): boolean {
        return view.match === 'includes'
            ? widget.id.toLowerCase().includes(view.id.toLowerCase())
            : widget.id === view.id;
    }

    protected matchingWidgets(view: ManagedView): Widget[] {
        if (view.match === 'includes') {
            return this.shell.widgets.filter(candidate => this.viewMatches(view, candidate));
        }
        const widget = this.shell.getWidgetById(view.id);
        return widget ? [widget] : [];
    }
}
