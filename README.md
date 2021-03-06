# BlooBot
A Discord bot with a bunch of random commands. Initially made for a RuneScape server but has many other features.

## How to use this bot
Click [this link](http://bit.ly/2yJBLPj) to go to the invite menu. Then select the server you want to invite the bot to, and click "Authorize". You must be the owner of the server in order to invite this bot (or any other bot).

To use a command, type "\<prefix\>command-name argument1 argument2 etc". The default prefix is the tilde "~"; this can be changed using the setprefix command. To get help with a command and its usage, just type "\<prefix\>command-name". For a list of all commands, type "\<prefix\>help".

## How to contribute
If you want to contribute, you can either add new commands, which I've made quite easy, or change the actual core code itself.

### Adding new commands
I designed this bot so that adding new commands would be easy even for an inexperienced programmer. To add a new command, you must do two things.

First, create the function that implements the command, and put it into the big export object in `commands.js`:

```
...
functionName: (client, msg, sendMsg, parameter1, parameter2, et cetera) => {
    // implement the command
    // you don't have to return a value, but if you do it must be either a string, an array of strings, or a promise
    // if it is a string, the bot will message it inside ``` ```
    // if it is an array of strings the bot will message them all inside ``` ``` line by line
    // if it is a promise, the bot will do the above ^^^ to the resolved value of the promise once it resolves
    // client will always be the first parameter, and it represents the Discord client (from Discord.js)
    // msg will always be the second parameter and it contains the message that requested the command; to send a message use msg.channel.send
    // sendMsg will always be the third parameter and it contains the function that sends messages to the channel
    // more parameters will be passed if you need them, as specified in the next step
},
...
```

Then, create the command doc in `data\commands.json`, like so:

```
...
"commandName": {
  "desc": "A quick description of the command",
  "params": {
    "parameter1": {
        "desc": "Quick description of this parameter",
        "type": "The type of the parameter: int, number, string or all",
        "default": "If the parameter has a default value, put it here"
    },
    "parameter2": {
        "desc": "etc etc"...
    ...
  },
  "fn": "The name of the function in commands.js that implements the command (functionName)",
  <optional>
  "aliases": ["alias1", "alias2"] <-- aliases for the command,
  "defaults": A number; if the command has any default parameters, specify how many here, defaults to 0,
  "update": "true" if the command changes a server variable, defaults to false,
  "permissions": "admin" if the user needs to have admin privileges in the server to execute the command, defaults to false
},
...
```

There are four parameter types currently defined. `int` means an integer (a whole number), `number` means any number, such as `5` or `7.32`. `string` means a string, and `all` means any type. You *must* make the command doc otherwise the command *will not work*. If you do both of these steps correctly, calling the command is as simple as "\<prefix\>command-name argument1 argument2 etc". Bear in mind that command names are **case insensitive**!

### Contributing to the core code
Feel free to do this if you're experienced with Node.js. I'll gladly look at any pull requests.
