const cheerio = require('cheerio');
const axios = require('axios');
const gtranslate = require('google-translate-api');
const convertUnits = require('convert-units');
const mathjs = require('mathjs');
const Promise = require("bluebird");
const xkcd = require('relevant-xkcd');

const util = require('./util');

const scv = require('./modules/scv');
const cconvert = require('./modules/cconvert');
const Timer = require('./modules/timer');

const config = require('./config.json');

const commandDesc = require('./data/commands.json');
const cyrillicMap = require('./data/cyrillic.json');
const NUMBERS = require('./data/numbers.json');

const UNITSPACE = '\u202F';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const sourceCodeURL = 'https://github.com/Bluefire2/bloo-bot';

const uptimeTimer = new Timer();

const polls = {};

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
    let currCmd = commandDesc[cmdName],
        outText = [];
    // signature and descstring
    const cmdParams = typeof currCmd.params === 'undefined' ? {} : currCmd.params; // huh
    let admin = false,
        me = false;

    if (typeof currCmd.permissions !== 'undefined') {
        if (currCmd.permissions === 'me') {
            me = true;
        } else if (currCmd.permissions === 'admin') {
            admin = true;
        }
    }
    let usageStr = prefix + cmdName;

    if (Object.keys(cmdParams).length !== 0) {
        const defaults = typeof currCmd.defaults === 'undefined' ? 0 : currCmd.defaults,
            numParams = Object.keys(cmdParams).length;

        const pDocs = Object.keys(cmdParams).map(key => {
            const parameter = cmdParams[key];
            let pString = `${key}`;

            if (typeof parameter.default !== 'undefined') {
                // a default parameter
                pString += `=${parameter.default}`;
            }

            pString += ` (${Array.isArray(parameter.type) ? parameter.type.join(', ') : parameter.type})`;

            return pString;
        });

        usageStr += " <" + pDocs.join("> <") + ">";
    }

    outText.push(usageStr);
    if (me) {
        outText.push(currCmd.desc + ' (bot admin only)');
    } else if (admin) {
        outText.push(currCmd.desc + ' (requires channel admin privileges)');
    } else {
        outText.push(currCmd.desc);
    }
    outText.push('\n');

    // parameters
    if (!util.objectIsEmpty(cmdParams)) {
        outText.push('Parameters:');
        Object.keys(cmdParams).forEach(key => {
            let parameter = cmdParams[key];
            outText.push(key + ": " + parameter.desc);
        });
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
    listcmd: (msg, sendmsg) => {
        let outText = 'Available commands:\n\n',
            commandsArray = [],
            cmdNames = Object.keys(commandDesc);

        for (let i in cmdNames) {
            let commandName = cmdNames[i],
                commandEntry = '',
                aliasesArray = commandDesc[commandName].aliases,
                admin = typeof commandDesc[commandName].permissions === 'undefined' ? false : commandDesc[commandName].permissions;

            if (admin === 'me') {
                continue; // don't display the command if it's bot admin only
            } else if (admin === 'admin') {
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
    help: (msg, sendmsg, cmdName) => {
        let prefix = '<prefix>';
        console.log(commandDesc[cmdName]);
        if (typeof commandDesc[cmdName] === 'undefined') {
            sendmsg('**Undefined command name** "' + cmdName + '"');
        } else {
            sendmsg('```' + descString(prefix, cmdName).join('\n') + '```');
        }
    },
    uptime: (msg, sendmsg) => {
        const timeOnline = uptimeTimer.timeElapsedDhms();

        sendmsg(`Online for ${timeOnline.days} days, ${timeOnline.hours} hours, ${timeOnline.minutes} minutes and ${timeOnline.seconds} seconds.`);
    },
    ping: (msg, sendmsg) => {
        console.log(Date.now(), msg.createdTimestamp);
        let pingTime = (Date.now() - msg.createdTimestamp);
        sendmsg('Pong! ' + pingTime + 'ms');
    },
    source: (msg, sendmsg) => {
        sendmsg(`**Source code at** ${sourceCodeURL}`);
    },
    restart: (msg, sendmsg) => {
        sendmsg('Restarting bot.').then(() => {
            process.exit(1); // pm2 will restart if the exit code is not 0
        });
    },
    roll: (msg, sendmsg, sides, dice = 1) => {
        let rolls = [];

        for (let i = 0; i < dice; i++) {
            rolls.push(util.randomInRange(1, sides));
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
                    return util.roundTo(data[key](val), 3);
                };

                return `${key}: ${func(rolls)}`;
            }).join(', ');

        return `${rollsString};\n\n${dataString}`;
    },
    flipcoin: (msg, sendmsg) => {
        let HorT = util.randomInRange(0, 1) === 1 ? 'heads' : 'tails';
        msg.reply(HorT);
    },
    pasta: (msg, sendmsg, pastaName) => {
        let pastaData = require("./data/pastas.json");
        if (pastaName !== 'list') {
            pastaText = pastaData[pastaName];

            sendmsg(pastaText);
        } else {
            return Object.keys(pastaData).slice(0);
        }
    },
    priceCheck: (msg, sendmsg, item, amount = 1) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/Exchange:';

        axios.get(baseUrl + item).then(response => {
            let $ = cheerio.load(response.data),
                price = parseInt($('#GEPrice').text().replace(/,/g, '')),
                totalPrice = numberWithCommas(price * amount);

            sendmsg(item + ' x ' + amount + ': ' + totalPrice + 'gp');
        }).catch((error) => {
            console.log(error);
        });

        return false;
    },
    slayer: (msg, sendmsg, monster, amount = 1, aura = 0) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/';

        let auraMultiplier = slayerAuraChance(aura),
            expectedAmount;

        if (!auraMultiplier) {
            sendmsg('**Invalid aura tier **' + aura);
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

            sendmsg(monsterName + ' x ' + expectedAmount + ': ' + xpSlayer
                + ' slayer xp, ' + xpCombat + ' combat xp and ' + xpHp + ' hp xp.');
        }).catch((error) => {
            console.log(error);
        });
    },
    wikipedia: (msg, sendmsg, article, lang = 'en') => {
        let baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
            baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

        axios.get(baseUrl + article).then((response) => {
            if (response.data.query.search.length !== 0) {
                let firstResult = response.data.query.search[0],
                    firstResultTitle = firstResult.title.replace(/ /g, '_');

                sendmsg('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
            } else {
                sendmsg('No search results found for "' + article + '"');
            }
        }).catch((error) => {
            console.log(error);
            if (error.code === 'ENOTFOUND') {
                sendmsg('**Invalid language code** "' + lang + '"');
            }
        });
    },
    translate: (msg, sendmsg, langFrom, langInto, ...text) => {
        let textJoined = text.join(' ');

        gtranslate(textJoined, {from: langFrom, to: langInto}).then((res) => {
            let out = '';

            if (res.from.text.autoCorrected || res.from.text.didYouMean) {
                out += '**Autocorrected** "' + textJoined + '" **to** "' + res.from.text.value + '"\n\n';
            }

            out += res.text;

            sendmsg(out);
        }).catch(err => {
            console.error(err);
            sendmsg('**' + err.message + '**');
        });
    },
    convert: (msg, sendmsg, number, unitsFrom, unitsTo, dp = 2) => {
        let converted;
        try {
            converted = util.roundTo(convertUnits(number).from(unitsFrom).to(unitsTo), dp);
            sendmsg('**' + number + UNITSPACE + unitsFrom + '** is **' + converted + UNITSPACE + unitsTo + '**');
        } catch (e) {
            sendmsg('**Error**: ' + e.message);
        }
    },
    b: (msg, sendmsg) => {
        sendmsg(':b:');
    },
    youtube: (msg, sendmsg, query) => {
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

            sendmsg(util.youtubeIDToLink(firstVideoID));
        }).catch((response) => {
            console.log(response);
        });
    },
    prettify: (msg, sendmsg, text) => {
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

        sendmsg(prettifiedText);
    },
    cyrillify: (msg, sendmsg, text) => {
        let cyrillifiedText = text.split('').map((elem) => {
            let mappedChar = cyrillicMap[elem];
            if (typeof mappedChar === 'undefined') {
                return elem;
            } else {
                return mappedChar;
            }
        }).join('');

        sendmsg(cyrillifiedText);
    },
    setPrefix: (msg, sendmsg, value) => {
        let channelID = msg.channel.id;

        console.log('setting for ' + channelID);
        return new Promise((resolve, reject) => {
            scv.set(channelID, 'prefix', value).then((value) => {
                sendmsg("**Prefix set to**: " + value);
                console.log(`prefix set to ${value}`);
                resolve();
            }).catch((err) => {
                sendmsg("Failed to set prefix value.");
                reject(err);
            });
        });
    },
    eval: (msg, sendmsg, expression) => {
        let channelID = msg.channel.id,
            context = mathVariables[channelID + ''];

        if (typeof context === 'undefined') {
            context = {};
        }

        try {
            let result = mathjs.eval(expression, context);
            sendmsg(`Expression value: ${result}`);
        } catch (e) {
            sendmsg('Bad expression. Make sure all variables are defined!');
        }
    },
    setvar: (msg, sendmsg, varname, varvalue) => {
        if (Object.keys(mathConstants).indexOf(varname) !== -1) {
            sendmsg(`**Unable to set as variable name** ${varname} **is reserved.**`);
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
                sendmsg(`**Variable** ${varname} **created and set to** ${varvalueParsed}`);
            } else {
                sendmsg(`**Variable** ${varname} **changed from** ${mathVariables[varname]} **to** ${varvalueParsed}`);
            }

            channelMathVariables[varname] = varvalueParsed;
        }
    },
    setvars: (msg, sendmsg, varnames, varvalues) => {
        const varnamesArray = util.removeWhitespace(varnames).split(','),
            varvaluesArray = util.removeWhitespace(varvalues).split(',');

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
    ree: (msg, sendmsg, i) => {
        let eeee = "",
            reeee;

        if (i >= 0) {
            for (let j = 0; j < i; j++) {
                eeee += "E";
            }
            reeee = "R" + eeee;
        } else {
            for (let j = i; j < 0; j++) {
                eeee += "E";
            }
            reeee = eeee + "R";
        }

        if (!util.safeSendMsg(msg.channel, reeee)) {
            sendmsg("Too long!");
        }
    },
    currconvert: (msg, sendmsg, amount, currFrom, currTo, dp = 2) => {
        const currFromTemp = currFrom.toUpperCase(),
            currToTemp = currTo.toUpperCase();

        cconvert.convert(amount, currFromTemp, currToTemp).then(val => {
            if (isNaN(val)) {
                sendmsg("Oops, something went wrong. Check that your currencies are both valid!");
            } else {
                sendmsg(`${currFromTemp} ${amount} is ${currToTemp} ${util.roundTo(val, dp)}.`);
            }
        }).catch(err => {
            sendmsg("Oops, something went wrong. Check that your currencies are both valid!");
        });
    },
    poll: (msg, sendmsg, action, optionsStr = '') => {
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
            if (util.sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    openPoll();
                    sendmsg('**Poll opened.**');
                } else {
                    sendmsg('No poll to open!');
                }
            } else {
                sendmsg('Must be admin to open, close or delete a poll.');
            }
        } else if (action === 'close') {
            if (util.sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    closePoll();
                    sendmsg('**Poll closed.**');
                } else {
                    sendmsg('No poll to close!');
                }
            } else {
                sendmsg('Must be admin to open, close or delete a poll.');
            }
        } else if (action === 'create') {
            if (!pollExists()) {
                // validate input:
                if (optionsStr === '') {
                    sendmsg('Must specify poll options!');
                }
                const options = optionsStr.split(';').map(string => string.trim());
                if (!Array.isArray(options) || options.length < 2) {
                    sendmsg('Must have more than one option!');
                    return;
                }
                // do stuff
                polls[channelID] = {
                    open: true,
                    votes: {},
                    options: options
                };
                sendmsg('**New poll created and opened.**');
            } else {
                sendmsg('Delete the current poll before creating a new one!');
            }
        } else if (action === 'delete') {
            if (util.sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    deletePoll();
                    sendmsg('**Current poll deleted.**');
                } else {
                    sendmsg('No poll to delete!');
                }
            } else {
                sendmsg('Must be admin to open, close or delete a poll.');
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
                        percentage = util.roundTo(count / totalVotes * 100, 2);

                    let currentCountString = `${options.indexOf(key) + 1}. ${key}: ${count} votes`;

                    if (!isNaN(percentage)) {
                        // if no votes have been case, percentage gets evaluated to NaN
                        currentCountString += ' ' + `(${percentage}%)`;
                    }

                    outText.push(currentCountString);
                });

                return outText;
            } else {
                sendmsg('No poll active.');
            }
        } else {
            sendmsg(`Invalid poll action "${action}"`);
        }
    },
    vote: (msg, sendmsg, option) => {
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
                sendmsg(`No such option "${option}".`);
            }
        } else {
            // delegate and let votei raise the error
            commands.votei(msg, -1);
        }
    },
    votei: (msg, sendmsg, optionIndex) => {
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

                    sendmsg(`**Successfully voted for**: "${poll.options[optionIndex - 1]}".`);
                } else {
                    sendmsg('Invalid option index.');
                }
            } else {
                sendmsg('Current poll is closed.');
            }
        } else {
            sendmsg('No poll active!');
        }
    },
    xkcd: (msg, sendmsg, keywords) => {
        xkcd.fetchRelevant(keywords).then(response => {
            let outString = '';

            outString += `Relevant XKCD found: **${response.safeTitle}**\n\n`;
            outString += response.imageURL;
            //outString += response.altText;

            sendmsg(outString);
        });
    }
};

// export stuff
module.exports = commands;
module.exports.descString = descString;