/**
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 */

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls, MenuPath } from '@theia/core';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { AbstractSplitButtonContribution } from './abstract-split-button-contribution';

export const DEBUG_TOOLBAR_MENU: MenuPath = ['debug-toolbar', 'debug'];
const DEBUG_REFRESH_DELAY_MS = 600;

@injectable()
export class DebugToolbarContribution extends AbstractSplitButtonContribution<DebugConfiguration> {

    @inject(DebugConfigurationManager)
    protected readonly debugConfigManager: DebugConfigurationManager;
    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    protected readonly toolbarId = 'task-debug-toolbar-button';
    protected readonly menuPath = DEBUG_TOOLBAR_MENU;
    protected readonly icon = 'bug';
    protected readonly group = 'navigation';
    protected readonly priority = 1; // Right after the run button
    protected readonly refreshDelayMs = DEBUG_REFRESH_DELAY_MS;

    protected lastUsedConfig: DebugConfiguration | undefined;

    @postConstruct()
    protected init(): void {
        this.debugConfigManager.onDidChange(() => {
            this.refreshConfigurations();
        });

        this.workspaceService.onWorkspaceChanged(async () => {
            await this.workspaceService.ready;
            this.refreshConfigurations();
        });

        this.initialize();
    }

    protected async fetchConfigurations(): Promise<DebugConfiguration[]> {
        return Array.from(this.debugConfigManager.all)
            .filter((option): option is DebugSessionOptions & { configuration: DebugConfiguration } =>
                DebugSessionOptions.isConfiguration(option)
            )
            .map(option => option.configuration);
    }

    protected async executeConfiguration(config: DebugConfiguration): Promise<void> {
        this.lastUsedConfig = config;
        await this.debugSessionManager.start({
            name: config.name,
            configuration: config
        });
    }

    protected getConfigurationLabel(config: DebugConfiguration): string {
        return config.name;
    }

    protected getTooltip(config: DebugConfiguration | undefined, hasConfigs: boolean): string {
        if (!hasConfigs) {
            return nls.localize('theia/debug-toolbar/noConfigs', 'No debug configurations available');
        }
        if (config) {
            return nls.localize('theia/debug-toolbar/startDebug', 'Debug: {0}', config.name);
        }
        return nls.localize('theia/debug-toolbar/startDebugDefault', 'Start Debugging');
    }

    protected getMenuTooltip(): string {
        return nls.localize('theia/debug/selectConfig', 'Select debug configuration');
    }

    protected getLastExecutedConfig(): DebugConfiguration | undefined {
        const current = this.debugSessionManager.currentSession;
        if (current?.configuration) {
            return current.configuration;
        }
        return this.lastUsedConfig;
    }
}
