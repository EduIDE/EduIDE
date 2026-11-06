/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceContribution, PreferenceSchema } from '@theia/core/lib/common/preferences';
import { CustomizationPreferences, EDU_IDE_LEVELS, DEFAULT_LEVEL } from '../common/customization';

export const customizationPreferenceSchema: PreferenceSchema = {
    title: 'EduIDE',
    properties: {
        [CustomizationPreferences.LEVEL]: {
            type: 'string',
            enum: [...EDU_IDE_LEVELS],
            enumDescriptions: [
                'Explorer, Search and Artemis. Run only — no debugger, no terminal.',
                'Version control, tests, the build tool and refactorings. Still no debugger.',
                'Stock EduIDE — the only level with a debugger, Outline and Memory Inspector.'
            ],
            default: DEFAULT_LEVEL,
            description: 'How much of EduIDE is exposed. The level is a starting point: every element can be overridden individually.'
        },
        [CustomizationPreferences.OVERRIDES]: {
            type: 'object',
            default: {},
            additionalProperties: { type: 'boolean' },
            description: 'Per-element overrides on top of the level, keyed by element id. Applies at every level, expert included.'
        }
    }
};

export function bindCustomizationPreferences(bind: interfaces.Bind): void {
    bind(PreferenceContribution).toConstantValue({ schema: customizationPreferenceSchema });
}
