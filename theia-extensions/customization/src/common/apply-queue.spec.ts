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
import { ApplyQueue, applyOnce } from './apply-queue';

test('the screen is updated and listeners told before the settings are written', async () => {
    const calls: string[] = [];
    // Settings that never finish writing must not hold the screen back.
    const pending = applyOnce({
        showLevel: async () => { calls.push('show'); },
        notify: () => { calls.push('notify'); },
        writePreferences: () => new Promise<void>(() => calls.push('write'))
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls, ['show', 'notify', 'write']);
    void pending;
});

test('a request during a pass runs it again instead of being dropped', async () => {
    let runs = 0;
    let release!: () => void;
    const queue = new ApplyQueue(async () => {
        if (++runs === 1) {
            await new Promise<void>(resolve => { release = resolve; });
        }
    });
    const first = queue.request();
    await queue.request();
    release();
    await first;
    assert.strictEqual(runs, 2);
});

test('requests made one after the other each get a pass', async () => {
    let runs = 0;
    const queue = new ApplyQueue(async () => { runs++; });
    await queue.request();
    await queue.request();
    assert.strictEqual(runs, 2);
});
