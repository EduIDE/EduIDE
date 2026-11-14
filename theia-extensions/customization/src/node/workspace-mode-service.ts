/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { WorkspaceMode, WorkspaceModeService } from '../common/workspace-mode';
import { isOnSeparateVolume } from './mount-check';

@injectable()
export class WorkspaceModeServiceImpl implements WorkspaceModeService {

    async getMode(rootUri: string): Promise<WorkspaceMode> {
        if (new URI(rootUri).scheme !== 'file') {
            return 'unknown';
        }
        const mounted = await isOnSeparateVolume(FileUri.fsPath(rootUri));
        if (mounted === undefined) {
            return 'unknown';
        }
        return mounted ? 'saved' : 'temporary';
    }
}
