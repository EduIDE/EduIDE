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
import { hideParts, restoreParts } from './part-visibility';

interface FakePart {
    readonly partId: string;
    hidden: boolean;
    readonly isHidden: boolean;
    setHidden(hidden: boolean): void;
}

function part(partId: string): FakePart {
    return { partId, hidden: false, get isHidden(): boolean { return this.hidden; }, setHidden(hidden: boolean): void { this.hidden = hidden; } };
}

test('a part we hid comes back', () => {
    const maven = part('maven');
    const ours = new Set<string>();
    hideParts([maven], ours);
    assert.strictEqual(maven.hidden, true);
    restoreParts([maven], ours);
    assert.strictEqual(maven.hidden, false);
});

test('a part the student hid is not shown again', () => {
    const maven = part('maven');
    maven.hidden = true;
    restoreParts([maven], new Set());
    assert.strictEqual(maven.hidden, true);
});

test('a part the student had already hidden is not claimed, so it stays hidden', () => {
    const maven = part('maven');
    maven.hidden = true;
    const ours = new Set<string>();
    hideParts([maven], ours);
    restoreParts([maven], ours);
    assert.strictEqual(maven.hidden, true);
});
