/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";
if (typeof globalThis !== 'undefined' && typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}


var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots.state || ($protobuf.roots.state = {});

$root.state = (function() {

    /**
     * Namespace state.
     * @exports state
     * @namespace
     */
    var state = {};

    /**
     * EscrowStatus enum.
     * @name state.EscrowStatus
     * @enum {number}
     * @property {number} PENDING=0 PENDING value
     * @property {number} CLAIMED=1 CLAIMED value
     * @property {number} REFUNDED=2 REFUNDED value
     */
    state.EscrowStatus = (function() {
        var valuesById = {}, values = Object.create(valuesById);
        values[valuesById[0] = "PENDING"] = 0;
        values[valuesById[1] = "CLAIMED"] = 1;
        values[valuesById[2] = "REFUNDED"] = 2;
        return values;
    })();

    state.EscrowEntry = (function() {

        /**
         * Properties of an EscrowEntry.
         * @memberof state
         * @interface IEscrowEntry
         * @property {number|null} [version] EscrowEntry version
         * @property {state.EscrowStatus|null} [status] EscrowEntry status
         * @property {Uint8Array|null} [amount] EscrowEntry amount
         * @property {Uint8Array|null} [additionalFeeAmount] EscrowEntry additionalFeeAmount
         * @property {Uint8Array|null} [lockerAddress] EscrowEntry lockerAddress
         * @property {Uint8Array|null} [claimRecipientAddress] EscrowEntry claimRecipientAddress
         * @property {Uint8Array|null} [refundRecipientAddress] EscrowEntry refundRecipientAddress
         * @property {Uint8Array|null} [additionalFeeRecipientAddress] EscrowEntry additionalFeeRecipientAddress
         * @property {Uint8Array|null} [lockId] EscrowEntry lockId
         * @property {Uint8Array|null} [hashLock] EscrowEntry hashLock
         * @property {Uint8Array|null} [preimage] EscrowEntry preimage
         * @property {Uint8Array|null} [policyHash] EscrowEntry policyHash
         * @property {Uint8Array|null} [refundEpoch] EscrowEntry refundEpoch
         */

        /**
         * Constructs a new EscrowEntry.
         * @memberof state
         * @classdesc Represents an EscrowEntry.
         * @implements IEscrowEntry
         * @constructor
         * @param {state.IEscrowEntry=} [properties] Properties to set
         */
        function EscrowEntry(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * EscrowEntry version.
         * @member {number} version
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.version = 0;

        /**
         * EscrowEntry status.
         * @member {state.EscrowStatus|null|undefined} status
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.status = null;

        /**
         * EscrowEntry amount.
         * @member {Uint8Array} amount
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.amount = $util.newBuffer([]);

        /**
         * EscrowEntry additionalFeeAmount.
         * @member {Uint8Array} additionalFeeAmount
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.additionalFeeAmount = $util.newBuffer([]);

        /**
         * EscrowEntry lockerAddress.
         * @member {Uint8Array} lockerAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.lockerAddress = $util.newBuffer([]);

        /**
         * EscrowEntry claimRecipientAddress.
         * @member {Uint8Array} claimRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.claimRecipientAddress = $util.newBuffer([]);

        /**
         * EscrowEntry refundRecipientAddress.
         * @member {Uint8Array} refundRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.refundRecipientAddress = $util.newBuffer([]);

        /**
         * EscrowEntry additionalFeeRecipientAddress.
         * @member {Uint8Array|null|undefined} additionalFeeRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.additionalFeeRecipientAddress = null;

        /**
         * EscrowEntry lockId.
         * @member {Uint8Array} lockId
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.lockId = $util.newBuffer([]);

        /**
         * EscrowEntry hashLock.
         * @member {Uint8Array} hashLock
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.hashLock = $util.newBuffer([]);

        /**
         * EscrowEntry preimage.
         * @member {Uint8Array|null|undefined} preimage
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.preimage = null;

        /**
         * EscrowEntry policyHash.
         * @member {Uint8Array|null|undefined} policyHash
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.policyHash = null;

        /**
         * EscrowEntry refundEpoch.
         * @member {Uint8Array} refundEpoch
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.refundEpoch = $util.newBuffer([]);

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(EscrowEntry.prototype, "_status", {
            get: $util.oneOfGetter($oneOfFields = ["status"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(EscrowEntry.prototype, "_additionalFeeRecipientAddress", {
            get: $util.oneOfGetter($oneOfFields = ["additionalFeeRecipientAddress"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(EscrowEntry.prototype, "_preimage", {
            get: $util.oneOfGetter($oneOfFields = ["preimage"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(EscrowEntry.prototype, "_policyHash", {
            get: $util.oneOfGetter($oneOfFields = ["policyHash"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new EscrowEntry instance using the specified properties.
         * @function create
         * @memberof state.EscrowEntry
         * @static
         * @param {state.IEscrowEntry=} [properties] Properties to set
         * @returns {state.EscrowEntry} EscrowEntry instance
         */
        EscrowEntry.create = function create(properties) {
            return new EscrowEntry(properties);
        };

        /**
         * Encodes the specified EscrowEntry message. Does not implicitly {@link state.EscrowEntry.verify|verify} messages.
         * @function encode
         * @memberof state.EscrowEntry
         * @static
         * @param {state.IEscrowEntry} message EscrowEntry message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EscrowEntry.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.version != null && Object.hasOwnProperty.call(message, "version"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.version);
            if (message.status != null && Object.hasOwnProperty.call(message, "status"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.status);
            if (message.amount != null && Object.hasOwnProperty.call(message, "amount"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.amount);
            if (message.additionalFeeAmount != null && Object.hasOwnProperty.call(message, "additionalFeeAmount"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.additionalFeeAmount);
            if (message.lockerAddress != null && Object.hasOwnProperty.call(message, "lockerAddress"))
                writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.lockerAddress);
            if (message.claimRecipientAddress != null && Object.hasOwnProperty.call(message, "claimRecipientAddress"))
                writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.claimRecipientAddress);
            if (message.refundRecipientAddress != null && Object.hasOwnProperty.call(message, "refundRecipientAddress"))
                writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.refundRecipientAddress);
            if (message.additionalFeeRecipientAddress != null && Object.hasOwnProperty.call(message, "additionalFeeRecipientAddress"))
                writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.additionalFeeRecipientAddress);
            if (message.lockId != null && Object.hasOwnProperty.call(message, "lockId"))
                writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.lockId);
            if (message.hashLock != null && Object.hasOwnProperty.call(message, "hashLock"))
                writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.hashLock);
            if (message.preimage != null && Object.hasOwnProperty.call(message, "preimage"))
                writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.preimage);
            if (message.policyHash != null && Object.hasOwnProperty.call(message, "policyHash"))
                writer.uint32(/* id 12, wireType 2 =*/98).bytes(message.policyHash);
            if (message.refundEpoch != null && Object.hasOwnProperty.call(message, "refundEpoch"))
                writer.uint32(/* id 13, wireType 2 =*/106).bytes(message.refundEpoch);
            return writer;
        };

        /**
         * Encodes the specified EscrowEntry message, length delimited. Does not implicitly {@link state.EscrowEntry.verify|verify} messages.
         * @function encodeDelimited
         * @memberof state.EscrowEntry
         * @static
         * @param {state.IEscrowEntry} message EscrowEntry message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        EscrowEntry.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes an EscrowEntry message from the specified reader or buffer.
         * @function decode
         * @memberof state.EscrowEntry
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {state.EscrowEntry} EscrowEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EscrowEntry.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.state.EscrowEntry();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.version = reader.uint32();
                        break;
                    }
                case 2: {
                        message.status = reader.int32();
                        break;
                    }
                case 3: {
                        message.amount = reader.bytes();
                        break;
                    }
                case 4: {
                        message.additionalFeeAmount = reader.bytes();
                        break;
                    }
                case 5: {
                        message.lockerAddress = reader.bytes();
                        break;
                    }
                case 6: {
                        message.claimRecipientAddress = reader.bytes();
                        break;
                    }
                case 7: {
                        message.refundRecipientAddress = reader.bytes();
                        break;
                    }
                case 8: {
                        message.additionalFeeRecipientAddress = reader.bytes();
                        break;
                    }
                case 9: {
                        message.lockId = reader.bytes();
                        break;
                    }
                case 10: {
                        message.hashLock = reader.bytes();
                        break;
                    }
                case 11: {
                        message.preimage = reader.bytes();
                        break;
                    }
                case 12: {
                        message.policyHash = reader.bytes();
                        break;
                    }
                case 13: {
                        message.refundEpoch = reader.bytes();
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
         * Decodes an EscrowEntry message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof state.EscrowEntry
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {state.EscrowEntry} EscrowEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EscrowEntry.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an EscrowEntry message.
         * @function verify
         * @memberof state.EscrowEntry
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        EscrowEntry.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.version != null && message.hasOwnProperty("version"))
                if (!$util.isInteger(message.version))
                    return "version: integer expected";
            if (message.status != null && message.hasOwnProperty("status")) {
                properties._status = 1;
                switch (message.status) {
                default:
                    return "status: enum value expected";
                case 0:
                case 1:
                case 2:
                    break;
                }
            }
            if (message.amount != null && message.hasOwnProperty("amount"))
                if (!(message.amount && typeof message.amount.length === "number" || $util.isString(message.amount)))
                    return "amount: buffer expected";
            if (message.additionalFeeAmount != null && message.hasOwnProperty("additionalFeeAmount"))
                if (!(message.additionalFeeAmount && typeof message.additionalFeeAmount.length === "number" || $util.isString(message.additionalFeeAmount)))
                    return "additionalFeeAmount: buffer expected";
            if (message.lockerAddress != null && message.hasOwnProperty("lockerAddress"))
                if (!(message.lockerAddress && typeof message.lockerAddress.length === "number" || $util.isString(message.lockerAddress)))
                    return "lockerAddress: buffer expected";
            if (message.claimRecipientAddress != null && message.hasOwnProperty("claimRecipientAddress"))
                if (!(message.claimRecipientAddress && typeof message.claimRecipientAddress.length === "number" || $util.isString(message.claimRecipientAddress)))
                    return "claimRecipientAddress: buffer expected";
            if (message.refundRecipientAddress != null && message.hasOwnProperty("refundRecipientAddress"))
                if (!(message.refundRecipientAddress && typeof message.refundRecipientAddress.length === "number" || $util.isString(message.refundRecipientAddress)))
                    return "refundRecipientAddress: buffer expected";
            if (message.additionalFeeRecipientAddress != null && message.hasOwnProperty("additionalFeeRecipientAddress")) {
                properties._additionalFeeRecipientAddress = 1;
                if (!(message.additionalFeeRecipientAddress && typeof message.additionalFeeRecipientAddress.length === "number" || $util.isString(message.additionalFeeRecipientAddress)))
                    return "additionalFeeRecipientAddress: buffer expected";
            }
            if (message.lockId != null && message.hasOwnProperty("lockId"))
                if (!(message.lockId && typeof message.lockId.length === "number" || $util.isString(message.lockId)))
                    return "lockId: buffer expected";
            if (message.hashLock != null && message.hasOwnProperty("hashLock"))
                if (!(message.hashLock && typeof message.hashLock.length === "number" || $util.isString(message.hashLock)))
                    return "hashLock: buffer expected";
            if (message.preimage != null && message.hasOwnProperty("preimage")) {
                properties._preimage = 1;
                if (!(message.preimage && typeof message.preimage.length === "number" || $util.isString(message.preimage)))
                    return "preimage: buffer expected";
            }
            if (message.policyHash != null && message.hasOwnProperty("policyHash")) {
                properties._policyHash = 1;
                if (!(message.policyHash && typeof message.policyHash.length === "number" || $util.isString(message.policyHash)))
                    return "policyHash: buffer expected";
            }
            if (message.refundEpoch != null && message.hasOwnProperty("refundEpoch"))
                if (!(message.refundEpoch && typeof message.refundEpoch.length === "number" || $util.isString(message.refundEpoch)))
                    return "refundEpoch: buffer expected";
            return null;
        };

        /**
         * Creates an EscrowEntry message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof state.EscrowEntry
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {state.EscrowEntry} EscrowEntry
         */
        EscrowEntry.fromObject = function fromObject(object) {
            if (object instanceof $root.state.EscrowEntry)
                return object;
            var message = new $root.state.EscrowEntry();
            if (object.version != null)
                message.version = object.version >>> 0;
            switch (object.status) {
            default:
                if (typeof object.status === "number") {
                    message.status = object.status;
                    break;
                }
                break;
            case "PENDING":
            case 0:
                message.status = 0;
                break;
            case "CLAIMED":
            case 1:
                message.status = 1;
                break;
            case "REFUNDED":
            case 2:
                message.status = 2;
                break;
            }
            if (object.amount != null)
                if (typeof object.amount === "string")
                    $util.base64.decode(object.amount, message.amount = $util.newBuffer($util.base64.length(object.amount)), 0);
                else if (object.amount.length >= 0)
                    message.amount = object.amount;
            if (object.additionalFeeAmount != null)
                if (typeof object.additionalFeeAmount === "string")
                    $util.base64.decode(object.additionalFeeAmount, message.additionalFeeAmount = $util.newBuffer($util.base64.length(object.additionalFeeAmount)), 0);
                else if (object.additionalFeeAmount.length >= 0)
                    message.additionalFeeAmount = object.additionalFeeAmount;
            if (object.lockerAddress != null)
                if (typeof object.lockerAddress === "string")
                    $util.base64.decode(object.lockerAddress, message.lockerAddress = $util.newBuffer($util.base64.length(object.lockerAddress)), 0);
                else if (object.lockerAddress.length >= 0)
                    message.lockerAddress = object.lockerAddress;
            if (object.claimRecipientAddress != null)
                if (typeof object.claimRecipientAddress === "string")
                    $util.base64.decode(object.claimRecipientAddress, message.claimRecipientAddress = $util.newBuffer($util.base64.length(object.claimRecipientAddress)), 0);
                else if (object.claimRecipientAddress.length >= 0)
                    message.claimRecipientAddress = object.claimRecipientAddress;
            if (object.refundRecipientAddress != null)
                if (typeof object.refundRecipientAddress === "string")
                    $util.base64.decode(object.refundRecipientAddress, message.refundRecipientAddress = $util.newBuffer($util.base64.length(object.refundRecipientAddress)), 0);
                else if (object.refundRecipientAddress.length >= 0)
                    message.refundRecipientAddress = object.refundRecipientAddress;
            if (object.additionalFeeRecipientAddress != null)
                if (typeof object.additionalFeeRecipientAddress === "string")
                    $util.base64.decode(object.additionalFeeRecipientAddress, message.additionalFeeRecipientAddress = $util.newBuffer($util.base64.length(object.additionalFeeRecipientAddress)), 0);
                else if (object.additionalFeeRecipientAddress.length >= 0)
                    message.additionalFeeRecipientAddress = object.additionalFeeRecipientAddress;
            if (object.lockId != null)
                if (typeof object.lockId === "string")
                    $util.base64.decode(object.lockId, message.lockId = $util.newBuffer($util.base64.length(object.lockId)), 0);
                else if (object.lockId.length >= 0)
                    message.lockId = object.lockId;
            if (object.hashLock != null)
                if (typeof object.hashLock === "string")
                    $util.base64.decode(object.hashLock, message.hashLock = $util.newBuffer($util.base64.length(object.hashLock)), 0);
                else if (object.hashLock.length >= 0)
                    message.hashLock = object.hashLock;
            if (object.preimage != null)
                if (typeof object.preimage === "string")
                    $util.base64.decode(object.preimage, message.preimage = $util.newBuffer($util.base64.length(object.preimage)), 0);
                else if (object.preimage.length >= 0)
                    message.preimage = object.preimage;
            if (object.policyHash != null)
                if (typeof object.policyHash === "string")
                    $util.base64.decode(object.policyHash, message.policyHash = $util.newBuffer($util.base64.length(object.policyHash)), 0);
                else if (object.policyHash.length >= 0)
                    message.policyHash = object.policyHash;
            if (object.refundEpoch != null)
                if (typeof object.refundEpoch === "string")
                    $util.base64.decode(object.refundEpoch, message.refundEpoch = $util.newBuffer($util.base64.length(object.refundEpoch)), 0);
                else if (object.refundEpoch.length >= 0)
                    message.refundEpoch = object.refundEpoch;
            return message;
        };

        /**
         * Creates a plain object from an EscrowEntry message. Also converts values to other types if specified.
         * @function toObject
         * @memberof state.EscrowEntry
         * @static
         * @param {state.EscrowEntry} message EscrowEntry
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        EscrowEntry.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.version = 0;
                if (options.bytes === String)
                    object.amount = "";
                else {
                    object.amount = [];
                    if (options.bytes !== Array)
                        object.amount = $util.newBuffer(object.amount);
                }
                if (options.bytes === String)
                    object.additionalFeeAmount = "";
                else {
                    object.additionalFeeAmount = [];
                    if (options.bytes !== Array)
                        object.additionalFeeAmount = $util.newBuffer(object.additionalFeeAmount);
                }
                if (options.bytes === String)
                    object.lockerAddress = "";
                else {
                    object.lockerAddress = [];
                    if (options.bytes !== Array)
                        object.lockerAddress = $util.newBuffer(object.lockerAddress);
                }
                if (options.bytes === String)
                    object.claimRecipientAddress = "";
                else {
                    object.claimRecipientAddress = [];
                    if (options.bytes !== Array)
                        object.claimRecipientAddress = $util.newBuffer(object.claimRecipientAddress);
                }
                if (options.bytes === String)
                    object.refundRecipientAddress = "";
                else {
                    object.refundRecipientAddress = [];
                    if (options.bytes !== Array)
                        object.refundRecipientAddress = $util.newBuffer(object.refundRecipientAddress);
                }
                if (options.bytes === String)
                    object.lockId = "";
                else {
                    object.lockId = [];
                    if (options.bytes !== Array)
                        object.lockId = $util.newBuffer(object.lockId);
                }
                if (options.bytes === String)
                    object.hashLock = "";
                else {
                    object.hashLock = [];
                    if (options.bytes !== Array)
                        object.hashLock = $util.newBuffer(object.hashLock);
                }
                if (options.bytes === String)
                    object.refundEpoch = "";
                else {
                    object.refundEpoch = [];
                    if (options.bytes !== Array)
                        object.refundEpoch = $util.newBuffer(object.refundEpoch);
                }
            }
            if (message.version != null && message.hasOwnProperty("version"))
                object.version = message.version;
            if (message.status != null && message.hasOwnProperty("status")) {
                object.status = options.enums === String ? $root.state.EscrowStatus[message.status] === undefined ? message.status : $root.state.EscrowStatus[message.status] : message.status;
                if (options.oneofs)
                    object._status = "status";
            }
            if (message.amount != null && message.hasOwnProperty("amount"))
                object.amount = options.bytes === String ? $util.base64.encode(message.amount, 0, message.amount.length) : options.bytes === Array ? Array.prototype.slice.call(message.amount) : message.amount;
            if (message.additionalFeeAmount != null && message.hasOwnProperty("additionalFeeAmount"))
                object.additionalFeeAmount = options.bytes === String ? $util.base64.encode(message.additionalFeeAmount, 0, message.additionalFeeAmount.length) : options.bytes === Array ? Array.prototype.slice.call(message.additionalFeeAmount) : message.additionalFeeAmount;
            if (message.lockerAddress != null && message.hasOwnProperty("lockerAddress"))
                object.lockerAddress = options.bytes === String ? $util.base64.encode(message.lockerAddress, 0, message.lockerAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.lockerAddress) : message.lockerAddress;
            if (message.claimRecipientAddress != null && message.hasOwnProperty("claimRecipientAddress"))
                object.claimRecipientAddress = options.bytes === String ? $util.base64.encode(message.claimRecipientAddress, 0, message.claimRecipientAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.claimRecipientAddress) : message.claimRecipientAddress;
            if (message.refundRecipientAddress != null && message.hasOwnProperty("refundRecipientAddress"))
                object.refundRecipientAddress = options.bytes === String ? $util.base64.encode(message.refundRecipientAddress, 0, message.refundRecipientAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.refundRecipientAddress) : message.refundRecipientAddress;
            if (message.additionalFeeRecipientAddress != null && message.hasOwnProperty("additionalFeeRecipientAddress")) {
                object.additionalFeeRecipientAddress = options.bytes === String ? $util.base64.encode(message.additionalFeeRecipientAddress, 0, message.additionalFeeRecipientAddress.length) : options.bytes === Array ? Array.prototype.slice.call(message.additionalFeeRecipientAddress) : message.additionalFeeRecipientAddress;
                if (options.oneofs)
                    object._additionalFeeRecipientAddress = "additionalFeeRecipientAddress";
            }
            if (message.lockId != null && message.hasOwnProperty("lockId"))
                object.lockId = options.bytes === String ? $util.base64.encode(message.lockId, 0, message.lockId.length) : options.bytes === Array ? Array.prototype.slice.call(message.lockId) : message.lockId;
            if (message.hashLock != null && message.hasOwnProperty("hashLock"))
                object.hashLock = options.bytes === String ? $util.base64.encode(message.hashLock, 0, message.hashLock.length) : options.bytes === Array ? Array.prototype.slice.call(message.hashLock) : message.hashLock;
            if (message.preimage != null && message.hasOwnProperty("preimage")) {
                object.preimage = options.bytes === String ? $util.base64.encode(message.preimage, 0, message.preimage.length) : options.bytes === Array ? Array.prototype.slice.call(message.preimage) : message.preimage;
                if (options.oneofs)
                    object._preimage = "preimage";
            }
            if (message.policyHash != null && message.hasOwnProperty("policyHash")) {
                object.policyHash = options.bytes === String ? $util.base64.encode(message.policyHash, 0, message.policyHash.length) : options.bytes === Array ? Array.prototype.slice.call(message.policyHash) : message.policyHash;
                if (options.oneofs)
                    object._policyHash = "policyHash";
            }
            if (message.refundEpoch != null && message.hasOwnProperty("refundEpoch"))
                object.refundEpoch = options.bytes === String ? $util.base64.encode(message.refundEpoch, 0, message.refundEpoch.length) : options.bytes === Array ? Array.prototype.slice.call(message.refundEpoch) : message.refundEpoch;
            return object;
        };

        /**
         * Converts this EscrowEntry to JSON.
         * @function toJSON
         * @memberof state.EscrowEntry
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        EscrowEntry.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for EscrowEntry
         * @function getTypeUrl
         * @memberof state.EscrowEntry
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        EscrowEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/state.EscrowEntry";
        };

        return EscrowEntry;
    })();

    return state;
})();

module.exports = $root;
