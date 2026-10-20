import type { RadioState } from './types.js';

export interface RadioStation {
  id: string;
  name: string;
  group: 'BBC' | 'Global' | 'Bauer' | 'Other';
  url: string;
}

const bbc = (id: string, name: string, pool: string, stream: string): RadioStation => ({
  id,
  name,
  group: 'BBC',
  url: `https://as-hls-ww-live.akamaized.net/pool_${pool}/live/ww/${stream}/${stream}.isml/${stream}-audio%3d128000.norewind.m3u8`,
});
const global = (id: string, name: string, path: string): RadioStation => ({ id, name, group: 'Global', url: `https://media-ssl.musicradio.com/${path}` });

/**
 * UK stations offered on the Radio tab. BBC streams are HLS (.m3u8, played through
 * hls.js); the rest are plain Icecast MP3/AAC. Checked working October 2026; the
 * admin page can also search radio-browser.info or take any stream address.
 */
export const RADIO_STATIONS: RadioStation[] = [
  bbc('bbc-radio-1', 'BBC Radio 1', '01505109', 'bbc_radio_one'),
  bbc('bbc-1xtra', 'BBC Radio 1Xtra', '92079267', 'bbc_1xtra'),
  bbc('bbc-radio-2', 'BBC Radio 2', '74208725', 'bbc_radio_two'),
  bbc('bbc-radio-3', 'BBC Radio 3', '23461179', 'bbc_radio_three'),
  bbc('bbc-radio-4', 'BBC Radio 4', '55057080', 'bbc_radio_fourfm'),
  bbc('bbc-radio-4-extra', 'BBC Radio 4 Extra', '26173715', 'bbc_radio_four_extra'),
  bbc('bbc-5-live', 'BBC Radio 5 Live', '89021708', 'bbc_radio_five_live'),
  bbc('bbc-6-music', 'BBC Radio 6 Music', '81827798', 'bbc_6music'),
  global('capital', 'Capital', 'CapitalMP3'),
  global('capital-xtra', 'Capital XTRA', 'CapitalXTRANationalMP3'),
  global('heart', 'Heart', 'HeartUKMP3'),
  global('smooth', 'Smooth', 'SmoothUKMP3'),
  global('classic-fm', 'Classic FM', 'ClassicFMMP3'),
  global('radio-x', 'Radio X', 'RadioXUKMP3'),
  global('lbc', 'LBC', 'LBCUKMP3'),
  global('gold', 'Gold', 'GoldMP3'),
  { id: 'absolute', name: 'Absolute Radio', group: 'Bauer', url: 'https://stream-ar.hellorayo.co.uk/absoluteradio.mp3?aw_0_1st.skey=1602676850&direct=true' },
  { id: 'kiss', name: 'KISS', group: 'Bauer', url: 'https://live-bauerkiss.sharp-stream.com/kissnational.aac?direct=true&aw_0_1st.skey=1602676850&rp_source=1' },
  {
    id: 'magic',
    name: 'Magic Radio',
    group: 'Bauer',
    url: 'https://stream-mz.hellorayo.co.uk/magicnational.mp3?direct=true&aw_0_1st.playerid=BMUK_TuneIn&aw_0_1st.skey=7374499933&stationCode=mag',
  },
  {
    id: 'greatest-hits',
    name: 'Greatest Hits Radio',
    group: 'Bauer',
    url: 'https://stream-mz.hellorayo.co.uk/net2westmidlands.aac?aw_0_1st.skey=1602676850&direct=true&rp_source=1',
  },
  { id: 'times-radio', name: 'Times Radio', group: 'Other', url: 'https://timesradio.wireless.radio/stream' },
  { id: 'talksport', name: 'talkSPORT', group: 'Other', url: 'https://radio.talksport.com/stream' },
  { id: 'virgin', name: 'Virgin Radio', group: 'Other', url: 'https://radio.virginradio.co.uk/stream' },
];

export const DEFAULT_RADIO: RadioState = {
  playing: false,
  stationId: 'bbc-radio-2',
  name: 'BBC Radio 2',
  url: RADIO_STATIONS.find((s) => s.id === 'bbc-radio-2')!.url,
  volume: 0.3,
  screen: 1,
  onlyWhenTvOn: true,
};

/** HLS streams need hls.js (or native support) instead of a plain audio src. */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}
