/**
 * Local dev-server discovery, like T3 Code's port scanner: listening TCP ports on this machine
 * that answer HTTP, minus system services, the browsers and DSH itself. Each server carries the
 * page title it serves so the browser panel can offer "Open localhost:5173 — Vite App".
 */
import { execFile } from 'node:child_process';

// Processes that listen on localhost but are never a project's dev server.
const IGNORED_COMMANDS = /^(rapportd|ControlCe|ControlCenter|sharingd|identitys|launchd|mDNSRespo|AirPlayXP|Spotify|Dropbox|Google|Chrome|Brave|Microsoft|firefox|Safari|com\.apple|DeepSeek|Electron|Code|Cursor|Figma|figma_age|Raycast|Slack|Discord|zoom|Notion|1Password|Docker|com\.docker|ollama|postgres|mysqld|redis-ser|mongod|ssh|cupsd|Adobe|Creative|logioptio|T3 Code)/i;
const PROBE_TIMEOUT_MS = 800;
const TITLE_BYTES = 64 * 1024;

function listListening() {
  return new Promise((resolve) => {
    execFile('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error && !stdout) return resolve([]);
      const found = new Map();
      let pid = 0;
      let command = '';
      for (const line of String(stdout).split('\n')) {
        const tag = line[0];
        const value = line.slice(1);
        if (tag === 'p') pid = Number(value);
        else if (tag === 'c') command = value;
        else if (tag === 'n') {
          // 127.0.0.1:5173, *:3000, [::1]:8080
          const match = /^(\*|127\.0\.0\.1|\[::1\]|\[::\]|0\.0\.0\.0|localhost):(\d+)$/.exec(value);
          if (!match) continue;
          const port = Number(match[2]);
          if (!found.has(port)) found.set(port, { port, pid, command });
        }
      }
      resolve([...found.values()]);
    });
  });
}

async function probe(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { accept: 'text/html,*/*' },
    });
    const type = response.headers.get('content-type') ?? '';
    let title = '';
    if (type.includes('html') && response.body) {
      const reader = response.body.getReader();
      let html = '';
      while (html.length < TITLE_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += Buffer.from(value).toString('utf8');
        if (/<\/title>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
      title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    } else {
      response.body?.cancel().catch(() => {});
    }
    return { ok: true, status: response.status, html: type.includes('html'), title };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The dev servers listening right now.
 * @param {Set<number>} excludePorts - ports to skip (DSH's own web server, the browser's debug port).
 */
export async function discoverServers(excludePorts = new Set()) {
  const listening = (await listListening()).filter((entry) =>
    entry.port >= 1024 && !excludePorts.has(entry.port) && !IGNORED_COMMANDS.test(entry.command));
  const probed = await Promise.all(listening.slice(0, 40).map(async (entry) => ({ ...entry, ...(await probe(entry.port)) })));
  return probed
    .filter((entry) => entry.ok && (entry.html || entry.status < 400))
    .map(({ port, command, title, html }) => ({ port, command, title, html, url: `http://localhost:${port}` }))
    .sort((a, b) => Number(b.html) - Number(a.html) || a.port - b.port);
}
