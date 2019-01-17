const Discord = require('discord.js');
const client = new Discord.Client();

const util = require('./util');
const cmd = require('./commands');
const scv = require('./modules/scv');
const defaults = require('./modules/defaults');

const config = require('./config.json');
const cmdData = require('./data/commands.json');

// If the command line argument 'test' is given, log in to the test account
const test = process.argv[2] === 'test',
    loginToken = test ? config.test_token : config.token;


// Global variables
let variablesLoaded = {},
    allPrefixes = {},
    allCustomAliases = {};

/**
 * A function to deal with retrieving channel variables. If the variable is undefined, this function returns its
 * default value.
 *
 * @param channelID The current channel ID.
 * @param variable The name of the channel variable to be fetched.
 * @returns {Promise} A promise that resolves with the value to be assigned to this variable in the current context.
 */
const getVariableWithFallback = async (channelID, variable) => {
    let val = await scv.get(channelID, variable);
    if (val) {
        return val;
    } else {
        return defaults.get(variable);
    }
};

/**
 * Updates all channel variables.
 * TODO: fix this so it doesn't just update prefix but can iterate over a list of variables to update. Maybe use Promise.all?
 *
 * @param channelID The current channel ID.
 * @returns {Promise} A promise that resolves when the variables have been updated.
 */
const updateVariables = async (channelID) => {
    let val = await getVariableWithFallback(channelID, 'prefix');
    allPrefixes[channelID + ''] = val;
};

/**
 * Checks if the string is an alias for some command. This checks the default aliases in commands.json, and the custom
 * channel aliases from SCV.
 * TODO: make this return a special string in case of no applicable command being found, for consistency
 *
 * @param channelID The current channel ID.
 * @param keyword The string to be cross-checked.
 * @returns {*} The relevant command name if the string is an alias for some command, or false if not.
 */
const checkForAlias = (channelID, keyword) => {
    const cmdNames = Object.keys(cmdData);

    let aliasFound = false,
        out = '';

    // first, check the default aliases
    for (let i in cmdNames) {
        let cmdName = cmdNames[i],
            cmdObj = cmdData[cmdName],
            aliases = cmdObj.aliases;
        if (Array.isArray(aliases)) {
            if (aliases.indexOf(keyword) !== -1) {
                aliasFound = true;
                out = cmdName;
            }
        }
    }

    if(!aliasFound) {
        // haven't found any matching default aliases, so now check SCV
        const customAliases = allCustomAliases[channelID];

        if(typeof customAliases === 'undefined') {
            scv.get(channelID, 'aliases').then(val => {
                if(!val) {
                    // no aliases defined for this channel
                    allCustomAliases[channelID] = {};
                } else {
                    // aliases are defined, we just haven't fetched them yet
                    // TODO: implement fetching using the Datum class
                }
            });
        }
    }

    if (!aliasFound) {
        return false;
    } else {
        return out;
    }
};

client.once('ready', () => {
    console.log('Bot is online!');
    console.log(`Ready: serving ${client.guilds.size} guilds, in ${client.channels.size} channels, for ${client.users.size} users.`);
});

/*
 * This triggers on every message. Use this to listen to commands and master commands.
 */
client.on('message', async msg => {
    const channelID = msg.channel.id;
    //scv.listTable();
    // scv.get(channelID, 'aliases').then(val => {
    //     //console.log(val);
    // });

    // Update all variables if this is the first command for this channel since starting up
    if (!variablesLoaded[channelID]) {
        await updateVariables(channelID);
        variablesLoaded[channelID] = true;
    }

    // once we've updated our variables (if we need to), try to parse a command
    // TODO: find some way to update this after setprefix
    let prefix = allPrefixes[channelID + ''];

    if (typeof prefix === 'undefined') {
        let p = defaults.get('prefix');
        allPrefixes[channelID + ''] = p;
        prefix = p;
    }

    switch (msg.content) {
        // Master commands. These commands do not depend on the prefix
        case 'bloobotprefix':
            // Master command that lists the prefix. This command must be independent of
            // the current prefix and therefore cannot be handled by regular command logic.
            msg.channel.send(`**Command prefix currently in use**: ${prefix}`);
            break;

        case 'resetprefix':
            // Master command that resets the prefix to ~.

            // admins only (and me)
            if (util.sentByAdminOrMe(msg)) {
                const sendingFunction = (text) => msg.channel.send.call(msg.channel, text);
                cmd.setPrefix(client, msg, sendingFunction, '~').then(() => {
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
                    try {
                        let out = await cmdExe(msg, parsedCmd.cmdName, parsedCmd.cmdArgs, prefix);
                        output = out;
                        console.log(parsedCmd); // same as above

                        // if we need to output something that was returned from the command, then do so
                        if (output.length !== 0) {
                            // send the message
                            if (!util.safeSendMsg(msg.channel, output.join('\n'), '```')) {
                                msg.channel.send(`Outbound message length greater than ${util.MY_CHAR_LIMIT} character limit.`);
                            }
                        }
                    } catch(err) {
                        // an error was thrown by cmdExe (most likely a permissions error)
                        console.log(err);
                        console.log(err.stack);
                        util.sendErrorMessage(msg.channel, err);
                    };
                } else {
                    // do nothing? idk
                }
            }
            break;
    }
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
 * @async
 * @param msg The message that requested the command to be executed.
 * @param cmdName The name of the command specified.
 * @param args The arguments given to the command.
 * @param prefix The command prefix currently in use.
 * @returns {Promise} A promise that resolves with an array of the text to be messaged inside ``, if any, line by line.
 */
async function cmdExe(msg, cmdName, args, prefix) {
    const currCmd = cmdData[cmdName],
        // note: paramsCount DOES include default parameters!!!
        paramsCount = typeof currCmd.params === 'undefined' ? 0 : Object.keys(currCmd.params).length,
        defaultsCount = typeof currCmd.defaults === 'undefined' ? 0 : currCmd.defaults,
        argsCount = args.length,
        channelID = msg.channel.id;

    let outText = [];
    console.log(args);
    if (args.length === 0 && paramsCount !== 0) {
        return outText = cmd.descString(prefix, cmdName);
    } else {
        // Check for a permissions error, and if positive reject the promise:
        if (currCmd.permissions === 'admin' && !util.sentByAdminOrMe(msg)) { // check for privileges if the command requires them
            throw new Error(`The command "${cmdName}" requires administrator privileges.`);
        } else if (currCmd.permissions === 'me' && !util.sentByMe(msg)) { // check for privileges if the command requires them
            throw new Error(`The command "${cmdName}" can only be run by the bot admin.`);
        } else if (args.length < paramsCount - defaultsCount) { // check if the number of args is correct
            throw new Error(`The command "${cmdName}" requires at least ${paramsCount - defaultsCount} arguments; received ${args.length}.`);
        } else {
            const func = cmd[currCmd.fn],
                fnParams = currCmd.params,
                fullArgs = args.slice(0),
                sendingFunction = (text) => msg.channel.send.call(msg.channel, text);
            // for some reason this is necessary, instead of just msg.channel.send :(

            // type checking:
            let typeMismatch = false,
                typeMismatchDesc = {}; // initialising so WebStorm doesn't complain

            if (typeof fnParams !== 'undefined') {
                let i = 0, // TODO: this seems to work, but just in case, rewrite the API to not rely on key ordering
                    paramNames = Object.keys(fnParams);

                // using every instead of forEach lets me break out of the loop when a mismatch is detected
                paramNames.every(key => {
                    if (i === argsCount) {
                        // If a default argument has not been provided, we don't need to util.TypeCheck. That means,
                        // we need to break out of the loop as soon as we have processed all provided arguments.
                        return false;
                    }
                    const value = fnParams[key].type,
                        typesArray = Array.isArray(value) ? value : [value],
                        argument = fullArgs[i++],
                        t = typesArray.filter(elem => util.TypeCheck[elem](argument));

                    // There is a type mismatch if and only if the argument input does not match any of the
                    // types specified for it. In this case, the filter above will trim all elements from the
                    // array, and return [].
                    typeMismatch = t.length === 0;

                    if (typeMismatch) {
                        typeMismatchDesc = {
                            argument: argument,
                            parameter: key,
                            expected: typesArray
                        };
                        return false;
                    } else {
                        return true;
                    }
                });
            }

            if (!typeMismatch) {
                // input passed type checking
                fullArgs.unshift(sendingFunction);
                fullArgs.unshift(msg);
                fullArgs.unshift(client);

                // call the command function:
                const moreText = func.apply(this, fullArgs);

                // process result
                if (typeof moreText === 'string') {
                    outText.push(moreText);
                } else if (Array.isArray(moreText)) {
                    outText = outText.concat(moreText);
                } else if (moreText instanceof Promise) {
                    let out = await moreText;
                    if (typeof out === 'string') {
                        outText.push(out);
                    } else if (Array.isArray(out)) {
                        outText = outText.concat(out);
                    }
                }
            } else {
                // input failed type checking, handle the error
                const p = typeMismatchDesc.parameter,
                    a = typeMismatchDesc.argument,
                    expected = typeMismatchDesc.expected,
                    t = Array.isArray(expected) ? expected.join(', ') : expected;
                msg.channel.send(`Invalid input "${a}" for parameter **${p}** (${t} expected).`);
            }
        }

        return outText;
    }
    
    // no errors thrown
    // command execution successful
    // update global variables if required, then return
    if (currCmd.update) {
        console.log('updating for ' + channelID);
        await updateVariables(channelID);
    }
    return outText;
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
            const aliasCommand = checkForAlias(msg.channel.id, commandName);
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
            const aliasCommand = checkForAlias(msg.channel.id, commandName);
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