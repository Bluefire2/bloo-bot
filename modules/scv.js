const fs = require('fs');
const path = require('path');

const CVFilePath = path.join(__dirname, '..', 'data', 'CV.json');

module.exports = {
    /**
     * Sets a channel variable to a certain value, permanently
     *
     * @param channelID the channel id
     * @param variable the variable
     * @param value the value
     */
    set: (channelID, variable, value) => {
        let CVFile = require(CVFilePath.toString());

        if (typeof CVFile[channelID] === 'undefined') {
            CVFile[channelID] = {};
        }
        CVFile[channelID][variable] = value;

        console.log(channelID);
        console.log(variable);
        console.log(value);
        console.log(CVFile);

        fs.writeFile(CVFilePath, JSON.stringify(CVFile), (err) => {
            if (err) return console.log(err);
        });
    },
    get: (channelID, variable) => {
        const CVFile = require(CVFilePath.toString());

        if (typeof CVFile[channelID] === 'undefined' || typeof CVFile[channelID][variable] === 'undefined') {
            return false;
        } else {
            return CVFile[channelID][variable];
        }
    }
};