/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/** The two things of a view container part this needs, so a test can stand in. */
export interface HideablePart {
    readonly partId: string;
    setHidden(hidden: boolean): void;
}

/**
 * Hides parts of a view container (a view inside the Explorer, say) and
 * remembers which ones, so only those come back. A part the student hid
 * themselves is not ours to show again.
 */
export function hideParts(parts: readonly HideablePart[], hiddenByUs: Set<string>): void {
    for (const part of parts) {
        part.setHidden(true);
        hiddenByUs.add(part.partId);
    }
}

export function restoreParts(parts: readonly HideablePart[], hiddenByUs: Set<string>): void {
    for (const part of parts) {
        if (hiddenByUs.delete(part.partId)) {
            part.setHidden(false);
        }
    }
}
