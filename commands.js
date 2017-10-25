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

const uptimeTimer = new Timer();

const descString = (prefix, cmdName) => {
    // output the command docstring
    console.log(cmdData[cmdName]);
    let currCmd = cmdData[cmdName],
        outText = [];
    // signature and descstring
    let cmdParams = currCmd.params,
        usageStr = prefix + cmdName + " <" + Object.keys(cmdParams).join("> <") + ">";

    outText.push(usageStr);
    outText.push(currCmd.desc + '\n');

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

const removeWhitespace = (str) => {
    return str.replace(/ /g, '');
};

const safeSendMsg = (channel, text, surround = '') => {
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

const numberWithCommas = (x) => {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

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

const randomInRange = (min, max) => {
    return Math.floor(Math.random() * (max + 1 - min)) + min;
};

const youtubeIDToLink = (id) => {
    return 'https://www.youtube.com/watch?v=' + id;
};

let mathVariables = {};
mathConstants = {
    pi: Math.PI,
    e: Math.E
};

commands = {
    listcmd: (msg) => {
        let outText = 'Available commands:\n\n',
            commandsArray = [],
            cmdNames = Object.keys(commandDesc);

        for (let i in cmdNames) {
            let commandName = cmdNames[i],
                commandEntry = '',
                aliasesArray = commandDesc[commandName].aliases;

            commandEntry += commandName;

            if (Array.isArray(aliasesArray)) {
                commandEntry += ' (' + aliasesArray.join(', ') + ')';
            }

            commandsArray.push(commandEntry);
        }

        outText += commandsArray.join(', ');
        return outText;
    },
    help: (msg, cmdName) => {
        let prefix = '<prefix>';
        console.log(cmdData[cmdName]);
        if (typeof cmdData[cmdName] === 'undefined') {
            msg.channel.send('**Undefined command name** "' + cmdName + '"');
        } else {
            msg.channel.send('```' + descString(prefix, cmdName).join('\n') + '```');
        }
    },
    uptime: (msg) => {
        const timeOnline = uptimeTimer.timeElapsedDhms();

        msg.channel.send(`Online for ${timeOnline.days} days, ${timeOnline.hours} hours, ${timeOnline.minutes} minutes and ${timeOnline.seconds} seconds.`);
    },
    import_fn: (msg, text) => {
        if (text === 'this') {
            return exports.cmd.pasta(msg, 'pyzen');
        }
    },
    ping: (msg) => {
        console.log(Date.now(), msg.createdTimestamp);
        let pingTime = (Date.now() - msg.createdTimestamp);
        msg.channel.send('Pong! ' + pingTime + 'ms');
    },
    roll: (msg, sides, dice = 1) => {
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
    pasta: (msg, pastaName) => {
        let pastaData = require("./data/pastas.json");
        if (pastaName !== 'list') {
            pastaText = pastaData[pastaName];

            msg.channel.send(pastaText);
        } else {
            return Object.keys(pastaData).slice(0);
        }
    },
    priceCheck: (msg, item, amount = 1) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/Exchange:';

        axios.get(baseUrl + item).then(response => {
            let $ = cheerio.load(response.data),
                price = parseInt($('#GEPrice').text().replace(/,/g, '')),
                totalPrice = numberWithCommas(price * amount);

            msg.channel.send(item + ' x ' + amount + ': ' + totalPrice + 'gp');
        }).catch((error) => {
            console.log(error);
        });

        return false;
    },
    slayer: (msg, monster, amount = 1, aura = 0) => {
        const baseUrl = 'http://runescape.wikia.com/wiki/';

        let auraMultiplier = slayerAuraChance(aura),
            expectedAmount;

        if (!auraMultiplier) {
            msg.channel.send('**Invalid aura tier **' + aura);
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

            msg.channel.send(monsterName + ' x ' + expectedAmount + ': ' + xpSlayer
                + ' slayer xp, ' + xpCombat + ' combat xp and ' + xpHp + ' hp xp.');
        }).catch((error) => {
            console.log(error);
        });
    },
    wikipedia: (msg, article, lang = 'en') => {
        let baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
            baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

        axios.get(baseUrl + article).then((response) => {
            if (response.data.query.search.length !== 0) {
                let firstResult = response.data.query.search[0],
                    firstResultTitle = firstResult.title.replace(/ /g, '_');

                msg.channel.send('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
            } else {
                msg.channel.send('No search results found for "' + article + '"');
            }
        }).catch((error) => {
            console.log(error);
            if (error.code === 'ENOTFOUND') {
                msg.channel.send('**Invalid language code** "' + lang + '"');
            }
        });
    },
    translate: (msg, langFrom, langInto, ...text) => {
        let textJoined = text.join(' ');

        gtranslate(textJoined, {from: langFrom, to: langInto}).then((res) => {
            let out = '';

            if (res.from.text.autoCorrected || res.from.text.didYouMean) {
                out += '**Autocorrected** "' + textJoined + '" **to** "' + res.from.text.value + '"\n\n';
            }

            out += res.text;

            msg.channel.send(out);
        }).catch(err => {
            console.error(err);
            msg.channel.send('**' + err.message + '**');
        });
    },
    onerm: (msg, weight, reps) => {
        // using Epley formula:
        let max = Math.floor(weight * (1 + reps / 30));

        msg.channel.send('Estimated one rep max: ' + max);
    },
    convert: (msg, number, unitsFrom, unitsTo, dp = 2) => {
        let converted;
        try {
            converted = roundTo(convertUnits(number).from(unitsFrom).to(unitsTo), dp);
            msg.channel.send('**' + number + UNITSPACE + unitsFrom + '** is **' + converted + UNITSPACE + unitsTo + '**');
        } catch (e) {
            msg.channel.send('**Error**: ' + e.message);
        }
    },
    b: (msg) => {
        msg.channel.send(':b:');
    },
    youtube: (msg, query) => {
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

            msg.channel.send(youtubeIDToLink(firstVideoID));
        }).catch((response) => {
            console.log(response);
        });
    },
    prettify: (msg, text) => {
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

        msg.channel.send(prettifiedText);
    },
    cyrillify: (msg, text) => {
        let cyrillifiedText = text.split('').map((elem) => {
            let mappedChar = cyrillicMap[elem];
            if (typeof mappedChar === 'undefined') {
                return elem;
            } else {
                return mappedChar;
            }
        }).join('');

        msg.channel.send(cyrillifiedText);
    },
    setPrefix: (msg, value) => {
        let channelID = msg.channel.id;

        console.log('setting for ' + channelID);
        return new Promise((resolve, reject) => {
            scv.set(channelID, 'prefix', value).then((value) => {
                msg.channel.send("**Prefix set to**: " + value);
                console.log(`prefix set to ${value}`);
                resolve();
            }).catch((err) => {
                msg.channel.send("Failed to set prefix value.");
                reject(err);
            });
        });
    },
    eval: (msg, expression) => {
        let channelID = msg.channel.id,
            context = mathVariables[channelID + ''];

        if (typeof context === 'undefined') {
            context = {};
        }

        try {
            let result = mathjs.eval(expression, context);
            msg.channel.send(`Expression value: ${result}`);
        } catch (e) {
            msg.channel.send('Bad expression. Make sure all variables are defined!');
        }
    },
    setvar: (msg, varname, varvalue) => {
        if (Object.keys(mathConstants).indexOf(varname) !== -1) {
            msg.channel.send(`**Unable to set as variable name** ${varname} **is reserved.**`);
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
                msg.channel.send(`**Variable** ${varname} **created and set to** ${varvalueParsed}`);
            } else {
                msg.channel.send(`**Variable** ${varname} **changed from** ${mathVariables[varname]} **to** ${varvalueParsed}`);
            }

            channelMathVariables[varname] = varvalueParsed;
        }
    },
    setvars: (msg, varnames, varvalues) => {
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
    ree: (msg, i) => {
        if (typeof i === 'number') {
            safeSendMsg(msg.channel, `R${Array(i + 1).join('E')}`);
        } else {
            msg.channel.send('Bad input');
        }
    }
};

module.exports = commands;

module.exports.descString = descString;
module.exports.safeSendMsg = safeSendMsg;
module.exports.MY_CHAR_LIMIT = MY_CHAR_LIMIT;
