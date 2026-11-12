/**
 * Host half of the Changes panel (T3 Code's diff panel): reads and edits the git working tree of a
 * chat's working directory. One POST route, `{ method, payload }` -> `{ ok, value | error }`.
 *
 * Read:  status, diff, branches
 * Write: revertFile, revertHunk, commit, push, checkout, createPr, worktree
 */
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

export const name = 'local-changes';
export const inject = ['connection'];

const ROUTE = '/api/local-changes';
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((path) => existsSync(path)) ?? 'gh';
const MAX_FILES = 500;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_COUNT_BYTES = 1024 * 1024;

class UserError extends Error {}

function run(file, args, { cwd, timeout = 30_000, allowExit = [], input } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(file, args, {
      cwd,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
    }, (error, stdout, stderr) => {
      if (error && !allowExit.includes(error.code)) {
        const message = String(stderr || error.message).trim().split('\n').slice(-4).join('\n');
        reject(new UserError(message || `${file} failed`));
        return;
      }
      resolvePromise({ stdout: String(stdout), stderr: String(stderr), code: error?.code ?? 0 });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
const git = (root, args, options) => run('git', ['-c', 'core.quotepath=off', ...args], { cwd: root, ...options });

function requireDir(cwd) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new UserError('This chat has no working directory');
  }
  return cwd;
}

async function repoRoot(cwd) {
  try {
    return (await git(requireDir(cwd), ['rev-parse', '--show-toplevel'])).stdout.trim();
  } catch {
    return null;
  }
}

async function needRoot(cwd) {
  const root = await repoRoot(cwd);
  if (!root) throw new UserError('Not a git repository');
  return root;
}

/** A repository-relative path that stays inside the repository. */
function safePath(root, path) {
  if (typeof path !== 'string' || path === '') throw new UserError('Missing path');
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new UserError('Path is outside the repository');
  return rel;
}

async function hasHead(root) {
  return (await git(root, ['rev-parse', '--verify', '-q', 'HEAD'], { allowExit: [1] })).code === 0;
}

function parseNumstat(text) {
  const counts = new Map();
  const parts = text.split('\0');
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i];
    if (!record) continue;
    const [added, removed, path] = record.split('\t');
    let target = path;
    // Renames: "a\tr\t" then old and new paths as separate fields.
    if (path === '') {
      target = parts[i + 2];
      i += 2;
    }
    if (target === undefined) continue;
    counts.set(target, { added: added === '-' ? null : Number(added), removed: removed === '-' ? null : Number(removed) });
  }
  return counts;
}

async function countLines(root, path) {
  try {
    const absolute = join(root, path);
    const size = statSync(absolute).size;
    if (size > MAX_COUNT_BYTES) return { added: null, removed: 0 };
    const data = await readFile(absolute);
    if (data.includes(0)) return { added: null, removed: 0 };
    const text = data.toString('utf8');
    return { added: text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), removed: 0 };
  } catch {
    return { added: 0, removed: 0 };
  }
}

async function status({ cwd }) {
  const root = await repoRoot(cwd);
  if (!root) return { repo: false };
  const [porcelain, head, remotes] = await Promise.all([
    git(root, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']),
    hasHead(root),
    git(root, ['remote']).catch(() => ({ stdout: '' })),
  ]);
  const branch = { name: null, oid: null, upstream: null, ahead: 0, behind: 0 };
  const files = [];
  const fields = porcelain.stdout.split('\0');
  for (let i = 0; i < fields.length; i++) {
    const line = fields[i];
    if (!line) continue;
    if (line.startsWith('# branch.head ')) branch.name = line.slice(14) === '(detached)' ? null : line.slice(14);
    else if (line.startsWith('# branch.oid ')) branch.oid = line.slice(13);
    else if (line.startsWith('# branch.upstream ')) branch.upstream = line.slice(18);
    else if (line.startsWith('# branch.ab ')) {
      const match = /\+(\d+) -(\d+)/.exec(line);
      if (match) {
        branch.ahead = Number(match[1]);
        branch.behind = Number(match[2]);
      }
    } else if (line[0] === '1' || line[0] === '2' || line[0] === 'u') {
      const parts = line.split(' ');
      const xy = parts[1];
      const pathIndex = line[0] === '1' ? 8 : line[0] === '2' ? 9 : 10;
      const path = parts.slice(pathIndex).join(' ');
      const entry = { path, index: xy[0], worktree: xy[1], untracked: false, conflicted: line[0] === 'u' };
      if (line[0] === '2') {
        entry.oldPath = fields[i + 1];
        i += 1;
      }
      files.push(entry);
    } else if (line[0] === '?') {
      files.push({ path: line.slice(2), index: '?', worktree: '?', untracked: true, conflicted: false });
    }
  }
  const counts = head
    ? parseNumstat((await git(root, ['diff', 'HEAD', '--numstat', '-z', '-M'])).stdout)
    : new Map([...parseNumstat((await git(root, ['diff', '--cached', '--numstat', '-z'])).stdout), ...parseNumstat((await git(root, ['diff', '--numstat', '-z'])).stdout)]);
  const shown = files.slice(0, MAX_FILES);
  await Promise.all(shown.map(async (file) => {
    const count = file.untracked ? await countLines(root, file.path) : counts.get(file.path) ?? { added: 0, removed: 0 };
    file.added = count.added;
    file.removed = count.removed;
    file.binary = count.added === null;
    const code = file.conflicted ? 'U' : file.untracked ? '?' : file.oldPath ? 'R'
      : [file.index, file.worktree].includes('D') ? 'D' : file.index === 'A' ? 'A' : 'M';
    file.status = code;
  }));
  return {
    repo: true,
    root,
    cwd,
    hasHead: head,
    branch,
    hasRemote: remotes.stdout.trim() !== '',
    files: shown,
    truncated: files.length > MAX_FILES,
  };
}

async function diff({ cwd, path, untracked }) {
  const root = await needRoot(cwd);
  const rel = safePath(root, path);
  let result;
  if (untracked) {
    result = await git(root, ['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', rel], { allowExit: [1] });
  } else if (await hasHead(root)) {
    result = await git(root, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '-M', '-U3', '--', rel]);
  } else {
    result = await git(root, ['diff', '--cached', '--no-color', '--no-ext-diff', '-U3', '--', rel]);
  }
  const patch = result.stdout;
  return {
    patch: patch.length > MAX_PATCH_BYTES ? patch.slice(0, MAX_PATCH_BYTES) : patch,
    truncated: patch.length > MAX_PATCH_BYTES,
    binary: /^Binary files /m.test(patch),
  };
}

async function revertFile({ cwd, path, oldPath, untracked }) {
  const root = await needRoot(cwd);
  const rel = safePath(root, path);
  if (untracked) {
    await rm(join(root, rel), { force: true, recursive: false });
    return {};
  }
  const inHead = (await hasHead(root)) && (await git(root, ['cat-file', '-e', `HEAD:${rel}`], { allowExit: [1, 128] })).code === 0;
  if (inHead) {
    await git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', rel]);
  } else {
    // Added since HEAD: unstage, then remove the new file.
    await git(root, ['rm', '--cached', '-f', '-q', '--', rel], { allowExit: [128] });
    await rm(join(root, rel), { force: true });
  }
  if (typeof oldPath === 'string' && oldPath) {
    const oldRel = safePath(root, oldPath);
    await git(root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', oldRel], { allowExit: [1] });
  }
  return {};
}

/** Undo one hunk in the working tree: the client sends the file header plus that hunk. */
async function revertHunk({ cwd, patch }) {
  const root = await needRoot(cwd);
  if (typeof patch !== 'string' || !patch.includes('@@')) throw new UserError('Missing hunk');
  const dir = await mkdtemp(join(tmpdir(), 'local-changes-'));
  const file = join(dir, 'hunk.patch');
  try {
    await writeFile(file, patch.endsWith('\n') ? patch : `${patch}\n`);
    await git(root, ['apply', '-R', '--recount', '--whitespace=nowarn', file]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return {};
}

async function commit({ cwd, message, paths }) {
  const root = await needRoot(cwd);
  const text = String(message ?? '').trim();
  if (!text) throw new UserError('Write a commit message');
  // Selected files commit alone (`git commit -- <paths>`), even when other changes are staged.
  const rels = Array.isArray(paths) && paths.length > 0 ? [...new Set(paths.map((path) => safePath(root, path)))] : null;
  if (rels) await git(root, ['add', '-A', '--', ...rels]);
  else await git(root, ['add', '-A']);
  const staged = await git(root, ['diff', '--cached', '--quiet', ...(rels ? ['--', ...rels] : [])], { allowExit: [1] });
  if (staged.code === 0) throw new UserError('Nothing to commit');
  await git(root, ['commit', '-q', '-F', '-', ...(rels ? ['--', ...rels] : [])], { input: text });
  const sha = (await git(root, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
  return { sha };
}

async function push({ cwd }) {
  const root = await needRoot(cwd);
  const upstream = await git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowExit: [128] });
  if (upstream.code === 0) await git(root, ['push', '-q'], { timeout: 120_000 });
  else await git(root, ['push', '-q', '-u', 'origin', 'HEAD'], { timeout: 120_000 });
  return {};
}

async function branches({ cwd }) {
  const root = await needRoot(cwd);
  const { stdout } = await git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%00%(committerdate:relative)', 'refs/heads']);
  const current = (await git(root, ['branch', '--show-current'])).stdout.trim();
  const list = stdout.split('\n').filter(Boolean).slice(0, 200).map((line) => {
    const [branchName, when] = line.split('\0');
    return { name: branchName, when };
  });
  return { current, branches: list };
}

async function checkout({ cwd, branch, create }) {
  const root = await needRoot(cwd);
  const nameValue = String(branch ?? '').trim();
  if (!nameValue) throw new UserError('Missing branch name');
  await git(root, ['check-ref-format', '--branch', nameValue]).catch(() => {
    throw new UserError(`"${nameValue}" is not a valid branch name`);
  });
  await git(root, create ? ['switch', '-q', '-c', nameValue] : ['switch', '-q', nameValue]);
  return {};
}

async function createPr({ cwd, title, body, draft }) {
  const root = await needRoot(cwd);
  const existing = await run(GH, ['pr', 'view', '--json', 'url,state', '-q', 'select(.state=="OPEN") | .url'], { cwd: root, allowExit: [1] });
  if (existing.code === 0 && existing.stdout.trim()) return { url: existing.stdout.trim(), existed: true };
  await push({ cwd: root });
  const args = ['pr', 'create'];
  if (String(title ?? '').trim()) args.push('--title', String(title).trim(), '--body', String(body ?? ''));
  else args.push('--fill');
  if (draft) args.push('--draft');
  const { stdout } = await run(GH, args, { cwd: root, timeout: 120_000 });
  const url = stdout.trim().split('\n').reverse().find((line) => line.startsWith('https://')) ?? stdout.trim();
  return { url, existed: false };
}

export function apply(ctx) {
  /** Move the chat into a new git worktree through DSH's (experimental) worktree service. */
  const worktree = async ({ sessionId, name: worktreeName }) => {
    let worktrees;
    let agents;
    try {
      worktrees = ctx.get('worktrees');
      agents = ctx.get('agents');
    } catch {}
    if (!worktrees || !agents) throw new UserError('DSH worktree support is not enabled');
    const agent = agents.get(sessionId);
    if (!agent) throw new UserError('Send a message in this chat first, then try again');
    const options = String(worktreeName ?? '').trim() ? { name: String(worktreeName).trim() } : {};
    const created = await worktrees.create(agent, options);
    return { path: created.path, branch: created.branch };
  };

  const methods = { status, diff, branches, revertFile, revertHunk, commit, push, checkout, createPr, worktree };

  /**
   * A chat can move (e.g. into a worktree) after it starts; the client only knows its original
   * folder. Prefer the live Agent's effective working directory when the chat is running.
   */
  const effectiveCwd = (payload) => {
    if (typeof payload?.sessionId !== 'string') return payload?.cwd;
    try {
      const agent = ctx.get('agents')?.get(payload.sessionId);
      const directory = agent ? ctx.get('workingDirectory')?.get(agent.session) : undefined;
      if (typeof directory === 'string' && directory) return directory;
    } catch {}
    return payload.cwd;
  };

  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
      }
      const handler = Object.hasOwn(methods, body?.method) ? methods[body.method] : undefined;
      if (!handler) return Response.json({ ok: false, error: `Unknown method ${String(body?.method)}` });
      try {
        const payload = { ...(body.payload ?? {}) };
        payload.cwd = effectiveCwd(payload);
        return Response.json({ ok: true, value: (await handler(payload)) ?? {} });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!(error instanceof UserError)) console.warn(`[changes] ${body.method} failed`, error);
        return Response.json({ ok: false, error: message });
      }
    },
  }), 'changes: route');
}
