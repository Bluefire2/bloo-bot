const cheerio = require('cheerio');
const axios = require('axios');
const gtranslate = require('google-translate-api');
const convertUnits = require('convert-units');

const config = require('./config.json');

const UNITSPACE = '\u202F';

const roundTo = (n, digits) => {
  if(digits === undefined) {
    digits = 0;
  }

  var multiplicator = Math.pow(10, digits);
  n = parseFloat((n * multiplicator).toFixed(11));
  var test =(Math.round(n) / multiplicator);
  return +(test.toFixed(digits));
};

const numberWithCommas = (x) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const slayerAuraChance = (tier) => {
  var auraToTier = {
    "none": 1.0,
    "dedicated": 1.03,
    "greater": 1.05,
    "master" : 1.07,
    "supreme": 1.1,
    "legendary": 1.15
  }, multiplier;

  if(tier > 5 || tier < 0 || (typeof tier !== 'number' && auraToTier[tier] === 'undefined')) {
    return false;
  }

  var index = typeof tier === 'string' ? tier : Object.keys(auraToTier)[tier];

  multiplier = auraToTier[index];
  return 1 / (2 - multiplier); // expected value of geometric distribution
};

const randomInRange = (min, max) => {
  return Math.floor(Math.random() * (max + 1 - min)) + min;
};

const SIDecimalMultiplier = {
  "y": -24,
  "z": -21,
  "a": -18,
  "f": -15,
  "p": -12,
  "n": -9,
  "u": -6,
  "m": -3,
  "c": -2,
  "d": -1,
  "da": 1,
  "h": 2,
  "k": 3,
  "M": 6,
  "G": 9,
  "T": 12,
  "P": 15,
  "E": 18,
  "Z": 21,
  "Y": 24
};

const youtubeIDToLink = (id) => {
  return 'https://www.youtube.com/watch?v=' + id;
};

exports.cmd = {
  import_fn: (msg, text) => {
    if(text === 'this') {
      return exports.cmd.pasta(msg, 'pyzen');
    }
  },
  ping: (msg) => {
    console.log(Date.now(), msg.createdTimestamp);
    var pingTime = (Date.now() - msg.createdTimestamp);
    msg.channel.send('Pong! ' + pingTime + 'ms');
  },
  roll: (msg, sides, dice = 1) => {
    var rolls = [];

    for(let i = 0; i < dice; i++) {
      rolls.push(randomInRange(1, sides));
    }

    return rolls.join(' ');
  },
  pasta: (msg, pastaName) => {
    var pastaData = require("./data/pastas.json");
    if(pastaName !== 'list') {
      pastaText = pastaData[pastaName];

      msg.channel.send(pastaText);
    } else {
      return Object.keys(pastaData).slice(0);
    }
  },
  pc: (msg, item, amount = 1) => {
    const baseUrl = 'http://runescape.wikia.com/wiki/Exchange:';

    axios.get(baseUrl + item)
      .then((response) => {
        // console.log(response.data);
        var $ = cheerio.load(response.data),
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

    var auraMultiplier = slayerAuraChance(aura),
      expectedAmount;

    if(!auraMultiplier) {
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

        var $ = cheerio.load(response.data),
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
  wp: (msg, article, lang = 'en') => {
    var baseUrl = 'https://' + lang + '.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=',
      baseLinkUrl = 'https://' + lang + '.wikipedia.org/wiki/';

    axios.get(baseUrl + article)
      .then((response) => {
        if(response.data.query.search.length !== 0) {
          var firstResult = response.data.query.search[0],
            firstResultTitle = firstResult.title.replace(/ /g, '_');

          msg.channel.send('Wikipedia link: ' + baseLinkUrl + firstResultTitle);
        } else {
          msg.channel.send('No search results found for "' + article + '"');
        }
      })
      .catch((error) => {
        console.log(error);
        if(error.code === 'ENOTFOUND') {
          msg.channel.send('**Invalid language code** "' + lang + '"');
        }
      });
  },
  translate: (msg, langFrom, langInto, ...text) => {
    var textJoined = text.join(' ');

    gtranslate(textJoined, {from: langFrom, to: langInto}).then((res) => {
      var out = '';

      if(res.from.text.autoCorrected || res.from.text.didYouMean) {
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
    var max = Math.floor(weight * (1 + reps / 30));

    msg.channel.send('Estimated one rep max: ' + max);
  },
  convert: (msg, number, unitsFrom, unitsTo, dp = 2) => {
    var converted;
    try {
      converted = roundTo(convertUnits(number).from(unitsFrom).to(unitsTo), dp);
      msg.channel.send('**' + number + UNITSPACE + unitsFrom + '** is **' + converted + UNITSPACE + unitsTo + '**');
    } catch(e) {
      msg.channel.send('**Error**: ' + e.message);
    }
  },
  b: (msg) => {
    msg.channel.send(':b:');
  },
  yt: (msg, query) => {
    var baseYoutubeUrl = 'https://www.googleapis.com/youtube/v3/search';

    axios.get(baseYoutubeUrl, {
      params: {
        key: config.googleAPIKey,
        part: 'snippet',
        order: 'viewCount',
        type: 'video',
        q: query
      }
    }).then((response) => {
      var items = response.data.items,
        firstResult = items[0],
        firstVideoID = firstResult.id.videoId;

        msg.channel.send(youtubeIDToLink(firstVideoID));
    }).catch((response) => {
      console.log(response);
    });
  }
};
