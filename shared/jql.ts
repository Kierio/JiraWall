// JQL building helpers shared by the server (and tests).

const ORDER_BY = /\s+order\s+by\s+/i;

/** Splits `foo = bar ORDER BY created DESC` into its filter and ORDER BY parts. */
export function splitOrderBy(jql: string): { filter: string; orderBy: string } {
  const text = ` ${jql.trim()}`;
  const match = ORDER_BY.exec(text);
  if (!match) return { filter: jql.trim(), orderBy: '' };
  return {
    filter: text.slice(0, match.index).trim(),
    orderBy: text.slice(match.index + match[0].length).trim(),
  };
}

/**
 * ANDs several JQL fragments together, wrapping each in parentheses. Any ORDER BY
 * clauses are pulled out and the last one is kept (an explicit `orderBy` wins).
 */
export function combineJql(parts: Array<string | undefined | null>, orderBy?: string): string {
  const filters: string[] = [];
  let order = '';
  for (const part of parts) {
    if (!part || !part.trim()) continue;
    const split = splitOrderBy(part);
    if (split.filter) filters.push(`(${split.filter})`);
    if (split.orderBy) order = split.orderBy;
  }
  if (orderBy) order = orderBy;
  const filter = filters.join(' AND ');
  return [filter, order ? `ORDER BY ${order}` : ''].filter(Boolean).join(' ');
}

/** `startOfDay()` style function call with an optional day offset. */
export function startOfDayJql(offsetDays: number): string {
  if (offsetDays === 0) return 'startOfDay()';
  return `startOfDay("${offsetDays > 0 ? '+' : ''}${offsetDays}d")`;
}

/**
 * JQL for one day of a trend: issues whose `dateField` falls on the day
 * `daysAgo` days before today (0 = today).
 */
export function trendDayJql(base: string, dateField: string, daysAgo: number): string {
  const field = quoteField(dateField);
  return combineJql([
    base,
    `${field} >= ${startOfDayJql(-daysAgo)} AND ${field} < ${startOfDayJql(-daysAgo + 1)}`,
  ]);
}

/** Field names with spaces need quoting in JQL. */
export function quoteField(field: string): string {
  return /^[A-Za-z0-9_.[\]]+$/.test(field) ? field : `"${field.replace(/"/g, '\\"')}"`;
}

/** The JQL an event rule runs each poll. */
export function eventRuleJql(
  scope: string,
  filterJql: string,
  triggerField: string,
  windowMin: number,
): string {
  const field = quoteField(triggerField);
  return combineJql([scope, filterJql, `${field} >= "-${Math.max(1, Math.round(windowMin))}m"`], `${field} DESC`);
}

/** Maps a JQL field name to the field id used in REST responses. */
export function fieldIdFor(jqlName: string): string {
  const map: Record<string, string> = {
    resolved: 'resolutiondate',
    resolutiondate: 'resolutiondate',
    statuscategorychangeddate: 'statuscategorychangedate',
    created: 'created',
    createddate: 'created',
    updated: 'updated',
    updateddate: 'updated',
    type: 'issuetype',
    issuetype: 'issuetype',
  };
  return map[jqlName.toLowerCase()] ?? jqlName;
}
