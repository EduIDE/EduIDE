/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { CustomizableElement } from './customization';

export interface PreferenceWrite {
    readonly key: string;
    /** `undefined` clears the value from the User scope. */
    readonly value: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && !!value && !Array.isArray(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => key in b && deepEqual(a[key], b[key]));
    }
    return false;
}

/**
 * The value to store so `wanted` holds. Objects are merged into what the
 * student already has, so an entry we do not manage (say `source.fixAll.ruff`
 * under `editor.codeActionsOnSave`) survives.
 */
export function mergeValue(current: unknown, wanted: unknown): unknown {
    return isPlainObject(current) && isPlainObject(wanted) ? { ...current, ...wanted } : wanted;
}

/**
 * What is left of `current` once the part we would have written is taken out.
 * Only what equals `written` goes: a value the student changed since stays.
 * `undefined` means nothing is left, so the key can be cleared.
 */
export function withoutValue(current: unknown, written: unknown): unknown {
    if (isPlainObject(current) && isPlainObject(written)) {
        const rest = { ...current };
        for (const [key, value] of Object.entries(written)) {
            if (deepEqual(rest[key], value)) {
                delete rest[key];
            }
        }
        return Object.keys(rest).length === 0 ? undefined : rest;
    }
    return deepEqual(current, written) ? undefined : current;
}

export interface PreferenceWriteContext {
    readonly catalogue: readonly CustomizableElement[];
    /** Whether the element is on, overrides included. */
    isEnabled(elementId: string): boolean;
    isOverridden(elementId: string): boolean;
    readonly level: string;
    /** The value in the User scope, which is where this extension writes. */
    readUser(key: string): unknown;
}

/**
 * The writes that bring the User scope in line with the catalogue.
 *
 * Expert is EduIDE with nothing applied: an element without an override of its
 * own writes nothing there, and what an earlier level wrote is taken back out.
 * The clearing is limited to keys the catalogue manages, and to values equal to
 * the ones it writes, so a setting the student made themselves to something
 * else is left alone. A write that would change nothing is skipped.
 */
export function planPreferenceWrites(context: PreferenceWriteContext): PreferenceWrite[] {
    const writes: PreferenceWrite[] = [];
    for (const element of context.catalogue) {
        if (element.pending || !element.preferences) {
            continue;
        }
        if (context.level === 'expert' && !context.isOverridden(element.id)) {
            const managed = new Set([...Object.keys(element.preferences.on ?? {}), ...Object.keys(element.preferences.off ?? {})]);
            for (const key of managed) {
                const current = context.readUser(key);
                if (current === undefined) {
                    continue;
                }
                let rest = withoutValue(current, element.preferences.on?.[key]);
                if (rest !== undefined) {
                    rest = withoutValue(rest, element.preferences.off?.[key]);
                }
                if (!deepEqual(rest, current)) {
                    writes.push({ key, value: rest });
                }
            }
            continue;
        }
        const values = context.isEnabled(element.id) ? element.preferences.on : element.preferences.off;
        for (const [key, value] of Object.entries(values ?? {})) {
            const current = context.readUser(key);
            const next = mergeValue(current, value);
            if (!deepEqual(next, current)) {
                writes.push({ key, value: next });
            }
        }
    }
    return writes;
}
