/**
 * A currency conversion module.
 */

const axios = require('axios');

const fns = {
    /**
     * Fetches the currency conversion rate.
     *
     * @param from The currency to convert from.
     * @param to The currency to convert to.
     * @returns {Promise} A promise that resolves with the rate.
     */
    rate: (from, to) => {
        let fromTemp = from.toUpperCase(),
            toTemp = to.toUpperCase();
        return new Promise((resolve, reject) => {
            const url = `http://api.fixer.io/latest?base=${fromTemp}&symbols=${toTemp}`;
            axios.get(url).then(response => {
                resolve(response.data.rates[toTemp]);
            }).catch(err => {
                reject(err);
            });
        });
    },
    /**
     * Converts an amount of one currency into another.
     *
     * @param from The currency to convert from.
     * @param to The currency to convert to.
     * @param amount The amount to convert.
     * @returns {Promise} A promise that resolves with the amount in the new currency.
     */
    convert: (amount, from, to) => {
        return new Promise((resolve, reject) => {
            fns.rate(from, to).then(exRate => {
                resolve(exRate * amount);
            }).catch(err => {
                reject(err);
            });
        });
    }
};

module.exports = fns;