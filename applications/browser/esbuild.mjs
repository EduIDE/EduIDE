/**
 * This file can be edited to adjust the esbuild process.
 * To reset, delete this file and rerun theia build again.
 */
import { browserOptions, watch, __dirname, join } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import { copy } from 'esbuild-plugin-copy';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import esbuild from 'esbuild';

browserOptions.plugins.push(
    copy({
        assets: [{
            from: join(__dirname, 'ico', '**', '*'),
            to: join(__dirname, 'lib', 'frontend')
        }]
    }),
    {
        name: 'favicon-link',
        setup(build) {
            build.onEnd(() => {
                const indexPath = path.join(__dirname, 'lib', 'frontend', 'index.html');
                if (fs.existsSync(indexPath)) {
                    let html = fs.readFileSync(indexPath, 'utf8');
                    if (!html.includes('rel="icon"')) {
                        html = html.replace('</head>', '  <link rel="icon" type="image/x-icon" href="./favicon.ico">\n</head>');
                        fs.writeFileSync(indexPath, html);
                    }
                }
            });
        }
    },
    {
        // Pre-compress the frontend assets. Theia's BackendApplication serves
        // `<asset>.gz` with `Content-Encoding: gzip` when the file exists
        // (serveGzipped in @theia/core), but the esbuild build emits none, so
        // the ~30MB bundle.js was served raw. The extensions below match core's
        // gzip-enabled routes; index.html is left raw (core does not gzip it).
        name: 'gzip-frontend-assets',
        setup(build) {
            build.onEnd(() => {
                const root = join(__dirname, 'lib', 'frontend');
                const exts = new Set(['.js', '.css', '.map', '.wasm', '.svg']);
                const walk = (dir, visit) => {
                    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                        const p = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            walk(p, visit);
                        } else {
                            visit(p, entry.name);
                        }
                    }
                };
                if (fs.existsSync(root)) {
                    // A .gz left by an earlier build would shadow a raw asset in watch mode,
                    // or outlive its removed asset otherwise, so clear them all first.
                    walk(root, (p, name) => name.endsWith('.gz') && fs.rmSync(p));
                    if (!watch) {
                        walk(root, (p, name) => {
                            if (exts.has(path.extname(name))) {
                                fs.writeFileSync(`${p}.gz`, zlib.gzipSync(fs.readFileSync(p), { level: 9 }));
                            }
                        });
                    }
                }
            });
        }
    }
);

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);

if (watch) {
    await Promise.all([
        browserContext.watch(),
        nodeContext.watch()
    ]);
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
    } catch {
        process.exit(1);
    }
}
