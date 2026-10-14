import 'dotenv/config';
import path from 'node:path';

export interface Env {
  mock: boolean;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraCloudId: string;
  adminPassword: string;
  port: number;
  host: string;
  dataDir: string;
}

function flag(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const mock = flag(source.JIRA_MOCK);
  const env: Env = {
    mock,
    jiraBaseUrl: (source.JIRA_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    jiraEmail: (source.JIRA_EMAIL ?? '').trim(),
    jiraApiToken: (source.JIRA_API_TOKEN ?? '').trim(),
    jiraCloudId: (source.JIRA_CLOUD_ID ?? '').trim(),
    adminPassword: source.ADMIN_PASSWORD ?? '',
    port: Number(source.PORT ?? 3000),
    host: source.HOST ?? '0.0.0.0',
    dataDir: path.resolve(source.DATA_DIR ?? './data'),
  };

  const problems: string[] = [];
  if (!mock) {
    if (!/^https:\/\/.+/.test(env.jiraBaseUrl)) problems.push('JIRA_BASE_URL must be your https://<site>.atlassian.net URL');
    if (!env.jiraEmail) problems.push('JIRA_EMAIL is required');
    if (!env.jiraApiToken) problems.push('JIRA_API_TOKEN is required');
  } else if (!env.jiraBaseUrl) {
    env.jiraBaseUrl = 'https://example.atlassian.net';
  }
  if (!env.adminPassword) {
    if (mock) {
      env.adminPassword = 'admin';
      console.warn('[env] ADMIN_PASSWORD not set; using "admin" because JIRA_MOCK is on.');
    } else {
      problems.push('ADMIN_PASSWORD is required');
    }
  }
  if (!Number.isInteger(env.port) || env.port <= 0) problems.push('PORT must be a positive integer');

  if (problems.length) {
    throw new Error(`Invalid configuration (.env):\n  - ${problems.join('\n  - ')}\nSee .env.example and README.md.`);
  }
  return env;
}
