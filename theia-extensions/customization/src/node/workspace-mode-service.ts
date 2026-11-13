/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import { WorkspaceMode, WorkspaceModeService } from '../common/workspace-mode';
import { isMountPoint } from './mount-check';

@injectable()
export class WorkspaceModeServiceImpl implements WorkspaceModeService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    async getMode(): Promise<WorkspaceMode> {
        const uri = await this.workspaceServer.getMostRecentlyUsedWorkspace();
        if (!uri) {
            return 'unknown';
        }
        const mounted = await isMountPoint(FileUri.fsPath(uri));
        if (mounted === undefined) {
            return 'unknown';
        }
        return mounted ? 'saved' : 'temporary';
    }
}
