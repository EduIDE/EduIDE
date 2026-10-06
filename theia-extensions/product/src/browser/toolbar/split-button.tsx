import { codicon } from '@theia/core/lib/browser';
import * as React from '@theia/core/shared/react';
import '../../../src/browser/toolbar/split-button.css';

export interface SplitButtonProps {
    /** Unique key for React rendering */
    buttonKey: string;
    /** Codicon name for the main button (e.g., 'play', 'debug-alt') */
    icon: string;
    /** Tooltip for the main button */
    tooltip: string;
    /** Tooltip for the chevron dropdown */
    menuTooltip: string;
    /** Whether the button is enabled */
    enabled: boolean;
    /** Whether to show the chevron dropdown */
    showMenu: boolean;
    /** Text beside the icon. Omitted leaves the button icon-only. */
    label?: string;
    /** Called when the main button is clicked */
    onRun: (e: React.MouseEvent<HTMLElement>) => void;
    /** Called when the chevron is clicked */
    onShowMenu: (e: React.MouseEvent<HTMLElement>) => void;
}

export function SplitButton(props: SplitButtonProps): React.ReactElement {
    const containerClasses = [
        'split-button',
        'theia-tab-bar-toolbar-item',
        props.enabled ? 'enabled' : 'disabled',
        props.showMenu ? 'menu' : ''
    ].filter(Boolean).join(' ');

    const mainButtonClasses = [
        codicon(props.icon),
        'action-item',
        'main-button',
        props.label ? 'labelled' : ''
    ].filter(Boolean).join(' ');

    return (
        <div key={props.buttonKey} className={containerClasses}>
            <button
                className={mainButtonClasses}
                title={props.tooltip}
                onClick={props.onRun}
                disabled={!props.enabled}
            >
                {props.label && <span className='split-button-label'>{props.label}</span>}
            </button>

            {props.showMenu && (
                <button
                    className="action-item chevron-button"
                    onClick={props.onShowMenu}
                    title={props.menuTooltip}
                >
                    <span className={`${codicon('chevron-down')} chevron`} />
                </button>
            )}
        </div>
    );
}
