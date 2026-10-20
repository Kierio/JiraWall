// Switches the HDMI TVs on and off with cec-ctl (v4l-utils), on a schedule set on
// the admin page. Each HDMI port on the Pi is its own CEC adapter (/dev/cec0, /dev/cec1).

import { execFile as nodeExecFile } from 'node:child_process';
import fs from 'node:fs';
import { tvShouldBeOn } from '../../shared/theme.js';
import type { TvPower, TvSchedule, TvStatus } from '../../shared/types.js';

export type ExecFile = (file: string, args: string[]) => Promise<string>;

const defaultExec: ExecFile = (file, args) =>
  new Promise((resolve, reject) => {
    nodeExecFile(file, args, { timeout: 15_000 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || '').trim().split('\n').pop();
        reject(Object.assign(new Error(detail || err.message), { code: (err as NodeJS.ErrnoException).code }));
      } else resolve(String(stdout));
    });
  });

const defaultDevices = () => {
  try {
    return fs
      .readdirSync('/dev')
      .filter((name) => /^cec\d+$/.test(name))
      .sort()
      .map((name) => `/dev/${name}`);
  } catch {
    return [];
  }
};

/** "Physical Address : 1.0.0.0" from cec-ctl's adapter report. */
export function parsePhysicalAddress(output: string): string | undefined {
  const m = /Physical Address\s*:\s*([0-9a-f]\.[0-9a-f]\.[0-9a-f]\.[0-9a-f])/i.exec(output);
  return m && m[1] !== 'f.f.f.f' ? m[1] : undefined;
}

/** "pwr-state: on (0x00)" from a give-device-power-status reply. */
export function parsePowerStatus(output: string): TvPower {
  const m = /pwr-state:\s*([a-z-]+)/i.exec(output);
  if (!m) return 'unknown';
  const state = m[1].toLowerCase();
  // to-on / to-standby are the TV mid-transition; report where it is heading.
  if (state === 'on' || state === 'to-on') return 'on';
  if (state === 'standby' || state === 'to-standby') return 'standby';
  return 'unknown';
}

export class CecController {
  private readonly exec: ExecFile;
  private readonly devices: () => string[];
  /** Adapter -> its physical address, once it has been set up as a playback device. */
  private configured = new Map<string, string>();

  constructor(options: { exec?: ExecFile; devices?: () => string[] } = {}) {
    this.exec = options.exec ?? defaultExec;
    this.devices = options.devices ?? defaultDevices;
  }

  /** Whether cec-ctl is installed. */
  async available(): Promise<boolean> {
    try {
      await this.exec('cec-ctl', ['--version']);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== 'ENOENT';
    }
  }

  private async configure(device: string): Promise<string | undefined> {
    if (this.configured.has(device)) return this.configured.get(device);
    // An adapter can't send anything until it has a logical address.
    const out = await this.exec('cec-ctl', ['-d', device, '--playback', '--osd-name', 'Dashboard']);
    const address = parsePhysicalAddress(out);
    // No address yet (a TV in standby can hide it): ask again next time.
    if (address) this.configured.set(device, address);
    return address;
  }

  /** Turns every TV on (and switches it to the Pi's input) or puts it in standby. */
  async power(on: boolean): Promise<void> {
    const devices = this.devices();
    if (!devices.length) throw new Error(await this.missingReason());
    const errors: string[] = [];
    await Promise.all(
      devices.map(async (device) => {
        try {
          const address = await this.configure(device);
          if (on) {
            await this.exec('cec-ctl', ['-d', device, '--to', '0', '--image-view-on']);
            if (address) await this.exec('cec-ctl', ['-d', device, '--to', '15', '--active-source', `phys-addr=${address}`]);
          } else {
            await this.exec('cec-ctl', ['-d', device, '--to', '0', '--standby']);
          }
        } catch (err) {
          this.configured.delete(device); // set it up again next time
          errors.push(`${device}: ${(err as Error).message}`);
        }
      }),
    );
    if (errors.length) throw new Error(errors.join('; '));
  }

  async status(): Promise<Pick<TvStatus, 'available' | 'devices'>> {
    const available = await this.available();
    if (!available) return { available, devices: [] };
    const devices = await Promise.all(
      this.devices().map(async (device) => {
        try {
          await this.configure(device);
          const out = await this.exec('cec-ctl', ['-d', device, '--to', '0', '--give-device-power-status']);
          return { device, power: parsePowerStatus(out) };
        } catch (err) {
          this.configured.delete(device);
          return { device, power: 'unknown' as const, error: (err as Error).message };
        }
      }),
    );
    return { available, devices };
  }

  private async missingReason(): Promise<string> {
    if (!(await this.available())) return 'cec-ctl is not installed. On the Pi run: bash deploy/setup-cec.sh';
    return 'No HDMI-CEC adapters found (/dev/cec*). Check the TVs are connected and CEC is enabled on them.';
  }
}

/**
 * Checks the schedule every 30 s and switches the TVs only when the wanted state
 * changes (e.g. at the "on" time). Nothing happens at startup, so a TV someone
 * turned on by hand out of hours stays on until the next scheduled change.
 */
export class TvScheduler {
  private schedule?: TvSchedule;
  private wanted?: boolean;
  private timer?: NodeJS.Timeout;
  lastAction?: TvStatus['lastAction'];
  lastError?: string;

  constructor(
    private readonly cec: Pick<CecController, 'power' | 'status'>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  apply(schedule: TvSchedule) {
    const changed = JSON.stringify(schedule) !== JSON.stringify(this.schedule);
    this.schedule = schedule;
    // A new schedule starts from "what it wants now", so saving doesn't switch the TVs.
    if (changed) this.wanted = schedule.enabled ? tvShouldBeOn(schedule, this.now()) : undefined;
  }

  start() {
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
  }

  async tick() {
    const schedule = this.schedule;
    if (!schedule?.enabled) return;
    const wanted = tvShouldBeOn(schedule, this.now());
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    await this.power(wanted, true).catch(() => undefined);
  }

  async power(on: boolean, scheduled = false) {
    this.lastAction = { on, at: this.now().getTime(), scheduled };
    try {
      await this.cec.power(on);
      this.lastError = undefined;
      console.log(`[tv] ${scheduled ? 'scheduled' : 'manual'}: turned the TVs ${on ? 'on' : 'off'}`);
    } catch (err) {
      this.lastError = (err as Error).message;
      console.warn(`[tv] could not turn the TVs ${on ? 'on' : 'off'}: ${this.lastError}`);
      throw err;
    }
  }

  async status(): Promise<TvStatus> {
    return { ...(await this.cec.status()), lastAction: this.lastAction, lastError: this.lastError };
  }
}
