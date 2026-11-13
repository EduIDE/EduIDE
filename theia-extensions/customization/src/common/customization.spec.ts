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
import { ELEMENT_CATALOGUE, ELEMENTS_BY_ID, EduIdeLevel, WORKSPACE_MODE_STATUS_ID } from './customization';

function defaults(id: string): EduIdeLevel[] {
    const element = ELEMENTS_BY_ID.get(id);
    assert.ok(element, `missing element ${id}`);
    return (['beginner', 'advanced', 'expert'] as const).filter(level => element.defaults[level]);
}

test('element ids are unique', () => {
    assert.strictEqual(ELEMENTS_BY_ID.size, ELEMENT_CATALOGUE.length);
});

test('view.artemis no longer matches scorpio, which contributes no view', () => {
    const views = ELEMENTS_BY_ID.get('view.artemis')?.views ?? [];
    assert.deepStrictEqual(views.map(view => view.id), ['artemis']);
});

test('view.maven starts where view.gradle does and matches the Maven projects view', () => {
    assert.deepStrictEqual(defaults('view.maven'), defaults('view.gradle'));
    assert.deepStrictEqual(ELEMENTS_BY_ID.get('view.maven')?.views, [{ id: 'mavenProjects', area: 'left', match: 'includes' }]);
});

test('the existing editor elements carry the keys of every language image', () => {
    const keys = (id: string) => Object.keys(ELEMENTS_BY_ID.get(id)?.preferences?.on ?? {});
    assert.ok(keys('editor.organizeImportsOnSave').includes('editor.codeActionsOnSave'));
    assert.ok(keys('editor.referencesCodeLens').includes('typescript.referencesCodeLens.enabled'));
    assert.ok(keys('editor.referencesCodeLens').includes('rust-analyzer.lens.references.method.enable'));
    assert.ok(keys('editor.runDebugCodeLens').includes('rust-analyzer.lens.run.enable'));
    assert.ok(keys('editor.runDebugCodeLens').includes('go.enableCodeLens'));
});

test('on and off write the same keys, so flipping an element never leaves one behind', () => {
    for (const element of ELEMENT_CATALOGUE) {
        if (element.preferences) {
            assert.deepStrictEqual(
                Object.keys(element.preferences.on ?? {}).sort(),
                Object.keys(element.preferences.off ?? {}).sort(),
                element.id
            );
        }
    }
});

test('spell check is quiet for beginners, stock information otherwise', () => {
    const { defaults: levels, preferences } = ELEMENTS_BY_ID.get('diag.spellcheck')!;
    assert.deepStrictEqual(levels, { beginner: true, advanced: false, expert: false });
    assert.strictEqual(preferences?.on?.['cSpell.diagnosticLevel'], 'Hint');
    assert.strictEqual(preferences?.off?.['cSpell.diagnosticLevel'], 'Information');
});

test('type checking and clippy start at Advanced and fall back to the stock value', () => {
    assert.deepStrictEqual(defaults('diag.typeCheck'), ['advanced']);
    assert.strictEqual(ELEMENTS_BY_ID.get('diag.typeCheck')?.preferences?.on?.['python.analysis.typeCheckingMode'], 'basic');
    assert.strictEqual(ELEMENTS_BY_ID.get('diag.typeCheck')?.preferences?.off?.['python.analysis.typeCheckingMode'], 'off');
    assert.deepStrictEqual(defaults('diag.clippy'), ['advanced']);
    assert.strictEqual(ELEMENTS_BY_ID.get('diag.clippy')?.preferences?.on?.['rust-analyzer.check.command'], 'clippy');
    assert.strictEqual(ELEMENTS_BY_ID.get('diag.clippy')?.preferences?.off?.['rust-analyzer.check.command'], 'check');
});

test('linters and the workspace mode entry are on at every level', () => {
    assert.deepStrictEqual(defaults('diag.lint'), ['beginner', 'advanced', 'expert']);
    assert.deepStrictEqual(defaults('status.workspaceMode'), ['beginner', 'advanced', 'expert']);
    assert.deepStrictEqual(ELEMENTS_BY_ID.get('status.workspaceMode')?.statusBarItems, [WORKSPACE_MODE_STATUS_ID]);
});

test('view.livePreview is listed but pending, since it has nothing to manage', () => {
    assert.ok(ELEMENTS_BY_ID.get('view.livePreview')?.pending);
});
