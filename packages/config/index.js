/**
 * @infernetprotocol/config — canonical runtime constants shared across apps.
 *
 * Re-exports:
 *   - PAYMENT_COINS, PAYMENT_COIN_CODES, findCoin  (from ./payment-coins.js)
 *   - DEPOSIT_ADDRESSES, getAddressesFor, pickAddress (from ./deposit-addresses.js)
 */

export * from "./payment-coins.js";
export * from "./deposit-addresses.js";
