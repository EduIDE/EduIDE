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
import { ContributionFilterRegistry, FilterContribution, Emitter, Event } from '@theia/core/lib/common';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { WidgetFactory, FrontendApplicationContribution, FrontendApplication, WidgetManager, OpenHandler } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';
import { AIActivationService, ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser/ai-activation-service';
import { PromptTemplateContribution } from '@theia/ai-core/lib/browser/prompttemplate-contribution';
import { AiCoreCommandContribution } from '@theia/ai-core/lib/browser/ai-core-command-contribution';
import { MCPConfigurationCommandContribution } from '@theia/ai-mcp/lib/browser/mcp-configuration-command-contribution';
import { McpFrontendApplicationContribution } from '@theia/ai-mcp/lib/browser/mcp-frontend-application-contribution';
import { InstallMcpUriHandler } from '@theia/ai-mcp/lib/browser/install-mcp-uri-handler';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { FileNavigatorContribution } from '@theia/navigator/lib/browser/navigator-contribution';
import { eduIdeDarkThemeIncludes, eduIdeTheme } from './themes/eduide-theme';
import { eduIdeLightTheme, eduIdeLightThemeIncludes } from './themes/eduide-light-theme';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { landingPageUrl } from './landing-page';
import { productVersion } from './feedback-contribution';
import { reportIssueUrl } from './feedback';

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
    export const BACK_TO_START_PAGE: Command = {
        id: 'theia-ide:back-to-start-page',
        category: CATEGORY,
        label: 'Back to Start Page'
    };
}

/**
 * Filter to remove view contributions EduIDE never wants at any level
 * (the VSX Extensions marketplace and the AI surface) from the UI.
 * This uses Theia's official Contribution Filter API to prevent these widgets from being registered.
 *
 * Filter predicates return TRUE to KEEP a contribution, FALSE to REMOVE it.
 */
@injectable()
export class ViewsFilter implements FilterContribution {
    private static readonly FILTERED_CONTRIBUTIONS = new Set<Function>([
        // Outline is NOT filtered here. It is level-gated instead
        // (`view.outline` in the customization catalogue), because the expert
        // level is meant to be stock EduIDE and a contribution filter is
        // evaluated once, at container assembly, so it cannot be switched back on.
        VSXExtensionsContribution,
        // AI feature surface pulled in transitively via @theia/plugin-ext since Theia 1.74.
        // EduIDE ships no AI providers or chat UI; remove the remaining AI commands,
        // toolbar items, and MCP configuration entry points.
        PromptTemplateContribution,
        AiCoreCommandContribution,
        MCPConfigurationCommandContribution,
        McpFrontendApplicationContribution,
        InstallMcpUriHandler,
    ]);

    private static readonly FILTERED_WIDGET_IDS = new Set<string>([
        'vsx-extensions-view-container',
        'ai-mcp-configuration-container-widget',
    ]);

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        const filter = (contrib: Object) => !ViewsFilter.FILTERED_CONTRIBUTIONS.has(contrib.constructor);

        // Filter contributions - must specify exact types since '*' doesn't always work
        registry.addFilters([CommandContribution], [filter]);
        registry.addFilters([MenuContribution], [filter]);
        registry.addFilters([KeybindingContribution], [filter]);
        registry.addFilters([FrontendApplicationContribution], [filter]);
        registry.addFilters([TabBarToolbarContribution], [filter]);
        registry.addFilters([OpenHandler], [filter]);

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
        'vsx-extensions-view-container',
        'ai-mcp-configuration-container-widget',
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

/**
 * Keeps Theia's AI features switched off. Since 1.74, @theia/plugin-ext depends on
 * @theia/ai-core, whose default activation service marks AI as active. EduIDE does not
 * ship any AI packages on purpose, so this service reports AI as inactive and sets the
 * corresponding context key to false, hiding everything gated behind it.
 */
@injectable()
export class DisabledAIActivationService implements AIActivationService, FrontendApplicationContribution {
    isActive = false;
    canRun = false;

    protected readonly onDidChangeActiveStatusEmitter = new Emitter<boolean>();
    protected readonly onDidChangeCanRunEmitter = new Emitter<boolean>();

    get onDidChangeActiveStatus(): Event<boolean> {
        return this.onDidChangeActiveStatusEmitter.event;
    }

    get onDidChangeCanRun(): Event<boolean> {
        return this.onDidChangeCanRunEmitter.event;
    }

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    initialize(): void {
        this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
    }
}

/**
 * Shows the Explorer when the IDE starts with the default layout.
 *
 * Theia adds the Explorer to the left panel but leaves the panel collapsed, so
 * students had to open it by hand every time. `initializeLayout` only runs when
 * there is no stored layout, so a layout the student arranged is kept on reload.
 */
@injectable()
export class ExplorerOpenByDefaultContribution implements FrontendApplicationContribution {

    @inject(FileNavigatorContribution)
    protected readonly navigator: FileNavigatorContribution;

    async initializeLayout(_app: FrontendApplication): Promise<void> {
        await this.navigator.openView({ reveal: true });
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

    @inject(EnvVariablesServer)
    protected readonly envVariablesServer: EnvVariablesServer;

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
            execute: async () => this.windowService.openNewWindow(
                reportIssueUrl(window.location.hostname, await productVersion(this.envVariablesServer)), { external: true })
        });
        const startPage = landingPageUrl(window.location.hostname);
        commandRegistry.registerCommand(TheiaIDECommands.BACK_TO_START_PAGE, {
            isEnabled: () => !!startPage,
            isVisible: () => !!startPage,
            // Only navigates; the session keeps running until it idles out.
            execute: () => startPage && window.location.assign(startPage)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(TheiaIDEMenus.THEIA_IDE_HELP, {
            commandId: TheiaIDECommands.REPORT_ISSUE.id,
            label: TheiaIDECommands.REPORT_ISSUE.label,
            order: '1'
        });
        // Closing the workspace leaves an empty IDE in a session that owns exactly one workspace.
        menus.unregisterMenuAction(WorkspaceCommands.CLOSE, CommonMenus.FILE_CLOSE);
        menus.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: TheiaIDECommands.BACK_TO_START_PAGE.id,
            label: TheiaIDECommands.BACK_TO_START_PAGE.label
        });
    }
}
