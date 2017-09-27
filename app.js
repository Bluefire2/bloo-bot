const Discord = require('discord.js');
const client = new Discord.Client();
const config = require('./config.json');
const cmdData = require('./commands.json');
const cmd = require('./commands.js');

const prefix = '~';

client.on('ready', () => {
  console.log('Hello world!');
});

client.on('message', (msg) => {
  if(msg.author === client.user || !msg.content.startsWith(prefix)) {
    // make sure the bot doesn't respond to its own messages
    return;
  } else {
    console.log(msg.content);
    var parsedCmd = cmdParse(msg.content), // parse out the command and args
      output = cmdExe(msg, parsedCmd.cmdName, parsedCmd.cmdArgs);

    console.log(parsedCmd);
    var outText = '';

    for(var i in output) {
      outText += output[i];
      if(i < output.length - 1) outText += '\n';
    }

    if(outText !== '') {
      msg.channel.send('```\n' + outText + '```');
    }
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

client.login(config.token);

function cmdExe(msg, cmdName, args) {
  var currCmd = cmdData[cmdName],
    outText = [],
    paramsCount = Object.keys(currCmd.params).length;

  if(typeof currCmd === 'undefined') {
    msg.channel.send('**Undefined command name** "' + cmdName + '"');
    return;
  }
  if(args.length === 0 && paramsCount !== 0) {
    // output the command docstring
    var cmdParams = currCmd.params,
      usageStr = cmdName + " <" + Object.keys(cmdParams).join("> <") + ">";

    outText.push(usageStr);
    outText.push(currCmd.desc + '\n');

    for (var paramName in cmdParams) {
      var paramDesc = cmdParams[paramName];
      outText.push(paramName + ": " + paramDesc);
    }
  } else {
    func = cmd.cmd[currCmd.fn];

    var fullArgs;

    fullArgs = args.slice(0);
    fullArgs.unshift(msg);

    moreText = func.apply(this, fullArgs);
    if(typeof moreText === 'string') {
      outText.push(moreText);
    } else if(Array.isArray(moreText)) {
      outText = outText.concat(moreText);
    }
  }
  return outText;
}

function cmdParse(cmdString) {
  var cmdText = cmdString.slice(prefix.length), // take out the prefix
    firstSpace = cmdText.indexOf(' '),
    commandName,
    commandArgs;

    if(firstSpace != -1) {
      commandName = cmdText.slice(0, firstSpace);  // get the command name
      commandArgs = cmdText.slice(firstSpace).match(/"(?:\\"|\\\\|[^"])*"|\S+/g)
        .map((elem) => {
          if(elem.charAt(0) === '"' && elem.charAt(elem.length - 1) === '"') {
            return elem.slice(1, elem.length - 1);
          } else {
            return elem;
          }
        })
        .map((elem) => {
          return isNaN(elem) ? elem : +elem; // convert to number if numerical
        }); // get the args

        // if too many args have been received:
        var paramsCount = Object.keys(cmdData[commandName].params).length;

        if(commandArgs.length > paramsCount) {
          // too many args received, so condense the remainder into one argument
          var remainingArgs = commandArgs.slice(paramsCount - 1, commandArgs.length);

          commandArgs = commandArgs.slice(0, paramsCount - 1);
          commandArgs.push(remainingArgs.join(' '));
        }
    } else {
      commandName = cmdText;
      commandArgs = [];
    }

  return {
    'cmdName': commandName,
    'cmdArgs': commandArgs
  };
}
