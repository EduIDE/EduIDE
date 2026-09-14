/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { interfaces } from '@theia/core/shared/inversify';
import { StatusBar, StatusBarEntry, StatusBarImpl } from '@theia/core/lib/browser/status-bar';
import { CustomizationService } from './customization-service';

/**
 * Drops status bar entries the current level suppresses, on the way in.
 *
 * Removing them after the fact loses a race: the editor entries are re-set on
 * every editor change, so a listener that removes them runs before they come
 * back. This wraps the one `StatusBarImpl` the shell renders — the same object,
 * through a proxy — so the shell keeps working and only `setElement` is gated.
 */
export function bindLevelAwareStatusBar(rebind: interfaces.Rebind): void {
    rebind(StatusBar).toDynamicValue(context => {
        const { container } = context;
        const statusBar = container.get(StatusBarImpl);
        return new Proxy(statusBar, {
            get(target, property, receiver): unknown {
                if (property !== 'setElement') {
                    return Reflect.get(target, property, receiver);
                }
                return (id: string, entry: StatusBarEntry): Promise<void> => {
                    // Resolved per call, not captured: the service injects
                    // StatusBarImpl, and asking for it while this binding is
                    // being resolved would close a cycle.
                    const customization = container.get(CustomizationService);
                    return customization.isStatusBarItemHidden(id)
                        ? Promise.resolve()
                        : target.setElement(id, entry);
                };
            }
        });
    }).inSingletonScope();
}
