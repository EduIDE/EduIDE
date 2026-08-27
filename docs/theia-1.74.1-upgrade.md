# Theia 1.74.1 upgrade

Date: 2026-08-27. Branch: `feat/esbuild-bundling` (PR #155, on top of the esbuild migration).

## What changed

### Dependency updates

- All `@theia/*` packages: 1.72.1 -> 1.74.1 (root, both applications, all three theia-extensions).
- `@theia/preview` removed from the browser app: the package was discontinued upstream after 1.72; Markdown preview is covered by the VS Code built-ins.
- Electron toolchain aligned with upstream `theia-ide` v1.74.100: electron 39.8.7 -> 42.3.0, electron-chromedriver ^28.3.3, electron-mocha ^13.1.0, mocha ^11. electron-builder and app-builder-lib go to 26.15.3 instead of upstream's 26.0.12, because app-builder-lib < 26.15.0 carries GHSA-7g7r-gx96-252g (high) and fails dependency review.
- Root devDependencies aligned with upstream v1.74.100 (lerna ^9, node-gyp ^11.5, eslint plugin refreshes).
- Resolutions aligned with upstream v1.74.100, plus targeted `tar` pins (`**/scanoss/tar`, `**/lerna/tar`, `**/node-gyp/tar`, `**/pacote/tar` -> `^7.5.19`). This removes the vulnerable tar 7.5.7/7.5.15 entries that failed the dependency-review CI check (GHSA-23hp-3jrh-7fpw and friends). Note: the globs also force a few `tar@^6` requesters (electron packaging tooling) onto tar 7, the same cross-major forcing upstream applies to pacote.
- `@theia/cli@1.70.0` literal bumped to `@theia/cli@1.74.1` in all 14 ToolDockerfiles (see the AGENTS.md trap: language images pin the CLI literally and do not read the root package.json).
- `lerna.json`: removed the `useWorkspaces` option (deleted in lerna 9; workspaces are resolved from package.json automatically).
- TypeScript in the three theia-extensions: ^4.5.5 -> ~5.9.3 (matching upstream; the zod v4 typings pulled in via @theia/ai-mcp need modern TypeScript syntax).
- `react`/`react-dom` ^18.3.1 (+ types) added to both applications, matching upstream: Theia 1.74 frontend modules import react directly, and esbuild fails to resolve it without a direct dependency.

### AI features stay disabled

Since Theia 1.74, `@theia/plugin-ext` has a hard dependency on `@theia/ai-core` and `@theia/ai-mcp` (for the VS Code `lm` plugin API and MCP support), so both packages are now bundled transitively - they cannot be excluded. On top of that, the default `AIActivationServiceImpl` in `@theia/ai-core` reports AI as *active*; the preference-based off-by-default switch lives in `@theia/ai-ide`, which EduIDE does not ship.

Countermeasures, all in `theia-extensions/product`:

- `DisabledAIActivationService` (in `theia-ide-contribution.tsx`) rebinds `AIActivationService` with `isActive = false`, `canRun = false`, and sets the `ai-features.AiEnable.enableAI` context key to `false`, hiding everything gated behind it. This is the adopter override explicitly invited by the Theia source.
- `ViewsFilter` additionally filters the remaining AI contribution surface: `PromptTemplateContribution`, `AiCoreCommandContribution` (ai-core), `MCPConfigurationCommandContribution`, `McpFrontendApplicationContribution`, `InstallMcpUriHandler` (ai-mcp), and the `ai-mcp-configuration-container-widget` widget factory.
- `DisabledFeaturesContribution` blocks the MCP configuration widget at runtime as defense in depth.

No AI provider packages (`@theia/ai-openai`, `@theia/ai-anthropic`, ...) and no chat UI (`@theia/ai-chat`, `@theia/ai-chat-ui`, `@theia/ai-ide`) are in any dependency list, so no language models can be registered and the `vscode.lm` plugin API sees an empty model list.

## Not changed deliberately

- App/extension versions stay at 1.70.2xx (upstream is at 1.74.100); bumping them ripples into Docker tagging and the cross-references between the workspace packages, and is a release decision.
- `lerna.json` still says 1.70.200 (pre-existing inconsistency with root package.json, tracked in AGENTS.md).
- `yarn lint` failures in `scripts/merge-package-json.js` (no-null rule) predate this change.

## Dependency hardening (follow-up PR)

A `yarn audit --level high` sweep of the full lockfile after the upgrade showed 34 packages with high or critical advisories. Fixes, in order of preference:

- **In-range lockfile refresh** (no package.json change): removed the stale lock entries for axios, basic-ftp, engine.io, express-rate-limit (carries the ip-address 10.x fix), fast-uri, flatted, form-data, glob 10, handlebars, hono, @hono/node-server, @grpc/grpc-js, lodash, minimatch 9, nanoid, path-to-regexp 8, picomatch 4, postcss, protobufjs, socket.io-parser, tar-fs, undici and let yarn re-resolve to the patched releases.
- **Dropped the `**/multer` resolution**: Theia 1.74 requests multer ^2.2.0 itself (upstream dropped the same resolution); the 1.4.4-lts.1 pin was holding back the fix for three DoS advisories in the file upload path.
- **Targeted resolutions**: ws ^8.21.0 for the socket.io family (engine.io, engine.io-client, socket.io-adapter pin ~8.x minors), adm-zip ^0.6.0 under scanoss.
- **Updater extension**: electron-updater 6.6.2 -> 6.8.9 and builder-util-runtime 9.3.1 -> 9.7.0 (token-leak advisory; desktop-only code path).

Remaining, deliberately not fixed: `decompress` 4.2.1 and `image-size` 0.5.5 (no patched release exists; both only reachable via `@theia/cli` at build time) and `ip-address` 9.0.5 (cross-major fix only; reachable via lerna's socks-proxy-agent at build time). Old-major library lines (glob 7/8, minimatch 3/5, picomatch 2, ws 7) have no patch in their major and only serve dev tooling.

`@theia/scanoss` drags basic-ftp, protobufjs, @grpc/grpc-js, and adm-zip into the shipped browser app. All are patched now, but removing the package entirely would shrink the attack surface; left as a separate product decision.

## Verification

- `PUPPETEER_SKIP_DOWNLOAD=true yarn install` - clean, lockfile regenerated.
- `yarn build` (extensions + browser + electron apps via esbuild).
- `node_modules/@theia` contains only `ai-core` and `ai-mcp` of the AI suite (transitive, neutralized as above).
- Local docker build of `base` and `java-25` images.
