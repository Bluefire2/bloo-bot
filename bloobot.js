const Discord = require('discord.js');
const client = new Discord.Client();

const cmd = require('./commands.js');
const scv = require('./modules/scv');
const defaults = require('./modules/defaults');

const config = require('./config.json');
const cmdData = require('./data/commands.json');

const test = process.argv[2] === 'test';
const loginToken = test ? config.test_token : config.token;

/**
 * A function to deal with retrieving channel variables. If the variable is undefined, this function returns its
 * default value.
 *
 * @param channelID The current channel ID.
 * @param variable The name of the channel variable to be fetched.
 * @returns {Promise} A promise that resolves with the value to be assigned to this variable in the current context.
 */
const getVariableWithFallback = (channelID, variable) => {
    // I HATE THIS ASYNC HYPE GARBAGE
    // WHY DOES EVERYTHING IN THIS LANGUAGE HAVE TO BE ASYNC
    // THE SIMPLEST THINGS ABSOLUTELY MUST BE ASYNC
    // BECAUSE IF THEY'RE NOT THEN IT WOULD ACTUALLY BE CONVENIENT AND WE CAN'T HAVE THAT CAN WE
    // ASYNC IS USEFUL BUT NOT FOR LITERALLY EVERY LITTLE THING
    // AND NOW I NEED 10 LAYERS OF PROMISES FOR EVERYTHING I DO TO DEAL WITH ASYNC RACE CONDITIONS
    // REEEEEEEEEEEEEEEEEEEEEEE
    return new Promise((resolve, reject) => {
        scv.get(channelID, variable).then(val => {
            if (val) {
                resolve(val);
            } else {
                resolve(defaults.get(variable));
            }
        }).catch(err => {
            reject(err);
        });
    });
};

/**
 * Updates all channel variables.
 * TODO: fix this so it doesn't just update prefix but can iterate over a list of variables to update. Maybe use Promise.all?
 *
 * @param channelID The current channel ID.
 * @returns {Promise} A promise that resolves when the variables have been updated.
 */
const updateVariables = (channelID) => {
    return new Promise((resolve, reject) => {
        getVariableWithFallback(channelID, 'prefix').then(val => {
            allPrefixes[channelID + ''] = val;
            resolve();
        }).catch(err => {
            reject(err);
        });
    });
};

/**
 * Checks if the string is an alias for some command.
 * TODO: make this return a special string in case of no applicable command being found, for consistency
 *
 * @param alias The string to be cross-checked.
 * @returns {*} The relevant command name if the string is an alias for some command, or false if not.
 */
const checkForAlias = (alias) => {
    let cmdNames = Object.keys(cmdData),
        out = '';

    for (let i in cmdNames) {
        let cmdName = cmdNames[i],
            cmdObj = cmdData[cmdName],
            aliases = cmdObj.aliases;
        if (Array.isArray(aliases)) {
            if (aliases.indexOf(alias) !== -1) {
                out = cmdName;
            }
        }
    }

    if (out === '') {
        return false;
    } else {
        return out;
    }
};

// Global variables
let variablesLoaded = {},
    allPrefixes = {};

client.on('ready', () => {
    console.log('Hello world!');
    // scv.drop();
    // scv.create();
    // scv.listTable();
});

/*
 * This triggers on every message. Use this to listen to commands and master commands.
 */
client.on('message', (msg) => {
    const channelID = msg.channel.id;

    /*
     * Update all variables if we're just starting up; if not then just resolve.
     */
    const varRequest = new Promise((resolve, reject) => {
        if (!variablesLoaded[channelID]) {
            updateVariables(channelID).then(() => {
                resolve();
                variablesLoaded[channelID] = true;
            });
        } else {
            resolve();
        }
    });

    // once we've updated our variables (if we need to), try to parse a command
    varRequest.then(() => {
        let prefix = allPrefixes[channelID + ''];

        if (typeof prefix === 'undefined') {
            let p = defaults.get('prefix');
            allPrefixes[channelID + ''] = p;
            prefix = p;
        }

        switch (msg.content) {
            /*
             * Master commands. These commands do not depend on the prefix.
             */
            case 'bloobotprefix':
                // Master command that lists the prefix. This command must be independent of
                // the current prefix and therefore cannot be handled by regular command logic.
                msg.channel.send(`**Command prefix currently in use**: ${prefix}`);
                break;

            case 'resetprefix':
                // Master command that resets the prefix to ~.

                // admins only (and me)
                if (cmd.sentByAdminOrMe(msg)) {
                    cmd.setPrefix(msg, '~').then(() => {
                        return updateVariables(channelID);
                    }).then(() => {
                        // done
                        // TODO: maybe change this so that execution is paused until promise is complete
                    });
                }
                break;
            default:
                if (msg.author === client.user) {
                    // make sure the bot doesn't respond to its own messages

                } else if (!msg.content.startsWith(prefix)) {
                    // message doesn't start with the prefix so do nothing

                } else {
                    console.log(msg.content); // for debugging and just making sure it works
                    let parsedCmd = cmdParse(msg, prefix), // parse out the command and args
                        output;
                    if (parsedCmd) {
                        cmdExe(msg, parsedCmd.cmdName, parsedCmd.cmdArgs, prefix).then((out) => {
                            output = out;
                            console.log(parsedCmd); // same as above

                            // if we need to output something that was returned from the command, then do so
                            if (output.length !== 0) {
                                // send the message
                                if (!cmd.safeSendMsg(msg.channel, output.join('\n'), '```')) {
                                    msg.channel.send(`Outbound message length greater than ${cmd.MY_CHAR_LIMIT} character limit.`);
                                }
                            }
                        });
                    } else {
                        // do nothing? idk
                    }
                }
                break;
        }
    });
});

// Create an event listener for new guild members
client.on('guildMemberAdd', member => {
    // Send the message to a designated channel on a server:
    const channel = member.guild.channels.find('name', 'member-log');
    // Do nothing if the channel wasn't found on this server
    if (!channel) return;
    // Send the message, mentioning the member
    channel.send(`Welcome to the server, ${member}`);
});

client.login(loginToken);

/**
 * Executes a command using the function reference found in the command documentation file. This function is supposed to
 * be called after cmdParse, and take the command name and command args from its output.
 *
 * @param msg The message that requested the command to be executed.
 * @param cmdName The name of the command specified.
 * @param args The arguments given to the command.
 * @param prefix The command prefix currently in use.
 * @returns {Promise} A promise that resolves with an array of the text to be messaged inside ``, if any, line by line.
 */
function cmdExe(msg, cmdName, args, prefix) {
    const currCmd = cmdData[cmdName],
        // note: paramsCount DOES include default parameters!!!
        paramsCount = typeof currCmd.params === 'undefined' ? 0 : Object.keys(currCmd.params).length,
        defaultsCount = typeof currCmd.defaults === 'undefined' ? 0 : currCmd.defaults,
        channelID = msg.channel.id;

    let outText = [];

    return new Promise((resolve, reject) => {
        new Promise((res, rej) => {
            if (args.length === 0 && paramsCount !== 0) {
                outText = cmd.descString(prefix, cmdName);
                res();
            } else {
                if (currCmd.admin && !cmd.sentByAdminOrMe(msg)) { // check for privileges if the command requires them
                    outText = ['The command ' + cmdName + ' requires administrator privileges.'];
                    res();
                } else if (args.length < paramsCount - defaultsCount) { // check if the number of args is correct
                    outText = [`The command ${cmdName} requires at least ${paramsCount - defaultsCount} arguments; received ${args.length}.`];
                    res();
                } else {
                    const func = cmd[currCmd.fn],
                        fullArgs = args.slice(0),
                        sendingFunction = (text) => msg.channel.send.call(msg.channel, text);
                    // for some reason this is necessary, instead of just msg.channel.send :(

                    fullArgs.unshift(sendingFunction);
                    fullArgs.unshift(msg);

                    // call the command function:
                    const moreText = func.apply(this, fullArgs);

                    // process result
                    if (typeof moreText === 'string') {
                        outText.push(moreText);
                        res();
                    } else if (Array.isArray(moreText)) {
                        outText = outText.concat(moreText);
                        res();
                    } else if (moreText instanceof Promise) {
                        moreText.then((out) => {
                            if (typeof out === 'string') {
                                outText.push(out);
                            } else if (Array.isArray(out)) {
                                outText = outText.concat(out);
                            }
                            res();
                        });
                    }
                }
            }
        }).then(() => {
            // command execution successful
            // update global variables if required, then return
            new Promise((res, rej) => {
                if (currCmd.update) {
                    console.log('updating for ' + channelID);
                    updateVariables(channelID).then(() => {
                        res();
                    }).catch(() => {
                        rej();
                    });
                } else {
                    res();
                }
            }).then(() => {
                resolve(outText);
            });
        }).catch((err) => {
            throw err;
        });
    });
}

/**
 * Parses a command from a message into the command name and a list of arguments.
 *
 * @param msg The message that requested the command to be executed.
 * @param prefix The command prefix currently in use.
 * @returns {*} An object containing the command name and command arguments, to be passed to cmdExe, or false if no such
 * command exists.
 */
function cmdParse(msg, prefix) {
    const cmdString = msg.content,
        cmdText = cmdString.slice(prefix.length), // take out the prefix
        firstSpace = cmdText.indexOf(' ');

    let commandName,
        commandArgs;

    if (firstSpace !== -1) {
        commandName = cmdText.slice(0, firstSpace).toLowerCase();  // get the command name

        if (typeof cmdData[commandName] === 'undefined') {
            const aliasCommand = checkForAlias(commandName);
            if (aliasCommand) {
                commandName = aliasCommand;
            } else {
                msg.channel.send('**Undefined command name** "' + commandName + '"');
                return false;
            }
        }

        // parse out the command args
        commandArgs = cmdText.slice(firstSpace).match(/"(?:\\"|\\\\|[^"])*"|\S+/g)
            .map((elem) => {
                let out;
                // check if it's in quotes
                if (elem.charAt(0) === '"' && elem.charAt(elem.length - 1) === '"') {
                    out = elem.slice(1, elem.length - 1);
                } else {
                    out = elem;
                }
                // convert to number if numerical
                return isNaN(out) ? out : +out;
            });

        // if too many args have been received:
        let paramsCount = Object.keys(cmdData[commandName].params).length;

        if (commandArgs.length > paramsCount) {
            // too many args received, so condense the remainder into one argument
            const remainingArgs = commandArgs.slice(paramsCount - 1, commandArgs.length);

            commandArgs = commandArgs.slice(0, paramsCount - 1);
            commandArgs.push(remainingArgs.join(' '));
        }
    } else {
        commandName = cmdText.toLowerCase();
        commandArgs = [];

        if (typeof cmdData[commandName] === 'undefined') {
            const aliasCommand = checkForAlias(commandName);
            console.log(commandName, aliasCommand);
            if (aliasCommand) {
                commandName = aliasCommand;
            } else {
                msg.channel.send('**Undefined command name** "' + commandName + '"');
                return false;
            }
        }
    }

    return {
        'cmdName': commandName,
        'cmdArgs': commandArgs
    };
}