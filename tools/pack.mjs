/**
 * The bake container: 'RGWF' magic, header length, a JSON header naming each typed array
 * (and any `meta`), then the arrays, 4-byte aligned. Read back by src/world/data.ts `unpack`.
 */
export function pack(arrays, meta = {}) {
  const entries = [];
  let offset = 0;
  for (const [name, arr] of Object.entries(arrays)) {
    offset = (offset + 3) & ~3;
    entries.push({ name, type: arr.constructor.name, offset, length: arr.length });
    offset += arr.byteLength;
  }
  const header = Buffer.from(JSON.stringify({ meta, arrays: entries }));
  const headerLen = (header.length + 3) & ~3;
  const buf = Buffer.alloc(8 + headerLen + offset, 0x20);
  buf.writeUInt32LE(0x46574752, 0); // 'RGWF'
  buf.writeUInt32LE(headerLen, 4);
  header.copy(buf, 8);
  const base = 8 + headerLen;
  entries.forEach((e, i) => {
    const arr = Object.values(arrays)[i];
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(buf, base + e.offset);
  });
  return buf;
}
