/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export interface ApplySteps {
    /** Everything the student sees: views, terminals, status bar, menus. */
    showLevel(): Promise<void>;
    /** Tells listeners (the status bar indicator, the Customize panel) the state changed. */
    notify(): void;
    /** Writes the settings. Slow, and nothing on screen depends on it. */
    writePreferences(): Promise<void>;
}

/**
 * One pass of applying the level.
 *
 * The screen comes first and the settings last. A level switch writes dozens of
 * settings one after the other, each a round trip to the settings file, and the
 * student would otherwise watch the old level for as long as that takes (or for
 * good, if one write never answers).
 */
export async function applyOnce(steps: ApplySteps): Promise<void> {
    await steps.showLevel();
    steps.notify();
    await steps.writePreferences();
}

/**
 * Runs `pass` one at a time. A request that arrives while a pass is running is
 * not dropped, it makes the pass run once more, because what changed may have
 * been read before the request came in.
 */
export class ApplyQueue {

    protected running = false;
    protected again = false;

    constructor(protected readonly pass: () => Promise<void>) { }

    async request(): Promise<void> {
        if (this.running) {
            this.again = true;
            return;
        }
        this.running = true;
        try {
            do {
                this.again = false;
                await this.pass();
            } while (this.again);
        } finally {
            this.running = false;
        }
    }
}
