import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls, MenuPath } from '@theia/core';
import { DebugConfigurationManager } from '@theia/debug/lib/browser/debug-configuration-manager';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugSessionOptions } from '@theia/debug/lib/browser/debug-session-options';
import { DebugConfiguration } from '@theia/debug/lib/common/debug-configuration';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { AbstractSplitButtonContribution } from './abstract-split-button-contribution';

export const DEBUG_TOOLBAR_MENU: MenuPath = ['debug-toolbar', 'debug'];
const DEBUG_REFRESH_DELAY_MS = 600;

@injectable()
export class DebugToolbarContribution extends AbstractSplitButtonContribution<DebugConfiguration> {

    @inject(DebugConfigurationManager)
    protected readonly debugConfigManager: DebugConfigurationManager;
    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;
    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    protected readonly toolbarId = 'task-debug-toolbar-button';
    protected readonly menuPath = DEBUG_TOOLBAR_MENU;
    protected readonly icon = 'bug';
    protected readonly buttonLabel = 'Debug';
    protected readonly offersConfigurations = false;
    protected readonly group = 'navigation';
    protected readonly priority = 1; // Right after the run button
    protected readonly refreshDelayMs = DEBUG_REFRESH_DELAY_MS;
    protected readonly elementId = 'toolbar.debug';

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
        await this.discardDeadDebugTerminals();
        await this.debugSessionManager.start({
            name: config.name,
            configuration: config
        });
    }

    /**
     * Drops debug terminals that are no longer attached to a process.
     *
     * When an adapter asks to run the debuggee in a terminal, Theia reuses any
     * terminal whose title matches and which has no child processes — without
     * checking that it is still attached to one. A terminal restored from a
     * previous page load, or left behind by a session that has ended, passes
     * both tests; reading its `processId` then rejects with "terminal is not
     * started", which the student sees as "Failed to launch debuggee in
     * terminal".
     *
     * Reading `processId` here is the same test, used to decide rather than to
     * fail: a terminal that cannot answer is disposed, so there is nothing
     * stale left to reuse and the adapter gets a fresh one. Only terminals the
     * debugger itself created are considered.
     */
    protected async discardDeadDebugTerminals(): Promise<void> {
        await Promise.all(this.terminalService.all
            .filter(terminal => terminal.kind === 'debug')
            .map(async terminal => {
                try {
                    await terminal.processId;
                } catch {
                    terminal.dispose();
                }
            }));
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
