/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackContext {
    version: string;
    appDefinition: string;
    browser: string;
}

export interface FeedbackPayload {
    kind: FeedbackKind;
    title: string;
    description: string;
    context: FeedbackContext;
}

/** What the command `eduide.feedback.send` of the eduide-session extension resolves to. */
export interface FeedbackSendResult {
    ok: boolean;
    status: number;
    retryAfter?: number;
}

export const FEEDBACK_ENABLED_KEY = 'eduide.feedbackEnabled';
export const FEEDBACK_SEND_COMMAND = 'eduide.feedback.send';
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 5000;

const ISSUES_NEW_URL = 'https://github.com/EduIDE/EduIDE/issues/new';
const TEMPLATES: Record<FeedbackKind, string> = { bug: 'bug_report.yml', feature: 'feature_request.yml' };
// Browsers and proxies start to refuse URLs beyond a few thousand characters.
const MAX_URL_LENGTH = 6000;

/**
 * URL of the GitHub issue form with the technical context prefilled.
 * It only gets the host name, never the full location: the path holds the session.
 * The description is cut so the whole URL stays below MAX_URL_LENGTH.
 */
export function issueFormUrl(
    kind: FeedbackKind,
    context: { installation: string; version: string },
    text: { title?: string; description?: string } = {}
): string {
    const build = (cut: string) => {
        const params = new URLSearchParams({ template: TEMPLATES[kind] });
        const values: Record<string, string> = {
            installation: context.installation,
            version: context.version,
            title: text.title ?? '',
            description: cut
        };
        for (const [key, value] of Object.entries(values)) {
            if (value) {
                params.set(key, value);
            }
        }
        return `${ISSUES_NEW_URL}?${params.toString()}`;
    };
    const full = text.description ?? '';
    // Percent-encoding makes the length depend on the characters, so search the longest prefix that fits.
    let low = 0;
    let high = full.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (build(full.slice(0, mid)).length <= MAX_URL_LENGTH) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return build(full.slice(0, low));
}

export function reportIssueUrl(installation: string, version: string): string {
    return issueFormUrl('bug', { installation, version });
}

/** Browser family only, no version: it is enough for triage and fingerprints less. */
export function browserFamily(userAgent: string): string {
    const families: Array<[RegExp, string]> = [
        [/Edg\//, 'Edge'],
        [/OPR\/|Opera/, 'Opera'],
        [/Firefox\//, 'Firefox'],
        [/Chrome\/|Chromium\/|CriOS\//, 'Chrome'],
        [/Safari\//, 'Safari']
    ];
    return families.find(([pattern]) => pattern.test(userAgent))?.[1] ?? 'Other';
}

export interface FeedbackForm {
    kind: FeedbackKind;
    title: string;
    description: string;
    consent: boolean;
}

export function isTextValid(text: string, max: number): boolean {
    const length = text.trim().length;
    return length >= 1 && length <= max;
}

export function canSend(form: FeedbackForm): boolean {
    return form.consent && isTextValid(form.title, TITLE_MAX) && isTextValid(form.description, DESCRIPTION_MAX);
}

export function buildPayload(form: FeedbackForm, context: FeedbackContext): FeedbackPayload {
    return {
        kind: form.kind,
        title: form.title.trim(),
        description: form.description.trim(),
        context: { ...context }
    };
}

export type SendOutcome = { sent: true } | { sent: false; error: string };

export function sendOutcome(result: FeedbackSendResult | undefined): SendOutcome {
    if (result?.ok) {
        return { sent: true };
    }
    if (result?.status === 429) {
        const wait = result.retryAfter && result.retryAfter > 0
            ? ` in about ${Math.max(1, Math.ceil(result.retryAfter / 60))} minute(s)`
            : ' later';
        return { sent: false, error: `You sent a lot of feedback recently. Please try again${wait}.` };
    }
    return { sent: false, error: 'Sending failed. Please use the GitHub button instead; your text is kept.' };
}
