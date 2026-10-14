import { ANIMATIONS, PACKS } from '../../../shared/animations';
import type { DashboardConfig } from '../../../shared/types';
import { playSound } from '../animations/sound';
import { api } from '../lib/api';
import { MOOD_LABEL } from './RulesTab';
import { Field, Section, Toggle } from './ui';

export function AnimationsTab({
  draft,
  setDraft,
  playLocal,
  toast,
}: {
  draft: DashboardConfig;
  setDraft: (c: DashboardConfig) => void;
  playLocal: (animationId: string) => void;
  toast: (msg: string) => void;
}) {
  const s = draft.settings;
  const setSettings = (patch: Partial<typeof s>) => setDraft({ ...draft, settings: { ...s, ...patch } });
  const setEnabled = (ids: string[], enabled: boolean) =>
    setSettings({
      disabledAnimations: enabled ? s.disabledAnimations.filter((a) => !ids.includes(a)) : [...new Set([...s.disabledAnimations, ...ids])],
    });

  const onScreens = async (id: string) => {
    try {
      await api.previewAnimation(id);
      toast('Playing on the screens');
    } catch (err) {
      toast(`⚠ ${(err as Error).message}`);
    }
  };

  return (
    <>
      <Section title="Playback">
        <div className="form-grid">
          <Field label={`Duration: ${(s.animationDurationMs / 1000).toFixed(1)}s`} hint="How long each animation and banner stays on screen.">
            <input type="range" min={2000} max={20000} step={500} value={s.animationDurationMs} onChange={(e) => setSettings({ animationDurationMs: Number(e.target.value) })} />
          </Field>
          <Field label={`Sound volume: ${Math.round(s.soundVolume * 100)}%`} hint="Rules can also turn sound off individually.">
            <div className="inline">
              <input type="range" min={0} max={1} step={0.05} value={s.soundVolume} onChange={(e) => setSettings({ soundVolume: Number(e.target.value) })} />
              <button className="btn" onClick={() => playSound('celebrate', s.soundVolume)}>
                🔊 Test
              </button>
            </div>
          </Field>
        </div>
      </Section>
      {PACKS.map((pack) => {
        const items = ANIMATIONS.filter((a) => a.pack === pack.id);
        const ids = items.map((a) => a.id);
        const enabledCount = ids.filter((id) => !s.disabledAnimations.includes(id)).length;
        return (
          <Section
            key={pack.id}
            title={`${pack.name} (${enabledCount}/${ids.length} on)`}
            actions={
              <Toggle
                checked={enabledCount > 0}
                onChange={(on) => setEnabled(ids, on)}
                label={enabledCount === ids.length ? 'Whole pack on' : enabledCount === 0 ? 'Whole pack off' : 'Partly on'}
              />
            }
          >
            <div className="anim-grid">
              {items.map((a) => {
                const enabled = !s.disabledAnimations.includes(a.id);
                return (
                  <div key={a.id} className={`anim-card ${enabled ? '' : 'off'}`}>
                    <div className="anim-emoji emoji">{a.emoji}</div>
                    <div className="anim-name">{a.name}</div>
                    <span className="badge">{MOOD_LABEL[a.mood]}</span>
                    <Toggle checked={enabled} onChange={(v) => setEnabled([a.id], v)} label={enabled ? 'Enabled' : 'Disabled'} />
                    <div className="inline">
                      <button className="btn" onClick={() => playLocal(a.id)}>
                        ▶ Here
                      </button>
                      <button className="btn" onClick={() => onScreens(a.id)}>
                        📺 Screens
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        );
      })}
    </>
  );
}
