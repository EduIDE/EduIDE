/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from 'react';
import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import {
    buildPayload, canSend, DESCRIPTION_MAX, FeedbackContext, FeedbackForm, FeedbackKind, FeedbackPayload, FeedbackSendResult, sendOutcome, TITLE_MAX
} from './feedback';

export interface FeedbackDialogOptions {
    context: FeedbackContext;
    send: (payload: FeedbackPayload) => Promise<FeedbackSendResult | undefined>;
    onSent: () => void;
    openGithubForm: (kind: FeedbackKind, title: string, description: string) => void;
}

/**
 * Anonymous feedback from the IDE. Built from Theia's own classes and colour
 * variables, so it follows the light and dark theme. The logic lives in feedback.ts.
 */
export class FeedbackDialog extends ReactDialog<undefined> {

    protected kind: FeedbackKind = 'bug';
    protected title_ = '';
    protected description = '';
    protected consent = false;
    protected sending = false;
    protected error = '';

    constructor(protected readonly options: FeedbackDialogOptions) {
        super({ title: 'Send Feedback' });
        this.appendCloseButton('Cancel');
    }

    get value(): undefined {
        return undefined;
    }

    // Enter in the text fields must not close the dialog.
    protected handleEnter(): void { }

    protected async send(): Promise<void> {
        this.sending = true;
        this.error = '';
        this.update();
        let result: FeedbackSendResult | undefined;
        try {
            result = await this.options.send(buildPayload(this.form(), this.options.context));
        } catch {
            result = undefined;
        }
        this.sending = false;
        const outcome = sendOutcome(result);
        if (outcome.sent) {
            this.options.onSent();
            this.close();
            return;
        }
        this.error = outcome.error;
        this.update();
    }

    protected form(): FeedbackForm {
        return { kind: this.kind, title: this.title_, description: this.description, consent: this.consent };
    }

    protected set(change: () => void): void {
        change();
        this.error = '';
        this.update();
    }

    protected render(): React.ReactNode {
        const { context } = this.options;
        const sent = [
            `Version: ${context.version || 'unknown'}`,
            `Browser: ${context.browser}`,
            'Installation and app definition: added by the server'
        ].join('\n');
        const choice = (kind: FeedbackKind, label: string) => (
            <button
                type='button'
                className={`theia-button ${this.kind === kind ? 'main' : 'secondary'}`}
                aria-pressed={this.kind === kind}
                onClick={() => this.set(() => { this.kind = kind; })}
            >{label}</button>
        );
        return <div className='eduide-feedback'>
            <div className='eduide-feedback-row'>
                {choice('bug', 'Bug')}
                {choice('feature', 'Feature')}
            </div>
            <label>Title</label>
            <input
                className='theia-input'
                maxLength={TITLE_MAX}
                value={this.title_}
                onChange={e => this.set(() => { this.title_ = e.target.value; })}
            />
            <label>Description</label>
            <textarea
                className='theia-input'
                rows={6}
                maxLength={DESCRIPTION_MAX}
                value={this.description}
                onChange={e => this.set(() => { this.description = e.target.value; })}
            />
            <label>Sent along</label>
            <textarea className='theia-input' rows={4} readOnly value={sent} />
            <label className='eduide-feedback-consent'>
                <input
                    type='checkbox'
                    checked={this.consent}
                    onChange={e => this.set(() => { this.consent = e.target.checked; })}
                />
                <span>
                    I understand that this feedback can be made public on GitHub, anonymously and without my name.
                    I did not include personal data, access tokens or exercise code.
                </span>
            </label>
            {this.error && <div className='eduide-feedback-error' role='alert'>
                <i className='codicon codicon-error' /> {this.error}
            </div>}
            <div className='eduide-feedback-row'>
                <button
                    type='button'
                    className='theia-button main'
                    disabled={!canSend(this.form()) || this.sending}
                    onClick={() => this.send()}
                >Send anonymously</button>
                <button
                    type='button'
                    className='theia-button secondary'
                    onClick={() => this.options.openGithubForm(this.kind, this.title_.trim(), this.description.trim())}
                >
                    <i className='codicon codicon-github' /> Use my GitHub account
                </button>
            </div>
        </div>;
    }
}
