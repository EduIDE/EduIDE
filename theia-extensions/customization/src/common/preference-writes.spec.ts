/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { test } from 'node:test';
import * as assert from 'node:assert';
import { ELEMENT_CATALOGUE, ELEMENTS_BY_ID } from './customization';
import { planPreferenceWrites, PreferenceWriteContext } from './preference-writes';

function context(level: string, user: Record<string, unknown> = {}, overrides: Record<string, boolean> = {}): PreferenceWriteContext {
    return {
        catalogue: ELEMENT_CATALOGUE,
        level,
        isOverridden: id => id in overrides,
        isEnabled: id => id in overrides ? overrides[id] : ELEMENTS_BY_ID.get(id)!.defaults[level as 'beginner']!,
        readUser: key => user[key]
    };
}

const asMap = (writes: { key: string; value: unknown }[]) => new Map(writes.map(write => [write.key, write.value]));

test('every code action written for "off" is falsy, as Theia runs any truthy entry on save', () => {
    for (const element of ELEMENT_CATALOGUE) {
        const off = element.preferences?.off?.['editor.codeActionsOnSave'] as Record<string, unknown> | undefined;
        for (const [action, value] of Object.entries(off ?? {})) {
            assert.ok(!value, `${element.id}: ${action}`);
        }
        const on = element.preferences?.on?.['editor.codeActionsOnSave'] as Record<string, unknown> | undefined;
        for (const [action, value] of Object.entries(on ?? {})) {
            assert.strictEqual(typeof value, 'boolean', `${element.id}: ${action}`);
        }
    }
});

test('the code action entry is merged into the existing value, not replacing it', () => {
    const writes = asMap(planPreferenceWrites(context('beginner', { 'editor.codeActionsOnSave': { 'source.fixAll.ruff': true } })));
    assert.deepStrictEqual(writes.get('editor.codeActionsOnSave'), { 'source.fixAll.ruff': true, 'source.organizeImports': true });
});

test('expert writes nothing and an empty User scope stays empty', () => {
    assert.deepStrictEqual(planPreferenceWrites(context('expert')), []);
});

test('expert takes back what a level wrote, keeps what the student changed, and leaves other keys alone', () => {
    const user = {
        'editor.minimap.enabled': true,
        'editor.formatOnSave': true,
        'editor.tabSize': 2,
        'editor.stickyScroll.enabled': 'custom',
        'editor.codeActionsOnSave': { 'source.organizeImports': true, 'source.fixAll.ruff': true }
    };
    const writes = asMap(planPreferenceWrites(context('expert', user)));
    assert.ok(writes.has('editor.minimap.enabled') && writes.get('editor.minimap.enabled') === undefined);
    assert.ok(writes.has('editor.formatOnSave') && writes.get('editor.formatOnSave') === undefined);
    assert.deepStrictEqual(writes.get('editor.codeActionsOnSave'), { 'source.fixAll.ruff': true });
    assert.ok(!writes.has('editor.tabSize'));
    assert.ok(!writes.has('editor.stickyScroll.enabled'));
});

test('an override still applies at expert', () => {
    const writes = asMap(planPreferenceWrites(context('expert', {}, { 'editor.minimap': false })));
    assert.strictEqual(writes.get('editor.minimap.enabled'), false);
    assert.strictEqual(writes.size, 1);
});

test('a value that is already in place is not written again', () => {
    const writes = planPreferenceWrites(context('beginner', { 'editor.formatOnSave': true }));
    assert.ok(!writes.some(write => write.key === 'editor.formatOnSave'));
});
