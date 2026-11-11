/**
 * Host half of the local Pull requests panel: one buffered RPC route that reads GitHub through the
 * signed-in `gh` CLI (GraphQL only, read-only) and finds the PRs a chat created or mentioned.
 */
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

export const name = 'local-pull-requests';
export const inject = ['connection'];

const ROUTE = '/api/local-pull-requests';
const GH = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((path) => existsSync(path)) ?? 'gh';
const TIMEOUT_MS = 20_000;
const MAX_CONCURRENT = 4;
const MAX_SUMMARIES = 40;
const PR_URL = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)/g;
const PR_LINE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?$/;

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* ---------------------------------------------------------------- process runner */

let running = 0;
const waiting = [];
async function limited(task) {
  if (running >= MAX_CONCURRENT) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function childEnv() {
  return { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1', GH_PAGER: '', PAGER: 'cat' };
}

/** Run `gh api graphql` with the request on stdin; GraphQL partial errors still return their data. */
function graphql(query, variables) {
  return limited(() => new Promise((resolve, reject) => {
    const child = spawn(GH, ['api', 'graphql', '--input', '-'], { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new RpcError('gh/timeout', 'GitHub request timed out after 20s'));
    }, TIMEOUT_MS);
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new RpcError('gh/unavailable', error.code === 'ENOENT' ? 'GitHub CLI (gh) is not installed: brew install gh' : error.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let body;
      try {
        body = stdout.trim() === '' ? undefined : JSON.parse(stdout);
      } catch {
        body = undefined;
      }
      if (body?.data !== undefined && body.data !== null) {
        resolve(body.data);
        return;
      }
      const text = `${stderr}\n${body?.errors?.map((error) => error.message).join('; ') ?? ''}`.trim();
      if (/auth login|not logged|authentication|HTTP 401/i.test(text)) {
        reject(new RpcError('gh/unauthenticated', 'GitHub CLI is not signed in. Run: gh auth login'));
        return;
      }
      reject(new RpcError('gh/failed', text.split('\n')[0] || `gh exited with code ${code}`));
    });
    child.stdin.end(JSON.stringify({ query, variables }));
  }));
}

function git(cwd, args) {
  return limited(() => new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: TIMEOUT_MS, env: childEnv() }, (error, stdout) => {
      resolve(error ? undefined : stdout.trim());
    });
  }));
}

/* ---------------------------------------------------------------- parsing helpers */

function parsePr(url) {
  const match = PR_LINE.exec(String(url).trim());
  return match === null ? undefined : { owner: match[1], name: match[2], number: Number(match[3]), url: canonical(match[1], match[2], match[3]) };
}
function canonical(owner, name, number) {
  return `https://github.com/${owner}/${name}/pull/${Number(number)}`;
}
function parseRemote(remote) {
  if (remote === undefined) return undefined;
  const match = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match === null ? undefined : { owner: match[1], name: match[2] };
}
async function originOf(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return undefined;
  return parseRemote(await git(cwd, ['remote', 'get-url', 'origin']));
}

/* ---------------------------------------------------------------- GraphQL fragments */

const SUMMARY_FIELDS = `
  number title url state isDraft additions deletions changedFiles updatedAt headRefName baseRefName
  reviewDecision mergeStateStatus
  author { login avatarUrl }
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

const DETAIL_FIELDS = `
  ${SUMMARY_FIELDS}
  bodyHTML createdAt mergedAt closedAt
  mergedBy { login avatarUrl }
  autoMergeRequest { mergeMethod }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login avatarUrl } ... on Team { name } ... on Bot { login avatarUrl } } } }
  latestOpinionatedReviews(first: 20) { nodes { state author { login avatarUrl } } }
  labels(first: 100) { nodes { name color } }
  checks: commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 100) { totalCount nodes {
    __typename
    ... on CheckRun { name status conclusion startedAt completedAt detailsUrl checkSuite { workflowRun { workflow { name } } } }
    ... on StatusContext { context state targetUrl description createdAt }
  } } } } } }
  files(first: 100) { totalCount nodes { path additions deletions changeType } }
  history: commits(last: 50) { totalCount nodes { commit { oid abbreviatedOid messageHeadline committedDate url author { name user { login avatarUrl } } } } }
  comments(last: 50) { nodes { author { login avatarUrl } bodyHTML createdAt url } }
  reviews(last: 50) { nodes { author { login avatarUrl } state bodyHTML submittedAt url } }`;

function summarize(pr) {
  if (pr === null || pr === undefined) return undefined;
  const { commits, ...rest } = pr;
  return {
    ...rest,
    author: pr.author ?? { login: 'ghost', avatarUrl: '' },
    repo: pr.repository?.nameWithOwner ?? '',
    checks: commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
  };
}

/** One aliased query (p0, p1, …) for every PR summary. */
async function summaries(refs) {
  const list = refs.slice(0, MAX_SUMMARIES);
  if (list.length === 0) return new Map();
  const declarations = list.map((_, index) => `$o${index}: String!, $r${index}: String!, $n${index}: Int!`).join(', ');
  const fields = list.map((_, index) => `p${index}: repository(owner: $o${index}, name: $r${index}) { pullRequest(number: $n${index}) { ${SUMMARY_FIELDS} } }`).join('\n');
  const variables = {};
  list.forEach((ref, index) => {
    variables[`o${index}`] = ref.owner;
    variables[`r${index}`] = ref.name;
    variables[`n${index}`] = ref.number;
  });
  const data = await graphql(`query(${declarations}) {\n${fields}\n}`, variables);
  const result = new Map();
  list.forEach((ref, index) => {
    const pr = summarize(data[`p${index}`]?.pullRequest);
    if (pr !== undefined) result.set(ref.url, pr);
  });
  return result;
}

async function branchPr(cwd) {
  const repo = await originOf(cwd);
  if (repo === undefined) return undefined;
  const branch = await git(cwd, ['symbolic-ref', '--short', 'HEAD']);
  if (branch === undefined || branch === '') return undefined;
  const data = await graphql(`query($o: String!, $r: String!, $b: String!) {
    repository(owner: $o, name: $r) { pullRequests(headRefName: $b, states: [OPEN], first: 5, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { number isCrossRepository } } }
  }`, { o: repo.owner, r: repo.name, b: branch });
  const node = data.repository?.pullRequests?.nodes?.find((item) => !item.isCrossRepository) ?? data.repository?.pullRequests?.nodes?.[0];
  return node === undefined ? undefined : { owner: repo.owner, name: repo.name, number: node.number, url: canonical(repo.owner, repo.name, node.number) };
}

/** PRs this chat created (a tool result line that is exactly a PR URL) and every other PR URL it mentions. */
async function chatPrs(ctx, sessionId) {
  const created = new Map();
  const mentioned = new Map();
  const query = ctx.get('sessionQuery');
  if (query === undefined || typeof sessionId !== 'string' || sessionId === '') return { created, mentioned };
  let docs = [];
  try {
    docs = await query.filterEvents(sessionId, [{ kind: 'text', text: 'github.com/' }]);
  } catch {
    return { created, mentioned };
  }
  for (const doc of docs) {
    const text = typeof doc.text === 'string' ? doc.text : '';
    if (doc.type === 'tool/result') {
      for (const line of text.split('\n')) {
        const ref = parsePr(line);
        if (ref !== undefined) created.set(ref.url, ref);
      }
    }
    for (const match of text.matchAll(PR_URL)) {
      const ref = { owner: match[1], name: match[2], number: Number(match[3]), url: canonical(match[1], match[2], match[3]) };
      mentioned.set(ref.url, ref);
    }
  }
  for (const url of created.keys()) mentioned.delete(url);
  return { created, mentioned };
}

/* ---------------------------------------------------------------- methods */

async function list(ctx, payload) {
  const manual = Array.isArray(payload?.manual) ? payload.manual : [];
  const unlinked = new Set((Array.isArray(payload?.unlinked) ? payload.unlinked : []).map((url) => parsePr(url)?.url).filter(Boolean));
  const [{ created, mentioned }, branch] = await Promise.all([
    chatPrs(ctx, payload?.sessionId),
    branchPr(payload?.cwd).catch(() => undefined),
  ]);
  const linked = new Map();
  const add = (ref, source) => {
    if (ref === undefined || unlinked.has(ref.url)) return;
    const entry = linked.get(ref.url) ?? { ref, sources: [] };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    linked.set(ref.url, entry);
  };
  for (const url of manual) add(parsePr(url), 'manual');
  for (const ref of created.values()) add(ref, 'created');
  add(branch, 'branch');
  const others = [...mentioned.values()].filter((ref) => !linked.has(ref.url));
  const found = await summaries([...[...linked.values()].map((entry) => entry.ref), ...others]);
  const prs = [...linked.values()].map((entry) => {
    const pr = found.get(entry.ref.url);
    return pr === undefined
      ? { url: entry.ref.url, number: entry.ref.number, repo: `${entry.ref.owner}/${entry.ref.name}`, missing: true, sources: entry.sources }
      : { ...pr, sources: entry.sources };
  });
  prs.sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
  const mentionedOut = others.map((ref) => found.get(ref.url) ?? { url: ref.url, number: ref.number, repo: `${ref.owner}/${ref.name}`, missing: true });
  return { prs, mentioned: mentionedOut, syncedAt: Date.now() };
}

const CHECK_ORDER = { fail: 0, pending: 1, cancel: 2, pass: 3, skip: 4 };
function checkBucket(node) {
  if (node.__typename === 'CheckRun') {
    if (node.status !== 'COMPLETED') return 'pending';
    switch (node.conclusion) {
      case 'SUCCESS': return 'pass';
      case 'CANCELLED': return 'cancel';
      case 'SKIPPED':
      case 'NEUTRAL':
      case 'STALE': return 'skip';
      default: return 'fail';
    }
  }
  switch (node.state) {
    case 'SUCCESS': return 'pass';
    case 'PENDING':
    case 'EXPECTED': return 'pending';
    default: return 'fail';
  }
}
function normalizeChecks(nodes) {
  const checks = (nodes ?? []).filter(Boolean).map((node) => {
    const bucket = checkBucket(node);
    if (node.__typename === 'CheckRun') {
      const started = node.startedAt ? Date.parse(node.startedAt) : NaN;
      const completed = node.completedAt ? Date.parse(node.completedAt) : NaN;
      return {
        name: node.name,
        workflow: node.checkSuite?.workflowRun?.workflow?.name ?? null,
        bucket,
        durationMs: Number.isFinite(started) && Number.isFinite(completed) ? completed - started : null,
        startedAt: node.startedAt ?? null,
        url: node.detailsUrl ?? null,
        description: null,
      };
    }
    return { name: node.context, workflow: null, bucket, durationMs: null, startedAt: node.createdAt ?? null, url: node.targetUrl ?? null, description: node.description ?? null };
  });
  checks.sort((left, right) => CHECK_ORDER[left.bucket] - CHECK_ORDER[right.bucket] || left.name.localeCompare(right.name));
  return checks;
}

function buildTimeline(pr) {
  const events = [{ kind: 'opened', at: pr.createdAt, actor: pr.author }];
  for (const node of pr.history?.nodes ?? []) {
    const commit = node.commit;
    events.push({
      kind: 'commit',
      at: commit.committedDate,
      actor: commit.author?.user ?? { login: commit.author?.name ?? 'unknown', avatarUrl: '' },
      title: commit.messageHeadline,
      sha: commit.abbreviatedOid,
      url: commit.url,
    });
  }
  for (const comment of pr.comments?.nodes ?? []) {
    events.push({ kind: 'comment', at: comment.createdAt, actor: comment.author ?? { login: 'ghost', avatarUrl: '' }, bodyHTML: comment.bodyHTML, url: comment.url });
  }
  for (const review of pr.reviews?.nodes ?? []) {
    if (review.state === 'PENDING') continue;
    events.push({ kind: 'review', at: review.submittedAt, actor: review.author ?? { login: 'ghost', avatarUrl: '' }, state: review.state, bodyHTML: review.bodyHTML, url: review.url });
  }
  if (pr.mergedAt) events.push({ kind: 'merged', at: pr.mergedAt, actor: pr.mergedBy ?? undefined });
  else if (pr.closedAt) events.push({ kind: 'closed', at: pr.closedAt });
  return events.filter((event) => event.at).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

async function detail(payload) {
  const ref = parsePr(payload?.url);
  if (ref === undefined) throw new RpcError('pr/invalid', 'Not a GitHub pull request URL');
  const data = await graphql(`query($o: String!, $r: String!, $n: Int!) {
    repository(owner: $o, name: $r) { pullRequest(number: $n) { ${DETAIL_FIELDS} } }
  }`, { o: ref.owner, r: ref.name, n: ref.number });
  const pr = data.repository?.pullRequest;
  if (pr === null || pr === undefined) throw new RpcError('pr/not-found', `Pull request ${ref.owner}/${ref.name}#${ref.number} was not found`);
  const rollup = pr.checks?.nodes?.[0]?.commit?.statusCheckRollup;
  const checks = normalizeChecks(rollup?.contexts?.nodes);
  const reviewers = new Map();
  for (const node of pr.reviewRequests?.nodes ?? []) {
    const reviewer = node.requestedReviewer;
    if (reviewer === null || reviewer === undefined) continue;
    const login = reviewer.login ?? reviewer.name;
    reviewers.set(login, { login, avatarUrl: reviewer.avatarUrl ?? '', state: 'REQUESTED', team: reviewer.__typename === 'Team' });
  }
  for (const node of pr.latestOpinionatedReviews?.nodes ?? []) {
    if (node.author === null) continue;
    reviewers.set(node.author.login, { login: node.author.login, avatarUrl: node.author.avatarUrl, state: node.state, team: false });
  }
  const summary = summarize(pr);
  return {
    ...summary,
    bodyHTML: pr.bodyHTML,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    autoMerge: pr.autoMergeRequest?.mergeMethod ?? null,
    reviewers: [...reviewers.values()],
    labels: pr.labels?.nodes ?? [],
    checks,
    checksTotal: rollup?.contexts?.totalCount ?? checks.length,
    files: pr.files?.nodes ?? [],
    filesTotal: pr.files?.totalCount ?? 0,
    commitsTotal: pr.history?.totalCount ?? 0,
    timeline: buildTimeline(pr),
  };
}

async function resolveLink(payload) {
  const input = String(payload?.input ?? '').trim();
  let ref = parsePr(input.replace(/\/(files|commits|checks)\/?$/, '').replace(/[?#].*$/, ''));
  if (ref === undefined) {
    const match = /^#?(\d+)$/.exec(input);
    if (match === null) throw new RpcError('pr/invalid', 'Enter a GitHub PR URL or #number');
    const repo = await originOf(payload?.cwd);
    if (repo === undefined) throw new RpcError('pr/no-repo', 'This chat folder has no GitHub origin remote; paste the full PR URL');
    ref = { owner: repo.owner, name: repo.name, number: Number(match[1]), url: canonical(repo.owner, repo.name, match[1]) };
  }
  const found = await summaries([ref]);
  const pr = found.get(ref.url);
  if (pr === undefined) throw new RpcError('pr/not-found', `Pull request ${ref.owner}/${ref.name}#${ref.number} was not found`);
  return { url: ref.url, pr };
}

/* ---------------------------------------------------------------- route */

export function apply(ctx) {
  const methods = {
    list: (payload) => list(ctx, payload),
    detail: (payload) => detail(payload),
    resolveLink: (payload) => resolveLink(payload),
  };
  ctx.get('connection').fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('invalid JSON', { status: 400 });
      }
      const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : '';
      const method = body?.payload?.method;
      const handler = Object.hasOwn(methods, method) ? methods[method] : undefined;
      try {
        if (handler === undefined) throw new RpcError('rpc/unknown-method', `Unknown method ${String(method)}`);
        const value = await handler(body.payload.payload ?? {});
        return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } });
      } catch (error) {
        const code = error instanceof RpcError ? error.code : 'internal';
        const message = error instanceof Error ? error.message : String(error);
        return Response.json({ type: 'server-response', rpcId, result: { ok: false, error: { code, message, details: {} } } });
      }
    },
  });
}
