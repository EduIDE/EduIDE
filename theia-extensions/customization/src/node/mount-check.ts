/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { promises as fsPromises } from 'fs';
import * as path from 'path';

/** The two `fs` calls the check needs, so a test can stand in for the disk. */
export interface MountCheckFs {
    realpath(target: string): Promise<string>;
    stat(target: string): Promise<{ dev: number }>;
}

/**
 * Whether `dir` is a mount point: it sits on a different device than its parent.
 *
 * A persistent session mounts its volume on the workspace root, an ephemeral
 * one has none. Answers `undefined` when a stat fails, because "cannot tell" is
 * not the same as "no mount". The path is resolved first, so a symlinked root
 * is compared with the parent of its target.
 */
export async function isMountPoint(dir: string, fs: MountCheckFs = fsPromises): Promise<boolean | undefined> {
    try {
        const resolved = await fs.realpath(dir);
        const [own, parent] = await Promise.all([fs.stat(resolved), fs.stat(path.dirname(resolved))]);
        return own.dev !== parent.dev;
    } catch {
        return undefined;
    }
}
