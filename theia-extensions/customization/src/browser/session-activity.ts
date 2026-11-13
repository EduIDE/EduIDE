/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

// Kept free of Theia imports so the rules can be tested with plain node.

/** Registered by the theia-cloud-monitor extension; resets the session's inactivity timer. */
export const ACTIVITY_REPORT_COMMAND = 'theia.cloud.monitor.activity.report';

/** Executed by the theia-cloud-monitor extension when it shows its "Are you still here?" dialog. */
export const TIMEOUT_WARNING_COMMAND = 'eduide.session.timeoutWarning';

/** The operator polls every few minutes, so one report per minute loses nothing. */
export const REPORT_INTERVAL_MS = 60_000;

export const WARNING_TITLE_PREFIX = '⚠ Session ends soon - ';

/** Lets at most one activity report through per interval. */
export class ActivityThrottle {
    protected lastReport = Number.NEGATIVE_INFINITY;

    constructor(protected readonly intervalMs = REPORT_INTERVAL_MS) { }

    shouldReport(now: number): boolean {
        if (now - this.lastReport < this.intervalMs) {
            return false;
        }
        this.lastReport = now;
        return true;
    }
}

/**
 * Flips the warning prefix on or off. Works on the current title rather than a saved copy,
 * because Theia rewrites the title whenever the active editor changes.
 */
export function toggleWarningTitle(title: string): string {
    return title.startsWith(WARNING_TITLE_PREFIX) ? title.slice(WARNING_TITLE_PREFIX.length) : WARNING_TITLE_PREFIX + title;
}

export function clearWarningTitle(title: string): string {
    return title.startsWith(WARNING_TITLE_PREFIX) ? title.slice(WARNING_TITLE_PREFIX.length) : title;
}
