/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * Whether the files in the workspace outlive the session.
 *
 * `unknown` is what the server answers when it cannot tell, and the IDE shows
 * nothing then: a wrong "Saved workspace" is worse than no entry.
 */
export type WorkspaceMode = 'saved' | 'temporary' | 'unknown';

export const WORKSPACE_MODE_PATH = '/services/eduide/workspace-mode';

export const WorkspaceModeService = Symbol('WorkspaceModeService');

export interface WorkspaceModeService {
    getMode(): Promise<WorkspaceMode>;
}
