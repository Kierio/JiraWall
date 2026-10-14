import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { IssueSummary } from '../../../shared/types';
import { api } from '../lib/api';
import { PriorityIcon } from '../lib/priority';

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`field ${wide ? 'wide' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="toggle-knob" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  );
}

export function NumberInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type JqlResult = { jql: string; count?: number; issues?: IssueSummary[]; error?: string };

/** JQL textarea with a "Test" button that runs it through the server against Jira. */
export function JqlEditor({
  value,
  onChange,
  useScope = true,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  useScope?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const [result, setResult] = useState<JqlResult>();
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    try {
      setResult(await api.testJql(value, useScope));
    } catch (err) {
      const body = (err as { body?: { jql?: string } }).body;
      setResult({ jql: body?.jql ?? value, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="jql">
      <div className="jql-row">
        <textarea
          className="mono"
          rows={rows}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            setResult(undefined);
          }}
        />
        <button type="button" className="btn" onClick={test} disabled={busy}>
          {busy ? 'Testing…' : 'Test JQL'}
        </button>
      </div>
      {result && (
        <div className={`jql-result ${result.error ? 'error' : 'ok'}`}>
          {result.error ? (
            <div>⚠ {result.error}</div>
          ) : (
            <>
              <div>
                ✓ <strong>{result.count}</strong> matching issue{result.count === 1 ? '' : 's'} (approximate count)
              </div>
              {result.issues && result.issues.length > 0 && (
                <ul>
                  {result.issues.map((i) => (
                    <li key={i.key}>
                      <PriorityIcon name={i.priority} size={16} />{' '}
                      <a href={i.url} target="_blank" rel="noreferrer">
                        {i.key}
                      </a>{' '}
                      {i.summary} <span className="muted">· {i.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="muted mono small">Ran: {result.jql || '(empty)'}</div>
        </div>
      )}
    </div>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{title}</h2>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Renders children at real screen pixel size, scaled down to fit the available width. */
export function ScaledBox({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const node = outer.current;
    if (!node) return;
    const measure = () => setScale(Math.min(1, node.clientWidth / width));
    measure(); // right size from the first paint; the observer handles later resizes
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div className="scaled-box" ref={outer} style={{ height: height * scale, maxWidth: width }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left', display: 'flex' }}>{children}</div>
    </div>
  );
}
