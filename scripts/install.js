#!/usr/bin/env node
// Builds the extension into a .vsix and installs it into VS Code.
//
//   node scripts/install.js
//   node scripts/install.js --keep      leave the .vsix behind after installing
//
// Needs the `code` CLI on PATH (VS Code: "Shell Command: Install 'code' command
// in PATH") and network access the first time, for `npx @vscode/vsce`.

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const id = `${manifest.publisher}.${manifest.name}`;
const vsix = path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const keep = process.argv.includes('--keep');

// npx and code are .cmd shims on Windows, which execFile cannot launch directly.
const win = process.platform === 'win32';
const run = (cmd, args) => {
  const r = spawnSync(win ? `${cmd}.cmd` : cmd, args, { cwd: root, stdio: 'inherit', shell: win });
  if (r.error && r.error.code === 'ENOENT') throw new Error(`${cmd} was not found on PATH.`);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited with ${r.status}.`);
};

try {
  execFileSync(win ? 'code.cmd' : 'code', ['--version'], { stdio: 'ignore', shell: win });
} catch {
  console.error(
    'The `code` CLI was not found on PATH.\n' +
      'In VS Code run the command "Shell Command: Install \'code\' command in PATH", then try again.'
  );
  process.exit(1);
}

console.log(`Packaging ${id} ${manifest.version} ...`);
run('npx', ['--yes', '@vscode/vsce', 'package', '--no-dependencies', '--out', vsix]);

console.log(`\nInstalling ${path.basename(vsix)} ...`);
run('code', ['--install-extension', vsix, '--force']);

if (!keep) fs.rmSync(vsix, { force: true });

console.log(
  `\n${id} ${manifest.version} installed.\n` +
    'Run "Developer: Reload Window" in VS Code to load it.\n' +
    `Uninstall later with: code --uninstall-extension ${id}`
);
