import { describe, expect, it } from 'vitest';
import type { TvSchedule } from '../shared/types';
import { CecController, parsePhysicalAddress, parsePowerStatus, TvScheduler, type ExecFile } from '../server/tv/cec';

function fakeCec(outputs: Record<string, string> = {}) {
  const calls: string[] = [];
  const exec: ExecFile = async (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    const match = Object.keys(outputs).find((k) => line.includes(k));
    const out = match ? outputs[match] : '';
    if (out === 'ENOENT') throw Object.assign(new Error('spawn cec-ctl ENOENT'), { code: 'ENOENT' });
    if (out.startsWith('FAIL')) throw new Error(out);
    return out;
  };
  return { calls, exec };
}

describe('cec-ctl output parsing', () => {
  it('reads the physical address and ignores the unconnected one', () => {
    expect(parsePhysicalAddress('Driver Info:\n\tPhysical Address           : 2.0.0.0\n')).toBe('2.0.0.0');
    expect(parsePhysicalAddress('Physical Address : f.f.f.f')).toBeUndefined();
  });

  it('reads power states, including transitions', () => {
    expect(parsePowerStatus('REPORT_POWER_STATUS (0x90):\n\tpwr-state: on (0x00)')).toBe('on');
    expect(parsePowerStatus('pwr-state: standby (0x01)')).toBe('standby');
    expect(parsePowerStatus('pwr-state: to-on (0x02)')).toBe('on');
    expect(parsePowerStatus('Transmit: timeout')).toBe('unknown');
  });
});

describe('CecController', () => {
  it('sets each adapter up once, then wakes the TV and switches to the Pi', async () => {
    const { calls, exec } = fakeCec({ '--playback': 'Physical Address : 1.0.0.0' });
    const cec = new CecController({ exec, devices: () => ['/dev/cec0', '/dev/cec1'] });
    await cec.power(true);
    await cec.power(false);
    expect(calls.filter((c) => c.includes('--playback'))).toHaveLength(2);
    expect(calls).toContain('cec-ctl -d /dev/cec0 --to 0 --image-view-on');
    expect(calls).toContain('cec-ctl -d /dev/cec1 --to 15 --active-source phys-addr=1.0.0.0');
    expect(calls).toContain('cec-ctl -d /dev/cec1 --to 0 --standby');
  });

  it('reports a failing adapter and sets it up again next time', async () => {
    const { calls, exec } = fakeCec({ '--playback': 'Physical Address : 1.0.0.0', 'cec1 --to 0 --standby': 'FAIL timeout' });
    const cec = new CecController({ exec, devices: () => ['/dev/cec0', '/dev/cec1'] });
    await expect(cec.power(false)).rejects.toThrow('/dev/cec1: FAIL timeout');
    await cec.power(true);
    expect(calls.filter((c) => c.includes('-d /dev/cec1 --playback'))).toHaveLength(2);
    expect(calls.filter((c) => c.includes('-d /dev/cec0 --playback'))).toHaveLength(1);
  });

  it('explains a missing cec-ctl instead of crashing', async () => {
    const { exec } = fakeCec({ 'cec-ctl': 'ENOENT' });
    const cec = new CecController({ exec, devices: () => [] });
    await expect(cec.power(true)).rejects.toThrow(/not installed/);
    expect(await cec.status()).toEqual({ available: false, devices: [] });
  });

  it('asks each TV for its power state', async () => {
    const { exec } = fakeCec({ '--give-device-power-status': 'pwr-state: standby (0x01)' });
    const cec = new CecController({ exec, devices: () => ['/dev/cec0'] });
    expect(await cec.status()).toEqual({ available: true, devices: [{ device: '/dev/cec0', power: 'standby' }] });
  });
});

describe('TvScheduler', () => {
  const schedule: TvSchedule = { enabled: true, onAt: '08:00', offAt: '18:00', days: [0, 1, 2, 3, 4, 5, 6] };

  function setup(start: string) {
    let now = new Date(`2026-10-14T${start}:00`);
    const actions: boolean[] = [];
    const tv = new TvScheduler(
      { power: async (on) => void actions.push(on), status: async () => ({ available: true, devices: [] }) },
      () => now,
    );
    return { tv, actions, setTime: (hhmm: string) => (now = new Date(`2026-10-14T${hhmm}:00`)) };
  }

  it('acts only when the wanted state changes, never at startup', async () => {
    const { tv, actions, setTime } = setup('12:00');
    tv.apply(schedule);
    await tv.tick();
    expect(actions).toEqual([]);
    setTime('18:00');
    await tv.tick();
    await tv.tick();
    expect(actions).toEqual([false]);
    expect(tv.lastAction).toMatchObject({ on: false, scheduled: true });
  });

  it('does nothing while disabled, and saving a schedule does not switch the TVs', async () => {
    const { tv, actions, setTime } = setup('07:00');
    tv.apply({ ...schedule, enabled: false });
    setTime('09:00');
    await tv.tick();
    tv.apply(schedule);
    await tv.tick();
    expect(actions).toEqual([]);
    setTime('18:30');
    await tv.tick();
    expect(actions).toEqual([false]);
  });

  it('keeps the error for the admin page', async () => {
    const tv = new TvScheduler({ power: async () => Promise.reject(new Error('no TVs')), status: async () => ({ available: true, devices: [] }) });
    await expect(tv.power(true)).rejects.toThrow('no TVs');
    expect((await tv.status()).lastError).toBe('no TVs');
  });
});
