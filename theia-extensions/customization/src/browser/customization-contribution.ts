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
import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar';
import { QuickPickService, QuickPickItem, QuickPickSeparator } from '@theia/core/lib/common/quick-pick-service';
import { nls } from '@theia/core/lib/common/nls';
import { EduIdeLevel, EDU_IDE_LEVELS, isEduIdeLevel, MAIN_MENU_BAR } from '../common/customization';
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
    /** One per level, so the menu can list them and tick the active one. */
    export function setLevel(level: EduIdeLevel): Command {
        return {
            id: `eduide.experienceLevel.${level}`,
            category: CATEGORY,
            label: `Experience Level: ${level[0].toUpperCase()}${level.slice(1)}`
        };
    }
}

export namespace CustomizationMenus {
    /**
     * A menu of its own, named for what it does rather than for the product.
     *
     * It began under View, then briefly under an `EduIDE` menu. Both were a
     * step too many: a student hunting for the control that changes their IDE
     * does not think of it as a view, and does not know that "EduIDE" is where
     * levels live. The menu bar entry now says `Experience Levels`, and opening
     * it *is* the chooser — the three levels, ticked at the current one.
     *
     * A top-level entry cannot run a command on click: Theia builds the bar
     * from Lumino, whose top-level items are always submenus. Listing the
     * levels in the dropdown gets to the same place in the same click, and
     * shows which one is active without opening anything.
     *
     * `8_eduide` sorts after Theia's `7_terminal` and before `9_help`.
     */
    export const LEVELS: MenuPath = [...MAIN_MENU_BAR, '8_eduide'];
    /** The levels themselves. */
    export const LEVELS_CHOICES: MenuPath = [...LEVELS, '1_levels'];
    /** Separated below them, because it is a different kind of thing. */
    export const LEVELS_CUSTOMIZE: MenuPath = [...LEVELS, '2_customize'];
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
        for (const level of EDU_IDE_LEVELS) {
            commands.registerCommand(CustomizationCommands.setLevel(level), {
                execute: () => this.customization.setLevel(level),
                isToggled: () => this.customization.level === level
            });
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(
            CustomizationMenus.LEVELS,
            nls.localize('eduide/customization/menu', 'Experience Levels')
        );
        EDU_IDE_LEVELS.forEach((level, index) => {
            menus.registerMenuAction(CustomizationMenus.LEVELS_CHOICES, {
                commandId: CustomizationCommands.setLevel(level).id,
                label: LEVEL_LABELS[level],
                order: String(index)
            });
        });
        menus.registerMenuAction(CustomizationMenus.LEVELS_CUSTOMIZE, {
            commandId: CustomizationCommands.CUSTOMIZE.id,
            label: nls.localize('eduide/customization/customizeMenu', 'Customize Individual Elements…'),
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
