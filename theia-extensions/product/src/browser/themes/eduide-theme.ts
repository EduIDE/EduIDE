/********************************************************************************
 * Copyright (C) 2026 EduIDE
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

// Resolved include chain: dark_theia → dark_plus → dark_vs
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const eduIdeDarkThemeIncludes: { [path: string]: unknown } = {
    './dark_theia.json': require('@theia/monaco/data/monaco-themes/vscode/dark_theia.json'),
    './dark_plus.json': require('@theia/monaco/data/monaco-themes/vscode/dark_plus.json'),
    './dark_vs.json': require('@theia/monaco/data/monaco-themes/vscode/dark_vs.json'),
};

export const eduIdeTheme = {
    $schema: 'vscode://schemas/color-theme',
    name: 'EduIDE Theme',
    include: './dark_theia.json',
    colors: {
        'focusBorder': '#249EA0',
        'button.background': '#249EA0',
        'button.hoverBackground': '#2DB5B7',
        'activityBarBadge.background': '#249EA0',
        'list.activeSelectionBackground': '#1A6E70',
        'list.highlightForeground': '#4DC4C6',
        'menu.selectionBackground': '#249EA0',
        'statusBar.background': '#1A7A7C',
        'statusBar.foreground': '#FFFFFF',
        'statusBar.noFolderBackground': '#1A7A7C',
        'statusBar.debuggingBackground': '#1A6E70',
        'statusBarItem.remoteBackground': '#249EA0',
        'progressBar.background': '#249EA0',
        'textLink.foreground': '#4DC4C6'
    }
};
