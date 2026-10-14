// Jira Cloud REST API v3 client. Only the server talks to Jira, so the API
// token never reaches a browser.

import type { Person } from '../../shared/types.js';
import type { Env } from '../env.js';

export interface RawIssue {
  key: string;
  // Jira field values vary by field type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, any>;
}

export interface SearchResult {
  issues: RawIssue[];
  /** True if more issues matched than were fetched. */
  truncated: boolean;
}

/** The subset of Jira the dashboard needs. Implemented by JiraClient and the mock. */
export interface JiraApi {
  count(jql: string): Promise<number>;
  search(jql: string, fields: string[], max: number): Promise<SearchResult>;
  /** Who most recently changed the issue's status, from the changelog. */
  lastStatusChanger(key: string): Promise<Person | undefined>;
  myself(): Promise<{ displayName: string; emailAddress?: string }>;
}

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'JiraError';
  }
}

/** Limits how many requests are in flight at once (protects the Pi and Jira's rate limits). */
export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  concurrency?: number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function avatarOf(user: unknown): string | undefined {
  const urls = (user as { avatarUrls?: Record<string, string> } | undefined)?.avatarUrls;
  return urls?.['48x48'] ?? urls?.['32x32'];
}

export class JiraClient implements JiraApi {
  private readonly apiBase: string;
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly limiter: Semaphore;

  constructor(env: Pick<Env, 'jiraBaseUrl' | 'jiraEmail' | 'jiraApiToken' | 'jiraCloudId'>, options: ClientOptions = {}) {
    // Scoped API tokens must go through the api.atlassian.com gateway.
    this.apiBase = env.jiraCloudId ? `https://api.atlassian.com/ex/jira/${env.jiraCloudId}` : env.jiraBaseUrl;
    this.auth = `Basic ${Buffer.from(`${env.jiraEmail}:${env.jiraApiToken}`).toString('base64')}`;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.limiter = new Semaphore(options.concurrency ?? 4);
  }

  async count(jql: string): Promise<number> {
    const res = await this.request<{ count: number }>('POST', '/rest/api/3/search/approximate-count', { jql });
    return res.count;
  }

  async search(jql: string, fields: string[], max: number): Promise<SearchResult> {
    const issues: RawIssue[] = [];
    let nextPageToken: string | undefined;
    for (;;) {
      const page = await this.request<{ issues?: RawIssue[]; nextPageToken?: string; isLast?: boolean }>(
        'POST',
        '/rest/api/3/search/jql',
        { jql, fields, maxResults: Math.min(100, max - issues.length), ...(nextPageToken ? { nextPageToken } : {}) },
      );
      issues.push(...(page.issues ?? []));
      nextPageToken = page.nextPageToken;
      const more = Boolean(nextPageToken) && page.isLast !== true;
      if (!more) return { issues, truncated: false };
      if (issues.length >= max) return { issues: issues.slice(0, max), truncated: true };
    }
  }

  async lastStatusChanger(key: string): Promise<Person | undefined> {
    type Changelog = {
      values: Array<{ author?: { displayName?: string; avatarUrls?: Record<string, string> }; items: Array<{ field?: string; fieldId?: string }> }>;
      total: number;
      isLast?: boolean;
    };
    const path = `/rest/api/3/issue/${encodeURIComponent(key)}/changelog`;
    let log = await this.request<Changelog>('GET', `${path}?maxResults=100`);
    // The changelog is oldest-first; jump to the last page if there is more.
    if (log.isLast === false && log.total > log.values.length) {
      log = await this.request<Changelog>('GET', `${path}?maxResults=100&startAt=${Math.max(0, log.total - 100)}`);
    }
    for (let i = log.values.length - 1; i >= 0; i--) {
      const entry = log.values[i];
      if (entry.items.some((item) => item.fieldId === 'status' || item.field === 'status') && entry.author?.displayName) {
        return { name: entry.author.displayName, avatarUrl: avatarOf(entry.author) };
      }
    }
    return undefined;
  }

  myself() {
    return this.request<{ displayName: string; emailAddress?: string }>('GET', '/rest/api/3/myself');
  }

  private request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return this.limiter.run(() => this.requestWithRetry<T>(method, path, body));
  }

  private async requestWithRetry<T>(method: 'GET' | 'POST', path: string, body: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(this.apiBase + path, {
          method,
          headers: {
            Authorization: this.auth,
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt < this.maxRetries) {
          await this.sleep(backoffMs(attempt));
          continue;
        }
        throw new JiraError(`Could not reach Jira: ${(err as Error).message}`, 0);
      }

      if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : backoffMs(attempt));
        continue;
      }

      if (!res.ok) throw new JiraError(await describeError(res), res.status);
      return (await res.json()) as T;
    }
  }
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

async function describeError(res: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await res.json()) as { errorMessages?: string[]; errors?: Record<string, string>; message?: string };
    detail = [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {}), body.message].filter(Boolean).join(' ');
  } catch {
    /* not JSON */
  }
  const hint =
    res.status === 401
      ? ' Check JIRA_EMAIL and JIRA_API_TOKEN (tokens expire).'
      : res.status === 403
        ? ' The account lacks permission, or IP allowlisting is blocking the Pi.'
        : res.status === 404 && !detail
          ? ' Check JIRA_BASE_URL / JIRA_CLOUD_ID.'
          : '';
  return `Jira ${res.status}${detail ? `: ${detail}` : ''}${hint}`;
}
