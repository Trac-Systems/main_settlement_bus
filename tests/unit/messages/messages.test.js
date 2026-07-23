import { default as test } from 'brittle';

async function runMsgUtilsTests() {
    test.pause();
    await import('./state/applyStateMessageBuilder.complete.test.js');
    await import('./state/applyStateMessageBuilder.partial.test.js');
    await import('./network/NetworkMessageBuilder.test.js');
    await import('./network/NetworkMessageDirector.test.js');
    await import('./consensus/ConsensusMessageBuilder.test.js');
    await import('./consensus/ConsensusMessageDirector.test.js');
    await import('./state/applyStateMessageDirector.test.js');
    test.resume();
}

await runMsgUtilsTests();
