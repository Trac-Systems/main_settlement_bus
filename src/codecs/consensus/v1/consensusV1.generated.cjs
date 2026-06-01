/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";
if (typeof globalThis !== 'undefined' && typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}


var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

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

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * ConsensusMessageHeader field.
             * @member {"proof_proposal"|"proof_proposal_response"|undefined} field
             * @memberof consensus.v1.ConsensusMessageHeader
             * @instance
             */
            Object.defineProperty(ConsensusMessageHeader.prototype, "field", {
                get: $util.oneOfGetter($oneOfFields = ["proof_proposal", "proof_proposal_response"]),
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
                if (!writer)
                    writer = $Writer.create();
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConsensusMessageHeader.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.ConsensusMessageHeader} ConsensusMessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ConsensusMessageHeader.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
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
                    return object;
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
                case "MESSAGE_TYPE_PROOF_PROPOSAL_RESPONSE":
                case 2:
                    message.type = 2;
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
         * @property {number} MESSAGE_TYPE_PROOF_PROPOSAL_RESPONSE=2 MESSAGE_TYPE_PROOF_PROPOSAL_RESPONSE value
         */
        v1.MessageType = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "MESSAGE_TYPE_UNSPECIFIED"] = 0;
            values[valuesById[1] = "MESSAGE_TYPE_PROOF_PROPOSAL"] = 1;
            values[valuesById[2] = "MESSAGE_TYPE_PROOF_PROPOSAL_RESPONSE"] = 2;
            return values;
        })();

        v1.ProofProposal = (function() {

            /**
             * Properties of a ProofProposal.
             * @memberof consensus.v1
             * @interface IProofProposal
             * @property {number|null} [protocol_version] ProofProposal protocol_version
             * @property {number|null} [network_id] ProofProposal network_id
             * @property {number|Long|null} [epoch] ProofProposal epoch
             * @property {Uint8Array|null} [previous_epoch_record_hash] ProofProposal previous_epoch_record_hash
             * @property {Uint8Array|null} [proposer] ProofProposal proposer
             * @property {Uint8Array|null} [vdf_parameters_hash] ProofProposal vdf_parameters_hash
             * @property {Uint8Array|null} [vdf_proof] ProofProposal vdf_proof
             * @property {Uint8Array|null} [signature] ProofProposal signature
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
             * ProofProposal protocol_version.
             * @member {number} protocol_version
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.protocol_version = 0;

            /**
             * ProofProposal network_id.
             * @member {number} network_id
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.network_id = 0;

            /**
             * ProofProposal epoch.
             * @member {number|Long} epoch
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.epoch = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ProofProposal previous_epoch_record_hash.
             * @member {Uint8Array} previous_epoch_record_hash
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.previous_epoch_record_hash = $util.newBuffer([]);

            /**
             * ProofProposal proposer.
             * @member {Uint8Array} proposer
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.proposer = $util.newBuffer([]);

            /**
             * ProofProposal vdf_parameters_hash.
             * @member {Uint8Array} vdf_parameters_hash
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.vdf_parameters_hash = $util.newBuffer([]);

            /**
             * ProofProposal vdf_proof.
             * @member {Uint8Array} vdf_proof
             * @memberof consensus.v1.ProofProposal
             * @instance
             */
            ProofProposal.prototype.vdf_proof = $util.newBuffer([]);

            /**
             * ProofProposal signature.
             * @member {Uint8Array} signature
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
                if (!writer)
                    writer = $Writer.create();
                if (message.protocol_version != null && Object.hasOwnProperty.call(message, "protocol_version"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.protocol_version);
                if (message.network_id != null && Object.hasOwnProperty.call(message, "network_id"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.network_id);
                if (message.epoch != null && Object.hasOwnProperty.call(message, "epoch"))
                    writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.epoch);
                if (message.previous_epoch_record_hash != null && Object.hasOwnProperty.call(message, "previous_epoch_record_hash"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.previous_epoch_record_hash);
                if (message.proposer != null && Object.hasOwnProperty.call(message, "proposer"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.proposer);
                if (message.vdf_parameters_hash != null && Object.hasOwnProperty.call(message, "vdf_parameters_hash"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.vdf_parameters_hash);
                if (message.vdf_proof != null && Object.hasOwnProperty.call(message, "vdf_proof"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.vdf_proof);
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofProposal} ProofProposal
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposal.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofProposal();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.protocol_version = reader.uint32();
                            break;
                        }
                    case 2: {
                            message.network_id = reader.uint32();
                            break;
                        }
                    case 3: {
                            message.epoch = reader.uint64();
                            break;
                        }
                    case 4: {
                            message.previous_epoch_record_hash = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.proposer = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.vdf_parameters_hash = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.vdf_proof = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.signature = reader.bytes();
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofProposal} ProofProposal
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposal.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
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
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    if (!$util.isInteger(message.protocol_version))
                        return "protocol_version: integer expected";
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    if (!$util.isInteger(message.network_id))
                        return "network_id: integer expected";
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (!$util.isInteger(message.epoch) && !(message.epoch && $util.isInteger(message.epoch.low) && $util.isInteger(message.epoch.high)))
                        return "epoch: integer|Long expected";
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    if (!(message.previous_epoch_record_hash && typeof message.previous_epoch_record_hash.length === "number" || $util.isString(message.previous_epoch_record_hash)))
                        return "previous_epoch_record_hash: buffer expected";
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    if (!(message.proposer && typeof message.proposer.length === "number" || $util.isString(message.proposer)))
                        return "proposer: buffer expected";
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    if (!(message.vdf_parameters_hash && typeof message.vdf_parameters_hash.length === "number" || $util.isString(message.vdf_parameters_hash)))
                        return "vdf_parameters_hash: buffer expected";
                if (message.vdf_proof != null && message.hasOwnProperty("vdf_proof"))
                    if (!(message.vdf_proof && typeof message.vdf_proof.length === "number" || $util.isString(message.vdf_proof)))
                        return "vdf_proof: buffer expected";
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
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
                    return object;
                var message = new $root.consensus.v1.ProofProposal();
                if (object.protocol_version != null)
                    message.protocol_version = object.protocol_version >>> 0;
                if (object.network_id != null)
                    message.network_id = object.network_id >>> 0;
                if (object.epoch != null)
                    if ($util.Long)
                        (message.epoch = $util.Long.fromValue(object.epoch)).unsigned = true;
                    else if (typeof object.epoch === "string")
                        message.epoch = parseInt(object.epoch, 10);
                    else if (typeof object.epoch === "number")
                        message.epoch = object.epoch;
                    else if (typeof object.epoch === "object")
                        message.epoch = new $util.LongBits(object.epoch.low >>> 0, object.epoch.high >>> 0).toNumber(true);
                if (object.previous_epoch_record_hash != null)
                    if (typeof object.previous_epoch_record_hash === "string")
                        $util.base64.decode(object.previous_epoch_record_hash, message.previous_epoch_record_hash = $util.newBuffer($util.base64.length(object.previous_epoch_record_hash)), 0);
                    else if (object.previous_epoch_record_hash.length >= 0)
                        message.previous_epoch_record_hash = object.previous_epoch_record_hash;
                if (object.proposer != null)
                    if (typeof object.proposer === "string")
                        $util.base64.decode(object.proposer, message.proposer = $util.newBuffer($util.base64.length(object.proposer)), 0);
                    else if (object.proposer.length >= 0)
                        message.proposer = object.proposer;
                if (object.vdf_parameters_hash != null)
                    if (typeof object.vdf_parameters_hash === "string")
                        $util.base64.decode(object.vdf_parameters_hash, message.vdf_parameters_hash = $util.newBuffer($util.base64.length(object.vdf_parameters_hash)), 0);
                    else if (object.vdf_parameters_hash.length >= 0)
                        message.vdf_parameters_hash = object.vdf_parameters_hash;
                if (object.vdf_proof != null)
                    if (typeof object.vdf_proof === "string")
                        $util.base64.decode(object.vdf_proof, message.vdf_proof = $util.newBuffer($util.base64.length(object.vdf_proof)), 0);
                    else if (object.vdf_proof.length >= 0)
                        message.vdf_proof = object.vdf_proof;
                if (object.signature != null)
                    if (typeof object.signature === "string")
                        $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                    else if (object.signature.length >= 0)
                        message.signature = object.signature;
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
                    object.protocol_version = 0;
                    object.network_id = 0;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.epoch = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.epoch = options.longs === String ? "0" : 0;
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
                        object.vdf_parameters_hash = "";
                    else {
                        object.vdf_parameters_hash = [];
                        if (options.bytes !== Array)
                            object.vdf_parameters_hash = $util.newBuffer(object.vdf_parameters_hash);
                    }
                    if (options.bytes === String)
                        object.vdf_proof = "";
                    else {
                        object.vdf_proof = [];
                        if (options.bytes !== Array)
                            object.vdf_proof = $util.newBuffer(object.vdf_proof);
                    }
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                }
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    object.protocol_version = message.protocol_version;
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    object.network_id = message.network_id;
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (typeof message.epoch === "number")
                        object.epoch = options.longs === String ? String(message.epoch) : message.epoch;
                    else
                        object.epoch = options.longs === String ? $util.Long.prototype.toString.call(message.epoch) : options.longs === Number ? new $util.LongBits(message.epoch.low >>> 0, message.epoch.high >>> 0).toNumber(true) : message.epoch;
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    object.previous_epoch_record_hash = options.bytes === String ? $util.base64.encode(message.previous_epoch_record_hash, 0, message.previous_epoch_record_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.previous_epoch_record_hash) : message.previous_epoch_record_hash;
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    object.proposer = options.bytes === String ? $util.base64.encode(message.proposer, 0, message.proposer.length) : options.bytes === Array ? Array.prototype.slice.call(message.proposer) : message.proposer;
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    object.vdf_parameters_hash = options.bytes === String ? $util.base64.encode(message.vdf_parameters_hash, 0, message.vdf_parameters_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.vdf_parameters_hash) : message.vdf_parameters_hash;
                if (message.vdf_proof != null && message.hasOwnProperty("vdf_proof"))
                    object.vdf_proof = options.bytes === String ? $util.base64.encode(message.vdf_proof, 0, message.vdf_proof.length) : options.bytes === Array ? Array.prototype.slice.call(message.vdf_proof) : message.vdf_proof;
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
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

        v1.ProofChallengeData = (function() {

            /**
             * Properties of a ProofChallengeData.
             * @memberof consensus.v1
             * @interface IProofChallengeData
             * @property {number|null} [protocol_version] ProofChallengeData protocol_version
             * @property {number|null} [network_id] ProofChallengeData network_id
             * @property {number|Long|null} [epoch] ProofChallengeData epoch
             * @property {Uint8Array|null} [previous_epoch_record_hash] ProofChallengeData previous_epoch_record_hash
             * @property {Uint8Array|null} [proposer] ProofChallengeData proposer
             * @property {Uint8Array|null} [vdf_parameters_hash] ProofChallengeData vdf_parameters_hash
             */

            /**
             * Constructs a new ProofChallengeData.
             * @memberof consensus.v1
             * @classdesc Represents a ProofChallengeData.
             * @implements IProofChallengeData
             * @constructor
             * @param {consensus.v1.IProofChallengeData=} [properties] Properties to set
             */
            function ProofChallengeData(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * ProofChallengeData protocol_version.
             * @member {number} protocol_version
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.protocol_version = 0;

            /**
             * ProofChallengeData network_id.
             * @member {number} network_id
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.network_id = 0;

            /**
             * ProofChallengeData epoch.
             * @member {number|Long} epoch
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.epoch = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * ProofChallengeData previous_epoch_record_hash.
             * @member {Uint8Array} previous_epoch_record_hash
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.previous_epoch_record_hash = $util.newBuffer([]);

            /**
             * ProofChallengeData proposer.
             * @member {Uint8Array} proposer
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.proposer = $util.newBuffer([]);

            /**
             * ProofChallengeData vdf_parameters_hash.
             * @member {Uint8Array} vdf_parameters_hash
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             */
            ProofChallengeData.prototype.vdf_parameters_hash = $util.newBuffer([]);

            /**
             * Creates a new ProofChallengeData instance using the specified properties.
             * @function create
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {consensus.v1.IProofChallengeData=} [properties] Properties to set
             * @returns {consensus.v1.ProofChallengeData} ProofChallengeData instance
             */
            ProofChallengeData.create = function create(properties) {
                return new ProofChallengeData(properties);
            };

            /**
             * Encodes the specified ProofChallengeData message. Does not implicitly {@link consensus.v1.ProofChallengeData.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {consensus.v1.IProofChallengeData} message ProofChallengeData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofChallengeData.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.protocol_version != null && Object.hasOwnProperty.call(message, "protocol_version"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.protocol_version);
                if (message.network_id != null && Object.hasOwnProperty.call(message, "network_id"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.network_id);
                if (message.epoch != null && Object.hasOwnProperty.call(message, "epoch"))
                    writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.epoch);
                if (message.previous_epoch_record_hash != null && Object.hasOwnProperty.call(message, "previous_epoch_record_hash"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.previous_epoch_record_hash);
                if (message.proposer != null && Object.hasOwnProperty.call(message, "proposer"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.proposer);
                if (message.vdf_parameters_hash != null && Object.hasOwnProperty.call(message, "vdf_parameters_hash"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.vdf_parameters_hash);
                return writer;
            };

            /**
             * Encodes the specified ProofChallengeData message, length delimited. Does not implicitly {@link consensus.v1.ProofChallengeData.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {consensus.v1.IProofChallengeData} message ProofChallengeData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            ProofChallengeData.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a ProofChallengeData message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofChallengeData} ProofChallengeData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofChallengeData.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofChallengeData();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.protocol_version = reader.uint32();
                            break;
                        }
                    case 2: {
                            message.network_id = reader.uint32();
                            break;
                        }
                    case 3: {
                            message.epoch = reader.uint64();
                            break;
                        }
                    case 4: {
                            message.previous_epoch_record_hash = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.proposer = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.vdf_parameters_hash = reader.bytes();
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
             * Decodes a ProofChallengeData message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofChallengeData} ProofChallengeData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofChallengeData.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a ProofChallengeData message.
             * @function verify
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            ProofChallengeData.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    if (!$util.isInteger(message.protocol_version))
                        return "protocol_version: integer expected";
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    if (!$util.isInteger(message.network_id))
                        return "network_id: integer expected";
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (!$util.isInteger(message.epoch) && !(message.epoch && $util.isInteger(message.epoch.low) && $util.isInteger(message.epoch.high)))
                        return "epoch: integer|Long expected";
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    if (!(message.previous_epoch_record_hash && typeof message.previous_epoch_record_hash.length === "number" || $util.isString(message.previous_epoch_record_hash)))
                        return "previous_epoch_record_hash: buffer expected";
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    if (!(message.proposer && typeof message.proposer.length === "number" || $util.isString(message.proposer)))
                        return "proposer: buffer expected";
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    if (!(message.vdf_parameters_hash && typeof message.vdf_parameters_hash.length === "number" || $util.isString(message.vdf_parameters_hash)))
                        return "vdf_parameters_hash: buffer expected";
                return null;
            };

            /**
             * Creates a ProofChallengeData message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.ProofChallengeData} ProofChallengeData
             */
            ProofChallengeData.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.ProofChallengeData)
                    return object;
                var message = new $root.consensus.v1.ProofChallengeData();
                if (object.protocol_version != null)
                    message.protocol_version = object.protocol_version >>> 0;
                if (object.network_id != null)
                    message.network_id = object.network_id >>> 0;
                if (object.epoch != null)
                    if ($util.Long)
                        (message.epoch = $util.Long.fromValue(object.epoch)).unsigned = true;
                    else if (typeof object.epoch === "string")
                        message.epoch = parseInt(object.epoch, 10);
                    else if (typeof object.epoch === "number")
                        message.epoch = object.epoch;
                    else if (typeof object.epoch === "object")
                        message.epoch = new $util.LongBits(object.epoch.low >>> 0, object.epoch.high >>> 0).toNumber(true);
                if (object.previous_epoch_record_hash != null)
                    if (typeof object.previous_epoch_record_hash === "string")
                        $util.base64.decode(object.previous_epoch_record_hash, message.previous_epoch_record_hash = $util.newBuffer($util.base64.length(object.previous_epoch_record_hash)), 0);
                    else if (object.previous_epoch_record_hash.length >= 0)
                        message.previous_epoch_record_hash = object.previous_epoch_record_hash;
                if (object.proposer != null)
                    if (typeof object.proposer === "string")
                        $util.base64.decode(object.proposer, message.proposer = $util.newBuffer($util.base64.length(object.proposer)), 0);
                    else if (object.proposer.length >= 0)
                        message.proposer = object.proposer;
                if (object.vdf_parameters_hash != null)
                    if (typeof object.vdf_parameters_hash === "string")
                        $util.base64.decode(object.vdf_parameters_hash, message.vdf_parameters_hash = $util.newBuffer($util.base64.length(object.vdf_parameters_hash)), 0);
                    else if (object.vdf_parameters_hash.length >= 0)
                        message.vdf_parameters_hash = object.vdf_parameters_hash;
                return message;
            };

            /**
             * Creates a plain object from a ProofChallengeData message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {consensus.v1.ProofChallengeData} message ProofChallengeData
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            ProofChallengeData.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.protocol_version = 0;
                    object.network_id = 0;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.epoch = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.epoch = options.longs === String ? "0" : 0;
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
                        object.vdf_parameters_hash = "";
                    else {
                        object.vdf_parameters_hash = [];
                        if (options.bytes !== Array)
                            object.vdf_parameters_hash = $util.newBuffer(object.vdf_parameters_hash);
                    }
                }
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    object.protocol_version = message.protocol_version;
                if (message.network_id != null && message.hasOwnProperty("network_id"))
                    object.network_id = message.network_id;
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (typeof message.epoch === "number")
                        object.epoch = options.longs === String ? String(message.epoch) : message.epoch;
                    else
                        object.epoch = options.longs === String ? $util.Long.prototype.toString.call(message.epoch) : options.longs === Number ? new $util.LongBits(message.epoch.low >>> 0, message.epoch.high >>> 0).toNumber(true) : message.epoch;
                if (message.previous_epoch_record_hash != null && message.hasOwnProperty("previous_epoch_record_hash"))
                    object.previous_epoch_record_hash = options.bytes === String ? $util.base64.encode(message.previous_epoch_record_hash, 0, message.previous_epoch_record_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.previous_epoch_record_hash) : message.previous_epoch_record_hash;
                if (message.proposer != null && message.hasOwnProperty("proposer"))
                    object.proposer = options.bytes === String ? $util.base64.encode(message.proposer, 0, message.proposer.length) : options.bytes === Array ? Array.prototype.slice.call(message.proposer) : message.proposer;
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    object.vdf_parameters_hash = options.bytes === String ? $util.base64.encode(message.vdf_parameters_hash, 0, message.vdf_parameters_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.vdf_parameters_hash) : message.vdf_parameters_hash;
                return object;
            };

            /**
             * Converts this ProofChallengeData to JSON.
             * @function toJSON
             * @memberof consensus.v1.ProofChallengeData
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            ProofChallengeData.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for ProofChallengeData
             * @function getTypeUrl
             * @memberof consensus.v1.ProofChallengeData
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            ProofChallengeData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.ProofChallengeData";
            };

            return ProofChallengeData;
        })();

        v1.ProofProposalResponse = (function() {

            /**
             * Properties of a ProofProposalResponse.
             * @memberof consensus.v1
             * @interface IProofProposalResponse
             * @property {Uint8Array|null} [member_id] ProofProposalResponse member_id
             * @property {Uint8Array|null} [signature] ProofProposalResponse signature
             * @property {consensus.v1.ResultCode|null} [result] ProofProposalResponse result
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
             * ProofProposalResponse member_id.
             * @member {Uint8Array} member_id
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.member_id = $util.newBuffer([]);

            /**
             * ProofProposalResponse signature.
             * @member {Uint8Array} signature
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.signature = $util.newBuffer([]);

            /**
             * ProofProposalResponse result.
             * @member {consensus.v1.ResultCode} result
             * @memberof consensus.v1.ProofProposalResponse
             * @instance
             */
            ProofProposalResponse.prototype.result = 0;

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
                if (!writer)
                    writer = $Writer.create();
                if (message.member_id != null && Object.hasOwnProperty.call(message, "member_id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.member_id);
                if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.signature);
                if (message.result != null && Object.hasOwnProperty.call(message, "result"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.result);
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.ProofProposalResponse();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.member_id = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.signature = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.result = reader.int32();
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
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.ProofProposalResponse} ProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            ProofProposalResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
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
                if (message.member_id != null && message.hasOwnProperty("member_id"))
                    if (!(message.member_id && typeof message.member_id.length === "number" || $util.isString(message.member_id)))
                        return "member_id: buffer expected";
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
                        return "signature: buffer expected";
                if (message.result != null && message.hasOwnProperty("result"))
                    switch (message.result) {
                    default:
                        return "result: enum value expected";
                    case 0:
                    case 1:
                        break;
                    }
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
                    return object;
                var message = new $root.consensus.v1.ProofProposalResponse();
                if (object.member_id != null)
                    if (typeof object.member_id === "string")
                        $util.base64.decode(object.member_id, message.member_id = $util.newBuffer($util.base64.length(object.member_id)), 0);
                    else if (object.member_id.length >= 0)
                        message.member_id = object.member_id;
                if (object.signature != null)
                    if (typeof object.signature === "string")
                        $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                    else if (object.signature.length >= 0)
                        message.signature = object.signature;
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
                }
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
                    if (options.bytes === String)
                        object.member_id = "";
                    else {
                        object.member_id = [];
                        if (options.bytes !== Array)
                            object.member_id = $util.newBuffer(object.member_id);
                    }
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                    object.result = options.enums === String ? "RESULT_CODE_UNSPECIFIED" : 0;
                }
                if (message.member_id != null && message.hasOwnProperty("member_id"))
                    object.member_id = options.bytes === String ? $util.base64.encode(message.member_id, 0, message.member_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.member_id) : message.member_id;
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
                if (message.result != null && message.hasOwnProperty("result"))
                    object.result = options.enums === String ? $root.consensus.v1.ResultCode[message.result] === undefined ? message.result : $root.consensus.v1.ResultCode[message.result] : message.result;
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

        /**
         * ResultCode enum.
         * @name consensus.v1.ResultCode
         * @enum {number}
         * @property {number} RESULT_CODE_UNSPECIFIED=0 RESULT_CODE_UNSPECIFIED value
         * @property {number} RESULT_CODE_OK=1 RESULT_CODE_OK value
         */
        v1.ResultCode = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "RESULT_CODE_UNSPECIFIED"] = 0;
            values[valuesById[1] = "RESULT_CODE_OK"] = 1;
            return values;
        })();

        return v1;
    })();

    return consensus;
})();

module.exports = $root;
