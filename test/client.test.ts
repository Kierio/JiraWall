import { describe, expect, it } from 'vitest';
import { JiraClient, JiraError } from '../server/jira/client';

const env = { jiraBaseUrl: 'https://acme.atlassian.net', jiraEmail: 'bot@acme.com', jiraApiToken: 'tok', jiraCloudId: '' };

function fakeFetch(responses: Array<() => Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('JiraClient', () => {
  it('sends basic auth to the approximate-count endpoint', async () => {
    const { impl, calls } = fakeFetch([json({ count: 42 })]);
    const client = new JiraClient(env, { fetch: impl });
    expect(await client.count('project = ABC')).toBe(42);
    expect(calls[0].url).toBe('https://acme.atlassian.net/rest/api/3/search/approximate-count');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('bot@acme.com:tok').toString('base64')}`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ jql: 'project = ABC' });
  });

  it('uses the api.atlassian.com gateway for scoped tokens', async () => {
    const { impl, calls } = fakeFetch([json({ count: 1 })]);
    await new JiraClient({ ...env, jiraCloudId: 'abc-123' }, { fetch: impl }).count('x');
    expect(calls[0].url).toBe('https://api.atlassian.com/ex/jira/abc-123/rest/api/3/search/approximate-count');
  });

  it('waits for Retry-After on 429 and then succeeds', async () => {
    const sleeps: number[] = [];
    const { impl, calls } = fakeFetch([json({}, 429, { 'retry-after': '7' }), json({ count: 3 })]);
    const client = new JiraClient(env, { fetch: impl, sleep: async (ms) => void sleeps.push(ms) });
    expect(await client.count('x')).toBe(3);
    expect(sleeps).toEqual([7000]);
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries and reports Jira error messages', async () => {
    const { impl } = fakeFetch([json({}, 429), json({}, 429), json({ errorMessages: ['Slow down'] }, 429)]);
    const client = new JiraClient(env, { fetch: impl, sleep: async () => {}, maxRetries: 2 });
    await expect(client.count('x')).rejects.toThrow('Jira 429: Slow down');
  });

  it('adds a hint on 401', async () => {
    const { impl } = fakeFetch([json({}, 401)]);
    const err = await new JiraClient(env, { fetch: impl }).myself().catch((e) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect(err.message).toMatch(/JIRA_API_TOKEN/);
  });

  it('pages through search results with nextPageToken and caps at max', async () => {
    const page = (n: number, token?: string) => json({ issues: Array.from({ length: n }, (_, i) => ({ key: `K-${i}`, fields: {} })), nextPageToken: token });
    const { impl, calls } = fakeFetch([page(100, 't1'), page(100, 't2'), page(100, 't3')]);
    const result = await new JiraClient(env, { fetch: impl }).search('x', ['summary'], 200);
    expect(result.issues).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(JSON.parse(calls[1].init.body as string).nextPageToken).toBe('t1');
  });

  it('finds the most recent status change author in the changelog', async () => {
    const { impl } = fakeFetch([
      json({
        values: [
          { author: { displayName: 'Old' }, items: [{ field: 'status' }] },
          { author: { displayName: 'Commenter' }, items: [{ field: 'labels' }] },
          { author: { displayName: 'Closer', avatarUrls: { '48x48': 'https://a/c.png' } }, items: [{ fieldId: 'status' }] },
        ],
        total: 3,
        isLast: true,
      }),
    ]);
    expect(await new JiraClient(env, { fetch: impl }).lastStatusChanger('A-1')).toEqual({ name: 'Closer', avatarUrl: 'https://a/c.png' });
  });
});
