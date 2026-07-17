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

$root.apply = (function() {

    /**
     * Namespace apply.
     * @exports apply
     * @namespace
     */
    var apply = {};

    apply.operations = (function() {

        /**
         * Namespace operations.
         * @memberof apply
         * @namespace
         */
        var operations = {};

        operations.Operation = (function() {

            /**
             * Properties of an Operation.
             * @memberof apply.operations
             * @interface IOperation
             * @property {apply.operations.OperationType|null} [type] Operation type
             * @property {Uint8Array|null} [address] Operation address
             * @property {apply.operations.ICoreAdminOperation|null} [cao] Operation cao
             * @property {apply.operations.IAdminControlOperation|null} [aco] Operation aco
             * @property {apply.operations.IBalanceInitializationOperation|null} [bio] Operation bio
             * @property {apply.operations.ITransferOperation|null} [tro] Operation tro
             * @property {apply.operations.IRoleAccessOperation|null} [rao] Operation rao
             * @property {apply.operations.IBootstrapDeploymentOperation|null} [bdo] Operation bdo
             * @property {apply.operations.ITxOperation|null} [txo] Operation txo
             * @property {apply.operations.ISetEpochOperation|null} [seo] Operation seo
             * @property {apply.operations.ISetGenesisEpochOperation|null} [sgo] Operation sgo
             * @property {apply.operations.ISetLedgerConfigOperation|null} [lco] Operation lco
             */

            /**
             * Constructs a new Operation.
             * @memberof apply.operations
             * @classdesc Represents an Operation.
             * @implements IOperation
             * @constructor
             * @param {apply.operations.IOperation=} [properties] Properties to set
             */
            function Operation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Operation type.
             * @member {apply.operations.OperationType} type
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.type = 0;

            /**
             * Operation address.
             * @member {Uint8Array} address
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.address = $util.newBuffer([]);

            /**
             * Operation cao.
             * @member {apply.operations.ICoreAdminOperation|null|undefined} cao
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.cao = null;

            /**
             * Operation aco.
             * @member {apply.operations.IAdminControlOperation|null|undefined} aco
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.aco = null;

            /**
             * Operation bio.
             * @member {apply.operations.IBalanceInitializationOperation|null|undefined} bio
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.bio = null;

            /**
             * Operation tro.
             * @member {apply.operations.ITransferOperation|null|undefined} tro
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.tro = null;

            /**
             * Operation rao.
             * @member {apply.operations.IRoleAccessOperation|null|undefined} rao
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.rao = null;

            /**
             * Operation bdo.
             * @member {apply.operations.IBootstrapDeploymentOperation|null|undefined} bdo
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.bdo = null;

            /**
             * Operation txo.
             * @member {apply.operations.ITxOperation|null|undefined} txo
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.txo = null;

            /**
             * Operation seo.
             * @member {apply.operations.ISetEpochOperation|null|undefined} seo
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.seo = null;

            /**
             * Operation sgo.
             * @member {apply.operations.ISetGenesisEpochOperation|null|undefined} sgo
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.sgo = null;

            /**
             * Operation lco.
             * @member {apply.operations.ISetLedgerConfigOperation|null|undefined} lco
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.lco = null;

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * Operation value.
             * @member {"cao"|"aco"|"bio"|"tro"|"rao"|"bdo"|"txo"|"seo"|"sgo"|"lco"|undefined} value
             * @memberof apply.operations.Operation
             * @instance
             */
            Object.defineProperty(Operation.prototype, "value", {
                get: $util.oneOfGetter($oneOfFields = ["cao", "aco", "bio", "tro", "rao", "bdo", "txo", "seo", "sgo", "lco"]),
                set: $util.oneOfSetter($oneOfFields)
            });

            /**
             * Creates a new Operation instance using the specified properties.
             * @function create
             * @memberof apply.operations.Operation
             * @static
             * @param {apply.operations.IOperation=} [properties] Properties to set
             * @returns {apply.operations.Operation} Operation instance
             */
            Operation.create = function create(properties) {
                return new Operation(properties);
            };

            /**
             * Encodes the specified Operation message. Does not implicitly {@link apply.operations.Operation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.Operation
             * @static
             * @param {apply.operations.IOperation} message Operation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Operation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.type);
                if (message.address != null && Object.hasOwnProperty.call(message, "address"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.address);
                if (message.cao != null && Object.hasOwnProperty.call(message, "cao"))
                    $root.apply.operations.CoreAdminOperation.encode(message.cao, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                if (message.aco != null && Object.hasOwnProperty.call(message, "aco"))
                    $root.apply.operations.AdminControlOperation.encode(message.aco, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                if (message.bio != null && Object.hasOwnProperty.call(message, "bio"))
                    $root.apply.operations.BalanceInitializationOperation.encode(message.bio, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
                if (message.tro != null && Object.hasOwnProperty.call(message, "tro"))
                    $root.apply.operations.TransferOperation.encode(message.tro, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
                if (message.rao != null && Object.hasOwnProperty.call(message, "rao"))
                    $root.apply.operations.RoleAccessOperation.encode(message.rao, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
                if (message.bdo != null && Object.hasOwnProperty.call(message, "bdo"))
                    $root.apply.operations.BootstrapDeploymentOperation.encode(message.bdo, writer.uint32(/* id 8, wireType 2 =*/66).fork()).ldelim();
                if (message.txo != null && Object.hasOwnProperty.call(message, "txo"))
                    $root.apply.operations.TxOperation.encode(message.txo, writer.uint32(/* id 9, wireType 2 =*/74).fork()).ldelim();
                if (message.seo != null && Object.hasOwnProperty.call(message, "seo"))
                    $root.apply.operations.SetEpochOperation.encode(message.seo, writer.uint32(/* id 10, wireType 2 =*/82).fork()).ldelim();
                if (message.sgo != null && Object.hasOwnProperty.call(message, "sgo"))
                    $root.apply.operations.SetGenesisEpochOperation.encode(message.sgo, writer.uint32(/* id 11, wireType 2 =*/90).fork()).ldelim();
                if (message.lco != null && Object.hasOwnProperty.call(message, "lco"))
                    $root.apply.operations.SetLedgerConfigOperation.encode(message.lco, writer.uint32(/* id 12, wireType 2 =*/98).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified Operation message, length delimited. Does not implicitly {@link apply.operations.Operation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.Operation
             * @static
             * @param {apply.operations.IOperation} message Operation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Operation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an Operation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.Operation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.Operation} Operation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Operation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.Operation();
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
                            message.address = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.cao = $root.apply.operations.CoreAdminOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 4: {
                            message.aco = $root.apply.operations.AdminControlOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 5: {
                            message.bio = $root.apply.operations.BalanceInitializationOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 6: {
                            message.tro = $root.apply.operations.TransferOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 7: {
                            message.rao = $root.apply.operations.RoleAccessOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 8: {
                            message.bdo = $root.apply.operations.BootstrapDeploymentOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 9: {
                            message.txo = $root.apply.operations.TxOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 10: {
                            message.seo = $root.apply.operations.SetEpochOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 11: {
                            message.sgo = $root.apply.operations.SetGenesisEpochOperation.decode(reader, reader.uint32());
                            break;
                        }
                    case 12: {
                            message.lco = $root.apply.operations.SetLedgerConfigOperation.decode(reader, reader.uint32());
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
             * Decodes an Operation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.Operation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.Operation} Operation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Operation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an Operation message.
             * @function verify
             * @memberof apply.operations.Operation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Operation.verify = function verify(message) {
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
                        break;
                    }
                if (message.address != null && message.hasOwnProperty("address"))
                    if (!(message.address && typeof message.address.length === "number" || $util.isString(message.address)))
                        return "address: buffer expected";
                if (message.cao != null && message.hasOwnProperty("cao")) {
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.CoreAdminOperation.verify(message.cao);
                        if (error)
                            return "cao." + error;
                    }
                }
                if (message.aco != null && message.hasOwnProperty("aco")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.AdminControlOperation.verify(message.aco);
                        if (error)
                            return "aco." + error;
                    }
                }
                if (message.bio != null && message.hasOwnProperty("bio")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.BalanceInitializationOperation.verify(message.bio);
                        if (error)
                            return "bio." + error;
                    }
                }
                if (message.tro != null && message.hasOwnProperty("tro")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.TransferOperation.verify(message.tro);
                        if (error)
                            return "tro." + error;
                    }
                }
                if (message.rao != null && message.hasOwnProperty("rao")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.RoleAccessOperation.verify(message.rao);
                        if (error)
                            return "rao." + error;
                    }
                }
                if (message.bdo != null && message.hasOwnProperty("bdo")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.BootstrapDeploymentOperation.verify(message.bdo);
                        if (error)
                            return "bdo." + error;
                    }
                }
                if (message.txo != null && message.hasOwnProperty("txo")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.TxOperation.verify(message.txo);
                        if (error)
                            return "txo." + error;
                    }
                }
                if (message.seo != null && message.hasOwnProperty("seo")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.SetEpochOperation.verify(message.seo);
                        if (error)
                            return "seo." + error;
                    }
                }
                if (message.sgo != null && message.hasOwnProperty("sgo")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.SetGenesisEpochOperation.verify(message.sgo);
                        if (error)
                            return "sgo." + error;
                    }
                }
                if (message.lco != null && message.hasOwnProperty("lco")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.SetLedgerConfigOperation.verify(message.lco);
                        if (error)
                            return "lco." + error;
                    }
                }
                return null;
            };

            /**
             * Creates an Operation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.Operation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.Operation} Operation
             */
            Operation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.Operation)
                    return object;
                var message = new $root.apply.operations.Operation();
                switch (object.type) {
                default:
                    if (typeof object.type === "number") {
                        message.type = object.type;
                        break;
                    }
                    break;
                case "UNKNOWN":
                case 0:
                    message.type = 0;
                    break;
                case "ADD_ADMIN":
                case 1:
                    message.type = 1;
                    break;
                case "DISABLE_INITIALIZATION":
                case 2:
                    message.type = 2;
                    break;
                case "BALANCE_INITIALIZATION":
                case 3:
                    message.type = 3;
                    break;
                case "APPEND_WHITELIST":
                case 4:
                    message.type = 4;
                    break;
                case "ADD_WRITER":
                case 5:
                    message.type = 5;
                    break;
                case "REMOVE_WRITER":
                case 6:
                    message.type = 6;
                    break;
                case "ADMIN_RECOVERY":
                case 7:
                    message.type = 7;
                    break;
                case "ADD_INDEXER":
                case 8:
                    message.type = 8;
                    break;
                case "REMOVE_INDEXER":
                case 9:
                    message.type = 9;
                    break;
                case "BAN_VALIDATOR":
                case 10:
                    message.type = 10;
                    break;
                case "BOOTSTRAP_DEPLOYMENT":
                case 11:
                    message.type = 11;
                    break;
                case "TX":
                case 12:
                    message.type = 12;
                    break;
                case "TRANSFER":
                case 13:
                    message.type = 13;
                    break;
                case "SET_EPOCH":
                case 14:
                    message.type = 14;
                    break;
                case "SET_GENESIS_EPOCH":
                case 15:
                    message.type = 15;
                    break;
                case "SET_LEDGER_CONFIG":
                case 16:
                    message.type = 16;
                    break;
                }
                if (object.address != null)
                    if (typeof object.address === "string")
                        $util.base64.decode(object.address, message.address = $util.newBuffer($util.base64.length(object.address)), 0);
                    else if (object.address.length >= 0)
                        message.address = object.address;
                if (object.cao != null) {
                    if (typeof object.cao !== "object")
                        throw TypeError(".apply.operations.Operation.cao: object expected");
                    message.cao = $root.apply.operations.CoreAdminOperation.fromObject(object.cao);
                }
                if (object.aco != null) {
                    if (typeof object.aco !== "object")
                        throw TypeError(".apply.operations.Operation.aco: object expected");
                    message.aco = $root.apply.operations.AdminControlOperation.fromObject(object.aco);
                }
                if (object.bio != null) {
                    if (typeof object.bio !== "object")
                        throw TypeError(".apply.operations.Operation.bio: object expected");
                    message.bio = $root.apply.operations.BalanceInitializationOperation.fromObject(object.bio);
                }
                if (object.tro != null) {
                    if (typeof object.tro !== "object")
                        throw TypeError(".apply.operations.Operation.tro: object expected");
                    message.tro = $root.apply.operations.TransferOperation.fromObject(object.tro);
                }
                if (object.rao != null) {
                    if (typeof object.rao !== "object")
                        throw TypeError(".apply.operations.Operation.rao: object expected");
                    message.rao = $root.apply.operations.RoleAccessOperation.fromObject(object.rao);
                }
                if (object.bdo != null) {
                    if (typeof object.bdo !== "object")
                        throw TypeError(".apply.operations.Operation.bdo: object expected");
                    message.bdo = $root.apply.operations.BootstrapDeploymentOperation.fromObject(object.bdo);
                }
                if (object.txo != null) {
                    if (typeof object.txo !== "object")
                        throw TypeError(".apply.operations.Operation.txo: object expected");
                    message.txo = $root.apply.operations.TxOperation.fromObject(object.txo);
                }
                if (object.seo != null) {
                    if (typeof object.seo !== "object")
                        throw TypeError(".apply.operations.Operation.seo: object expected");
                    message.seo = $root.apply.operations.SetEpochOperation.fromObject(object.seo);
                }
                if (object.sgo != null) {
                    if (typeof object.sgo !== "object")
                        throw TypeError(".apply.operations.Operation.sgo: object expected");
                    message.sgo = $root.apply.operations.SetGenesisEpochOperation.fromObject(object.sgo);
                }
                if (object.lco != null) {
                    if (typeof object.lco !== "object")
                        throw TypeError(".apply.operations.Operation.lco: object expected");
                    message.lco = $root.apply.operations.SetLedgerConfigOperation.fromObject(object.lco);
                }
                return message;
            };

            /**
             * Creates a plain object from an Operation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.Operation
             * @static
             * @param {apply.operations.Operation} message Operation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Operation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.type = options.enums === String ? "UNKNOWN" : 0;
                    if (options.bytes === String)
                        object.address = "";
                    else {
                        object.address = [];
                        if (options.bytes !== Array)
                            object.address = $util.newBuffer(object.address);
                    }
                }
                if (message.type != null && message.hasOwnProperty("type"))
                    object.type = options.enums === String ? $root.apply.operations.OperationType[message.type] === undefined ? message.type : $root.apply.operations.OperationType[message.type] : message.type;
                if (message.address != null && message.hasOwnProperty("address"))
                    object.address = options.bytes === String ? $util.base64.encode(message.address, 0, message.address.length) : options.bytes === Array ? Array.prototype.slice.call(message.address) : message.address;
                if (message.cao != null && message.hasOwnProperty("cao")) {
                    object.cao = $root.apply.operations.CoreAdminOperation.toObject(message.cao, options);
                    if (options.oneofs)
                        object.value = "cao";
                }
                if (message.aco != null && message.hasOwnProperty("aco")) {
                    object.aco = $root.apply.operations.AdminControlOperation.toObject(message.aco, options);
                    if (options.oneofs)
                        object.value = "aco";
                }
                if (message.bio != null && message.hasOwnProperty("bio")) {
                    object.bio = $root.apply.operations.BalanceInitializationOperation.toObject(message.bio, options);
                    if (options.oneofs)
                        object.value = "bio";
                }
                if (message.tro != null && message.hasOwnProperty("tro")) {
                    object.tro = $root.apply.operations.TransferOperation.toObject(message.tro, options);
                    if (options.oneofs)
                        object.value = "tro";
                }
                if (message.rao != null && message.hasOwnProperty("rao")) {
                    object.rao = $root.apply.operations.RoleAccessOperation.toObject(message.rao, options);
                    if (options.oneofs)
                        object.value = "rao";
                }
                if (message.bdo != null && message.hasOwnProperty("bdo")) {
                    object.bdo = $root.apply.operations.BootstrapDeploymentOperation.toObject(message.bdo, options);
                    if (options.oneofs)
                        object.value = "bdo";
                }
                if (message.txo != null && message.hasOwnProperty("txo")) {
                    object.txo = $root.apply.operations.TxOperation.toObject(message.txo, options);
                    if (options.oneofs)
                        object.value = "txo";
                }
                if (message.seo != null && message.hasOwnProperty("seo")) {
                    object.seo = $root.apply.operations.SetEpochOperation.toObject(message.seo, options);
                    if (options.oneofs)
                        object.value = "seo";
                }
                if (message.sgo != null && message.hasOwnProperty("sgo")) {
                    object.sgo = $root.apply.operations.SetGenesisEpochOperation.toObject(message.sgo, options);
                    if (options.oneofs)
                        object.value = "sgo";
                }
                if (message.lco != null && message.hasOwnProperty("lco")) {
                    object.lco = $root.apply.operations.SetLedgerConfigOperation.toObject(message.lco, options);
                    if (options.oneofs)
                        object.value = "lco";
                }
                return object;
            };

            /**
             * Converts this Operation to JSON.
             * @function toJSON
             * @memberof apply.operations.Operation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Operation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Operation
             * @function getTypeUrl
             * @memberof apply.operations.Operation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Operation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.Operation";
            };

            return Operation;
        })();

        /**
         * OperationType enum.
         * @name apply.operations.OperationType
         * @enum {number}
         * @property {number} UNKNOWN=0 UNKNOWN value
         * @property {number} ADD_ADMIN=1 ADD_ADMIN value
         * @property {number} DISABLE_INITIALIZATION=2 DISABLE_INITIALIZATION value
         * @property {number} BALANCE_INITIALIZATION=3 BALANCE_INITIALIZATION value
         * @property {number} APPEND_WHITELIST=4 APPEND_WHITELIST value
         * @property {number} ADD_WRITER=5 ADD_WRITER value
         * @property {number} REMOVE_WRITER=6 REMOVE_WRITER value
         * @property {number} ADMIN_RECOVERY=7 ADMIN_RECOVERY value
         * @property {number} ADD_INDEXER=8 ADD_INDEXER value
         * @property {number} REMOVE_INDEXER=9 REMOVE_INDEXER value
         * @property {number} BAN_VALIDATOR=10 BAN_VALIDATOR value
         * @property {number} BOOTSTRAP_DEPLOYMENT=11 BOOTSTRAP_DEPLOYMENT value
         * @property {number} TX=12 TX value
         * @property {number} TRANSFER=13 TRANSFER value
         * @property {number} SET_EPOCH=14 SET_EPOCH value
         * @property {number} SET_GENESIS_EPOCH=15 SET_GENESIS_EPOCH value
         * @property {number} SET_LEDGER_CONFIG=16 SET_LEDGER_CONFIG value
         */
        operations.OperationType = (function() {
            var valuesById = {}, values = Object.create(valuesById);
            values[valuesById[0] = "UNKNOWN"] = 0;
            values[valuesById[1] = "ADD_ADMIN"] = 1;
            values[valuesById[2] = "DISABLE_INITIALIZATION"] = 2;
            values[valuesById[3] = "BALANCE_INITIALIZATION"] = 3;
            values[valuesById[4] = "APPEND_WHITELIST"] = 4;
            values[valuesById[5] = "ADD_WRITER"] = 5;
            values[valuesById[6] = "REMOVE_WRITER"] = 6;
            values[valuesById[7] = "ADMIN_RECOVERY"] = 7;
            values[valuesById[8] = "ADD_INDEXER"] = 8;
            values[valuesById[9] = "REMOVE_INDEXER"] = 9;
            values[valuesById[10] = "BAN_VALIDATOR"] = 10;
            values[valuesById[11] = "BOOTSTRAP_DEPLOYMENT"] = 11;
            values[valuesById[12] = "TX"] = 12;
            values[valuesById[13] = "TRANSFER"] = 13;
            values[valuesById[14] = "SET_EPOCH"] = 14;
            values[valuesById[15] = "SET_GENESIS_EPOCH"] = 15;
            values[valuesById[16] = "SET_LEDGER_CONFIG"] = 16;
            return values;
        })();

        operations.CoreAdminOperation = (function() {

            /**
             * Properties of a CoreAdminOperation.
             * @memberof apply.operations
             * @interface ICoreAdminOperation
             * @property {Uint8Array|null} [tx] CoreAdminOperation tx
             * @property {Uint8Array|null} [txv] CoreAdminOperation txv
             * @property {Uint8Array|null} [iw] CoreAdminOperation iw
             * @property {Uint8Array|null} ["in"] CoreAdminOperation in
             * @property {Uint8Array|null} [is] CoreAdminOperation is
             */

            /**
             * Constructs a new CoreAdminOperation.
             * @memberof apply.operations
             * @classdesc Represents a CoreAdminOperation.
             * @implements ICoreAdminOperation
             * @constructor
             * @param {apply.operations.ICoreAdminOperation=} [properties] Properties to set
             */
            function CoreAdminOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CoreAdminOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             */
            CoreAdminOperation.prototype.tx = $util.newBuffer([]);

            /**
             * CoreAdminOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             */
            CoreAdminOperation.prototype.txv = $util.newBuffer([]);

            /**
             * CoreAdminOperation iw.
             * @member {Uint8Array} iw
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             */
            CoreAdminOperation.prototype.iw = $util.newBuffer([]);

            /**
             * CoreAdminOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             */
            CoreAdminOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * CoreAdminOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             */
            CoreAdminOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new CoreAdminOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {apply.operations.ICoreAdminOperation=} [properties] Properties to set
             * @returns {apply.operations.CoreAdminOperation} CoreAdminOperation instance
             */
            CoreAdminOperation.create = function create(properties) {
                return new CoreAdminOperation(properties);
            };

            /**
             * Encodes the specified CoreAdminOperation message. Does not implicitly {@link apply.operations.CoreAdminOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {apply.operations.ICoreAdminOperation} message CoreAdminOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CoreAdminOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.iw != null && Object.hasOwnProperty.call(message, "iw"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.iw);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified CoreAdminOperation message, length delimited. Does not implicitly {@link apply.operations.CoreAdminOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {apply.operations.ICoreAdminOperation} message CoreAdminOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CoreAdminOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CoreAdminOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.CoreAdminOperation} CoreAdminOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CoreAdminOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.CoreAdminOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.iw = reader.bytes();
                            break;
                        }
                    case 4: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.is = reader.bytes();
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
             * Decodes a CoreAdminOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.CoreAdminOperation} CoreAdminOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CoreAdminOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a CoreAdminOperation message.
             * @function verify
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CoreAdminOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.iw != null && message.hasOwnProperty("iw"))
                    if (!(message.iw && typeof message.iw.length === "number" || $util.isString(message.iw)))
                        return "iw: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates a CoreAdminOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.CoreAdminOperation} CoreAdminOperation
             */
            CoreAdminOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.CoreAdminOperation)
                    return object;
                var message = new $root.apply.operations.CoreAdminOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.iw != null)
                    if (typeof object.iw === "string")
                        $util.base64.decode(object.iw, message.iw = $util.newBuffer($util.base64.length(object.iw)), 0);
                    else if (object.iw.length >= 0)
                        message.iw = object.iw;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                return message;
            };

            /**
             * Creates a plain object from a CoreAdminOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {apply.operations.CoreAdminOperation} message CoreAdminOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CoreAdminOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.iw = "";
                    else {
                        object.iw = [];
                        if (options.bytes !== Array)
                            object.iw = $util.newBuffer(object.iw);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.iw != null && message.hasOwnProperty("iw"))
                    object.iw = options.bytes === String ? $util.base64.encode(message.iw, 0, message.iw.length) : options.bytes === Array ? Array.prototype.slice.call(message.iw) : message.iw;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this CoreAdminOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.CoreAdminOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CoreAdminOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for CoreAdminOperation
             * @function getTypeUrl
             * @memberof apply.operations.CoreAdminOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CoreAdminOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.CoreAdminOperation";
            };

            return CoreAdminOperation;
        })();

        operations.AdminControlOperation = (function() {

            /**
             * Properties of an AdminControlOperation.
             * @memberof apply.operations
             * @interface IAdminControlOperation
             * @property {Uint8Array|null} [tx] AdminControlOperation tx
             * @property {Uint8Array|null} [txv] AdminControlOperation txv
             * @property {Uint8Array|null} [ia] AdminControlOperation ia
             * @property {Uint8Array|null} ["in"] AdminControlOperation in
             * @property {Uint8Array|null} [is] AdminControlOperation is
             */

            /**
             * Constructs a new AdminControlOperation.
             * @memberof apply.operations
             * @classdesc Represents an AdminControlOperation.
             * @implements IAdminControlOperation
             * @constructor
             * @param {apply.operations.IAdminControlOperation=} [properties] Properties to set
             */
            function AdminControlOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * AdminControlOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.AdminControlOperation
             * @instance
             */
            AdminControlOperation.prototype.tx = $util.newBuffer([]);

            /**
             * AdminControlOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.AdminControlOperation
             * @instance
             */
            AdminControlOperation.prototype.txv = $util.newBuffer([]);

            /**
             * AdminControlOperation ia.
             * @member {Uint8Array} ia
             * @memberof apply.operations.AdminControlOperation
             * @instance
             */
            AdminControlOperation.prototype.ia = $util.newBuffer([]);

            /**
             * AdminControlOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.AdminControlOperation
             * @instance
             */
            AdminControlOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * AdminControlOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.AdminControlOperation
             * @instance
             */
            AdminControlOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new AdminControlOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {apply.operations.IAdminControlOperation=} [properties] Properties to set
             * @returns {apply.operations.AdminControlOperation} AdminControlOperation instance
             */
            AdminControlOperation.create = function create(properties) {
                return new AdminControlOperation(properties);
            };

            /**
             * Encodes the specified AdminControlOperation message. Does not implicitly {@link apply.operations.AdminControlOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {apply.operations.IAdminControlOperation} message AdminControlOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AdminControlOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.ia != null && Object.hasOwnProperty.call(message, "ia"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.ia);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified AdminControlOperation message, length delimited. Does not implicitly {@link apply.operations.AdminControlOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {apply.operations.IAdminControlOperation} message AdminControlOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            AdminControlOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an AdminControlOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.AdminControlOperation} AdminControlOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AdminControlOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.AdminControlOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.ia = reader.bytes();
                            break;
                        }
                    case 4: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.is = reader.bytes();
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
             * Decodes an AdminControlOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.AdminControlOperation} AdminControlOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            AdminControlOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an AdminControlOperation message.
             * @function verify
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            AdminControlOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.ia != null && message.hasOwnProperty("ia"))
                    if (!(message.ia && typeof message.ia.length === "number" || $util.isString(message.ia)))
                        return "ia: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates an AdminControlOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.AdminControlOperation} AdminControlOperation
             */
            AdminControlOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.AdminControlOperation)
                    return object;
                var message = new $root.apply.operations.AdminControlOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.ia != null)
                    if (typeof object.ia === "string")
                        $util.base64.decode(object.ia, message.ia = $util.newBuffer($util.base64.length(object.ia)), 0);
                    else if (object.ia.length >= 0)
                        message.ia = object.ia;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                return message;
            };

            /**
             * Creates a plain object from an AdminControlOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {apply.operations.AdminControlOperation} message AdminControlOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            AdminControlOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.ia = "";
                    else {
                        object.ia = [];
                        if (options.bytes !== Array)
                            object.ia = $util.newBuffer(object.ia);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.ia != null && message.hasOwnProperty("ia"))
                    object.ia = options.bytes === String ? $util.base64.encode(message.ia, 0, message.ia.length) : options.bytes === Array ? Array.prototype.slice.call(message.ia) : message.ia;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this AdminControlOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.AdminControlOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            AdminControlOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for AdminControlOperation
             * @function getTypeUrl
             * @memberof apply.operations.AdminControlOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            AdminControlOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.AdminControlOperation";
            };

            return AdminControlOperation;
        })();

        operations.BalanceInitializationOperation = (function() {

            /**
             * Properties of a BalanceInitializationOperation.
             * @memberof apply.operations
             * @interface IBalanceInitializationOperation
             * @property {Uint8Array|null} [tx] BalanceInitializationOperation tx
             * @property {Uint8Array|null} [txv] BalanceInitializationOperation txv
             * @property {Uint8Array|null} [ia] BalanceInitializationOperation ia
             * @property {Uint8Array|null} [am] BalanceInitializationOperation am
             * @property {Uint8Array|null} ["in"] BalanceInitializationOperation in
             * @property {Uint8Array|null} [is] BalanceInitializationOperation is
             */

            /**
             * Constructs a new BalanceInitializationOperation.
             * @memberof apply.operations
             * @classdesc Represents a BalanceInitializationOperation.
             * @implements IBalanceInitializationOperation
             * @constructor
             * @param {apply.operations.IBalanceInitializationOperation=} [properties] Properties to set
             */
            function BalanceInitializationOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * BalanceInitializationOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype.tx = $util.newBuffer([]);

            /**
             * BalanceInitializationOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype.txv = $util.newBuffer([]);

            /**
             * BalanceInitializationOperation ia.
             * @member {Uint8Array} ia
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype.ia = $util.newBuffer([]);

            /**
             * BalanceInitializationOperation am.
             * @member {Uint8Array} am
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype.am = $util.newBuffer([]);

            /**
             * BalanceInitializationOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * BalanceInitializationOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             */
            BalanceInitializationOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new BalanceInitializationOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {apply.operations.IBalanceInitializationOperation=} [properties] Properties to set
             * @returns {apply.operations.BalanceInitializationOperation} BalanceInitializationOperation instance
             */
            BalanceInitializationOperation.create = function create(properties) {
                return new BalanceInitializationOperation(properties);
            };

            /**
             * Encodes the specified BalanceInitializationOperation message. Does not implicitly {@link apply.operations.BalanceInitializationOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {apply.operations.IBalanceInitializationOperation} message BalanceInitializationOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            BalanceInitializationOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.ia != null && Object.hasOwnProperty.call(message, "ia"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.ia);
                if (message.am != null && Object.hasOwnProperty.call(message, "am"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.am);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified BalanceInitializationOperation message, length delimited. Does not implicitly {@link apply.operations.BalanceInitializationOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {apply.operations.IBalanceInitializationOperation} message BalanceInitializationOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            BalanceInitializationOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a BalanceInitializationOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.BalanceInitializationOperation} BalanceInitializationOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            BalanceInitializationOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.BalanceInitializationOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.ia = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.am = reader.bytes();
                            break;
                        }
                    case 5: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.is = reader.bytes();
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
             * Decodes a BalanceInitializationOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.BalanceInitializationOperation} BalanceInitializationOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            BalanceInitializationOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a BalanceInitializationOperation message.
             * @function verify
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            BalanceInitializationOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.ia != null && message.hasOwnProperty("ia"))
                    if (!(message.ia && typeof message.ia.length === "number" || $util.isString(message.ia)))
                        return "ia: buffer expected";
                if (message.am != null && message.hasOwnProperty("am"))
                    if (!(message.am && typeof message.am.length === "number" || $util.isString(message.am)))
                        return "am: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates a BalanceInitializationOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.BalanceInitializationOperation} BalanceInitializationOperation
             */
            BalanceInitializationOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.BalanceInitializationOperation)
                    return object;
                var message = new $root.apply.operations.BalanceInitializationOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.ia != null)
                    if (typeof object.ia === "string")
                        $util.base64.decode(object.ia, message.ia = $util.newBuffer($util.base64.length(object.ia)), 0);
                    else if (object.ia.length >= 0)
                        message.ia = object.ia;
                if (object.am != null)
                    if (typeof object.am === "string")
                        $util.base64.decode(object.am, message.am = $util.newBuffer($util.base64.length(object.am)), 0);
                    else if (object.am.length >= 0)
                        message.am = object.am;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                return message;
            };

            /**
             * Creates a plain object from a BalanceInitializationOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {apply.operations.BalanceInitializationOperation} message BalanceInitializationOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            BalanceInitializationOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.ia = "";
                    else {
                        object.ia = [];
                        if (options.bytes !== Array)
                            object.ia = $util.newBuffer(object.ia);
                    }
                    if (options.bytes === String)
                        object.am = "";
                    else {
                        object.am = [];
                        if (options.bytes !== Array)
                            object.am = $util.newBuffer(object.am);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.ia != null && message.hasOwnProperty("ia"))
                    object.ia = options.bytes === String ? $util.base64.encode(message.ia, 0, message.ia.length) : options.bytes === Array ? Array.prototype.slice.call(message.ia) : message.ia;
                if (message.am != null && message.hasOwnProperty("am"))
                    object.am = options.bytes === String ? $util.base64.encode(message.am, 0, message.am.length) : options.bytes === Array ? Array.prototype.slice.call(message.am) : message.am;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this BalanceInitializationOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.BalanceInitializationOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            BalanceInitializationOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for BalanceInitializationOperation
             * @function getTypeUrl
             * @memberof apply.operations.BalanceInitializationOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            BalanceInitializationOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.BalanceInitializationOperation";
            };

            return BalanceInitializationOperation;
        })();

        operations.TransferOperation = (function() {

            /**
             * Properties of a TransferOperation.
             * @memberof apply.operations
             * @interface ITransferOperation
             * @property {Uint8Array|null} [tx] TransferOperation tx
             * @property {Uint8Array|null} [txv] TransferOperation txv
             * @property {Uint8Array|null} [to] TransferOperation to
             * @property {Uint8Array|null} [am] TransferOperation am
             * @property {Uint8Array|null} ["in"] TransferOperation in
             * @property {Uint8Array|null} [is] TransferOperation is
             * @property {Uint8Array|null} [va] TransferOperation va
             * @property {Uint8Array|null} [vn] TransferOperation vn
             * @property {Uint8Array|null} [vs] TransferOperation vs
             */

            /**
             * Constructs a new TransferOperation.
             * @memberof apply.operations
             * @classdesc Represents a TransferOperation.
             * @implements ITransferOperation
             * @constructor
             * @param {apply.operations.ITransferOperation=} [properties] Properties to set
             */
            function TransferOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TransferOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.tx = $util.newBuffer([]);

            /**
             * TransferOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.txv = $util.newBuffer([]);

            /**
             * TransferOperation to.
             * @member {Uint8Array} to
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.to = $util.newBuffer([]);

            /**
             * TransferOperation am.
             * @member {Uint8Array} am
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.am = $util.newBuffer([]);

            /**
             * TransferOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * TransferOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.is = $util.newBuffer([]);

            /**
             * TransferOperation va.
             * @member {Uint8Array} va
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.va = $util.newBuffer([]);

            /**
             * TransferOperation vn.
             * @member {Uint8Array} vn
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.vn = $util.newBuffer([]);

            /**
             * TransferOperation vs.
             * @member {Uint8Array} vs
             * @memberof apply.operations.TransferOperation
             * @instance
             */
            TransferOperation.prototype.vs = $util.newBuffer([]);

            /**
             * Creates a new TransferOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {apply.operations.ITransferOperation=} [properties] Properties to set
             * @returns {apply.operations.TransferOperation} TransferOperation instance
             */
            TransferOperation.create = function create(properties) {
                return new TransferOperation(properties);
            };

            /**
             * Encodes the specified TransferOperation message. Does not implicitly {@link apply.operations.TransferOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {apply.operations.ITransferOperation} message TransferOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TransferOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.to != null && Object.hasOwnProperty.call(message, "to"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.to);
                if (message.am != null && Object.hasOwnProperty.call(message, "am"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.am);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.is);
                if (message.va != null && Object.hasOwnProperty.call(message, "va"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.va);
                if (message.vn != null && Object.hasOwnProperty.call(message, "vn"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.vn);
                if (message.vs != null && Object.hasOwnProperty.call(message, "vs"))
                    writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.vs);
                return writer;
            };

            /**
             * Encodes the specified TransferOperation message, length delimited. Does not implicitly {@link apply.operations.TransferOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {apply.operations.ITransferOperation} message TransferOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TransferOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TransferOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.TransferOperation} TransferOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TransferOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.TransferOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.to = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.am = reader.bytes();
                            break;
                        }
                    case 5: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.is = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.va = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.vn = reader.bytes();
                            break;
                        }
                    case 9: {
                            message.vs = reader.bytes();
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
             * Decodes a TransferOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.TransferOperation} TransferOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TransferOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TransferOperation message.
             * @function verify
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TransferOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.to != null && message.hasOwnProperty("to"))
                    if (!(message.to && typeof message.to.length === "number" || $util.isString(message.to)))
                        return "to: buffer expected";
                if (message.am != null && message.hasOwnProperty("am"))
                    if (!(message.am && typeof message.am.length === "number" || $util.isString(message.am)))
                        return "am: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                if (message.va != null && message.hasOwnProperty("va"))
                    if (!(message.va && typeof message.va.length === "number" || $util.isString(message.va)))
                        return "va: buffer expected";
                if (message.vn != null && message.hasOwnProperty("vn"))
                    if (!(message.vn && typeof message.vn.length === "number" || $util.isString(message.vn)))
                        return "vn: buffer expected";
                if (message.vs != null && message.hasOwnProperty("vs"))
                    if (!(message.vs && typeof message.vs.length === "number" || $util.isString(message.vs)))
                        return "vs: buffer expected";
                return null;
            };

            /**
             * Creates a TransferOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.TransferOperation} TransferOperation
             */
            TransferOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.TransferOperation)
                    return object;
                var message = new $root.apply.operations.TransferOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.to != null)
                    if (typeof object.to === "string")
                        $util.base64.decode(object.to, message.to = $util.newBuffer($util.base64.length(object.to)), 0);
                    else if (object.to.length >= 0)
                        message.to = object.to;
                if (object.am != null)
                    if (typeof object.am === "string")
                        $util.base64.decode(object.am, message.am = $util.newBuffer($util.base64.length(object.am)), 0);
                    else if (object.am.length >= 0)
                        message.am = object.am;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                if (object.va != null)
                    if (typeof object.va === "string")
                        $util.base64.decode(object.va, message.va = $util.newBuffer($util.base64.length(object.va)), 0);
                    else if (object.va.length >= 0)
                        message.va = object.va;
                if (object.vn != null)
                    if (typeof object.vn === "string")
                        $util.base64.decode(object.vn, message.vn = $util.newBuffer($util.base64.length(object.vn)), 0);
                    else if (object.vn.length >= 0)
                        message.vn = object.vn;
                if (object.vs != null)
                    if (typeof object.vs === "string")
                        $util.base64.decode(object.vs, message.vs = $util.newBuffer($util.base64.length(object.vs)), 0);
                    else if (object.vs.length >= 0)
                        message.vs = object.vs;
                return message;
            };

            /**
             * Creates a plain object from a TransferOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {apply.operations.TransferOperation} message TransferOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TransferOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.to = "";
                    else {
                        object.to = [];
                        if (options.bytes !== Array)
                            object.to = $util.newBuffer(object.to);
                    }
                    if (options.bytes === String)
                        object.am = "";
                    else {
                        object.am = [];
                        if (options.bytes !== Array)
                            object.am = $util.newBuffer(object.am);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                    if (options.bytes === String)
                        object.va = "";
                    else {
                        object.va = [];
                        if (options.bytes !== Array)
                            object.va = $util.newBuffer(object.va);
                    }
                    if (options.bytes === String)
                        object.vn = "";
                    else {
                        object.vn = [];
                        if (options.bytes !== Array)
                            object.vn = $util.newBuffer(object.vn);
                    }
                    if (options.bytes === String)
                        object.vs = "";
                    else {
                        object.vs = [];
                        if (options.bytes !== Array)
                            object.vs = $util.newBuffer(object.vs);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.to != null && message.hasOwnProperty("to"))
                    object.to = options.bytes === String ? $util.base64.encode(message.to, 0, message.to.length) : options.bytes === Array ? Array.prototype.slice.call(message.to) : message.to;
                if (message.am != null && message.hasOwnProperty("am"))
                    object.am = options.bytes === String ? $util.base64.encode(message.am, 0, message.am.length) : options.bytes === Array ? Array.prototype.slice.call(message.am) : message.am;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                if (message.va != null && message.hasOwnProperty("va"))
                    object.va = options.bytes === String ? $util.base64.encode(message.va, 0, message.va.length) : options.bytes === Array ? Array.prototype.slice.call(message.va) : message.va;
                if (message.vn != null && message.hasOwnProperty("vn"))
                    object.vn = options.bytes === String ? $util.base64.encode(message.vn, 0, message.vn.length) : options.bytes === Array ? Array.prototype.slice.call(message.vn) : message.vn;
                if (message.vs != null && message.hasOwnProperty("vs"))
                    object.vs = options.bytes === String ? $util.base64.encode(message.vs, 0, message.vs.length) : options.bytes === Array ? Array.prototype.slice.call(message.vs) : message.vs;
                return object;
            };

            /**
             * Converts this TransferOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.TransferOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TransferOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TransferOperation
             * @function getTypeUrl
             * @memberof apply.operations.TransferOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TransferOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.TransferOperation";
            };

            return TransferOperation;
        })();

        operations.RoleAccessOperation = (function() {

            /**
             * Properties of a RoleAccessOperation.
             * @memberof apply.operations
             * @interface IRoleAccessOperation
             * @property {Uint8Array|null} [tx] RoleAccessOperation tx
             * @property {Uint8Array|null} [txv] RoleAccessOperation txv
             * @property {Uint8Array|null} [iw] RoleAccessOperation iw
             * @property {Uint8Array|null} ["in"] RoleAccessOperation in
             * @property {Uint8Array|null} [is] RoleAccessOperation is
             * @property {Uint8Array|null} [va] RoleAccessOperation va
             * @property {Uint8Array|null} [vn] RoleAccessOperation vn
             * @property {Uint8Array|null} [vs] RoleAccessOperation vs
             */

            /**
             * Constructs a new RoleAccessOperation.
             * @memberof apply.operations
             * @classdesc Represents a RoleAccessOperation.
             * @implements IRoleAccessOperation
             * @constructor
             * @param {apply.operations.IRoleAccessOperation=} [properties] Properties to set
             */
            function RoleAccessOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * RoleAccessOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.tx = $util.newBuffer([]);

            /**
             * RoleAccessOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.txv = $util.newBuffer([]);

            /**
             * RoleAccessOperation iw.
             * @member {Uint8Array} iw
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.iw = $util.newBuffer([]);

            /**
             * RoleAccessOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * RoleAccessOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.is = $util.newBuffer([]);

            /**
             * RoleAccessOperation va.
             * @member {Uint8Array} va
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.va = $util.newBuffer([]);

            /**
             * RoleAccessOperation vn.
             * @member {Uint8Array} vn
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.vn = $util.newBuffer([]);

            /**
             * RoleAccessOperation vs.
             * @member {Uint8Array} vs
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             */
            RoleAccessOperation.prototype.vs = $util.newBuffer([]);

            /**
             * Creates a new RoleAccessOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {apply.operations.IRoleAccessOperation=} [properties] Properties to set
             * @returns {apply.operations.RoleAccessOperation} RoleAccessOperation instance
             */
            RoleAccessOperation.create = function create(properties) {
                return new RoleAccessOperation(properties);
            };

            /**
             * Encodes the specified RoleAccessOperation message. Does not implicitly {@link apply.operations.RoleAccessOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {apply.operations.IRoleAccessOperation} message RoleAccessOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RoleAccessOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.iw != null && Object.hasOwnProperty.call(message, "iw"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.iw);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.is);
                if (message.va != null && Object.hasOwnProperty.call(message, "va"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.va);
                if (message.vn != null && Object.hasOwnProperty.call(message, "vn"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.vn);
                if (message.vs != null && Object.hasOwnProperty.call(message, "vs"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.vs);
                return writer;
            };

            /**
             * Encodes the specified RoleAccessOperation message, length delimited. Does not implicitly {@link apply.operations.RoleAccessOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {apply.operations.IRoleAccessOperation} message RoleAccessOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            RoleAccessOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a RoleAccessOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.RoleAccessOperation} RoleAccessOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RoleAccessOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.RoleAccessOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.iw = reader.bytes();
                            break;
                        }
                    case 4: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.is = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.va = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.vn = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.vs = reader.bytes();
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
             * Decodes a RoleAccessOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.RoleAccessOperation} RoleAccessOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            RoleAccessOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a RoleAccessOperation message.
             * @function verify
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            RoleAccessOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.iw != null && message.hasOwnProperty("iw"))
                    if (!(message.iw && typeof message.iw.length === "number" || $util.isString(message.iw)))
                        return "iw: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                if (message.va != null && message.hasOwnProperty("va"))
                    if (!(message.va && typeof message.va.length === "number" || $util.isString(message.va)))
                        return "va: buffer expected";
                if (message.vn != null && message.hasOwnProperty("vn"))
                    if (!(message.vn && typeof message.vn.length === "number" || $util.isString(message.vn)))
                        return "vn: buffer expected";
                if (message.vs != null && message.hasOwnProperty("vs"))
                    if (!(message.vs && typeof message.vs.length === "number" || $util.isString(message.vs)))
                        return "vs: buffer expected";
                return null;
            };

            /**
             * Creates a RoleAccessOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.RoleAccessOperation} RoleAccessOperation
             */
            RoleAccessOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.RoleAccessOperation)
                    return object;
                var message = new $root.apply.operations.RoleAccessOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.iw != null)
                    if (typeof object.iw === "string")
                        $util.base64.decode(object.iw, message.iw = $util.newBuffer($util.base64.length(object.iw)), 0);
                    else if (object.iw.length >= 0)
                        message.iw = object.iw;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                if (object.va != null)
                    if (typeof object.va === "string")
                        $util.base64.decode(object.va, message.va = $util.newBuffer($util.base64.length(object.va)), 0);
                    else if (object.va.length >= 0)
                        message.va = object.va;
                if (object.vn != null)
                    if (typeof object.vn === "string")
                        $util.base64.decode(object.vn, message.vn = $util.newBuffer($util.base64.length(object.vn)), 0);
                    else if (object.vn.length >= 0)
                        message.vn = object.vn;
                if (object.vs != null)
                    if (typeof object.vs === "string")
                        $util.base64.decode(object.vs, message.vs = $util.newBuffer($util.base64.length(object.vs)), 0);
                    else if (object.vs.length >= 0)
                        message.vs = object.vs;
                return message;
            };

            /**
             * Creates a plain object from a RoleAccessOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {apply.operations.RoleAccessOperation} message RoleAccessOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            RoleAccessOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.iw = "";
                    else {
                        object.iw = [];
                        if (options.bytes !== Array)
                            object.iw = $util.newBuffer(object.iw);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                    if (options.bytes === String)
                        object.va = "";
                    else {
                        object.va = [];
                        if (options.bytes !== Array)
                            object.va = $util.newBuffer(object.va);
                    }
                    if (options.bytes === String)
                        object.vn = "";
                    else {
                        object.vn = [];
                        if (options.bytes !== Array)
                            object.vn = $util.newBuffer(object.vn);
                    }
                    if (options.bytes === String)
                        object.vs = "";
                    else {
                        object.vs = [];
                        if (options.bytes !== Array)
                            object.vs = $util.newBuffer(object.vs);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.iw != null && message.hasOwnProperty("iw"))
                    object.iw = options.bytes === String ? $util.base64.encode(message.iw, 0, message.iw.length) : options.bytes === Array ? Array.prototype.slice.call(message.iw) : message.iw;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                if (message.va != null && message.hasOwnProperty("va"))
                    object.va = options.bytes === String ? $util.base64.encode(message.va, 0, message.va.length) : options.bytes === Array ? Array.prototype.slice.call(message.va) : message.va;
                if (message.vn != null && message.hasOwnProperty("vn"))
                    object.vn = options.bytes === String ? $util.base64.encode(message.vn, 0, message.vn.length) : options.bytes === Array ? Array.prototype.slice.call(message.vn) : message.vn;
                if (message.vs != null && message.hasOwnProperty("vs"))
                    object.vs = options.bytes === String ? $util.base64.encode(message.vs, 0, message.vs.length) : options.bytes === Array ? Array.prototype.slice.call(message.vs) : message.vs;
                return object;
            };

            /**
             * Converts this RoleAccessOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.RoleAccessOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            RoleAccessOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for RoleAccessOperation
             * @function getTypeUrl
             * @memberof apply.operations.RoleAccessOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            RoleAccessOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.RoleAccessOperation";
            };

            return RoleAccessOperation;
        })();

        operations.BootstrapDeploymentOperation = (function() {

            /**
             * Properties of a BootstrapDeploymentOperation.
             * @memberof apply.operations
             * @interface IBootstrapDeploymentOperation
             * @property {Uint8Array|null} [tx] BootstrapDeploymentOperation tx
             * @property {Uint8Array|null} [txv] BootstrapDeploymentOperation txv
             * @property {Uint8Array|null} [bs] BootstrapDeploymentOperation bs
             * @property {Uint8Array|null} [ic] BootstrapDeploymentOperation ic
             * @property {Uint8Array|null} ["in"] BootstrapDeploymentOperation in
             * @property {Uint8Array|null} [is] BootstrapDeploymentOperation is
             * @property {Uint8Array|null} [va] BootstrapDeploymentOperation va
             * @property {Uint8Array|null} [vn] BootstrapDeploymentOperation vn
             * @property {Uint8Array|null} [vs] BootstrapDeploymentOperation vs
             */

            /**
             * Constructs a new BootstrapDeploymentOperation.
             * @memberof apply.operations
             * @classdesc Represents a BootstrapDeploymentOperation.
             * @implements IBootstrapDeploymentOperation
             * @constructor
             * @param {apply.operations.IBootstrapDeploymentOperation=} [properties] Properties to set
             */
            function BootstrapDeploymentOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * BootstrapDeploymentOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.tx = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.txv = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation bs.
             * @member {Uint8Array} bs
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.bs = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation ic.
             * @member {Uint8Array} ic
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.ic = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.is = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation va.
             * @member {Uint8Array} va
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.va = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation vn.
             * @member {Uint8Array} vn
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.vn = $util.newBuffer([]);

            /**
             * BootstrapDeploymentOperation vs.
             * @member {Uint8Array} vs
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             */
            BootstrapDeploymentOperation.prototype.vs = $util.newBuffer([]);

            /**
             * Creates a new BootstrapDeploymentOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {apply.operations.IBootstrapDeploymentOperation=} [properties] Properties to set
             * @returns {apply.operations.BootstrapDeploymentOperation} BootstrapDeploymentOperation instance
             */
            BootstrapDeploymentOperation.create = function create(properties) {
                return new BootstrapDeploymentOperation(properties);
            };

            /**
             * Encodes the specified BootstrapDeploymentOperation message. Does not implicitly {@link apply.operations.BootstrapDeploymentOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {apply.operations.IBootstrapDeploymentOperation} message BootstrapDeploymentOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            BootstrapDeploymentOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.bs != null && Object.hasOwnProperty.call(message, "bs"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.bs);
                if (message.ic != null && Object.hasOwnProperty.call(message, "ic"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.ic);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.is);
                if (message.va != null && Object.hasOwnProperty.call(message, "va"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.va);
                if (message.vn != null && Object.hasOwnProperty.call(message, "vn"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.vn);
                if (message.vs != null && Object.hasOwnProperty.call(message, "vs"))
                    writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.vs);
                return writer;
            };

            /**
             * Encodes the specified BootstrapDeploymentOperation message, length delimited. Does not implicitly {@link apply.operations.BootstrapDeploymentOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {apply.operations.IBootstrapDeploymentOperation} message BootstrapDeploymentOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            BootstrapDeploymentOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a BootstrapDeploymentOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.BootstrapDeploymentOperation} BootstrapDeploymentOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            BootstrapDeploymentOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.BootstrapDeploymentOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.bs = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.ic = reader.bytes();
                            break;
                        }
                    case 5: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.is = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.va = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.vn = reader.bytes();
                            break;
                        }
                    case 9: {
                            message.vs = reader.bytes();
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
             * Decodes a BootstrapDeploymentOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.BootstrapDeploymentOperation} BootstrapDeploymentOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            BootstrapDeploymentOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a BootstrapDeploymentOperation message.
             * @function verify
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            BootstrapDeploymentOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.bs != null && message.hasOwnProperty("bs"))
                    if (!(message.bs && typeof message.bs.length === "number" || $util.isString(message.bs)))
                        return "bs: buffer expected";
                if (message.ic != null && message.hasOwnProperty("ic"))
                    if (!(message.ic && typeof message.ic.length === "number" || $util.isString(message.ic)))
                        return "ic: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                if (message.va != null && message.hasOwnProperty("va"))
                    if (!(message.va && typeof message.va.length === "number" || $util.isString(message.va)))
                        return "va: buffer expected";
                if (message.vn != null && message.hasOwnProperty("vn"))
                    if (!(message.vn && typeof message.vn.length === "number" || $util.isString(message.vn)))
                        return "vn: buffer expected";
                if (message.vs != null && message.hasOwnProperty("vs"))
                    if (!(message.vs && typeof message.vs.length === "number" || $util.isString(message.vs)))
                        return "vs: buffer expected";
                return null;
            };

            /**
             * Creates a BootstrapDeploymentOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.BootstrapDeploymentOperation} BootstrapDeploymentOperation
             */
            BootstrapDeploymentOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.BootstrapDeploymentOperation)
                    return object;
                var message = new $root.apply.operations.BootstrapDeploymentOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.bs != null)
                    if (typeof object.bs === "string")
                        $util.base64.decode(object.bs, message.bs = $util.newBuffer($util.base64.length(object.bs)), 0);
                    else if (object.bs.length >= 0)
                        message.bs = object.bs;
                if (object.ic != null)
                    if (typeof object.ic === "string")
                        $util.base64.decode(object.ic, message.ic = $util.newBuffer($util.base64.length(object.ic)), 0);
                    else if (object.ic.length >= 0)
                        message.ic = object.ic;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                if (object.va != null)
                    if (typeof object.va === "string")
                        $util.base64.decode(object.va, message.va = $util.newBuffer($util.base64.length(object.va)), 0);
                    else if (object.va.length >= 0)
                        message.va = object.va;
                if (object.vn != null)
                    if (typeof object.vn === "string")
                        $util.base64.decode(object.vn, message.vn = $util.newBuffer($util.base64.length(object.vn)), 0);
                    else if (object.vn.length >= 0)
                        message.vn = object.vn;
                if (object.vs != null)
                    if (typeof object.vs === "string")
                        $util.base64.decode(object.vs, message.vs = $util.newBuffer($util.base64.length(object.vs)), 0);
                    else if (object.vs.length >= 0)
                        message.vs = object.vs;
                return message;
            };

            /**
             * Creates a plain object from a BootstrapDeploymentOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {apply.operations.BootstrapDeploymentOperation} message BootstrapDeploymentOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            BootstrapDeploymentOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.bs = "";
                    else {
                        object.bs = [];
                        if (options.bytes !== Array)
                            object.bs = $util.newBuffer(object.bs);
                    }
                    if (options.bytes === String)
                        object.ic = "";
                    else {
                        object.ic = [];
                        if (options.bytes !== Array)
                            object.ic = $util.newBuffer(object.ic);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                    if (options.bytes === String)
                        object.va = "";
                    else {
                        object.va = [];
                        if (options.bytes !== Array)
                            object.va = $util.newBuffer(object.va);
                    }
                    if (options.bytes === String)
                        object.vn = "";
                    else {
                        object.vn = [];
                        if (options.bytes !== Array)
                            object.vn = $util.newBuffer(object.vn);
                    }
                    if (options.bytes === String)
                        object.vs = "";
                    else {
                        object.vs = [];
                        if (options.bytes !== Array)
                            object.vs = $util.newBuffer(object.vs);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.bs != null && message.hasOwnProperty("bs"))
                    object.bs = options.bytes === String ? $util.base64.encode(message.bs, 0, message.bs.length) : options.bytes === Array ? Array.prototype.slice.call(message.bs) : message.bs;
                if (message.ic != null && message.hasOwnProperty("ic"))
                    object.ic = options.bytes === String ? $util.base64.encode(message.ic, 0, message.ic.length) : options.bytes === Array ? Array.prototype.slice.call(message.ic) : message.ic;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                if (message.va != null && message.hasOwnProperty("va"))
                    object.va = options.bytes === String ? $util.base64.encode(message.va, 0, message.va.length) : options.bytes === Array ? Array.prototype.slice.call(message.va) : message.va;
                if (message.vn != null && message.hasOwnProperty("vn"))
                    object.vn = options.bytes === String ? $util.base64.encode(message.vn, 0, message.vn.length) : options.bytes === Array ? Array.prototype.slice.call(message.vn) : message.vn;
                if (message.vs != null && message.hasOwnProperty("vs"))
                    object.vs = options.bytes === String ? $util.base64.encode(message.vs, 0, message.vs.length) : options.bytes === Array ? Array.prototype.slice.call(message.vs) : message.vs;
                return object;
            };

            /**
             * Converts this BootstrapDeploymentOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            BootstrapDeploymentOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for BootstrapDeploymentOperation
             * @function getTypeUrl
             * @memberof apply.operations.BootstrapDeploymentOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            BootstrapDeploymentOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.BootstrapDeploymentOperation";
            };

            return BootstrapDeploymentOperation;
        })();

        operations.TxOperation = (function() {

            /**
             * Properties of a TxOperation.
             * @memberof apply.operations
             * @interface ITxOperation
             * @property {Uint8Array|null} [tx] TxOperation tx
             * @property {Uint8Array|null} [txv] TxOperation txv
             * @property {Uint8Array|null} [iw] TxOperation iw
             * @property {Uint8Array|null} [ch] TxOperation ch
             * @property {Uint8Array|null} [bs] TxOperation bs
             * @property {Uint8Array|null} [mbs] TxOperation mbs
             * @property {Uint8Array|null} ["in"] TxOperation in
             * @property {Uint8Array|null} [is] TxOperation is
             * @property {Uint8Array|null} [va] TxOperation va
             * @property {Uint8Array|null} [vn] TxOperation vn
             * @property {Uint8Array|null} [vs] TxOperation vs
             */

            /**
             * Constructs a new TxOperation.
             * @memberof apply.operations
             * @classdesc Represents a TxOperation.
             * @implements ITxOperation
             * @constructor
             * @param {apply.operations.ITxOperation=} [properties] Properties to set
             */
            function TxOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * TxOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.tx = $util.newBuffer([]);

            /**
             * TxOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.txv = $util.newBuffer([]);

            /**
             * TxOperation iw.
             * @member {Uint8Array} iw
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.iw = $util.newBuffer([]);

            /**
             * TxOperation ch.
             * @member {Uint8Array} ch
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.ch = $util.newBuffer([]);

            /**
             * TxOperation bs.
             * @member {Uint8Array} bs
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.bs = $util.newBuffer([]);

            /**
             * TxOperation mbs.
             * @member {Uint8Array} mbs
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.mbs = $util.newBuffer([]);

            /**
             * TxOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * TxOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.is = $util.newBuffer([]);

            /**
             * TxOperation va.
             * @member {Uint8Array} va
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.va = $util.newBuffer([]);

            /**
             * TxOperation vn.
             * @member {Uint8Array} vn
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.vn = $util.newBuffer([]);

            /**
             * TxOperation vs.
             * @member {Uint8Array} vs
             * @memberof apply.operations.TxOperation
             * @instance
             */
            TxOperation.prototype.vs = $util.newBuffer([]);

            /**
             * Creates a new TxOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.TxOperation
             * @static
             * @param {apply.operations.ITxOperation=} [properties] Properties to set
             * @returns {apply.operations.TxOperation} TxOperation instance
             */
            TxOperation.create = function create(properties) {
                return new TxOperation(properties);
            };

            /**
             * Encodes the specified TxOperation message. Does not implicitly {@link apply.operations.TxOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.TxOperation
             * @static
             * @param {apply.operations.ITxOperation} message TxOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TxOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.iw != null && Object.hasOwnProperty.call(message, "iw"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.iw);
                if (message.ch != null && Object.hasOwnProperty.call(message, "ch"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.ch);
                if (message.bs != null && Object.hasOwnProperty.call(message, "bs"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.bs);
                if (message.mbs != null && Object.hasOwnProperty.call(message, "mbs"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.mbs);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.is);
                if (message.va != null && Object.hasOwnProperty.call(message, "va"))
                    writer.uint32(/* id 9, wireType 2 =*/74).bytes(message.va);
                if (message.vn != null && Object.hasOwnProperty.call(message, "vn"))
                    writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.vn);
                if (message.vs != null && Object.hasOwnProperty.call(message, "vs"))
                    writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.vs);
                return writer;
            };

            /**
             * Encodes the specified TxOperation message, length delimited. Does not implicitly {@link apply.operations.TxOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.TxOperation
             * @static
             * @param {apply.operations.ITxOperation} message TxOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            TxOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a TxOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.TxOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.TxOperation} TxOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TxOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.TxOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.iw = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.ch = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.bs = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.mbs = reader.bytes();
                            break;
                        }
                    case 7: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.is = reader.bytes();
                            break;
                        }
                    case 9: {
                            message.va = reader.bytes();
                            break;
                        }
                    case 10: {
                            message.vn = reader.bytes();
                            break;
                        }
                    case 11: {
                            message.vs = reader.bytes();
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
             * Decodes a TxOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.TxOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.TxOperation} TxOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            TxOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a TxOperation message.
             * @function verify
             * @memberof apply.operations.TxOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            TxOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.iw != null && message.hasOwnProperty("iw"))
                    if (!(message.iw && typeof message.iw.length === "number" || $util.isString(message.iw)))
                        return "iw: buffer expected";
                if (message.ch != null && message.hasOwnProperty("ch"))
                    if (!(message.ch && typeof message.ch.length === "number" || $util.isString(message.ch)))
                        return "ch: buffer expected";
                if (message.bs != null && message.hasOwnProperty("bs"))
                    if (!(message.bs && typeof message.bs.length === "number" || $util.isString(message.bs)))
                        return "bs: buffer expected";
                if (message.mbs != null && message.hasOwnProperty("mbs"))
                    if (!(message.mbs && typeof message.mbs.length === "number" || $util.isString(message.mbs)))
                        return "mbs: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                if (message.va != null && message.hasOwnProperty("va"))
                    if (!(message.va && typeof message.va.length === "number" || $util.isString(message.va)))
                        return "va: buffer expected";
                if (message.vn != null && message.hasOwnProperty("vn"))
                    if (!(message.vn && typeof message.vn.length === "number" || $util.isString(message.vn)))
                        return "vn: buffer expected";
                if (message.vs != null && message.hasOwnProperty("vs"))
                    if (!(message.vs && typeof message.vs.length === "number" || $util.isString(message.vs)))
                        return "vs: buffer expected";
                return null;
            };

            /**
             * Creates a TxOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.TxOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.TxOperation} TxOperation
             */
            TxOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.TxOperation)
                    return object;
                var message = new $root.apply.operations.TxOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.iw != null)
                    if (typeof object.iw === "string")
                        $util.base64.decode(object.iw, message.iw = $util.newBuffer($util.base64.length(object.iw)), 0);
                    else if (object.iw.length >= 0)
                        message.iw = object.iw;
                if (object.ch != null)
                    if (typeof object.ch === "string")
                        $util.base64.decode(object.ch, message.ch = $util.newBuffer($util.base64.length(object.ch)), 0);
                    else if (object.ch.length >= 0)
                        message.ch = object.ch;
                if (object.bs != null)
                    if (typeof object.bs === "string")
                        $util.base64.decode(object.bs, message.bs = $util.newBuffer($util.base64.length(object.bs)), 0);
                    else if (object.bs.length >= 0)
                        message.bs = object.bs;
                if (object.mbs != null)
                    if (typeof object.mbs === "string")
                        $util.base64.decode(object.mbs, message.mbs = $util.newBuffer($util.base64.length(object.mbs)), 0);
                    else if (object.mbs.length >= 0)
                        message.mbs = object.mbs;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                if (object.va != null)
                    if (typeof object.va === "string")
                        $util.base64.decode(object.va, message.va = $util.newBuffer($util.base64.length(object.va)), 0);
                    else if (object.va.length >= 0)
                        message.va = object.va;
                if (object.vn != null)
                    if (typeof object.vn === "string")
                        $util.base64.decode(object.vn, message.vn = $util.newBuffer($util.base64.length(object.vn)), 0);
                    else if (object.vn.length >= 0)
                        message.vn = object.vn;
                if (object.vs != null)
                    if (typeof object.vs === "string")
                        $util.base64.decode(object.vs, message.vs = $util.newBuffer($util.base64.length(object.vs)), 0);
                    else if (object.vs.length >= 0)
                        message.vs = object.vs;
                return message;
            };

            /**
             * Creates a plain object from a TxOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.TxOperation
             * @static
             * @param {apply.operations.TxOperation} message TxOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            TxOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.iw = "";
                    else {
                        object.iw = [];
                        if (options.bytes !== Array)
                            object.iw = $util.newBuffer(object.iw);
                    }
                    if (options.bytes === String)
                        object.ch = "";
                    else {
                        object.ch = [];
                        if (options.bytes !== Array)
                            object.ch = $util.newBuffer(object.ch);
                    }
                    if (options.bytes === String)
                        object.bs = "";
                    else {
                        object.bs = [];
                        if (options.bytes !== Array)
                            object.bs = $util.newBuffer(object.bs);
                    }
                    if (options.bytes === String)
                        object.mbs = "";
                    else {
                        object.mbs = [];
                        if (options.bytes !== Array)
                            object.mbs = $util.newBuffer(object.mbs);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                    if (options.bytes === String)
                        object.va = "";
                    else {
                        object.va = [];
                        if (options.bytes !== Array)
                            object.va = $util.newBuffer(object.va);
                    }
                    if (options.bytes === String)
                        object.vn = "";
                    else {
                        object.vn = [];
                        if (options.bytes !== Array)
                            object.vn = $util.newBuffer(object.vn);
                    }
                    if (options.bytes === String)
                        object.vs = "";
                    else {
                        object.vs = [];
                        if (options.bytes !== Array)
                            object.vs = $util.newBuffer(object.vs);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.iw != null && message.hasOwnProperty("iw"))
                    object.iw = options.bytes === String ? $util.base64.encode(message.iw, 0, message.iw.length) : options.bytes === Array ? Array.prototype.slice.call(message.iw) : message.iw;
                if (message.ch != null && message.hasOwnProperty("ch"))
                    object.ch = options.bytes === String ? $util.base64.encode(message.ch, 0, message.ch.length) : options.bytes === Array ? Array.prototype.slice.call(message.ch) : message.ch;
                if (message.bs != null && message.hasOwnProperty("bs"))
                    object.bs = options.bytes === String ? $util.base64.encode(message.bs, 0, message.bs.length) : options.bytes === Array ? Array.prototype.slice.call(message.bs) : message.bs;
                if (message.mbs != null && message.hasOwnProperty("mbs"))
                    object.mbs = options.bytes === String ? $util.base64.encode(message.mbs, 0, message.mbs.length) : options.bytes === Array ? Array.prototype.slice.call(message.mbs) : message.mbs;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                if (message.va != null && message.hasOwnProperty("va"))
                    object.va = options.bytes === String ? $util.base64.encode(message.va, 0, message.va.length) : options.bytes === Array ? Array.prototype.slice.call(message.va) : message.va;
                if (message.vn != null && message.hasOwnProperty("vn"))
                    object.vn = options.bytes === String ? $util.base64.encode(message.vn, 0, message.vn.length) : options.bytes === Array ? Array.prototype.slice.call(message.vn) : message.vn;
                if (message.vs != null && message.hasOwnProperty("vs"))
                    object.vs = options.bytes === String ? $util.base64.encode(message.vs, 0, message.vs.length) : options.bytes === Array ? Array.prototype.slice.call(message.vs) : message.vs;
                return object;
            };

            /**
             * Converts this TxOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.TxOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            TxOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for TxOperation
             * @function getTypeUrl
             * @memberof apply.operations.TxOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            TxOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.TxOperation";
            };

            return TxOperation;
        })();

        operations.SetEpochOperation = (function() {

            /**
             * Properties of a SetEpochOperation.
             * @memberof apply.operations
             * @interface ISetEpochOperation
             * @property {Uint8Array|null} [pd] SetEpochOperation pd
             * @property {Array.<Uint8Array>|null} [app] SetEpochOperation app
             */

            /**
             * Constructs a new SetEpochOperation.
             * @memberof apply.operations
             * @classdesc Represents a SetEpochOperation.
             * @implements ISetEpochOperation
             * @constructor
             * @param {apply.operations.ISetEpochOperation=} [properties] Properties to set
             */
            function SetEpochOperation(properties) {
                this.app = [];
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SetEpochOperation pd.
             * @member {Uint8Array} pd
             * @memberof apply.operations.SetEpochOperation
             * @instance
             */
            SetEpochOperation.prototype.pd = $util.newBuffer([]);

            /**
             * SetEpochOperation app.
             * @member {Array.<Uint8Array>} app
             * @memberof apply.operations.SetEpochOperation
             * @instance
             */
            SetEpochOperation.prototype.app = $util.emptyArray;

            /**
             * Creates a new SetEpochOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {apply.operations.ISetEpochOperation=} [properties] Properties to set
             * @returns {apply.operations.SetEpochOperation} SetEpochOperation instance
             */
            SetEpochOperation.create = function create(properties) {
                return new SetEpochOperation(properties);
            };

            /**
             * Encodes the specified SetEpochOperation message. Does not implicitly {@link apply.operations.SetEpochOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {apply.operations.ISetEpochOperation} message SetEpochOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetEpochOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.pd != null && Object.hasOwnProperty.call(message, "pd"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.pd);
                if (message.app != null && message.app.length)
                    for (var i = 0; i < message.app.length; ++i)
                        writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.app[i]);
                return writer;
            };

            /**
             * Encodes the specified SetEpochOperation message, length delimited. Does not implicitly {@link apply.operations.SetEpochOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {apply.operations.ISetEpochOperation} message SetEpochOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetEpochOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SetEpochOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.SetEpochOperation} SetEpochOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetEpochOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.SetEpochOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.pd = reader.bytes();
                            break;
                        }
                    case 2: {
                            if (!(message.app && message.app.length))
                                message.app = [];
                            message.app.push(reader.bytes());
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
             * Decodes a SetEpochOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.SetEpochOperation} SetEpochOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetEpochOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SetEpochOperation message.
             * @function verify
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SetEpochOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.pd != null && message.hasOwnProperty("pd"))
                    if (!(message.pd && typeof message.pd.length === "number" || $util.isString(message.pd)))
                        return "pd: buffer expected";
                if (message.app != null && message.hasOwnProperty("app")) {
                    if (!Array.isArray(message.app))
                        return "app: array expected";
                    for (var i = 0; i < message.app.length; ++i)
                        if (!(message.app[i] && typeof message.app[i].length === "number" || $util.isString(message.app[i])))
                            return "app: buffer[] expected";
                }
                return null;
            };

            /**
             * Creates a SetEpochOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.SetEpochOperation} SetEpochOperation
             */
            SetEpochOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.SetEpochOperation)
                    return object;
                var message = new $root.apply.operations.SetEpochOperation();
                if (object.pd != null)
                    if (typeof object.pd === "string")
                        $util.base64.decode(object.pd, message.pd = $util.newBuffer($util.base64.length(object.pd)), 0);
                    else if (object.pd.length >= 0)
                        message.pd = object.pd;
                if (object.app) {
                    if (!Array.isArray(object.app))
                        throw TypeError(".apply.operations.SetEpochOperation.app: array expected");
                    message.app = [];
                    for (var i = 0; i < object.app.length; ++i)
                        if (typeof object.app[i] === "string")
                            $util.base64.decode(object.app[i], message.app[i] = $util.newBuffer($util.base64.length(object.app[i])), 0);
                        else if (object.app[i].length >= 0)
                            message.app[i] = object.app[i];
                }
                return message;
            };

            /**
             * Creates a plain object from a SetEpochOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {apply.operations.SetEpochOperation} message SetEpochOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SetEpochOperation.toObject = function toObject(message, options) {
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
                    object.pd = options.bytes === String ? $util.base64.encode(message.pd, 0, message.pd.length) : options.bytes === Array ? Array.prototype.slice.call(message.pd) : message.pd;
                if (message.app && message.app.length) {
                    object.app = [];
                    for (var j = 0; j < message.app.length; ++j)
                        object.app[j] = options.bytes === String ? $util.base64.encode(message.app[j], 0, message.app[j].length) : options.bytes === Array ? Array.prototype.slice.call(message.app[j]) : message.app[j];
                }
                return object;
            };

            /**
             * Converts this SetEpochOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.SetEpochOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SetEpochOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SetEpochOperation
             * @function getTypeUrl
             * @memberof apply.operations.SetEpochOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SetEpochOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.SetEpochOperation";
            };

            return SetEpochOperation;
        })();

        operations.SetGenesisEpochOperation = (function() {

            /**
             * Properties of a SetGenesisEpochOperation.
             * @memberof apply.operations
             * @interface ISetGenesisEpochOperation
             * @property {Uint8Array|null} [tx] SetGenesisEpochOperation tx
             * @property {Uint8Array|null} [txv] SetGenesisEpochOperation txv
             * @property {Uint8Array|null} [config_id] SetGenesisEpochOperation config_id
             * @property {Uint8Array|null} ["in"] SetGenesisEpochOperation in
             * @property {Uint8Array|null} [is] SetGenesisEpochOperation is
             */

            /**
             * Constructs a new SetGenesisEpochOperation.
             * @memberof apply.operations
             * @classdesc Represents a SetGenesisEpochOperation.
             * @implements ISetGenesisEpochOperation
             * @constructor
             * @param {apply.operations.ISetGenesisEpochOperation=} [properties] Properties to set
             */
            function SetGenesisEpochOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SetGenesisEpochOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.tx = $util.newBuffer([]);

            /**
             * SetGenesisEpochOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.txv = $util.newBuffer([]);

            /**
             * SetGenesisEpochOperation config_id.
             * @member {Uint8Array} config_id
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.config_id = $util.newBuffer([]);

            /**
             * SetGenesisEpochOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * SetGenesisEpochOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new SetGenesisEpochOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {apply.operations.ISetGenesisEpochOperation=} [properties] Properties to set
             * @returns {apply.operations.SetGenesisEpochOperation} SetGenesisEpochOperation instance
             */
            SetGenesisEpochOperation.create = function create(properties) {
                return new SetGenesisEpochOperation(properties);
            };

            /**
             * Encodes the specified SetGenesisEpochOperation message. Does not implicitly {@link apply.operations.SetGenesisEpochOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {apply.operations.ISetGenesisEpochOperation} message SetGenesisEpochOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetGenesisEpochOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.config_id != null && Object.hasOwnProperty.call(message, "config_id"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.config_id);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified SetGenesisEpochOperation message, length delimited. Does not implicitly {@link apply.operations.SetGenesisEpochOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {apply.operations.ISetGenesisEpochOperation} message SetGenesisEpochOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetGenesisEpochOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SetGenesisEpochOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.SetGenesisEpochOperation} SetGenesisEpochOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetGenesisEpochOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.SetGenesisEpochOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.config_id = reader.bytes();
                            break;
                        }
                    case 4: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 5: {
                            message.is = reader.bytes();
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
             * Decodes a SetGenesisEpochOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.SetGenesisEpochOperation} SetGenesisEpochOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetGenesisEpochOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SetGenesisEpochOperation message.
             * @function verify
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SetGenesisEpochOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.config_id != null && message.hasOwnProperty("config_id"))
                    if (!(message.config_id && typeof message.config_id.length === "number" || $util.isString(message.config_id)))
                        return "config_id: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates a SetGenesisEpochOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.SetGenesisEpochOperation} SetGenesisEpochOperation
             */
            SetGenesisEpochOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.SetGenesisEpochOperation)
                    return object;
                var message = new $root.apply.operations.SetGenesisEpochOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.config_id != null)
                    if (typeof object.config_id === "string")
                        $util.base64.decode(object.config_id, message.config_id = $util.newBuffer($util.base64.length(object.config_id)), 0);
                    else if (object.config_id.length >= 0)
                        message.config_id = object.config_id;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                return message;
            };

            /**
             * Creates a plain object from a SetGenesisEpochOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {apply.operations.SetGenesisEpochOperation} message SetGenesisEpochOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SetGenesisEpochOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.config_id = "";
                    else {
                        object.config_id = [];
                        if (options.bytes !== Array)
                            object.config_id = $util.newBuffer(object.config_id);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.config_id != null && message.hasOwnProperty("config_id"))
                    object.config_id = options.bytes === String ? $util.base64.encode(message.config_id, 0, message.config_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.config_id) : message.config_id;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this SetGenesisEpochOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SetGenesisEpochOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SetGenesisEpochOperation
             * @function getTypeUrl
             * @memberof apply.operations.SetGenesisEpochOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SetGenesisEpochOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.SetGenesisEpochOperation";
            };

            return SetGenesisEpochOperation;
        })();

        operations.LedgerConfigEntry = (function() {

            /**
             * Properties of a LedgerConfigEntry.
             * @memberof apply.operations
             * @interface ILedgerConfigEntry
             * @property {Uint8Array|null} [key] LedgerConfigEntry key
             * @property {Uint8Array|null} [value] LedgerConfigEntry value
             */

            /**
             * Constructs a new LedgerConfigEntry.
             * @memberof apply.operations
             * @classdesc Represents a LedgerConfigEntry.
             * @implements ILedgerConfigEntry
             * @constructor
             * @param {apply.operations.ILedgerConfigEntry=} [properties] Properties to set
             */
            function LedgerConfigEntry(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * LedgerConfigEntry key.
             * @member {Uint8Array} key
             * @memberof apply.operations.LedgerConfigEntry
             * @instance
             */
            LedgerConfigEntry.prototype.key = $util.newBuffer([]);

            /**
             * LedgerConfigEntry value.
             * @member {Uint8Array} value
             * @memberof apply.operations.LedgerConfigEntry
             * @instance
             */
            LedgerConfigEntry.prototype.value = $util.newBuffer([]);

            /**
             * Creates a new LedgerConfigEntry instance using the specified properties.
             * @function create
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {apply.operations.ILedgerConfigEntry=} [properties] Properties to set
             * @returns {apply.operations.LedgerConfigEntry} LedgerConfigEntry instance
             */
            LedgerConfigEntry.create = function create(properties) {
                return new LedgerConfigEntry(properties);
            };

            /**
             * Encodes the specified LedgerConfigEntry message. Does not implicitly {@link apply.operations.LedgerConfigEntry.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {apply.operations.ILedgerConfigEntry} message LedgerConfigEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigEntry.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.key != null && Object.hasOwnProperty.call(message, "key"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.key);
                if (message.value != null && Object.hasOwnProperty.call(message, "value"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.value);
                return writer;
            };

            /**
             * Encodes the specified LedgerConfigEntry message, length delimited. Does not implicitly {@link apply.operations.LedgerConfigEntry.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {apply.operations.ILedgerConfigEntry} message LedgerConfigEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigEntry.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a LedgerConfigEntry message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.LedgerConfigEntry} LedgerConfigEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigEntry.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.LedgerConfigEntry();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.key = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.value = reader.bytes();
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
             * Decodes a LedgerConfigEntry message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.LedgerConfigEntry} LedgerConfigEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigEntry.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a LedgerConfigEntry message.
             * @function verify
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            LedgerConfigEntry.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.key != null && message.hasOwnProperty("key"))
                    if (!(message.key && typeof message.key.length === "number" || $util.isString(message.key)))
                        return "key: buffer expected";
                if (message.value != null && message.hasOwnProperty("value"))
                    if (!(message.value && typeof message.value.length === "number" || $util.isString(message.value)))
                        return "value: buffer expected";
                return null;
            };

            /**
             * Creates a LedgerConfigEntry message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.LedgerConfigEntry} LedgerConfigEntry
             */
            LedgerConfigEntry.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.LedgerConfigEntry)
                    return object;
                var message = new $root.apply.operations.LedgerConfigEntry();
                if (object.key != null)
                    if (typeof object.key === "string")
                        $util.base64.decode(object.key, message.key = $util.newBuffer($util.base64.length(object.key)), 0);
                    else if (object.key.length >= 0)
                        message.key = object.key;
                if (object.value != null)
                    if (typeof object.value === "string")
                        $util.base64.decode(object.value, message.value = $util.newBuffer($util.base64.length(object.value)), 0);
                    else if (object.value.length >= 0)
                        message.value = object.value;
                return message;
            };

            /**
             * Creates a plain object from a LedgerConfigEntry message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {apply.operations.LedgerConfigEntry} message LedgerConfigEntry
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LedgerConfigEntry.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.key = "";
                    else {
                        object.key = [];
                        if (options.bytes !== Array)
                            object.key = $util.newBuffer(object.key);
                    }
                    if (options.bytes === String)
                        object.value = "";
                    else {
                        object.value = [];
                        if (options.bytes !== Array)
                            object.value = $util.newBuffer(object.value);
                    }
                }
                if (message.key != null && message.hasOwnProperty("key"))
                    object.key = options.bytes === String ? $util.base64.encode(message.key, 0, message.key.length) : options.bytes === Array ? Array.prototype.slice.call(message.key) : message.key;
                if (message.value != null && message.hasOwnProperty("value"))
                    object.value = options.bytes === String ? $util.base64.encode(message.value, 0, message.value.length) : options.bytes === Array ? Array.prototype.slice.call(message.value) : message.value;
                return object;
            };

            /**
             * Converts this LedgerConfigEntry to JSON.
             * @function toJSON
             * @memberof apply.operations.LedgerConfigEntry
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LedgerConfigEntry.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for LedgerConfigEntry
             * @function getTypeUrl
             * @memberof apply.operations.LedgerConfigEntry
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            LedgerConfigEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.LedgerConfigEntry";
            };

            return LedgerConfigEntry;
        })();

        operations.LedgerConfigSnapshot = (function() {

            /**
             * Properties of a LedgerConfigSnapshot.
             * @memberof apply.operations
             * @interface ILedgerConfigSnapshot
             * @property {number|null} [format_version] LedgerConfigSnapshot format_version
             * @property {string|null} [commitment_scheme] LedgerConfigSnapshot commitment_scheme
             * @property {string|null} [schema_id] LedgerConfigSnapshot schema_id
             * @property {Array.<apply.operations.ILedgerConfigEntry>|null} [entries] LedgerConfigSnapshot entries
             */

            /**
             * Constructs a new LedgerConfigSnapshot.
             * @memberof apply.operations
             * @classdesc Represents a LedgerConfigSnapshot.
             * @implements ILedgerConfigSnapshot
             * @constructor
             * @param {apply.operations.ILedgerConfigSnapshot=} [properties] Properties to set
             */
            function LedgerConfigSnapshot(properties) {
                this.entries = [];
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * LedgerConfigSnapshot format_version.
             * @member {number} format_version
             * @memberof apply.operations.LedgerConfigSnapshot
             * @instance
             */
            LedgerConfigSnapshot.prototype.format_version = 0;

            /**
             * LedgerConfigSnapshot commitment_scheme.
             * @member {string} commitment_scheme
             * @memberof apply.operations.LedgerConfigSnapshot
             * @instance
             */
            LedgerConfigSnapshot.prototype.commitment_scheme = "";

            /**
             * LedgerConfigSnapshot schema_id.
             * @member {string} schema_id
             * @memberof apply.operations.LedgerConfigSnapshot
             * @instance
             */
            LedgerConfigSnapshot.prototype.schema_id = "";

            /**
             * LedgerConfigSnapshot entries.
             * @member {Array.<apply.operations.ILedgerConfigEntry>} entries
             * @memberof apply.operations.LedgerConfigSnapshot
             * @instance
             */
            LedgerConfigSnapshot.prototype.entries = $util.emptyArray;

            /**
             * Creates a new LedgerConfigSnapshot instance using the specified properties.
             * @function create
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {apply.operations.ILedgerConfigSnapshot=} [properties] Properties to set
             * @returns {apply.operations.LedgerConfigSnapshot} LedgerConfigSnapshot instance
             */
            LedgerConfigSnapshot.create = function create(properties) {
                return new LedgerConfigSnapshot(properties);
            };

            /**
             * Encodes the specified LedgerConfigSnapshot message. Does not implicitly {@link apply.operations.LedgerConfigSnapshot.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {apply.operations.ILedgerConfigSnapshot} message LedgerConfigSnapshot message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigSnapshot.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.format_version != null && Object.hasOwnProperty.call(message, "format_version"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.format_version);
                if (message.commitment_scheme != null && Object.hasOwnProperty.call(message, "commitment_scheme"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.commitment_scheme);
                if (message.schema_id != null && Object.hasOwnProperty.call(message, "schema_id"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schema_id);
                if (message.entries != null && message.entries.length)
                    for (var i = 0; i < message.entries.length; ++i)
                        $root.apply.operations.LedgerConfigEntry.encode(message.entries[i], writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified LedgerConfigSnapshot message, length delimited. Does not implicitly {@link apply.operations.LedgerConfigSnapshot.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {apply.operations.ILedgerConfigSnapshot} message LedgerConfigSnapshot message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigSnapshot.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a LedgerConfigSnapshot message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.LedgerConfigSnapshot} LedgerConfigSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigSnapshot.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.LedgerConfigSnapshot();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.format_version = reader.uint32();
                            break;
                        }
                    case 2: {
                            message.commitment_scheme = reader.string();
                            break;
                        }
                    case 3: {
                            message.schema_id = reader.string();
                            break;
                        }
                    case 4: {
                            if (!(message.entries && message.entries.length))
                                message.entries = [];
                            message.entries.push($root.apply.operations.LedgerConfigEntry.decode(reader, reader.uint32()));
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
             * Decodes a LedgerConfigSnapshot message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.LedgerConfigSnapshot} LedgerConfigSnapshot
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigSnapshot.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a LedgerConfigSnapshot message.
             * @function verify
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            LedgerConfigSnapshot.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.format_version != null && message.hasOwnProperty("format_version"))
                    if (!$util.isInteger(message.format_version))
                        return "format_version: integer expected";
                if (message.commitment_scheme != null && message.hasOwnProperty("commitment_scheme"))
                    if (!$util.isString(message.commitment_scheme))
                        return "commitment_scheme: string expected";
                if (message.schema_id != null && message.hasOwnProperty("schema_id"))
                    if (!$util.isString(message.schema_id))
                        return "schema_id: string expected";
                if (message.entries != null && message.hasOwnProperty("entries")) {
                    if (!Array.isArray(message.entries))
                        return "entries: array expected";
                    for (var i = 0; i < message.entries.length; ++i) {
                        var error = $root.apply.operations.LedgerConfigEntry.verify(message.entries[i]);
                        if (error)
                            return "entries." + error;
                    }
                }
                return null;
            };

            /**
             * Creates a LedgerConfigSnapshot message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.LedgerConfigSnapshot} LedgerConfigSnapshot
             */
            LedgerConfigSnapshot.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.LedgerConfigSnapshot)
                    return object;
                var message = new $root.apply.operations.LedgerConfigSnapshot();
                if (object.format_version != null)
                    message.format_version = object.format_version >>> 0;
                if (object.commitment_scheme != null)
                    message.commitment_scheme = String(object.commitment_scheme);
                if (object.schema_id != null)
                    message.schema_id = String(object.schema_id);
                if (object.entries) {
                    if (!Array.isArray(object.entries))
                        throw TypeError(".apply.operations.LedgerConfigSnapshot.entries: array expected");
                    message.entries = [];
                    for (var i = 0; i < object.entries.length; ++i) {
                        if (typeof object.entries[i] !== "object")
                            throw TypeError(".apply.operations.LedgerConfigSnapshot.entries: object expected");
                        message.entries[i] = $root.apply.operations.LedgerConfigEntry.fromObject(object.entries[i]);
                    }
                }
                return message;
            };

            /**
             * Creates a plain object from a LedgerConfigSnapshot message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {apply.operations.LedgerConfigSnapshot} message LedgerConfigSnapshot
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LedgerConfigSnapshot.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.arrays || options.defaults)
                    object.entries = [];
                if (options.defaults) {
                    object.format_version = 0;
                    object.commitment_scheme = "";
                    object.schema_id = "";
                }
                if (message.format_version != null && message.hasOwnProperty("format_version"))
                    object.format_version = message.format_version;
                if (message.commitment_scheme != null && message.hasOwnProperty("commitment_scheme"))
                    object.commitment_scheme = message.commitment_scheme;
                if (message.schema_id != null && message.hasOwnProperty("schema_id"))
                    object.schema_id = message.schema_id;
                if (message.entries && message.entries.length) {
                    object.entries = [];
                    for (var j = 0; j < message.entries.length; ++j)
                        object.entries[j] = $root.apply.operations.LedgerConfigEntry.toObject(message.entries[j], options);
                }
                return object;
            };

            /**
             * Converts this LedgerConfigSnapshot to JSON.
             * @function toJSON
             * @memberof apply.operations.LedgerConfigSnapshot
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LedgerConfigSnapshot.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for LedgerConfigSnapshot
             * @function getTypeUrl
             * @memberof apply.operations.LedgerConfigSnapshot
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            LedgerConfigSnapshot.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.LedgerConfigSnapshot";
            };

            return LedgerConfigSnapshot;
        })();

        operations.LedgerConfigDescriptor = (function() {

            /**
             * Properties of a LedgerConfigDescriptor.
             * @memberof apply.operations
             * @interface ILedgerConfigDescriptor
             * @property {number|null} [format_version] LedgerConfigDescriptor format_version
             * @property {string|null} [commitment_scheme] LedgerConfigDescriptor commitment_scheme
             * @property {string|null} [schema_id] LedgerConfigDescriptor schema_id
             * @property {number|Long|null} [config_version] LedgerConfigDescriptor config_version
             * @property {Uint8Array|null} [config_root] LedgerConfigDescriptor config_root
             * @property {Uint8Array|null} [config_id] LedgerConfigDescriptor config_id
             * @property {Uint8Array|null} [commit_id] LedgerConfigDescriptor commit_id
             * @property {Uint8Array|null} [content_ref] LedgerConfigDescriptor content_ref
             */

            /**
             * Constructs a new LedgerConfigDescriptor.
             * @memberof apply.operations
             * @classdesc Represents a LedgerConfigDescriptor.
             * @implements ILedgerConfigDescriptor
             * @constructor
             * @param {apply.operations.ILedgerConfigDescriptor=} [properties] Properties to set
             */
            function LedgerConfigDescriptor(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * LedgerConfigDescriptor format_version.
             * @member {number} format_version
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.format_version = 0;

            /**
             * LedgerConfigDescriptor commitment_scheme.
             * @member {string} commitment_scheme
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.commitment_scheme = "";

            /**
             * LedgerConfigDescriptor schema_id.
             * @member {string} schema_id
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.schema_id = "";

            /**
             * LedgerConfigDescriptor config_version.
             * @member {number|Long} config_version
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.config_version = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * LedgerConfigDescriptor config_root.
             * @member {Uint8Array} config_root
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.config_root = $util.newBuffer([]);

            /**
             * LedgerConfigDescriptor config_id.
             * @member {Uint8Array} config_id
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.config_id = $util.newBuffer([]);

            /**
             * LedgerConfigDescriptor commit_id.
             * @member {Uint8Array} commit_id
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.commit_id = $util.newBuffer([]);

            /**
             * LedgerConfigDescriptor content_ref.
             * @member {Uint8Array} content_ref
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             */
            LedgerConfigDescriptor.prototype.content_ref = $util.newBuffer([]);

            /**
             * Creates a new LedgerConfigDescriptor instance using the specified properties.
             * @function create
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {apply.operations.ILedgerConfigDescriptor=} [properties] Properties to set
             * @returns {apply.operations.LedgerConfigDescriptor} LedgerConfigDescriptor instance
             */
            LedgerConfigDescriptor.create = function create(properties) {
                return new LedgerConfigDescriptor(properties);
            };

            /**
             * Encodes the specified LedgerConfigDescriptor message. Does not implicitly {@link apply.operations.LedgerConfigDescriptor.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {apply.operations.ILedgerConfigDescriptor} message LedgerConfigDescriptor message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigDescriptor.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.format_version != null && Object.hasOwnProperty.call(message, "format_version"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.format_version);
                if (message.commitment_scheme != null && Object.hasOwnProperty.call(message, "commitment_scheme"))
                    writer.uint32(/* id 2, wireType 2 =*/18).string(message.commitment_scheme);
                if (message.schema_id != null && Object.hasOwnProperty.call(message, "schema_id"))
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.schema_id);
                if (message.config_version != null && Object.hasOwnProperty.call(message, "config_version"))
                    writer.uint32(/* id 4, wireType 0 =*/32).uint64(message.config_version);
                if (message.config_root != null && Object.hasOwnProperty.call(message, "config_root"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.config_root);
                if (message.config_id != null && Object.hasOwnProperty.call(message, "config_id"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.config_id);
                if (message.commit_id != null && Object.hasOwnProperty.call(message, "commit_id"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.commit_id);
                if (message.content_ref != null && Object.hasOwnProperty.call(message, "content_ref"))
                    writer.uint32(/* id 8, wireType 2 =*/66).bytes(message.content_ref);
                return writer;
            };

            /**
             * Encodes the specified LedgerConfigDescriptor message, length delimited. Does not implicitly {@link apply.operations.LedgerConfigDescriptor.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {apply.operations.ILedgerConfigDescriptor} message LedgerConfigDescriptor message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigDescriptor.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a LedgerConfigDescriptor message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.LedgerConfigDescriptor} LedgerConfigDescriptor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigDescriptor.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.LedgerConfigDescriptor();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.format_version = reader.uint32();
                            break;
                        }
                    case 2: {
                            message.commitment_scheme = reader.string();
                            break;
                        }
                    case 3: {
                            message.schema_id = reader.string();
                            break;
                        }
                    case 4: {
                            message.config_version = reader.uint64();
                            break;
                        }
                    case 5: {
                            message.config_root = reader.bytes();
                            break;
                        }
                    case 6: {
                            message.config_id = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.commit_id = reader.bytes();
                            break;
                        }
                    case 8: {
                            message.content_ref = reader.bytes();
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
             * Decodes a LedgerConfigDescriptor message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.LedgerConfigDescriptor} LedgerConfigDescriptor
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigDescriptor.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a LedgerConfigDescriptor message.
             * @function verify
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            LedgerConfigDescriptor.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.format_version != null && message.hasOwnProperty("format_version"))
                    if (!$util.isInteger(message.format_version))
                        return "format_version: integer expected";
                if (message.commitment_scheme != null && message.hasOwnProperty("commitment_scheme"))
                    if (!$util.isString(message.commitment_scheme))
                        return "commitment_scheme: string expected";
                if (message.schema_id != null && message.hasOwnProperty("schema_id"))
                    if (!$util.isString(message.schema_id))
                        return "schema_id: string expected";
                if (message.config_version != null && message.hasOwnProperty("config_version"))
                    if (!$util.isInteger(message.config_version) && !(message.config_version && $util.isInteger(message.config_version.low) && $util.isInteger(message.config_version.high)))
                        return "config_version: integer|Long expected";
                if (message.config_root != null && message.hasOwnProperty("config_root"))
                    if (!(message.config_root && typeof message.config_root.length === "number" || $util.isString(message.config_root)))
                        return "config_root: buffer expected";
                if (message.config_id != null && message.hasOwnProperty("config_id"))
                    if (!(message.config_id && typeof message.config_id.length === "number" || $util.isString(message.config_id)))
                        return "config_id: buffer expected";
                if (message.commit_id != null && message.hasOwnProperty("commit_id"))
                    if (!(message.commit_id && typeof message.commit_id.length === "number" || $util.isString(message.commit_id)))
                        return "commit_id: buffer expected";
                if (message.content_ref != null && message.hasOwnProperty("content_ref"))
                    if (!(message.content_ref && typeof message.content_ref.length === "number" || $util.isString(message.content_ref)))
                        return "content_ref: buffer expected";
                return null;
            };

            /**
             * Creates a LedgerConfigDescriptor message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.LedgerConfigDescriptor} LedgerConfigDescriptor
             */
            LedgerConfigDescriptor.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.LedgerConfigDescriptor)
                    return object;
                var message = new $root.apply.operations.LedgerConfigDescriptor();
                if (object.format_version != null)
                    message.format_version = object.format_version >>> 0;
                if (object.commitment_scheme != null)
                    message.commitment_scheme = String(object.commitment_scheme);
                if (object.schema_id != null)
                    message.schema_id = String(object.schema_id);
                if (object.config_version != null)
                    if ($util.Long)
                        (message.config_version = $util.Long.fromValue(object.config_version)).unsigned = true;
                    else if (typeof object.config_version === "string")
                        message.config_version = parseInt(object.config_version, 10);
                    else if (typeof object.config_version === "number")
                        message.config_version = object.config_version;
                    else if (typeof object.config_version === "object")
                        message.config_version = new $util.LongBits(object.config_version.low >>> 0, object.config_version.high >>> 0).toNumber(true);
                if (object.config_root != null)
                    if (typeof object.config_root === "string")
                        $util.base64.decode(object.config_root, message.config_root = $util.newBuffer($util.base64.length(object.config_root)), 0);
                    else if (object.config_root.length >= 0)
                        message.config_root = object.config_root;
                if (object.config_id != null)
                    if (typeof object.config_id === "string")
                        $util.base64.decode(object.config_id, message.config_id = $util.newBuffer($util.base64.length(object.config_id)), 0);
                    else if (object.config_id.length >= 0)
                        message.config_id = object.config_id;
                if (object.commit_id != null)
                    if (typeof object.commit_id === "string")
                        $util.base64.decode(object.commit_id, message.commit_id = $util.newBuffer($util.base64.length(object.commit_id)), 0);
                    else if (object.commit_id.length >= 0)
                        message.commit_id = object.commit_id;
                if (object.content_ref != null)
                    if (typeof object.content_ref === "string")
                        $util.base64.decode(object.content_ref, message.content_ref = $util.newBuffer($util.base64.length(object.content_ref)), 0);
                    else if (object.content_ref.length >= 0)
                        message.content_ref = object.content_ref;
                return message;
            };

            /**
             * Creates a plain object from a LedgerConfigDescriptor message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {apply.operations.LedgerConfigDescriptor} message LedgerConfigDescriptor
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LedgerConfigDescriptor.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.format_version = 0;
                    object.commitment_scheme = "";
                    object.schema_id = "";
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.config_version = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.config_version = options.longs === String ? "0" : 0;
                    if (options.bytes === String)
                        object.config_root = "";
                    else {
                        object.config_root = [];
                        if (options.bytes !== Array)
                            object.config_root = $util.newBuffer(object.config_root);
                    }
                    if (options.bytes === String)
                        object.config_id = "";
                    else {
                        object.config_id = [];
                        if (options.bytes !== Array)
                            object.config_id = $util.newBuffer(object.config_id);
                    }
                    if (options.bytes === String)
                        object.commit_id = "";
                    else {
                        object.commit_id = [];
                        if (options.bytes !== Array)
                            object.commit_id = $util.newBuffer(object.commit_id);
                    }
                    if (options.bytes === String)
                        object.content_ref = "";
                    else {
                        object.content_ref = [];
                        if (options.bytes !== Array)
                            object.content_ref = $util.newBuffer(object.content_ref);
                    }
                }
                if (message.format_version != null && message.hasOwnProperty("format_version"))
                    object.format_version = message.format_version;
                if (message.commitment_scheme != null && message.hasOwnProperty("commitment_scheme"))
                    object.commitment_scheme = message.commitment_scheme;
                if (message.schema_id != null && message.hasOwnProperty("schema_id"))
                    object.schema_id = message.schema_id;
                if (message.config_version != null && message.hasOwnProperty("config_version"))
                    if (typeof message.config_version === "number")
                        object.config_version = options.longs === String ? String(message.config_version) : message.config_version;
                    else
                        object.config_version = options.longs === String ? $util.Long.prototype.toString.call(message.config_version) : options.longs === Number ? new $util.LongBits(message.config_version.low >>> 0, message.config_version.high >>> 0).toNumber(true) : message.config_version;
                if (message.config_root != null && message.hasOwnProperty("config_root"))
                    object.config_root = options.bytes === String ? $util.base64.encode(message.config_root, 0, message.config_root.length) : options.bytes === Array ? Array.prototype.slice.call(message.config_root) : message.config_root;
                if (message.config_id != null && message.hasOwnProperty("config_id"))
                    object.config_id = options.bytes === String ? $util.base64.encode(message.config_id, 0, message.config_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.config_id) : message.config_id;
                if (message.commit_id != null && message.hasOwnProperty("commit_id"))
                    object.commit_id = options.bytes === String ? $util.base64.encode(message.commit_id, 0, message.commit_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.commit_id) : message.commit_id;
                if (message.content_ref != null && message.hasOwnProperty("content_ref"))
                    object.content_ref = options.bytes === String ? $util.base64.encode(message.content_ref, 0, message.content_ref.length) : options.bytes === Array ? Array.prototype.slice.call(message.content_ref) : message.content_ref;
                return object;
            };

            /**
             * Converts this LedgerConfigDescriptor to JSON.
             * @function toJSON
             * @memberof apply.operations.LedgerConfigDescriptor
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LedgerConfigDescriptor.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for LedgerConfigDescriptor
             * @function getTypeUrl
             * @memberof apply.operations.LedgerConfigDescriptor
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            LedgerConfigDescriptor.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.LedgerConfigDescriptor";
            };

            return LedgerConfigDescriptor;
        })();

        operations.LedgerConfigRootRecord = (function() {

            /**
             * Properties of a LedgerConfigRootRecord.
             * @memberof apply.operations
             * @interface ILedgerConfigRootRecord
             * @property {Uint8Array|null} [previous_commit_id] LedgerConfigRootRecord previous_commit_id
             * @property {apply.operations.ILedgerConfigDescriptor|null} [descriptor] LedgerConfigRootRecord descriptor
             */

            /**
             * Constructs a new LedgerConfigRootRecord.
             * @memberof apply.operations
             * @classdesc Represents a LedgerConfigRootRecord.
             * @implements ILedgerConfigRootRecord
             * @constructor
             * @param {apply.operations.ILedgerConfigRootRecord=} [properties] Properties to set
             */
            function LedgerConfigRootRecord(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * LedgerConfigRootRecord previous_commit_id.
             * @member {Uint8Array} previous_commit_id
             * @memberof apply.operations.LedgerConfigRootRecord
             * @instance
             */
            LedgerConfigRootRecord.prototype.previous_commit_id = $util.newBuffer([]);

            /**
             * LedgerConfigRootRecord descriptor.
             * @member {apply.operations.ILedgerConfigDescriptor|null|undefined} descriptor
             * @memberof apply.operations.LedgerConfigRootRecord
             * @instance
             */
            LedgerConfigRootRecord.prototype.descriptor = null;

            /**
             * Creates a new LedgerConfigRootRecord instance using the specified properties.
             * @function create
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {apply.operations.ILedgerConfigRootRecord=} [properties] Properties to set
             * @returns {apply.operations.LedgerConfigRootRecord} LedgerConfigRootRecord instance
             */
            LedgerConfigRootRecord.create = function create(properties) {
                return new LedgerConfigRootRecord(properties);
            };

            /**
             * Encodes the specified LedgerConfigRootRecord message. Does not implicitly {@link apply.operations.LedgerConfigRootRecord.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {apply.operations.ILedgerConfigRootRecord} message LedgerConfigRootRecord message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigRootRecord.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.previous_commit_id != null && Object.hasOwnProperty.call(message, "previous_commit_id"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.previous_commit_id);
                if (message.descriptor != null && Object.hasOwnProperty.call(message, "descriptor"))
                    $root.apply.operations.LedgerConfigDescriptor.encode(message.descriptor, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified LedgerConfigRootRecord message, length delimited. Does not implicitly {@link apply.operations.LedgerConfigRootRecord.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {apply.operations.ILedgerConfigRootRecord} message LedgerConfigRootRecord message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigRootRecord.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a LedgerConfigRootRecord message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.LedgerConfigRootRecord} LedgerConfigRootRecord
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigRootRecord.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.LedgerConfigRootRecord();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.previous_commit_id = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.descriptor = $root.apply.operations.LedgerConfigDescriptor.decode(reader, reader.uint32());
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
             * Decodes a LedgerConfigRootRecord message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.LedgerConfigRootRecord} LedgerConfigRootRecord
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigRootRecord.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a LedgerConfigRootRecord message.
             * @function verify
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            LedgerConfigRootRecord.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.previous_commit_id != null && message.hasOwnProperty("previous_commit_id"))
                    if (!(message.previous_commit_id && typeof message.previous_commit_id.length === "number" || $util.isString(message.previous_commit_id)))
                        return "previous_commit_id: buffer expected";
                if (message.descriptor != null && message.hasOwnProperty("descriptor")) {
                    var error = $root.apply.operations.LedgerConfigDescriptor.verify(message.descriptor);
                    if (error)
                        return "descriptor." + error;
                }
                return null;
            };

            /**
             * Creates a LedgerConfigRootRecord message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.LedgerConfigRootRecord} LedgerConfigRootRecord
             */
            LedgerConfigRootRecord.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.LedgerConfigRootRecord)
                    return object;
                var message = new $root.apply.operations.LedgerConfigRootRecord();
                if (object.previous_commit_id != null)
                    if (typeof object.previous_commit_id === "string")
                        $util.base64.decode(object.previous_commit_id, message.previous_commit_id = $util.newBuffer($util.base64.length(object.previous_commit_id)), 0);
                    else if (object.previous_commit_id.length >= 0)
                        message.previous_commit_id = object.previous_commit_id;
                if (object.descriptor != null) {
                    if (typeof object.descriptor !== "object")
                        throw TypeError(".apply.operations.LedgerConfigRootRecord.descriptor: object expected");
                    message.descriptor = $root.apply.operations.LedgerConfigDescriptor.fromObject(object.descriptor);
                }
                return message;
            };

            /**
             * Creates a plain object from a LedgerConfigRootRecord message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {apply.operations.LedgerConfigRootRecord} message LedgerConfigRootRecord
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LedgerConfigRootRecord.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.previous_commit_id = "";
                    else {
                        object.previous_commit_id = [];
                        if (options.bytes !== Array)
                            object.previous_commit_id = $util.newBuffer(object.previous_commit_id);
                    }
                    object.descriptor = null;
                }
                if (message.previous_commit_id != null && message.hasOwnProperty("previous_commit_id"))
                    object.previous_commit_id = options.bytes === String ? $util.base64.encode(message.previous_commit_id, 0, message.previous_commit_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.previous_commit_id) : message.previous_commit_id;
                if (message.descriptor != null && message.hasOwnProperty("descriptor"))
                    object.descriptor = $root.apply.operations.LedgerConfigDescriptor.toObject(message.descriptor, options);
                return object;
            };

            /**
             * Converts this LedgerConfigRootRecord to JSON.
             * @function toJSON
             * @memberof apply.operations.LedgerConfigRootRecord
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LedgerConfigRootRecord.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for LedgerConfigRootRecord
             * @function getTypeUrl
             * @memberof apply.operations.LedgerConfigRootRecord
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            LedgerConfigRootRecord.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.LedgerConfigRootRecord";
            };

            return LedgerConfigRootRecord;
        })();

        operations.SetLedgerConfigOperation = (function() {

            /**
             * Properties of a SetLedgerConfigOperation.
             * @memberof apply.operations
             * @interface ISetLedgerConfigOperation
             * @property {Uint8Array|null} [tx] SetLedgerConfigOperation tx
             * @property {Uint8Array|null} [txv] SetLedgerConfigOperation txv
             * @property {Uint8Array|null} [previous_commit_id] SetLedgerConfigOperation previous_commit_id
             * @property {apply.operations.ILedgerConfigSnapshot|null} [snapshot] SetLedgerConfigOperation snapshot
             * @property {Uint8Array|null} [content_ref] SetLedgerConfigOperation content_ref
             * @property {Uint8Array|null} ["in"] SetLedgerConfigOperation in
             * @property {Uint8Array|null} [is] SetLedgerConfigOperation is
             */

            /**
             * Constructs a new SetLedgerConfigOperation.
             * @memberof apply.operations
             * @classdesc Represents a SetLedgerConfigOperation.
             * @implements ISetLedgerConfigOperation
             * @constructor
             * @param {apply.operations.ISetLedgerConfigOperation=} [properties] Properties to set
             */
            function SetLedgerConfigOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SetLedgerConfigOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.tx = $util.newBuffer([]);

            /**
             * SetLedgerConfigOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.txv = $util.newBuffer([]);

            /**
             * SetLedgerConfigOperation previous_commit_id.
             * @member {Uint8Array} previous_commit_id
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.previous_commit_id = $util.newBuffer([]);

            /**
             * SetLedgerConfigOperation snapshot.
             * @member {apply.operations.ILedgerConfigSnapshot|null|undefined} snapshot
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.snapshot = null;

            /**
             * SetLedgerConfigOperation content_ref.
             * @member {Uint8Array} content_ref
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.content_ref = $util.newBuffer([]);

            /**
             * SetLedgerConfigOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * SetLedgerConfigOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             */
            SetLedgerConfigOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new SetLedgerConfigOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {apply.operations.ISetLedgerConfigOperation=} [properties] Properties to set
             * @returns {apply.operations.SetLedgerConfigOperation} SetLedgerConfigOperation instance
             */
            SetLedgerConfigOperation.create = function create(properties) {
                return new SetLedgerConfigOperation(properties);
            };

            /**
             * Encodes the specified SetLedgerConfigOperation message. Does not implicitly {@link apply.operations.SetLedgerConfigOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {apply.operations.ISetLedgerConfigOperation} message SetLedgerConfigOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetLedgerConfigOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.previous_commit_id != null && Object.hasOwnProperty.call(message, "previous_commit_id"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.previous_commit_id);
                if (message.snapshot != null && Object.hasOwnProperty.call(message, "snapshot"))
                    $root.apply.operations.LedgerConfigSnapshot.encode(message.snapshot, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                if (message.content_ref != null && Object.hasOwnProperty.call(message, "content_ref"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.content_ref);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 7, wireType 2 =*/58).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified SetLedgerConfigOperation message, length delimited. Does not implicitly {@link apply.operations.SetLedgerConfigOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {apply.operations.ISetLedgerConfigOperation} message SetLedgerConfigOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetLedgerConfigOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SetLedgerConfigOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.SetLedgerConfigOperation} SetLedgerConfigOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetLedgerConfigOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.SetLedgerConfigOperation();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.tx = reader.bytes();
                            break;
                        }
                    case 2: {
                            message.txv = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.previous_commit_id = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.snapshot = $root.apply.operations.LedgerConfigSnapshot.decode(reader, reader.uint32());
                            break;
                        }
                    case 5: {
                            message.content_ref = reader.bytes();
                            break;
                        }
                    case 6: {
                            message["in"] = reader.bytes();
                            break;
                        }
                    case 7: {
                            message.is = reader.bytes();
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
             * Decodes a SetLedgerConfigOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.SetLedgerConfigOperation} SetLedgerConfigOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetLedgerConfigOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SetLedgerConfigOperation message.
             * @function verify
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SetLedgerConfigOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.previous_commit_id != null && message.hasOwnProperty("previous_commit_id"))
                    if (!(message.previous_commit_id && typeof message.previous_commit_id.length === "number" || $util.isString(message.previous_commit_id)))
                        return "previous_commit_id: buffer expected";
                if (message.snapshot != null && message.hasOwnProperty("snapshot")) {
                    var error = $root.apply.operations.LedgerConfigSnapshot.verify(message.snapshot);
                    if (error)
                        return "snapshot." + error;
                }
                if (message.content_ref != null && message.hasOwnProperty("content_ref"))
                    if (!(message.content_ref && typeof message.content_ref.length === "number" || $util.isString(message.content_ref)))
                        return "content_ref: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates a SetLedgerConfigOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.SetLedgerConfigOperation} SetLedgerConfigOperation
             */
            SetLedgerConfigOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.SetLedgerConfigOperation)
                    return object;
                var message = new $root.apply.operations.SetLedgerConfigOperation();
                if (object.tx != null)
                    if (typeof object.tx === "string")
                        $util.base64.decode(object.tx, message.tx = $util.newBuffer($util.base64.length(object.tx)), 0);
                    else if (object.tx.length >= 0)
                        message.tx = object.tx;
                if (object.txv != null)
                    if (typeof object.txv === "string")
                        $util.base64.decode(object.txv, message.txv = $util.newBuffer($util.base64.length(object.txv)), 0);
                    else if (object.txv.length >= 0)
                        message.txv = object.txv;
                if (object.previous_commit_id != null)
                    if (typeof object.previous_commit_id === "string")
                        $util.base64.decode(object.previous_commit_id, message.previous_commit_id = $util.newBuffer($util.base64.length(object.previous_commit_id)), 0);
                    else if (object.previous_commit_id.length >= 0)
                        message.previous_commit_id = object.previous_commit_id;
                if (object.snapshot != null) {
                    if (typeof object.snapshot !== "object")
                        throw TypeError(".apply.operations.SetLedgerConfigOperation.snapshot: object expected");
                    message.snapshot = $root.apply.operations.LedgerConfigSnapshot.fromObject(object.snapshot);
                }
                if (object.content_ref != null)
                    if (typeof object.content_ref === "string")
                        $util.base64.decode(object.content_ref, message.content_ref = $util.newBuffer($util.base64.length(object.content_ref)), 0);
                    else if (object.content_ref.length >= 0)
                        message.content_ref = object.content_ref;
                if (object["in"] != null)
                    if (typeof object["in"] === "string")
                        $util.base64.decode(object["in"], message["in"] = $util.newBuffer($util.base64.length(object["in"])), 0);
                    else if (object["in"].length >= 0)
                        message["in"] = object["in"];
                if (object.is != null)
                    if (typeof object.is === "string")
                        $util.base64.decode(object.is, message.is = $util.newBuffer($util.base64.length(object.is)), 0);
                    else if (object.is.length >= 0)
                        message.is = object.is;
                return message;
            };

            /**
             * Creates a plain object from a SetLedgerConfigOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {apply.operations.SetLedgerConfigOperation} message SetLedgerConfigOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SetLedgerConfigOperation.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if (options.bytes === String)
                        object.tx = "";
                    else {
                        object.tx = [];
                        if (options.bytes !== Array)
                            object.tx = $util.newBuffer(object.tx);
                    }
                    if (options.bytes === String)
                        object.txv = "";
                    else {
                        object.txv = [];
                        if (options.bytes !== Array)
                            object.txv = $util.newBuffer(object.txv);
                    }
                    if (options.bytes === String)
                        object.previous_commit_id = "";
                    else {
                        object.previous_commit_id = [];
                        if (options.bytes !== Array)
                            object.previous_commit_id = $util.newBuffer(object.previous_commit_id);
                    }
                    object.snapshot = null;
                    if (options.bytes === String)
                        object.content_ref = "";
                    else {
                        object.content_ref = [];
                        if (options.bytes !== Array)
                            object.content_ref = $util.newBuffer(object.content_ref);
                    }
                    if (options.bytes === String)
                        object["in"] = "";
                    else {
                        object["in"] = [];
                        if (options.bytes !== Array)
                            object["in"] = $util.newBuffer(object["in"]);
                    }
                    if (options.bytes === String)
                        object.is = "";
                    else {
                        object.is = [];
                        if (options.bytes !== Array)
                            object.is = $util.newBuffer(object.is);
                    }
                }
                if (message.tx != null && message.hasOwnProperty("tx"))
                    object.tx = options.bytes === String ? $util.base64.encode(message.tx, 0, message.tx.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx) : message.tx;
                if (message.txv != null && message.hasOwnProperty("txv"))
                    object.txv = options.bytes === String ? $util.base64.encode(message.txv, 0, message.txv.length) : options.bytes === Array ? Array.prototype.slice.call(message.txv) : message.txv;
                if (message.previous_commit_id != null && message.hasOwnProperty("previous_commit_id"))
                    object.previous_commit_id = options.bytes === String ? $util.base64.encode(message.previous_commit_id, 0, message.previous_commit_id.length) : options.bytes === Array ? Array.prototype.slice.call(message.previous_commit_id) : message.previous_commit_id;
                if (message.snapshot != null && message.hasOwnProperty("snapshot"))
                    object.snapshot = $root.apply.operations.LedgerConfigSnapshot.toObject(message.snapshot, options);
                if (message.content_ref != null && message.hasOwnProperty("content_ref"))
                    object.content_ref = options.bytes === String ? $util.base64.encode(message.content_ref, 0, message.content_ref.length) : options.bytes === Array ? Array.prototype.slice.call(message.content_ref) : message.content_ref;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this SetLedgerConfigOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.SetLedgerConfigOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SetLedgerConfigOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SetLedgerConfigOperation
             * @function getTypeUrl
             * @memberof apply.operations.SetLedgerConfigOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SetLedgerConfigOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.SetLedgerConfigOperation";
            };

            return SetLedgerConfigOperation;
        })();

        operations.LedgerConfigTransactionReceipt = (function() {

            /**
             * Properties of a LedgerConfigTransactionReceipt.
             * @memberof apply.operations
             * @interface ILedgerConfigTransactionReceipt
             * @property {apply.operations.OperationType|null} [operation_type] LedgerConfigTransactionReceipt operation_type
             * @property {Uint8Array|null} [tx_hash] LedgerConfigTransactionReceipt tx_hash
             * @property {Uint8Array|null} [requester_address] LedgerConfigTransactionReceipt requester_address
             * @property {apply.operations.ILedgerConfigRootRecord|null} [root_record] LedgerConfigTransactionReceipt root_record
             */

            /**
             * Constructs a new LedgerConfigTransactionReceipt.
             * @memberof apply.operations
             * @classdesc Represents a LedgerConfigTransactionReceipt.
             * @implements ILedgerConfigTransactionReceipt
             * @constructor
             * @param {apply.operations.ILedgerConfigTransactionReceipt=} [properties] Properties to set
             */
            function LedgerConfigTransactionReceipt(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * LedgerConfigTransactionReceipt operation_type.
             * @member {apply.operations.OperationType} operation_type
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @instance
             */
            LedgerConfigTransactionReceipt.prototype.operation_type = 0;

            /**
             * LedgerConfigTransactionReceipt tx_hash.
             * @member {Uint8Array} tx_hash
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @instance
             */
            LedgerConfigTransactionReceipt.prototype.tx_hash = $util.newBuffer([]);

            /**
             * LedgerConfigTransactionReceipt requester_address.
             * @member {Uint8Array} requester_address
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @instance
             */
            LedgerConfigTransactionReceipt.prototype.requester_address = $util.newBuffer([]);

            /**
             * LedgerConfigTransactionReceipt root_record.
             * @member {apply.operations.ILedgerConfigRootRecord|null|undefined} root_record
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @instance
             */
            LedgerConfigTransactionReceipt.prototype.root_record = null;

            /**
             * Creates a new LedgerConfigTransactionReceipt instance using the specified properties.
             * @function create
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {apply.operations.ILedgerConfigTransactionReceipt=} [properties] Properties to set
             * @returns {apply.operations.LedgerConfigTransactionReceipt} LedgerConfigTransactionReceipt instance
             */
            LedgerConfigTransactionReceipt.create = function create(properties) {
                return new LedgerConfigTransactionReceipt(properties);
            };

            /**
             * Encodes the specified LedgerConfigTransactionReceipt message. Does not implicitly {@link apply.operations.LedgerConfigTransactionReceipt.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {apply.operations.ILedgerConfigTransactionReceipt} message LedgerConfigTransactionReceipt message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigTransactionReceipt.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.operation_type != null && Object.hasOwnProperty.call(message, "operation_type"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int32(message.operation_type);
                if (message.tx_hash != null && Object.hasOwnProperty.call(message, "tx_hash"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.tx_hash);
                if (message.requester_address != null && Object.hasOwnProperty.call(message, "requester_address"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.requester_address);
                if (message.root_record != null && Object.hasOwnProperty.call(message, "root_record"))
                    $root.apply.operations.LedgerConfigRootRecord.encode(message.root_record, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
                return writer;
            };

            /**
             * Encodes the specified LedgerConfigTransactionReceipt message, length delimited. Does not implicitly {@link apply.operations.LedgerConfigTransactionReceipt.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {apply.operations.ILedgerConfigTransactionReceipt} message LedgerConfigTransactionReceipt message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            LedgerConfigTransactionReceipt.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a LedgerConfigTransactionReceipt message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.LedgerConfigTransactionReceipt} LedgerConfigTransactionReceipt
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigTransactionReceipt.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.LedgerConfigTransactionReceipt();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.operation_type = reader.int32();
                            break;
                        }
                    case 2: {
                            message.tx_hash = reader.bytes();
                            break;
                        }
                    case 3: {
                            message.requester_address = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.root_record = $root.apply.operations.LedgerConfigRootRecord.decode(reader, reader.uint32());
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
             * Decodes a LedgerConfigTransactionReceipt message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.LedgerConfigTransactionReceipt} LedgerConfigTransactionReceipt
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            LedgerConfigTransactionReceipt.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a LedgerConfigTransactionReceipt message.
             * @function verify
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            LedgerConfigTransactionReceipt.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.operation_type != null && message.hasOwnProperty("operation_type"))
                    switch (message.operation_type) {
                    default:
                        return "operation_type: enum value expected";
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
                        break;
                    }
                if (message.tx_hash != null && message.hasOwnProperty("tx_hash"))
                    if (!(message.tx_hash && typeof message.tx_hash.length === "number" || $util.isString(message.tx_hash)))
                        return "tx_hash: buffer expected";
                if (message.requester_address != null && message.hasOwnProperty("requester_address"))
                    if (!(message.requester_address && typeof message.requester_address.length === "number" || $util.isString(message.requester_address)))
                        return "requester_address: buffer expected";
                if (message.root_record != null && message.hasOwnProperty("root_record")) {
                    var error = $root.apply.operations.LedgerConfigRootRecord.verify(message.root_record);
                    if (error)
                        return "root_record." + error;
                }
                return null;
            };

            /**
             * Creates a LedgerConfigTransactionReceipt message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.LedgerConfigTransactionReceipt} LedgerConfigTransactionReceipt
             */
            LedgerConfigTransactionReceipt.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.LedgerConfigTransactionReceipt)
                    return object;
                var message = new $root.apply.operations.LedgerConfigTransactionReceipt();
                switch (object.operation_type) {
                default:
                    if (typeof object.operation_type === "number") {
                        message.operation_type = object.operation_type;
                        break;
                    }
                    break;
                case "UNKNOWN":
                case 0:
                    message.operation_type = 0;
                    break;
                case "ADD_ADMIN":
                case 1:
                    message.operation_type = 1;
                    break;
                case "DISABLE_INITIALIZATION":
                case 2:
                    message.operation_type = 2;
                    break;
                case "BALANCE_INITIALIZATION":
                case 3:
                    message.operation_type = 3;
                    break;
                case "APPEND_WHITELIST":
                case 4:
                    message.operation_type = 4;
                    break;
                case "ADD_WRITER":
                case 5:
                    message.operation_type = 5;
                    break;
                case "REMOVE_WRITER":
                case 6:
                    message.operation_type = 6;
                    break;
                case "ADMIN_RECOVERY":
                case 7:
                    message.operation_type = 7;
                    break;
                case "ADD_INDEXER":
                case 8:
                    message.operation_type = 8;
                    break;
                case "REMOVE_INDEXER":
                case 9:
                    message.operation_type = 9;
                    break;
                case "BAN_VALIDATOR":
                case 10:
                    message.operation_type = 10;
                    break;
                case "BOOTSTRAP_DEPLOYMENT":
                case 11:
                    message.operation_type = 11;
                    break;
                case "TX":
                case 12:
                    message.operation_type = 12;
                    break;
                case "TRANSFER":
                case 13:
                    message.operation_type = 13;
                    break;
                case "SET_EPOCH":
                case 14:
                    message.operation_type = 14;
                    break;
                case "SET_GENESIS_EPOCH":
                case 15:
                    message.operation_type = 15;
                    break;
                case "SET_LEDGER_CONFIG":
                case 16:
                    message.operation_type = 16;
                    break;
                }
                if (object.tx_hash != null)
                    if (typeof object.tx_hash === "string")
                        $util.base64.decode(object.tx_hash, message.tx_hash = $util.newBuffer($util.base64.length(object.tx_hash)), 0);
                    else if (object.tx_hash.length >= 0)
                        message.tx_hash = object.tx_hash;
                if (object.requester_address != null)
                    if (typeof object.requester_address === "string")
                        $util.base64.decode(object.requester_address, message.requester_address = $util.newBuffer($util.base64.length(object.requester_address)), 0);
                    else if (object.requester_address.length >= 0)
                        message.requester_address = object.requester_address;
                if (object.root_record != null) {
                    if (typeof object.root_record !== "object")
                        throw TypeError(".apply.operations.LedgerConfigTransactionReceipt.root_record: object expected");
                    message.root_record = $root.apply.operations.LedgerConfigRootRecord.fromObject(object.root_record);
                }
                return message;
            };

            /**
             * Creates a plain object from a LedgerConfigTransactionReceipt message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {apply.operations.LedgerConfigTransactionReceipt} message LedgerConfigTransactionReceipt
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            LedgerConfigTransactionReceipt.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.operation_type = options.enums === String ? "UNKNOWN" : 0;
                    if (options.bytes === String)
                        object.tx_hash = "";
                    else {
                        object.tx_hash = [];
                        if (options.bytes !== Array)
                            object.tx_hash = $util.newBuffer(object.tx_hash);
                    }
                    if (options.bytes === String)
                        object.requester_address = "";
                    else {
                        object.requester_address = [];
                        if (options.bytes !== Array)
                            object.requester_address = $util.newBuffer(object.requester_address);
                    }
                    object.root_record = null;
                }
                if (message.operation_type != null && message.hasOwnProperty("operation_type"))
                    object.operation_type = options.enums === String ? $root.apply.operations.OperationType[message.operation_type] === undefined ? message.operation_type : $root.apply.operations.OperationType[message.operation_type] : message.operation_type;
                if (message.tx_hash != null && message.hasOwnProperty("tx_hash"))
                    object.tx_hash = options.bytes === String ? $util.base64.encode(message.tx_hash, 0, message.tx_hash.length) : options.bytes === Array ? Array.prototype.slice.call(message.tx_hash) : message.tx_hash;
                if (message.requester_address != null && message.hasOwnProperty("requester_address"))
                    object.requester_address = options.bytes === String ? $util.base64.encode(message.requester_address, 0, message.requester_address.length) : options.bytes === Array ? Array.prototype.slice.call(message.requester_address) : message.requester_address;
                if (message.root_record != null && message.hasOwnProperty("root_record"))
                    object.root_record = $root.apply.operations.LedgerConfigRootRecord.toObject(message.root_record, options);
                return object;
            };

            /**
             * Converts this LedgerConfigTransactionReceipt to JSON.
             * @function toJSON
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            LedgerConfigTransactionReceipt.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for LedgerConfigTransactionReceipt
             * @function getTypeUrl
             * @memberof apply.operations.LedgerConfigTransactionReceipt
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            LedgerConfigTransactionReceipt.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.LedgerConfigTransactionReceipt";
            };

            return LedgerConfigTransactionReceipt;
        })();

        return operations;
    })();

    return apply;
})();

module.exports = $root;
