/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { nls } from '@theia/core/lib/common/nls';
import { WORKSPACE_MODE_STATUS_ID } from '../common/customization';
import { retryWithDelays } from '../common/retry';
import { WorkspaceMode, WorkspaceModeService } from '../common/workspace-mode';
import { CustomizationService } from './customization-service';

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

/**
 * Tells the student whether their files outlive the session.
 *
 * The answer comes from the server (a mount check on the workspace root), so
 * it needs no launch parameter and is right for warm sessions and local runs too.
 */
@injectable()
export class WorkspaceModeContribution implements FrontendApplicationContribution {

    @inject(WorkspaceModeService)
    protected readonly workspaceMode: WorkspaceModeService;
    @inject(CustomizationService)
    protected readonly customization: CustomizationService;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(StatusBar)
    protected readonly statusBar: StatusBar;
    @inject(ILogger)
    protected readonly logger: ILogger;

    protected mode: WorkspaceMode = 'unknown';

    onStart(): void {
        this.customization.onDidChange(() => this.update());
        this.workspaceService.onWorkspaceChanged(() => this.refresh());
        this.workspaceService.ready.then(() => this.refresh());
    }

    /** The connection to the server may not be up yet, so a failure is tried again. */
    protected async refresh(): Promise<void> {
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            this.mode = 'unknown';
            this.update();
            return;
        }
        try {
            this.mode = await retryWithDelays(() => this.workspaceMode.getMode(root.resource.toString()), RETRY_DELAYS_MS);
        } catch (error) {
            this.logger.warn('EduIDE customization: could not read the workspace mode', error);
            this.mode = 'unknown';
        }
        this.update();
    }

    protected update(): void {
        if (this.mode === 'unknown' || !this.customization.isEnabled('status.workspaceMode')) {
            this.statusBar.removeElement(WORKSPACE_MODE_STATUS_ID);
            return;
        }
        const saved = this.mode === 'saved';
        this.statusBar.setElement(WORKSPACE_MODE_STATUS_ID, {
            text: saved
                ? `$(save) ${nls.localize('eduide/customization/workspaceSaved', 'Saved workspace')}`
                : `$(warning) ${nls.localize('eduide/customization/workspaceTemporary', 'Temporary workspace')}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 99,
            tooltip: saved
                ? nls.localize('eduide/customization/workspaceSavedTooltip',
                    'Your files survive the end of this session, until the workspace is cleaned up.')
                : nls.localize('eduide/customization/workspaceTemporaryTooltip',
                    'Your files are lost when this session ends. Keep them with Download or git push.'),
            ...(saved ? {} : {
                color: 'var(--theia-statusBarItem-warningForeground)',
                backgroundColor: 'var(--theia-statusBarItem-warningBackground)'
            })
        });
    }
}
