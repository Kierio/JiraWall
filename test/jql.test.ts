import { describe, expect, it } from 'vitest';
import { combineJql, eventRuleJql, fieldIdFor, splitOrderBy, startOfDayJql, trendDayJql } from '../shared/jql';
import { fillTemplate } from '../server/events/template';

describe('combineJql', () => {
  it('ANDs parts in parentheses and skips blanks', () => {
    expect(combineJql(['project = ABC', '', undefined, 'type = Bug OR type = Task'])).toBe('(project = ABC) AND (type = Bug OR type = Task)');
  });

  it('moves ORDER BY to the end', () => {
    expect(combineJql(['project = ABC', 'statusCategory != Done order by priority DESC'])).toBe(
      '(project = ABC) AND (statusCategory != Done) ORDER BY priority DESC',
    );
  });

  it('handles a part that is only ORDER BY', () => {
    expect(combineJql(['project = ABC', 'ORDER BY created DESC'])).toBe('(project = ABC) ORDER BY created DESC');
  });

  it('lets an explicit order win', () => {
    expect(combineJql(['a = 1 ORDER BY b'], 'c DESC')).toBe('(a = 1) ORDER BY c DESC');
  });
});

describe('splitOrderBy', () => {
  it('does not split on words that merely contain "order"', () => {
    expect(splitOrderBy('summary ~ "reorder bystander"')).toEqual({ filter: 'summary ~ "reorder bystander"', orderBy: '' });
  });
});

describe('trend JQL', () => {
  it('builds day boundaries', () => {
    expect(startOfDayJql(0)).toBe('startOfDay()');
    expect(startOfDayJql(-3)).toBe('startOfDay("-3d")');
    expect(startOfDayJql(1)).toBe('startOfDay("+1d")');
    expect(trendDayJql('project = ABC', 'resolved', 0)).toBe('(project = ABC) AND (resolved >= startOfDay() AND resolved < startOfDay("+1d"))');
    expect(trendDayJql('', 'created', 2)).toBe('(created >= startOfDay("-2d") AND created < startOfDay("-1d"))');
  });

  it('quotes field names with spaces', () => {
    expect(trendDayJql('', 'Deployed date', 0)).toContain('"Deployed date" >= startOfDay()');
  });
});

describe('eventRuleJql', () => {
  it('combines scope, filter, window and order', () => {
    expect(eventRuleJql('', 'priority = High', 'created', 15)).toBe('(priority = High) AND (created >= "-15m") ORDER BY created DESC');
  });
});

describe('fieldIdFor', () => {
  it('maps JQL names to REST field ids', () => {
    expect(fieldIdFor('resolved')).toBe('resolutiondate');
    expect(fieldIdFor('statusCategoryChangedDate')).toBe('statuscategorychangedate');
    expect(fieldIdFor('customfield_10050')).toBe('customfield_10050');
  });
});

describe('fillTemplate', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(fillTemplate('{person} closed {key}! {oops}', { person: 'Sam', key: 'ABC-1' })).toBe('Sam closed ABC-1! {oops}');
    expect(fillTemplate('{count} done', { count: 4 })).toBe('4 done');
  });
});
