/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const PLUGINS_DIR = path.resolve('plugins');
const CACHE_DIR = path.resolve('.plugin-cache');
const CONFIG_FILE = path.resolve('package.json');
const HASH_FILE = path.join(CACHE_DIR, '.plugin-set.hash');

run().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`download:plugins:smart failed: ${message}`);
    process.exit(1);
});

async function run(): Promise<void> {
    await ensureDirectory(CACHE_DIR);

    // The persisted cache is only safe to reuse when it was produced from the
    // exact same plugin set. The cache is keyed by plugin directory name, so a
    // plugin whose version/URL changed under an unchanged key would otherwise be
    // silently reused from the cache. Gate hydration on a hash of the configured
    // plugin set to force a clean download whenever that set changes.
    const desiredHash = await computePluginSetHash();
    const cachedHash = await readCachedHash();
    const cacheIsFresh = cachedHash !== undefined && cachedHash === desiredHash;

    // Always start from a clean build-local plugins/ directory so nothing stale
    // from a cached image layer can survive. The persistent cache mount
    // (.plugin-cache) is never deleted here.
    await resetDirectory(PLUGINS_DIR);

    if (cacheIsFresh) {
        console.log('[download:plugins:smart] Plugin set unchanged; hydrating plugins from cache');
        await hydratePluginsFromCache();
    } else {
        console.log(
            '[download:plugins:smart] Plugin set changed or cache uninitialized ' +
            `(cached=${cachedHash ?? 'none'}, desired=${desiredHash}); ` +
            'skipping hydration to force a clean download'
        );
    }

    console.log('[download:plugins:smart] Running download with retry schedule');
    execSync('yarn download:plugins:retry', { stdio: 'inherit' });

    console.log('[download:plugins:smart] Pruning and syncing cache');
    execSync('yarn plugins:prune-and-sync-cache', { stdio: 'inherit' });

    console.log('[download:plugins:smart] Running second download pass after prune');
    execSync('yarn download:plugins:retry', { stdio: 'inherit' });

    // Mark the cache as matching the current plugin set only after a fully
    // successful build, written atomically so an interrupted build leaves the
    // previous (or no) marker intact and the next build retries a clean download.
    await writeCachedHash(desiredHash);

    console.log('[download:plugins:smart] Success');
}

async function ensureDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function resetDirectory(dir: string): Promise<void> {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
}

async function computePluginSetHash(): Promise<string> {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const config = JSON.parse(raw) as PluginSetConfig;

    const theiaPlugins = config.theiaPlugins ?? {};
    const sortedPlugins = Object.keys(theiaPlugins)
        .sort()
        .map(key => [key, theiaPlugins[key]] as const);
    const sortedExcludes = [...(config.theiaPluginsExcludeIds ?? [])].sort();

    const canonical = JSON.stringify({
        theiaPlugins: sortedPlugins,
        theiaPluginsExcludeIds: sortedExcludes
    });

    return createHash('sha256').update(canonical).digest('hex');
}

async function readCachedHash(): Promise<string | undefined> {
    try {
        const content = await fs.readFile(HASH_FILE, 'utf8');
        const trimmed = content.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    } catch {
        return undefined;
    }
}

async function writeCachedHash(hash: string): Promise<void> {
    const tempFile = `${HASH_FILE}.tmp`;
    await fs.writeFile(tempFile, `${hash}\n`, 'utf8');
    await fs.rename(tempFile, HASH_FILE);
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

interface PluginSetConfig {
    theiaPlugins?: Record<string, string | null>;
    theiaPluginsExcludeIds?: string[];
}
