/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { URI } from '@theia/core/lib/common/uri';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { STARTUP_FILE_CANDIDATES } from '../common/customization';
import { CustomizationService } from './customization-service';

/**
 * Opens the exercise file on startup while `startup.openFile` is on, so a
 * student lands in code rather than on a Welcome page.
 *
 * Does nothing if an editor is already open: a restored layout is the
 * student's own, and reopening over it would be the tool arguing with them.
 */
@injectable()
export class StartupFileContribution implements FrontendApplicationContribution {

    @inject(CustomizationService)
    protected readonly customization: CustomizationService;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(EditorManager)
    protected readonly editorManager: EditorManager;
    @inject(FileService)
    protected readonly fileService: FileService;
    @inject(ILogger)
    protected readonly logger: ILogger;

    async onDidInitializeLayout(_app: FrontendApplication): Promise<void> {
        if (!this.customization.isEnabled('startup.openFile')) {
            return;
        }
        if (this.editorManager.all.length > 0) {
            return;
        }
        await this.workspaceService.ready;
        const roots = this.workspaceService.tryGetRoots();
        const root = roots[0];
        if (!root) {
            return;
        }
        const target = await this.findFirstExisting(new URI(root.resource.toString()));
        if (!target) {
            return;
        }
        try {
            await this.editorManager.open(target, { mode: 'reveal', preview: false });
        } catch (error) {
            this.logger.warn(`EduIDE customization: could not open '${target.toString()}' on startup`, error);
        }
    }

    protected async findFirstExisting(root: URI): Promise<URI | undefined> {
        for (const candidate of STARTUP_FILE_CANDIDATES) {
            const uri = root.resolve(candidate);
            try {
                if (await this.fileService.exists(uri)) {
                    return uri;
                }
            } catch {
                // A candidate that cannot be probed is simply not the one.
            }
        }
        return undefined;
    }
}
