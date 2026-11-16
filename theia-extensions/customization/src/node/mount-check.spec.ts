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
import { isOnSeparateVolume, MountCheckFs } from './mount-check';

import * as os from 'os';
import * as fs from 'fs';

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

test('a directory on another device than the root is on a separate volume', async () => {
    assert.strictEqual(await isOnSeparateVolume('/home/project', fakeFs({ '/home/project': 2, '/': 1, '/home': 1 })), true);
});

test('a subfolder of a mounted volume counts too, though its parent shares the volume', async () => {
    const devices = { '/home/project/persisted': 2, '/home/project': 2, '/': 1 };
    assert.strictEqual(await isOnSeparateVolume('/home/project/persisted', fakeFs(devices)), true);
});

test('a directory on the root device is not', async () => {
    assert.strictEqual(await isOnSeparateVolume('/home/project', fakeFs({ '/home/project': 1, '/': 1 })), false);
});

test('a symlink is followed to where the files are', async () => {
    const devices = { '/data/ws': 2, '/': 1, '/home/project': 1 };
    assert.strictEqual(await isOnSeparateVolume('/home/project', fakeFs(devices, { '/home/project': '/data/ws' })), true);
});

test('a failed stat is unknown, not "no mount"', async () => {
    assert.strictEqual(await isOnSeparateVolume('/home/project', fakeFs({ '/': 1 })), undefined);
});

test('on the real file system: the root is never separate, a missing path is unknown', async () => {
    assert.strictEqual(await isOnSeparateVolume('/'), false);
    assert.strictEqual(await isOnSeparateVolume(`${os.tmpdir()}/eduide-does-not-exist-${process.pid}`), undefined);
    // Whether the temp dir is its own mount depends on the machine, so only
    // the agreement with a direct stat is asserted.
    const expected = fs.statSync(fs.realpathSync(os.tmpdir())).dev !== fs.statSync('/').dev;
    assert.strictEqual(await isOnSeparateVolume(os.tmpdir()), expected);
});
