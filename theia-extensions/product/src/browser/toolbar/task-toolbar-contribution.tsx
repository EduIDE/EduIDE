import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { nls, MenuPath } from '@theia/core';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { TaskConfigurations } from '@theia/task/lib/browser/task-configurations';
import { TaskConfigurationManager } from '@theia/task/lib/browser/task-configuration-manager';
import { ContributedTaskConfiguration, TaskConfiguration, TaskWatcher } from '@theia/task/lib/common';
import { AbstractSplitButtonContribution } from './abstract-split-button-contribution';

export const TASK_RUN_TOOLBAR_MENU: MenuPath = ['task-toolbar', 'run'];
const TASK_REFRESH_DELAY_MS = 600;

@injectable()
export class TaskToolbarContribution extends AbstractSplitButtonContribution<TaskConfiguration> {

    @inject(TaskService)
    protected readonly taskService: TaskService;
    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;
    @inject(TaskConfigurationManager)
    protected readonly taskConfigurationManager: TaskConfigurationManager;
    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    protected readonly toolbarId = 'task-run-toolbar-button';
    protected readonly menuPath = TASK_RUN_TOOLBAR_MENU;
    protected readonly icon = 'play';
    protected readonly group = 'navigation';
    protected readonly priority = 0;
    protected readonly refreshDelayMs = TASK_REFRESH_DELAY_MS;

    @postConstruct()
    protected init(): void {
        this.taskConfigurationManager.onDidChangeTaskConfig(() => {
            this.refreshConfigurations();
        });

        this.workspaceService.onWorkspaceChanged(async () => {
            await this.workspaceService.ready;
            this.refreshConfigurations();
        });

        this.taskWatcher.onTaskCreated(() => {
            this.refreshConfigurations();
        });

        this.initialize();
    }

    protected async fetchConfigurations(): Promise<TaskConfiguration[]> {
        const token = this.taskService.startUserAction();
        return this.taskConfigurations.getTasks(token);
    }

    protected async executeConfiguration(config: TaskConfiguration): Promise<void> {
        const token = this.taskService.startUserAction();
        const source = (config as ContributedTaskConfiguration)._source;
        await this.taskService.run(token, source, config.label, config._scope);
    }

    protected getConfigurationLabel(config: TaskConfiguration): string {
        return config.label;
    }

    protected getTooltip(config: TaskConfiguration | undefined, hasConfigs: boolean): string {
        if (!hasConfigs) {
            return nls.localize('theia/task-toolbar/noTasks', 'No tasks available');
        }
        if (config) {
            return nls.localize('theia/task-toolbar/runTask', 'Run Task: {0}', config.label);
        }
        return nls.localize('theia/task-toolbar/runTaskDefault', 'Run Task');
    }

    protected getMenuTooltip(): string {
        return nls.localize('theia/task/selectTask', 'Select task to run');
    }

    protected getLastExecutedConfig(): TaskConfiguration | undefined {
        const lastTaskInfo = this.taskService.getLastTask();
        return lastTaskInfo.resolvedTask;
    }
}
