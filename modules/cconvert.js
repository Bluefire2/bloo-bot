const axios = require('axios');

const fns = {
    rate: (from, to) => {
        return new Promise((resolve, reject) => {
            const url = `http://api.fixer.io/latest?base=${from}&symbols=${to}`;
            axios.get(url).then(response => {
                resolve(response.data.rates[to]);
            }).catch(err => {
                reject(err);
            });
        });
    },
    convert: (from, to, amount) => {
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