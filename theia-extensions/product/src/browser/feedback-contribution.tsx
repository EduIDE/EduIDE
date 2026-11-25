/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, CommandService } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FeedbackDialog } from './feedback-dialog';
import {
    browserFamily, FEEDBACK_ENABLED_KEY, FEEDBACK_SEND_COMMAND, FeedbackKind, FeedbackPayload, FeedbackSendResult, issueFormUrl
} from './feedback';

export namespace FeedbackCommands {
    export const SEND_FEEDBACK: Command = {
        id: 'eduide.feedback.open',
        category: 'EduIDE',
        label: 'Send Feedback'
    };
}

const STATUS_BAR_ID = 'eduide-feedback';

/**
 * The product version is the tag of the container image, baked in as EDUIDE_IMAGE_TAG
 * (the About dialog shows the same value). Empty for a hand-built image.
 */
export async function productVersion(env: EnvVariablesServer): Promise<string> {
    return (await env.getValue('EDUIDE_IMAGE_TAG'))?.value ?? '';
}

@injectable()
export class FeedbackContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    @inject(ContextKeyService)
    protected readonly contextKeys: ContextKeyService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(EnvVariablesServer)
    protected readonly env: EnvVariablesServer;

    /** Set by the eduide-session extension of the control plane. */
    protected isEnabled(): boolean {
        return this.contextKeys.match(FEEDBACK_ENABLED_KEY);
    }

    onStart(): void {
        this.updateStatusBar();
        this.contextKeys.onDidChange(event => {
            if (event.affects(new Set([FEEDBACK_ENABLED_KEY]))) {
                this.updateStatusBar();
            }
        });
    }

    protected updateStatusBar(): void {
        if (!this.isEnabled()) {
            this.statusBar.removeElement(STATUS_BAR_ID);
            return;
        }
        this.statusBar.setElement(STATUS_BAR_ID, {
            text: '$(feedback)',
            tooltip: 'Send Feedback',
            alignment: StatusBarAlignment.RIGHT,
            priority: 0,
            command: FeedbackCommands.SEND_FEEDBACK.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(FeedbackCommands.SEND_FEEDBACK, {
            isEnabled: () => this.isEnabled(),
            isVisible: () => this.isEnabled(),
            execute: () => this.openDialog()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.HELP, {
            commandId: FeedbackCommands.SEND_FEEDBACK.id,
            label: FeedbackCommands.SEND_FEEDBACK.label,
            when: FEEDBACK_ENABLED_KEY,
            order: '1'
        });
    }

    protected async openDialog(): Promise<void> {
        const installation = window.location.hostname;
        const version = await productVersion(this.env);
        const browser = browserFamily(navigator.userAgent);
        // The server fills in the app definition of the session, so the payload sends none.
        const imageName = (await this.env.getValue('EDUIDE_IMAGE_NAME'))?.value ?? '';
        const dialog = new FeedbackDialog({
            context: { version, appDefinition: '', browser },
            onSent: () => this.messageService.info('Thank you for your feedback!'),
            send: (payload: FeedbackPayload) => this.commandService.executeCommand<FeedbackSendResult>(FEEDBACK_SEND_COMMAND, payload),
            openGithubForm: (kind: FeedbackKind, title: string, description: string) =>
                this.windowService.openNewWindow(issueFormUrl(kind, { installation, version, browser, appDefinition: imageName }, { title, description }), { external: true })
        });
        await dialog.open();
    }
}
