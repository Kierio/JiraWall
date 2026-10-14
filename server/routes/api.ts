import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DashboardConfig, ServerStatus } from '../../shared/types.js';
import { normalizeConfig, normalizeRule, normalizeWidget } from '../defaults.js';
import type { EventEngine } from '../events/engine.js';
import type { JiraApi } from '../jira/client.js';
import type { WidgetScheduler } from '../scheduler.js';
import type { SseHub } from '../sse.js';
import { resolveWidget, toIssueSummary, widgetJql } from '../widgets/resolvers.js';

export interface ApiDeps {
  adminPassword: string;
  jiraBaseUrl: string;
  jira: JiraApi;
  hub: SseHub;
  scheduler: WidgetScheduler;
  engine: EventEngine;
  getConfig: () => DashboardConfig;
  saveConfig: (config: DashboardConfig) => Promise<void>;
  getStatus: () => ServerStatus;
}

const COOKIE = 'jd_admin';
const SESSION_MS = 30 * 24 * 3_600_000;

const sha = (s: string) => crypto.createHash('sha256').update(s).digest();

export function registerApi(app: FastifyInstance, deps: ApiDeps) {
  const sessions = new Map<string, number>(); // token -> expiry

  const isAdmin = (req: FastifyRequest) => {
    const token = req.cookies[COOKIE];
    const expiry = token ? sessions.get(token) : undefined;
    return expiry !== undefined && expiry > Date.now();
  };

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req)) return reply.code(401).send({ error: 'Log in to the admin page first.' });
  };

  const fail = (reply: FastifyReply, err: unknown, code = 400) => reply.code(code).send({ error: (err as Error).message ?? String(err) });

  // ---- public ----

  app.get('/api/stream', (req, reply) => {
    reply.hijack();
    deps.hub.add(reply.raw, [
      { type: 'config', config: deps.getConfig() },
      { type: 'widgets', states: deps.scheduler.states() },
      { type: 'recent-events', events: deps.engine.recent() },
      { type: 'status', status: deps.getStatus() },
    ]);
  });

  app.get('/api/config', async () => deps.getConfig());
  app.get('/api/status', async () => deps.getStatus());
  app.get('/api/session', async (req) => ({ authenticated: isAdmin(req) }));

  app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
    const ok = crypto.timingSafeEqual(sha(req.body?.password ?? ''), sha(deps.adminPassword));
    if (!ok) {
      await new Promise((r) => setTimeout(r, 750)); // slow down guessing
      return reply.code(401).send({ error: 'Wrong password' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, Date.now() + SESSION_MS);
    reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: SESSION_MS / 1000 });
    return { authenticated: true };
  });

  app.post('/api/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) sessions.delete(token);
    reply.clearCookie(COOKIE, { path: '/' });
    return { authenticated: false };
  });

  // ---- admin ----

  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);

    admin.put('/api/config', async (req, reply) => {
      try {
        const config = normalizeConfig(req.body);
        await deps.saveConfig(config);
        return config;
      } catch (err) {
        return fail(reply, err, 500);
      }
    });

    admin.post<{ Body: { jql?: string; useScope?: boolean } }>('/api/test-jql', async (req, reply) => {
      const jql = widgetJql(req.body?.useScope, req.body?.jql ?? '', deps.getConfig().settings.projectScope);
      try {
        const [count, sample] = await Promise.all([
          deps.jira.count(jql),
          deps.jira.search(jql, ['summary', 'status', 'priority', 'issuetype', 'assignee'], 5),
        ]);
        return { jql, count, issues: sample.issues.map((i) => toIssueSummary(i, deps.jiraBaseUrl)) };
      } catch (err) {
        return reply.code(400).send({ jql, error: (err as Error).message });
      }
    });

    admin.post<{ Body: { widget?: unknown } }>('/api/widgets/preview', async (req, reply) => {
      try {
        const widget = normalizeWidget(req.body?.widget);
        const data = await resolveWidget(widget, {
          jira: deps.jira,
          projectScope: deps.getConfig().settings.projectScope,
          jiraBaseUrl: deps.jiraBaseUrl,
        });
        return { data };
      } catch (err) {
        return fail(reply, err);
      }
    });

    admin.post<{ Body: { rule?: unknown } }>('/api/rules/test', async (req, reply) => {
      try {
        return await deps.engine.testRule(normalizeRule(req.body?.rule), deps.getConfig().settings);
      } catch (err) {
        return fail(reply, err);
      }
    });

    admin.post<{ Body: { rule?: unknown } }>('/api/rules/fire-test', async (req, reply) => {
      try {
        return await deps.engine.fireTest(normalizeRule(req.body?.rule), deps.getConfig().settings);
      } catch (err) {
        return fail(reply, err);
      }
    });

    admin.post<{ Body: { animationId?: string } }>('/api/animations/preview', async (req, reply) => {
      const event = deps.engine.previewAnimation(req.body?.animationId ?? '', deps.getConfig().settings);
      return event ?? reply.code(404).send({ error: 'Unknown animation' });
    });

    admin.post('/api/refresh', async () => {
      deps.scheduler.refreshAll();
      return { ok: true };
    });

    admin.post('/api/screens/reload', async () => {
      deps.hub.broadcast({ type: 'reload' });
      return { ok: true };
    });

    admin.post('/api/jira/check', async (req, reply) => {
      try {
        const me = await deps.jira.myself();
        return { ok: true, displayName: me.displayName, emailAddress: me.emailAddress };
      } catch (err) {
        return fail(reply, err, 502);
      }
    });
  });
}
