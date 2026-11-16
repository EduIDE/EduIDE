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
 * Whether `dir` lives on a volume of its own: its device differs from the one
 * under `/`.
 *
 * A persistent session mounts its volume on the workspace root (or above it),
 * an ephemeral one has none and stays on the container's root file system.
 * Comparing with `/` rather than with the parent keeps subfolders of a mounted
 * volume working. Answers `undefined` when a stat fails, because "cannot tell"
 * is not the same as "no mount". The path is resolved first, so a symlink is
 * followed to where the files are.
 */
export async function isOnSeparateVolume(dir: string, fs: MountCheckFs = fsPromises): Promise<boolean | undefined> {
    try {
        const resolved = await fs.realpath(dir);
        const [own, root] = await Promise.all([fs.stat(resolved), fs.stat(path.parse(resolved).root)]);
        return own.dev !== root.dev;
    } catch {
        return undefined;
    }
}
