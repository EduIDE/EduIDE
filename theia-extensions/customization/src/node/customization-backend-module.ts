/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { WORKSPACE_MODE_PATH, WorkspaceModeService } from '../common/workspace-mode';
import { WorkspaceModeServiceImpl } from './workspace-mode-service';

export default new ContainerModule(bind => {
    bind(WorkspaceModeServiceImpl).toSelf().inSingletonScope();
    bind(WorkspaceModeService).toService(WorkspaceModeServiceImpl);
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler(WORKSPACE_MODE_PATH, () => context.container.get<WorkspaceModeService>(WorkspaceModeService))
    ).inSingletonScope();
});
