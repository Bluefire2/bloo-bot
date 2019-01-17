/**
 * A currency conversion module.
 */

const axios = require('axios');

const fns = {
    /**
     * Fetches the currency conversion rate.
     *
     * @async
     * @param from The currency to convert from.
     * @param to The currency to convert to.
     * @returns {Promise} A promise that resolves with the rate.
     */
    rate: async (from, to) => {
        const query = `${from}_${to}`,
            url = `https://free.currencyconverterapi.com/api/v6/convert?q=${query}&compact=y`,
            response = await axios.get(url);
        return response.data[query].val;
    },
    /**
     * Converts an amount of one currency into another.
     *
     * @async
     * @param from The currency to convert from.
     * @param to The currency to convert to.
     * @param amount The amount to convert.
     * @returns {Promise} A promise that resolves with the amount in the new currency.
     */
    convert: async (amount, from, to) => {
        let exRate = await fns.rate(from, to);
        return exRate * amount;
    }
};

module.exports = fns;