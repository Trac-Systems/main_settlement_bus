import test from 'brittle';
import fileUtils from '../src/utils/fileUtils.js';

test('readPublicKeysFromFile', async (t) => {
    // TODO: This is reading the real whitelist file (which is not a good practice)
    // -- In the future, this function should be generalized so we can mock the file reading
    // -- and test the function without relying on the actual file.
    // -- For now, we will just check if the file reading works and returns an array of public keys.
    const pubKeys = await fileUtils.readPublicKeysFromFile(); 
    t.ok(Array.isArray(pubKeys), 'Should return an array');
    t.ok(pubKeys.length > 0, 'Should return a non-empty array'); // Assuming the file has at least one public key. Without being able to mock the file, we can't guarantee this.
    pubKeys.forEach((key) => {
        t.is(typeof key, 'string', 'Each public key should be a string');
    });
}
);