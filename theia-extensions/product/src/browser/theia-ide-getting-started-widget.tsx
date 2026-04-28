/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from "react";

import { codicon, Message } from "@theia/core/lib/browser";
import { inject, injectable } from "@theia/core/shared/inversify";
import {
  renderDocumentation,
  renderTickets,
  renderWhatIs,
} from "./branding-util";

import { GettingStartedWidget } from "@theia/getting-started/lib/browser/getting-started-widget";
import { WindowService } from "@theia/core/lib/browser/window/window-service";
import { CommandRegistry, environment, isOSX, nls } from "@theia/core";

const CommandIds = {
  OpenExplorer: 'workbench.view.explorer',
  OpenScm: 'scmView:toggle',
  ToggleTerminal: 'terminal:new',
  OpenScorpioSidebar: 'artemis-sidebar.focus',
  ScorpioSidebarToggleVisibility: 'plugin-view-container:workbench.view.extension.artemis-sidebar-view:toggle-visibility',
} as const;

@injectable()
export class TheiaIDEGettingStartedWidget extends GettingStartedWidget {

  @inject(WindowService)
  protected readonly windowService: WindowService;

  @inject(CommandRegistry)
  protected readonly commandRegistry: CommandRegistry;


  protected async doInit(): Promise<void> {
    super.doInit();
    this.update();
  }

  protected onActivateRequest(msg: Message): void {
    super.onActivateRequest(msg);
    const htmlElement = document.getElementById("alwaysShowWelcomePage");
    if (htmlElement) {
      htmlElement.focus();
    }
  }

  protected render(): React.ReactNode {
    return (
      <div className="gs-container">
        <div className="gs-content-container gs-content-centered">
          <hr className="gs-hr" />
          <div className="flex-grid">
            <div className="col">
              {this.renderHeader()}
              <div>
                {this.renderActions()}
              </div>
            </div>
            <div className="col col-flex">
              {renderWhatIs(this.windowService)}
              {renderDocumentation(this.windowService)}
              {renderTickets(this.windowService)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  protected renderActions(): React.ReactNode {
    return (
      <div className="gs-container">
        <div className="flex-grid">
          <div className="col">{this.renderStart()}</div>
        </div>
        <div className="flex-grid">
          <div className="col">{this.renderSettings()}</div>
        </div>
      </div>
    );
  }

  protected renderHeader(): React.ReactNode {
    return (
      <div className="header-container">
          <h1 className="onboarding-header">
            Edu<span className="gs-blue-header">IDE</span>
          </h1>
          <h2 className="onboarding-subheader">
            Based on Eclipse Theia
          </h2>
      </div>
    );
  }

    /**
     * Render the `Start` section.
     * Displays a collection of "start-to-work" related commands like `open` commands and some other.
     */
  protected override renderStart(): React.ReactNode {
      const requireSingleOpen = isOSX || !environment.electron.is();
      const openScorpio = requireSingleOpen && <div className='gs-action-container'>
          <a
              role={'button'}
              tabIndex={0}
              onClick={this.doOpenScorpio}
              onKeyDown={this.doOpenScorpioEnter}>
              {nls.localizeByDefault('Open Problem Statement')}
          </a>
      </div>;
      const openSourceControl = requireSingleOpen && <div className='gs-action-container'>
          <a
              role={'button'}
              tabIndex={0}
              onClick={this.doOpenScm}
              onKeyDown={this.doOpenScmEnter}>
              {nls.localizeByDefault('Open Version Control')}
          </a>
      </div>;
      const showAllTerminals = requireSingleOpen && <div className='gs-action-container'>
          <a
              role={'button'}
              tabIndex={0}
              onClick={this.doOpenTerminal}
              onKeyDown={this.doOpenTerminalEnter}>
              {nls.localizeByDefault('Open new Terminal')}
          </a>
      </div>;

      return <div className='gs-section'>
          <h3 className='gs-section-header'><i className={codicon('folder-opened')}></i>{nls.localizeByDefault('Start')}</h3>
          {this.isScorpioExtensionInstalled && openScorpio}
          {openSourceControl}
          {showAllTerminals}
      </div>
  }

  /**
  * Trigger the view source control manager command.
  */
  protected doOpenScm = () => this.commandRegistry.executeCommand(CommandIds.OpenScm);
  protected doOpenScmEnter = (e: React.KeyboardEvent) => {
    if (this.isEnterKey(e)) {
        this.doOpenScm();
    }
  };

  /**
  * Trigger the open terminal command.
  */
  protected doOpenTerminal = () => this.commandRegistry.executeCommand(CommandIds.ToggleTerminal);
  protected doOpenTerminalEnter = (e: React.KeyboardEvent) => {
      if (this.isEnterKey(e)) {
          this.doOpenTerminal();
      }
  }

  /**
  * Trigger the open scorpio sidebar command. 
  */
  protected doOpenScorpio = () => this.commandRegistry.executeCommand(CommandIds.OpenScorpioSidebar);
  protected doOpenScorpioEnter = (e: React.KeyboardEvent) => {
      if (this.isEnterKey(e)) {
          this.doOpenScorpio();
      }
  }

  /**
   * Check if scorpio extension is installed.
   */
  protected get isScorpioExtensionInstalled(): boolean {
      const artemisSideBarViewId = CommandIds.ScorpioSidebarToggleVisibility;
      return this.commandRegistry.getCommand(artemisSideBarViewId) !== undefined;
  }

}
