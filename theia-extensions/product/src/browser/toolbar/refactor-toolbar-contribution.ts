/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { Widget } from '@theia/core/lib/browser';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { EditorWidget } from '@theia/editor/lib/browser';
import { CustomizationService } from 'theia-ide-customization-ext/lib/browser/customization-service';
import { TOOLBAR_BUTTONS } from 'theia-ide-customization-ext/lib/common/customization';

/**
 * The refactoring buttons the advanced level puts in the editor toolbar.
 *
 * The point is not that these actions are otherwise unreachable — they are, in
 * the context menu and behind shortcuts. The point is that a student who has
 * never opened that menu never learns they exist. Each tooltip carries the
 * shortcut, so the button teaches its own replacement.
 */
@injectable()
export class RefactorToolbarContribution implements TabBarToolbarContribution {

    @inject(CustomizationService)
    protected readonly customization: CustomizationService;
    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    protected readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    registerToolbarItems(registry: TabBarToolbarRegistry): void {
        this.customization.onDidChange(() => this.onDidChangeEmitter.fire());
        TOOLBAR_BUTTONS.forEach((button, index) => {
            registry.registerItem({
                id: `eduide-${button.elementId}`,
                command: button.commandId,
                icon: `codicon codicon-${button.icon}`,
                text: button.label,
                tooltip: this.tooltipFor(button.commandId, button.label),
                group: 'navigation',
                // After the Run and Debug split buttons, in catalogue order.
                priority: 10 + index,
                onDidChange: this.onDidChange,
                isVisible: (widget?: Widget) =>
                    widget instanceof EditorWidget && this.customization.isEnabled(button.elementId)
            });
        });
    }

    protected tooltipFor(commandId: string, label: string): string {
        const [keybinding] = this.keybindings.getKeybindingsForCommand(commandId);
        if (!keybinding) {
            return label;
        }
        const accelerator = this.keybindings.acceleratorFor(keybinding, '+').join(' ');
        return accelerator ? `${label}  ${accelerator}` : label;
    }
}
