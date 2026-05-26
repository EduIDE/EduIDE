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

    protected refreshIframe: HTMLIFrameElement | undefined;
    protected refreshInterval: any | undefined;
    protected refreshPromise: Promise<void> | undefined;

    onStart(): void {
        this.setupSilentRefresh();
    }

    protected setupSilentRefresh(): void {
        const baseUrl = this.preferenceService.get<string>('ai-features.openWebUi.baseUrl', 'https://gpu.aet.cit.tum.de');
        if (!baseUrl) {
            return;
        }

        // Create the hidden iframe
        if (!this.refreshIframe) {
            this.refreshIframe = document.createElement('iframe');
            this.refreshIframe.id = 'open-webui-refresh-iframe';
            this.refreshIframe.style.display = 'none';
            this.refreshIframe.style.width = '0';
            this.refreshIframe.style.height = '0';
            this.refreshIframe.style.border = 'none';
            document.body.appendChild(this.refreshIframe);
        }

        // Set initial src to trigger refresh
        this.triggerIframeRefresh();

        // Setup periodic refresh (every 15 minutes = 900000 ms)
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.refreshInterval = setInterval(() => {
            this.triggerIframeRefresh();
        }, 15 * 60 * 1000);
    }

    public triggerIframeRefresh(): Promise<void> {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        const baseUrl = this.preferenceService.get<string>('ai-features.openWebUi.baseUrl', 'https://gpu.aet.cit.tum.de');
        if (!this.refreshIframe || !baseUrl) {
            return Promise.resolve();
        }

        this.refreshPromise = new Promise<void>((resolve) => {
            let loaded = false;
            
            const onLoad = () => {
                if (!loaded) {
                    loaded = true;
                    if (this.refreshIframe) {
                        this.refreshIframe.removeEventListener('load', onLoad);
                        this.refreshIframe.removeEventListener('error', onError);
                    }
                    console.log('[OpenWebUI] Silent session refresh iframe loaded successfully.');
                    this.refreshPromise = undefined;
                    resolve();
                }
            };
            
            const onError = () => {
                if (!loaded) {
                    loaded = true;
                    if (this.refreshIframe) {
                        this.refreshIframe.removeEventListener('load', onLoad);
                        this.refreshIframe.removeEventListener('error', onError);
                    }
                    console.warn('[OpenWebUI] Silent session refresh iframe encountered a load error.');
                    this.refreshPromise = undefined;
                    resolve();
                }
            };

            this.refreshIframe!.addEventListener('load', onLoad);
            this.refreshIframe!.addEventListener('error', onError);

            // Timeout after 10 seconds to avoid blocking indefinitely
            setTimeout(() => {
                if (!loaded) {
                    loaded = true;
                    if (this.refreshIframe) {
                        this.refreshIframe.removeEventListener('load', onLoad);
                        this.refreshIframe.removeEventListener('error', onError);
                    }
                    console.warn('[OpenWebUI] Silent session refresh iframe timed out.');
                    this.refreshPromise = undefined;
                    resolve();
                }
            }, 10000);

            try {
                const url = new URL(baseUrl);
                url.searchParams.set('_t', Date.now().toString());
                this.refreshIframe!.src = url.toString();
                console.log(`[OpenWebUI] Triggered silent session refresh via iframe pointing to: ${url.toString()}`);
            } catch (e) {
                console.error('[OpenWebUI] Invalid baseUrl for refresh:', e);
                resolve();
            }
        });

        return this.refreshPromise;
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
                if (e.preferenceName === 'ai-features.openWebUi.baseUrl') {
                    this.setupSilentRefresh();
                }
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
                baseUrl,
                () => this.triggerIframeRefresh()
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
