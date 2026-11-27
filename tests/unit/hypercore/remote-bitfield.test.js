import test from 'brittle'
import RemoteBitfield from 'hypercore/lib/remote-bitfield.js'

test('remote bitfield: clear skips absent pages and applies the mask to existing pages', (t) => {
    const bitfield = new RemoteBitfield()
    const pageSize = RemoteBitfield.BITS_PER_PAGE
    const fullPage = new Uint32Array(pageSize / 32).fill(0xffffffff)

    t.ok(bitfield.clear(0, fullPage))
    t.ok(bitfield.getBitfield(0) === null, 'no page allocated')
    t.is(bitfield._maxSegments, 0, 'no segment allocated')

    bitfield.setRange(pageSize, pageSize + 32, true)
    const mask = new Uint32Array([0xffffffff, 0xff])
    t.ok(bitfield.clear(pageSize - 32, mask))
    t.ok(bitfield.getBitfield(pageSize - 32) === null, 'the first page remains absent')
    t.absent(bitfield.get(pageSize + 7), 'the mask cleared the bit on the next page')
    t.ok(bitfield.get(pageSize + 8), 'a bit outside the mask is still set')
})
