import { isNaN, isNil } from "lodash"

/**
 * Checks if `value` is considered defined akin to RoR `#defined?`.
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

