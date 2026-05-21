/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceService } from '@theia/core/lib/common';
import { LanguageModelRegistry, LanguageModelStatus } from '@theia/ai-core';
import { OpenWebUiLanguageModel } from './open-webui-language-model';

@injectable()
export class OpenWebUiFrontendApplicationContribution implements FrontendApplicationContribution {

    @inject(LanguageModelRegistry)
    protected readonly languageModelRegistry: LanguageModelRegistry;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    // Track registered models to manage additions, updates, and removals
    protected readonly registeredModels = new Map<string, OpenWebUiLanguageModel>();

    onStart(): void {
        // Implemented to satisfy FrontendApplicationContribution interface
    }

    @postConstruct()
    protected init(): void {
        this.preferenceService.ready.then(() => {
            this.syncModels();
        });

        this.preferenceService.onPreferenceChanged(e => {
            if (
                e.preferenceName === 'ai-features.openWebUi.baseUrl' ||
                e.preferenceName === 'ai-features.openWebUi.models' ||
                e.preferenceName === 'ai-features.openWebUi.autoDiscoverModels'
            ) {
                this.syncModels();
            }
        });
    }

    protected async syncModels(): Promise<void> {
        const baseUrl = this.preferenceService.get<string>('ai-features.openWebUi.baseUrl', 'https://gpu.aet.cit.tum.de');
        const explicitModels = this.preferenceService.get<string[]>('ai-features.openWebUi.models', []);
        const autoDiscover = this.preferenceService.get<boolean>('ai-features.openWebUi.autoDiscoverModels', true);

        let targetModels: string[] = [];

        if (explicitModels && explicitModels.length > 0) {
            targetModels = explicitModels;
        } else if (autoDiscover && baseUrl) {
            try {
                targetModels = await this.discoverModels(baseUrl);
            } catch (error) {
                console.error('Failed to auto-discover Open WebUI models:', error);
            }
        }

        const newModelsMap = new Map<string, OpenWebUiLanguageModel>();
        const status: LanguageModelStatus = { status: 'ready' };

        for (const modelName of targetModels) {
            const id = `open-webui:${modelName}`;
            const lm = new OpenWebUiLanguageModel(
                id,
                modelName,
                status,
                true, // enableStreaming
                baseUrl
            );
            newModelsMap.set(id, lm);
        }

        // Determine removals
        const toRemove: string[] = [];
        for (const id of this.registeredModels.keys()) {
            if (!newModelsMap.has(id)) {
                toRemove.push(id);
            }
        }

        // Determine additions/updates
        const toAddOrUpdate: OpenWebUiLanguageModel[] = [];
        for (const [id, lm] of newModelsMap.entries()) {
            const existing = this.registeredModels.get(id);
            if (!existing || existing.baseUrl !== lm.baseUrl || existing.model !== lm.model) {
                toAddOrUpdate.push(lm);
            }
        }

        if (toRemove.length > 0) {
            this.languageModelRegistry.removeLanguageModels(toRemove);
            for (const id of toRemove) {
                this.registeredModels.delete(id);
            }
        }

        if (toAddOrUpdate.length > 0) {
            this.languageModelRegistry.addLanguageModels(toAddOrUpdate);
            for (const lm of toAddOrUpdate) {
                this.registeredModels.set(lm.id, lm);
            }
        }
    }

    protected async discoverModels(baseUrl: string): Promise<string[]> {
        const url = `${baseUrl.replace(/\/$/, '')}/api/models`;
        const response = await fetch(url, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (data && Array.isArray(data.data)) {
            return data.data.map((m: any) => m.id);
        } else if (Array.isArray(data)) {
            return data.map((m: any) => m.id);
        }
        return [];
    }
}
