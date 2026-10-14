import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  type ChartConfiguration,
  type Plugin,
} from 'chart.js';
import { useEffect, useRef } from 'react';

// Tooltip and Legend plugins are deliberately not registered: a wall display has no pointer, so values are labelled directly.
Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement);

Chart.defaults.color = '#898781';
Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";
Chart.defaults.font.size = 16;
Chart.defaults.borderColor = '#2c2c2a';
Chart.defaults.animation = { duration: 600 };

/** Thin wrapper: creates the chart once and updates it in place when the config changes. */
export function ChartCanvas({ config }: { config: ChartConfiguration }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    chart.current = new Chart(canvas.current, config);
    return () => {
      chart.current?.destroy();
      chart.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.data = config.data;
    if (config.options) c.options = config.options;
    c.update();
  }, [config]);

  return <canvas ref={canvas} />;
}

/**
 * Draws value labels on selected points / bars of every dataset, in text ink rather
 * than series colour. `indexes` picks which points get a label (selective labelling).
 */
export function valueLabels(opts: {
  indexes?: (values: number[], datasetIndex: number) => number[];
  color: string;
  font?: string;
  position: 'top' | 'end';
}): Plugin {
  return {
    id: 'valueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = opts.color;
      ctx.font = opts.font ?? "600 18px system-ui, -apple-system, 'Segoe UI', sans-serif";
      chart.data.datasets.forEach((dataset, d) => {
        const values = (dataset.data ?? []) as number[];
        const show = new Set(opts.indexes ? opts.indexes(values, d) : values.map((_, i) => i));
        chart.getDatasetMeta(d).data.forEach((el, i) => {
          if (!show.has(i)) return;
          const { x, y } = el.getProps(['x', 'y'], true) as { x: number; y: number };
          const text = String(values[i]);
          if (opts.position === 'top') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(text, x, y - 10);
          } else {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + 8, y);
          }
        });
      });
      ctx.restore();
    },
  };
}

/** Space reserved in front of y-axis labels for an icon (see axisIcons). */
export const ICON_GAP = '  ';

/**
 * Draws an image in front of each y-axis label of a horizontal bar chart. The y
 * ticks must use crossAlign 'far' and labels prefixed with ICON_GAP.
 */
export function axisIcons(iconFor: (label: string) => HTMLImageElement | undefined, size = 20): Plugin {
  return {
    id: 'axisIcons',
    afterDraw(chart) {
      const scale = chart.scales.y;
      if (!scale) return;
      const labels = (chart.data.labels ?? []) as string[];
      labels.forEach((label, i) => {
        const img = iconFor(label);
        if (!img) return;
        const y = scale.getPixelForTick(i);
        const draw = () => chart.ctx.drawImage(img, scale.left, y - size / 2, size, size);
        // Data-URI images decode asynchronously the first time; redraw once ready.
        if (img.complete) draw();
        else img.addEventListener('load', () => chart.draw(), { once: true });
      });
    },
  };
}
