/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityThrottle, clearWarningTitle, toggleWarningTitle, WARNING_TITLE_PREFIX } from './session-activity';

test('the first input is reported, the rest of the minute is not', () => {
    const throttle = new ActivityThrottle(60_000);
    assert.equal(throttle.shouldReport(1_000), true);
    assert.equal(throttle.shouldReport(30_000), false);
    assert.equal(throttle.shouldReport(60_999), false);
    assert.equal(throttle.shouldReport(61_000), true);
});

test('after a failed report the next input reports again', () => {
    const throttle = new ActivityThrottle(60_000);
    assert.equal(throttle.shouldReport(1_000), true);
    // While a report is in flight, further input does not start another one.
    assert.equal(throttle.shouldReport(2_000), false);
    throttle.release();
    assert.equal(throttle.shouldReport(3_000), true);
});

test('the warning prefix blinks on and off', () => {
    const on = toggleWarningTitle('Main.java - EduIDE');
    assert.equal(on, WARNING_TITLE_PREFIX + 'Main.java - EduIDE');
    assert.equal(toggleWarningTitle(on), 'Main.java - EduIDE');
});

test('clearing the warning keeps a title Theia changed in the meantime', () => {
    assert.equal(clearWarningTitle(WARNING_TITLE_PREFIX + 'Other.java - EduIDE'), 'Other.java - EduIDE');
    assert.equal(clearWarningTitle('Other.java - EduIDE'), 'Other.java - EduIDE');
});
