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
import { landingPageUrl } from './landing-page';

test('the landing page is the session host without the instance prefix', () => {
    assert.equal(landingPageUrl('instance.bonn.eduide.aet.cit.tum.de'), 'https://bonn.eduide.aet.cit.tum.de/');
    assert.equal(landingPageUrl('instance.eduide.aet.cit.tum.de'), 'https://eduide.aet.cit.tum.de/');
});

test('hosts without the instance prefix have no landing page', () => {
    assert.equal(landingPageUrl('localhost'), undefined);
    assert.equal(landingPageUrl('127.0.0.1'), undefined);
    assert.equal(landingPageUrl('bonn.eduide.aet.cit.tum.de'), undefined);
    assert.equal(landingPageUrl('my-instance.example.org'), undefined);
    assert.equal(landingPageUrl('instance.'), undefined);
});
