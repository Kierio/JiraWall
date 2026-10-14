import confetti from 'canvas-confetti';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { DashboardEvent, Settings } from '../../../shared/types';
import { animationById } from '../../../shared/animations';
import './animations.css';
import { LIBRARY } from './library';
import { playSound } from './sound';
import type { Stage } from './stage';

export interface AnimationLayerHandle {
  enqueue(event: DashboardEvent): void;
}

const MAX_QUEUE = 15;

/**
 * Full-screen overlay that plays events one at a time. Alert events jump ahead of
 * queued celebrations; if the queue overflows, the oldest non-alert events are dropped.
 */
export const AnimationLayer = forwardRef<AnimationLayerHandle, { settings?: Settings }>(function AnimationLayer({ settings }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<DashboardEvent[]>([]);
  const playing = useRef(false);
  const alive = useRef(true);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const confettiRef = useRef<confetti.CreateTypes | null>(null);

  useEffect(() => {
    alive.current = true;
    // A canvas can only be handed to a worker once, so create the instance once per mount (StrictMode re-runs effects).
    if (canvas.current && !confettiRef.current) confettiRef.current = confetti.create(canvas.current, { resize: true, useWorker: true });
    return () => {
      alive.current = false;
      confettiRef.current?.reset();
    };
  }, []);

  const playNext = async () => {
    if (playing.current) return;
    playing.current = true;
    try {
      while (queue.current.length && alive.current) {
        const event = queue.current.shift()!;
        await playOne(event);
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      playing.current = false;
    }
  };

  const playOne = async (event: DashboardEvent) => {
    const node = root.current;
    const fire = confettiRef.current;
    if (!node || !fire) return;
    const play = LIBRARY[event.animationId] ?? LIBRARY['thumbs-burst'];
    const s = settingsRef.current;
    if (event.sound && s) playSound(event.mood, s.soundVolume, animationById(event.animationId)?.sound);
    // Each run draws into its own container. If a run times out, its container is
    // removed and anything its code still adds afterwards lands off-screen.
    const container = document.createElement('div');
    container.className = 'anim-run';
    node.appendChild(container);
    let finished = false;
    const stage: Stage = {
      root: container,
      event,
      duration: s?.animationDurationMs ?? 6000,
      width: node.clientWidth,
      height: node.clientHeight,
      confetti: fire,
      cancelled: () => finished || !alive.current,
    };
    // A broken or stalled animation must never wedge the queue.
    const timeout = new Promise<void>((r) => setTimeout(r, stage.duration + 8000));
    try {
      await Promise.race([play(stage), timeout]);
    } catch (err) {
      console.error('animation failed', event.animationId, err);
    }
    finished = true;
    container.remove();
  };

  useImperativeHandle(ref, () => ({
    enqueue(event) {
      const q = queue.current;
      if (event.mood === 'alert') {
        const firstNonAlert = q.findIndex((e) => e.mood !== 'alert');
        q.splice(firstNonAlert === -1 ? q.length : firstNonAlert, 0, event);
      } else {
        q.push(event);
      }
      while (q.length > MAX_QUEUE) {
        const drop = q.findIndex((e) => e.mood !== 'alert');
        q.splice(drop === -1 ? 0 : drop, 1);
      }
      void playNext();
    },
  }));

  return (
    <div className="anim-layer" ref={root}>
      <canvas ref={canvas} />
    </div>
  );
});
