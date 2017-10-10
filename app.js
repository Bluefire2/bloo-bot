const Discord = require('discord.js');
const client = new Discord.Client();

const cmd = require('./commands.js');
const scv = require('./modules/scv');
const defaults = require('./modules/defaults');

const config = require('./config.json');
const cmdData = require('./data/commands.json');

const test = process.argv[2] === 'test';
const loginToken = test ? config.test_token : config.token;

const setVariableWithFallback = (channelID, variable) => {
    // I FUCKING HATE THIS ASYNC HYPE GARBAGE
    // WHY THE FUCK DOES EVERYTHING IN THIS LANGUAGE HAVE TO BE ASYNC
    // THE SIMPLEST FUCKING THINGS ABSOLUTELY MUST BE ASYNC
    // BECAUSE IF THEY'RE NOT THEN IT WOULD ACTUALLY BE CONVENIENT AND WE CAN'T HAVE THAT CAN WE
    // AND NOW I NEED 10 LAYERS OF PROMISES FOR EVERYTHING I FUCKING DO TO DEAL WITH ASYNC RACE CONDITIONS
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

const updateVariables = (channelID) => {
    return new Promise((resolve, reject) => {
        setVariableWithFallback(channelID, 'prefix').then(val => {
            prefix = val;
            resolve();
        }).catch(err => {
            reject(err);
        });
    });
};


// Global variables
let variablesLoaded = false,
    prefix;

client.on('ready', () => {
    console.log('Hello world!');
    // scv.drop();
    // scv.create();
    // scv.listTable();
});

client.on('message', (msg) => {
    const channelID = msg.channel.id;
    const varRequest = new Promise((resolve, reject) => {
        if (!variablesLoaded) {
            updateVariables(channelID).then(() => {
                resolve();
                variablesLoaded = true;
            });
        } else {
            resolve();
        }
    });

    varRequest.then(() => {
        switch (msg.content) {
            case 'bloobotprefix':
                // Master command that lists the prefix. This command must be independent of
                // the current prefix and therefore cannot be handled by regular command logic.
                msg.channel.send(`**Command prefix currently in use**: ${prefix}`);
                break;

            case 'resetprefix':
                // Master command that resets the prefix to ~.

                // admins only (and me)
                if (msg.member.hasPermission('ADMINISTRATOR') || msg.member.id === config.admin_snowflake) {
                    cmd.cmd.setPrefix(msg, '~').then(() => {
                        return updateVariables();
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
                    console.log(msg.content);
                    let parsedCmd = cmdParse(msg, prefix), // parse out the command and args
                        output;
                    if (parsedCmd) {
                        cmdExe(msg, parsedCmd.cmdName, parsedCmd.cmdArgs, prefix).then((out) => {
                            output = out;
                            console.log(parsedCmd);
                            let outText = '';

                            for (let i in output) {
                                outText += output[i];
                                if (i < output.length - 1) outText += '\n';
                            }

                            if (outText !== '') {
                                msg.channel.send('```\n' + outText + '```');
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
 * Executes a command using the function reference found in the command documentation file.
 *
 * @param msg The message that requested the command to be executed.
 * @param cmdName The name of the command specified.
 * @param args The arguments given to the command.
 * @param prefix The command prefix currently in use.
 * @returns {Array} The text to be messaged inside ``, if any, line by line.
 */
function cmdExe(msg, cmdName, args, prefix) {
    let currCmd = cmdData[cmdName],
        outText = [],
        paramsCount = Object.keys(currCmd.params).length;

    return new Promise((resolve, reject) => {
        new Promise((res, rej) => {
            if (args.length === 0 && paramsCount !== 0) {
                // output the command docstring
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
                    aliasesStr = 'Alias(es): ';

                    aliases.forEach((elem, index) => {
                        aliasesStr += elem;
                        if (index < aliases.length - 1) {
                            // if not the last element, add a comma for the next one
                            aliasesStr += ', ';
                        }
                    });
                    outText.push('\n' + aliasesStr);
                }
                res();
            } else {
                if (currCmd.admin && !msg.member.hasPermission('ADMINISTRATOR') && msg.member.id !== config.admin_snowflake) {
                    outText = ['The command ' + cmdName + ' requires administrator privileges.'];
                    res();
                } else {
                    func = cmd.cmd[currCmd.fn];

                    let fullArgs = args.slice(0);
                    fullArgs.unshift(msg);

                    // call the command function:
                    moreText = func.apply(this, fullArgs);

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
                    updateVariables(msg.channel.id).then(() => {
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
    let cmdString = msg.content,
        cmdText = cmdString.slice(prefix.length), // take out the prefix
        firstSpace = cmdText.indexOf(' '),
        commandName,
        commandArgs;

    if (firstSpace !== -1) {
        commandName = cmdText.slice(0, firstSpace);  // get the command name

        if (typeof cmdData[commandName] === 'undefined') {
            let aliasCommand = checkForAlias(commandName);
            if (aliasCommand) {
                commandName = aliasCommand;
            } else {
                msg.channel.send('**Undefined command name** "' + commandName + '"');
                return false;
            }
        }

        commandArgs = cmdText.slice(firstSpace).match(/"(?:\\"|\\\\|[^"])*"|\S+/g)
            .map((elem) => {
                if (elem.charAt(0) === '"' && elem.charAt(elem.length - 1) === '"') {
                    return elem.slice(1, elem.length - 1);
                } else {
                    return elem;
                }
            })
            .map((elem) => {
                return isNaN(elem) ? elem : +elem; // convert to number if numerical
            }); // get the args

        // if too many args have been received:
        let paramsCount = Object.keys(cmdData[commandName].params).length;

        if (commandArgs.length > paramsCount) {
            // too many args received, so condense the remainder into one argument
            let remainingArgs = commandArgs.slice(paramsCount - 1, commandArgs.length);

            commandArgs = commandArgs.slice(0, paramsCount - 1);
            commandArgs.push(remainingArgs.join(' '));
        }
    } else {
        commandName = cmdText;
        commandArgs = [];

        if (typeof cmdData[commandName] === 'undefined') {
            let aliasCommand = checkForAlias(commandName);
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

function checkForAlias(alias) {
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
}
