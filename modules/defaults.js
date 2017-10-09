const path = require('path');

const defaultCVFilePath = path.join(__dirname, '..', 'data', 'defaultCV.json');

module.exports = {
    get: (variable) => {
        const defaultCVFile = require(defaultCVFilePath.toString());

        if (typeof defaultCVFile[variable] === 'undefined') {
            return false;
        } else {
            return defaultCVFile[variable];
        }
    }
};