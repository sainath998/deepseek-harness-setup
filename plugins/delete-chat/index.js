/**
 * Host half of the delete-chat bundle: permanently removes one chat (session) and its local copy.
 *
 * DSH has no session-delete operation, so this composes the registry's own operations around the file removal:
 * detach the session from every workspace, unpin it, delete its session folder and projection-cache file,
 * then drop it from the archive set. The client archives the session first (stopping its work) and calls this
 * over the public /api carrier, the same way other plugins reach their host half.
 */
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { readdir, rm, stat } from 'node:fs/promises';

export const name = 'local-delete-chat';
export const inject = ['connection', 'workspaceRegistry'];

const ROUTE_PATH = '/api/local-delete-chat';
const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RPC_ID = /^[A-Za-z0-9_$.:-]{1,128}$/;

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh');

/** Session folders named exactly `id`, one level below the sessions root (one per workspace path). */
async function sessionDirs(id) {
  const root = join(dshHome(), 'sessions');
  const found = [];
  let buckets = [];
  try { buckets = await readdir(root, { withFileTypes: true }); } catch { return found; }
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const candidate = join(root, bucket.name, id);
    try {
      if ((await stat(candidate)).isDirectory()) found.push(candidate);
    } catch { /* not in this bucket */ }
  }
  // Guard: every path must be <root>/<bucket>/<id> exactly.
  return found.filter((p) => basename(p) === id && dirname(dirname(p)) === root);
}

async function removeFiles(id) {
  const dirs = await sessionDirs(id);
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
  const cache = join(dshHome(), 'storages', 'session_projcache', 'sessions', `${id}.json`);
  await rm(cache, { force: true });
  return dirs;
}

async function deleteChat(ctx, id) {
  if (typeof id !== 'string' || !SESSION_ID.test(id)) throw new Error('invalid session id');
  const registry = ctx.get('workspaceRegistry');
  if (!registry) throw new Error('workspace registry unavailable');
  for (const workspace of registry.list()) {
    if (workspace.record?.sessionIds?.includes(id) || workspace.sessionIds.includes(id)) await workspace.detachSession(id);
  }
  await registry.unpinSession(id);
  const removed = await removeFiles(id);
  await registry.unarchiveSession(id);
  // A still-loaded session can flush once more after removal; sweep again shortly after.
  setTimeout(() => { removeFiles(id).catch(() => {}); }, 3000);
  setTimeout(() => { removeFiles(id).catch(() => {}); }, 15000);
  return { deleted: true, folders: removed.length };
}

export function apply(ctx) {
  const reply = (rpcId, result) => Response.json({ type: 'server-response', rpcId, result });
  const fetch = async (request) => {
    if (!request || request.method !== 'POST') return new Response('method not allowed', { status: 405 });
    let body;
    try { body = await request.json(); } catch { return new Response('body is not JSON', { status: 400 }); }
    const rpcId = typeof body?.rpcId === 'string' && RPC_ID.test(body.rpcId) ? body.rpcId : 'invalid-request';
    if (body?.type !== 'client-request' || typeof body.payload !== 'object' || body.payload === null) {
      return reply(rpcId, { ok: false, error: { code: 'gateway/bad-request', message: 'invalid request', details: {} } });
    }
    const { method, payload } = body.payload;
    if (method !== 'deleteChat') {
      return reply(rpcId, { ok: false, error: { code: 'gateway/bad-request', message: `unknown method ${String(method)}`, details: {} } });
    }
    try {
      return reply(rpcId, { ok: true, value: await deleteChat(ctx, payload?.sessionId) });
    } catch (error) {
      ctx.logger?.warn?.(`delete-chat: ${String(error?.message ?? error)}`);
      return reply(rpcId, { ok: false, error: { code: 'internal', message: String(error?.message ?? error), details: {} } });
    }
  };
  try {
    ctx.get('connection').fetch.register({ path: ROUTE_PATH, methods: ['POST'], requestBody: 'buffered', fetch });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/already registered|duplicate/.test(message)) ctx.logger?.warn?.(`delete-chat: route registration failed: ${message}`);
  }
}
