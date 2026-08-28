/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { CommandContribution } from '@theia/core/lib/common/command';
import { ContainerModule } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { FilterContribution } from '@theia/core/lib/common';
import { AIActivationService } from '@theia/ai-core/lib/browser/ai-activation-service';
import { TheiaIDEAboutDialog } from './theia-ide-about-dialog';
import { TheiaIDEContribution, ViewsFilter, DisabledFeaturesContribution, DisabledAIActivationService } from './theia-ide-contribution';
import { TheiaIDEGettingStartedWidget } from './theia-ide-getting-started-widget';
import { TaskToolbarContribution } from './toolbar/task-toolbar-contribution';
import { DebugToolbarContribution } from './toolbar/debug-toolbar-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bind(TheiaIDEGettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<TheiaIDEGettingStartedWidget>(TheiaIDEGettingStartedWidget),
    })).inSingletonScope();
    if (isBound(AboutDialog)) {
        rebind(AboutDialog).to(TheiaIDEAboutDialog).inSingletonScope();
    } else {
        bind(AboutDialog).to(TheiaIDEAboutDialog).inSingletonScope();
    }

    bind(TheiaIDEContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(TheiaIDEContribution)
    );

    // Register contribution filter to remove Outline and VSX Extensions views
    bind(ViewsFilter).toSelf().inSingletonScope();
    bind(FilterContribution).toService(ViewsFilter);

    // Register runtime feature disabler for additional protection
    bind(DisabledFeaturesContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(DisabledFeaturesContribution);

    // Keep AI features off: @theia/ai-core arrives transitively via @theia/plugin-ext
    // and its default activation service enables AI. Replace it with a disabled one.
    bind(DisabledAIActivationService).toSelf().inSingletonScope();
    if (isBound(AIActivationService)) {
        rebind(AIActivationService).toService(DisabledAIActivationService);
    } else {
        bind(AIActivationService).toService(DisabledAIActivationService);
    }

    // Task run toolbar button
    bind(TaskToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(TaskToolbarContribution);

    // Debug toolbar button
    bind(DebugToolbarContribution).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(DebugToolbarContribution);
});
