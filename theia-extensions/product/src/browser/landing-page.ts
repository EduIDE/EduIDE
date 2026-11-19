/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

const SESSION_HOST_PREFIX = 'instance.';

/**
 * Every EduIDE installation serves sessions on `instance.<landing host>`,
 * so the landing page is the session host without that prefix.
 * Returns undefined when the IDE does not run on such a host (local runs).
 */
export function landingPageUrl(hostname: string): string | undefined {
    if (!hostname.startsWith(SESSION_HOST_PREFIX) || hostname.length === SESSION_HOST_PREFIX.length) {
        return undefined;
    }
    return `https://${hostname.slice(SESSION_HOST_PREFIX.length)}/`;
}
