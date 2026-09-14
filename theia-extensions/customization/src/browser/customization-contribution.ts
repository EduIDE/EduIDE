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
import { MenuContribution, MenuModelRegistry, MenuPath } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar';
import { QuickPickService, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/common/quick-pick-service';
import { nls } from '@theia/core/lib/common/nls';
import { EduIdeLevel, EDU_IDE_LEVELS, isEduIdeLevel } from '../common/customization';
import { CustomizationService } from './customization-service';
import { CustomizeWidget } from './customize-widget';

export const EDUIDE_LEVEL_STATUS_ID = 'eduide-experience-level';

export namespace CustomizationCommands {
    export const CATEGORY = 'EduIDE';
    export const EXPERIENCE_LEVEL: Command = {
        id: 'eduide.experienceLevel',
        category: CATEGORY,
        label: 'Experience Level'
    };
    export const CUSTOMIZE: Command = {
        id: 'eduide.customize',
        category: CATEGORY,
        label: 'Customize…'
    };
}

export namespace CustomizationMenus {
    export const HELP_EXPERIENCE: MenuPath = [...CommonMenus.HELP, 'eduide-experience'];
}

const LEVEL_LABELS: Record<EduIdeLevel, string> = {
    beginner: 'Beginner',
    advanced: 'Advanced',
    expert: 'Expert'
};

const LEVEL_DESCRIPTIONS: Record<EduIdeLevel, string> = {
    beginner: 'Explorer, Search and Artemis. Run only — no debugger, no terminal.',
    advanced: 'Version control, tests, the build tool and refactorings. Still no debugger.',
    expert: 'Stock EduIDE — the only level with a debugger, Outline and Memory Inspector.'
};

interface LevelPickItem extends QuickPickItem {
    /** The level to switch to, or `customize` for the row that opens the panel. */
    action: EduIdeLevel | 'customize';
}

/**
 * The menu: a status-bar indicator, the level quick pick it opens, and the
 * command that opens the Customize panel.
 *
 * The quick pick's last row routes on to the panel. Without it the only
 * discoverable entry point is a dead end for anyone who wants more than a
 * level, and the per-element toggles are reachable only by students who
 * already know the command exists.
 */
@injectable()
export class CustomizationContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    @inject(CustomizationService)
    protected readonly customization: CustomizationService;
    @inject(StatusBar)
    protected readonly statusBar: StatusBar;
    @inject(QuickPickService)
    protected readonly quickPickService: QuickPickService;
    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;
    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    onStart(): void {
        this.customization.onDidChange(() => this.updateStatusBar());
        this.updateStatusBar();
    }

    // ── Status bar ───────────────────────────────────────────────────

    protected updateStatusBar(): void {
        if (!this.customization.isEnabled('status.level')) {
            this.statusBar.removeElement(EDUIDE_LEVEL_STATUS_ID);
            return;
        }
        const level = this.customization.level;
        this.statusBar.setElement(EDUIDE_LEVEL_STATUS_ID, {
            text: `$(mortar-board) ${LEVEL_LABELS[level]}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            command: CustomizationCommands.EXPERIENCE_LEVEL.id,
            tooltip: nls.localize(
                'eduide/customization/statusTooltip',
                'EduIDE experience level: {0}. Click to change it or customize individual elements.',
                LEVEL_LABELS[level]
            )
        });
    }

    // ── Commands and menus ───────────────────────────────────────────

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CustomizationCommands.EXPERIENCE_LEVEL, {
            execute: () => this.showLevelPicker()
        });
        commands.registerCommand(CustomizationCommands.CUSTOMIZE, {
            execute: () => this.openCustomizePanel()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CustomizationMenus.HELP_EXPERIENCE, {
            commandId: CustomizationCommands.EXPERIENCE_LEVEL.id,
            label: nls.localize('eduide/customization/helpMenu', 'Experience Level…'),
            order: '0'
        });
    }

    // ── The quick pick ───────────────────────────────────────────────

    async showLevelPicker(): Promise<void> {
        const current = this.customization.level;
        const items: Array<LevelPickItem | QuickPickSeparator> = EDU_IDE_LEVELS.map(level => ({
            action: level,
            label: `$(mortar-board) ${LEVEL_LABELS[level]}`,
            description: level === current ? nls.localize('eduide/customization/current', 'current') : undefined,
            detail: LEVEL_DESCRIPTIONS[level]
        }));
        items.push({ type: 'separator' });
        items.push({
            action: 'customize',
            label: `$(gear) ${nls.localize('eduide/customization/customizeRow', 'Customize individual elements…')}`,
            description: CustomizationCommands.CUSTOMIZE.label
        });

        const picked = await this.quickPickService.show<LevelPickItem>(items, {
            title: nls.localize('eduide/customization/pickTitle', 'EduIDE experience level'),
            placeholder: nls.localize(
                'eduide/customization/pickPlaceholder',
                'Select your EduIDE experience level'
            )
        });
        if (!picked) {
            return;
        }
        if (picked.action === 'customize') {
            await this.openCustomizePanel();
        } else if (isEduIdeLevel(picked.action) && picked.action !== current) {
            await this.customization.setLevel(picked.action);
        }
    }

    // ── The panel ────────────────────────────────────────────────────

    async openCustomizePanel(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget<CustomizeWidget>(CustomizeWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
