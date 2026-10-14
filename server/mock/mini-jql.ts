// A small JQL interpreter used only by mock mode, so the dashboard can be
// developed without a Jira site. It supports AND / OR / NOT, parentheses,
// = != > >= < <= ~ !~, IN / NOT IN, IS [NOT] EMPTY, relative dates ("-15m"),
// the common date functions and ORDER BY. Unknown fields match everything.

type Token =
  | { t: 'str'; v: string }
  | { t: 'word'; v: string }
  | { t: 'op'; v: string }
  | { t: '(' }
  | { t: ')' }
  | { t: ',' };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== c) {
        if (input[j] === '\\' && j + 1 < input.length) j++;
        value += input[j++];
      }
      tokens.push({ t: 'str', v: value });
      i = j + 1;
    } else if (c === '(' || c === ')' || c === ',') {
      tokens.push({ t: c } as Token);
      i++;
    } else if ('<>!=~'.includes(c)) {
      const two = input.slice(i, i + 2);
      if (['>=', '<=', '!=', '!~'].includes(two)) {
        tokens.push({ t: 'op', v: two });
        i += 2;
      } else {
        tokens.push({ t: 'op', v: c });
        i++;
      }
    } else {
      let j = i;
      while (j < input.length && !/[\s()",'<>!=~]/.test(input[j])) j++;
      tokens.push({ t: 'word', v: input.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

export type Value = { kind: 'text'; v: string } | { kind: 'fn'; name: string; args: string[] } | { kind: 'list'; items: Value[] } | { kind: 'empty' };

export type Node =
  | { op: 'and' | 'or'; left: Node; right: Node }
  | { op: 'not'; inner: Node }
  | { op: 'clause'; field: string; cmp: string; value: Value }
  | { op: 'true' };

export interface ParsedJql {
  where: Node;
  orderBy: Array<{ field: string; desc: boolean }>;
}

export function parseJql(jql: string): ParsedJql {
  const tokens = tokenize(jql);
  let pos = 0;
  const peek = () => tokens[pos];
  const isWord = (tok: Token | undefined, word: string) => tok?.t === 'word' && tok.v.toLowerCase() === word;

  const parseValue = (): Value => {
    const tok = tokens[pos++];
    if (!tok) throw new Error('Unexpected end of JQL');
    if (tok.t === '(') {
      const items: Value[] = [];
      while (peek() && peek().t !== ')') {
        if (peek().t === ',') {
          pos++;
          continue;
        }
        items.push(parseValue());
      }
      pos++;
      return { kind: 'list', items };
    }
    if (tok.t === 'str') return { kind: 'text', v: tok.v };
    if (tok.t === 'word') {
      if (tok.v.toLowerCase() === 'empty' || tok.v.toLowerCase() === 'null') return { kind: 'empty' };
      if (peek()?.t === '(') {
        pos++;
        const args: string[] = [];
        while (peek() && peek().t !== ')') {
          const a = tokens[pos++];
          if (a.t === 'str' || a.t === 'word') args.push(a.v);
        }
        pos++;
        return { kind: 'fn', name: tok.v.toLowerCase(), args };
      }
      return { kind: 'text', v: tok.v };
    }
    throw new Error(`Unexpected token in JQL value`);
  };

  const parseClause = (): Node => {
    if (peek()?.t === '(') {
      pos++;
      const inner = parseOr();
      pos++; // ')'
      return inner;
    }
    if (isWord(peek(), 'not')) {
      pos++;
      return { op: 'not', inner: parseClause() };
    }
    const fieldTok = tokens[pos++];
    if (!fieldTok || (fieldTok.t !== 'word' && fieldTok.t !== 'str')) throw new Error('Expected a field name');
    const field = fieldTok.v.toLowerCase();
    const next = peek();
    let cmp: string;
    if (next?.t === 'op') {
      cmp = next.v;
      pos++;
    } else if (isWord(next, 'in')) {
      cmp = 'in';
      pos++;
    } else if (isWord(next, 'not') && isWord(tokens[pos + 1], 'in')) {
      cmp = 'not in';
      pos += 2;
    } else if (isWord(next, 'is') && isWord(tokens[pos + 1], 'not')) {
      cmp = '!=';
      pos += 2;
    } else if (isWord(next, 'is')) {
      cmp = '=';
      pos++;
    } else if (isWord(next, 'was') || isWord(next, 'changed')) {
      // Historical operators aren't modelled; consume until the next AND/OR.
      while (peek() && !isWord(peek(), 'and') && !isWord(peek(), 'or') && peek().t !== ')') pos++;
      return { op: 'true' };
    } else {
      throw new Error(`Expected an operator after "${fieldTok.v}"`);
    }
    return { op: 'clause', field, cmp, value: parseValue() };
  };

  const parseAnd = (): Node => {
    let left = parseClause();
    while (isWord(peek(), 'and')) {
      pos++;
      left = { op: 'and', left, right: parseClause() };
    }
    return left;
  };

  const parseOr = (): Node => {
    let left = parseAnd();
    while (isWord(peek(), 'or')) {
      pos++;
      left = { op: 'or', left, right: parseAnd() };
    }
    return left;
  };

  let where: Node = { op: 'true' };
  if (pos < tokens.length && !isWord(peek(), 'order')) where = parseOr();

  const orderBy: ParsedJql['orderBy'] = [];
  if (isWord(peek(), 'order') && isWord(tokens[pos + 1], 'by')) {
    pos += 2;
    while (pos < tokens.length) {
      const tok = tokens[pos++];
      if (tok.t === ',') continue;
      if (tok.t !== 'word' && tok.t !== 'str') break;
      let desc = false;
      if (isWord(peek(), 'desc')) {
        desc = true;
        pos++;
      } else if (isWord(peek(), 'asc')) pos++;
      orderBy.push({ field: tok.v.toLowerCase(), desc });
    }
  } else if (pos < tokens.length) {
    throw new Error(`Unexpected "${(tokens[pos] as { v?: string }).v ?? tokens[pos].t}" in JQL`);
  }
  return { where, orderBy };
}

// ---- Evaluation ----

const DAY = 86_400_000;
const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: DAY, w: 7 * DAY };

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Applies a "+1d" / "-2w" / "-1" (days) increment. */
function applyInc(base: number, inc: string | undefined, unitDefault: string): number {
  if (!inc) return base;
  const m = /^([+-]?\d+)\s*([mhdwMy]?)$/.exec(inc.trim());
  if (!m) return base;
  const n = Number(m[1]);
  const unit = m[2] || unitDefault;
  if (unit === 'M' || unit === 'y') {
    const d = new Date(base);
    if (unit === 'M') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    return d.getTime();
  }
  if (unit === 'd' || unit === 'w') {
    const d = new Date(base);
    d.setDate(d.getDate() + n * (unit === 'w' ? 7 : 1));
    return d.getTime();
  }
  return base + n * UNIT_MS[unit];
}

export function dateValue(value: Value, now: number): number | undefined {
  if (value.kind === 'fn') {
    const inc = value.args[0];
    switch (value.name) {
      case 'now':
        return now;
      case 'startofday':
        return applyInc(startOfDay(now), inc, 'd');
      case 'endofday':
        return applyInc(startOfDay(now) + DAY - 1, inc, 'd');
      case 'startofweek': {
        const d = new Date(startOfDay(now));
        d.setDate(d.getDate() - d.getDay()); // Jira's default week starts on Sunday
        return applyInc(d.getTime(), inc, 'w');
      }
      case 'endofweek': {
        const d = new Date(startOfDay(now));
        d.setDate(d.getDate() - d.getDay() + 7);
        return applyInc(d.getTime() - 1, inc, 'w');
      }
      case 'startofmonth': {
        const d = new Date(startOfDay(now));
        d.setDate(1);
        return applyInc(d.getTime(), inc, 'M');
      }
      default:
        return undefined;
    }
  }
  if (value.kind !== 'text') return undefined;
  const rel = /^([+-]?\d+)\s*([mhdw])$/.exec(value.v.trim());
  if (rel) return now + Number(rel[1]) * UNIT_MS[rel[2]];
  const parsed = Date.parse(value.v.replace(/\//g, '-'));
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** What the evaluator needs to know about an issue. */
export interface EvalIssue {
  fieldValues(field: string): Array<string> | undefined;
  dateValue(field: string): number | null | undefined;
}

const textOf = (v: Value): string[] => {
  if (v.kind === 'text') return [v.v.toLowerCase()];
  if (v.kind === 'list') return v.items.flatMap(textOf);
  if (v.kind === 'fn' && v.name === 'currentuser') return ['__currentuser__'];
  return [];
};

export function evaluate(node: Node, issue: EvalIssue, now: number): boolean {
  switch (node.op) {
    case 'true':
      return true;
    case 'and':
      return evaluate(node.left, issue, now) && evaluate(node.right, issue, now);
    case 'or':
      return evaluate(node.left, issue, now) || evaluate(node.right, issue, now);
    case 'not':
      return !evaluate(node.inner, issue, now);
    case 'clause': {
      const { field, cmp, value } = node;
      const date = issue.dateValue(field);
      if (date !== undefined) {
        if (value.kind === 'empty') return cmp === '=' ? date === null : date !== null;
        const target = dateValue(value, now);
        if (target === undefined || date === null) return false;
        switch (cmp) {
          case '>=':
            return date >= target;
          case '>':
            return date > target;
          case '<=':
            return date <= target;
          case '<':
            return date < target;
          case '=':
            return Math.abs(date - target) < DAY && startOfDay(date) === startOfDay(target);
          case '!=':
            return startOfDay(date) !== startOfDay(target);
          default:
            return true;
        }
      }
      const actual = issue.fieldValues(field);
      if (actual === undefined) return true; // unknown field: don't filter in mock mode
      const have = actual.map((a) => a.toLowerCase());
      if (value.kind === 'empty') return cmp === '=' ? have.length === 0 : have.length > 0;
      const want = textOf(value);
      switch (cmp) {
        case '=':
        case 'in':
          return have.some((h) => want.includes(h));
        case '!=':
        case 'not in':
          return !have.some((h) => want.includes(h));
        case '~':
          return have.some((h) => want.some((w) => h.includes(w.replace(/\*/g, ''))));
        case '!~':
          return !have.some((h) => want.some((w) => h.includes(w.replace(/\*/g, ''))));
        default:
          return true;
      }
    }
  }
}
