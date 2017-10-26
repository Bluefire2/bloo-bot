const path = require('path');

const defaultCVFilePath = path.join(__dirname, '..', 'data', 'defaultCV.json');

// TODO: fix this garbage
module.exports = {
    /**
     * Gets the default value of a variable.
     *
     * @param variable The variable name.
     * @returns {*} The variable's value, or false if the variable is undefined.
     */
    get: (variable) => {
        const defaultCVFile = require(defaultCVFilePath.toString());

        if (typeof defaultCVFile[variable] === 'undefined') {
            return false;
        } else {
            return defaultCVFile[variable];
        }
    }
};