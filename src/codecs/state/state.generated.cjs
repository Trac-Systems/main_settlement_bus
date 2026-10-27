/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

/** @typedef {ReturnType<typeof import("b4a").alloc>} B4aBuffer */

var $protobuf = require("../protobufRuntime.cjs");

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
         * @property {B4aBuffer|null} [amount] EscrowEntry amount
         * @property {B4aBuffer|null} [additionalFeeAmount] EscrowEntry additionalFeeAmount
         * @property {B4aBuffer|null} [lockerAddress] EscrowEntry lockerAddress
         * @property {B4aBuffer|null} [claimRecipientAddress] EscrowEntry claimRecipientAddress
         * @property {B4aBuffer|null} [refundRecipientAddress] EscrowEntry refundRecipientAddress
         * @property {B4aBuffer|null} [additionalFeeRecipientAddress] EscrowEntry additionalFeeRecipientAddress
         * @property {B4aBuffer|null} [lockId] EscrowEntry lockId
         * @property {B4aBuffer|null} [hashLock] EscrowEntry hashLock
         * @property {B4aBuffer|null} [preimage] EscrowEntry preimage
         * @property {B4aBuffer|null} [metadata] EscrowEntry metadata
         * @property {B4aBuffer|null} [refundEpoch] EscrowEntry refundEpoch
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
         * @member {B4aBuffer} amount
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.amount = $util.newBuffer([]);

        /**
         * EscrowEntry additionalFeeAmount.
         * @member {B4aBuffer} additionalFeeAmount
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.additionalFeeAmount = $util.newBuffer([]);

        /**
         * EscrowEntry lockerAddress.
         * @member {B4aBuffer} lockerAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.lockerAddress = $util.newBuffer([]);

        /**
         * EscrowEntry claimRecipientAddress.
         * @member {B4aBuffer} claimRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.claimRecipientAddress = $util.newBuffer([]);

        /**
         * EscrowEntry refundRecipientAddress.
         * @member {B4aBuffer} refundRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.refundRecipientAddress = $util.newBuffer([]);

        /**
         * EscrowEntry additionalFeeRecipientAddress.
         * @member {B4aBuffer|null|undefined} additionalFeeRecipientAddress
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.additionalFeeRecipientAddress = null;

        /**
         * EscrowEntry lockId.
         * @member {B4aBuffer} lockId
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.lockId = $util.newBuffer([]);

        /**
         * EscrowEntry hashLock.
         * @member {B4aBuffer} hashLock
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.hashLock = $util.newBuffer([]);

        /**
         * EscrowEntry preimage.
         * @member {B4aBuffer|null|undefined} preimage
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.preimage = null;

        /**
         * EscrowEntry metadata.
         * @member {B4aBuffer|null|undefined} metadata
         * @memberof state.EscrowEntry
         * @instance
         */
        EscrowEntry.prototype.metadata = null;

        /**
         * EscrowEntry refundEpoch.
         * @member {B4aBuffer} refundEpoch
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
        Object.defineProperty(EscrowEntry.prototype, "_metadata", {
            get: $util.oneOfGetter($oneOfFields = ["metadata"]),
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
            writer = $Writer.create(writer);
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
            if (message.metadata != null && Object.hasOwnProperty.call(message, "metadata"))
                writer.uint32(/* id 12, wireType 2 =*/98).bytes(message.metadata);
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
         * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {state.EscrowEntry} EscrowEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EscrowEntry.decode = function decode(reader, length, error) {
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
                        message.amount = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 4: {
                        message.additionalFeeAmount = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 5: {
                        message.lockerAddress = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 6: {
                        message.claimRecipientAddress = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 7: {
                        message.refundRecipientAddress = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 8: {
                        message.additionalFeeRecipientAddress = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 9: {
                        message.lockId = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 10: {
                        message.hashLock = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 11: {
                        message.preimage = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 12: {
                        message.metadata = $util.bytesFrom(reader.bytes());
                        break;
                    }
                case 13: {
                        message.refundEpoch = $util.bytesFrom(reader.bytes());
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
         * @param {$protobuf.Reader|B4aBuffer} reader Reader or buffer to decode from
         * @returns {state.EscrowEntry} EscrowEntry
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        EscrowEntry.decodeDelimited = function decodeDelimited(reader) {
            reader = $Reader.create(reader);
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
                if (!$util.isBytes(message.amount))
                    return "amount: buffer expected";
            if (message.additionalFeeAmount != null && message.hasOwnProperty("additionalFeeAmount"))
                if (!$util.isBytes(message.additionalFeeAmount))
                    return "additionalFeeAmount: buffer expected";
            if (message.lockerAddress != null && message.hasOwnProperty("lockerAddress"))
                if (!$util.isBytes(message.lockerAddress))
                    return "lockerAddress: buffer expected";
            if (message.claimRecipientAddress != null && message.hasOwnProperty("claimRecipientAddress"))
                if (!$util.isBytes(message.claimRecipientAddress))
                    return "claimRecipientAddress: buffer expected";
            if (message.refundRecipientAddress != null && message.hasOwnProperty("refundRecipientAddress"))
                if (!$util.isBytes(message.refundRecipientAddress))
                    return "refundRecipientAddress: buffer expected";
            if (message.additionalFeeRecipientAddress != null && message.hasOwnProperty("additionalFeeRecipientAddress")) {
                properties._additionalFeeRecipientAddress = 1;
                if (!$util.isBytes(message.additionalFeeRecipientAddress))
                    return "additionalFeeRecipientAddress: buffer expected";
            }
            if (message.lockId != null && message.hasOwnProperty("lockId"))
                if (!$util.isBytes(message.lockId))
                    return "lockId: buffer expected";
            if (message.hashLock != null && message.hasOwnProperty("hashLock"))
                if (!$util.isBytes(message.hashLock))
                    return "hashLock: buffer expected";
            if (message.preimage != null && message.hasOwnProperty("preimage")) {
                properties._preimage = 1;
                if (!$util.isBytes(message.preimage))
                    return "preimage: buffer expected";
            }
            if (message.metadata != null && message.hasOwnProperty("metadata")) {
                properties._metadata = 1;
                if (!$util.isBytes(message.metadata))
                    return "metadata: buffer expected";
            }
            if (message.refundEpoch != null && message.hasOwnProperty("refundEpoch"))
                if (!$util.isBytes(message.refundEpoch))
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
                object = Object.assign({}, object);
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
                message.amount = $util.bytesFrom(object.amount);
            if (object.additionalFeeAmount != null)
                message.additionalFeeAmount = $util.bytesFrom(object.additionalFeeAmount);
            if (object.lockerAddress != null)
                message.lockerAddress = $util.bytesFrom(object.lockerAddress);
            if (object.claimRecipientAddress != null)
                message.claimRecipientAddress = $util.bytesFrom(object.claimRecipientAddress);
            if (object.refundRecipientAddress != null)
                message.refundRecipientAddress = $util.bytesFrom(object.refundRecipientAddress);
            if (object.additionalFeeRecipientAddress != null)
                message.additionalFeeRecipientAddress = $util.bytesFrom(object.additionalFeeRecipientAddress);
            if (object.lockId != null)
                message.lockId = $util.bytesFrom(object.lockId);
            if (object.hashLock != null)
                message.hashLock = $util.bytesFrom(object.hashLock);
            if (object.preimage != null)
                message.preimage = $util.bytesFrom(object.preimage);
            if (object.metadata != null)
                message.metadata = $util.bytesFrom(object.metadata);
            if (object.refundEpoch != null)
                message.refundEpoch = $util.bytesFrom(object.refundEpoch);
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
                object.amount = $util.bytesTo(message.amount, options);
            if (message.additionalFeeAmount != null && message.hasOwnProperty("additionalFeeAmount"))
                object.additionalFeeAmount = $util.bytesTo(message.additionalFeeAmount, options);
            if (message.lockerAddress != null && message.hasOwnProperty("lockerAddress"))
                object.lockerAddress = $util.bytesTo(message.lockerAddress, options);
            if (message.claimRecipientAddress != null && message.hasOwnProperty("claimRecipientAddress"))
                object.claimRecipientAddress = $util.bytesTo(message.claimRecipientAddress, options);
            if (message.refundRecipientAddress != null && message.hasOwnProperty("refundRecipientAddress"))
                object.refundRecipientAddress = $util.bytesTo(message.refundRecipientAddress, options);
            if (message.additionalFeeRecipientAddress != null && message.hasOwnProperty("additionalFeeRecipientAddress")) {
                object.additionalFeeRecipientAddress = $util.bytesTo(message.additionalFeeRecipientAddress, options);
                if (options.oneofs)
                    object._additionalFeeRecipientAddress = "additionalFeeRecipientAddress";
            }
            if (message.lockId != null && message.hasOwnProperty("lockId"))
                object.lockId = $util.bytesTo(message.lockId, options);
            if (message.hashLock != null && message.hasOwnProperty("hashLock"))
                object.hashLock = $util.bytesTo(message.hashLock, options);
            if (message.preimage != null && message.hasOwnProperty("preimage")) {
                object.preimage = $util.bytesTo(message.preimage, options);
                if (options.oneofs)
                    object._preimage = "preimage";
            }
            if (message.metadata != null && message.hasOwnProperty("metadata")) {
                object.metadata = $util.bytesTo(message.metadata, options);
                if (options.oneofs)
                    object._metadata = "metadata";
            }
            if (message.refundEpoch != null && message.hasOwnProperty("refundEpoch"))
                object.refundEpoch = $util.bytesTo(message.refundEpoch, options);
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
