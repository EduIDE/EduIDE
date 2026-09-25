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
import { EnvVariablesServer } from "@theia/core/lib/common/env-variables";

@injectable()
export class TheiaIDEAboutDialog extends AboutDialog {

  @inject(WindowService)
  protected readonly windowService: WindowService;

  @inject(EnvVariablesServer)
  protected readonly envVariablesServer: EnvVariablesServer;

  protected imageName = "";
  protected imageTag = "";

  constructor(
    @inject(AboutDialogProps) protected readonly props: AboutDialogProps
  ) {
    super(props);
  }

  protected async doInit(): Promise<void> {
    super.doInit();
    // Baked into the image at build time, so a running session can say which
    // image it came from. A hand-built image leaves these empty.
    this.imageName = (await this.envVariablesServer.getValue("EDUIDE_IMAGE_NAME"))?.value ?? "";
    this.imageTag = (await this.envVariablesServer.getValue("EDUIDE_IMAGE_TAG"))?.value ?? "";
    this.update();
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
        <div className="flex-grid">
          <div className="col">{this.renderImageVersion()}</div>
        </div>
      </div>
    );
  }

  protected renderImageVersion(): React.ReactNode {
    const tag = this.imageTag || "unknown";
    const image = this.imageName ? `${this.imageName}:${tag}` : tag;
    return (
      <div className="gs-section">
        <h3 className="gs-section-header">Version</h3>
        <div>
          Container image: <code>{image}</code>
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
