import { animationById, pickAnimation } from '../../../shared/animations';
import type { DashboardEvent, EventRule, Settings } from '../../../shared/types';

const SAMPLE = { key: 'DEMO-42', summary: 'Make the dashboard even more delightful', priority: 'High', issueType: 'Story', status: 'Done' };

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (vars[name] !== undefined ? String(vars[name]) : m));
}

/** A sample event for previewing a rule or animation inside the admin page only. */
export function previewEvent(opts: { rule?: EventRule; animationId?: string; settings: Settings; batch?: boolean }): DashboardEvent {
  const { rule, settings } = opts;
  const animationId = opts.animationId ?? (rule ? pickAnimation(rule, settings.disabledAnimations) : 'thumbs-burst');
  const info = animationById(animationId);
  const person = { name: 'Alex Morgan' };
  const count = opts.batch ? 5 : 1;
  const issues = Array.from({ length: count }, (_, i) => ({ ...SAMPLE, key: `DEMO-${42 + i}`, person, url: '#' }));
  const vars = { person: person.name, key: SAMPLE.key, summary: SAMPLE.summary, priority: SAMPLE.priority, type: SAMPLE.issueType, status: SAMPLE.status, rule: rule?.name ?? 'Preview', count };
  return {
    id: `preview-${Date.now()}`,
    ruleId: rule?.id ?? 'preview',
    ruleName: rule?.name ?? 'Preview',
    mood: rule?.mood ?? info?.mood ?? 'celebrate',
    animationId,
    sound: rule?.sound ?? true,
    at: Date.now(),
    bannerText: rule ? fill(count > 1 ? rule.batchBanner : rule.banner, vars) : `${info?.emoji ?? ''} ${info?.name ?? animationId}`,
    ...(count === 1 ? { person } : {}),
    issues,
    count,
    test: true,
  };
}
