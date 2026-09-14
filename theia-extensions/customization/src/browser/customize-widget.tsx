/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { nls } from '@theia/core/lib/common/nls';
import {
    CustomizableElement,
    EduIdeLevel,
    EDU_IDE_LEVELS,
    ElementGroup,
    ELEMENT_CATALOGUE,
    ELEMENT_GROUP_LABELS
} from '../common/customization';
import { CustomizationService } from './customization-service';

const LEVEL_LABELS: Record<EduIdeLevel, string> = {
    beginner: 'Beginner',
    advanced: 'Advanced',
    expert: 'Expert'
};

/**
 * The Customize panel: the element catalogue rendered directly, one toggle per
 * element, so the panel and the catalogue cannot drift apart.
 */
@injectable()
export class CustomizeWidget extends ReactWidget {

    static readonly ID = 'eduide-customize';
    static readonly LABEL = 'EduIDE: Customize';

    @inject(CustomizationService)
    protected readonly customization: CustomizationService;

    @postConstruct()
    protected init(): void {
        this.id = CustomizeWidget.ID;
        this.title.label = CustomizeWidget.LABEL;
        this.title.caption = CustomizeWidget.LABEL;
        this.title.iconClass = 'codicon codicon-gear';
        this.title.closable = true;
        this.addClass('eduide-customize');
        this.toDispose.push(this.customization.onDidChange(() => this.update()));
        this.update();
    }

    protected render(): React.ReactNode {
        const level = this.customization.level;
        const overridden = ELEMENT_CATALOGUE.filter(element => this.customization.isOverridden(element.id)).length;
        const groups = this.groupElements();

        return <div className='eduide-customize-body'>
            <h1>{nls.localize('eduide/customize/title', 'Customize EduIDE')}</h1>
            <p className='eduide-customize-sub'>
                {nls.localize(
                    'eduide/customize/subtitle',
                    'Your level sets the starting point. Every element can be switched on or off individually — including at Expert.'
                )}
            </p>

            <div className='eduide-customize-bar'>
                <span className='eduide-customize-barlabel'>{nls.localize('eduide/customize/level', 'LEVEL')}</span>
                {EDU_IDE_LEVELS.map(candidate => this.renderLevelPill(candidate, candidate === level))}
                <span className='eduide-customize-diff'>
                    {overridden === 0
                        ? nls.localize('eduide/customize/noDiff', 'Nothing differs from the {0} preset', LEVEL_LABELS[level])
                        : nls.localize('eduide/customize/diff', '{0} element(s) differ from the {1} preset', overridden, LEVEL_LABELS[level])}
                </span>
                <button
                    className='theia-button secondary eduide-customize-reset'
                    disabled={overridden === 0}
                    onClick={() => this.customization.resetOverrides()}
                >
                    {nls.localize('eduide/customize/reset', 'Reset to level defaults')}
                </button>
            </div>

            <div className='eduide-customize-grid'>
                {groups.map(([group, elements]) => this.renderGroup(group, elements))}
            </div>
        </div>;
    }

    protected renderLevelPill(level: EduIdeLevel, active: boolean): React.ReactNode {
        return <button
            key={level}
            className={`eduide-customize-pill${active ? ' active' : ''}`}
            onClick={() => this.customization.setLevel(level)}
        >
            <span className='codicon codicon-mortar-board' />
            {LEVEL_LABELS[level]}
        </button>;
    }

    protected renderGroup(group: ElementGroup, elements: CustomizableElement[]): React.ReactNode {
        return <div className='eduide-customize-group' key={group}>
            <div className='eduide-customize-grouptitle'>{ELEMENT_GROUP_LABELS[group]}</div>
            {elements.map(element => this.renderRow(element))}
        </div>;
    }

    protected renderRow(element: CustomizableElement): React.ReactNode {
        const enabled = this.customization.isEnabled(element.id);
        const overridden = this.customization.isOverridden(element.id);
        const pending = element.pending;
        return <div className='eduide-customize-row' key={element.id}>
            <label className={`eduide-customize-switch${enabled ? ' on' : ''}${pending ? ' pending' : ''}`}>
                <input
                    type='checkbox'
                    id={`eduide-toggle-${element.id}`}
                    checked={enabled}
                    disabled={!!pending}
                    onChange={event => this.toggle(element, event.target.checked)}
                />
                <span className='eduide-customize-knob' />
            </label>
            <span className='eduide-customize-id'>{element.id}</span>
            <span className='eduide-customize-label'>{element.label}</span>
            {overridden && !pending
                ? <span className='eduide-customize-tag overridden'>{nls.localize('eduide/customize/overridden', 'overridden')}</span>
                : undefined}
            {pending
                ? <span className='eduide-customize-tag pending' title={pending}>{nls.localize('eduide/customize/pending', 'not enforced yet')}</span>
                : undefined}
        </div>;
    }

    protected async toggle(element: CustomizableElement, enabled: boolean): Promise<void> {
        // Flipping an element back to its level default drops the override
        // rather than pinning the same value, so the row stops reading as
        // "overridden" and follows the level again.
        const isDefault = enabled === element.defaults[this.customization.level];
        await this.customization.setOverride(element.id, isDefault ? undefined : enabled);
    }

    protected groupElements(): Array<[ElementGroup, CustomizableElement[]]> {
        const groups = new Map<ElementGroup, CustomizableElement[]>();
        for (const element of ELEMENT_CATALOGUE) {
            const bucket = groups.get(element.group);
            if (bucket) {
                bucket.push(element);
            } else {
                groups.set(element.group, [element]);
            }
        }
        return [...groups.entries()];
    }
}
