/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import {
    ACTIVITY_REPORT_COMMAND, ActivityThrottle, clearWarningTitle, TIMEOUT_WARNING_COMMAND, toggleWarningTitle
} from './session-activity';

const INPUT_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel'];

/**
 * The session monitor only sees VS Code API events, so typing in the terminal, clicking in the
 * explorer or moving the mouse never counted as activity. This reports any input in the browser
 * tab to the monitor, and blinks the tab title while the monitor warns about an upcoming timeout,
 * so a student watching a lecture in another tab notices it.
 */
@injectable()
export class SessionActivityContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    protected readonly throttle = new ActivityThrottle();
    protected blinkTimer: number | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand({ id: TIMEOUT_WARNING_COMMAND }, { execute: () => this.startWarning() });
    }

    onStart(): void {
        const onInput = () => this.onInput();
        for (const type of INPUT_EVENTS) {
            // Capture phase, so widgets that stop propagation (terminal, editor) are seen too.
            window.addEventListener(type, onInput, { capture: true, passive: true });
        }
    }

    protected onInput(): void {
        this.stopWarning();
        if (this.throttle.shouldReport(Date.now())) {
            // Fails while the monitor is still starting or when it is not installed; the next input retries.
            this.commands.executeCommand(ACTIVITY_REPORT_COMMAND, 'browser input').catch(() => undefined);
        }
    }

    protected startWarning(): void {
        if (this.blinkTimer === undefined) {
            this.blinkTimer = window.setInterval(() => document.title = toggleWarningTitle(document.title), 1000);
        }
    }

    protected stopWarning(): void {
        if (this.blinkTimer !== undefined) {
            window.clearInterval(this.blinkTimer);
            this.blinkTimer = undefined;
            document.title = clearWarningTitle(document.title);
        }
    }
}
