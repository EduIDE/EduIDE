/********************************************************************************
 * Copyright (C) 2020 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from "react";
import {
  AboutDialog,
  AboutDialogProps,
  ABOUT_CONTENT_CLASS,
} from "@theia/core/lib/browser/about-dialog";
import { injectable, inject } from "@theia/core/shared/inversify";
import {
  renderWhatIs,
  renderDocumentation,
} from "./branding-util";
import { WindowService } from "@theia/core/lib/browser/window/window-service";

@injectable()
export class TheiaIDEAboutDialog extends AboutDialog {

  @inject(WindowService)
  protected readonly windowService: WindowService;

  constructor(
    @inject(AboutDialogProps) protected readonly props: AboutDialogProps
  ) {
    super(props);
  }

  protected async doInit(): Promise<void> {
    super.doInit();
  }

  protected render(): React.ReactNode {
    return <div className={ABOUT_CONTENT_CLASS}>{this.renderContent()}</div>;
  }

  protected renderContent(): React.ReactNode {
    return (
      <div className="ad-container">
        <div className="ad-float">
          {this.renderExtensions()}
        </div>
        {this.renderTitle()}
        <hr className="gs-hr" />
        <div className="flex-grid">
          <div className="col">{renderWhatIs(this.windowService)}</div>
        </div>
        <div className="flex-grid">
          <div className="col">{renderDocumentation(this.windowService)}</div>
        </div>
      </div>
    );
  }

  protected renderTitle(): React.ReactNode {
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

}
