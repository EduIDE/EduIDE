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
import { retryWithDelays } from './retry';

test('retries with the given delays until it succeeds', async () => {
    const slept: number[] = [];
    let calls = 0;
    const result = await retryWithDelays(async () => {
        if (++calls < 3) {
            throw new Error('not yet');
        }
        return 'ok';
    }, [10, 20, 30], async ms => { slept.push(ms); });
    assert.strictEqual(result, 'ok');
    assert.deepStrictEqual(slept, [10, 20]);
});

test('rethrows the last failure when the delays run out', async () => {
    await assert.rejects(retryWithDelays(async () => { throw new Error('down'); }, [1, 1], async () => undefined), /down/);
});
