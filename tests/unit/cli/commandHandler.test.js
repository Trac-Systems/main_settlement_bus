import { test } from "brittle";
import sinon from "sinon";

import { CommandHandler } from "../../../cli/commandHandler.js";

function createPreparedTransfer() {
    return {
        amountBigInt: 10n,
        feeBigInt: 3n,
        senderBalance: 50n,
        totalDeductedAmount: 13n,
        expectedNewBalance: 37n,
        isSelfTransfer: false
    };
}

function createSubject(overrides = {}) {
    const preparedTransfer = overrides.preparedTransfer ?? createPreparedTransfer();
    const msb = {
        prepareTransferOperation: sinon.stub().resolves(preparedTransfer),
        submitPreparedTransferOperation: sinon.stub().resolves("tx-hash"),
        handleEpochGenesisInitialization: sinon.stub().resolves("genesis-tx-hash"),
        handleSetConsensusConfig: sinon.stub().resolves("set-consensus-config-tx-hash"),
        printHelp: sinon.stub(),
        close: sinon.stub(),
        ...overrides.msb
    };

    const handler = new CommandHandler({
        config: {},
        msb,
        handleClose: async () => {},
        wallet: undefined
    });

    return { handler, msb, preparedTransfer };
}

function stubConsole(t) {
    sinon.stub(console, "info");
    sinon.stub(console, "log");
    sinon.stub(console, "error");
    t.teardown(() => sinon.restore());
}

test("CommandHandler queues transfer preview without submitting immediately", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/transfer trac1recipient 10");

    t.ok(msb.prepareTransferOperation.calledOnceWithExactly("trac1recipient", "10"));
    t.ok(msb.submitPreparedTransferOperation.notCalled);
    t.ok(console.info.calledWith("Transfer Details:"));
    t.ok(console.info.calledWithMatch(sinon.match(/Estimated transaction fee:/)));
    t.ok(console.info.calledWithMatch(sinon.match(/Current balance:/)));
    t.ok(console.info.calledWithMatch(sinon.match(/Balance after transaction:/)));
    t.ok(console.log.calledWith("Do you want to proceed? (y/n)"));
});

test("CommandHandler submits prepared transfer when confirmation is affirmative", async (t) => {
    stubConsole(t);

    const { handler, msb, preparedTransfer } = createSubject();

    await handler.handle("/transfer trac1recipient 10");
    await handler.handle("YES");

    t.ok(msb.submitPreparedTransferOperation.calledOnceWithExactly(preparedTransfer));
    t.ok(msb.printHelp.notCalled);
});

test("CommandHandler declines prepared transfer and shows help", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/transfer trac1recipient 10");
    await handler.handle("n");

    t.ok(msb.submitPreparedTransferOperation.notCalled);
    t.ok(msb.printHelp.calledOnce);
});

test("CommandHandler re-prompts on invalid confirmation input and keeps pending transfer", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/transfer trac1recipient 10");
    await handler.handle("maybe");

    t.ok(msb.submitPreparedTransferOperation.notCalled);
    t.ok(console.log.calledWith('Invalid input. Please answer "y" or "n".'));
    t.ok(console.log.calledWith("Do you want to proceed? (y/n)"));

    await handler.handle("y");

    t.ok(msb.submitPreparedTransferOperation.calledOnce);
});

test("CommandHandler clears pending confirmation after submission failure", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject({
        msb: {
            submitPreparedTransferOperation: sinon.stub().rejects(new Error("boom"))
        }
    });

    await handler.handle("/transfer trac1recipient 10");
    await handler.handle("y");

    t.ok(console.error.calledWith("Transaction submission failed: boom"));
    t.ok(console.log.calledWith("Try again or use /help."));

    await handler.handle("/transfer trac1recipient 11");

    t.is(msb.prepareTransferOperation.callCount, 2);
});

test("CommandHandler collects genesis epoch params before confirmation", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/init_genesis");

    t.ok(console.log.calledWith("Set VDF difficulty (example 55_000_000):"));

    await handler.handle("55_000_000");

    t.ok(console.log.calledWith("Set VDF discriminant bit size (example 2048):"));

    await handler.handle("2048");

    t.ok(console.info.calledWith("Genesis Epoch Initialization Parameters:"));
    t.ok(console.info.calledWith("VDF difficulty: 55_000_000"));
    t.ok(console.info.calledWith("VDF discriminant bit size: 2048"));
    t.ok(console.log.calledWith("Do you want to proceed? (yes/no)"));
    t.ok(msb.handleEpochGenesisInitialization.notCalled);

    await handler.handle("yes");

    t.ok(msb.handleEpochGenesisInitialization.calledOnceWithExactly({
        schemaVersion: 1,
        configData: {
            difficulty: 55_000_000,
            discriminantBitSize: 2048
        }
    }));
});

test("CommandHandler re-prompts invalid genesis epoch params and cancels on no", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/init_genesis");
    await handler.handle("abc");

    t.ok(console.log.calledWith("Invalid difficulty. Please enter a positive integer (example 55_000_000)."));
    t.ok(msb.handleEpochGenesisInitialization.notCalled);

    await handler.handle("55_000_000");
    await handler.handle("0");

    t.ok(console.log.calledWith("Invalid discriminant bit size. Please enter a positive integer (example 2048)."));

    await handler.handle("2048");
    await handler.handle("no");

    t.ok(console.log.calledWith("Genesis epoch initialization cancelled."));
    t.ok(msb.handleEpochGenesisInitialization.notCalled);
});

test("CommandHandler enforces genesis config bounds", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/init_genesis");
    await handler.handle("4_294_967_296");

    t.ok(console.log.calledWith("Invalid difficulty. Please enter a positive integer (example 55_000_000)."));
    t.ok(!console.log.calledWith("Set VDF discriminant bit size (example 2048):"));

    await handler.handle("4_294_967_295");
    await handler.handle("65_536");

    t.ok(console.log.calledWith("Invalid discriminant bit size. Please enter a positive integer (example 2048)."));
    t.ok(msb.handleEpochGenesisInitialization.notCalled);

    await handler.handle("65_535");
    await handler.handle("yes");

    t.ok(msb.handleEpochGenesisInitialization.calledOnceWithExactly({
        schemaVersion: 1,
        configData: {
            difficulty: 0xFFFFFFFF,
            discriminantBitSize: 0xFFFF
        }
    }));
});

test("CommandHandler collects a consensus config JSON object before confirmation", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();
    const consensusConfig = {
        schemaVersion: 1,
        configData: {
            difficulty: 60_000_000,
            discriminantBitSize: 2048
        }
    };

    await handler.handle("/set_consensus_config");

    t.ok(console.log.calledWithMatch("Set consensus config as JSON"));
    t.ok(console.log.calledWithMatch("/cancel"));

    await handler.handle(JSON.stringify(consensusConfig));

    t.ok(console.info.calledWith("Consensus Config Update:"));
    t.ok(console.info.calledWith(JSON.stringify(consensusConfig, null, 2)));
    t.ok(console.log.calledWith("Do you want to proceed? (yes/no)"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("yes");

    t.ok(msb.handleSetConsensusConfig.calledOnceWithExactly(consensusConfig));
});

test("CommandHandler ignores commands prefixed with the consensus config command", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_consensus_config_extra");

    t.ok(console.log.notCalled);
    t.ok(console.info.notCalled);
    t.ok(msb.handleSetConsensusConfig.notCalled);
});

test("CommandHandler re-prompts malformed or incomplete consensus config JSON", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_consensus_config");
    await handler.handle("abc");

    t.ok(console.log.calledWith(
        'Invalid consensus config. Please enter a JSON object containing only "schemaVersion" and "configData".'
    ));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    for (const invalidInput of [
        "null",
        "[]",
        '"value"',
        '{"schemaVersion":1}',
        '{"configData":{}}',
        '{"schemaVersion":1,"configData":{},"extra":true}'
    ]) {
        await handler.handle(invalidInput);
    }

    t.ok(msb.handleSetConsensusConfig.notCalled);
    t.ok(console.info.notCalled);

    await handler.handle('{"schemaVersion":1,"configData":{}}');
    await handler.handle("no");

    t.ok(console.log.calledWith("Consensus config update cancelled."));
    t.ok(msb.handleSetConsensusConfig.notCalled);
});

test("CommandHandler accepts generic configData JSON values", async (t) => {
    stubConsole(t);

    for (const configData of [null, "value", 7, true, [1, 2]]) {
        const { handler, msb } = createSubject();
        const consensusConfig = { schemaVersion: 2, configData };

        await handler.handle("/set_consensus_config");
        await handler.handle(JSON.stringify(consensusConfig));
        await handler.handle("yes");

        t.ok(msb.handleSetConsensusConfig.calledOnceWithExactly(consensusConfig));
    }
});

test("CommandHandler cancels pending consensus config input with /cancel", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_consensus_config");
    await handler.handle("/cancel");

    t.ok(console.log.calledWith("Consensus config update cancelled."));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("/help");
    t.ok(msb.printHelp.calledOnce);
});

test("CommandHandler collects VDF params and delegates a version-1 consensus config", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");

    t.ok(console.log.calledWith("Set new VDF difficulty (example 55_000_000):"));

    await handler.handle("55_000_000");

    t.ok(console.log.calledWith("Set new VDF discriminant bit size (example 2048):"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("2048");

    t.ok(console.info.calledWith("VDF Params Update:"));
    t.ok(console.info.calledWith("VDF difficulty: 55_000_000"));
    t.ok(console.info.calledWith("VDF discriminant bit size: 2048"));
    t.ok(console.log.calledWith("Do you want to proceed? (yes/no)"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("yes");

    t.ok(msb.handleSetConsensusConfig.calledOnceWithExactly({
        schemaVersion: 1,
        configData: {
            difficulty: 55_000_000,
            discriminantBitSize: 2048
        }
    }));
});

test("CommandHandler re-prompts invalid VDF difficulty without advancing", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle("abc");
    await handler.handle("0");
    await handler.handle("4_294_967_296");

    t.ok(console.log.calledWith(
        "Invalid difficulty. Please enter an integer between 1 and 4_294_967_295."
    ));
    t.ok(console.log.calledWith("Set new VDF difficulty (example 55_000_000):"));
    t.ok(!console.log.calledWith("Set new VDF discriminant bit size (example 2048):"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("55_000_000");

    t.ok(console.log.calledWith("Set new VDF discriminant bit size (example 2048):"));
});

test("CommandHandler re-prompts invalid VDF discriminant bit size and retains difficulty", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle("55_000_000");
    await handler.handle("abc");
    await handler.handle("0");
    await handler.handle("65_536");

    t.ok(console.log.calledWith(
        "Invalid discriminant bit size. Please enter an integer between 1 and 65_535."
    ));
    t.ok(console.log.calledWith("Set new VDF discriminant bit size (example 2048):"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("2048");
    await handler.handle("yes");

    t.ok(msb.handleSetConsensusConfig.calledOnceWithExactly({
        schemaVersion: 1,
        configData: {
            difficulty: 55_000_000,
            discriminantBitSize: 2048
        }
    }));
});

test("CommandHandler accepts maximum VDF parameter values", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle("4_294_967_295");
    await handler.handle("65_535");
    await handler.handle("yes");

    t.ok(msb.handleSetConsensusConfig.calledOnceWithExactly({
        schemaVersion: 1,
        configData: {
            difficulty: 0xFFFFFFFF,
            discriminantBitSize: 0xFFFF
        }
    }));
});

test("CommandHandler cancels VDF params input from the difficulty step", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle(" /CANCEL ");

    t.ok(console.log.calledWith("VDF params update cancelled."));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("/help");

    t.ok(msb.printHelp.calledOnce);
});

test("CommandHandler cancels VDF params input from the discriminant step", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle("55_000_000");
    await handler.handle("/cancel");

    t.ok(console.log.calledWith("VDF params update cancelled."));
    t.ok(console.info.notCalled);
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("/help");

    t.ok(msb.printHelp.calledOnce);
});

test("CommandHandler declines VDF params update at confirmation", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params");
    await handler.handle("55_000_000");
    await handler.handle("2048");
    await handler.handle("no");

    t.ok(console.log.calledWith("VDF params update cancelled."));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("/help");

    t.ok(msb.printHelp.calledOnce);
});

test("CommandHandler requires an exact /set_vdf_params command token", async (t) => {
    stubConsole(t);

    const { handler, msb } = createSubject();

    await handler.handle("/set_vdf_params_extra");

    t.ok(!console.log.calledWith("Set new VDF difficulty (example 55_000_000):"));
    t.ok(msb.handleSetConsensusConfig.notCalled);

    await handler.handle("/help");

    t.ok(msb.printHelp.calledOnce);
});
