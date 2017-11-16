const cheerio = require('cheerio');
const axios = require('axios');
const gtranslate = require('google-translate-api');
const convertUnits = require('convert-units');
const mathjs = require('mathjs');
const Promise = require('bluebird');
const xkcd = require('relevant-xkcd');

const util = require('./util');

const scv = require('./modules/scv');
const cconvert = require('./modules/cconvert');
const Timer = require('./classes/Timer');
const Hangman = require('./classes/Hangman');

const config = require('./config.json');

const commandDesc = require('./data/commands.json');
const cyrillicMap = require('./data/cyrillic.json');
const NUMBERS = require('./data/numbers.json');

const UNITSPACE = '\u202F';

const sourceCodeURL = 'https://github.com/Bluefire2/bloo-bot';

const uptimeTimer = new Timer();

const polls = {},
    hangmen = {},
    hmPMListeners = {},
    hmPMTimeouts = {};

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
    listcmd: (client, msg, sendMsg) => {
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
    help: (client, msg, sendMsg, cmdName) => {
        let prefix = '<prefix>';
        console.log(commandDesc[cmdName]);
        if (typeof commandDesc[cmdName] === 'undefined') {
            sendMsg('**Undefined command name** "' + cmdName + '"');
        } else {
            sendMsg('```' + descString(prefix, cmdName).join('\n') + '```');
        }
    },
    uptime: (client, msg, sendMsg) => {
        const timeOnline = uptimeTimer.timeElapsedDhms();

        sendMsg(`Online for ${timeOnline.days} days, ${timeOnline.hours} hours, ${timeOnline.minutes} minutes and ${timeOnline.seconds} seconds.`);
    },
    ping: (client, msg, sendMsg) => {
        console.log(Date.now(), msg.createdTimestamp);
        let pingTime = (Date.now() - msg.createdTimestamp);
        sendMsg('Pong! ' + pingTime + 'ms');
    },
    source: (client, msg, sendMsg) => {
        sendMsg(`**Source code at** ${sourceCodeURL}`);
    },
    restart: (client, msg, sendMsg) => {
        sendMsg('Restarting bot.').then(() => {
            process.exit(1); // pm2 will restart if the exit code is not 0
        });
    },
    eval_js: (client, msg, sendMsg, code) => {
        const e = eval(code);

        if (typeof e === 'undefined') {
            sendMsg('No returned value');
        } else {
            console.log(e.toString());
            sendMsg(e.toString());
        }
    },
    roll: (client, msg, sendMsg, sides, dice = 1) => {
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
    flipcoin: (client, msg, sendMsg) => {
        let HorT = util.randomInRange(0, 1) === 1 ? 'heads' : 'tails';
        msg.reply(HorT);
    },
    pasta: (client, msg, sendMsg, pastaName) => {
        let pastaData = require("./data/pastas.json");
        if (pastaName !== 'list') {
            pastaText = pastaData[pastaName];

            sendMsg(pastaText);
        } else {
            return Object.keys(pastaData).slice(0);
        }
    },
    priceCheck: (client, msg, sendMsg, item, amount = 1) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/Exchange:';

        axios.get(baseUrl + item).then(response => {
            let $ = cheerio.load(response.data),
                price = parseInt($('#GEPrice').text().replace(/,/g, '')),
                totalPrice = numberWithCommas(price * amount);

            sendMsg(item + ' x ' + amount + ': ' + totalPrice + 'gp');
        }).catch((error) => {
            console.log(error);
        });

        return false;
    },
    slayer: (client, msg, sendMsg, monster, amount = 1, aura = 0) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/';

        let auraMultiplier = slayerAuraChance(aura),
            expectedAmount;

        if (!auraMultiplier) {
            sendMsg('**Invalid aura tier **' + aura);
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

            sendMsg(monsterName + ' x ' + expectedAmount + ': ' + xpSlayer
                + ' slayer xp, ' + xpCombat + ' combat xp and ' + xpHp + ' hp xp.');
        }).catch((error) => {
            console.log(error);
        });
    },
    wikipedia: (client, msg, sendMsg, article, lang = 'en') => {
        let baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
            baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

        axios.get(baseUrl + article).then((response) => {
            if (response.data.query.search.length !== 0) {
                let firstResult = response.data.query.search[0],
                    firstResultTitle = firstResult.title.replace(/ /g, '_');

                sendMsg('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
            } else {
                sendMsg('No search results found for "' + article + '"');
            }
        }).catch((error) => {
            console.log(error);
            if (error.code === 'ENOTFOUND') {
                sendMsg('**Invalid language code** "' + lang + '"');
            }
        });
    },
    translate: (client, msg, sendMsg, langFrom, langInto, ...text) => {
        let textJoined = text.join(' ');

        gtranslate(textJoined, {from: langFrom, to: langInto}).then((res) => {
            let out = '';

            if (res.from.text.autoCorrected || res.from.text.didYouMean) {
                out += '**Autocorrected** "' + textJoined + '" **to** "' + res.from.text.value + '"\n\n';
            }

            out += res.text;

            sendMsg(out);
        }).catch(err => {
            console.error(err);
            sendMsg('**' + err.message + '**');
        });
    },
    convert: (client, msg, sendMsg, number, unitsFrom, unitsTo, dp = 2) => {
        let converted;
        try {
            converted = util.roundTo(convertUnits(number).from(unitsFrom).to(unitsTo), dp);
            sendMsg('**' + number + UNITSPACE + unitsFrom + '** is **' + converted + UNITSPACE + unitsTo + '**');
        } catch (e) {
            sendMsg('**Error**: ' + e.message);
        }
    },
    b: (client, msg, sendMsg) => {
        sendMsg(':b:');
    },
    youtube: (client, msg, sendMsg, query) => {
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

            sendMsg(util.youtubeIDToLink(firstVideoID));
        }).catch((response) => {
            console.log(response);
        });
    },
    prettify: (client, msg, sendMsg, text) => {
        let prettifiedText = (text + '').split(' ').map((word) => {
            return word.split('').map((char) => {
                if (util.isLetter(char)) {
                    return ':regional_indicator_' + char.toLowerCase() + ':';
                } else if (typeof NUMBERS[char] !== 'undefined') {
                    return ':' + NUMBERS[char] + ':';
                } else {
                    return char;
                }
            }).join('');
        }).join('  ');

        sendMsg(prettifiedText);
    },
    cyrillify: (client, msg, sendMsg, text) => {
        let cyrillifiedText = text.split('').map((elem) => {
            let mappedChar = cyrillicMap[elem];
            if (typeof mappedChar === 'undefined') {
                return elem;
            } else {
                return mappedChar;
            }
        }).join('');

        sendMsg(cyrillifiedText);
    },
    setPrefix: (client, msg, sendMsg, value) => {
        let channelID = msg.channel.id;

        console.log('setting for ' + channelID);
        return new Promise((resolve, reject) => {
            scv.set(channelID, 'prefix', value).then((value) => {
                sendMsg("**Prefix set to**: " + value);
                console.log(`prefix set to ${value}`);
                resolve();
            }).catch((err) => {
                sendMsg("Failed to set prefix value.");
                reject(err);
            });
        });
    },
    addCustomAlias: (client, msg, sendMsg, command, alias) => {
        // validate input - make sure `command` is a valid command
        if(Object.keys(commandDesc).indexOf(command) === -1) {
            sendMsg(`Undefined command "${command}".`);
        } else {
            const channelID = msg.channel.id;

            scv.get(channelID, 'aliases').then(val => {
                console.log(val);
                let currentAliases;
                if(!val) {
                    currentAliases = {};
                } else {
                    console.log(val);
                }

                if(typeof currentAliases[command] === 'undefined') {
                    currentAliases[command] = [];
                }

                currentAliases[command].push(alias);

                scv.set(channelID, 'aliases', currentAliases);
            });
        }
    },
    eval: (client, msg, sendMsg, expression) => {
        let channelID = msg.channel.id,
            context = mathVariables[channelID + ''];

        if (typeof context === 'undefined') {
            context = {};
        }

        try {
            let result = mathjs.eval(expression, context);
            sendMsg(`Expression value: ${result}`);
        } catch (e) {
            sendMsg('Bad expression. Make sure all variables are defined!');
        }
    },
    setvar: (client, msg, sendMsg, varname, varvalue) => {
        if (Object.keys(mathConstants).indexOf(varname) !== -1) {
            sendMsg(`**Unable to set as variable name** ${varname} **is reserved.**`);
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
                sendMsg(`**Variable** ${varname} **created and set to** ${varvalueParsed}`);
            } else {
                sendMsg(`**Variable** ${varname} **changed from** ${mathVariables[varname]} **to** ${varvalueParsed}`);
            }

            channelMathVariables[varname] = varvalueParsed;
        }
    },
    setvars: (client, msg, sendMsg, varnames, varvalues) => {
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
    ree: (client, msg, sendMsg, i) => {
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
            sendMsg("Too long!");
        }
    },
    currconvert: (client, msg, sendMsg, amount, currFrom, currTo, dp = 2) => {
        const currFromTemp = currFrom.toUpperCase(),
            currToTemp = currTo.toUpperCase();

        cconvert.convert(amount, currFromTemp, currToTemp).then(val => {
            if (isNaN(val)) {
                sendMsg("Oops, something went wrong. Check that your currencies are both valid!");
            } else {
                sendMsg(`${currFromTemp} ${amount} is ${currToTemp} ${util.roundTo(val, dp)}.`);
            }
        }).catch(err => {
            sendMsg("Oops, something went wrong. Check that your currencies are both valid!");
        });
    },
    poll: (client, msg, sendMsg, action, optionsStr = '') => {
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
                    sendMsg('**Poll opened.**');
                } else {
                    sendMsg('No poll to open!');
                }
            } else {
                sendMsg('Must be admin to open, close or delete a poll.');
            }
        } else if (action === 'close') {
            if (util.sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    closePoll();
                    sendMsg('**Poll closed.**');
                } else {
                    sendMsg('No poll to close!');
                }
            } else {
                sendMsg('Must be admin to open, close or delete a poll.');
            }
        } else if (action === 'create') {
            if (!pollExists()) {
                // validate input:
                if (optionsStr === '') {
                    sendMsg('Must specify poll options!');
                }
                const options = optionsStr.split(';').map(string => string.trim());
                if (!Array.isArray(options) || options.length < 2) {
                    sendMsg('Must have more than one option!');
                    return;
                }
                // do stuff
                polls[channelID] = {
                    open: true,
                    votes: {},
                    options: options
                };
                sendMsg('**New poll created and opened.**');
            } else {
                sendMsg('Delete the current poll before creating a new one!');
            }
        } else if (action === 'delete') {
            if (util.sentByAdminOrMe(msg)) {
                if (pollExists()) {
                    deletePoll();
                    sendMsg('**Current poll deleted.**');
                } else {
                    sendMsg('No poll to delete!');
                }
            } else {
                sendMsg('Must be admin to open, close or delete a poll.');
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
                sendMsg('No poll active.');
            }
        } else {
            sendMsg(`Invalid poll action "${action}"`);
        }
    },
    vote: (client, msg, sendMsg, option) => {
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
                sendMsg(`No such option "${option}".`);
            }
        } else {
            // delegate and let votei raise the error
            commands.votei(msg, -1);
        }
    },
    votei: (client, msg, sendMsg, optionIndex) => {
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

                    sendMsg(`**Successfully voted for**: "${poll.options[optionIndex - 1]}".`);
                } else {
                    sendMsg('Invalid option index.');
                }
            } else {
                sendMsg('Current poll is closed.');
            }
        } else {
            sendMsg('No poll active!');
        }
    },
    xkcd: (client, msg, sendMsg, keywords) => {
        xkcd.fetchRelevant(keywords).then(response => {
            let outString = '';

            outString += `Relevant XKCD found: **${response.safeTitle}**\n\n`;
            outString += response.imageURL;
            //outString += response.altText;

            sendMsg(outString);
        });
    },
    hangman: (client, msg, sendMsg, action, guessLetter = '') => {
        const channelID = msg.channel.id,
            hm = hangmen[channelID];

        if (action === 'start') {
            // current pm listener
            const hmPMListener = hmPMListeners[channelID],
                hmPMTimeout = hmPMTimeouts[channelID],
                user = msg.author,
                MAX_PHRASE_LENGTH = 100;

            sendMsg(`${util.tagUser(user)}, check your PMs!`);

            new Promise((resolve, reject) => {
                // remove any present listeners
                if(typeof hmPMListener !== 'undefined') {
                    client.removeListener('message', hmPMListener);
                }

                // timeout the listener after 60s
                if(typeof hmPMTimeout !== 'undefined') {
                    clearTimeout(hmPMTimeout);
                }

                hmPMTimeouts[channelID] = setTimeout(reject, 60000);

                // send the user instructions
                user.send('Message me the game settings for the game, like so:');
                user.send('[phrase], [max_guesses]');
                user.send('[phrase] is the phrase/word (letters only) to guess, and [max_guesses] is the amount of wrong guesses allowed.');
                user.send('Don\'t include the [], and remember to separate the two with a comma.');

                // this is the function that we use as our onmessage listener
                // it looks for a PM from the user and checks that it's the right format
                hmPMListeners[channelID] = initMsg => {
                    if (util.isPM(initMsg) && initMsg.author.id === msg.author.id) {
                        // we got a PM, and it's from the correct user
                        // verify that it's valid input

                        const initMsgSplit = initMsg.content.split(',');

                        if (initMsgSplit.length === 2 && util.TypeCheck.int(initMsgSplit[1].trim())) {
                            const phrase = initMsgSplit[0].trim(),
                                limit = parseInt(initMsgSplit[1].trim());


                            if (!util.isPhrase(phrase)) {
                                initMsg.channel.send('Phrase must consist of only letters and spaces.');
                            } else if(phrase.length > MAX_PHRASE_LENGTH) {
                                initMsg.channel.send(`Phrase cannot be longer than ${MAX_PHRASE_LENGTH} characters, currently ${phrase.length} characters.`);
                            } else {
                                initMsg.channel.send(`Starting hangman with phrase "${phrase}" and ${limit} wrong guesses.`);
                                clearTimeout(hmPMTimeouts[channelID]);
                                resolve({phrase: phrase, max_score: limit});
                            }
                        } else {
                            initMsg.channel.send('Please specify the parameters in the correct format: "phrase, max_guesses".');
                        }
                    }
                };

                client.on('message', hmPMListeners[channelID]);
            }).then(hmArgs => {
                sendMsg(`Hangman game started, with ${hmArgs.max_score} wrong guesses.`);

                const h = new Hangman();

                h.init(hmArgs);

                hangmen[channelID] = h;
            }).catch(err => {
                sendMsg(`${util.tagUser(user)}, you took too long to send the PM :( Try again if you want to start.`);
            }).finally(() => {
                // clear the listener; this used to cause a bug where all the previous listeners would accumulate
                client.removeListener('message', hmPMListeners[channelID]);
                clearTimeout(hmPMTimeouts[channelID]);
            });

        } else if (typeof hm !== 'undefined') {
            // check game is not over
            if (!hm.isFinished()) {
                // if not, then do the thing
                if (action === 'guess') {
                    if (guessLetter === '') {
                        sendMsg('No letter/phrase specified.');
                    } else {
                        if (guessLetter.length === 1) {
                            // if it's a char then we guess one letter:

                            // verify that it's a letter
                            if (!util.isLetter(guessLetter)) {
                                sendMsg('Letter must be... a letter.');
                            } else {
                                const result = hm.action('guess', [guessLetter]);

                                if (result) {
                                    sendMsg('Good guess!');
                                    sendMsg(`Full phrase: \`${hm.action('hint', [])}\``);

                                    // check if we won
                                    if (hm.isWon()) {
                                        sendMsg('Congratulations! You win!');
                                    }
                                } else {
                                    // check if we lost
                                    if (hm.isLost()) {
                                        sendMsg('Oops... you guessed wrong and that was your last wrong guess. Game over :(');
                                        sendMsg(`The phrase was "${hm.action('phrase', [])}"`);
                                    } else {
                                        sendMsg(`Oops... you guessed wrong. ${hm.remaining()} wrong guesses left!`);
                                    }
                                }
                            }
                        } else {
                            // if it's a string, we guess the entire phrase:
                            const guessString = guessLetter;

                            if (!util.isPhrase(guessString)) {
                                // one or more characters are not letters or spaces
                                sendMsg('Guess must only contain letters.');
                            } else {
                                const result = hm.action('guessPhrase', [guessString]);

                                if (result) {
                                    sendMsg(`Well done! You guessed the correct phrase "${guessString}".`);
                                } else {
                                    if (hm.isLost()) {
                                        sendMsg('Oops... you guessed wrong and that was your last wrong guess. Game over :(');
                                        sendMsg(`The phrase was "${hm.action('phrase', [])}"`);
                                    } else {
                                        console.log(hm.score);
                                        sendMsg(`Oops... you guessed wrong. ${hm.remaining()} wrong guesses left!`);
                                    }
                                }
                            }
                        }
                    }
                } else if (action === 'hint') {
                    sendMsg(`Current word/phrase: \`${hm.action('hint', [])}\``);
                } else {
                    sendMsg(`Undefined action ${action}`);
                }
            } else {
                sendMsg('Current game is over, you must start a new one.');
            }
        } else {
            sendMsg('No game initialised, you must first start one.');
        }
    },
    cshift: (client, msg, sendMsg, k, phrase) => {
        const key = Number.isInteger(parseInt(k)) ? k : util.letterToIndex(k),
            codetext = phrase.split('').map(char => {
                if(char === ' ') {
                    return ' ';
                } else {
                    const i = util.letterToIndex(char);

                    return util.indexToLetter(i + key);
                }
            }).join('');

        sendMsg(codetext);
    }
};

// export stuff
module.exports = commands;
module.exports.descString = descString;