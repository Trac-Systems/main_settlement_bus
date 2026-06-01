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
            MessageHeader.prototype.type = 5;

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
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.capabilities[i]);
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
                    case 6: {
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
                    object.type = options.enums === String ? "MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST" : 5;
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
         * @property {number} MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST=5 MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_REQUEST value
         * @property {number} MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE=6 MESSAGE_TYPE_EPOCH_PROOF_PROPOSAL_RESPONSE value
         */
        v1.MessageType = (function() {
            var valuesById = {}, values = Object.create(valuesById);
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
            EpochProofProposalResponse.prototype.result = 0;

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
            return values;
        })();

        return v1;
    })();

    return consensus;
})();

module.exports = $root;
