/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { promises as fs } from 'fs';
import * as path from 'path';

const PLUGINS_DIR = path.resolve('plugins');
const CACHE_DIR = path.resolve('.plugin-cache');

run().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`plugins:prune-and-sync-cache failed: ${message}`);
    process.exit(1);
});

async function run(): Promise<void> {
    const config = await readBuildConfig();
    const excluded = new Set(config.theiaPluginsExcludeIds ?? []);

    await ensureDirectory(PLUGINS_DIR);
    await ensureDirectory(CACHE_DIR);

    const pluginIndex = await indexPlugins(PLUGINS_DIR);
    const configuredRoots: string[] = [];
    const unresolvedRoots: string[] = [];
    for (const [configuredId, downloadUrl] of Object.entries(config.theiaPlugins ?? {})) {
        if (excluded.has(configuredId)) {
            continue;
        }

        if (typeof downloadUrl !== 'string' || downloadUrl.length === 0) {
            unresolvedRoots.push(configuredId);
            continue;
        }

        const resolved = resolvePluginRootId(configuredId, downloadUrl, pluginIndex);
        if (resolved) {
            configuredRoots.push(resolved);
        } else {
            unresolvedRoots.push(configuredId);
        }
    }

    if (unresolvedRoots.length > 0) {
        console.warn(
            `[plugins:prune-and-sync-cache] Could not resolve configured plugin roots: ${unresolvedRoots.join(', ')}. ` +
            'Falling back to conservative keep-all mode to avoid pruning required plugins.'
        );
    }

    const keep = unresolvedRoots.length > 0
        ? new Set(Array.from(pluginIndex.keys()).filter(id => !excluded.has(id)))
        : await resolveDependencyClosure(configuredRoots, pluginIndex, excluded);

    // Safety net: if closure resolution failed for some reason, do not prune everything.
    if (keep.size === 0 && configuredRoots.length > 0) {
        throw new Error('Resolved keep set is empty while configured roots are present; aborting prune');
    }

    const removed = await prunePlugins(pluginIndex, keep);
    await syncPluginsToCache(pluginIndex, keep);

    console.log(
        `[plugins:prune-and-sync-cache] roots=${configuredRoots.length} indexed=${pluginIndex.size} keep=${keep.size} removed=${removed.length}`
    );
}

async function readBuildConfig(): Promise<BuildConfig> {
    const raw = await fs.readFile(path.resolve('package.json'), 'utf8');
    return JSON.parse(raw) as BuildConfig;
}

async function ensureDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
}

async function indexPlugins(rootDir: string): Promise<Map<string, PluginInfo>> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const map = new Map<string, PluginInfo>();

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const dirName = entry.name;
        const pluginPath = path.join(rootDir, dirName);
        const packageJsonPath = await findPackageJson(pluginPath);
        if (!packageJsonPath) {
            continue;
        }

        const packageRaw = await fs.readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageRaw) as PluginPackageJson;
        const pluginId = packageJson.name ?? dirName;

        if (map.has(pluginId)) {
            console.warn(`[plugins:prune-and-sync-cache] Duplicate pluginId '${pluginId}' found at '${dirName}', keeping first indexed directory.`);
            continue;
        }

        map.set(pluginId, {
            id: pluginId,
            dirName,
            absolutePath: pluginPath,
            extensionPack: packageJson.extensionPack ?? [],
            extensionDependencies: packageJson.extensionDependencies ?? []
        });
    }

    return map;
}

function resolvePluginRootId(configuredId: string, downloadUrl: string, pluginIndex: Map<string, PluginInfo>): string | undefined {
    if (pluginIndex.has(configuredId)) {
        return configuredId;
    }

    const byDirectoryMatch = Array.from(pluginIndex.values()).find(plugin => plugin.dirName === configuredId);
    if (byDirectoryMatch) {
        return byDirectoryMatch.id;
    }

    const derivedVsixId = deriveIdFromVsixUrl(downloadUrl);
    if (derivedVsixId && pluginIndex.has(derivedVsixId)) {
        return derivedVsixId;
    }

    if (configuredId === 'vscode-builtin-extensions') {
        const builtinAliases = [
            'builtin-extension-pack',
            'eclipse-theia.builtin-extension-pack',
            'vscode.builtin-extension-pack'
        ];
        for (const alias of builtinAliases) {
            if (pluginIndex.has(alias)) {
                return alias;
            }
        }

        const heuristic = Array.from(pluginIndex.values())
            .filter(plugin => plugin.id.includes('builtin') && plugin.extensionPack.length > 20)
            .sort((a, b) => b.extensionPack.length - a.extensionPack.length)[0];
        if (heuristic) {
            return heuristic.id;
        }
    }

    // Support shorthand roots that are only delivery containers (for example tar bundles)
    // by matching indexed plugin IDs that end with the configured ID.
    const suffixMatches = Array.from(pluginIndex.keys()).filter(id => id.endsWith(`.${configuredId}`) || id === configuredId);
    if (suffixMatches.length === 1) {
        return suffixMatches[0];
    }

    return undefined;
}

function deriveIdFromVsixUrl(url: string): string | undefined {
    const cleanUrl = url.split('?')[0].split('#')[0];
    if (!cleanUrl.endsWith('.vsix')) {
        return undefined;
    }
    const fileName = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
    const withoutExt = fileName.replace(/\.vsix$/, '');
    const match = withoutExt.match(/^(.*)-\d+\.\d+.*$/);
    if (!match || !match[1]) {
        return undefined;
    }
    return match[1];
}

async function resolveDependencyClosure(
    roots: string[],
    pluginIndex: Map<string, PluginInfo>,
    excludedIds: Set<string>
): Promise<Set<string>> {
    const keep = new Set<string>();
    const queue = [...roots];

    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || keep.has(id) || excludedIds.has(id)) {
            continue;
        }

        const plugin = pluginIndex.get(id);
        if (!plugin) {
            continue;
        }

        keep.add(id);

        for (const dep of plugin.extensionPack) {
            if (!excludedIds.has(dep)) {
                queue.push(dep);
            }
        }
        for (const dep of plugin.extensionDependencies) {
            if (!excludedIds.has(dep)) {
                queue.push(dep);
            }
        }
    }

    return keep;
}

async function prunePlugins(pluginIndex: Map<string, PluginInfo>, keep: Set<string>): Promise<string[]> {
    const removed: string[] = [];
    for (const [id, plugin] of pluginIndex.entries()) {
        if (!keep.has(id)) {
            await fs.rm(plugin.absolutePath, { recursive: true, force: true });
            removed.push(plugin.dirName);
        }
    }
    return removed;
}

async function syncPluginsToCache(pluginIndex: Map<string, PluginInfo>, keep: Set<string>): Promise<void> {
    const pluginIdByDirName = new Map(Array.from(pluginIndex.values()).map(plugin => [plugin.dirName, plugin.id]));

    // Purge cache entries not in keep set
    const cacheEntries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    for (const entry of cacheEntries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const cachePath = path.join(CACHE_DIR, entry.name);
        const pluginId = pluginIdByDirName.get(entry.name);
        if (!pluginId || !keep.has(pluginId)) {
            await fs.rm(cachePath, { recursive: true, force: true });
        }
    }

    // Refresh cache with current keep set (exact plugin content)
    for (const id of keep) {
        const plugin = pluginIndex.get(id);
        if (!plugin) {
            continue;
        }
        const destination = path.join(CACHE_DIR, plugin.dirName);
        await fs.rm(destination, { recursive: true, force: true });
        await fs.cp(plugin.absolutePath, destination, { recursive: true, force: true });
    }
}

async function findPackageJson(dir: string): Promise<string | undefined> {
    const direct = path.join(dir, 'package.json');
    if (await exists(direct)) {
        return direct;
    }

    const extensionPath = path.join(dir, 'extension', 'package.json');
    if (await exists(extensionPath)) {
        return extensionPath;
    }

    return undefined;
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

interface BuildConfig {
    theiaPlugins?: Record<string, string>;
    theiaPluginsExcludeIds?: string[];
}

interface PluginPackageJson {
    name?: string;
    extensionPack?: string[];
    extensionDependencies?: string[];
}

interface PluginInfo {
    id: string;
    dirName: string;
    absolutePath: string;
    extensionPack: string[];
    extensionDependencies: string[];
}
