// These patterns target protobufjs-cli's static-module output. Count every byte
// field against its encoder so a changed generator fails instead of silently
// leaving one of the conversion paths unadapted.
export function transformProtobufs(source, runtimePath) {
    const runtimeImport = `var $protobuf = require(${JSON.stringify(runtimePath)});`;
    const checkBinaryHandling = () => {
        if (/\$util\.base64\.|\bUint8Array\b|\bBuffer\b/.test(source)) {
            throw new Error('Unsupported protobufjs output: unadapted binary handling');
        }
    };
    if (source.includes(runtimeImport)) {
        checkBinaryHandling();
        return source;
    }

    const replace = (pattern, replacement, expected, label) => {
        const count = [...source.matchAll(pattern)].length;
        if (count !== expected) {
            throw new Error(`Unsupported protobufjs output (${label}): expected ${expected} matches, got ${count}`);
        }
        source = source.replace(pattern, replacement);
    };

    const messages = [...source.matchAll(/\.encode = function encode\(/g)].length;
    const fields = [...source.matchAll(/\.bytes\(message(?:\.|\[)/g)].length;

    replace(/var \$protobuf = require\("protobufjs\/minimal"\);/g, runtimeImport, 1, 'runtime import');
    replace(/"use strict";/g,
        '"use strict";\n\n/** @typedef {ReturnType<typeof import("b4a").alloc>} B4aBuffer */',
        1, 'type declaration');
    source = source.replace(/\/\*\*[\s\S]*?\*\//g, comment => comment.replace(/\bUint8Array\b/g, 'B4aBuffer'));

    replace(/if \(!writer\)\n\s+writer = \$Writer\.create\(\);/g,
        'writer = $Writer.create(writer);', messages, 'writers');
    replace(/if \(!\(reader instanceof \$Reader\)\)\n\s+reader = (?:\$Reader\.create\(reader\)|new \$Reader\(reader\));/g,
        'reader = $Reader.create(reader);', messages * 2, 'readers');

    // A supplied protobufjs reader may return an array rather than a b4a buffer.
    replace(/reader\.bytes\(\)/g, '$util.bytesFrom(reader.bytes())', fields, 'decoded bytes');
    replace(/\((message[^\n]+?) && typeof \1\.length === "number" \|\| \$util\.isString\(\1\)\)/g,
        '$util.isBytes($1)', fields, 'byte validation');

    // Existing instances need normalization too. Copy only own fields so absent
    // prototype defaults do not become present fields in the encoded message.
    replace(/(if \(object instanceof \$root\.[\w.]+\)\n\s+)return object;/g,
        '$1object = Object.assign({}, object);', messages, 'fromObject instances');
    replace(/if \(typeof (object[^\n]+?) === "string"\)\n\s+\$util\.base64\.decode\(\1, (message[^\n]+?) = \$util\.newBuffer\(\$util\.base64\.length\(\1\)\), 0\);\n\s+else if \(\1\.length >= 0\)\n\s+\2 = \1;/g,
        '$2 = $util.bytesFrom($1);', fields, 'fromObject bytes');
    replace(/options\.bytes === String \? \$util\.base64\.encode\((message[^\n]+?), 0, \1\.length\) : options\.bytes === Array \? Array\.prototype\.slice\.call\(\1\) : \1/g,
        '$util.bytesTo($1, options)', fields, 'toObject bytes');

    checkBinaryHandling();
    return source;
}
