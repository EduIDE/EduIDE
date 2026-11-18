#!/usr/bin/env node
// Writes the template metadata of an image (control plane decision U12) at build time.
//
//   collect-template-json.js <out-file> <language> [templates-dir] [plugins-dir]
//
// variants: the project templates (templates/<id>/template.json), ordered by "order".
// includes: tools found on the PATH with the version they report, plus the editor
// extensions in plugins/. Tools that are not installed are left out.
// The image workflow copies the file into the OCI annotation io.eduide.template.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const [out, language, templatesDir = '/home/theia/templates', pluginsDir = '/home/theia/plugins'] = process.argv.slice(2);
if (!out || !language) {
    console.error('usage: collect-template-json.js <out-file> <language> [templates-dir] [plugins-dir]');
    process.exit(2);
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = file => fs.existsSync(file);

// [group, display name, command, args, languages]; the first version-like number in the output wins.
// Without languages the tool is listed whenever it is installed. The language runtimes are gated because
// the images carry others for their own use (node runs Theia, python3 comes with the OS).
const tools = [
    ['Language', 'Java', 'java', ['-version'], ['java-17', 'java-25']],
    ['Language', 'Python', 'python3', ['--version'], ['python']],
    ['Language', 'Node.js', 'node', ['--version'], ['javascript']],
    ['Language', 'C (gcc)', 'gcc', ['--version'], ['c']],
    ['Language', 'C (clang)', 'clang', ['--version'], ['c']],
    ['Language', 'Rust', 'rustc', ['--version']],
    ['Language', 'Go', 'go', ['version']],
    ['Build tools', 'Maven', 'mvn', ['-v']],
    ['Build tools', 'Gradle', 'gradle', ['-v']],
    ['Build tools', 'Make', 'make', ['--version']],
    ['Build tools', 'CMake', 'cmake', ['--version']],
    ['Build tools', 'Bazel', 'bazel', ['--version']],
    ['Build tools', 'Cargo', 'cargo', ['--version']],
    ['Build tools', 'npm', 'npm', ['--version'], ['javascript']],
    ['Testing', 'pytest', 'pytest', ['--version']],
    ['Debugging', 'GDB', 'gdb', ['--version']],
    ['Debugging', 'Valgrind', 'valgrind', ['--version']],
    ['Tools', 'Git', 'git', ['--version']],
    ['Tools', 'clangd', 'clangd', ['--version']],
    ['Tools', 'clang-format', 'clang-format', ['--version']],
    ['Tools', 'Ruff', 'ruff', ['--version']],
    ['Tools', 'uv', 'uv', ['--version']],
];

const groups = new Map();
const add = (group, name, version) => {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name, version });
};

for (const [group, name, cmd, args, languages] of tools) {
    if (languages && !languages.includes(language)) continue;
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000 });
    if (r.error || r.status !== 0) continue;
    const m = /\d+(\.\d+)+/.exec(`${r.stdout}\n${r.stderr}`);
    if (m) add(group, name, m[0]);
}

const plugins = exists(pluginsDir) ? fs.readdirSync(pluginsDir).sort() : [];
for (const id of plugins) {
    if (id.startsWith('vscode.')) continue; // built-in language grammars, not something to list
    const file = [path.join(pluginsDir, id, 'extension', 'package.json'), path.join(pluginsDir, id, 'package.json')].find(exists);
    if (!file) continue;
    const pkg = readJson(file);
    const display = typeof pkg.displayName === 'string' && !pkg.displayName.startsWith('%') ? pkg.displayName : pkg.name;
    add('Editor extensions', display, pkg.version);
}

const variants = [];
if (exists(templatesDir)) {
    for (const id of fs.readdirSync(templatesDir)) {
        const file = path.join(templatesDir, id, 'template.json');
        if (!exists(file)) continue;
        const t = readJson(file);
        variants.push({ id, name: t.label ?? id, description: t.description ?? '', logoUrl: '', order: t.order ?? 0 });
    }
    variants.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const order = ['Language', 'Build tools', 'Testing', 'Debugging', 'Tools', 'Editor extensions'];
const result = {
    imageVersion: process.env.APP_VERSION || '',
    variants: variants.map(({ order: _order, ...v }) => v),
    includes: order.filter(g => groups.has(g)).map(group => ({ group, items: groups.get(group) })),
};

const json = JSON.stringify(result);
if (Buffer.byteLength(json) > 64 * 1024) {
    console.error(`template metadata is ${Buffer.byteLength(json)} bytes, over the 64 KiB limit`);
    process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, json + '\n');
console.log(json);
