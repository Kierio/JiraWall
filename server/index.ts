import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import type { DashboardConfig, ServerStatus } from '../shared/types.js';
import { defaultConfig, normalizeConfig } from './defaults.js';
import { loadEnv } from './env.js';
import { emptyEngineState, EventEngine, type EngineState } from './events/engine.js';
import { JiraClient, type JiraApi } from './jira/client.js';
import { MockJira } from './mock/jira-mock.js';
import { registerApi } from './routes/api.js';
import { WidgetScheduler } from './scheduler.js';
import { SseHub } from './sse.js';
import { JsonFile } from './store.js';

const env = loadEnv();

let jira: JiraApi;
if (env.mock) {
  const mock = new MockJira(env.jiraBaseUrl);
  mock.start();
  jira = mock;
} else {
  jira = new JiraClient(env);
}

const configFile = new JsonFile<DashboardConfig>(path.join(env.dataDir, 'config.json'), defaultConfig);
// Mock mode keeps separate event state so switching to real Jira re-seeds cleanly.
const stateFile = new JsonFile<EngineState>(path.join(env.dataDir, env.mock ? 'state.mock.json' : 'state.json'), emptyEngineState);

let config = normalizeConfig(configFile.read());
if (!fs.existsSync(configFile.file)) await configFile.write(config);

const hub = new SseHub();

const status: ServerStatus = { mode: env.mock ? 'mock' : 'live', jira: 'unknown', jiraBaseUrl: env.jiraBaseUrl };
const setStatus = (patch: Partial<ServerStatus>) => {
  const before = JSON.stringify(status);
  Object.assign(status, patch);
  if (!patch.lastError && 'lastError' in patch) delete status.lastError;
  if (JSON.stringify(status) !== before) hub.broadcast({ type: 'status', status });
};
const onJiraResult = (error?: string) => setStatus(error ? { jira: 'error', lastError: error } : { jira: 'ok', lastError: undefined });

const scheduler = new WidgetScheduler(jira, hub, env.jiraBaseUrl, onJiraResult);
const engine = new EventEngine({
  jira,
  hub,
  store: stateFile,
  jiraBaseUrl: env.jiraBaseUrl,
  onJiraResult,
  onPoll: (at) => {
    status.lastEventPollAt = at; // not broadcast on its own; it rides along with the next status change
  },
});

scheduler.apply(config);
engine.apply(config);
engine.start();

const app = Fastify({ logger: { level: 'warn' } });
await app.register(cookie);

registerApi(app, {
  adminPassword: env.adminPassword,
  jiraBaseUrl: env.jiraBaseUrl,
  jira,
  hub,
  scheduler,
  engine,
  getConfig: () => config,
  saveConfig: async (next) => {
    config = next;
    await configFile.write(config);
    scheduler.apply(config);
    engine.apply(config);
    hub.broadcast({ type: 'config', config });
  },
  getStatus: () => status,
});

// Serve the built frontend (npm run build). In development Vite serves it instead.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
if (fs.existsSync(path.join(webRoot, 'index.html'))) {
  await app.register(fastifyStatic, { root: webRoot, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    // SPA routes (/screen/1, /admin) get index.html; missing files and API paths get a real 404.
    const pathname = req.url.split('?')[0];
    if (req.method === 'GET' && !pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(pathname)) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
} else {
  app.get('/', async () => ({ message: 'API is running. Start the UI with "npm run dev" (http://localhost:5173) or run "npm run build".' }));
}

const shutdown = async () => {
  engine.stop();
  scheduler.stop();
  hub.close();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.port, host: env.host });
console.log(`Jira dashboard ${env.mock ? '(MOCK DATA) ' : ''}listening on http://${env.host === '0.0.0.0' ? 'localhost' : env.host}:${env.port}`);
console.log(`  Screens: /screen/1  /screen/2    Admin: /admin`);
