const cheerio = require('cheerio');
const axios = require('axios');
const gtranslate = require('google-translate-api');
const convertUnits = require('convert-units');
const mathjs = require('mathjs');

const scv = require('./modules/scv.js');
const cconvert = require('./modules/cconvert');
const Timer = require('./modules/timer');
const cmdData = require('./data/commands.json');

const config = require('./config.json');

const commandDesc = require('./data/commands.json');
const cyrillicMap = require('./data/cyrillic.json');
const NUMBERS = require('./data/numbers.json');

const UNITSPACE = '\u202F';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const DISCORD_CHAR_LIMIT = 2000;
const MY_CHAR_LIMIT = 10000;

const sourceCodeURL = 'https://github.com/Bluefire2/bloo-bot';

const uptimeTimer = new Timer();

const polls = {};

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
const sentByAdminOrMe = (msg) => {
    return sentByAdmin(msg) || sentByMe(msg);
};

/**
 * Outputs the descstring for a command.
 * TODO: rewrite this to not use the prefix?
 *
 * @param prefix The current prefix.
 * @param cmdName The command name.
 * @returns {Array} The descstring as an array, line by line.
 */
const descString = (prefix, cmdName) => {
    // output the command docstring
    let currCmd = cmdData[cmdName],
        outText = [];
    // signature and descstring
    const cmdParams = typeof currCmd.params === 'undefined' ? {} : currCmd.params, // huh
        admin = typeof currCmd.admin === 'undefined' ? false : currCmd.admin;
    let usageStr = prefix + cmdName;

    if (Object.keys(cmdParams).length !== 0) {
        usageStr += " <" + Object.keys(cmdParams).join("> <") + ">";
    }

    outText.push(usageStr);
    if (admin) {
        outText.push(currCmd.desc + ' (requires admin privileges)');
    } else {
        outText.push(currCmd.desc);
    }
    outText.push('\n');

    // parameters
    for (let paramName in cmdParams) {
        let paramDesc = cmdParams[paramName];
        outText.push(paramName + ": " + paramDesc);
    }

    // aliases
    let aliases = currCmd.aliases;
    if (Array.isArray(aliases)) {
        // command has one or more aliases
        let aliasesStr = 'Alias(es): ';

        aliases.forEach((elem, index) => {
            aliasesStr += elem;
            if (index < aliases.length - 1) {
                // if not the last element, add a comma for the next one
                aliasesStr += ', ';
            }
        });
        outText.push('\n' + aliasesStr);
    }

    return outText;
};

/**
 * Removes *all* whitespace from a string.
 *
 * @param str The string.
 */
const removeWhitespace = (str) => {
    return str.replace(/ /g, '');
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
const safeSendMsg = (channel, text, surround = '') => {
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

/**
 * Rounds a float to a specified number of digits.
 *
 * @param n The number to round.
 * @param digits The number of digits (not decimal places) to round to.
 * @returns {number} The rounded value.
 */
const roundTo = (n, digits) => {
    if (digits === undefined) {
        digits = 0;
    }

    let multiplicator = Math.pow(10, digits);
    n = parseFloat((n * multiplicator).toFixed(11));
    let test = (Math.round(n) / multiplicator);
    return +(test.toFixed(digits));
};

/**
 * Formats a number with commas, e.g. 1234567 => 1,234,567
 * @param x The number.
 * @returns {string} The number formatted with commas.
 */
const numberWithCommas = (x) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Maps the aura tier name to its slayer kill multiplier. Used in the `slayer` command.
 *
 * @param tier The name of the aura tier.
 * @returns {*} The multiplier for the tier, or false if no such tier exists.
 */
const slayerAuraChance = (tier) => {
    let auraToTier = {
        "none": 1.0,
        "dedicated": 1.03,
        "greater": 1.05,
        "master": 1.07,
        "supreme": 1.1,
        "legendary": 1.15
    }, multiplier;

    if (tier > 5 || tier < 0 || (typeof tier !== 'number' && auraToTier[tier] === 'undefined')) {
        return false;
    }

    let index = typeof tier === 'string' ? tier : Object.keys(auraToTier)[tier];

    multiplier = auraToTier[index];
    return 1 / (2 - multiplier); // expected value of geometric distribution
};

/**
 * Generates a random integer in a specified range.
 *
 * @param min The lower bound for the range.
 * @param max The upper bound for the range.
 * @returns {number} The random integer.
 */
const randomInRange = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
};

/**
 * Provides the link to a youtube video, given its youtube ID.
 *
 * @param id The video id.
 * @returns {string} The link.
 */
const youtubeIDToLink = (id) => {
    return 'https://www.youtube.com/watch?v=' + id;
};

// Store the current math variables. These will expire on restart but will persist if the bot is kicked and then reinvited.
const mathVariables = {},
    mathConstants = {
    pi: Math.PI,
    e: Math.E
};

/*
 * The object that stores all the commands. Command functions must take at least one param, msg, which is the message
 * that triggered the command. If the command is documented to take parameters in commmands.json, then the function
 * should take those parameters, in the order that they're documented in.
 */
const commands = {
    listcmd: (msg, writeln) => {
        let outText = 'Available commands:\n\n',
            commandsArray = [],
            cmdNames = Object.keys(commandDesc);

        for (let i in cmdNames) {
            let commandName = cmdNames[i],
                commandEntry = '',
                aliasesArray = commandDesc[commandName].aliases,
                admin = typeof commandDesc[commandName].admin === 'undefined' ? false : commandDesc[commandName].admin;

            if (admin) {
                commandEntry += commandName.toUpperCase();
            } else {
                commandEntry += commandName;
            }

            if (Array.isArray(aliasesArray)) {
                commandEntry += ' (' + aliasesArray.join(', ') + ')';
            }

            commandsArray.push(commandEntry);
        }

        outText += commandsArray.join(', ');
        return outText;
    },
    help: (msg, writeln, cmdName) => {
        let prefix = '<prefix>';
        console.log(cmdData[cmdName]);
        if (typeof cmdData[cmdName] === 'undefined') {
            writeln('**Undefined command name** "' + cmdName + '"');
        } else {
            writeln('```' + descString(prefix, cmdName).join('\n') + '```');
        }
    },
    uptime: (msg, writeln) => {
        const timeOnline = uptimeTimer.timeElapsedDhms();

        writeln(`Online for ${timeOnline.days} days, ${timeOnline.hours} hours, ${timeOnline.minutes} minutes and ${timeOnline.seconds} seconds.`);
    },
    import_fn: (msg, writeln, text) => {
        if (text === 'this') {
            return exports.cmd.pasta(msg, 'pyzen');
        }
    },
    ping: (msg, writeln) => {
        console.log(Date.now(), msg.createdTimestamp);
        let pingTime = (Date.now() - msg.createdTimestamp);
        writeln('Pong! ' + pingTime + 'ms');
    },
    source: (msg, writeln) => {
        writeln(`**Source code at** ${sourceCodeURL}`);
    },
    roll: (msg, writeln, sides, dice = 1) => {
        // validate input:
        // TODO: specify parameter types in commands.json and perform type checking in cmdExe
        if (typeof sides !== 'number' || typeof dice !== 'number') {
            writeln('Invalid input.');
            return;
        }

        let rolls = [];

        for (let i = 0; i < dice; i++) {
            rolls.push(randomInRange(1, sides));
        }

        let data = {
            variance: mathjs.var,
            std: mathjs.std,
            mean: mathjs.mean,
            median: mathjs.median,
            mode: mathjs.mode,
            max: mathjs.max,
            min: mathjs.min,
            sum: mathjs.sum
        };

        let rollsString = rolls.join(' '),
            dataString = Object.keys(data).map(key => {
                let func = val => {
                    if (key === 'mode') {
                        return `[${data[key](val)}]`;
                    }
                    return roundTo(data[key](val), 3);
                };

                return `${key}: ${func(rolls)}`;
            }).join(', ');

        return `${rollsString};\n\n${dataString}`;
    },
    flipcoin: (msg, writeln) => {
        let HorT = randomInRange(0, 1) === 1 ? 'heads' : 'tails';
        msg.reply(HorT);
    },
    pasta: (msg, writeln, pastaName) => {
        let pastaData = require("./data/pastas.json");
        if (pastaName !== 'list') {
            pastaText = pastaData[pastaName];

            writeln(pastaText);
        } else {
            return Object.keys(pastaData).slice(0);
        }
    },
    priceCheck: (msg, writeln, item, amount = 1) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/Exchange:';

        axios.get(baseUrl + item).then(response => {
            let $ = cheerio.load(response.data),
                price = parseInt($('#GEPrice').text().replace(/,/g, '')),
                totalPrice = numberWithCommas(price * amount);

            writeln(item + ' x ' + amount + ': ' + totalPrice + 'gp');
        }).catch((error) => {
            console.log(error);
        });

        return false;
    },
    slayer: (msg, writeln, monster, amount = 1, aura = 0) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/';

        let auraMultiplier = slayerAuraChance(aura),
            expectedAmount;

        if (!auraMultiplier) {
            writeln('**Invalid aura tier **' + aura);
            return;
        }

        expectedAmount = parseInt(amount * auraMultiplier);

        // get the monster id
        axios.get(baseUrl + monster).then((response) => {
            const processXpText = (text) => {
                return Math.floor(parseFloat(text.replace(/,/g, '')) * expectedAmount);
            };

            let $ = cheerio.load(response.data),
                monsterName = $('.page-header__title').text(),
                xpCombat = processXpText($('.mob-cb-xp').text()),
                xpHp = processXpText($('.mob-hp-xp').text()),
                xpSlayer = processXpText($('.mob-slay-xp').text());

            writeln(monsterName + ' x ' + expectedAmount + ': ' + xpSlayer
                + ' slayer xp, ' + xpCombat + ' combat xp and ' + xpHp + ' hp xp.');
        }).catch((error) => {
            console.log(error);
        });
    },
    wikipedia: (msg, writeln, article, lang = 'en') => {
        let baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
            baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

        axios.get(baseUrl + article).then((response) => {
            if (response.data.query.search.length !== 0) {
                let firstResult = response.data.query.search[0],
                    firstResultTitle = firstResult.title.replace(/ /g, '_');

                writeln('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
            } else {
                writeln('No search results found for "' + article + '"');
            }
        }).catch((error) => {
            console.log(error);
            if (error.code === 'ENOTFOUND') {
                writeln('**Invalid language code** "' + lang + '"');
            }
        });
    },
    translate: (msg, writeln, langFrom, langInto, ...text) => {
        let textJoined = text.join(' ');

        gtranslate(textJoined, {from: langFrom, to: langInto}).then((res) => {
            let out = '';

            if (res.from.text.autoCorrected || res.from.text.didYouMean) {
                out += '**Autocorrected** "' + textJoined + '" **to** "' + res.from.text.value + '"\n\n';
            }

            out += res.text;

            writeln(out);
        }).catch(err => {
            console.error(err);
            writeln('**' + err.message + '**');
        });
    },
    onerm: (msg, writeln, weight, reps) => {
        // using Epley formula:
        let max = Math.floor(weight * (1 + reps / 30));

        writeln('Estimated one rep max: ' + max);
    },
    convert: (msg, writeln, number, unitsFrom, unitsTo, dp = 2) => {
        let converted;
        try {
            converted = roundTo(convertUnits(number).from(unitsFrom).to(unitsTo), dp);
            writeln('**' + number + UNITSPACE + unitsFrom + '** is **' + converted + UNITSPACE + unitsTo + '**');
        } catch (e) {
            writeln('**Error**: ' + e.message);
        }
    },
    b: (msg, writeln) => {
        writeln(':b:');
    },
    youtube: (msg, writeln, query) => {
        let baseYoutubeUrl = 'https://www.googleapis.com/youtube/v3/search';

        axios.get(baseYoutubeUrl, {
            params: {
                key: config.googleAPIKey,
                part: 'snippet',
                order: 'viewCount',
                type: 'video',
                q: query
            }
        }).then((response) => {
            let items = response.data.items,
                firstResult = items[0],
                firstVideoID;

            try {
                firstVideoID = firstResult.id.videoId;
            } catch (e) {
                return `**No results found for** "${query}"`;
            }

            writeln(youtubeIDToLink(firstVideoID));
        }).catch((response) => {
            console.log(response);
        });
    },
    prettify: (msg, writeln, text) => {
        let prettifiedText = (text + '').split(' ').map((word) => {
            return word.split('').map((char) => {
                if (ALPHABET.indexOf(char) !== -1) {
                    return ':regional_indicator_' + char.toLowerCase() + ':';
                } else if (typeof NUMBERS[char] !== 'undefined') {
                    return ':' + NUMBERS[char] + ':';
                } else {
                    return char;
                }
            }).join('');
        }).join('  ');

        writeln(prettifiedText);
    },
    cyrillify: (msg, writeln, text) => {
        let cyrillifiedText = text.split('').map((elem) => {
            let mappedChar = cyrillicMap[elem];
            if (typeof mappedChar === 'undefined') {
                return elem;
            } else {
                return mappedChar;
            }
        }).join('');

        writeln(cyrillifiedText);
    },
    setPrefix: (msg, writeln, value) => {
        let channelID = msg.channel.id;

        console.log('setting for ' + channelID);
        return new Promise((resolve, reject) => {
            scv.set(channelID, 'prefix', value).then((value) => {
                writeln("**Prefix set to**: " + value);
                console.log(`prefix set to ${value}`);
                resolve();
            }).catch((err) => {
                writeln("Failed to set prefix value.");
                reject(err);
            });
        });
    },
    eval: (msg, writeln, expression) => {
        let channelID = msg.channel.id,
            context = mathVariables[channelID + ''];

        if (typeof context === 'undefined') {
            context = {};
        }

        try {
            let result = mathjs.eval(expression, context);
            writeln(`Expression value: ${result}`);
        } catch (e) {
            writeln('Bad expression. Make sure all variables are defined!');
        }
    },
    setvar: (msg, writeln, varname, varvalue) => {
        if (Object.keys(mathConstants).indexOf(varname) !== -1) {
            writeln(`**Unable to set as variable name** ${varname} **is reserved.**`);
        } else {
            let varvalueParsed,
                channelID = msg.channel.id,
                channelMathVariables = mathVariables[channelID + ''];

            if (typeof channelMathVariables === 'undefined') {
                mathVariables[channelID + ''] = {};
                channelMathVariables = mathVariables[channelID + ''];
            }

            let context = Object.assign({}, channelMathVariables, mathConstants);

            // parse expression if we need to
            if (typeof varvalue === 'number') {
                varvalueParsed = varvalue;
            } else {
                varvalueParsed = mathjs.eval(varvalue, context);
            }

            if (typeof channelMathVariables[varname] === 'undefined') {
                writeln(`**Variable** ${varname} **created and set to** ${varvalueParsed}`);
            } else {
                writeln(`**Variable** ${varname} **changed from** ${mathVariables[varname]} **to** ${varvalueParsed}`);
            }

            channelMathVariables[varname] = varvalueParsed;
        }
    },
    setvars: (msg, writeln, varnames, varvalues) => {
        const varnamesArray = removeWhitespace(varnames).split(','),
            varvaluesArray = removeWhitespace(varvalues).split(',');

        varnamesArray.forEach((elem, index) => {
            let value = varvaluesArray[index];
            if (Object.keys(mathConstants).indexOf(elem) !== -1) {
                // do nothing since we don't want to overwrite global constants
            } else {
                let valueParsed,
                    channelID = msg.channel.id,
                    channelMathVariables = mathVariables[channelID + ''];

                if (typeof channelMathVariables === 'undefined') {
                    mathVariables[channelID + ''] = {};
                    channelMathVariables = mathVariables[channelID + ''];
                }

                let context = Object.assign({}, channelMathVariables, mathConstants);

                // parse expression if we need to
                if (typeof value === 'number') {
                    valueParsed = value;
                } else {
                    valueParsed = mathjs.eval(value, context);
                }

                channelMathVariables[elem] = valueParsed;
            }
        });
    },
    ree: (msg, writeln, i) => {
        if (typeof i === 'number' && i >= 0) {
            let reeee = "R";

            // can't use array shorthand for some reason
            for (let j = 0; j < i; j++) {
                reeee += "E";
            }
            if (!safeSendMsg(msg.channel, reeee)) {
                writeln("Too long!");
            }
        } else {
            writeln('Bad input');
        }
    },
    currconvert: (msg, writeln, amount, currFrom, currTo, dp = 2) => {
        currFromTemp = currFrom.toUpperCase();
        currToTemp = currTo.toUpperCase();

        cconvert.convert(amount, currFromTemp, currToTemp).then(val => {
            if (isNaN(val)) {
                writeln("Oops, something went wrong. Check that your currencies are both valid!");
            } else {
                writeln(`${currFromTemp} ${amount} is ${currToTemp} ${roundTo(val, dp)}.`);
            }
        }).catch(err => {
            writeln("Oops, something went wrong. Check that your currencies are both valid!");
        });
    },
    poll: (msg, writeln, action, optionsStr = '') => {
        const channelID = msg.channel.id;

        const pollExists = () => {
            return typeof polls[channelID] !== 'undefined';
        };

        const createPoll = () => {
            polls[channelID] = {};
            return polls[channelID];
        };

        const deletePoll = () => {
            delete polls[channelID];
        };

        const pollOpen = () => {
            polls[channelID].open = true;
        };

        const openPoll = () => {
            polls[channelID].open = true;
        };

        const closePoll = () => {
            polls[channelID].open = false;
        };

        if (action === 'open') {
            if (pollExists()) {
                openPoll();
                writeln('**Poll opened.**');
            } else {
                writeln('No poll to open!');
            }
        } else if (action === 'close') {
            if (sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    closePoll();
                    writeln('**Poll closed.**');
                } else {
                    writeln('No poll to close!');
                }
            } else {
                writeln('Must be admin to close or delete a poll.');
            }
        } else if (action === 'create') {
            if (!pollExists()) {
                // validate input:
                if (optionsStr === '') {
                    writeln('Must specify poll options!');
                }
                const options = optionsStr.split(';').map(string => string.trim());
                if (!Array.isArray(options) || options.length < 2) {
                    writeln('Must have more than one option!');
                    return;
                }
                // do stuff
                polls[channelID] = {
                    open: true,
                    votes: {},
                    options: options
                };
                writeln('**New poll created and opened.**');
            } else {
                writeln('Delete the current poll before creating a new one!');
            }
        } else if (action === 'delete') {
            if (sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    deletePoll();
                    writeln('**Current poll deleted.**');
                } else {
                    writeln('No poll to delete!');
                }
            } else {
                writeln('Must be admin to close or delete a poll.');
            }
        } else if (action === 'tally' || action === 'show') {
            if (pollExists()) {
                const currPoll = polls[channelID],
                    votes = currPoll.votes,
                    options = currPoll.options,
                    tally = {},
                    outText = [];

                let totalVotes = 0;

                options.forEach(elem => {
                    tally[elem] = 0;
                });

                Object.keys(votes).forEach(key => {
                    const vote = votes[key],
                        optionSelected = options[vote - 1];

                    tally[optionSelected]++;
                    totalVotes++;
                });

                outText.push('Poll results so far:\n');
                console.log(tally);
                Object.keys(tally).forEach(key => {
                    const count = tally[key],
                        percentage = roundTo(count / totalVotes * 100, 2);

                    let currentCountString = `${options.indexOf(key) + 1}. ${key}: ${count} votes`;

                    if (!isNaN(percentage)) {
                        // if no votes have been case, percentage gets evaluated to NaN
                        currentCountString += ' ' + `(${percentage}%)`;
                    }

                    outText.push(currentCountString);
                });

                return outText;
            } else {
                writeln('No poll active.');
            }
        } else {
            writeln(`Invalid poll action "${action}"`);
        }
    },
    vote: (msg, writeln, option) => {
        const channelID = msg.channel.id;

        const pollExists = () => {
            return typeof polls[channelID] !== 'undefined';
        };

        const userID = msg.author.id,
            userName = msg.author.username;

        if (pollExists()) {
            const poll = polls[channelID],
                i = poll.options.indexOf(option);

            if (i !== -1) {
                commands.votei(msg, i + 1);
            } else {
                writeln(`No such option "${option}".`);
            }
        } else {
            // delegate and let votei raise the error
            commands.votei(msg, -1);
        }
    },
    votei: (msg, writeln, optionIndex) => {
        const channelID = msg.channel.id;

        const pollExists = () => {
            return typeof polls[channelID] !== 'undefined';
        };

        const pollOpen = () => {
            return polls[channelID].open;
        };

        const userID = msg.author.id,
            userName = msg.author.username;

        if (pollExists()) {
            if (pollOpen()) {
                const poll = polls[channelID];

                if (0 < optionIndex && optionIndex <= poll.options.length) {
                    if (typeof poll.votes === 'undefined') {
                        poll.votes = {};
                    }

                    poll.votes[userID] = optionIndex;

                    writeln(`**Successfully voted for**: "${poll.options[optionIndex - 1]}".`);
                } else {
                    writeln('Invalid option index.');
                }
            } else {
                writeln('Current poll is closed.');
            }
        } else {
            writeln('No poll active!');
        }
    }
};

// export some stuff
module.exports = commands;
module.exports.descString = descString;
module.exports.safeSendMsg = safeSendMsg;
module.exports.MY_CHAR_LIMIT = MY_CHAR_LIMIT;
module.exports.sentByAdmin = sentByAdmin;
module.exports.sentByMe = sentByMe;
module.exports.sentByAdminOrMe = sentByAdminOrMe;