/** Minimal ZIP writer (stored, no compression) — enough to bundle per-layer SVGs into one download. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry { name: string; data: Uint8Array | string }

/** DOS date/time fields for `d` (local time, as ZIP tools expect). */
function dosTime(d: Date): [number, number] {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

export function zip(entries: ZipEntry[], when = new Date()): Uint8Array {
  const enc = new TextEncoder(), [time, date] = dosTime(when);
  const files = entries.map((e) => {
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    return { name: enc.encode(e.name), data, crc: crc32(data) };
  });
  const size = files.reduce((n, f) => n + 30 + f.name.length + f.data.length + 46 + f.name.length, 22);
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  let o = 0;
  const u16 = (x: number) => { v.setUint16(o, x, true); o += 2; };
  const u32 = (x: number) => { v.setUint32(o, x, true); o += 4; };
  const bytes = (b: Uint8Array) => { out.set(b, o); o += b.length; };
  // Bit 11 = file names are UTF-8.
  const header = (f: (typeof files)[number]) => { u16(20); u16(0x0800); u16(0); u16(time); u16(date); u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0); };
  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(o);
    u32(0x04034b50); header(f); bytes(f.name); bytes(f.data);
  }
  const cd = o;
  files.forEach((f, i) => {
    u32(0x02014b50); u16(20); header(f); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]); bytes(f.name);
  });
  const cdSize = o - cd;
  u32(0x06054b50); u16(0); u16(0); u16(files.length); u16(files.length); u32(cdSize); u32(cd); u16(0);
  return out;
}
