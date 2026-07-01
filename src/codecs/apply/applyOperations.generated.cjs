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
             * @property {apply.operations.ISetVdfParamsOperation|null} [vpo] Operation vpo
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
             * Operation vpo.
             * @member {apply.operations.ISetVdfParamsOperation|null|undefined} vpo
             * @memberof apply.operations.Operation
             * @instance
             */
            Operation.prototype.vpo = null;

            // OneOf field names bound to virtual getters and setters
            var $oneOfFields;

            /**
             * Operation value.
             * @member {"cao"|"aco"|"bio"|"tro"|"rao"|"bdo"|"txo"|"seo"|"sgo"|"vpo"|undefined} value
             * @memberof apply.operations.Operation
             * @instance
             */
            Object.defineProperty(Operation.prototype, "value", {
                get: $util.oneOfGetter($oneOfFields = ["cao", "aco", "bio", "tro", "rao", "bdo", "txo", "seo", "sgo", "vpo"]),
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
                if (message.vpo != null && Object.hasOwnProperty.call(message, "vpo"))
                    $root.apply.operations.SetVdfParamsOperation.encode(message.vpo, writer.uint32(/* id 12, wireType 2 =*/98).fork()).ldelim();
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
                            message.vpo = $root.apply.operations.SetVdfParamsOperation.decode(reader, reader.uint32());
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
                if (message.vpo != null && message.hasOwnProperty("vpo")) {
                    if (properties.value === 1)
                        return "value: multiple values";
                    properties.value = 1;
                    {
                        var error = $root.apply.operations.SetVdfParamsOperation.verify(message.vpo);
                        if (error)
                            return "vpo." + error;
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
                case "SET_VDF_PARAMS":
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
                if (object.vpo != null) {
                    if (typeof object.vpo !== "object")
                        throw TypeError(".apply.operations.Operation.vpo: object expected");
                    message.vpo = $root.apply.operations.SetVdfParamsOperation.fromObject(object.vpo);
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
                if (message.vpo != null && message.hasOwnProperty("vpo")) {
                    object.vpo = $root.apply.operations.SetVdfParamsOperation.toObject(message.vpo, options);
                    if (options.oneofs)
                        object.value = "vpo";
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
         * @property {number} SET_VDF_PARAMS=16 SET_VDF_PARAMS value
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
            values[valuesById[16] = "SET_VDF_PARAMS"] = 16;
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
             * @property {Uint8Array|null} [df] SetGenesisEpochOperation df
             * @property {Uint8Array|null} [db] SetGenesisEpochOperation db
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
             * SetGenesisEpochOperation df.
             * @member {Uint8Array} df
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.df = $util.newBuffer([]);

            /**
             * SetGenesisEpochOperation db.
             * @member {Uint8Array} db
             * @memberof apply.operations.SetGenesisEpochOperation
             * @instance
             */
            SetGenesisEpochOperation.prototype.db = $util.newBuffer([]);

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
                if (message.df != null && Object.hasOwnProperty.call(message, "df"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.df);
                if (message.db != null && Object.hasOwnProperty.call(message, "db"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.db);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.is);
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
                            message.df = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.db = reader.bytes();
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
                if (message.df != null && message.hasOwnProperty("df"))
                    if (!(message.df && typeof message.df.length === "number" || $util.isString(message.df)))
                        return "df: buffer expected";
                if (message.db != null && message.hasOwnProperty("db"))
                    if (!(message.db && typeof message.db.length === "number" || $util.isString(message.db)))
                        return "db: buffer expected";
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
                if (object.df != null)
                    if (typeof object.df === "string")
                        $util.base64.decode(object.df, message.df = $util.newBuffer($util.base64.length(object.df)), 0);
                    else if (object.df.length >= 0)
                        message.df = object.df;
                if (object.db != null)
                    if (typeof object.db === "string")
                        $util.base64.decode(object.db, message.db = $util.newBuffer($util.base64.length(object.db)), 0);
                    else if (object.db.length >= 0)
                        message.db = object.db;
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
                        object.df = "";
                    else {
                        object.df = [];
                        if (options.bytes !== Array)
                            object.df = $util.newBuffer(object.df);
                    }
                    if (options.bytes === String)
                        object.db = "";
                    else {
                        object.db = [];
                        if (options.bytes !== Array)
                            object.db = $util.newBuffer(object.db);
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
                if (message.df != null && message.hasOwnProperty("df"))
                    object.df = options.bytes === String ? $util.base64.encode(message.df, 0, message.df.length) : options.bytes === Array ? Array.prototype.slice.call(message.df) : message.df;
                if (message.db != null && message.hasOwnProperty("db"))
                    object.db = options.bytes === String ? $util.base64.encode(message.db, 0, message.db.length) : options.bytes === Array ? Array.prototype.slice.call(message.db) : message.db;
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

        operations.SetVdfParamsOperation = (function() {

            /**
             * Properties of a SetVdfParamsOperation.
             * @memberof apply.operations
             * @interface ISetVdfParamsOperation
             * @property {Uint8Array|null} [tx] SetVdfParamsOperation tx
             * @property {Uint8Array|null} [txv] SetVdfParamsOperation txv
             * @property {Uint8Array|null} [df] SetVdfParamsOperation df
             * @property {Uint8Array|null} [db] SetVdfParamsOperation db
             * @property {Uint8Array|null} ["in"] SetVdfParamsOperation in
             * @property {Uint8Array|null} [is] SetVdfParamsOperation is
             */

            /**
             * Constructs a new SetVdfParamsOperation.
             * @memberof apply.operations
             * @classdesc Represents a SetVdfParamsOperation.
             * @implements ISetVdfParamsOperation
             * @constructor
             * @param {apply.operations.ISetVdfParamsOperation=} [properties] Properties to set
             */
            function SetVdfParamsOperation(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * SetVdfParamsOperation tx.
             * @member {Uint8Array} tx
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype.tx = $util.newBuffer([]);

            /**
             * SetVdfParamsOperation txv.
             * @member {Uint8Array} txv
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype.txv = $util.newBuffer([]);

            /**
             * SetVdfParamsOperation df.
             * @member {Uint8Array} df
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype.df = $util.newBuffer([]);

            /**
             * SetVdfParamsOperation db.
             * @member {Uint8Array} db
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype.db = $util.newBuffer([]);

            /**
             * SetVdfParamsOperation in.
             * @member {Uint8Array} in
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype["in"] = $util.newBuffer([]);

            /**
             * SetVdfParamsOperation is.
             * @member {Uint8Array} is
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             */
            SetVdfParamsOperation.prototype.is = $util.newBuffer([]);

            /**
             * Creates a new SetVdfParamsOperation instance using the specified properties.
             * @function create
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {apply.operations.ISetVdfParamsOperation=} [properties] Properties to set
             * @returns {apply.operations.SetVdfParamsOperation} SetVdfParamsOperation instance
             */
            SetVdfParamsOperation.create = function create(properties) {
                return new SetVdfParamsOperation(properties);
            };

            /**
             * Encodes the specified SetVdfParamsOperation message. Does not implicitly {@link apply.operations.SetVdfParamsOperation.verify|verify} messages.
             * @function encode
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {apply.operations.ISetVdfParamsOperation} message SetVdfParamsOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetVdfParamsOperation.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.tx != null && Object.hasOwnProperty.call(message, "tx"))
                    writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.tx);
                if (message.txv != null && Object.hasOwnProperty.call(message, "txv"))
                    writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.txv);
                if (message.df != null && Object.hasOwnProperty.call(message, "df"))
                    writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.df);
                if (message.db != null && Object.hasOwnProperty.call(message, "db"))
                    writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.db);
                if (message["in"] != null && Object.hasOwnProperty.call(message, "in"))
                    writer.uint32(/* id 5, wireType 2 =*/42).bytes(message["in"]);
                if (message.is != null && Object.hasOwnProperty.call(message, "is"))
                    writer.uint32(/* id 6, wireType 2 =*/50).bytes(message.is);
                return writer;
            };

            /**
             * Encodes the specified SetVdfParamsOperation message, length delimited. Does not implicitly {@link apply.operations.SetVdfParamsOperation.verify|verify} messages.
             * @function encodeDelimited
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {apply.operations.ISetVdfParamsOperation} message SetVdfParamsOperation message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            SetVdfParamsOperation.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a SetVdfParamsOperation message from the specified reader or buffer.
             * @function decode
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {apply.operations.SetVdfParamsOperation} SetVdfParamsOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetVdfParamsOperation.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.apply.operations.SetVdfParamsOperation();
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
                            message.df = reader.bytes();
                            break;
                        }
                    case 4: {
                            message.db = reader.bytes();
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
             * Decodes a SetVdfParamsOperation message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {apply.operations.SetVdfParamsOperation} SetVdfParamsOperation
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            SetVdfParamsOperation.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a SetVdfParamsOperation message.
             * @function verify
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            SetVdfParamsOperation.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.tx != null && message.hasOwnProperty("tx"))
                    if (!(message.tx && typeof message.tx.length === "number" || $util.isString(message.tx)))
                        return "tx: buffer expected";
                if (message.txv != null && message.hasOwnProperty("txv"))
                    if (!(message.txv && typeof message.txv.length === "number" || $util.isString(message.txv)))
                        return "txv: buffer expected";
                if (message.df != null && message.hasOwnProperty("df"))
                    if (!(message.df && typeof message.df.length === "number" || $util.isString(message.df)))
                        return "df: buffer expected";
                if (message.db != null && message.hasOwnProperty("db"))
                    if (!(message.db && typeof message.db.length === "number" || $util.isString(message.db)))
                        return "db: buffer expected";
                if (message["in"] != null && message.hasOwnProperty("in"))
                    if (!(message["in"] && typeof message["in"].length === "number" || $util.isString(message["in"])))
                        return "in: buffer expected";
                if (message.is != null && message.hasOwnProperty("is"))
                    if (!(message.is && typeof message.is.length === "number" || $util.isString(message.is)))
                        return "is: buffer expected";
                return null;
            };

            /**
             * Creates a SetVdfParamsOperation message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {apply.operations.SetVdfParamsOperation} SetVdfParamsOperation
             */
            SetVdfParamsOperation.fromObject = function fromObject(object) {
                if (object instanceof $root.apply.operations.SetVdfParamsOperation)
                    return object;
                var message = new $root.apply.operations.SetVdfParamsOperation();
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
                if (object.df != null)
                    if (typeof object.df === "string")
                        $util.base64.decode(object.df, message.df = $util.newBuffer($util.base64.length(object.df)), 0);
                    else if (object.df.length >= 0)
                        message.df = object.df;
                if (object.db != null)
                    if (typeof object.db === "string")
                        $util.base64.decode(object.db, message.db = $util.newBuffer($util.base64.length(object.db)), 0);
                    else if (object.db.length >= 0)
                        message.db = object.db;
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
             * Creates a plain object from a SetVdfParamsOperation message. Also converts values to other types if specified.
             * @function toObject
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {apply.operations.SetVdfParamsOperation} message SetVdfParamsOperation
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            SetVdfParamsOperation.toObject = function toObject(message, options) {
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
                        object.df = "";
                    else {
                        object.df = [];
                        if (options.bytes !== Array)
                            object.df = $util.newBuffer(object.df);
                    }
                    if (options.bytes === String)
                        object.db = "";
                    else {
                        object.db = [];
                        if (options.bytes !== Array)
                            object.db = $util.newBuffer(object.db);
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
                if (message.df != null && message.hasOwnProperty("df"))
                    object.df = options.bytes === String ? $util.base64.encode(message.df, 0, message.df.length) : options.bytes === Array ? Array.prototype.slice.call(message.df) : message.df;
                if (message.db != null && message.hasOwnProperty("db"))
                    object.db = options.bytes === String ? $util.base64.encode(message.db, 0, message.db.length) : options.bytes === Array ? Array.prototype.slice.call(message.db) : message.db;
                if (message["in"] != null && message.hasOwnProperty("in"))
                    object["in"] = options.bytes === String ? $util.base64.encode(message["in"], 0, message["in"].length) : options.bytes === Array ? Array.prototype.slice.call(message["in"]) : message["in"];
                if (message.is != null && message.hasOwnProperty("is"))
                    object.is = options.bytes === String ? $util.base64.encode(message.is, 0, message.is.length) : options.bytes === Array ? Array.prototype.slice.call(message.is) : message.is;
                return object;
            };

            /**
             * Converts this SetVdfParamsOperation to JSON.
             * @function toJSON
             * @memberof apply.operations.SetVdfParamsOperation
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            SetVdfParamsOperation.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for SetVdfParamsOperation
             * @function getTypeUrl
             * @memberof apply.operations.SetVdfParamsOperation
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            SetVdfParamsOperation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/apply.operations.SetVdfParamsOperation";
            };

            return SetVdfParamsOperation;
        })();

        return operations;
    })();

    return apply;
})();

module.exports = $root;
