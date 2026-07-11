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
    // A dedicated sandbox instead of sinon's global default one: sinon.stub/sinon.restore()
    // operate on shared global state, so another test's (or another file's) teardown calling
    // sinon.restore() while this test is still mid-flight can yank the stub out from under it -
    // console.error etc revert to the native function and .calledWith throws. Each test gets
    // its own sandbox so its restore() can only ever affect its own stubs.
    const sandbox = sinon.createSandbox();
    sandbox.stub(console, "info");
    sandbox.stub(console, "log");
    sandbox.stub(console, "error");
    t.teardown(() => sandbox.restore());
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
        vdfDifficulty: "55000000",
        vdfDiscriminantSize: "2048"
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
