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
import { ILogger } from '@theia/core/lib/common/logger';
import { nls } from '@theia/core/lib/common/nls';
import { WORKSPACE_MODE_STATUS_ID } from '../common/customization';
import { WorkspaceMode, WorkspaceModeService } from '../common/workspace-mode';
import { CustomizationService } from './customization-service';

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
    @inject(StatusBar)
    protected readonly statusBar: StatusBar;
    @inject(ILogger)
    protected readonly logger: ILogger;

    protected mode: WorkspaceMode = 'unknown';

    onStart(): void {
        this.customization.onDidChange(() => this.update());
        this.workspaceMode.getMode().then(mode => {
            this.mode = mode;
            this.update();
        }).catch(error => this.logger.warn('EduIDE customization: could not read the workspace mode', error));
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
