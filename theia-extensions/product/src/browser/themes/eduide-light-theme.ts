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
        // Theia's light grays sit too close to the white editor; borders and a
        // darker activity bar keep the side panel apart from the editor.
        'foreground': '#3B3B3B',
        'activityBar.background': '#E4E4E4',
        'activityBar.foreground': '#1F1F1F',
        'activityBar.inactiveForeground': '#5F5F5F',
        'activityBar.activeBorder': '#1A7A7C',
        'activityBar.border': '#C8C8C8',
        'sideBar.background': '#F3F3F3',
        'sideBar.foreground': '#3B3B3B',
        'sideBarSectionHeader.foreground': '#1F1F1F',
        'sideBarSectionHeader.border': '#C8C8C8',
        'editorGroupHeader.tabsBackground': '#F3F3F3',
        'editorGroup.border': '#C8C8C8',
        'tab.border': '#C8C8C8',
        'tab.inactiveForeground': '#5F5F5F',
        'tab.activeBorderTop': '#1A7A7C',
        'panel.border': '#C8C8C8',
        'titleBar.border': '#C8C8C8',
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
