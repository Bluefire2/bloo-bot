class Hangman {
    // ALPHABET;
    // lettersGuessedMap;
    // phrase;
    // guessedCorrectly;
    // score;
    // MAX_SCORE;
    //
    // done;
    // win;
    // lose;

    constructor() {
        this.ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        this.lettersGuessedMap = {};

        this.ALPHABET.forEach(elem => {
            this.lettersGuessedMap[elem] = false;
        });

        this.score = 0;

        this.done = this.win = this.lose = false;

        this.actions = {
            guess: l => {
                const letter = l.toUpperCase();

                const prev = this.lettersGuessedMap[letter];
                this.lettersGuessedMap[letter] = true;

                if (this.phrase.indexOf(letter) !== -1) {
                    if (!prev) {
                        this.unguessed -= this.letterCounts[letter];
                    }

                    if (this.unguessed === 0) {
                        this.done = this.win = true;
                    }
                    return true;
                } else {
                    this.score++;

                    if (this.score === this.MAX_SCORE) {
                        this.done = this.lose = true;
                    }
                    return false;
                }
            },
            hint: () => {
                return this.phrase.map(elem => {
                    if (elem === ' ') {
                        return '  '; // double space
                    } else {
                        return this.lettersGuessedMap[elem] ? elem + '\u202F' : '_\u202F'; // half space
                    }
                }).join('');
            }
        };
    }

    init(args) {
        this.phrase = args.phrase.split('').map(elem => elem.toUpperCase());
        this.letterCounts = {};
        this.phrase.forEach(elem => {
            if (typeof this.letterCounts[elem] === 'undefined') {
                this.letterCounts[elem] = 1;
            } else {
                this.letterCounts[elem]++;
            }
        });
        this.unguessed = this.phrase.filter(elem => elem !== ' ').length;
        this.MAX_SCORE = args.max_score;
    }

    action(type, args) {
        const fn = this.actions[type];
        if (typeof fn !== 'undefined' && !this.isFinished()) {
            return fn.apply(this, args);
        } else {
            return false;
        }
    }

    isFinished() {
        return this.done;
    }

    isWon() {
        return this.win;
    }

    isLost() {
        return this.lose;
    }

    remaining() {
        return this.MAX_SCORE - this.score;
    }
}

module.exports = Hangman;