/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

const PLUGINS_DIR = path.resolve('plugins');
const CACHE_DIR = path.resolve('.plugin-cache');

run().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`download:plugins:smart failed: ${message}`);
    process.exit(1);
});

async function run(): Promise<void> {
    await ensureDirectory(PLUGINS_DIR);
    await ensureDirectory(CACHE_DIR);

    console.log('[download:plugins:smart] Hydrating plugins from cache');
    await hydratePluginsFromCache();

    console.log('[download:plugins:smart] Running download with retry schedule');
    execSync('yarn download:plugins:retry', { stdio: 'inherit' });

    console.log('[download:plugins:smart] Pruning and syncing cache');
    execSync('yarn plugins:prune-and-sync-cache', { stdio: 'inherit' });

    console.log('[download:plugins:smart] Running second download pass after prune');
    execSync('yarn download:plugins:retry', { stdio: 'inherit' });

    console.log('[download:plugins:smart] Success');
}

async function ensureDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function hydratePluginsFromCache(): Promise<void> {
    const cacheEntries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    for (const entry of cacheEntries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const from = path.join(CACHE_DIR, entry.name);
        const to = path.join(PLUGINS_DIR, entry.name);

        // If plugin already exists from current build context, keep it.
        try {
            await fs.access(to);
            continue;
        } catch {
            // fall through
        }

        await fs.cp(from, to, { recursive: true, force: true });
    }
}
