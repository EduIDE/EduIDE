/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core/lib/common/nls';
import { Widget } from '@theia/core/lib/browser';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EditorWidget } from '@theia/editor/lib/browser';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { CustomizationService } from './customization-service';

export namespace SubmitCommands {
    export const SUBMIT: Command = {
        id: 'eduide.submit',
        category: 'EduIDE',
        label: 'Submit to Artemis'
    };
}

const PUSH_COMMAND = 'git.push';

/**
 * One button that stages, commits and pushes.
 *
 * Artemis grades what is pushed, and nothing in the image offers a way to push:
 * Scorpio clones the exercise and sets the git identity, the Artemis view logs
 * in and chats. So below expert, where the Source Control view is hidden, this
 * is the only route back to Artemis and it has to work or say why it did not.
 *
 * Committing goes through the SCM model rather than a shell: the repository's
 * own `acceptInputCommand` is whatever the git extension registered, so we
 * inherit its behaviour instead of second-guessing it.
 */
@injectable()
export class SubmitContribution implements CommandContribution, TabBarToolbarContribution {

    @inject(CustomizationService)
    protected readonly customization: CustomizationService;
    @inject(ScmService)
    protected readonly scmService: ScmService;
    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;
    @inject(QuickInputService)
    protected readonly quickInputService: QuickInputService;
    @inject(MessageService)
    protected readonly messageService: MessageService;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    protected readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SubmitCommands.SUBMIT, {
            execute: () => this.submit(),
            isEnabled: () => this.repository !== undefined
        });
    }

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        this.customization.onDidChange(() => this.onDidChangeEmitter.fire());
        this.scmService.onDidAddRepository(() => this.onDidChangeEmitter.fire());
        this.scmService.onDidRemoveRepository(() => this.onDidChangeEmitter.fire());
        registry.registerItem({
            id: 'eduide-submit',
            command: SubmitCommands.SUBMIT.id,
            icon: 'codicon codicon-cloud-upload',
            text: nls.localize('eduide/submit/label', 'Submit'),
            tooltip: nls.localize('eduide/submit/tooltip', 'Commit everything and push it to Artemis'),
            group: 'navigation',
            priority: 5,
            onDidChange: this.onDidChange,
            isVisible: (widget?: Widget) =>
                widget instanceof EditorWidget
                && this.customization.isEnabled('submit.button')
                // Nothing to submit to in the standalone template images, where
                // Scorpio never cloned anything.
                && this.repository !== undefined
        });
    }

    protected get repository(): ScmRepository | undefined {
        return this.scmService.selectedRepository ?? this.scmService.repositories[0];
    }

    async submit(): Promise<void> {
        const repository = this.repository;
        if (!repository) {
            this.messageService.warn(nls.localize(
                'eduide/submit/noRepository',
                'This workspace is not an Artemis exercise, so there is nothing to submit.'
            ));
            return;
        }
        const message = await this.resolveMessage();
        if (message === undefined) {
            return;
        }
        const accept = repository.provider.acceptInputCommand;
        if (!accept?.command) {
            this.messageService.error(nls.localize(
                'eduide/submit/noAccept',
                'Cannot submit: the Git extension did not register a commit action.'
            ));
            return;
        }
        try {
            repository.input.value = message;
            await this.commands.executeCommand(accept.command, ...(accept.arguments ?? []));
            await this.commands.executeCommand(PUSH_COMMAND);
            this.messageService.info(nls.localize('eduide/submit/done', 'Submitted to Artemis.'));
        } catch (error) {
            // Worth the whole reason: this is the only route back to Artemis at
            // this level, so a student who sees it fail needs to know why.
            const reason = error instanceof Error ? error.message : String(error);
            this.messageService.error(nls.localize(
                'eduide/submit/failed',
                'Could not submit to Artemis: {0}', reason
            ));
        }
    }

    /** `undefined` means the student cancelled the prompt. */
    protected async resolveMessage(): Promise<string | undefined> {
        const suggestion = this.defaultMessage();
        if (!this.customization.isEnabled('submit.promptMessage')) {
            return suggestion;
        }
        return this.quickInputService.input({
            title: nls.localize('eduide/submit/messageTitle', 'Submit to Artemis'),
            prompt: nls.localize('eduide/submit/messagePrompt', 'Describe what you changed'),
            value: suggestion,
            valueSelection: [0, suggestion.length]
        });
    }

    protected defaultMessage(): string {
        const now = new Date();
        const pad = (value: number): string => String(value).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
            + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        return `Submit from EduIDE, ${stamp}`;
    }
}
