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

        v1.MessageHeader = (function() {

            /**
             * Properties of a MessageHeader.
             * @memberof consensus.v1
             * @interface IMessageHeader
             * @property {consensus.v1.MessageType|null} [type] MessageHeader type
             * @property {string|null} [id] MessageHeader id
             * @property {number|Long|null} [timestamp] MessageHeader timestamp
             * @property {consensus.v1.IEpochProofProposalRequest|null} [epoch_proof_proposal_request] MessageHeader epoch_proof_proposal_request
             * @property {consensus.v1.IEpochProofProposalResponse|null} [epoch_proof_proposal_response] MessageHeader epoch_proof_proposal_response
             * @property {Array.<string>|null} [capabilities] MessageHeader capabilities
             */

            /**
             * Constructs a new MessageHeader.
             * @memberof consensus.v1
             * @classdesc Represents a MessageHeader.
             * @implements IMessageHeader
             * @constructor
             * @param {consensus.v1.IMessageHeader=} [properties] Properties to set
             */
            function MessageHeader(properties) {
                this.capabilities = [];
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * MessageHeader type.
             * @member {consensus.v1.MessageType} type
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.type = 0;

            /**
             * MessageHeader id.
             * @member {string} id
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.id = "";

            /**
             * MessageHeader timestamp.
             * @member {number|Long} timestamp
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * MessageHeader epoch_proof_proposal_request.
             * @member {consensus.v1.IEpochProofProposalRequest|null|undefined} epoch_proof_proposal_request
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.epoch_proof_proposal_request = null;

            /**
             * MessageHeader epoch_proof_proposal_response.
             * @member {consensus.v1.IEpochProofProposalResponse|null|undefined} epoch_proof_proposal_response
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.epoch_proof_proposal_response = null;

            /**
             * MessageHeader capabilities.
             * @member {Array.<string>} capabilities
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            MessageHeader.prototype.capabilities = $util.emptyArray;

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * MessageHeader field.
             * @member {"epoch_proof_proposal_request"|"epoch_proof_proposal_response"|undefined} field
             * @memberof consensus.v1.MessageHeader
             * @instance
             */
            Object.defineProperty(MessageHeader.prototype, "field", {
                get: $util.oneOfGetter($oneOfFields = ["epoch_proof_proposal_request", "epoch_proof_proposal_response"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new MessageHeader instance using the specified properties.
             * @function create
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {consensus.v1.IMessageHeader=} [properties] Properties to set
             * @returns {consensus.v1.MessageHeader} MessageHeader instance
             */
            MessageHeader.create = function create(properties) {
                return new MessageHeader(properties);
            };

            /**
             * Encodes the specified MessageHeader message. Does not implicitly {@link consensus.v1.MessageHeader.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {consensus.v1.IMessageHeader} message MessageHeader message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MessageHeader.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.type);
                if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.id);
                if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                    writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.timestamp);
                if (message.epoch_proof_proposal_request != null && Object.hasOwnProperty.call(message, "epoch_proof_proposal_request"))
                    $root.consensus.v1.EpochProofProposalRequest.encode(message.epoch_proof_proposal_request, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                if (message.epoch_proof_proposal_response != null && Object.hasOwnProperty.call(message, "epoch_proof_proposal_response"))
                    $root.consensus.v1.EpochProofProposalResponse.encode(message.epoch_proof_proposal_response, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.capabilities != null && message.capabilities.length)
                    for (var i = 0; i < message.capabilities.length; ++i)
                        writer.uint32(/* id 8, wireType 2 =*/66).string(message.capabilities[i]);
                return writer;
            };

            /**
             * Encodes the specified MessageHeader message, length delimited. Does not implicitly {@link consensus.v1.MessageHeader.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {consensus.v1.IMessageHeader} message MessageHeader message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            MessageHeader.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a MessageHeader message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.MessageHeader} MessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MessageHeader.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.MessageHeader();
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
                            message.id = reader.string();
                            break;
                        }
                    case 3: {
                            message.timestamp = reader.uint64();
                            break;
                        }
                    case 4: {
                            message.epoch_proof_proposal_request = $root.consensus.v1.EpochProofProposalRequest.decode(reader, reader.uint32());
                            break;
                        }
                    case 5: {
                            message.epoch_proof_proposal_response = $root.consensus.v1.EpochProofProposalResponse.decode(reader, reader.uint32());
                            break;
                        }
                    case 8: {
                            if (!(message.capabilities && message.capabilities.length))
                                message.capabilities = [];
                            message.capabilities.push(reader.string());
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
             * Decodes a MessageHeader message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.MessageHeader} MessageHeader
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            MessageHeader.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a MessageHeader message.
             * @function verify
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            MessageHeader.verify = function verify(message) {
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
                    case 5:
                    case 6:
                        break;
                    }
                if (message.id != null && message.hasOwnProperty("id"))
                    if (!$util.isString(message.id))
                        return "id: string expected";
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                        return "timestamp: integer|Long expected";
                if (message.epoch_proof_proposal_request != null && message.hasOwnProperty("epoch_proof_proposal_request")) {
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.EpochProofProposalRequest.verify(message.epoch_proof_proposal_request);
                        if (error)
                            return "epoch_proof_proposal_request." + error;
                    }
                }
                if (message.epoch_proof_proposal_response != null && message.hasOwnProperty("epoch_proof_proposal_response")) {
                    if (properties.field === 1)
                        return "field: multiple values";
                    properties.field = 1;
                    {
                        var error = $root.consensus.v1.EpochProofProposalResponse.verify(message.epoch_proof_proposal_response);
                        if (error)
                            return "epoch_proof_proposal_response." + error;
                    }
                }
                if (message.capabilities != null && message.hasOwnProperty("capabilities")) {
                    if (!Array.isArray(message.capabilities))
                        return "capabilities: array expected";
                    for (var i = 0; i < message.capabilities.length; ++i)
                        if (!$util.isString(message.capabilities[i]))
                            return "capabilities: string[] expected";
                }
                return null;
            };

            /**
             * Creates a MessageHeader message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.MessageHeader} MessageHeader
             */
            MessageHeader.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.MessageHeader)
                    return object;
                var message = new $root.consensus.v1.MessageHeader();
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
                case "MESSAGE_TYPE_LIVENESS_REQUEST":
                case 1:
                    message.type = 1;
                    break;
                case "MESSAGE_TYPE_LIVENESS_RESPONSE":
                case 2:
                    message.type = 2;
                    break;
                case "MESSAGE_TYPE_BROADCAST_TRANSACTION_REQUEST":
                case 3:
                    message.type = 3;
                    break;
                case "MESSAGE_TYPE_BROADCAST_TRANSACTION_RESPONSE":
                case 4:
                    message.type = 4;
                    break;
                case "MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST":
                case 5:
                    message.type = 5;
                    break;
                case "MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE":
                case 6:
                    message.type = 6;
                    break;
                }
                if (object.id != null)
                    message.id = String(object.id);
                if (object.timestamp != null)
                    if ($util.Long)
                        (message.timestamp = $util.Long.fromValue(object.timestamp)).unsigned = true;
                    else if (typeof object.timestamp === "string")
                        message.timestamp = parseInt(object.timestamp, 10);
                    else if (typeof object.timestamp === "number")
                        message.timestamp = object.timestamp;
                    else if (typeof object.timestamp === "object")
                        message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber(true);
                if (object.epoch_proof_proposal_request != null) {
                    if (typeof object.epoch_proof_proposal_request !== "object")
                        throw TypeError(".consensus.v1.MessageHeader.epoch_proof_proposal_request: object expected");
                    message.epoch_proof_proposal_request = $root.consensus.v1.EpochProofProposalRequest.fromObject(object.epoch_proof_proposal_request);
                }
                if (object.epoch_proof_proposal_response != null) {
                    if (typeof object.epoch_proof_proposal_response !== "object")
                        throw TypeError(".consensus.v1.MessageHeader.epoch_proof_proposal_response: object expected");
                    message.epoch_proof_proposal_response = $root.consensus.v1.EpochProofProposalResponse.fromObject(object.epoch_proof_proposal_response);
                }
                if (object.capabilities) {
                    if (!Array.isArray(object.capabilities))
                        throw TypeError(".consensus.v1.MessageHeader.capabilities: array expected");
                    message.capabilities = [];
                    for (var i = 0; i < object.capabilities.length; ++i)
                        message.capabilities[i] = String(object.capabilities[i]);
                }
                return message;
            };

            /**
             * Creates a plain object from a MessageHeader message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {consensus.v1.MessageHeader} message MessageHeader
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            MessageHeader.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.arrays || options.defaults)
                    object.capabilities = [];
                if (options.defaults) {
                    object.type = options.enums === String ? "MESSAGE_TYPE_UNSPECIFIED" : 0;
                    object.id = "";
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.timestamp = options.longs === String ? "0" : 0;
                }
                if (message.type != null && message.hasOwnProperty("type"))
                    object.type = options.enums === String ? $root.consensus.v1.MessageType[message.type] === undefined ? message.type : $root.consensus.v1.MessageType[message.type] : message.type;
                if (message.id != null && message.hasOwnProperty("id"))
                    object.id = message.id;
                if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                    if (typeof message.timestamp === "number")
                        object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                    else
                        object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber(true) : message.timestamp;
                if (message.epoch_proof_proposal_request != null && message.hasOwnProperty("epoch_proof_proposal_request")) {
                    object.epoch_proof_proposal_request = $root.consensus.v1.EpochProofProposalRequest.toObject(message.epoch_proof_proposal_request, options);
                    if (options.oneofs)
                        object.field = "epoch_proof_proposal_request";
                }
                if (message.epoch_proof_proposal_response != null && message.hasOwnProperty("epoch_proof_proposal_response")) {
                    object.epoch_proof_proposal_response = $root.consensus.v1.EpochProofProposalResponse.toObject(message.epoch_proof_proposal_response, options);
                    if (options.oneofs)
                        object.field = "epoch_proof_proposal_response";
                }
                if (message.capabilities && message.capabilities.length) {
                    object.capabilities = [];
                    for (var j = 0; j < message.capabilities.length; ++j)
                        object.capabilities[j] = message.capabilities[j];
                }
                return object;
            };

            /**
             * Converts this MessageHeader to JSON.
             * @function toJSON
             * @memberof consensus.v1.MessageHeader
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            MessageHeader.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for MessageHeader
             * @function getTypeUrl
             * @memberof consensus.v1.MessageHeader
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            MessageHeader.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.MessageHeader";
            };

            return MessageHeader;
        })();

        /**
         * MessageType enum.
         * @name consensus.v1.MessageType
         * @enum {number}
         * @property {number} MESSAGE_TYPE_UNSPECIFIED=0 MESSAGE_TYPE_UNSPECIFIED value
         * @property {number} MESSAGE_TYPE_LIVENESS_REQUEST=1 MESSAGE_TYPE_LIVENESS_REQUEST value
         * @property {number} MESSAGE_TYPE_LIVENESS_RESPONSE=2 MESSAGE_TYPE_LIVENESS_RESPONSE value
         * @property {number} MESSAGE_TYPE_BROADCAST_TRANSACTION_REQUEST=3 MESSAGE_TYPE_BROADCAST_TRANSACTION_REQUEST value
         * @property {number} MESSAGE_TYPE_BROADCAST_TRANSACTION_RESPONSE=4 MESSAGE_TYPE_BROADCAST_TRANSACTION_RESPONSE value
         * @property {number} MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST=5 MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST value
         * @property {number} MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE=6 MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE value
         */
        v1.MessageType = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "MESSAGE_TYPE_UNSPECIFIED"] = 0;
            values[valuesById[1] = "MESSAGE_TYPE_LIVENESS_REQUEST"] = 1;
            values[valuesById[2] = "MESSAGE_TYPE_LIVENESS_RESPONSE"] = 2;
            values[valuesById[3] = "MESSAGE_TYPE_BROADCAST_TRANSACTION_REQUEST"] = 3;
            values[valuesById[4] = "MESSAGE_TYPE_BROADCAST_TRANSACTION_RESPONSE"] = 4;
            values[valuesById[5] = "MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST"] = 5;
            values[valuesById[6] = "MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE"] = 6;
            return values;
        })();

        v1.EpochProofProposalData = (function() {

            /**
             * Properties of an EpochProofProposalData.
             * @memberof consensus.v1
             * @interface IEpochProofProposalData
             * @property {number|null} [protocol_version] EpochProofProposalData protocol_version
             * @property {number|Long|null} [epoch] EpochProofProposalData epoch
             * @property {Uint8Array|null} [previous_epoch_hash] EpochProofProposalData previous_epoch_hash
             * @property {Uint8Array|null} [committed_hash] EpochProofProposalData committed_hash
             * @property {Uint8Array|null} [leader_id] EpochProofProposalData leader_id
             * @property {Uint8Array|null} [vdf_parameters_hash] EpochProofProposalData vdf_parameters_hash
             * @property {Uint8Array|null} [vdf_output] EpochProofProposalData vdf_output
             */

            /**
             * Constructs a new EpochProofProposalData.
             * @memberof consensus.v1
             * @classdesc Represents an EpochProofProposalData.
             * @implements IEpochProofProposalData
             * @constructor
             * @param {consensus.v1.IEpochProofProposalData=} [properties] Properties to set
             */
            function EpochProofProposalData(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochProofProposalData protocol_version.
             * @member {number} protocol_version
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.protocol_version = 0;

            /**
             * EpochProofProposalData epoch.
             * @member {number|Long} epoch
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.epoch = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * EpochProofProposalData previous_epoch_hash.
             * @member {Uint8Array} previous_epoch_hash
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.previous_epoch_hash = $util.newBuffer([]);

            /**
             * EpochProofProposalData committed_hash.
             * @member {Uint8Array} committed_hash
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.committed_hash = $util.newBuffer([]);

            /**
             * EpochProofProposalData leader_id.
             * @member {Uint8Array} leader_id
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.leader_id = $util.newBuffer([]);

            /**
             * EpochProofProposalData vdf_parameters_hash.
             * @member {Uint8Array} vdf_parameters_hash
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.vdf_parameters_hash = $util.newBuffer([]);

            /**
             * EpochProofProposalData vdf_output.
             * @member {Uint8Array} vdf_output
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             */
            EpochProofProposalData.prototype.vdf_output = $util.newBuffer([]);

            /**
             * Creates a new EpochProofProposalData instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {consensus.v1.IEpochProofProposalData=} [properties] Properties to set
             * @returns {consensus.v1.EpochProofProposalData} EpochProofProposalData instance
             */
            EpochProofProposalData.create = function create(properties) {
                return new EpochProofProposalData(properties);
            };

            /**
             * Encodes the specified EpochProofProposalData message. Does not implicitly {@link consensus.v1.EpochProofProposalData.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {consensus.v1.IEpochProofProposalData} message EpochProofProposalData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalData.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.protocol_version != null && Object.hasOwnProperty.call(message, "protocol_version"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.protocol_version);
                if (message.epoch != null && Object.hasOwnProperty.call(message, "epoch"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.epoch);
                if (message.previous_epoch_hash != null && Object.hasOwnProperty.call(message, "previous_epoch_hash"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.previous_epoch_hash);
                if (message.committed_hash != null && Object.hasOwnProperty.call(message, "committed_hash"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.committed_hash);
                if (message.leader_id != null && Object.hasOwnProperty.call(message, "leader_id"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.leader_id);
                if (message.vdf_parameters_hash != null && Object.hasOwnProperty.call(message, "vdf_parameters_hash"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.vdf_parameters_hash);
                if (message.vdf_output != null && Object.hasOwnProperty.call(message, "vdf_output"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.vdf_output);
                return writer;
            };

            /**
             * Encodes the specified EpochProofProposalData message, length delimited. Does not implicitly {@link consensus.v1.EpochProofProposalData.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {consensus.v1.IEpochProofProposalData} message EpochProofProposalData message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalData.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochProofProposalData message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochProofProposalData} EpochProofProposalData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalData.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochProofProposalData();
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
                            message.epoch = reader.uint64();
                            break;
                        }
                    case 3: {
                            message.previous_epoch_hash = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.committed_hash = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.leader_id = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.vdf_parameters_hash = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.vdf_output = reader.bytes();
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
             * Decodes an EpochProofProposalData message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochProofProposalData} EpochProofProposalData
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalData.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochProofProposalData message.
             * @function verify
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochProofProposalData.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    if (!$util.isInteger(message.protocol_version))
                        return "protocol_version: integer expected";
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (!$util.isInteger(message.epoch) && !(message.epoch && $util.isInteger(message.epoch.low) && $util.isInteger(message.epoch.high)))
                        return "epoch: integer|Long expected";
                if (message.previous_epoch_hash != null && message.hasOwnProperty("previous_epoch_hash"))
                    if (!(message.previous_epoch_hash && typeof message.previous_epoch_hash.length === "number" || $util.isString(message.previous_epoch_hash)))
                        return "previous_epoch_hash: buffer expected";
                if (message.committed_hash != null && message.hasOwnProperty("committed_hash"))
                    if (!(message.committed_hash && typeof message.committed_hash.length === "number" || $util.isString(message.committed_hash)))
                        return "committed_hash: buffer expected";
                if (message.leader_id != null && message.hasOwnProperty("leader_id"))
                    if (!(message.leader_id && typeof message.leader_id.length === "number" || $util.isString(message.leader_id)))
                        return "leader_id: buffer expected";
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    if (!(message.vdf_parameters_hash && typeof message.vdf_parameters_hash.length === "number" || $util.isString(message.vdf_parameters_hash)))
                        return "vdf_parameters_hash: buffer expected";
                if (message.vdf_output != null && message.hasOwnProperty("vdf_output"))
                    if (!(message.vdf_output && typeof message.vdf_output.length === "number" || $util.isString(message.vdf_output)))
                        return "vdf_output: buffer expected";
                return null;
            };

            /**
             * Creates an EpochProofProposalData message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochProofProposalData} EpochProofProposalData
             */
            EpochProofProposalData.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochProofProposalData)
                    return object;
                var message = new $root.consensus.v1.EpochProofProposalData();
                if (object.protocol_version != null)
                    message.protocol_version = object.protocol_version >>> 0;
                if (object.epoch != null)
                    if ($util.Long)
                        (message.epoch = $util.Long.fromValue(object.epoch)).unsigned = true;
                    else if (typeof object.epoch === "string")
                        message.epoch = parseInt(object.epoch, 10);
                    else if (typeof object.epoch === "number")
                        message.epoch = object.epoch;
                    else if (typeof object.epoch === "object")
                        message.epoch = new $util.LongBits(object.epoch.low >>> 0, object.epoch.high >>> 0).toNumber(true);
                if (object.previous_epoch_hash != null)
                    if (typeof object.previous_epoch_hash === "string")
                        $util.base64.decode(object.previous_epoch_hash, message.previous_epoch_hash = $util.newBuffer($util.base64.length(object.previous_epoch_hash)), 0);
                    else if (object.previous_epoch_hash.length >= 0)
                        message.previous_epoch_hash = object.previous_epoch_hash;
                if (object.committed_hash != null)
                    if (typeof object.committed_hash === "string")
                        $util.base64.decode(object.committed_hash, message.committed_hash = $util.newBuffer($util.base64.length(object.committed_hash)), 0);
                    else if (object.committed_hash.length >= 0)
                        message.committed_hash = object.committed_hash;
                if (object.leader_id != null)
                    if (typeof object.leader_id === "string")
                        $util.base64.decode(object.leader_id, message.leader_id = $util.newBuffer($util.base64.length(object.leader_id)), 0);
                    else if (object.leader_id.length >= 0)
                        message.leader_id = object.leader_id;
                if (object.vdf_parameters_hash != null)
                    if (typeof object.vdf_parameters_hash === "string")
                        $util.base64.decode(object.vdf_parameters_hash, message.vdf_parameters_hash = $util.newBuffer($util.base64.length(object.vdf_parameters_hash)), 0);
                    else if (object.vdf_parameters_hash.length >= 0)
                        message.vdf_parameters_hash = object.vdf_parameters_hash;
                if (object.vdf_output != null)
                    if (typeof object.vdf_output === "string")
                        $util.base64.decode(object.vdf_output, message.vdf_output = $util.newBuffer($util.base64.length(object.vdf_output)), 0);
                    else if (object.vdf_output.length >= 0)
                        message.vdf_output = object.vdf_output;
                return message;
            };

            /**
             * Creates a plain object from an EpochProofProposalData message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {consensus.v1.EpochProofProposalData} message EpochProofProposalData
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochProofProposalData.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.protocol_version = 0;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.epoch = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.epoch = options.longs === String ? "0" : 0;
                    if (options.bytes === String)
                        object.previous_epoch_hash = "";
                    else {
                        object.previous_epoch_hash = [];
                        if (options.bytes !== Array)
                            object.previous_epoch_hash = $util.newBuffer(object.previous_epoch_hash);
                    }
                    if (options.bytes === String)
                        object.committed_hash = "";
                    else {
                        object.committed_hash = [];
                        if (options.bytes !== Array)
                            object.committed_hash = $util.newBuffer(object.committed_hash);
                    }
                    if (options.bytes === String)
                        object.leader_id = "";
                    else {
                        object.leader_id = [];
                        if (options.bytes !== Array)
                            object.leader_id = $util.newBuffer(object.leader_id);
                    }
                    if (options.bytes === String)
                        object.vdf_parameters_hash = "";
                    else {
                        object.vdf_parameters_hash = [];
                        if (options.bytes !== Array)
                            object.vdf_parameters_hash = $util.newBuffer(object.vdf_parameters_hash);
                    }
                    if (options.bytes === String)
                        object.vdf_output = "";
                    else {
                        object.vdf_output = [];
                        if (options.bytes !== Array)
                            object.vdf_output = $util.newBuffer(object.vdf_output);
                    }
                }
                if (message.protocol_version != null && message.hasOwnProperty("protocol_version"))
                    object.protocol_version = message.protocol_version;
                if (message.epoch != null && message.hasOwnProperty("epoch"))
                    if (typeof message.epoch === "number")
                        object.epoch = options.longs === String ? String(message.epoch) : message.epoch;
                    else
                        object.epoch = options.longs === String ? $util.Long.prototype.toString.call(message.epoch) : options.longs === Number ? new $util.LongBits(message.epoch.low >>> 0, message.epoch.high >>> 0).toNumber(true) : message.epoch;
                if (message.previous_epoch_hash != null && message.hasOwnProperty("previous_epoch_hash"))
                    object.previous_epoch_hash = options.bytes === String ? $util.base64.encode(message.previous_epoch_hash, 0, message.previous_epoch_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.previous_epoch_hash) : message.previous_epoch_hash;
                if (message.committed_hash != null && message.hasOwnProperty("committed_hash"))
                    object.committed_hash = options.bytes === String ? $util.base64.encode(message.committed_hash, 0, message.committed_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.committed_hash) : message.committed_hash;
                if (message.leader_id != null && message.hasOwnProperty("leader_id"))
                    object.leader_id = options.bytes === String ? $util.base64.encode(message.leader_id, 0, message.leader_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.leader_id) : message.leader_id;
                if (message.vdf_parameters_hash != null && message.hasOwnProperty("vdf_parameters_hash"))
                    object.vdf_parameters_hash = options.bytes === String ? $util.base64.encode(message.vdf_parameters_hash, 0, message.vdf_parameters_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.vdf_parameters_hash) : message.vdf_parameters_hash;
                if (message.vdf_output != null && message.hasOwnProperty("vdf_output"))
                    object.vdf_output = options.bytes === String ? $util.base64.encode(message.vdf_output, 0, message.vdf_output.length) : options.bytes === Array ? Array.prototype.slice.call(message.vdf_output) : message.vdf_output;
                return object;
            };

            /**
             * Converts this EpochProofProposalData to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochProofProposalData
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochProofProposalData.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochProofProposalData
             * @function getTypeUrl
             * @memberof consensus.v1.EpochProofProposalData
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochProofProposalData.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochProofProposalData";
            };

            return EpochProofProposalData;
        })();

        v1.EpochProofProposalRequest = (function() {

            /**
             * Properties of an EpochProofProposalRequest.
             * @memberof consensus.v1
             * @interface IEpochProofProposalRequest
             * @property {consensus.v1.IEpochProofProposalData|null} [data] EpochProofProposalRequest data
             * @property {Uint8Array|null} [hash] EpochProofProposalRequest hash
             * @property {Uint8Array|null} [signature] EpochProofProposalRequest signature
             */

            /**
             * Constructs a new EpochProofProposalRequest.
             * @memberof consensus.v1
             * @classdesc Represents an EpochProofProposalRequest.
             * @implements IEpochProofProposalRequest
             * @constructor
             * @param {consensus.v1.IEpochProofProposalRequest=} [properties] Properties to set
             */
            function EpochProofProposalRequest(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochProofProposalRequest data.
             * @member {consensus.v1.IEpochProofProposalData|null|undefined} data
             * @memberof consensus.v1.EpochProofProposalRequest
             * @instance
             */
            EpochProofProposalRequest.prototype.data = null;

            /**
             * EpochProofProposalRequest hash.
             * @member {Uint8Array} hash
             * @memberof consensus.v1.EpochProofProposalRequest
             * @instance
             */
            EpochProofProposalRequest.prototype.hash = $util.newBuffer([]);

            /**
             * EpochProofProposalRequest signature.
             * @member {Uint8Array} signature
             * @memberof consensus.v1.EpochProofProposalRequest
             * @instance
             */
            EpochProofProposalRequest.prototype.signature = $util.newBuffer([]);

            /**
             * Creates a new EpochProofProposalRequest instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {consensus.v1.IEpochProofProposalRequest=} [properties] Properties to set
             * @returns {consensus.v1.EpochProofProposalRequest} EpochProofProposalRequest instance
             */
            EpochProofProposalRequest.create = function create(properties) {
                return new EpochProofProposalRequest(properties);
            };

            /**
             * Encodes the specified EpochProofProposalRequest message. Does not implicitly {@link consensus.v1.EpochProofProposalRequest.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {consensus.v1.IEpochProofProposalRequest} message EpochProofProposalRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalRequest.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                    $root.consensus.v1.EpochProofProposalData.encode(message.data, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                if (message.hash != null && Object.hasOwnProperty.call(message, "hash"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.hash);
                if (message.signature != null && Object.hasOwnProperty.call(message, "signature"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.signature);
                return writer;
            };

            /**
             * Encodes the specified EpochProofProposalRequest message, length delimited. Does not implicitly {@link consensus.v1.EpochProofProposalRequest.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {consensus.v1.IEpochProofProposalRequest} message EpochProofProposalRequest message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalRequest.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochProofProposalRequest message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochProofProposalRequest} EpochProofProposalRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalRequest.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochProofProposalRequest();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.data = $root.consensus.v1.EpochProofProposalData.decode(reader, reader.uint32());
                            break;
                        }
                    case 2: {
                            message.hash = reader.bytes();
                            break;
                        }
                    case 3: {
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
             * Decodes an EpochProofProposalRequest message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochProofProposalRequest} EpochProofProposalRequest
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalRequest.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochProofProposalRequest message.
             * @function verify
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochProofProposalRequest.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.data != null && message.hasOwnProperty("data")) {
                    var error = $root.consensus.v1.EpochProofProposalData.verify(message.data);
                    if (error)
                        return "data." + error;
                }
                if (message.hash != null && message.hasOwnProperty("hash"))
                    if (!(message.hash && typeof message.hash.length === "number" || $util.isString(message.hash)))
                        return "hash: buffer expected";
                if (message.signature != null && message.hasOwnProperty("signature"))
                    if (!(message.signature && typeof message.signature.length === "number" || $util.isString(message.signature)))
                        return "signature: buffer expected";
                return null;
            };

            /**
             * Creates an EpochProofProposalRequest message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochProofProposalRequest} EpochProofProposalRequest
             */
            EpochProofProposalRequest.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochProofProposalRequest)
                    return object;
                var message = new $root.consensus.v1.EpochProofProposalRequest();
                if (object.data != null) {
                    if (typeof object.data !== "object")
                        throw TypeError(".consensus.v1.EpochProofProposalRequest.data: object expected");
                    message.data = $root.consensus.v1.EpochProofProposalData.fromObject(object.data);
                }
                if (object.hash != null)
                    if (typeof object.hash === "string")
                        $util.base64.decode(object.hash, message.hash = $util.newBuffer($util.base64.length(object.hash)), 0);
                    else if (object.hash.length >= 0)
                        message.hash = object.hash;
                if (object.signature != null)
                    if (typeof object.signature === "string")
                        $util.base64.decode(object.signature, message.signature = $util.newBuffer($util.base64.length(object.signature)), 0);
                    else if (object.signature.length >= 0)
                        message.signature = object.signature;
                return message;
            };

            /**
             * Creates a plain object from an EpochProofProposalRequest message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {consensus.v1.EpochProofProposalRequest} message EpochProofProposalRequest
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochProofProposalRequest.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.data = null;
                    if (options.bytes === String)
                        object.hash = "";
                    else {
                        object.hash = [];
                        if (options.bytes !== Array)
                            object.hash = $util.newBuffer(object.hash);
                    }
                    if (options.bytes === String)
                        object.signature = "";
                    else {
                        object.signature = [];
                        if (options.bytes !== Array)
                            object.signature = $util.newBuffer(object.signature);
                    }
                }
                if (message.data != null && message.hasOwnProperty("data"))
                    object.data = $root.consensus.v1.EpochProofProposalData.toObject(message.data, options);
                if (message.hash != null && message.hasOwnProperty("hash"))
                    object.hash = options.bytes === String ? $util.base64.encode(message.hash, 0, message.hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.hash) : message.hash;
                if (message.signature != null && message.hasOwnProperty("signature"))
                    object.signature = options.bytes === String ? $util.base64.encode(message.signature, 0, message.signature.length) : options.bytes === Array ? Array.prototype.slice.call(message.signature) : message.signature;
                return object;
            };

            /**
             * Converts this EpochProofProposalRequest to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochProofProposalRequest
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochProofProposalRequest.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochProofProposalRequest
             * @function getTypeUrl
             * @memberof consensus.v1.EpochProofProposalRequest
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochProofProposalRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochProofProposalRequest";
            };

            return EpochProofProposalRequest;
        })();

        v1.EpochProofProposalResponse = (function() {

            /**
             * Properties of an EpochProofProposalResponse.
             * @memberof consensus.v1
             * @interface IEpochProofProposalResponse
             * @property {Uint8Array|null} [member_id] EpochProofProposalResponse member_id
             * @property {Uint8Array|null} [signature] EpochProofProposalResponse signature
             * @property {consensus.v1.ResultCode|null} [result] EpochProofProposalResponse result
             */

            /**
             * Constructs a new EpochProofProposalResponse.
             * @memberof consensus.v1
             * @classdesc Represents an EpochProofProposalResponse.
             * @implements IEpochProofProposalResponse
             * @constructor
             * @param {consensus.v1.IEpochProofProposalResponse=} [properties] Properties to set
             */
            function EpochProofProposalResponse(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * EpochProofProposalResponse member_id.
             * @member {Uint8Array} member_id
             * @memberof consensus.v1.EpochProofProposalResponse
             * @instance
             */
            EpochProofProposalResponse.prototype.member_id = $util.newBuffer([]);

            /**
             * EpochProofProposalResponse signature.
             * @member {Uint8Array} signature
             * @memberof consensus.v1.EpochProofProposalResponse
             * @instance
             */
            EpochProofProposalResponse.prototype.signature = $util.newBuffer([]);

            /**
             * EpochProofProposalResponse result.
             * @member {consensus.v1.ResultCode} result
             * @memberof consensus.v1.EpochProofProposalResponse
             * @instance
             */
            EpochProofProposalResponse.prototype.result = 62;

            /**
             * Creates a new EpochProofProposalResponse instance using the specified properties.
             * @function create
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {consensus.v1.IEpochProofProposalResponse=} [properties] Properties to set
             * @returns {consensus.v1.EpochProofProposalResponse} EpochProofProposalResponse instance
             */
            EpochProofProposalResponse.create = function create(properties) {
                return new EpochProofProposalResponse(properties);
            };

            /**
             * Encodes the specified EpochProofProposalResponse message. Does not implicitly {@link consensus.v1.EpochProofProposalResponse.verify|verify} messages.
             * @function encode
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {consensus.v1.IEpochProofProposalResponse} message EpochProofProposalResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalResponse.encode = function encode(message, writer) {
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
             * Encodes the specified EpochProofProposalResponse message, length delimited. Does not implicitly {@link consensus.v1.EpochProofProposalResponse.verify|verify} messages.
             * @function encodeDelimited
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {consensus.v1.IEpochProofProposalResponse} message EpochProofProposalResponse message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            EpochProofProposalResponse.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an EpochProofProposalResponse message from the specified reader or buffer.
             * @function decode
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {consensus.v1.EpochProofProposalResponse} EpochProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalResponse.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.consensus.v1.EpochProofProposalResponse();
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
             * Decodes an EpochProofProposalResponse message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {consensus.v1.EpochProofProposalResponse} EpochProofProposalResponse
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            EpochProofProposalResponse.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an EpochProofProposalResponse message.
             * @function verify
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            EpochProofProposalResponse.verify = function verify(message) {
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
                    case 62:
                        break;
                    }
                return null;
            };

            /**
             * Creates an EpochProofProposalResponse message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {consensus.v1.EpochProofProposalResponse} EpochProofProposalResponse
             */
            EpochProofProposalResponse.fromObject = function fromObject(object) {
                if (object instanceof $root.consensus.v1.EpochProofProposalResponse)
                    return object;
                var message = new $root.consensus.v1.EpochProofProposalResponse();
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
                case "RESULT_CODE_INVALID_EPOCH":
                case 62:
                    message.result = 62;
                    break;
                }
                return message;
            };

            /**
             * Creates a plain object from an EpochProofProposalResponse message. Also converts values to other types if specified.
             * @function toObject
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {consensus.v1.EpochProofProposalResponse} message EpochProofProposalResponse
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            EpochProofProposalResponse.toObject = function toObject(message, options) {
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
                    object.result = options.enums === String ? "RESULT_CODE_INVALID_EPOCH" : 62;
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
             * Converts this EpochProofProposalResponse to JSON.
             * @function toJSON
             * @memberof consensus.v1.EpochProofProposalResponse
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            EpochProofProposalResponse.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for EpochProofProposalResponse
             * @function getTypeUrl
             * @memberof consensus.v1.EpochProofProposalResponse
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            EpochProofProposalResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/consensus.v1.EpochProofProposalResponse";
            };

            return EpochProofProposalResponse;
        })();

        /**
         * ResultCode enum.
         * @name consensus.v1.ResultCode
         * @enum {number}
         * @property {number} RESULT_CODE_INVALID_EPOCH=62 RESULT_CODE_INVALID_EPOCH value
         */
        v1.ResultCode = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[62] = "RESULT_CODE_INVALID_EPOCH"] = 62;
            return values;
        })();

        return v1;
    })();

    return consensus;
})();

module.exports = $root;
