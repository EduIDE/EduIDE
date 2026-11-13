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
import { isMountPoint, MountCheckFs } from './mount-check';

function fakeFs(devices: Record<string, number>, links: Record<string, string> = {}): MountCheckFs {
    return {
        realpath: async target => links[target] ?? target,
        stat: async target => {
            if (!(target in devices)) {
                throw new Error(`ENOENT: ${target}`);
            }
            return { dev: devices[target] };
        }
    };
}

test('a directory on another device than its parent is a mount point', async () => {
    assert.strictEqual(await isMountPoint('/home/project', fakeFs({ '/home/project': 2, '/home': 1 })), true);
});

test('a directory on the same device as its parent is not', async () => {
    assert.strictEqual(await isMountPoint('/home/project', fakeFs({ '/home/project': 1, '/home': 1 })), false);
});

test('a symlinked root is compared with the parent of its target', async () => {
    const fs = fakeFs({ '/data/ws': 2, '/data': 1, '/home': 2 }, { '/home/project': '/data/ws' });
    assert.strictEqual(await isMountPoint('/home/project', fs), true);
});

test('a failed stat is unknown, not "no mount"', async () => {
    assert.strictEqual(await isMountPoint('/home/project', fakeFs({ '/home': 1 })), undefined);
});
