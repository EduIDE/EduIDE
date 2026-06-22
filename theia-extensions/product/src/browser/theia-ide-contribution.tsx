/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { ContributionFilterRegistry, FilterContribution } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { WidgetFactory, FrontendApplicationContribution, FrontendApplication, WidgetManager } from '@theia/core/lib/browser';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { OutlineViewService } from '@theia/outline-view/lib/browser/outline-view-service';
import { OutlineBreadcrumbsContribution } from '@theia/outline-view/lib/browser/outline-breadcrumbs-contribution';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { eduIdeDarkThemeIncludes, eduIdeTheme } from './themes/eduide-theme';
import { eduIdeLightTheme, eduIdeLightThemeIncludes } from './themes/eduide-light-theme';

export namespace TheiaIDEMenus {
    export const THEIA_IDE_HELP: MenuPath = [...CommonMenus.HELP, 'theia-ide'];
}
export namespace TheiaIDECommands {
    export const CATEGORY = 'TheiaIDE';
    export const REPORT_ISSUE: Command = {
        id: 'theia-ide:report-issue',
        category: CATEGORY,
        label: 'Report Issue'
    };
}

/**
 * Filter to remove unwanted view contributions (Outline, VSX Extensions marketplace) from the UI.
 * This uses Theia's official Contribution Filter API to prevent these widgets from being registered.
 *
 * Filter predicates return TRUE to KEEP a contribution, FALSE to REMOVE it.
 */
@injectable()
export class ViewsFilter implements FilterContribution {
    private static readonly FILTERED_CONTRIBUTIONS = new Set<Function>([
        OutlineViewService,
        OutlineViewContribution,
        OutlineBreadcrumbsContribution,
        VSXExtensionsContribution,
    ]);

    private static readonly FILTERED_WIDGET_IDS = new Set<string>([
        'outline-view',
        'vsx-extensions-view-container',
    ]);

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        const filter = (contrib: Object) => !ViewsFilter.FILTERED_CONTRIBUTIONS.has(contrib.constructor);

        // Filter contributions - must specify exact types since '*' doesn't always work
        registry.addFilters([CommandContribution], [filter]);
        registry.addFilters([MenuContribution], [filter]);
        registry.addFilters([KeybindingContribution], [filter]);
        registry.addFilters([FrontendApplicationContribution], [filter]);
        registry.addFilters([TabBarToolbarContribution], [filter]);

        // Remove the actual widget factories/view containers
        registry.addFilters([WidgetFactory], [
            factory => !ViewsFilter.FILTERED_WIDGET_IDS.has((factory as WidgetFactory).id)
        ]);
    }
}

/**
 * Runtime protection against unwanted features.
 * Provides additional defense-in-depth by blocking widgets at runtime.
 *
 * Use this for:
 * - Additional protection against restored workspace layouts
 * - Ensuring widgets filtered at contribution level don't slip through
 */
@injectable()
export class DisabledFeaturesContribution implements FrontendApplicationContribution {
    private static readonly DISABLED_WIDGET_IDS = new Set<string>([
        'outline-view',
        'vsx-extensions-view-container',
    ]);

    constructor(
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager
    ) { }

    initialize(): void {
        this.widgetManager.onWillCreateWidget(event => {
            if (DisabledFeaturesContribution.DISABLED_WIDGET_IDS.has(event.factoryId)) {
                event.waitUntil(Promise.reject(new Error(`Widget '${event.factoryId}' is disabled by product configuration.`)));
            }
        });
    }

    async onDidInitializeLayout(app: FrontendApplication): Promise<void> {
        // Close any widgets that slipped through (e.g., from restored workspace layout)
        for (const factoryId of DisabledFeaturesContribution.DISABLED_WIDGET_IDS) {
            try {
                await app.shell.closeWidget(factoryId);
            } catch {
                // Ignore - widget might not exist
            }
        }
    }
}

@injectable()
export class TheiaIDEContribution implements CommandContribution, MenuContribution {

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(HostedPluginSupport)
    protected readonly hostedPluginSupport: HostedPluginSupport;

    @inject(TabBarToolbarRegistry)
    protected readonly tabBarToolbarRegistry: TabBarToolbarRegistry;

    @inject(MonacoThemingService)
    protected readonly themingService: MonacoThemingService;

    static REPORT_ISSUE_URL = 'https://github.com/eduide/eduide/issues';

    @postConstruct()
    protected init(): void {
        this.hostedPluginSupport.didStart.then(() => {
            this.tabBarToolbarRegistry.unregisterItem('plugin_editor/title/run');
        });
        this.themingService.registerParsedTheme({
            id: 'edu-ide-theme-dark',
            label: 'EduIDE Dark',
            uiTheme: 'vs-dark',
            json: eduIdeTheme,
            includes: eduIdeDarkThemeIncludes
        });

        this.themingService.registerParsedTheme({
            id: 'edu-ide-theme-light',
            label: 'EduIDE Light',
            uiTheme: 'vs',
            json: eduIdeLightTheme,
            includes: eduIdeLightThemeIncludes
        });
    }

    registerCommands(commandRegistry: CommandRegistry): void {
        commandRegistry.registerCommand(TheiaIDECommands.REPORT_ISSUE, {
            execute: () => this.windowService.openNewWindow(TheiaIDEContribution.REPORT_ISSUE_URL, { external: true })
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(TheiaIDEMenus.THEIA_IDE_HELP, {
            commandId: TheiaIDECommands.REPORT_ISSUE.id,
            label: TheiaIDECommands.REPORT_ISSUE.label,
            order: '1'
        });
    }
}
