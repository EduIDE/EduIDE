/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { PreferenceSchema, PreferenceScope } from '@theia/core';

export const OpenWebUiPreferencesSchema: PreferenceSchema = {
    'properties': {
        'ai-features.openWebUi.baseUrl': {
            type: 'string',
            description: 'The base URL for the Open WebUI server (e.g., https://gpu.aet.cit.tum.de).',
            default: 'https://gpu.aet.cit.tum.de',
            scope: PreferenceScope.User
        },
        'ai-features.openWebUi.models': {
            type: 'array',
            items: {
                type: 'string'
            },
            description: 'Explicit list of language model IDs to register. If non-empty, auto-discovery is bypassed.',
            default: [],
            scope: PreferenceScope.User
        },
        'ai-features.openWebUi.autoDiscoverModels': {
            type: 'boolean',
            description: 'Enable auto-discovery of available models from the Open WebUI server via cookie session auth.',
            default: true,
            scope: PreferenceScope.User
        }
    }
};
