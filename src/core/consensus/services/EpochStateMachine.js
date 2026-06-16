import { StateMachine } from "../../../utils/StateMachine.js";


// criar uma classe StateMachine e EpochStateMachine herda dela (para facilitar testes)
// escrever testes pra validar tanto state machine, depois testes do serviço

export const EPOCH_STATES = Object.freeze({
    START_VDF: "START_VDF",
    VDF_PENDING: "VDF_PENDING", // esse é o estado inicial e final (verificar se precisa de novo estado/evento)
    VDF_COMPUTED: "VDF_COMPUTED",
    PROPOSING_EPOCH: "PROPOSING_EPOCH",
    COLLECTING_CONFIRMATIONS: "COLLECTING_CONFIRMATIONS",
    AWAITING_EPOCH: "AWAITING_EPOCH",
    LOCAL_QUORUM_REACHED: "LOCAL_QUORUM_REACHED",
    VDF_SUBMITTED: "VDF_SUBMITTED",
});

export const EPOCH_EVENTS = Object.freeze({
    START: "START",
    CALCULATE_VDF: "CALCULATE_VDF",
    PROPOSE_EPOCH: "PROPOSE_EPOCH",
    APPROVAL_REQUESTS_DISPATCHED: "APPROVAL_REQUESTS_DISPATCHED",
    REMOTE_PROPOSAL_RECEIVED: "REMOTE_PROPOSAL_RECEIVED",
    QUORUM_REACHED: "QUORUM_REACHED",
    COLLECTING_TIMEOUT: "COLLECTING_TIMEOUT",
    SUBMIT_EPOCH: "SUBMIT_EPOCH",
    APPEND_LOG: "APPEND_LOG",
    EPOCH_VERIFIED: "EPOCH_VERIFIED",
    EPOCH_TIMEOUT: "EPOCH_TIMEOUT",
});

const TRANSITIONS = Object.freeze({
    [EPOCH_STATES.START_VDF]: Object.freeze({
        [EPOCH_EVENTS.START]: EPOCH_STATES.VDF_PENDING,
    }),
    [EPOCH_STATES.VDF_PENDING]: Object.freeze({
        [EPOCH_EVENTS.CALCULATE_VDF]: EPOCH_STATES.VDF_COMPUTED,
        [EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED]: EPOCH_STATES.AWAITING_EPOCH,
    }),
    [EPOCH_STATES.VDF_COMPUTED]: Object.freeze({
        [EPOCH_EVENTS.PROPOSE_EPOCH]: EPOCH_STATES.PROPOSING_EPOCH,
        [EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED]: EPOCH_STATES.AWAITING_EPOCH,
    }),
    [EPOCH_STATES.PROPOSING_EPOCH]: Object.freeze({
        [EPOCH_EVENTS.APPROVAL_REQUESTS_DISPATCHED]: EPOCH_STATES.COLLECTING_CONFIRMATIONS,
        [EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED]: EPOCH_STATES.AWAITING_EPOCH,
    }),
    [EPOCH_STATES.COLLECTING_CONFIRMATIONS]: Object.freeze({
        [EPOCH_EVENTS.REMOTE_PROPOSAL_RECEIVED]: EPOCH_STATES.AWAITING_EPOCH,
        [EPOCH_EVENTS.COLLECTING_TIMEOUT]: EPOCH_STATES.VDF_PENDING,
        [EPOCH_EVENTS.QUORUM_REACHED]: EPOCH_STATES.LOCAL_QUORUM_REACHED,
    }),
    [EPOCH_STATES.LOCAL_QUORUM_REACHED]: Object.freeze({
        [EPOCH_EVENTS.SUBMIT_EPOCH]: EPOCH_STATES.VDF_SUBMITTED,
    }),
    [EPOCH_STATES.VDF_SUBMITTED]: Object.freeze({
        [EPOCH_EVENTS.APPEND_LOG]: EPOCH_STATES.VDF_PENDING,
    }),
    [EPOCH_STATES.AWAITING_EPOCH]: Object.freeze({
        [EPOCH_EVENTS.EPOCH_VERIFIED]: EPOCH_STATES.START_VDF,
        [EPOCH_EVENTS.EPOCH_TIMEOUT]: EPOCH_STATES.VDF_COMPUTED,
    }),
});

export class EpochStateMachine extends StateMachine {
    constructor() {
        super(TRANSITIONS, EPOCH_STATES.START_VDF, EPOCH_STATES.START_VDF);
    }

    async send(event, payload = {}) {
        const prev = this.state;
        const result = await super.send(event, payload);
        if (result) {
            console.log(`[EpochStateMachine] ${prev} --[${event}]--> ${result.next}`);
        } else {
            console.log(`[EpochStateMachine] invalid event=${event} in state=${prev}`);
        }
        return result;
    }
}
