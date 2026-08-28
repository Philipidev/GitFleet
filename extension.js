const vscode = require('vscode');
const path = require('path');

/** @type {vscode.OutputChannel} */
let output;
/** @type {ReposProvider|undefined} */
let provider;
/** repository path -> terminal @type {Map<string, vscode.Terminal>} */
const terminals = new Map();

// -------------------------------------------------------------------- helpers

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const nameOf = (repo) => path.basename(repo.rootUri.fsPath);
const cfg = () => vscode.workspace.getConfiguration('gitFleet');

function log(line) {
  output.appendLine(`[${new Date().toTimeString().slice(0, 8)}] ${line}`);
}

/** one line, for a notification */
function errorMessage(e) {
  if (!e) return 'unknown error';
  const raw = e.stderr || e.stdout || e.message || String(e);
  return String(raw).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' | ');
}

/**
 * Everything git said, for the output channel. A failing pre-push hook prints
 * its reason on stdout and leaves stderr with a bare "failed to push some refs",
 * so dropping stdout — or truncating either — hides the actual cause.
 */
function errorDetail(e) {
  if (!e) return '';
  const parts = [];
  if (e.stderr) parts.push(String(e.stderr));
  if (e.stdout) parts.push(String(e.stdout));
  if (!parts.length) parts.push(String(e.message || e));
  if (e.gitErrorCode) parts.push(`gitErrorCode: ${e.gitErrorCode}`);
  if (typeof e.exitCode === 'number') parts.push(`exit code: ${e.exitCode}`);
  return parts.join('\n').replace(/\s+$/, '');
}

/** indents git's own output so it reads as a block under its log line */
function logDetail(detail) {
  if (!detail) return;
  for (const line of detail.split('\n')) output.appendLine(`    ${line.replace(/\s+$/, '')}`);
}

async function getApi() {
  const ext = vscode.extensions.getExtension('vscode.git');
  if (!ext) throw new Error('The built-in Git extension was not found.');
  if (!ext.isActive) await ext.activate();
  const api = ext.exports.getAPI(1);
  if (!api) throw new Error('Git API unavailable. Is "git.enabled" set to false?');
  return api;
}

function ignoredNames() {
  return (cfg().get('ignoreRepositories') || []).map((s) => String(s).toLowerCase());
}

/** open repositories, alphabetical, minus the ignored ones */
function listRepos(api) {
  const skip = ignoredNames();
  return api.repositories
    .filter((r) => !skip.includes(nameOf(r).toLowerCase()))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
}

function dirtyCount(repo) {
  const s = repo.state;
  return (
    (s.workingTreeChanges || []).length +
    (s.indexChanges || []).length +
    (s.mergeChanges || []).length +
    (s.untrackedChanges || []).length
  );
}

/** e.g. "develop  ↓3  ↑1  ●4" */
function headLabel(repo) {
  const h = repo.state.HEAD;
  if (!h) return 'no HEAD';
  const bits = [h.name || (h.commit ? h.commit.slice(0, 7) : '?')];
  if (h.behind) bits.push(`↓${h.behind}`);
  if (h.ahead) bits.push(`↑${h.ahead}`);
  const d = dirtyCount(repo);
  if (d) bits.push(`●${d}`);
  return bits.join('  ');
}

/**
 * Works out which repository an action targets. The argument shape depends on
 * where the command was invoked from: our TreeItem, the SourceControl object
 * from scm/sourceControl, a git API Repository, a Uri, or nothing (palette).
 */
function argToPath(arg) {
  if (!arg) return undefined;
  if (arg.repoPath) return arg.repoPath;
  const u =
    arg.rootUri ||
    (arg.repository && arg.repository.rootUri) ||
    (arg.provider && arg.provider.rootUri) ||
    arg.resourceUri ||
    arg;
  if (typeof u === 'string') return u;
  if (u && (u.fsPath || u.path)) return u.fsPath || u.path;
  return undefined;
}

async function resolveRepo(api, arg) {
  const target = norm(argToPath(arg));
  if (target) {
    const hit = api.repositories.find((r) => norm(r.rootUri.fsPath) === target);
    if (hit) return hit;
  }
  const repos = listRepos(api);
  if (!repos.length) {
    vscode.window.showInformationMessage('Git Fleet: no Git repository is open.');
    return undefined;
  }
  if (repos.length === 1) return repos[0];
  const pick = await vscode.window.showQuickPick(
    repos.map((r) => ({ label: nameOf(r), description: headLabel(r), repo: r })),
    { placeHolder: 'Pick a repository', matchOnDescription: true }
  );
  return pick && pick.repo;
}

// ----------------------------------------------------------------- operations

async function doFetch(repo) {
  await repo.fetch();
  // fetch does not refresh ahead/behind on its own
  try { await repo.status(); } catch { /* counters stay stale, not fatal */ }
  const behind = (repo.state.HEAD || {}).behind;
  return behind ? `ok, ${behind} commit(s) behind` : 'ok, up to date';
}

async function doPull(repo) {
  await repo.pull();
  try { await repo.status(); } catch { /* idem */ }
  return 'ok';
}

async function doPush(repo) {
  const h = repo.state.HEAD;
  if (h && h.name && !h.upstream) {
    const remote = (repo.state.remotes || [])[0];
    if (!remote) throw new Error('branch has no upstream and the repository has no remote');
    const answer = await vscode.window.showWarningMessage(
      `"${h.name}" in ${nameOf(repo)} has no upstream. Publish it to ${remote.name}?`,
      { modal: true },
      'Publish'
    );
    if (answer !== 'Publish') return 'cancelled';
    await repo.push(remote.name, h.name, true);
    return 'published';
  }
  await repo.push();
  return 'ok';
}

/** one repository, progress in the SCM view, errors surfaced but not thrown */
async function runOne(title, repo, worker) {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.SourceControl, title: `${title}: ${nameOf(repo)}` },
    async () => {
      try {
        const result = await worker(repo);
        log(`${title} ${nameOf(repo)}: ${result}`);
        if (provider) provider.refresh();
        return result;
      } catch (e) {
        const m = errorMessage(e);
        log(`${title} ${nameOf(repo)}: FAILED`);
        logDetail(errorDetail(e));
        const action = await vscode.window.showErrorMessage(
          `${title} failed in ${nameOf(repo)}: ${m}`,
          'Show Log',
          'Open Terminal'
        );
        if (action === 'Show Log') output.show(true);
        if (action === 'Open Terminal') openTerminal(repo);
      }
    }
  );
}

/** every repository, bounded parallelism, one failure never aborts the rest */
async function runAll(title, worker) {
  const api = await getApi();
  const repos = listRepos(api);
  if (!repos.length) {
    vscode.window.showInformationMessage('Git Fleet: no Git repository is open.');
    return;
  }

  const limit = Math.max(1, Number(cfg().get('concurrency')) || 6);
  const results = [];
  let cancelled = false;

  log(`=== ${title} – ${repos.length} repositories, ${limit} at a time ===`);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title, cancellable: true },
    async (progress, token) => {
      let next = 0;
      let done = 0;
      const step = 100 / repos.length;

      const worker_loop = async () => {
        while (next < repos.length) {
          if (token.isCancellationRequested) { cancelled = true; return; }
          const repo = repos[next++];
          try {
            results.push({ repo, status: (await worker(repo)) || 'ok' });
          } catch (e) {
            results.push({ repo, status: 'FAILED', error: errorMessage(e), detail: errorDetail(e) });
          }
          done++;
          progress.report({ increment: step, message: `${done}/${repos.length} – ${nameOf(repo)}` });
        }
      };

      await Promise.all(Array.from({ length: Math.min(limit, repos.length) }, worker_loop));
    }
  );

  if (provider) provider.refresh();
  report(title, results, cancelled);
}

function report(title, results, cancelled) {
  const width = Math.max(0, ...results.map((r) => nameOf(r.repo).length));
  results
    .sort((a, b) => nameOf(a.repo).localeCompare(nameOf(b.repo)))
    .forEach((r) => {
      const summary = r.error ? `${r.status} – ${r.error}` : r.status;
      log(`  ${nameOf(r.repo).padEnd(width)}  ${headLabel(r.repo).padEnd(26)}  ${summary}`);
      logDetail(r.detail);
    });

  const failed = results.filter((r) => r.status === 'FAILED');
  const behind = results.filter((r) => ((r.repo.state.HEAD || {}).behind || 0) > 0);

  const parts = [`${title}: ${results.length - failed.length} ok`];
  if (failed.length) parts.push(`${failed.length} failed`);
  if (behind.length) parts.push(`${behind.length} behind remote`);
  if (cancelled) parts.push('cancelled early');
  const summary = parts.join(', ') + '.';
  log(summary);

  const show = failed.length ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
  show(summary, 'Show Log').then((a) => { if (a === 'Show Log') output.show(true); });
}

// ------------------------------------------------------------------- terminal

function openTerminal(repo) {
  const dir = repo.rootUri.fsPath;
  const key = norm(dir);
  const reuse = cfg().get('terminal.reuse') !== false;

  let term = reuse ? terminals.get(key) : undefined;
  if (term && term.exitStatus !== undefined) { terminals.delete(key); term = undefined; }
  if (!term) {
    term = vscode.window.createTerminal({
      name: nameOf(repo),
      cwd: dir,
      iconPath: new vscode.ThemeIcon('source-control'),
    });
    if (reuse) terminals.set(key, term);
  }
  term.show(false);
  log(`terminal at ${dir}`);
}

// ------------------------------------------------------------------ tree view

class ReposProvider {
  constructor(api) {
    this.api = api;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this._timer = undefined;
    this._subs = new Map();
    this.resubscribe();
  }

  /** debounced: git state fires a lot while a fetch is running */
  refresh() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._emitter.fire(undefined), 250);
  }

  resubscribe() {
    for (const repo of this.api.repositories) {
      const key = norm(repo.rootUri.fsPath);
      if (this._subs.has(key)) continue;
      this._subs.set(key, repo.state.onDidChange(() => this.refresh()));
    }
    this.refresh();
  }

  getTreeItem(item) { return item; }

  getChildren(element) {
    if (element) return [];
    const repos = listRepos(this.api);
    if (!repos.length) {
      const empty = new vscode.TreeItem('No Git repository open');
      empty.iconPath = new vscode.ThemeIcon('info');
      return [empty];
    }
    return repos.map((repo) => {
      const h = repo.state.HEAD || {};
      const item = new vscode.TreeItem(nameOf(repo), vscode.TreeItemCollapsibleState.None);
      item.description = headLabel(repo);
      item.contextValue = 'gitFleetRepo';
      item.repoPath = repo.rootUri.fsPath;
      item.resourceUri = repo.rootUri;
      item.iconPath = new vscode.ThemeIcon('repo');
      item.tooltip = new vscode.MarkdownString(
        [
          `**${nameOf(repo)}**`,
          '',
          `- branch: \`${h.name || '?'}\``,
          `- upstream: \`${h.upstream ? `${h.upstream.remote}/${h.upstream.name}` : 'none'}\``,
          `- behind / ahead: ${h.behind || 0} / ${h.ahead || 0}`,
          `- local changes: ${dirtyCount(repo)}`,
          `- path: \`${repo.rootUri.fsPath}\``,
        ].join('\n')
      );
      return item;
    });
  }

  dispose() {
    if (this._timer) clearTimeout(this._timer);
    for (const d of this._subs.values()) d.dispose();
    this._subs.clear();
    this._emitter.dispose();
  }
}

// ----------------------------------------------------------------- activation

async function activate(context) {
  output = vscode.window.createOutputChannel('Git Fleet');
  context.subscriptions.push(output);

  let api;
  try {
    api = await getApi();
  } catch (e) {
    vscode.window.showErrorMessage(`Git Fleet: ${errorMessage(e)}`);
    return;
  }

  provider = new ReposProvider(api);
  context.subscriptions.push(
    provider,
    vscode.window.createTreeView('gitFleetRepos', { treeDataProvider: provider, showCollapseAll: false }),
    api.onDidOpenRepository(() => provider.resubscribe()),
    api.onDidCloseRepository(() => provider.resubscribe()),
    vscode.window.onDidCloseTerminal((t) => {
      for (const [k, v] of terminals) if (v === t) terminals.delete(k);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('gitFleet.ignoreRepositories')) provider.refresh();
    })
  );

  const register = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register('gitFleet.showLog', () => output.show(true));

  // Purely visual: the divider drawn between the built-in Git buttons and this
  // extension's buttons on each repository header. VS Code has no separator for
  // a toolbar group, so it is a command with a vertical-line icon and no action.
  register('gitFleet.separator', () => {});

  register('gitFleet.refreshView', async () => {
    await Promise.all(listRepos(api).map((r) => r.status().catch(() => {})));
    provider.resubscribe();
  });

  register('gitFleet.fetchAll', () => runAll('Fetch all', doFetch));

  register('gitFleet.pullAll', async () => {
    const repos = listRepos(api);
    if (!repos.length) {
      vscode.window.showInformationMessage('Git Fleet: no Git repository is open.');
      return;
    }
    if (cfg().get('pullAll.confirm') !== false) {
      const ok = await vscode.window.showWarningMessage(
        `Pull ${repos.length} repositories?`,
        { modal: true, detail: 'Each repository pulls its own current branch from its own upstream.' },
        'Pull all'
      );
      if (ok !== 'Pull all') return;
    }
    const skipDirty = cfg().get('pullAll.skipDirty') !== false;
    await runAll('Pull all', async (repo) => {
      if (skipDirty && dirtyCount(repo) > 0) return 'skipped, local changes';
      if (!(repo.state.HEAD || {}).upstream) return 'skipped, no upstream';
      return doPull(repo);
    });
  });

  register('gitFleet.openTerminal', async (arg) => {
    const repo = await resolveRepo(api, arg);
    if (repo) openTerminal(repo);
  });

  register('gitFleet.fetch', async (arg) => {
    const repo = await resolveRepo(api, arg);
    if (repo) await runOne('Fetch', repo, doFetch);
  });

  register('gitFleet.pull', async (arg) => {
    const repo = await resolveRepo(api, arg);
    if (repo) await runOne('Pull', repo, doPull);
  });

  register('gitFleet.push', async (arg) => {
    const repo = await resolveRepo(api, arg);
    if (repo) await runOne('Push', repo, doPush);
  });

  log(`activated, ${api.repositories.length} repository(ies) detected.`);
}

function deactivate() {
  terminals.clear();
}

module.exports = { activate, deactivate };
