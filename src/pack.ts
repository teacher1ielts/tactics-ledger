import LZ from 'lz-string'

const PREFIX = 'lz1:'

/** Big, rarely-changing data (imported history) is stored compressed: roughly 10x smaller. */
export const pack = (json: string) => PREFIX + LZ.compressToUTF16(json)

/** Reads either a packed or a plain string, so nothing breaks if the format ever changes. */
export function unpack(raw: string | null): string | null {
  if (raw == null) return null
  return raw.startsWith(PREFIX) ? LZ.decompressFromUTF16(raw.slice(PREFIX.length)) : raw
}
