#!/usr/bin/env node

const fs = require('fs');

const args = process.argv.slice(2);
const replaceKeys = new Set();
let positionalArgs = args;

if (args[0] === '--replace-keys') {
    if (!args[1]) {
        console.error('Usage: node scripts/merge-package-json.js [--replace-keys key1,key2] <base> <patch> <output>');
        process.exit(1);
    }
    positionalArgs = args.slice(2);
    for (const key of args[1].split(',').map(part => part.trim()).filter(Boolean)) {
        replaceKeys.add(key);
    }
}

const [basePath, patchPath, outputPath] = positionalArgs;

if (!basePath || !patchPath || !outputPath) {
    console.error('Usage: node scripts/merge-package-json.js [--replace-keys key1,key2] <base> <patch> <output>');
    process.exit(1);
}

const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));

const merged = merge(base, patch);
applyExcludeRemovals(merged, patch);
fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);

function merge(baseValue, patchValue, key = '') {
    if (replaceKeys.has(key)) {
        return isObject(patchValue) ? removeNullEntries(patchValue) : patchValue;
    }

    if (Array.isArray(baseValue) && Array.isArray(patchValue)) {
        if (key === 'theiaPluginsExcludeIds') {
            return Array.from(new Set([...baseValue, ...patchValue]));
        }
        return [...patchValue];
    }

    if (isObject(baseValue) && isObject(patchValue)) {
        const result = { ...baseValue };
        for (const [childKey, childValue] of Object.entries(patchValue)) {
            if (childValue === null) {
                delete result[childKey];
                continue;
            }
            result[childKey] = childKey in baseValue
                ? merge(baseValue[childKey], childValue, childKey)
                : childValue;
        }
        return result;
    }

    return patchValue;
}

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function removeNullEntries(value) {
    if (Array.isArray(value)) {
        return value.map(removeNullEntries);
    }
    if (!isObject(value)) {
        return value;
    }

    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
        if (childValue === null) {
            continue;
        }
        result[childKey] = removeNullEntries(childValue);
    }
    return result;
}

function applyExcludeRemovals(mergedValue, patchValue) {
    if (!isObject(mergedValue) || !isObject(patchValue)) {
        return;
    }

    if (Array.isArray(patchValue.theiaPluginsExcludeIdsRemove) && Array.isArray(mergedValue.theiaPluginsExcludeIds)) {
        const removals = new Set(patchValue.theiaPluginsExcludeIdsRemove);
        mergedValue.theiaPluginsExcludeIds = mergedValue.theiaPluginsExcludeIds.filter(id => !removals.has(id));
    }
    delete mergedValue.theiaPluginsExcludeIdsRemove;

    for (const [childKey, childValue] of Object.entries(patchValue)) {
        if (childKey === 'theiaPluginsExcludeIdsRemove') {
            continue;
        }
        if (childKey in mergedValue) {
            applyExcludeRemovals(mergedValue[childKey], childValue);
        }
    }
}
