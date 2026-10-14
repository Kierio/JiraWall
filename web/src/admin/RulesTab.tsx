import { useState } from 'react';
import { ANIMATIONS, MOODS } from '../../../shared/animations';
import { RULE_TEMPLATES } from '../../../shared/presets';
import type { CreditMode, DashboardConfig, EventIssue, EventRule, Mood } from '../../../shared/types';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { PriorityIcon } from '../lib/priority';
import { Field, Section, Select, Toggle } from './ui';

const TRIGGERS: Array<{ value: string; label: string }> = [
  { value: 'created', label: 'Created — when the ticket is created' },
  { value: 'statusCategoryChangedDate', label: 'Status category changed — e.g. moved to Done' },
  { value: 'resolved', label: 'Resolved — when a Resolution is set' },
  { value: 'updated', label: 'Updated — any change' },
  { value: '__custom', label: 'Custom date field…' },
];

const CREDITS: Array<{ value: CreditMode; label: string }> = [
  { value: 'resolver', label: 'Who changed the status (from the changelog)' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'reporter', label: 'Reporter' },
  { value: 'none', label: 'Nobody' },
];

export const MOOD_LABEL: Record<Mood, string> = { celebrate: '🎉 Celebrate', info: '📬 Info', alert: '🚨 Alert' };

export function RulesTab({
  draft,
  setDraft,
  playLocal,
  toast,
}: {
  draft: DashboardConfig;
  setDraft: (c: DashboardConfig) => void;
  playLocal: (rule: EventRule, batch?: boolean) => void;
  toast: (msg: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(draft.rules[0]?.id);
  const [template, setTemplate] = useState('0');
  const rules = draft.rules;
  const selected = rules.find((r) => r.id === selectedId);

  const setRules = (next: EventRule[]) => setDraft({ ...draft, rules: next });
  const update = (rule: EventRule) => setRules(rules.map((r) => (r.id === rule.id ? rule : r)));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...rules];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    setRules(next);
  };
  const add = () => {
    const rule: EventRule = { ...structuredClone(RULE_TEMPLATES[Number(template)]), id: `rule-${Date.now().toString(36)}` };
    setRules([...rules, rule]);
    setSelectedId(rule.id);
  };

  return (
    <div className="split">
      <aside className="list-pane">
        <div className="list-group">Rules (top wins when one ticket matches several)</div>
        {rules.map((rule, i) => (
          <div key={rule.id} className={`list-item rule-item ${rule.id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(rule.id)}>
            <span className="rule-order">
              <button className="icon-btn" disabled={i === 0} onClick={(e) => (e.stopPropagation(), move(i, -1))} aria-label="Move up">
                ▲
              </button>
              <button className="icon-btn" disabled={i === rules.length - 1} onClick={(e) => (e.stopPropagation(), move(i, 1))} aria-label="Move down">
                ▼
              </button>
            </span>
            <span className={rule.enabled ? '' : 'muted'}>
              {rule.name}
              <br />
              <span className="muted small">{MOOD_LABEL[rule.mood]}</span>
            </span>
            <span onClick={(e) => e.stopPropagation()}>
              <Toggle checked={rule.enabled} onChange={(v) => update({ ...rule, enabled: v })} />
            </span>
          </div>
        ))}
        <div className="add-box">
          <Select value={template} onChange={setTemplate} options={RULE_TEMPLATES.map((t, i) => ({ value: String(i), label: t.name }))} />
          <button className="btn primary" onClick={add}>
            + Add rule
          </button>
        </div>
      </aside>
      <div className="detail-pane">
        {selected ? (
          <RuleEditor
            key={selected.id}
            rule={selected}
            onChange={update}
            onDelete={() => {
              setRules(rules.filter((r) => r.id !== selected.id));
              setSelectedId(undefined);
            }}
            disabled={draft.settings.disabledAnimations}
            playLocal={playLocal}
            toast={toast}
          />
        ) : (
          <div className="empty-detail">Select a rule, or add one.</div>
        )}
      </div>
    </div>
  );
}

function RuleEditor({
  rule,
  onChange,
  onDelete,
  disabled,
  playLocal,
  toast,
}: {
  rule: EventRule;
  onChange: (r: EventRule) => void;
  onDelete: () => void;
  disabled: string[];
  playLocal: (rule: EventRule, batch?: boolean) => void;
  toast: (msg: string) => void;
}) {
  const set = <K extends keyof EventRule>(key: K, value: EventRule[K]) => onChange({ ...rule, [key]: value });
  const isCustom = !TRIGGERS.some((t) => t.value === rule.triggerField);
  const [test, setTest] = useState<{ jql?: string; issues?: Array<EventIssue & { at?: number }>; error?: string; busy?: boolean }>();

  const runTest = async () => {
    setTest({ busy: true });
    try {
      setTest(await api.testRule(rule));
    } catch (err) {
      setTest({ error: (err as Error).message });
    }
  };

  const fire = async () => {
    try {
      await api.fireRule(rule);
      toast('Sent to the screens');
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
    }
  };

  const toggleAnimation = (id: string) =>
    set('animationIds', rule.animationIds.includes(id) ? rule.animationIds.filter((a) => a !== id) : [...rule.animationIds, id]);

  return (
    <Section
      title={rule.name || 'Untitled rule'}
      actions={
        <>
          <button className="btn" onClick={() => playLocal(rule)}>
            ▶ Preview here
          </button>
          <button className="btn" onClick={() => playLocal(rule, true)} title="Preview what several events at once look like">
            ▶ Batch
          </button>
          <button className="btn" onClick={fire}>
            📺 Fire on screens
          </button>
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name">
          <input value={rule.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Enabled">
          <Toggle checked={rule.enabled} onChange={(v) => set('enabled', v)} label={rule.enabled ? 'On' : 'Off'} />
        </Field>
        <Field
          label="Filter JQL"
          wide
          hint="Which tickets qualify. The project scope and the time window are added automatically, so don't include them here."
        >
          <textarea className="mono" rows={2} spellCheck={false} value={rule.filterJql} onChange={(e) => set('filterJql', e.target.value)} />
        </Field>
        <Field label="Fires when" wide hint="The date field that marks the moment the event happened.">
          <Select
            value={isCustom ? '__custom' : rule.triggerField}
            onChange={(v) => onChange({ ...rule, triggerField: v === '__custom' ? 'cf[10050]' : v, triggerFieldId: undefined })}
            options={TRIGGERS}
          />
        </Field>
        {isCustom && (
          <>
            <Field label="Custom field (JQL name)" hint='e.g. cf[10050] or "Deployed date"'>
              <input className="mono" value={rule.triggerField} onChange={(e) => set('triggerField', e.target.value)} />
            </Field>
            <Field label="Custom field id" hint="e.g. customfield_10050">
              <input className="mono" value={rule.triggerFieldId ?? ''} onChange={(e) => set('triggerFieldId', e.target.value || undefined)} />
            </Field>
          </>
        )}
        <Field label="Credit" hint="Whose name and avatar appear in the banner.">
          <Select value={rule.credit} onChange={(v) => set('credit', v)} options={CREDITS} />
        </Field>
        <Field label="Sound">
          <Toggle checked={rule.sound} onChange={(v) => set('sound', v)} label={rule.sound ? 'On' : 'Off'} />
        </Field>
        <Field label="Banner" wide hint={<>Placeholders: {'{person} {key} {summary} {priority} {type} {status} {rule}'}</>}>
          <input value={rule.banner} onChange={(e) => set('banner', e.target.value)} />
        </Field>
        <Field label="Batch banner" wide hint={<>Used when several tickets for this rule arrive at once. Placeholders: {'{count} {rule}'}</>}>
          <input value={rule.batchBanner} onChange={(e) => set('batchBanner', e.target.value)} />
        </Field>
        <Field label="Mood" wide hint="Alert events jump the animation queue.">
          <div className="segmented">
            {MOODS.map((m) => (
              <button key={m} type="button" className={rule.mood === m ? 'active' : ''} onClick={() => set('mood', m)}>
                {MOOD_LABEL[m]}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label="Animations"
          wide
          hint={
            rule.animationIds.length
              ? 'One of the selected animations is picked at random, never the same one twice in a row.'
              : `None selected: any enabled ${rule.mood} animation is picked at random.`
          }
        >
          {/* The rule's own mood first, so the likely picks are at the top. */}
          {[rule.mood, ...MOODS.filter((m) => m !== rule.mood)].map((mood) => (
            <div key={mood} className={`chip-group ${mood !== rule.mood ? 'other-mood' : ''}`}>
              <div className="chip-group-label">{MOOD_LABEL[mood]}</div>
              <div className="chips">
                {ANIMATIONS.filter((a) => a.mood === mood).map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={`chip ${rule.animationIds.includes(a.id) ? 'on' : ''} ${a.mood !== rule.mood && !rule.animationIds.includes(a.id) ? 'dim' : ''}`}
                    onClick={() => toggleAnimation(a.id)}
                    title={disabled.includes(a.id) ? 'Disabled globally on the Animations tab' : MOOD_LABEL[a.mood]}
                  >
                    <span className="emoji">{a.emoji}</span> {a.name}
                    {disabled.includes(a.id) && ' (off)'}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Field>
      </div>

      <div className="preview-head">
        <h3>Test against Jira</h3>
        <button className="btn" onClick={runTest} disabled={test?.busy}>
          {test?.busy ? 'Searching…' : 'What would have fired in the last 24h?'}
        </button>
      </div>
      {test && !test.busy && (
        <div className={`jql-result ${test.error ? 'error' : 'ok'}`}>
          {test.error ? (
            <div>⚠ {test.error}</div>
          ) : (
            <>
              <div>
                {test.issues?.length ? `✓ ${test.issues.length}${test.issues.length === 25 ? '+' : ''} matching events` : 'No matching events in the last 24 hours.'}
              </div>
              <ul>
                {test.issues?.map((i) => (
                  <li key={`${i.key}-${i.at}`}>
                    <PriorityIcon name={i.priority} size={16} />{' '}
                    <a href={i.url} target="_blank" rel="noreferrer">
                      {i.key}
                    </a>{' '}
                    {i.summary} <span className="muted">· {i.person?.name ?? 'nobody'} · {i.at ? timeAgo(i.at) : ''}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {test.jql && <div className="muted mono small">Ran: {test.jql}</div>}
        </div>
      )}
    </Section>
  );
}

