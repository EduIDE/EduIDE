/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import * as jsoncparser from 'jsonc-parser';
import {
    DeliveredConfig,
    DELIVERED_CONFIG_SEGMENTS,
    ELEMENTS_BY_ID,
    isEduIdeLevel
} from '../common/customization';

/**
 * Reads the exercise's own `.vscode/eduide.json`, if it ships one.
 *
 * Instructors write this by hand next to `launch.json`, so everything here
 * tolerates what hand-written JSON looks like: comments and trailing commas
 * are fine, and anything malformed is reported and then ignored rather than
 * failing a student's session. A course cannot break someone's IDE with a
 * typo.
 *
 * Unknown keys are warned about individually. Silence would leave an
 * instructor watching a file they wrote do nothing, with nowhere to look.
 */
@injectable()
export class DeliveredConfigReader {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(FileService)
    protected readonly fileService: FileService;
    @inject(ILogger)
    protected readonly logger: ILogger;

    /** The delivered configuration, or `undefined` when there is none to use. */
    async read(): Promise<DeliveredConfig | undefined> {
        const raw = await this.readRaw();
        return raw === undefined ? undefined : this.validate(raw);
    }

    protected async readRaw(): Promise<unknown> {
        await this.workspaceService.ready;
        // Single root: an Artemis exercise is one repository. In a multi-root
        // workspace the first root is the exercise and the rest are additions
        // the student made.
        const root = this.workspaceService.tryGetRoots()[0];
        if (!root) {
            return undefined;
        }
        const uri = DELIVERED_CONFIG_SEGMENTS.reduce((current, segment) => current.resolve(segment), root.resource);
        try {
            if (!await this.fileService.exists(uri)) {
                return undefined;
            }
            const content = await this.fileService.read(uri);
            if (!jsoncparser.stripComments(content.value).trim()) {
                // A file that is entirely comments, which is the shape the
                // templates ship. It parses to nothing and the parser calls
                // that an error, but saying nothing is not the same as saying
                // something wrong — warning here would tell every student on a
                // stock template that their exercise is misconfigured.
                return undefined;
            }
            const errors: jsoncparser.ParseError[] = [];
            const parsed = jsoncparser.parse(content.value, errors, { allowTrailingComma: true });
            if (errors.length > 0) {
                this.logger.warn(`EduIDE customization: ${uri.path.fsPath()} is not valid JSON, ignoring it`);
                return undefined;
            }
            return parsed;
        } catch (error) {
            this.logger.warn(`EduIDE customization: could not read ${uri.path.fsPath()}`, error);
            return undefined;
        }
    }

    protected validate(raw: unknown): DeliveredConfig | undefined {
        if (typeof raw !== 'object' || !raw || Array.isArray(raw)) {
            // An all-comments file parses to undefined, which is how the
            // commented example in the templates stays a no-op.
            if (raw !== undefined) {
                this.logger.warn('EduIDE customization: eduide.json must contain a JSON object, ignoring it');
            }
            return undefined;
        }
        const source = raw as Record<string, unknown>;
        const config: { level?: DeliveredConfig['level'], overrides?: Record<string, boolean> } = {};

        if (source.level !== undefined) {
            if (isEduIdeLevel(source.level)) {
                config.level = source.level;
            } else {
                this.logger.warn(`EduIDE customization: eduide.json has an unknown level "${String(source.level)}", ignoring it`);
            }
        }

        if (source.overrides !== undefined) {
            config.overrides = this.validateOverrides(source.overrides);
        }

        return config.level === undefined && config.overrides === undefined ? undefined : config;
    }

    protected validateOverrides(raw: unknown): Record<string, boolean> | undefined {
        if (typeof raw !== 'object' || !raw || Array.isArray(raw)) {
            this.logger.warn('EduIDE customization: eduide.json overrides must be a JSON object, ignoring them');
            return undefined;
        }
        const overrides: Record<string, boolean> = {};
        for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
            if (!ELEMENTS_BY_ID.has(id)) {
                this.logger.warn(`EduIDE customization: eduide.json overrides an unknown element "${id}", ignoring it`);
            } else if (typeof value !== 'boolean') {
                this.logger.warn(`EduIDE customization: eduide.json override "${id}" must be true or false, ignoring it`);
            } else {
                overrides[id] = value;
            }
        }
        return Object.keys(overrides).length > 0 ? overrides : undefined;
    }
}
