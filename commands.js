const cheerio = require('cheerio');
const axios = require('axios');
const gtranslate = require('google-translate-api');
const convertUnits = require('convert-units');

const scv = require('./modules/scv.js');

const config = require('./config.json');

const commands = require('./data/commands.json');
const cyrillicMap = require('./data/cyrillic.json');
const NUMBERS = require('./data/numbers.json');

const UNITSPACE = '\u202F';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

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

exports.cmd = {
    help: (msg) => {
        let outText = 'Available commands:\n\n',
            commandsArray = [],
            cmdNames = Object.keys(commands);

        for (let i in cmdNames) {
            let commandName = cmdNames[i],
                commandEntry = '',
                aliasesArray = commands[commandName].aliases;

            commandEntry += commandName;

            if (Array.isArray(aliasesArray)) {
                commandEntry += ' (' + aliasesArray.join(', ') + ')';
            }

            commandsArray.push(commandEntry);
        }

        outText += commandsArray.join(', ');
        return outText;
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

        return rolls.join(' ');
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

        axios.get(baseUrl + item)
            .then((response) => {
                // console.log(response.data);
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
        axios.get(baseUrl + monster)
            .then((response) => {
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
            })
            .catch((error) => {
                console.log(error);
            });
    },
    wikipedia: (msg, article, lang = 'en') => {
        let baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
            baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

        axios.get(baseUrl + article)
            .then((response) => {
                if (response.data.query.search.length !== 0) {
                    let firstResult = response.data.query.search[0],
                        firstResultTitle = firstResult.title.replace(/ /g, '_');

                    msg.channel.send('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
                } else {
                    msg.channel.send('No search results found for "' + article + '"');
                }
            })
            .catch((error) => {
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
                firstVideoID = firstResult.id.videoId;

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

        console.log(scv);
        scv.set(channelID, 'prefix', value);

        msg.channel.send("**Prefix set to**: " + value);
    }
};
