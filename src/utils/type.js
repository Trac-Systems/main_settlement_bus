function isNumber(value) {
    return typeof value == 'number'
}

/**
 * Checks if `value` is `NaN`.
 *
 * **Note:** This method is based on
 * [`Number.isNaN`](https://mdn.io/Number/isNaN) and is not the same as
 * global [`isNaN`](https://mdn.io/isNaN) which returns `true` for
 * `undefined` and other non-number values.
 *
 * @param {*} value The value to check. Copied from: https://github.com/lodash/lodash/blob/4.17.23/lodash.js
 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
 * @example
 *
 * _.isNaN(NaN);
 * // => true
 *
 * _.isNaN(new Number(NaN));
 * // => true
 *
 * isNaN(undefined);
 * // => true
 *
 * _.isNaN(undefined);
 * // => false
 */
function isNaN(value) {
    // An `NaN` primitive is the only value that is not equal to itself.
    // Perform the `toStringTag` check first to avoid errors with some
    // ActiveX objects in IE.
    return isNumber(value) && value != +value;
}

/**
 * Checks if `value` is `null` or `undefined`. Copied from: https://github.com/lodash/lodash/blob/4.17.23/lodash.js
 *
 * @static
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is nullish, else `false`.
 * @example
 *
 * _.isNil(null);
 * // => true
 *
 * _.isNil(void 0);
 * // => true
 *
 * _.isNil(NaN);
 * // => false
 */
function isNil(value) {
    return value == null;
}

/**
 * Checks if `value` is considered defined akin to RoR `#defined?`.
 * Since they produced that bizarre isNaN which should warrant developers a death-penalty. We had to custom bake a lodash-like function.
 * 
 * @static
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is nullish, else `false`.
 * @example
 *
 * _.isDefined(undefined);
 * // => false
 *
 * _.isDefined(null);
 * // => false
 *
 * _.isDefined(void 0);
 * // => false
 *
 * _.isDefined(NaN);
 * // => false
 */
export function isDefined(value) {
    return !isNil(value) && !isNaN(value)
}

