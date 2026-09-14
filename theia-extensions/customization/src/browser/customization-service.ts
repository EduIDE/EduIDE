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
import { PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import {
    CustomizableElement,
    CustomizationPreferences,
    DEFAULT_LEVEL,
    EduIdeLevel,
    EDUIDE_LEVEL_CONTEXT_KEY,
    ELEMENT_CATALOGUE,
    EduIdeTaskAnnotation,
    EDUIDE_TASK_PROPERTY,
    ELEMENTS_BY_ID,
    isAtLeast,
    isEduIdeLevel,
    MAIN_MENU_BAR,
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
    @inject(ILogger)
    protected readonly logger: ILogger;

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

    @postConstruct()
    protected init(): void {
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
        return typeof override === 'boolean' ? override : element.defaults[this.level];
    }

    /** Whether the element differs from the current level's preset. */
    isOverridden(elementId: string): boolean {
        return typeof this.overrides[elementId] === 'boolean';
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
     *    already has: the default build task and test tasks are beginner work,
     *    anything else needs advanced. A task with no group at all is treated
     *    as advanced.
     */
    isTaskAllowed(task: TaskConfiguration): boolean {
        if (this.isEnabled('task.showAll')) {
            return true;
        }
        const declared = this.declaredMinLevel(task);
        if (declared) {
            return isAtLeast(this.level, declared);
        }
        if (TaskCustomization.isDefaultBuildTask(task) || TaskCustomization.isTestTask(task)) {
            return true;
        }
        return isAtLeast(this.level, 'advanced');
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
        });
        this.refreshBlockedWidgetIds();
    }

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        await this.apply();
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

    // ── Menu bar ─────────────────────────────────────────────────────

    protected applyMenus(): void {
        const menubar = this.menus.getMenu([...MAIN_MENU_BAR]);
        if (!menubar || !MutableCompoundMenuNode.is(menubar) || !CompoundMenuNode.is(menubar)) {
            return;
        }
        let changed = false;
        for (const element of ELEMENT_CATALOGUE) {
            if (element.pending || !element.menus) {
                continue;
            }
            const enabled = this.isEnabled(element.id);
            for (const path of element.menus) {
                const id = path[path.length - 1];
                const present = menubar.children.find(child => child.id === id);
                if (enabled && !present) {
                    const removed = this.removedMenus.get(id);
                    if (removed) {
                        menubar.addNode(removed);
                        this.removedMenus.delete(id);
                        changed = true;
                    }
                } else if (!enabled && present) {
                    this.removedMenus.set(id, present);
                    menubar.removeNode(present);
                    changed = true;
                }
            }
        }
        if (changed) {
            this.refreshMenuBar();
        }
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

    protected matchingWidgets(view: ManagedView): Widget[] {
        if (view.match === 'includes') {
            const needle = view.id.toLowerCase();
            return this.shell.widgets.filter(candidate => candidate.id.toLowerCase().includes(needle));
        }
        const widget = this.shell.getWidgetById(view.id);
        return widget ? [widget] : [];
    }
}
