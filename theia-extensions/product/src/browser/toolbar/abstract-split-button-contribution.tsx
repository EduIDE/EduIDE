/**
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 */

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    TabBarToolbarContribution,
    TabBarToolbarRegistry
} from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ReactTabBarToolbarAction } from '@theia/core/lib/browser/shell/tab-bar-toolbar/tab-bar-toolbar-types';
import { Widget } from '@theia/core/lib/browser';
import { ContextMenuRenderer, Anchor } from '@theia/core/lib/browser/context-menu-renderer';
import { BrowserMenuNodeFactory } from '@theia/core/lib/browser/menu/browser-menu-node-factory';
import { Emitter, Event, MenuPath } from '@theia/core';
import { EditorWidget } from '@theia/editor/lib/browser';
import { CommandMenu, MenuNode } from '@theia/core/lib/common/menu';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import * as React from '@theia/core/shared/react';
import { SplitButton } from './split-button';

/**
 * Abstract base class for toolbar split button contributions.
 *
 * Provides a reusable split button pattern with a main action and a dropdown
 * menu listing all available configurations. Subclasses only need to define
 * how to fetch, execute, and label their configuration type.
 *
 * @typeParam TConfig - The configuration type (e.g., TaskConfiguration, DebugConfiguration).
 */
@injectable()
export abstract class AbstractSplitButtonContribution<TConfig> implements TabBarToolbarContribution {

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(BrowserMenuNodeFactory)
    protected readonly menuNodeFactory: BrowserMenuNodeFactory;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    protected readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected cachedConfigs: TConfig[] = [];
    protected refreshTimer: ReturnType<typeof setTimeout> | undefined;

    // ── Abstract properties ──────────────────────────────────────────

    /** Unique toolbar item ID, e.g. 'task-run-toolbar-button'. */
    protected abstract readonly toolbarId: string;
    /** Menu path for the dropdown context menu. */
    protected abstract readonly menuPath: MenuPath;
    /** Codicon name for the main button icon, e.g. 'play' or 'debug-alt'. */
    protected abstract readonly icon: string;
    /** Toolbar group (typically 'navigation'). */
    protected abstract readonly group: string;
    /** Position within the toolbar group. Lower numbers appear first. */
    protected abstract readonly priority: number;
    /** Delay in milliseconds before refreshing configurations (debounce). */
    protected abstract readonly refreshDelayMs: number;

    // ── Abstract methods ─────────────────────────────────────────────

    /** Fetch all available configurations from the respective provider. */
    protected abstract fetchConfigurations(): Promise<TConfig[]>;
    /** Execute a single configuration (run task, start debug session, etc.). */
    protected abstract executeConfiguration(config: TConfig): Promise<void>;
    /** Return the human-readable label for a configuration. */
    protected abstract getConfigurationLabel(config: TConfig): string;
    /** Build the main button tooltip. */
    protected abstract getTooltip(config: TConfig | undefined, hasConfigs: boolean): string;
    /** Build the dropdown chevron tooltip. */
    protected abstract getMenuTooltip(): string;
    /** Return the most recently executed configuration, if any. */
    protected abstract getLastExecutedConfig(): TConfig | undefined;

    // ── Lifecycle ────────────────────────────────────────────────────

    /** Call from @postConstruct after wiring up subclass-specific listeners. */
    protected async initialize(): Promise<void> {
        await this.workspaceService.ready;
        const roots = await this.workspaceService.roots;
        if (!roots || roots.length === 0) {
            return;
        }
        this.refreshConfigurations();
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        registry.registerItem(this.createToolbarItem());
    }

    protected createToolbarItem(): ReactTabBarToolbarAction {
        return {
            id: this.toolbarId,
            group: this.group,
            priority: this.priority,
            onDidChange: this.onDidChange,
            isVisible: (widget?: Widget) => widget instanceof EditorWidget,
            render: (widget?: Widget) => this.render(widget)
        };
    }

    // ── Configuration management ─────────────────────────────────────

    protected refreshConfigurations(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(async () => {
            try {
                this.cachedConfigs = await this.fetchConfigurations();
            } catch (error) {
                console.error(`Failed to refresh configurations for ${this.toolbarId}:`, error);
                this.cachedConfigs = [];
            }
            this.onDidChangeEmitter.fire();
        }, this.refreshDelayMs);
    }

    /**
     * Determine which configuration to execute on main button click.
     * Priority: last executed config > first in list.
     */
    protected getConfigToExecute(): TConfig | undefined {
        const lastConfig = this.getLastExecutedConfig();
        if (lastConfig) {
            const lastLabel = this.getConfigurationLabel(lastConfig);
            const match = this.cachedConfigs.find(c => this.getConfigurationLabel(c) === lastLabel);
            if (match) {
                return match;
            }
        }
        if (this.cachedConfigs.length > 0) {
            return this.cachedConfigs[0];
        }
        return undefined;
    }

    // ── Rendering ────────────────────────────────────────────────────

    protected render(widget?: Widget): React.ReactNode {
        const hasConfigs = this.cachedConfigs.length > 0;
        const configToRun = this.getConfigToExecute();

        return (
            <SplitButton
                buttonKey={this.toolbarId}
                icon={this.icon}
                tooltip={this.getTooltip(configToRun, hasConfigs)}
                menuTooltip={this.getMenuTooltip()}
                enabled={hasConfigs}
                showMenu={hasConfigs}
                onRun={e => this.handleExecute(e)}
                onShowMenu={e => this.handleShowMenu(e, widget)}
            />
        );
    }

    // ── Event handlers ───────────────────────────────────────────────

    protected async handleExecute(e: React.MouseEvent<HTMLElement>): Promise<void> {
        e.preventDefault();
        e.stopPropagation();
        const config = this.getConfigToExecute();
        if (!config) {
            return;
        }
        try {
            await this.executeConfiguration(config);
        } catch (error) {
            console.error(`Failed to execute configuration for ${this.toolbarId}:`, error);
            this.onDidChangeEmitter.fire();
        }
    }

    protected handleShowMenu(e: React.MouseEvent<HTMLElement>, widget?: Widget): void {
        e.preventDefault();
        e.stopPropagation();
        if (this.cachedConfigs.length === 0) {
            return;
        }
        const menuGroups = this.buildMenu();
        const anchor: Anchor = { x: e.clientX, y: e.clientY };
        this.contextMenuRenderer.render({
            menuPath: this.menuPath,
            menu: {
                children: menuGroups,
                isEmpty: () => menuGroups.length === 0,
                isVisible: () => true,
                id: `${this.toolbarId}-menu-groups`,
                sortString: '0'
            },
            anchor,
            args: [widget],
            context: e.currentTarget
        });
    }

    // ── Menu building ────────────────────────────────────────────────

    protected buildMenu(): MenuNode[] {
        const menu: MenuNode[] = [];
        const menuGroup = this.menuNodeFactory.createGroup('default');
        for (let i = 0; i < this.cachedConfigs.length; i++) {
            menuGroup.addNode(this.createMenuNode(this.cachedConfigs[i], i));
        }
        menu.push(menuGroup);
        return menu;
    }

    protected createMenuNode(config: TConfig, index: number): MenuNode {
        const label = this.getConfigurationLabel(config);

        const customNode: CommandMenu = {
            id: `${this.toolbarId}-execute-${index}-${label}`,
            sortString: label,
            label: label,
            icon: undefined,
            isVisible: () => true,
            isEnabled: () => true,
            isToggled: () => false,
            run: async () => {
                try {
                    await this.executeConfiguration(config);
                } catch (error) {
                    console.error(`Failed to execute configuration for ${this.toolbarId}:`, error);
                    this.onDidChangeEmitter.fire();
                }
            }
        };
        return customNode;
    }
}
