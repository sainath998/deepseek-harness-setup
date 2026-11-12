/**
 * Host half of the agent browser: exposes the shared ego Chrome (see hub.js) to the Client over
 * authenticated exact Fetch routes, and gives agents a tool to show the panel the user watches.
 *
 *   GET  /api/local-agent-browser/events   NDJSON: state, agent activity, reveal requests
 *   GET  /api/local-agent-browser/frames   NDJSON: the viewed tab's JPEG frames (latest wins)
 *   POST /api/local-agent-browser/input    { events: [...] } mouse/wheel/key/text, replayed in order
 *   POST /api/local-agent-browser/command  { op, args } navigation, tabs, viewport, dialogs, launch
 */
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { BrowserHub, CAPTURES_DIR } from './hub.js';

export const name = 'local-agent-browser';
export const inject = ['connection'];

const BASE = '/api/local-agent-browser';
const KEEPALIVE_MS = 15_000;
const encoder = new TextEncoder();
const line = (value) => encoder.encode(`${JSON.stringify(value)}\n`);

const STREAM_HEADERS = {
  'content-type': 'application/x-ndjson; charset=utf-8',
  // no-transform keeps the web carrier from gzip-buffering the stream.
  'cache-control': 'no-store, no-transform',
  'x-accel-buffering': 'no',
};

function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * A long-lived NDJSON response. `subscribe(push)` starts the feed and returns its disposer.
 * With `latestOnly`, a slow reader gets only the newest pending value; older ones are dropped.
 */
function ndjson(request, subscribe, { latestOnly = false } = {}) {
  let controller = null;
  let pending = [];
  let wanted = false;
  let stop = () => {};
  let keepalive;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    clearInterval(keepalive);
    stop();
    try {
      controller?.close();
    } catch {}
  };
  const flush = () => {
    if (!controller || pending.length === 0) return;
    wanted = false;
    const values = pending;
    pending = [];
    for (const value of values) {
      try {
        controller.enqueue(line(value));
      } catch {}
    }
  };
  const push = (value) => {
    if (ended) return;
    if (latestOnly) pending = [value];
    else pending.push(value);
    if (wanted || !latestOnly) flush();
  };
  const body = new ReadableStream({
    start(c) {
      controller = c;
      stop = subscribe(push) ?? (() => {});
      keepalive = setInterval(() => {
        try {
          controller.enqueue(line({ t: 'ping' }));
        } catch {}
      }, KEEPALIVE_MS);
      request.signal?.addEventListener('abort', end, { once: true });
    },
    pull() {
      if (pending.length > 0) flush();
      else wanted = true;
    },
    cancel() {
      ended = true;
      clearInterval(keepalive);
      stop();
    },
  }, { highWaterMark: 1 });
  return new Response(body, { status: 200, headers: STREAM_HEADERS });
}

export function apply(ctx) {
  let profile;
  try {
    profile = ctx.get('profileContext')?.name;
  } catch {}
  const hub = new BrowserHub({ preferredProfile: profile });
  // DSH's own web server is not a dev server.
  hub.excludePortsProvider = () => {
    try {
      return [ctx.get('webServer')?.port];
    } catch {
      return [];
    }
  };
  ctx.effect(() => () => hub.dispose(), 'agent-browser: hub');

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${BASE}/events`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => ndjson(request, (push) => hub.addEventListener(push)),
  }), 'agent-browser: events route');

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${BASE}/frames`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => ndjson(request, (push) => hub.addFrameViewer(push), { latestOnly: true }),
  }), 'agent-browser: frames route');

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${BASE}/input`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const body = await readJson(request);
      hub.input(body.events).catch(() => {});
      return json(200, { ok: true });
    },
  }), 'agent-browser: input route');

  // Thumbnails of screenshots and picked elements; only files inside the captures folder.
  ctx.effect(() => ctx.connection.fetch.register({
    path: `${BASE}/capture`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const requested = resolve(new URL(request.url).searchParams.get('path') ?? '');
      if (!requested.startsWith(resolve(CAPTURES_DIR) + sep) || !requested.endsWith('.png')) return new Response('not found', { status: 404 });
      try {
        return new Response(await readFile(requested), { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    },
  }), 'agent-browser: capture route');

  ctx.effect(() => ctx.connection.fetch.register({
    path: `${BASE}/command`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const body = await readJson(request);
      try {
        const value = await hub.command(String(body.op ?? ''), body.args ?? {});
        return json(200, { ok: true, value: value ?? {} });
      } catch (error) {
        return json(200, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  }), 'agent-browser: command route');

  registerTool(ctx, hub);
}

/** `sidebar_browser`: lets an agent put the shared browser in front of the user. */
function registerTool(ctx, hub) {
  ctx.plugin({
    name: 'local-agent-browser-tool',
    inject: ['tools'],
    async apply(sub) {
      let defineTool;
      try {
        ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
      } catch (error) {
        console.warn('[agent-browser] dsh-tools unavailable; sidebar_browser tool not registered', error);
        return;
      }
      const tool = defineTool({
        name: 'sidebar_browser',
        description: [
          "Show or steer the in-app browser the user watches in DSH's right sidebar. It is the same",
          'Chrome the bcdp_* tools and the ego runtime drive, so anything done there is visible to the user live.',
          'action=show opens the browser in the right sidebar; float shows it as a floating preview over the chat;',
          'hide dismisses the floating preview (the browser keeps running); open navigates the tab the user is',
          'viewing to url (new_tab=true opens a new tab), starting the browser if needed; status lists the tabs.',
        ].join(' '),
        parameters: {
          action: {
            type: 'string',
            enum: ['show', 'float', 'hide', 'open', 'status'],
            required: true,
            description: 'What to do with the browser panel.',
          },
          url: { type: 'string', description: 'For action=open: the address or search text.' },
          new_tab: { type: 'boolean', description: 'For action=open: open url in a new tab.' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true, properties: { ok: { type: 'boolean', required: true } } },
          render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        },
        timeoutMs: 60_000,
        execute: async (args) => {
          const viewers = hub.eventListeners.size;
          if (args.action === 'open') {
            if (typeof args.url !== 'string' || args.url.trim() === '') return { ok: false, error: 'url is required for action=open' };
            if (args.new_tab === true) await hub.newTab(args.url);
            else await hub.command('navigate', { url: args.url });
            // The agent drove this, not the viewer: let the next tab change read as agent activity.
            hub.userIntentUntil = 0;
            hub.emit({ t: 'reveal', mode: 'auto' });
          } else if (args.action === 'show') {
            hub.emit({ t: 'reveal', mode: 'sidebar' });
          } else if (args.action === 'float') {
            hub.emit({ t: 'reveal', mode: 'float' });
          } else if (args.action === 'hide') {
            hub.emit({ t: 'reveal', mode: 'hide' });
          }
          const state = hub.snapshot();
          return {
            ok: true,
            browserRunning: state.connected,
            viewerWindows: viewers,
            activeTab: state.tabs.find((tab) => tab.id === state.activeId) ?? null,
            tabs: state.tabs,
            ...(viewers === 0 ? { note: 'No DSH window is listening, so nothing was shown on screen.' } : {}),
          };
        },
      });
      sub.effect(() => sub.tools.register(tool), 'agent-browser: sidebar_browser tool');
    },
  });
}
