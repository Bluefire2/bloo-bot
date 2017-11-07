const DISCORD_CHAR_LIMIT = 2000;
const MY_CHAR_LIMIT = 10000;

const config = require('./config.json');

module.exports.MY_CHAR_LIMIT = 1000;

/**
 * Checks if an object is empty, that is, if it is {}.
 *
 * @param obj The object.
 * @returns {boolean} Whether the object is empty.
 */
module.exports.objectIsEmpty = obj => {
    // https://stackoverflow.com/a/32108184/1175276
    return Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Determines if the message was sent by a server admin.
 *
 * @param msg The message sent.
 * @returns {boolean} true if sent by an admin, false otherwise.
 */
const sentByAdmin = (msg) => {
    return msg.member.hasPermission('ADMINISTRATOR');
};

/**
 * Determines if the message was sent by a me (user running the bot).
 *
 * @param msg The message sent.
 * @returns {boolean} true if sent by me, false otherwise.
 */
const sentByMe = (msg) => {
    return msg.member.id === config.admin_snowflake;
};

/**
 * Determines if the message was sent by a server admin, or by me (user running the bot).
 *
 * @param msg The message sent.
 * @returns {boolean} true if sent by an admin or me, false otherwise.
 */
module.exports.sentByAdminOrMe = (msg) => {
    return sentByAdmin(msg) || sentByMe(msg);
};

// export
module.exports.sentByAdmin = sentByAdmin;
module.exports.sentByMe = sentByMe;

/**
 * Removes *all* whitespace from a string.
 *
 * @param str The string.
 */
module.exports.removeWhitespace = (str) => {
    return str.replace(/ /g, '');
};

/**
 * Rounds a float to a specified number of digits.
 *
 * @param n The number to round.
 * @param digits The number of digits (not decimal places) to round to.
 * @returns {number} The rounded value.
 */
module.exports.roundTo = (n, digits) => {
    if (digits === undefined) {
        digits = 0;
    }

    const multiplicator = Math.pow(10, digits);

    n = parseFloat((n * multiplicator).toFixed(11));

    const test = (Math.round(n) / multiplicator);

    return +(test.toFixed(digits));
};

/**
 * Formats a number with commas, e.g. 1234567 => 1,234,567
 * @param x The number.
 * @returns {string} The number formatted with commas.
 */
module.exports.numberWithCommas = (x) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Generates a random integer in a specified range.
 *
 * @param min The lower bound for the range.
 * @param max The upper bound for the range.
 * @returns {number} The random integer.
 */
module.exports.randomInRange = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
};

/**
 * Provides the link to a youtube video, given its youtube ID.
 *
 * @param id The video id.
 * @returns {string} The link.
 */
module.exports.youtubeIDToLink = (id) => {
    return 'https://www.youtube.com/watch?v=' + id;
};

/**
 * Send a message that may or may not be longer than Discord's char limit. If it is not longer then just send it; if it
 * is longer then split it into several sub-limit chunks, sending each one individually, and wrapping them all with a
 * wrapper if needed (for example ``` ```) for code. However, if the message is way too long (longer than "my" char
 * limit) then don't send it.
 *
 * @param channel The current channel (access using msg.channel from commands).
 * @param text The text of the message to send.
 * @param surround The wrapper for the message(s).
 * @returns {boolean} true if the message was sent, false if it was not (due to excessive size).
 */
module.exports.safeSendMsg = (channel, text, surround = '') => {
    // TODO: Implement optional "smart" mode where it tries to not cut off in the middle of words
    let localCharLim = DISCORD_CHAR_LIMIT - 2 * surround.length;

    if (text.length > MY_CHAR_LIMIT) {
        return false;
    } else if (text.length < localCharLim) {
        channel.send(surround + text + surround);
        return true;
    } else {
        let textTemp = text;

        for (let i = 0; i <= textTemp.length % localCharLim; i++) {
            channel.send(surround + textTemp.slice(0, localCharLim) + surround);

            textTemp = textTemp.slice(localCharLim);
        }
        return true;
    }
};

module.exports.TypeCheck = {
    string: p => true,
    char: p => p.length === 1,
    int: p => Number.isInteger(parseInt(p)),
    number: p => !isNaN(p),
    all: p => true
};

module.exports.sendErrorMessage = (channel, errorMsg) => {
    channel.send(`Error: ${errorMsg}`);
};

module.exports.isPM = msg => {
    return msg.channel.type === 'dm' || !msg.guild;
};