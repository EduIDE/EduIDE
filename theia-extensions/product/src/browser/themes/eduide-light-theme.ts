/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/
import { eduIdeTheme } from './eduide-theme';

// Resolved include chain: light_theia → light_plus → light_vs
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const eduIdeLightThemeIncludes: { [path: string]: unknown } = {
    './light_theia.json': require('@theia/monaco/data/monaco-themes/vscode/light_theia.json'),
    './light_plus.json': require('@theia/monaco/data/monaco-themes/vscode/light_plus.json'),
    './light_vs.json': require('@theia/monaco/data/monaco-themes/vscode/light_vs.json'),
};

// Inherits light_theia (activityBar grey, token colors, base editor colors) + EduIDE teal accents.
export const eduIdeLightTheme = {
    ...eduIdeTheme,
    include: './light_theia.json',
    colors: {
        ...eduIdeTheme.colors,
        'activityBar.background': '#f0f0f0',
        // The dark theme's teal is too light on white; these keep text at 4.5:1 or more.
        'focusBorder': '#1A7A7C',
        'button.background': '#1A7A7C',
        'button.hoverBackground': '#1A6E70',
        'activityBarBadge.background': '#1A7A7C',
        'list.highlightForeground': '#136366',
        'menu.selectionBackground': '#1A7A7C',
        'statusBarItem.remoteBackground': '#1A6E70',
        'progressBar.background': '#1A7A7C',
        'textLink.foreground': '#1A7A7C',
        'textLink.activeForeground': '#1A7A7C',
    }
};
