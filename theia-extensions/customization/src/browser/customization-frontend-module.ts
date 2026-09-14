/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { FrontendApplicationContribution, WidgetFactory } from '@theia/core/lib/browser';
import { StatusBar } from '@theia/core/lib/browser/status-bar';
import { CustomizationService } from './customization-service';
import { CustomizationContribution } from './customization-contribution';
import { CustomizeWidget } from './customize-widget';
import { StartupFileContribution } from './startup-file-contribution';
import { bindCustomizationPreferences } from './customization-preferences';
import { bindLevelAwareStatusBar } from './level-aware-status-bar';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    bindCustomizationPreferences(bind);

    if (isBound(StatusBar)) {
        bindLevelAwareStatusBar(rebind);
    }

    bind(CustomizationService).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(CustomizationService);

    bind(CustomizationContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution, FrontendApplicationContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(CustomizationContribution)
    );

    bind(StartupFileContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(StartupFileContribution);

    bind(CustomizeWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: CustomizeWidget.ID,
        createWidget: () => context.container.get<CustomizeWidget>(CustomizeWidget)
    })).inSingletonScope();
});
