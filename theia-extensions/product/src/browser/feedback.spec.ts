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
import {
    browserFamily, buildPayload, canSend, DESCRIPTION_MAX, issueFormUrl, reportIssueUrl, sendOutcome, TITLE_MAX
} from './feedback';

const form = { kind: 'bug' as const, title: 'Crash', description: 'It crashes', consent: true };

test('the report issue URL carries host name and version, encoded', () => {
    const url = new URL(reportIssueUrl('instance.bonn.eduide.aet.cit.tum.de', '3.0.1 beta&x=1'));
    assert.equal(url.origin + url.pathname, 'https://github.com/EduIDE/EduIDE/issues/new');
    assert.equal(url.searchParams.get('template'), 'bug_report.yml');
    assert.equal(url.searchParams.get('installation'), 'instance.bonn.eduide.aet.cit.tum.de');
    assert.equal(url.searchParams.get('version'), '3.0.1 beta&x=1');
    assert.equal(url.searchParams.has('x'), false);
});

test('empty values are left out of the URL', () => {
    const url = new URL(reportIssueUrl('localhost', ''));
    assert.equal(url.searchParams.has('version'), false);
});

test('the feature form uses its own template and takes title and description', () => {
    const url = new URL(issueFormUrl('feature', { installation: 'h', version: '1' }, { title: 'T', description: 'D' }));
    assert.equal(url.searchParams.get('template'), 'feature_request.yml');
    assert.equal(url.searchParams.get('title'), 'T');
    assert.equal(url.searchParams.get('description'), 'D');
});

test('a long description is cut so the URL stays within 6000 characters', () => {
    const url = issueFormUrl('bug', { installation: 'h', version: '1' }, { title: 'T', description: 'ä&'.repeat(5000) });
    assert.ok(url.length <= 6000, String(url.length));
    assert.ok(new URL(url).searchParams.get('description')?.length ?? 0 > 100);
});

test('browser family has no version and falls back to Other', () => {
    assert.equal(browserFamily('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/140.0'), 'Firefox');
    assert.equal(browserFamily('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0'), 'Edge');
    assert.equal(browserFamily('Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Safari/537.36'), 'Chrome');
    assert.equal(browserFamily('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17 Safari/605'), 'Safari');
    assert.equal(browserFamily('curl/8'), 'Other');
});

test('sending needs consent, a title and a description within the limits', () => {
    assert.equal(canSend(form), true);
    assert.equal(canSend({ ...form, consent: false }), false);
    assert.equal(canSend({ ...form, title: '   ' }), false);
    assert.equal(canSend({ ...form, description: '' }), false);
    assert.equal(canSend({ ...form, title: 'x'.repeat(TITLE_MAX) }), true);
    assert.equal(canSend({ ...form, title: 'x'.repeat(TITLE_MAX + 1) }), false);
    assert.equal(canSend({ ...form, description: 'x'.repeat(DESCRIPTION_MAX) }), true);
    assert.equal(canSend({ ...form, description: 'x'.repeat(DESCRIPTION_MAX + 1) }), false);
});

test('the payload has the agreed shape and trimmed text', () => {
    const context = { version: '3.0.1', appDefinition: '', browser: 'Firefox' };
    assert.deepEqual(buildPayload({ ...form, kind: 'feature', title: ' T ', description: ' D ' }, context), {
        kind: 'feature', title: 'T', description: 'D', context
    });
});

test('a successful result closes the dialog', () => {
    assert.deepEqual(sendOutcome({ ok: true, status: 202 }), { sent: true });
});

test('429 asks to try again later, with the retry time when known', () => {
    const later = sendOutcome({ ok: false, status: 429 });
    assert.equal(later.sent, false);
    assert.match((later as { error: string }).error, /try again later/);
    const timed = sendOutcome({ ok: false, status: 429, retryAfter: 1800 });
    assert.match((timed as { error: string }).error, /30 minute/);
});

test('other failures, and a missing result, point to the GitHub button', () => {
    for (const result of [{ ok: false, status: 502 }, { ok: false, status: 0 }, undefined]) {
        const outcome = sendOutcome(result);
        assert.equal(outcome.sent, false);
        assert.match((outcome as { error: string }).error, /GitHub button/);
    }
});
