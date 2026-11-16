/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

/**
 * Runs `attempt` until it resolves, waiting `delaysMs[i]` after failure `i`.
 * The last failure is rethrown once the delays are used up.
 */
export async function retryWithDelays<T>(
    attempt: () => Promise<T>,
    delaysMs: readonly number[],
    sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
): Promise<T> {
    for (const delay of delaysMs) {
        try {
            return await attempt();
        } catch {
            await sleep(delay);
        }
    }
    return attempt();
}
