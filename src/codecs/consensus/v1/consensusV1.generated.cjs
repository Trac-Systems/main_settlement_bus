/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

/** @typedef {ReturnType<typeof import("b4a").alloc>} B4aBuffer */

var $protobuf = require("../../protobufRuntime.cjs");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots.consensusV1 || ($protobuf.roots.consensusV1 = {});

$root.consensus = (function() {

    /**
     * Namespace consensus.
     * @exports consensus
     * @namespace
     */
    var consensus = {};

    consensus.v1 = (function() {

        /**
         * Namespace v1.
         * @memberof consensus
         * @namespace
         */
        var v1 = {};

        v1.ConsensusMessageHeader = (function() {

            /**
             * Properties of a ConsensusMessageHeader.
             * @memberof consensus.v1
             * @interface IConsensusMessageHeader
             * @property {consensus.v1.MessageType|null} [type] ConsensusMessageHeader type
             * @property {string|null} [session_id] ConsensusMessageHeader session_id
             * @property {number|Long|null} [timestamp] ConsensusMessageHeader timestamp
             * @property {consensus.v1.IProofProposal|null} [proof_proposal] ConsensusMessageHeader proof_proposal
             * @property {consensus.v1.IProofProposalResponse|null} [proof_proposal_response] ConsensusMessageHeader proof_proposal_response
             * @property {consensus.v1.IEpochAppendRequest|null} [request] ConsensusMessageHeader request
             * @property {consensus.v1.IEpochAppendReply|null} [reply] ConsensusMessageHeader reply
             */

            /**
             * Constructs a new ConsensusMessageHeader.
             * @memberof consensus.v1
             * @classdesc Represents a ConsensusMessageHeader.
             * @implements IConsensusMessageHeader
             * @constructor
             * @param {consensus.v1.IConsensusMessageHeader=} [properties] Properties to set
             */
            function ConsensusMessageHeader(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ConsensusMessageHeader type.
             * @member {consensus.v1.MessageType} type
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.type = 0;

            /**
             * ConsensusMessageHeader session_id.
             * @member {string} session_id
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.session_id = "";

            /**
             * ConsensusMessageHeader timestamp.
             * @member {number|Long} timestamp
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ConsensusMessageHeader proof_proposal.
             * @member {consensus.v1.IProofProposal|null|undefined} proof_proposal
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.proof_proposal = null;

            /**
             * ConsensusMessageHeader proof_proposal_response.
             * @member {consensus.v1.IProofProposalResponse|null|undefined} proof_proposal_response
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.proof_proposal_response = null;

            /**
             * ConsensusMessageHeader request.
             * @member {consensus.v1.IEpochAppendRequest|null|undefined} request
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.request = null;

            /**
             * ConsensusMessageHeader reply.
             * @member {consensus.v1.IEpochAppendReply|null|undefined} reply
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            ConsensusMessageHeader.prototype.reply = null;

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * ConsensusMessageHeader field.
             * @member {"proof_proposal"|"proof_proposal_response"|"request"|"reply"|undefined} field
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            Object.defineProperty(ConsensusMessageHeader.prototype, "field", {
                get: $util.oneOfGetter($oneOfFields = ["proof_proposal", "proof_proposal_response", "request", "reply"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new ConsensusMessageHeader instance using the specified properties.
             * @function create
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {consensus.v1.IConsensusMessageHeader=} [properties] Properties to set
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader instance
             */
            ConsensusMessageHeader.create = function create(properties) {
                return new ConsensusMessageHeader(properties);
            };

            /**
             * Encodes the specified ConsensusMessageHeader message. Does not implicitly {@link consensus.v1.ConsensusMessageHeader.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {consensus.v1.IConsensusMessageHeader} message ConsensusMessageHeader message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ConsensusMessageHeader.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.type);
                if (message.session_id != null && Object.hasOwnProperty.call(message, "session_id"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.session_id);
                if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                    writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.timestamp);
                if (message.proof_proposal != null && Object.hasOwnProperty.call(message, "proof_proposal"))
                    $root.consensus.v1.ProofProposal.encode(message.proof_proposal, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                if (message.proof_proposal_response != null && Object.hasOwnProperty.call(message, "proof_proposal_response"))
                    $root.consensus.v1.ProofProposalResponse.encode(message.proof_proposal_response, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.request != null && Object.hasOwnProperty.call(message, "request"))
                    $root.consensus.v1.EpochAppendRequest.encode(message.request, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                if (message.reply != null && Object.hasOwnProperty.call(message, "reply"))
                    $root.consensus.v1.EpochAppendReply.encode(message.reply, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified ConsensusMessageHeader message, length delimited. Does not implicitly {@link consensus.v1.ConsensusMessageHeader.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {consensus.v1.IConsensusMessageHeader} message ConsensusMessageHeader message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ConsensusMessageHeader.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ConsensusMessageHeader message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConsensusMessageHeader.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ConsensusMessageHeader();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.type = reader.int32();
                            break;
                        }
                    case 2: {
                            message.session_id = reader.string();
                            break;
                        }
                    case 3: {
                            message.timestamp = reader.uint64();
                            break;
                        }
                    case 4: {
                            message.proof_proposal = $root.consensus.v1.ProofProposal.decode(reader, reader.uint32());
                            break;
                        }
                    case 5: {
                            message.proof_proposal_response = $root.consensus.v1.ProofProposalResponse.decode(reader, reader.uint32());
                            break;
                        }
                    case 6: {
                            message.request = $root.consensus.v1.EpochAppendRequest.decode(reader, reader.uint32());
                            break;
                        }
                    case 7: {
                            message.reply = $root.consensus.v1.EpochAppendReply.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ConsensusMessageHeader message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConsensusMessageHeader.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ConsensusMessageHeader message.
             * @function verify
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ConsensusMessageHeader.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                var properties = {};
                if (message.type != null && message.hasOwnProperty("type"))
                    switch (message.type) {
                    default:
                        return "type: enum value expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 4:
                        break;
                    }
                if (message.session_id != null && message.hasOwnProperty("session_id"))
                    if (!$util.isString(message.session_id))
                        return "session_id: string expected";
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                        return "timestamp: integer|Long expected";
                if (message.proof_proposal != null && message.hasOwnProperty("proof_proposal")) {
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.ProofProposal.verify(message.proof_proposal);
                        if (error)
                            return "proof_proposal." + error;
                    }
                }
                if (message.proof_proposal_response != null && message.hasOwnProperty("proof_proposal_response")) {
                    if (properties.field === 1)
                        return "field: multiple values";
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.ProofProposalResponse.verify(message.proof_proposal_response);
                        if (error)
                            return "proof_proposal_response." + error;
                    }
                }
                if (message.request != null && message.hasOwnProperty("request")) {
                    if (properties.field === 1)
                        return "field: multiple values";
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.EpochAppendRequest.verify(message.request);
                        if (error)
                            return "request." + error;
                    }
                }
                if (message.reply != null && message.hasOwnProperty("reply")) {
                    if (properties.field === 1)
                        return "field: multiple values";
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.EpochAppendReply.verify(message.reply);
                        if (error)
                            return "reply." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a ConsensusMessageHeader message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader
             */
            ConsensusMessageHeader.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.ConsensusMessageHeader)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.ConsensusMessageHeader();
                switch (object.type) {
                default:
                    if (typeof object.type === "number") {
                        message.type = object.type;
                        break;
                    }
                    break;
                case "MESSAGE_TYPE_UNSPECIFIED":
                case 0:
                    message.type = 0;
                    break;
                case "MESSAGE_TYPE_PROOF_PROPOSAL":
                case 1:
                    message.type = 1;
                    break;
                case "MESSAGE_TYPE_PROOF_PROPOSAL_APPROVAL":
                case 2:
                    message.type = 2;
                    break;
                case "MESSAGE_TYPE_REQUEST":
                case 3:
                    message.type = 3;
                    break;
                case "MESSAGE_TYPE_REPLY":
                case 4:
                    message.type = 4;
                    break;
                }
                if (object.session_id != null)
                    message.session_id = String(object.session_id);
                if (object.timestamp != null)
                    if ($util.Long)
                        (message.timestamp = $util.Long.fromValue(object.timestamp)).unsigned = true;
                    else if (typeof object.timestamp === "string")
                        message.timestamp = parseInt(object.timestamp, 10);
                    else if (typeof object.timestamp === "number")
                        message.timestamp = object.timestamp;
                    else if (typeof object.timestamp === "object")
                        message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber(true);
                if (object.proof_proposal != null) {
                    if (typeof object.proof_proposal !== "object")
                        throw TypeError(".consensus.v1.ConsensusMessageHeader.proof_proposal: object expected");
                    message.proof_proposal = $root.consensus.v1.ProofProposal.fromObject(object.proof_proposal);
                }
                if (object.proof_proposal_response != null) {
                    if (typeof object.proof_proposal_response !== "object")
                        throw TypeError(".consensus.v1.ConsensusMessageHeader.proof_proposal_response: object expected");
                    message.proof_proposal_response = $root.consensus.v1.ProofProposalResponse.fromObject(object.proof_proposal_response);
                }
                if (object.request != null) {
                    if (typeof object.request !== "object")
                        throw TypeError(".consensus.v1.ConsensusMessageHeader.request: object expected");
                    message.request = $root.consensus.v1.EpochAppendRequest.fromObject(object.request);
                }
                if (object.reply != null) {
                    if (typeof object.reply !== "object")
                        throw TypeError(".consensus.v1.ConsensusMessageHeader.reply: object expected");
                    message.reply = $root.consensus.v1.EpochAppendReply.fromObject(object.reply);
                }
                return message;
            };

            /**
             * Creates a plain object from a ConsensusMessageHeader message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {consensus.v1.ConsensusMessageHeader} message ConsensusMessageHeader
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ConsensusMessageHeader.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.type = options.enums === String ? "MESSAGE_TYPE_UNSPECIFIED" : 0;
                    object.session_id = "";
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.timestamp = options.longs === String ? "0" : 0;
                }
                if (message.type != null && message.hasOwnProperty("type"))
                    object.type = options.enums === String ? $root.consensus.v1.MessageType[message.type] === undefined ? message.type : $root.consensus.v1.MessageType[message.type] : message.type;
                if (message.session_id != null && message.hasOwnProperty("session_id"))
                    object.session_id = message.session_id;
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (typeof message.timestamp === "number")
                        object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                    else
                        object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber(true) : message.timestamp;
                if (message.proof_proposal != null && message.hasOwnProperty("proof_proposal")) {
                    object.proof_proposal = $root.consensus.v1.ProofProposal.toObject(message.proof_proposal, options);
                    if (options.oneofs)
                        object.field = "proof_proposal";
                }
                if (message.proof_proposal_response != null && message.hasOwnProperty("proof_proposal_response")) {
                    object.proof_proposal_response = $root.consensus.v1.ProofProposalResponse.toObject(message.proof_proposal_response, options);
                    if (options.oneofs)
                        object.field = "proof_proposal_response";
                }
                if (message.request != null && message.hasOwnProperty("request")) {
                    object.request = $root.consensus.v1.EpochAppendRequest.toObject(message.request, options);
                    if (options.oneofs)
                        object.field = "request";
                }
                if (message.reply != null && message.hasOwnProperty("reply")) {
                    object.reply = $root.consensus.v1.EpochAppendReply.toObject(message.reply, options);
                    if (options.oneofs)
                        object.field = "reply";
                }
                return object;
            };

            /**
             * Converts this ConsensusMessageHeader to JSON.
             * @function toJSON
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ConsensusMessageHeader.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ConsensusMessageHeader
             * @function getTypeUrl
             * @memberof consensus.v1.ConsensusMessageHeader
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ConsensusMessageHeader.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.ConsensusMessageHeader";
            };

            return ConsensusMessageHeader;
        })();

        /**
         * MessageType enum.
         * @name consensus.v1.MessageType
         * @enum {number}
         * @property {number} MESSAGE_TYPE_UNSPECIFIED=0 MESSAGE_TYPE_UNSPECIFIED value
         * @property {number} MESSAGE_TYPE_PROOF_PROPOSAL=1 MESSAGE_TYPE_PROOF_PROPOSAL value
         * @property {number} MESSAGE_TYPE_PROOF_PROPOSAL_APPROVAL=2 MESSAGE_TYPE_PROOF_PROPOSAL_APPROVAL value
         * @property {number} MESSAGE_TYPE_REQUEST=3 MESSAGE_TYPE_REQUEST value
         * @property {number} MESSAGE_TYPE_REPLY=4 MESSAGE_TYPE_REPLY value
         */
        v1.MessageType = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "MESSAGE_TYPE_UNSPECIFIED"] = 0;
            values[valuesById[1] = "MESSAGE_TYPE_PROOF_PROPOSAL"] = 1;
            values[valuesById[2] = "MESSAGE_TYPE_PROOF_PROPOSAL_APPROVAL"] = 2;
            values[valuesById[3] = "MESSAGE_TYPE_REQUEST"] = 3;
            values[valuesById[4] = "MESSAGE_TYPE_REPLY"] = 4;
            return values;
        })();

        v1.ProofProposal = (function() {

            /**
             * Properties of a ProofProposal.
             * @memberof consensus.v1
             * @interface IProofProposal
             * @property {B4aBuffer|null} [network_id] ProofProposal network_id
             * @property {B4aBuffer|null} [epoch] ProofProposal epoch
             * @property {B4aBuffer|null} [previous_epoch_record_hash] ProofProposal previous_epoch_record_hash
             * @property {B4aBuffer|null} [proposer] ProofProposal proposer
             * @property {B4aBuffer|null} [difficulty] ProofProposal difficulty
             * @property {B4aBuffer|null} [discriminant_bit_size] ProofProposal discriminant_bit_size
             * @property {B4aBuffer|null} [proof] ProofProposal proof
             * @property {B4aBuffer|null} [signature] ProofProposal signature
             */

            /**
             * Constructs a new ProofProposal.
             * @memberof consensus.v1
             * @classdesc Represents a ProofProposal.
             * @implements IProofProposal
             * @constructor
             * @param {consensus.v1.IProofProposal=} [properties] Properties to set
             */
            function ProofProposal(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ProofProposal network_id.
             * @member {B4aBuffer} network_id
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.network_id = $util.newBuffer([]);

            /**
             * ProofProposal epoch.
             * @member {B4aBuffer} epoch
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.epoch = $util.newBuffer([]);

            /**
             * ProofProposal previous_epoch_record_hash.
             * @member {B4aBuffer} previous_epoch_record_hash
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.previous_epoch_record_hash = $util.newBuffer([]);

            /**
             * ProofProposal proposer.
             * @member {B4aBuffer} proposer
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.proposer = $util.newBuffer([]);

            /**
             * ProofProposal difficulty.
             * @member {B4aBuffer} difficulty
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.difficulty = $util.newBuffer([]);

            /**
             * ProofProposal discriminant_bit_size.
             * @member {B4aBuffer} discriminant_bit_size
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.discriminant_bit_size = $util.newBuffer([]);

            /**
             * ProofProposal proof.
             * @member {B4aBuffer} proof
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.proof = $util.newBuffer([]);

            /**
             * ProofProposal signature.
             * @member {B4aBuffer} signature
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.signature = $util.newBuffer([]);

            /**
             * Creates a new ProofProposal instance using the specified properties.
             * @function create
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {consensus.v1.IProofProposal=} [properties] Properties to set
             * @returns {consensus.v1.ProofProposal} ProofProposal instance
             */
            ProofProposal.create = function create(properties) {
                return new ProofProposal(properties);
            };

            /**
             * Encodes the specified ProofProposal message. Does not implicitly {@link consensus.v1.ProofProposal.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {consensus.v1.IProofProposal} message ProofProposal message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposal.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.network_id != null && Object.hasOwnProperty.call(message, "network_id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.network_id);
                if (message.epoch != null && Object.hasOwnProperty.call(message, "epoch"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.epoch);
                if (message.previous_epoch_record_hash != null && Object.hasOwnProperty.call(message, "previous_epoch_record_hash"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.previous_epoch_record_hash);
                if (message.proposer != null && Object.hasOwnProperty.call(message, "proposer"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.proposer);
                if (message.difficulty != null && Object.hasOwnProperty.call(message, "difficulty"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.difficulty);
                if (message.discriminant_bit_size != null && Object.hasOwnProperty.call(message, "discriminant_bit_size"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.discriminant_bit_size);
                if (message.proof != null && Object.hasOwnProperty.call(message, "proof"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.proof);
                if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.signature);
                return writer;
            };

            /**
             * Encodes the specified ProofProposal message, length delimited. Does not implicitly {@link consensus.v1.ProofProposal.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {consensus.v1.IProofProposal} message ProofProposal message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposal.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ProofProposal message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofProposal} ProofProposal
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposal.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofProposal();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.network_id = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 2: {
                            message.epoch = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 3: {
                            message.previous_epoch_record_hash = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 4: {
                            message.proposer = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 5: {
                            message.difficulty = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 6: {
                            message.discriminant_bit_size = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 7: {
                            message.proof = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 8: {
                            message.signature = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ProofProposal message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofProposal} ProofProposal
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposal.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ProofProposal message.
             * @function verify
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ProofProposal.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    if (!$util.isBytes(message.network_id))
                        return "network_id: buffer expected";
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (!$util.isBytes(message.epoch))
                        return "epoch: buffer expected";
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    if (!$util.isBytes(message.previous_epoch_record_hash))
                        return "previous_epoch_record_hash: buffer expected";
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    if (!$util.isBytes(message.proposer))
                        return "proposer: buffer expected";
                if (message.difficulty != null && message.hasOwnProperty("difficulty"))
                    if (!$util.isBytes(message.difficulty))
                        return "difficulty: buffer expected";
                if (message.discriminant_bit_size != null && message.hasOwnProperty("discriminant_bit_size"))
                    if (!$util.isBytes(message.discriminant_bit_size))
                        return "discriminant_bit_size: buffer expected";
                if (message.proof != null && message.hasOwnProperty("proof"))
                    if (!$util.isBytes(message.proof))
                        return "proof: buffer expected";
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!$util.isBytes(message.signature))
                        return "signature: buffer expected";
                return null;
            };

            /**
             * Creates a ProofProposal message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.ProofProposal} ProofProposal
             */
            ProofProposal.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.ProofProposal)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.ProofProposal();
                if (object.network_id != null)
                    message.network_id = $util.bytesFrom(object.network_id);
                if (object.epoch != null)
                    message.epoch = $util.bytesFrom(object.epoch);
                if (object.previous_epoch_record_hash != null)
                    message.previous_epoch_record_hash = $util.bytesFrom(object.previous_epoch_record_hash);
                if (object.proposer != null)
                    message.proposer = $util.bytesFrom(object.proposer);
                if (object.difficulty != null)
                    message.difficulty = $util.bytesFrom(object.difficulty);
                if (object.discriminant_bit_size != null)
                    message.discriminant_bit_size = $util.bytesFrom(object.discriminant_bit_size);
                if (object.proof != null)
                    message.proof = $util.bytesFrom(object.proof);
                if (object.signature != null)
                    message.signature = $util.bytesFrom(object.signature);
                return message;
            };

            /**
             * Creates a plain object from a ProofProposal message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {consensus.v1.ProofProposal} message ProofProposal
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ProofProposal.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.network_id = "";
                    else {
                        object.network_id = [];
                        if (options.bytes !== Array)
                            object.network_id = $util.newBuffer(object.network_id);
                    }
                    if (options.bytes === String)
                        object.epoch = "";
                    else {
                        object.epoch = [];
                        if (options.bytes !== Array)
                            object.epoch = $util.newBuffer(object.epoch);
                    }
                    if (options.bytes === String)
                        object.previous_epoch_record_hash = "";
                    else {
                        object.previous_epoch_record_hash = [];
                        if (options.bytes !== Array)
                            object.previous_epoch_record_hash = $util.newBuffer(object.previous_epoch_record_hash);
                    }
                    if (options.bytes === String)
                        object.proposer = "";
                    else {
                        object.proposer = [];
                        if (options.bytes !== Array)
                            object.proposer = $util.newBuffer(object.proposer);
                    }
                    if (options.bytes === String)
                        object.difficulty = "";
                    else {
                        object.difficulty = [];
                        if (options.bytes !== Array)
                            object.difficulty = $util.newBuffer(object.difficulty);
                    }
                    if (options.bytes === String)
                        object.discriminant_bit_size = "";
                    else {
                        object.discriminant_bit_size = [];
                        if (options.bytes !== Array)
                            object.discriminant_bit_size = $util.newBuffer(object.discriminant_bit_size);
                    }
                    if (options.bytes === String)
                        object.proof = "";
                    else {
                        object.proof = [];
                        if (options.bytes !== Array)
                            object.proof = $util.newBuffer(object.proof);
                    }
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                }
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    object.network_id = $util.bytesTo(message.network_id, options);
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    object.epoch = $util.bytesTo(message.epoch, options);
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    object.previous_epoch_record_hash = $util.bytesTo(message.previous_epoch_record_hash, options);
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    object.proposer = $util.bytesTo(message.proposer, options);
                if (message.difficulty != null && message.hasOwnProperty("difficulty"))
                    object.difficulty = $util.bytesTo(message.difficulty, options);
                if (message.discriminant_bit_size != null && message.hasOwnProperty("discriminant_bit_size"))
                    object.discriminant_bit_size = $util.bytesTo(message.discriminant_bit_size, options);
                if (message.proof != null && message.hasOwnProperty("proof"))
                    object.proof = $util.bytesTo(message.proof, options);
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = $util.bytesTo(message.signature, options);
                return object;
            };

            /**
             * Converts this ProofProposal to JSON.
             * @function toJSON
             * @memberof consensus.v1.ProofProposal
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ProofProposal.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ProofProposal
             * @function getTypeUrl
             * @memberof consensus.v1.ProofProposal
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ProofProposal.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.ProofProposal";
            };

            return ProofProposal;
        })();

        v1.ProofProposalResponse = (function() {

            /**
             * Properties of a ProofProposalResponse.
             * @memberof consensus.v1
             * @interface IProofProposalResponse
             * @property {common.v1.ResultCode|null} [result] ProofProposalResponse result
             * @property {consensus.v1.IProofProposalApproval|null} [approval] ProofProposalResponse approval
             * @property {B4aBuffer|null} [response_sig] ProofProposalResponse response_sig
             */

            /**
             * Constructs a new ProofProposalResponse.
             * @memberof consensus.v1
             * @classdesc Represents a ProofProposalResponse.
             * @implements IProofProposalResponse
             * @constructor
             * @param {consensus.v1.IProofProposalResponse=} [properties] Properties to set
             */
            function ProofProposalResponse(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ProofProposalResponse result.
             * @member {common.v1.ResultCode} result
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.result = 0;

            /**
             * ProofProposalResponse approval.
             * @member {consensus.v1.IProofProposalApproval|null|undefined} approval
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.approval = null;

            /**
             * ProofProposalResponse response_sig.
             * @member {B4aBuffer} response_sig
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.response_sig = $util.newBuffer([]);

            /**
             * Creates a new ProofProposalResponse instance using the specified properties.
             * @function create
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {consensus.v1.IProofProposalResponse=} [properties] Properties to set
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse instance
             */
            ProofProposalResponse.create = function create(properties) {
                return new ProofProposalResponse(properties);
            };

            /**
             * Encodes the specified ProofProposalResponse message. Does not implicitly {@link consensus.v1.ProofProposalResponse.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {consensus.v1.IProofProposalResponse} message ProofProposalResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposalResponse.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.result != null && Object.hasOwnProperty.call(message, "result"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.result);
                if (message.approval != null && Object.hasOwnProperty.call(message, "approval"))
                    $root.consensus.v1.ProofProposalApproval.encode(message.approval, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                if (message.response_sig != null && Object.hasOwnProperty.call(message, "response_sig"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.response_sig);
                return writer;
            };

            /**
             * Encodes the specified ProofProposalResponse message, length delimited. Does not implicitly {@link consensus.v1.ProofProposalResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {consensus.v1.IProofProposalResponse} message ProofProposalResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposalResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ProofProposalResponse message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalResponse.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofProposalResponse();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.result = reader.int32();
                            break;
                        }
                    case 2: {
                            message.approval = $root.consensus.v1.ProofProposalApproval.decode(reader, reader.uint32());
                            break;
                        }
                    case 3: {
                            message.response_sig = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ProofProposalResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalResponse.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ProofProposalResponse message.
             * @function verify
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ProofProposalResponse.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.result != null && message.hasOwnProperty("result"))
                    switch (message.result) {
                    default:
                        return "result: enum value expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                    case 9:
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                    case 14:
                    case 15:
                    case 16:
                    case 17:
                    case 18:
                    case 19:
                    case 20:
                    case 21:
                    case 22:
                    case 23:
                    case 24:
                    case 25:
                    case 26:
                    case 27:
                    case 28:
                    case 29:
                    case 30:
                    case 31:
                    case 32:
                    case 33:
                    case 34:
                    case 35:
                    case 36:
                    case 37:
                    case 38:
                    case 39:
                    case 40:
                    case 41:
                    case 42:
                    case 43:
                    case 44:
                    case 45:
                    case 46:
                    case 47:
                    case 48:
                    case 49:
                    case 50:
                    case 51:
                    case 52:
                    case 53:
                    case 54:
                    case 55:
                    case 56:
                    case 57:
                    case 58:
                    case 59:
                    case 60:
                    case 61:
                    case 100:
                    case 101:
                    case 102:
                    case 103:
                    case 104:
                    case 105:
                    case 106:
                    case 107:
                    case 108:
                    case 109:
                    case 110:
                    case 111:
                    case 112:
                    case 113:
                    case 114:
                        break;
                    }
                if (message.approval != null && message.hasOwnProperty("approval")) {
                    var error = $root.consensus.v1.ProofProposalApproval.verify(message.approval);
                    if (error)
                        return "approval." + error;
                }
                if (message.response_sig != null && message.hasOwnProperty("response_sig"))
                    if (!$util.isBytes(message.response_sig))
                        return "response_sig: buffer expected";
                return null;
            };

            /**
             * Creates a ProofProposalResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse
             */
            ProofProposalResponse.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.ProofProposalResponse)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.ProofProposalResponse();
                switch (object.result) {
                default:
                    if (typeof object.result === "number") {
                        message.result = object.result;
                        break;
                    }
                    break;
                case "RESULT_CODE_UNSPECIFIED":
                case 0:
                    message.result = 0;
                    break;
                case "RESULT_CODE_OK":
                case 1:
                    message.result = 1;
                    break;
                case "RESULT_CODE_INVALID_PAYLOAD":
                case 2:
                    message.result = 2;
                    break;
                case "RESULT_CODE_RATE_LIMITED":
                case 3:
                    message.result = 3;
                    break;
                case "RESULT_CODE_SIGNATURE_INVALID":
                case 4:
                    message.result = 4;
                    break;
                case "RESULT_CODE_UNEXPECTED_ERROR":
                case 5:
                    message.result = 5;
                    break;
                case "RESULT_CODE_TIMEOUT":
                case 6:
                    message.result = 6;
                    break;
                case "RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS":
                case 7:
                    message.result = 7;
                    break;
                case "RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE":
                case 8:
                    message.result = 8;
                    break;
                case "RESULT_CODE_NODE_OVERLOADED":
                case 9:
                    message.result = 9;
                    break;
                case "RESULT_CODE_TX_ALREADY_PENDING":
                case 10:
                    message.result = 10;
                    break;
                case "RESULT_CODE_OPERATION_TYPE_UNKNOWN":
                case 11:
                    message.result = 11;
                    break;
                case "RESULT_CODE_SCHEMA_VALIDATION_FAILED":
                case 12:
                    message.result = 12;
                    break;
                case "RESULT_CODE_REQUESTER_ADDRESS_INVALID":
                case 13:
                    message.result = 13;
                    break;
                case "RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID":
                case 14:
                    message.result = 14;
                    break;
                case "RESULT_CODE_TX_HASH_MISMATCH":
                case 15:
                    message.result = 15;
                    break;
                case "RESULT_CODE_TX_SIGNATURE_INVALID":
                case 16:
                    message.result = 16;
                    break;
                case "RESULT_CODE_TX_EXPIRED":
                case 17:
                    message.result = 17;
                    break;
                case "RESULT_CODE_TX_ALREADY_EXISTS":
                case 18:
                    message.result = 18;
                    break;
                case "RESULT_CODE_OPERATION_ALREADY_COMPLETED":
                case 19:
                    message.result = 19;
                    break;
                case "RESULT_CODE_REQUESTER_NOT_FOUND":
                case 20:
                    message.result = 20;
                    break;
                case "RESULT_CODE_INSUFFICIENT_FEE_BALANCE":
                case 21:
                    message.result = 21;
                    break;
                case "RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP":
                case 22:
                    message.result = 22;
                    break;
                case "RESULT_CODE_SELF_VALIDATION_FORBIDDEN":
                case 23:
                    message.result = 23;
                    break;
                case "RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND":
                case 24:
                    message.result = 24;
                    break;
                case "RESULT_CODE_ROLE_NODE_ALREADY_WRITER":
                case 25:
                    message.result = 25;
                    break;
                case "RESULT_CODE_ROLE_NODE_NOT_WHITELISTED":
                case 26:
                    message.result = 26;
                    break;
                case "RESULT_CODE_ROLE_NODE_NOT_WRITER":
                case 27:
                    message.result = 27;
                    break;
                case "RESULT_CODE_ROLE_NODE_IS_INDEXER":
                case 28:
                    message.result = 28;
                    break;
                case "RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING":
                case 29:
                    message.result = 29;
                    break;
                case "RESULT_CODE_ROLE_INVALID_RECOVERY_CASE":
                case 30:
                    message.result = 30;
                    break;
                case "RESULT_CODE_ROLE_UNKNOWN_OPERATION":
                case 31:
                    message.result = 31;
                    break;
                case "RESULT_CODE_ROLE_INVALID_WRITER_KEY":
                case 32:
                    message.result = 32;
                    break;
                case "RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE":
                case 33:
                    message.result = 33;
                    break;
                case "RESULT_CODE_MSB_BOOTSTRAP_MISMATCH":
                case 34:
                    message.result = 34;
                    break;
                case "RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED":
                case 35:
                    message.result = 35;
                    break;
                case "RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING":
                case 36:
                    message.result = 36;
                    break;
                case "RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH":
                case 37:
                    message.result = 37;
                    break;
                case "RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS":
                case 38:
                    message.result = 38;
                    break;
                case "RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID":
                case 39:
                    message.result = 39;
                    break;
                case "RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID":
                case 40:
                    message.result = 40;
                    break;
                case "RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE":
                case 41:
                    message.result = 41;
                    break;
                case "RESULT_CODE_TRANSFER_SENDER_NOT_FOUND":
                case 42:
                    message.result = 42;
                    break;
                case "RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE":
                case 43:
                    message.result = 43;
                    break;
                case "RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW":
                case 44:
                    message.result = 44;
                    break;
                case "RESULT_CODE_TX_HASH_INVALID_FORMAT":
                case 45:
                    message.result = 45;
                    break;
                case "RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED":
                case 46:
                    message.result = 46;
                    break;
                case "RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING":
                case 47:
                    message.result = 47;
                    break;
                case "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID":
                case 48:
                    message.result = 48;
                    break;
                case "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN":
                case 49:
                    message.result = 49;
                    break;
                case "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED":
                case 50:
                    message.result = 50;
                    break;
                case "RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID":
                case 51:
                    message.result = 51;
                    break;
                case "RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA":
                case 52:
                    message.result = 52;
                    break;
                case "RESULT_CODE_PROOF_PAYLOAD_MISMATCH":
                case 53:
                    message.result = 53;
                    break;
                case "RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED":
                case 54:
                    message.result = 54;
                    break;
                case "RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH":
                case 55:
                    message.result = 55;
                    break;
                case "RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND":
                case 56:
                    message.result = 56;
                    break;
                case "RESULT_CODE_VALIDATOR_NODE_NOT_WRITER":
                case 57:
                    message.result = 57;
                    break;
                case "RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH":
                case 58:
                    message.result = 58;
                    break;
                case "RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID":
                case 59:
                    message.result = 59;
                    break;
                case "RESULT_CODE_VALIDATOR_VA_MISSING":
                case 60:
                    message.result = 60;
                    break;
                case "RESULT_CODE_TX_INVALID_PAYLOAD":
                case 61:
                    message.result = 61;
                    break;
                case "RESULT_CODE_CONSENSUS_SCHEMA_VALIDATION_FAILED":
                case 100:
                    message.result = 100;
                    break;
                case "RESULT_CODE_CONSENSUS_BAD_PROTOCOL_VERSION":
                case 101:
                    message.result = 101;
                    break;
                case "RESULT_CODE_CONSENSUS_WRONG_NETWORK_ID":
                case 102:
                    message.result = 102;
                    break;
                case "RESULT_CODE_CONSENSUS_CONFIG_MISMATCH":
                case 103:
                    message.result = 103;
                    break;
                case "RESULT_CODE_CONSENSUS_VDF_PROOF_INVALID":
                case 104:
                    message.result = 104;
                    break;
                case "RESULT_CODE_CONSENSUS_ADDRESS_INVALID":
                case 105:
                    message.result = 105;
                    break;
                case "RESULT_CODE_CONSENSUS_PUBLIC_KEY_MISMATCH":
                case 106:
                    message.result = 106;
                    break;
                case "RESULT_CODE_CONSENSUS_PROPOSAL_SIGNATURE_INVALID":
                case 107:
                    message.result = 107;
                    break;
                case "RESULT_CODE_CONSENSUS_RESPONSE_SIGNATURE_INVALID":
                case 108:
                    message.result = 108;
                    break;
                case "RESULT_CODE_CONSENSUS_APPROVAL_SIGNATURE_INVALID":
                case 109:
                    message.result = 109;
                    break;
                case "RESULT_CODE_CONSENSUS_OPERATION_TYPE_INVALID":
                case 110:
                    message.result = 110;
                    break;
                case "RESULT_CODE_CONSENSUS_RESPONSE_APPROVAL_INVALID":
                case 111:
                    message.result = 111;
                    break;
                case "RESULT_CODE_CONSENSUS_EPOCH_INVALID":
                case 112:
                    message.result = 112;
                    break;
                case "RESULT_CODE_CONSENSUS_PREVIOUS_EPOCH_RECORD_HASH_INVALID":
                case 113:
                    message.result = 113;
                    break;
                case "RESULT_CODE_CONSENSUS_INDEXER_ROLE_INVALID":
                case 114:
                    message.result = 114;
                    break;
                }
                if (object.approval != null) {
                    if (typeof object.approval !== "object")
                        throw TypeError(".consensus.v1.ProofProposalResponse.approval: object expected");
                    message.approval = $root.consensus.v1.ProofProposalApproval.fromObject(object.approval);
                }
                if (object.response_sig != null)
                    message.response_sig = $util.bytesFrom(object.response_sig);
                return message;
            };

            /**
             * Creates a plain object from a ProofProposalResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {consensus.v1.ProofProposalResponse} message ProofProposalResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ProofProposalResponse.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.result = options.enums === String ? "RESULT_CODE_UNSPECIFIED" : 0;
                    object.approval = null;
                    if (options.bytes === String)
                        object.response_sig = "";
                    else {
                        object.response_sig = [];
                        if (options.bytes !== Array)
                            object.response_sig = $util.newBuffer(object.response_sig);
                    }
                }
                if (message.result != null && message.hasOwnProperty("result"))
                    object.result = options.enums === String ? $root.common.v1.ResultCode[message.result] === undefined ? message.result : $root.common.v1.ResultCode[message.result] : message.result;
                if (message.approval != null && message.hasOwnProperty("approval"))
                    object.approval = $root.consensus.v1.ProofProposalApproval.toObject(message.approval, options);
                if (message.response_sig != null && message.hasOwnProperty("response_sig"))
                    object.response_sig = $util.bytesTo(message.response_sig, options);
                return object;
            };

            /**
             * Converts this ProofProposalResponse to JSON.
             * @function toJSON
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ProofProposalResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ProofProposalResponse
             * @function getTypeUrl
             * @memberof consensus.v1.ProofProposalResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ProofProposalResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.ProofProposalResponse";
            };

            return ProofProposalResponse;
        })();

        v1.ProofProposalApproval = (function() {

            /**
             * Properties of a ProofProposalApproval.
             * @memberof consensus.v1
             * @interface IProofProposalApproval
             * @property {B4aBuffer|null} [approver] ProofProposalApproval approver
             * @property {B4aBuffer|null} [approval_sig] ProofProposalApproval approval_sig
             */

            /**
             * Constructs a new ProofProposalApproval.
             * @memberof consensus.v1
             * @classdesc Represents a ProofProposalApproval.
             * @implements IProofProposalApproval
             * @constructor
             * @param {consensus.v1.IProofProposalApproval=} [properties] Properties to set
             */
            function ProofProposalApproval(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ProofProposalApproval approver.
             * @member {B4aBuffer} approver
             * @memberof consensus.v1.ProofProposalApproval
             * @instance
             */
            ProofProposalApproval.prototype.approver = $util.newBuffer([]);

            /**
             * ProofProposalApproval approval_sig.
             * @member {B4aBuffer} approval_sig
             * @memberof consensus.v1.ProofProposalApproval
             * @instance
             */
            ProofProposalApproval.prototype.approval_sig = $util.newBuffer([]);

            /**
             * Creates a new ProofProposalApproval instance using the specified properties.
             * @function create
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {consensus.v1.IProofProposalApproval=} [properties] Properties to set
             * @returns {consensus.v1.ProofProposalApproval} ProofProposalApproval instance
             */
            ProofProposalApproval.create = function create(properties) {
                return new ProofProposalApproval(properties);
            };

            /**
             * Encodes the specified ProofProposalApproval message. Does not implicitly {@link consensus.v1.ProofProposalApproval.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {consensus.v1.IProofProposalApproval} message ProofProposalApproval message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposalApproval.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.approver != null && Object.hasOwnProperty.call(message, "approver"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.approver);
                if (message.approval_sig != null && Object.hasOwnProperty.call(message, "approval_sig"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.approval_sig);
                return writer;
            };

            /**
             * Encodes the specified ProofProposalApproval message, length delimited. Does not implicitly {@link consensus.v1.ProofProposalApproval.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {consensus.v1.IProofProposalApproval} message ProofProposalApproval message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofProposalApproval.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ProofProposalApproval message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofProposalApproval} ProofProposalApproval
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalApproval.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofProposalApproval();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.approver = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 2: {
                            message.approval_sig = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a ProofProposalApproval message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofProposalApproval} ProofProposalApproval
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalApproval.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ProofProposalApproval message.
             * @function verify
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ProofProposalApproval.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.approver != null && message.hasOwnProperty("approver"))
                    if (!$util.isBytes(message.approver))
                        return "approver: buffer expected";
                if (message.approval_sig != null && message.hasOwnProperty("approval_sig"))
                    if (!$util.isBytes(message.approval_sig))
                        return "approval_sig: buffer expected";
                return null;
            };

            /**
             * Creates a ProofProposalApproval message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.ProofProposalApproval} ProofProposalApproval
             */
            ProofProposalApproval.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.ProofProposalApproval)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.ProofProposalApproval();
                if (object.approver != null)
                    message.approver = $util.bytesFrom(object.approver);
                if (object.approval_sig != null)
                    message.approval_sig = $util.bytesFrom(object.approval_sig);
                return message;
            };

            /**
             * Creates a plain object from a ProofProposalApproval message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {consensus.v1.ProofProposalApproval} message ProofProposalApproval
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ProofProposalApproval.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.approver = "";
                    else {
                        object.approver = [];
                        if (options.bytes !== Array)
                            object.approver = $util.newBuffer(object.approver);
                    }
                    if (options.bytes === String)
                        object.approval_sig = "";
                    else {
                        object.approval_sig = [];
                        if (options.bytes !== Array)
                            object.approval_sig = $util.newBuffer(object.approval_sig);
                    }
                }
                if (message.approver != null && message.hasOwnProperty("approver"))
                    object.approver = $util.bytesTo(message.approver, options);
                if (message.approval_sig != null && message.hasOwnProperty("approval_sig"))
                    object.approval_sig = $util.bytesTo(message.approval_sig, options);
                return object;
            };

            /**
             * Converts this ProofProposalApproval to JSON.
             * @function toJSON
             * @memberof consensus.v1.ProofProposalApproval
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ProofProposalApproval.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ProofProposalApproval
             * @function getTypeUrl
             * @memberof consensus.v1.ProofProposalApproval
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ProofProposalApproval.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.ProofProposalApproval";
            };

            return ProofProposalApproval;
        })();

        v1.EpochAppendIntent = (function() {

            /**
             * Properties of an EpochAppendIntent.
             * @memberof consensus.v1
             * @interface IEpochAppendIntent
             * @property {B4aBuffer|null} [network_id] EpochAppendIntent network_id
             * @property {B4aBuffer|null} [bootstrap] EpochAppendIntent bootstrap
             * @property {B4aBuffer|null} [epoch] EpochAppendIntent epoch
             * @property {B4aBuffer|null} [parent_hash] EpochAppendIntent parent_hash
             * @property {B4aBuffer|null} [membership_context] EpochAppendIntent membership_context
             * @property {B4aBuffer|null} [config_hash] EpochAppendIntent config_hash
             * @property {string|null} [request_id] EpochAppendIntent request_id
             * @property {B4aBuffer|null} [payload_hash] EpochAppendIntent payload_hash
             * @property {B4aBuffer|null} [logical_counter] EpochAppendIntent logical_counter
             * @property {B4aBuffer|null} [requester] EpochAppendIntent requester
             * @property {number|null} [selection_version] EpochAppendIntent selection_version
             */

            /**
             * Constructs a new EpochAppendIntent.
             * @memberof consensus.v1
             * @classdesc Represents an EpochAppendIntent.
             * @implements IEpochAppendIntent
             * @constructor
             * @param {consensus.v1.IEpochAppendIntent=} [properties] Properties to set
             */
            function EpochAppendIntent(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochAppendIntent network_id.
             * @member {B4aBuffer} network_id
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.network_id = $util.newBuffer([]);

            /**
             * EpochAppendIntent bootstrap.
             * @member {B4aBuffer} bootstrap
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.bootstrap = $util.newBuffer([]);

            /**
             * EpochAppendIntent epoch.
             * @member {B4aBuffer} epoch
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.epoch = $util.newBuffer([]);

            /**
             * EpochAppendIntent parent_hash.
             * @member {B4aBuffer} parent_hash
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.parent_hash = $util.newBuffer([]);

            /**
             * EpochAppendIntent membership_context.
             * @member {B4aBuffer} membership_context
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.membership_context = $util.newBuffer([]);

            /**
             * EpochAppendIntent config_hash.
             * @member {B4aBuffer} config_hash
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.config_hash = $util.newBuffer([]);

            /**
             * EpochAppendIntent request_id.
             * @member {string} request_id
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.request_id = "";

            /**
             * EpochAppendIntent payload_hash.
             * @member {B4aBuffer} payload_hash
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.payload_hash = $util.newBuffer([]);

            /**
             * EpochAppendIntent logical_counter.
             * @member {B4aBuffer} logical_counter
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.logical_counter = $util.newBuffer([]);

            /**
             * EpochAppendIntent requester.
             * @member {B4aBuffer} requester
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.requester = $util.newBuffer([]);

            /**
             * EpochAppendIntent selection_version.
             * @member {number} selection_version
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             */
            EpochAppendIntent.prototype.selection_version = 0;

            /**
             * Creates a new EpochAppendIntent instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {consensus.v1.IEpochAppendIntent=} [properties] Properties to set
             * @returns {consensus.v1.EpochAppendIntent} EpochAppendIntent instance
             */
            EpochAppendIntent.create = function create(properties) {
                return new EpochAppendIntent(properties);
            };

            /**
             * Encodes the specified EpochAppendIntent message. Does not implicitly {@link consensus.v1.EpochAppendIntent.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {consensus.v1.IEpochAppendIntent} message EpochAppendIntent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendIntent.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.network_id != null && Object.hasOwnProperty.call(message, "network_id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.network_id);
                if (message.bootstrap != null && Object.hasOwnProperty.call(message, "bootstrap"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.bootstrap);
                if (message.epoch != null && Object.hasOwnProperty.call(message, "epoch"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.epoch);
                if (message.parent_hash != null && Object.hasOwnProperty.call(message, "parent_hash"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.parent_hash);
                if (message.membership_context != null && Object.hasOwnProperty.call(message, "membership_context"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.membership_context);
                if (message.config_hash != null && Object.hasOwnProperty.call(message, "config_hash"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.config_hash);
                if (message.request_id != null && Object.hasOwnProperty.call(message, "request_id"))
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.request_id);
                if (message.payload_hash != null && Object.hasOwnProperty.call(message, "payload_hash"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.payload_hash);
                if (message.logical_counter != null && Object.hasOwnProperty.call(message, "logical_counter"))
                    writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.logical_counter);
                if (message.requester != null && Object.hasOwnProperty.call(message, "requester"))
                    writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.requester);
                if (message.selection_version != null && Object.hasOwnProperty.call(message, "selection_version"))
                    writer.uint32(/* id 11, wireType 0 =*/88).uint32(message.selection_version);
                return writer;
            };

            /**
             * Encodes the specified EpochAppendIntent message, length delimited. Does not implicitly {@link consensus.v1.EpochAppendIntent.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {consensus.v1.IEpochAppendIntent} message EpochAppendIntent message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendIntent.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochAppendIntent message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochAppendIntent} EpochAppendIntent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendIntent.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochAppendIntent();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.network_id = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 2: {
                            message.bootstrap = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 3: {
                            message.epoch = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 4: {
                            message.parent_hash = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 5: {
                            message.membership_context = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 6: {
                            message.config_hash = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 7: {
                            message.request_id = reader.string();
                            break;
                        }
                    case 8: {
                            message.payload_hash = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 9: {
                            message.logical_counter = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 10: {
                            message.requester = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 11: {
                            message.selection_version = reader.uint32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EpochAppendIntent message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochAppendIntent} EpochAppendIntent
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendIntent.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochAppendIntent message.
             * @function verify
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochAppendIntent.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    if (!$util.isBytes(message.network_id))
                        return "network_id: buffer expected";
                if (message.bootstrap != null && message.hasOwnProperty("bootstrap"))
                    if (!$util.isBytes(message.bootstrap))
                        return "bootstrap: buffer expected";
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (!$util.isBytes(message.epoch))
                        return "epoch: buffer expected";
                if (message.parent_hash != null && message.hasOwnProperty("parent_hash"))
                    if (!$util.isBytes(message.parent_hash))
                        return "parent_hash: buffer expected";
                if (message.membership_context != null && message.hasOwnProperty("membership_context"))
                    if (!$util.isBytes(message.membership_context))
                        return "membership_context: buffer expected";
                if (message.config_hash != null && message.hasOwnProperty("config_hash"))
                    if (!$util.isBytes(message.config_hash))
                        return "config_hash: buffer expected";
                if (message.request_id != null && message.hasOwnProperty("request_id"))
                    if (!$util.isString(message.request_id))
                        return "request_id: string expected";
                if (message.payload_hash != null && message.hasOwnProperty("payload_hash"))
                    if (!$util.isBytes(message.payload_hash))
                        return "payload_hash: buffer expected";
                if (message.logical_counter != null && message.hasOwnProperty("logical_counter"))
                    if (!$util.isBytes(message.logical_counter))
                        return "logical_counter: buffer expected";
                if (message.requester != null && message.hasOwnProperty("requester"))
                    if (!$util.isBytes(message.requester))
                        return "requester: buffer expected";
                if (message.selection_version != null && message.hasOwnProperty("selection_version"))
                    if (!$util.isInteger(message.selection_version))
                        return "selection_version: integer expected";
                return null;
            };

            /**
             * Creates an EpochAppendIntent message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochAppendIntent} EpochAppendIntent
             */
            EpochAppendIntent.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochAppendIntent)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.EpochAppendIntent();
                if (object.network_id != null)
                    message.network_id = $util.bytesFrom(object.network_id);
                if (object.bootstrap != null)
                    message.bootstrap = $util.bytesFrom(object.bootstrap);
                if (object.epoch != null)
                    message.epoch = $util.bytesFrom(object.epoch);
                if (object.parent_hash != null)
                    message.parent_hash = $util.bytesFrom(object.parent_hash);
                if (object.membership_context != null)
                    message.membership_context = $util.bytesFrom(object.membership_context);
                if (object.config_hash != null)
                    message.config_hash = $util.bytesFrom(object.config_hash);
                if (object.request_id != null)
                    message.request_id = String(object.request_id);
                if (object.payload_hash != null)
                    message.payload_hash = $util.bytesFrom(object.payload_hash);
                if (object.logical_counter != null)
                    message.logical_counter = $util.bytesFrom(object.logical_counter);
                if (object.requester != null)
                    message.requester = $util.bytesFrom(object.requester);
                if (object.selection_version != null)
                    message.selection_version = object.selection_version >>> 0;
                return message;
            };

            /**
             * Creates a plain object from an EpochAppendIntent message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {consensus.v1.EpochAppendIntent} message EpochAppendIntent
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochAppendIntent.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.network_id = "";
                    else {
                        object.network_id = [];
                        if (options.bytes !== Array)
                            object.network_id = $util.newBuffer(object.network_id);
                    }
                    if (options.bytes === String)
                        object.bootstrap = "";
                    else {
                        object.bootstrap = [];
                        if (options.bytes !== Array)
                            object.bootstrap = $util.newBuffer(object.bootstrap);
                    }
                    if (options.bytes === String)
                        object.epoch = "";
                    else {
                        object.epoch = [];
                        if (options.bytes !== Array)
                            object.epoch = $util.newBuffer(object.epoch);
                    }
                    if (options.bytes === String)
                        object.parent_hash = "";
                    else {
                        object.parent_hash = [];
                        if (options.bytes !== Array)
                            object.parent_hash = $util.newBuffer(object.parent_hash);
                    }
                    if (options.bytes === String)
                        object.membership_context = "";
                    else {
                        object.membership_context = [];
                        if (options.bytes !== Array)
                            object.membership_context = $util.newBuffer(object.membership_context);
                    }
                    if (options.bytes === String)
                        object.config_hash = "";
                    else {
                        object.config_hash = [];
                        if (options.bytes !== Array)
                            object.config_hash = $util.newBuffer(object.config_hash);
                    }
                    object.request_id = "";
                    if (options.bytes === String)
                        object.payload_hash = "";
                    else {
                        object.payload_hash = [];
                        if (options.bytes !== Array)
                            object.payload_hash = $util.newBuffer(object.payload_hash);
                    }
                    if (options.bytes === String)
                        object.logical_counter = "";
                    else {
                        object.logical_counter = [];
                        if (options.bytes !== Array)
                            object.logical_counter = $util.newBuffer(object.logical_counter);
                    }
                    if (options.bytes === String)
                        object.requester = "";
                    else {
                        object.requester = [];
                        if (options.bytes !== Array)
                            object.requester = $util.newBuffer(object.requester);
                    }
                    object.selection_version = 0;
                }
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    object.network_id = $util.bytesTo(message.network_id, options);
                if (message.bootstrap != null && message.hasOwnProperty("bootstrap"))
                    object.bootstrap = $util.bytesTo(message.bootstrap, options);
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    object.epoch = $util.bytesTo(message.epoch, options);
                if (message.parent_hash != null && message.hasOwnProperty("parent_hash"))
                    object.parent_hash = $util.bytesTo(message.parent_hash, options);
                if (message.membership_context != null && message.hasOwnProperty("membership_context"))
                    object.membership_context = $util.bytesTo(message.membership_context, options);
                if (message.config_hash != null && message.hasOwnProperty("config_hash"))
                    object.config_hash = $util.bytesTo(message.config_hash, options);
                if (message.request_id != null && message.hasOwnProperty("request_id"))
                    object.request_id = message.request_id;
                if (message.payload_hash != null && message.hasOwnProperty("payload_hash"))
                    object.payload_hash = $util.bytesTo(message.payload_hash, options);
                if (message.logical_counter != null && message.hasOwnProperty("logical_counter"))
                    object.logical_counter = $util.bytesTo(message.logical_counter, options);
                if (message.requester != null && message.hasOwnProperty("requester"))
                    object.requester = $util.bytesTo(message.requester, options);
                if (message.selection_version != null && message.hasOwnProperty("selection_version"))
                    object.selection_version = message.selection_version;
                return object;
            };

            /**
             * Converts this EpochAppendIntent to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochAppendIntent
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochAppendIntent.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochAppendIntent
             * @function getTypeUrl
             * @memberof consensus.v1.EpochAppendIntent
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochAppendIntent.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochAppendIntent";
            };

            return EpochAppendIntent;
        })();

        v1.EpochAppendRequest = (function() {

            /**
             * Properties of an EpochAppendRequest.
             * @memberof consensus.v1
             * @interface IEpochAppendRequest
             * @property {consensus.v1.IEpochAppendIntent|null} [intent] EpochAppendRequest intent
             * @property {B4aBuffer|null} [signature] EpochAppendRequest signature
             */

            /**
             * Constructs a new EpochAppendRequest.
             * @memberof consensus.v1
             * @classdesc Represents an EpochAppendRequest.
             * @implements IEpochAppendRequest
             * @constructor
             * @param {consensus.v1.IEpochAppendRequest=} [properties] Properties to set
             */
            function EpochAppendRequest(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochAppendRequest intent.
             * @member {consensus.v1.IEpochAppendIntent|null|undefined} intent
             * @memberof consensus.v1.EpochAppendRequest
             * @instance
             */
            EpochAppendRequest.prototype.intent = null;

            /**
             * EpochAppendRequest signature.
             * @member {B4aBuffer} signature
             * @memberof consensus.v1.EpochAppendRequest
             * @instance
             */
            EpochAppendRequest.prototype.signature = $util.newBuffer([]);

            /**
             * Creates a new EpochAppendRequest instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {consensus.v1.IEpochAppendRequest=} [properties] Properties to set
             * @returns {consensus.v1.EpochAppendRequest} EpochAppendRequest instance
             */
            EpochAppendRequest.create = function create(properties) {
                return new EpochAppendRequest(properties);
            };

            /**
             * Encodes the specified EpochAppendRequest message. Does not implicitly {@link consensus.v1.EpochAppendRequest.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {consensus.v1.IEpochAppendRequest} message EpochAppendRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendRequest.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.intent != null && Object.hasOwnProperty.call(message, "intent"))
                    $root.consensus.v1.EpochAppendIntent.encode(message.intent, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.signature);
                return writer;
            };

            /**
             * Encodes the specified EpochAppendRequest message, length delimited. Does not implicitly {@link consensus.v1.EpochAppendRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {consensus.v1.IEpochAppendRequest} message EpochAppendRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochAppendRequest message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochAppendRequest} EpochAppendRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendRequest.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochAppendRequest();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.intent = $root.consensus.v1.EpochAppendIntent.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            message.signature = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EpochAppendRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochAppendRequest} EpochAppendRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendRequest.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochAppendRequest message.
             * @function verify
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochAppendRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.intent != null && message.hasOwnProperty("intent")) {
                    var error = $root.consensus.v1.EpochAppendIntent.verify(message.intent);
                    if (error)
                        return "intent." + error;
                }
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!$util.isBytes(message.signature))
                        return "signature: buffer expected";
                return null;
            };

            /**
             * Creates an EpochAppendRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochAppendRequest} EpochAppendRequest
             */
            EpochAppendRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochAppendRequest)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.EpochAppendRequest();
                if (object.intent != null) {
                    if (typeof object.intent !== "object")
                        throw TypeError(".consensus.v1.EpochAppendRequest.intent: object expected");
                    message.intent = $root.consensus.v1.EpochAppendIntent.fromObject(object.intent);
                }
                if (object.signature != null)
                    message.signature = $util.bytesFrom(object.signature);
                return message;
            };

            /**
             * Creates a plain object from an EpochAppendRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {consensus.v1.EpochAppendRequest} message EpochAppendRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochAppendRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.intent = null;
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                }
                if (message.intent != null && message.hasOwnProperty("intent"))
                    object.intent = $root.consensus.v1.EpochAppendIntent.toObject(message.intent, options);
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = $util.bytesTo(message.signature, options);
                return object;
            };

            /**
             * Converts this EpochAppendRequest to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochAppendRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochAppendRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochAppendRequest
             * @function getTypeUrl
             * @memberof consensus.v1.EpochAppendRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochAppendRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochAppendRequest";
            };

            return EpochAppendRequest;
        })();

        v1.EpochAppendReply = (function() {

            /**
             * Properties of an EpochAppendReply.
             * @memberof consensus.v1
             * @interface IEpochAppendReply
             * @property {consensus.v1.IEpochAppendIntent|null} [intent] EpochAppendReply intent
             * @property {B4aBuffer|null} [responder] EpochAppendReply responder
             * @property {B4aBuffer|null} [signature] EpochAppendReply signature
             * @property {number|null} [vote_status] EpochAppendReply vote_status
             * @property {B4aBuffer|null} [observed_counter] EpochAppendReply observed_counter
             * @property {consensus.v1.IEpochAppendIntent|null} [vote] EpochAppendReply vote
             */

            /**
             * Constructs a new EpochAppendReply.
             * @memberof consensus.v1
             * @classdesc Represents an EpochAppendReply.
             * @implements IEpochAppendReply
             * @constructor
             * @param {consensus.v1.IEpochAppendReply=} [properties] Properties to set
             */
            function EpochAppendReply(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochAppendReply intent.
             * @member {consensus.v1.IEpochAppendIntent|null|undefined} intent
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.intent = null;

            /**
             * EpochAppendReply responder.
             * @member {B4aBuffer} responder
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.responder = $util.newBuffer([]);

            /**
             * EpochAppendReply signature.
             * @member {B4aBuffer} signature
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.signature = $util.newBuffer([]);

            /**
             * EpochAppendReply vote_status.
             * @member {number} vote_status
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.vote_status = 0;

            /**
             * EpochAppendReply observed_counter.
             * @member {B4aBuffer} observed_counter
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.observed_counter = $util.newBuffer([]);

            /**
             * EpochAppendReply vote.
             * @member {consensus.v1.IEpochAppendIntent|null|undefined} vote
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             */
            EpochAppendReply.prototype.vote = null;

            /**
             * Creates a new EpochAppendReply instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {consensus.v1.IEpochAppendReply=} [properties] Properties to set
             * @returns {consensus.v1.EpochAppendReply} EpochAppendReply instance
             */
            EpochAppendReply.create = function create(properties) {
                return new EpochAppendReply(properties);
            };

            /**
             * Encodes the specified EpochAppendReply message. Does not implicitly {@link consensus.v1.EpochAppendReply.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {consensus.v1.IEpochAppendReply} message EpochAppendReply message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendReply.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.intent != null && Object.hasOwnProperty.call(message, "intent"))
                    $root.consensus.v1.EpochAppendIntent.encode(message.intent, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.responder != null && Object.hasOwnProperty.call(message, "responder"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.responder);
                if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.signature);
                if (message.vote_status != null && Object.hasOwnProperty.call(message, "vote_status"))
                    writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.vote_status);
                if (message.observed_counter != null && Object.hasOwnProperty.call(message, "observed_counter"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.observed_counter);
                if (message.vote != null && Object.hasOwnProperty.call(message, "vote"))
                    $root.consensus.v1.EpochAppendIntent.encode(message.vote, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified EpochAppendReply message, length delimited. Does not implicitly {@link consensus.v1.EpochAppendReply.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {consensus.v1.IEpochAppendReply} message EpochAppendReply message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochAppendReply.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochAppendReply message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochAppendReply} EpochAppendReply
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendReply.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochAppendReply();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.intent = $root.consensus.v1.EpochAppendIntent.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            message.responder = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 3: {
                            message.signature = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 4: {
                            message.vote_status = reader.uint32();
                            break;
                        }
                    case 5: {
                            message.observed_counter = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 6: {
                            message.vote = $root.consensus.v1.EpochAppendIntent.decode(reader, reader.uint32());
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EpochAppendReply message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochAppendReply} EpochAppendReply
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochAppendReply.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochAppendReply message.
             * @function verify
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochAppendReply.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.intent != null && message.hasOwnProperty("intent")) {
                    var error = $root.consensus.v1.EpochAppendIntent.verify(message.intent);
                    if (error)
                        return "intent." + error;
                }
                if (message.responder != null && message.hasOwnProperty("responder"))
                    if (!$util.isBytes(message.responder))
                        return "responder: buffer expected";
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!$util.isBytes(message.signature))
                        return "signature: buffer expected";
                if (message.vote_status != null && message.hasOwnProperty("vote_status"))
                    if (!$util.isInteger(message.vote_status))
                        return "vote_status: integer expected";
                if (message.observed_counter != null && message.hasOwnProperty("observed_counter"))
                    if (!$util.isBytes(message.observed_counter))
                        return "observed_counter: buffer expected";
                if (message.vote != null && message.hasOwnProperty("vote")) {
                    var error = $root.consensus.v1.EpochAppendIntent.verify(message.vote);
                    if (error)
                        return "vote." + error;
                }
                return null;
            };

            /**
             * Creates an EpochAppendReply message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochAppendReply} EpochAppendReply
             */
            EpochAppendReply.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochAppendReply)
                    object = Object.assign({}, object);
                var message = new $root.consensus.v1.EpochAppendReply();
                if (object.intent != null) {
                    if (typeof object.intent !== "object")
                        throw TypeError(".consensus.v1.EpochAppendReply.intent: object expected");
                    message.intent = $root.consensus.v1.EpochAppendIntent.fromObject(object.intent);
                }
                if (object.responder != null)
                    message.responder = $util.bytesFrom(object.responder);
                if (object.signature != null)
                    message.signature = $util.bytesFrom(object.signature);
                if (object.vote_status != null)
                    message.vote_status = object.vote_status >>> 0;
                if (object.observed_counter != null)
                    message.observed_counter = $util.bytesFrom(object.observed_counter);
                if (object.vote != null) {
                    if (typeof object.vote !== "object")
                        throw TypeError(".consensus.v1.EpochAppendReply.vote: object expected");
                    message.vote = $root.consensus.v1.EpochAppendIntent.fromObject(object.vote);
                }
                return message;
            };

            /**
             * Creates a plain object from an EpochAppendReply message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {consensus.v1.EpochAppendReply} message EpochAppendReply
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochAppendReply.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.intent = null;
                    if (options.bytes === String)
                        object.responder = "";
                    else {
                        object.responder = [];
                        if (options.bytes !== Array)
                            object.responder = $util.newBuffer(object.responder);
                    }
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                    object.vote_status = 0;
                    if (options.bytes === String)
                        object.observed_counter = "";
                    else {
                        object.observed_counter = [];
                        if (options.bytes !== Array)
                            object.observed_counter = $util.newBuffer(object.observed_counter);
                    }
                    object.vote = null;
                }
                if (message.intent != null && message.hasOwnProperty("intent"))
                    object.intent = $root.consensus.v1.EpochAppendIntent.toObject(message.intent, options);
                if (message.responder != null && message.hasOwnProperty("responder"))
                    object.responder = $util.bytesTo(message.responder, options);
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = $util.bytesTo(message.signature, options);
                if (message.vote_status != null && message.hasOwnProperty("vote_status"))
                    object.vote_status = message.vote_status;
                if (message.observed_counter != null && message.hasOwnProperty("observed_counter"))
                    object.observed_counter = $util.bytesTo(message.observed_counter, options);
                if (message.vote != null && message.hasOwnProperty("vote"))
                    object.vote = $root.consensus.v1.EpochAppendIntent.toObject(message.vote, options);
                return object;
            };

            /**
             * Converts this EpochAppendReply to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochAppendReply
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochAppendReply.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochAppendReply
             * @function getTypeUrl
             * @memberof consensus.v1.EpochAppendReply
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochAppendReply.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochAppendReply";
            };

            return EpochAppendReply;
        })();

        return v1;
    })();

    return consensus;
})();

$root.common = (function() {

    /**
     * Namespace common.
     * @exports common
     * @namespace
     */
    var common = {};

    common.v1 = (function() {

        /**
         * Namespace v1.
         * @memberof common
         * @namespace
         */
        var v1 = {};

        /**
         * ResultCode enum.
         * @name common.v1.ResultCode
         * @enum {number}
         * @property {number} RESULT_CODE_UNSPECIFIED=0 RESULT_CODE_UNSPECIFIED value
         * @property {number} RESULT_CODE_OK=1 RESULT_CODE_OK value
         * @property {number} RESULT_CODE_INVALID_PAYLOAD=2 RESULT_CODE_INVALID_PAYLOAD value
         * @property {number} RESULT_CODE_RATE_LIMITED=3 RESULT_CODE_RATE_LIMITED value
         * @property {number} RESULT_CODE_SIGNATURE_INVALID=4 RESULT_CODE_SIGNATURE_INVALID value
         * @property {number} RESULT_CODE_UNEXPECTED_ERROR=5 RESULT_CODE_UNEXPECTED_ERROR value
         * @property {number} RESULT_CODE_TIMEOUT=6 RESULT_CODE_TIMEOUT value
         * @property {number} RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS=7 RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS value
         * @property {number} RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE=8 RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE value
         * @property {number} RESULT_CODE_NODE_OVERLOADED=9 RESULT_CODE_NODE_OVERLOADED value
         * @property {number} RESULT_CODE_TX_ALREADY_PENDING=10 RESULT_CODE_TX_ALREADY_PENDING value
         * @property {number} RESULT_CODE_OPERATION_TYPE_UNKNOWN=11 RESULT_CODE_OPERATION_TYPE_UNKNOWN value
         * @property {number} RESULT_CODE_SCHEMA_VALIDATION_FAILED=12 RESULT_CODE_SCHEMA_VALIDATION_FAILED value
         * @property {number} RESULT_CODE_REQUESTER_ADDRESS_INVALID=13 RESULT_CODE_REQUESTER_ADDRESS_INVALID value
         * @property {number} RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID=14 RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID value
         * @property {number} RESULT_CODE_TX_HASH_MISMATCH=15 RESULT_CODE_TX_HASH_MISMATCH value
         * @property {number} RESULT_CODE_TX_SIGNATURE_INVALID=16 RESULT_CODE_TX_SIGNATURE_INVALID value
         * @property {number} RESULT_CODE_TX_EXPIRED=17 RESULT_CODE_TX_EXPIRED value
         * @property {number} RESULT_CODE_TX_ALREADY_EXISTS=18 RESULT_CODE_TX_ALREADY_EXISTS value
         * @property {number} RESULT_CODE_OPERATION_ALREADY_COMPLETED=19 RESULT_CODE_OPERATION_ALREADY_COMPLETED value
         * @property {number} RESULT_CODE_REQUESTER_NOT_FOUND=20 RESULT_CODE_REQUESTER_NOT_FOUND value
         * @property {number} RESULT_CODE_INSUFFICIENT_FEE_BALANCE=21 RESULT_CODE_INSUFFICIENT_FEE_BALANCE value
         * @property {number} RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP=22 RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP value
         * @property {number} RESULT_CODE_SELF_VALIDATION_FORBIDDEN=23 RESULT_CODE_SELF_VALIDATION_FORBIDDEN value
         * @property {number} RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND=24 RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND value
         * @property {number} RESULT_CODE_ROLE_NODE_ALREADY_WRITER=25 RESULT_CODE_ROLE_NODE_ALREADY_WRITER value
         * @property {number} RESULT_CODE_ROLE_NODE_NOT_WHITELISTED=26 RESULT_CODE_ROLE_NODE_NOT_WHITELISTED value
         * @property {number} RESULT_CODE_ROLE_NODE_NOT_WRITER=27 RESULT_CODE_ROLE_NODE_NOT_WRITER value
         * @property {number} RESULT_CODE_ROLE_NODE_IS_INDEXER=28 RESULT_CODE_ROLE_NODE_IS_INDEXER value
         * @property {number} RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING=29 RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING value
         * @property {number} RESULT_CODE_ROLE_INVALID_RECOVERY_CASE=30 RESULT_CODE_ROLE_INVALID_RECOVERY_CASE value
         * @property {number} RESULT_CODE_ROLE_UNKNOWN_OPERATION=31 RESULT_CODE_ROLE_UNKNOWN_OPERATION value
         * @property {number} RESULT_CODE_ROLE_INVALID_WRITER_KEY=32 RESULT_CODE_ROLE_INVALID_WRITER_KEY value
         * @property {number} RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE=33 RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE value
         * @property {number} RESULT_CODE_MSB_BOOTSTRAP_MISMATCH=34 RESULT_CODE_MSB_BOOTSTRAP_MISMATCH value
         * @property {number} RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED=35 RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED value
         * @property {number} RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING=36 RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING value
         * @property {number} RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH=37 RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH value
         * @property {number} RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS=38 RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS value
         * @property {number} RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID=39 RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID value
         * @property {number} RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID=40 RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID value
         * @property {number} RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE=41 RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE value
         * @property {number} RESULT_CODE_TRANSFER_SENDER_NOT_FOUND=42 RESULT_CODE_TRANSFER_SENDER_NOT_FOUND value
         * @property {number} RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE=43 RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE value
         * @property {number} RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW=44 RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW value
         * @property {number} RESULT_CODE_TX_HASH_INVALID_FORMAT=45 RESULT_CODE_TX_HASH_INVALID_FORMAT value
         * @property {number} RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED=46 RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED value
         * @property {number} RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING=47 RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING value
         * @property {number} RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID=48 RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID value
         * @property {number} RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN=49 RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN value
         * @property {number} RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED=50 RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED value
         * @property {number} RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID=51 RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID value
         * @property {number} RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA=52 RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA value
         * @property {number} RESULT_CODE_PROOF_PAYLOAD_MISMATCH=53 RESULT_CODE_PROOF_PAYLOAD_MISMATCH value
         * @property {number} RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED=54 RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED value
         * @property {number} RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH=55 RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH value
         * @property {number} RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND=56 RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND value
         * @property {number} RESULT_CODE_VALIDATOR_NODE_NOT_WRITER=57 RESULT_CODE_VALIDATOR_NODE_NOT_WRITER value
         * @property {number} RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH=58 RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH value
         * @property {number} RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID=59 RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID value
         * @property {number} RESULT_CODE_VALIDATOR_VA_MISSING=60 RESULT_CODE_VALIDATOR_VA_MISSING value
         * @property {number} RESULT_CODE_TX_INVALID_PAYLOAD=61 RESULT_CODE_TX_INVALID_PAYLOAD value
         * @property {number} RESULT_CODE_CONSENSUS_SCHEMA_VALIDATION_FAILED=100 RESULT_CODE_CONSENSUS_SCHEMA_VALIDATION_FAILED value
         * @property {number} RESULT_CODE_CONSENSUS_BAD_PROTOCOL_VERSION=101 RESULT_CODE_CONSENSUS_BAD_PROTOCOL_VERSION value
         * @property {number} RESULT_CODE_CONSENSUS_WRONG_NETWORK_ID=102 RESULT_CODE_CONSENSUS_WRONG_NETWORK_ID value
         * @property {number} RESULT_CODE_CONSENSUS_CONFIG_MISMATCH=103 RESULT_CODE_CONSENSUS_CONFIG_MISMATCH value
         * @property {number} RESULT_CODE_CONSENSUS_VDF_PROOF_INVALID=104 RESULT_CODE_CONSENSUS_VDF_PROOF_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_ADDRESS_INVALID=105 RESULT_CODE_CONSENSUS_ADDRESS_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_PUBLIC_KEY_MISMATCH=106 RESULT_CODE_CONSENSUS_PUBLIC_KEY_MISMATCH value
         * @property {number} RESULT_CODE_CONSENSUS_PROPOSAL_SIGNATURE_INVALID=107 RESULT_CODE_CONSENSUS_PROPOSAL_SIGNATURE_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_RESPONSE_SIGNATURE_INVALID=108 RESULT_CODE_CONSENSUS_RESPONSE_SIGNATURE_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_APPROVAL_SIGNATURE_INVALID=109 RESULT_CODE_CONSENSUS_APPROVAL_SIGNATURE_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_OPERATION_TYPE_INVALID=110 RESULT_CODE_CONSENSUS_OPERATION_TYPE_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_RESPONSE_APPROVAL_INVALID=111 RESULT_CODE_CONSENSUS_RESPONSE_APPROVAL_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_EPOCH_INVALID=112 RESULT_CODE_CONSENSUS_EPOCH_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_PREVIOUS_EPOCH_RECORD_HASH_INVALID=113 RESULT_CODE_CONSENSUS_PREVIOUS_EPOCH_RECORD_HASH_INVALID value
         * @property {number} RESULT_CODE_CONSENSUS_INDEXER_ROLE_INVALID=114 RESULT_CODE_CONSENSUS_INDEXER_ROLE_INVALID value
         */
        v1.ResultCode = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "RESULT_CODE_UNSPECIFIED"] = 0;
            values[valuesById[1] = "RESULT_CODE_OK"] = 1;
            values[valuesById[2] = "RESULT_CODE_INVALID_PAYLOAD"] = 2;
            values[valuesById[3] = "RESULT_CODE_RATE_LIMITED"] = 3;
            values[valuesById[4] = "RESULT_CODE_SIGNATURE_INVALID"] = 4;
            values[valuesById[5] = "RESULT_CODE_UNEXPECTED_ERROR"] = 5;
            values[valuesById[6] = "RESULT_CODE_TIMEOUT"] = 6;
            values[valuesById[7] = "RESULT_CODE_NODE_HAS_NO_WRITE_ACCESS"] = 7;
            values[valuesById[8] = "RESULT_CODE_TX_ACCEPTED_PROOF_UNAVAILABLE"] = 8;
            values[valuesById[9] = "RESULT_CODE_NODE_OVERLOADED"] = 9;
            values[valuesById[10] = "RESULT_CODE_TX_ALREADY_PENDING"] = 10;
            values[valuesById[11] = "RESULT_CODE_OPERATION_TYPE_UNKNOWN"] = 11;
            values[valuesById[12] = "RESULT_CODE_SCHEMA_VALIDATION_FAILED"] = 12;
            values[valuesById[13] = "RESULT_CODE_REQUESTER_ADDRESS_INVALID"] = 13;
            values[valuesById[14] = "RESULT_CODE_REQUESTER_PUBLIC_KEY_INVALID"] = 14;
            values[valuesById[15] = "RESULT_CODE_TX_HASH_MISMATCH"] = 15;
            values[valuesById[16] = "RESULT_CODE_TX_SIGNATURE_INVALID"] = 16;
            values[valuesById[17] = "RESULT_CODE_TX_EXPIRED"] = 17;
            values[valuesById[18] = "RESULT_CODE_TX_ALREADY_EXISTS"] = 18;
            values[valuesById[19] = "RESULT_CODE_OPERATION_ALREADY_COMPLETED"] = 19;
            values[valuesById[20] = "RESULT_CODE_REQUESTER_NOT_FOUND"] = 20;
            values[valuesById[21] = "RESULT_CODE_INSUFFICIENT_FEE_BALANCE"] = 21;
            values[valuesById[22] = "RESULT_CODE_EXTERNAL_BOOTSTRAP_EQUALS_MSB_BOOTSTRAP"] = 22;
            values[valuesById[23] = "RESULT_CODE_SELF_VALIDATION_FORBIDDEN"] = 23;
            values[valuesById[24] = "RESULT_CODE_ROLE_NODE_ENTRY_NOT_FOUND"] = 24;
            values[valuesById[25] = "RESULT_CODE_ROLE_NODE_ALREADY_WRITER"] = 25;
            values[valuesById[26] = "RESULT_CODE_ROLE_NODE_NOT_WHITELISTED"] = 26;
            values[valuesById[27] = "RESULT_CODE_ROLE_NODE_NOT_WRITER"] = 27;
            values[valuesById[28] = "RESULT_CODE_ROLE_NODE_IS_INDEXER"] = 28;
            values[valuesById[29] = "RESULT_CODE_ROLE_ADMIN_ENTRY_MISSING"] = 29;
            values[valuesById[30] = "RESULT_CODE_ROLE_INVALID_RECOVERY_CASE"] = 30;
            values[valuesById[31] = "RESULT_CODE_ROLE_UNKNOWN_OPERATION"] = 31;
            values[valuesById[32] = "RESULT_CODE_ROLE_INVALID_WRITER_KEY"] = 32;
            values[valuesById[33] = "RESULT_CODE_ROLE_INSUFFICIENT_FEE_BALANCE"] = 33;
            values[valuesById[34] = "RESULT_CODE_MSB_BOOTSTRAP_MISMATCH"] = 34;
            values[valuesById[35] = "RESULT_CODE_EXTERNAL_BOOTSTRAP_NOT_DEPLOYED"] = 35;
            values[valuesById[36] = "RESULT_CODE_EXTERNAL_BOOTSTRAP_TX_MISSING"] = 36;
            values[valuesById[37] = "RESULT_CODE_EXTERNAL_BOOTSTRAP_MISMATCH"] = 37;
            values[valuesById[38] = "RESULT_CODE_BOOTSTRAP_ALREADY_EXISTS"] = 38;
            values[valuesById[39] = "RESULT_CODE_TRANSFER_RECIPIENT_ADDRESS_INVALID"] = 39;
            values[valuesById[40] = "RESULT_CODE_TRANSFER_RECIPIENT_PUBLIC_KEY_INVALID"] = 40;
            values[valuesById[41] = "RESULT_CODE_TRANSFER_AMOUNT_TOO_LARGE"] = 41;
            values[valuesById[42] = "RESULT_CODE_TRANSFER_SENDER_NOT_FOUND"] = 42;
            values[valuesById[43] = "RESULT_CODE_TRANSFER_INSUFFICIENT_BALANCE"] = 43;
            values[valuesById[44] = "RESULT_CODE_TRANSFER_RECIPIENT_BALANCE_OVERFLOW"] = 44;
            values[valuesById[45] = "RESULT_CODE_TX_HASH_INVALID_FORMAT"] = 45;
            values[valuesById[46] = "RESULT_CODE_INTERNAL_ENQUEUE_VALIDATION_FAILED"] = 46;
            values[valuesById[47] = "RESULT_CODE_TX_COMMITTED_RECEIPT_MISSING"] = 47;
            values[valuesById[48] = "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_INVALID"] = 48;
            values[valuesById[49] = "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNKNOWN"] = 49;
            values[valuesById[50] = "RESULT_CODE_VALIDATOR_RESPONSE_TX_TYPE_UNSUPPORTED"] = 50;
            values[valuesById[51] = "RESULT_CODE_VALIDATOR_RESPONSE_SCHEMA_INVALID"] = 51;
            values[valuesById[52] = "RESULT_CODE_PENDING_REQUEST_MISSING_TX_DATA"] = 52;
            values[valuesById[53] = "RESULT_CODE_PROOF_PAYLOAD_MISMATCH"] = 53;
            values[valuesById[54] = "RESULT_CODE_VALIDATOR_WRITER_KEY_NOT_REGISTERED"] = 54;
            values[valuesById[55] = "RESULT_CODE_VALIDATOR_ADDRESS_MISMATCH"] = 55;
            values[valuesById[56] = "RESULT_CODE_VALIDATOR_NODE_ENTRY_NOT_FOUND"] = 56;
            values[valuesById[57] = "RESULT_CODE_VALIDATOR_NODE_NOT_WRITER"] = 57;
            values[valuesById[58] = "RESULT_CODE_VALIDATOR_WRITER_KEY_MISMATCH"] = 58;
            values[valuesById[59] = "RESULT_CODE_VALIDATOR_TX_OBJECT_INVALID"] = 59;
            values[valuesById[60] = "RESULT_CODE_VALIDATOR_VA_MISSING"] = 60;
            values[valuesById[61] = "RESULT_CODE_TX_INVALID_PAYLOAD"] = 61;
            values[valuesById[100] = "RESULT_CODE_CONSENSUS_SCHEMA_VALIDATION_FAILED"] = 100;
            values[valuesById[101] = "RESULT_CODE_CONSENSUS_BAD_PROTOCOL_VERSION"] = 101;
            values[valuesById[102] = "RESULT_CODE_CONSENSUS_WRONG_NETWORK_ID"] = 102;
            values[valuesById[103] = "RESULT_CODE_CONSENSUS_CONFIG_MISMATCH"] = 103;
            values[valuesById[104] = "RESULT_CODE_CONSENSUS_VDF_PROOF_INVALID"] = 104;
            values[valuesById[105] = "RESULT_CODE_CONSENSUS_ADDRESS_INVALID"] = 105;
            values[valuesById[106] = "RESULT_CODE_CONSENSUS_PUBLIC_KEY_MISMATCH"] = 106;
            values[valuesById[107] = "RESULT_CODE_CONSENSUS_PROPOSAL_SIGNATURE_INVALID"] = 107;
            values[valuesById[108] = "RESULT_CODE_CONSENSUS_RESPONSE_SIGNATURE_INVALID"] = 108;
            values[valuesById[109] = "RESULT_CODE_CONSENSUS_APPROVAL_SIGNATURE_INVALID"] = 109;
            values[valuesById[110] = "RESULT_CODE_CONSENSUS_OPERATION_TYPE_INVALID"] = 110;
            values[valuesById[111] = "RESULT_CODE_CONSENSUS_RESPONSE_APPROVAL_INVALID"] = 111;
            values[valuesById[112] = "RESULT_CODE_CONSENSUS_EPOCH_INVALID"] = 112;
            values[valuesById[113] = "RESULT_CODE_CONSENSUS_PREVIOUS_EPOCH_RECORD_HASH_INVALID"] = 113;
            values[valuesById[114] = "RESULT_CODE_CONSENSUS_INDEXER_ROLE_INVALID"] = 114;
            return values;
        })();

        return v1;
    })();

    common.consensus = (function() {

        /**
         * Namespace consensus.
         * @memberof common
         * @namespace
         */
        var consensus = {};

        consensus.EpochProofV1 = (function() {

            /**
             * Properties of an EpochProofV1.
             * @memberof common.consensus
             * @interface IEpochProofV1
             * @property {B4aBuffer|null} [pd] EpochProofV1 pd
             * @property {Array.<B4aBuffer>|null} [app] EpochProofV1 app
             */

            /**
             * Constructs a new EpochProofV1.
             * @memberof common.consensus
             * @classdesc Represents an EpochProofV1.
             * @implements IEpochProofV1
             * @constructor
             * @param {common.consensus.IEpochProofV1=} [properties] Properties to set
             */
            function EpochProofV1(properties) {
                this.app = [];
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochProofV1 pd.
             * @member {B4aBuffer} pd
             * @memberof common.consensus.EpochProofV1
             * @instance
             */
            EpochProofV1.prototype.pd = $util.newBuffer([]);

            /**
             * EpochProofV1 app.
             * @member {Array.<B4aBuffer>} app
             * @memberof common.consensus.EpochProofV1
             * @instance
             */
            EpochProofV1.prototype.app = $util.emptyArray;

            /**
             * Creates a new EpochProofV1 instance using the specified properties.
             * @function create
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {common.consensus.IEpochProofV1=} [properties] Properties to set
             * @returns {common.consensus.EpochProofV1} EpochProofV1 instance
             */
            EpochProofV1.create = function create(properties) {
                return new EpochProofV1(properties);
            };

            /**
             * Encodes the specified EpochProofV1 message. Does not implicitly {@link common.consensus.EpochProofV1.verify|verify} messages.
             * @function encode
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {common.consensus.IEpochProofV1} message EpochProofV1 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofV1.encode = function encode(message, writer) {
                writer = $Writer.create(writer);
                if (message.pd != null && Object.hasOwnProperty.call(message, "pd"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.pd);
                if (message.app != null && message.app.length)
                    for (var i = 0; i < message.app.length; ++i)
                        writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.app[i]);
                return writer;
            };

            /**
             * Encodes the specified EpochProofV1 message, length delimited. Does not implicitly {@link common.consensus.EpochProofV1.verify|verify} messages.
             * @function encodeDelimited
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {common.consensus.IEpochProofV1} message EpochProofV1 message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofV1.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochProofV1 message from the specified reader or buffer.
             * @function decode
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {common.consensus.EpochProofV1} EpochProofV1
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofV1.decode = function decode(reader, length, error) {
                reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.common.consensus.EpochProofV1();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.pd = $util.bytesFrom(reader.bytes());
                            break;
                        }
                    case 2: {
                            if (!(message.app && message.app.length))
                                message.app = [];
                            message.app.push($util.bytesFrom(reader.bytes()));
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an EpochProofV1 message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
             * @returns {common.consensus.EpochProofV1} EpochProofV1
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofV1.decodeDelimited = function decodeDelimited(reader) {
                reader = $Reader.create(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochProofV1 message.
             * @function verify
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochProofV1.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.pd != null && message.hasOwnProperty("pd"))
                    if (!$util.isBytes(message.pd))
                        return "pd: buffer expected";
                if (message.app != null && message.hasOwnProperty("app")) {
                    if (!Array.isArray(message.app))
                        return "app: array expected";
                    for (var i = 0; i < message.app.length; ++i)
                        if (!$util.isBytes(message.app[i]))
                            return "app: buffer[] expected";
                }
                return null;
            };

            /**
             * Creates an EpochProofV1 message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {common.consensus.EpochProofV1} EpochProofV1
             */
            EpochProofV1.fromObject = function fromObject(object) {
                if (object instanceof $root.common.consensus.EpochProofV1)
                    object = Object.assign({}, object);
                var message = new $root.common.consensus.EpochProofV1();
                if (object.pd != null)
                    message.pd = $util.bytesFrom(object.pd);
                if (object.app) {
                    if (!Array.isArray(object.app))
                        throw TypeError(".common.consensus.EpochProofV1.app: array expected");
                    message.app = [];
                    for (var i = 0; i < object.app.length; ++i)
                        message.app[i] = $util.bytesFrom(object.app[i]);
                }
                return message;
            };

            /**
             * Creates a plain object from an EpochProofV1 message. Also converts values to other types if specified.
             * @function toObject
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {common.consensus.EpochProofV1} message EpochProofV1
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochProofV1.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.arrays || options.defaults)
                    object.app = [];
                if (options.defaults)
                    if (options.bytes === String)
                        object.pd = "";
                    else {
                        object.pd = [];
                        if (options.bytes !== Array)
                            object.pd = $util.newBuffer(object.pd);
                    }
                if (message.pd != null && message.hasOwnProperty("pd"))
                    object.pd = $util.bytesTo(message.pd, options);
                if (message.app && message.app.length) {
                    object.app = [];
                    for (var j = 0; j < message.app.length; ++j)
                        object.app[j] = $util.bytesTo(message.app[j], options);
                }
                return object;
            };

            /**
             * Converts this EpochProofV1 to JSON.
             * @function toJSON
             * @memberof common.consensus.EpochProofV1
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochProofV1.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochProofV1
             * @function getTypeUrl
             * @memberof common.consensus.EpochProofV1
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochProofV1.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/common.consensus.EpochProofV1";
            };

            return EpochProofV1;
        })();

        return consensus;
    })();

    return common;
})();

module.exports = $root;
