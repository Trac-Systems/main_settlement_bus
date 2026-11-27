// Hypercore #874 avoids allocating a page and segment when clearing absent bits.
// https://github.com/holepunchto/hypercore/pull/874
export default {
    file: 'lib/remote-bitfield.js',
    label: '#874',
    originalSha256: '2311911df0c6357f9da4675b67664598229ebd83bf904b6b5eca40cd21c79489',
    patchedSha256: 'f0cc2b4cc633a366f6ccc5418beb41ea5687954c79c53a062118c9ebb372219c',
    edits: [
        [
            String.raw`      let p = this._pages.get(i)

      if (!p) {
        const k = Math.floor(i / PAGES_PER_SEGMENT)
        const s = this._segments.get(k) || this._segments.set(k, new RemoteBitfieldSegment(k))
        if (this._maxSegments <= k) this._maxSegments = k + 1

        p = this._pages.set(i, new RemoteBitfieldPage(i, new Uint32Array(WORDS_PER_PAGE), s))
      }

      const end = Math.min(j + length, BITS_PER_PAGE)
      const range = end - j

      p.clear(j, bitfield.subarray(0, range / 32))`,
            String.raw`      const p = this._pages.get(i)
      const end = Math.min(j + length, BITS_PER_PAGE)
      const range = end - j

      if (p) p.clear(j, bitfield.subarray(0, range / 32))`
        ]
    ]
}
