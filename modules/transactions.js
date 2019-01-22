const path = require('path');
const Sequelize = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '..', 'data', 'CV.sqlite'),
    operatorsAliases: false
});

const Alias = sequelize.define('alias', {
    channel: Sequelize.BIGINT,
    command: Sequelize.STRING,
    alias: Sequelize.STRING
});

// https://stackoverflow.com/a/41433894
async function updateOrCreate (model, where, newItem) {
    // First try to find the record
    let foundItem = await model.findOne({where});
    if (!foundItem) {
        // Item not found, create a new one
        let item = await model.create(newItem);
        return {item, created: true};
    }
    // Found an item, update it
    let item = await model.update(newItem, {where});
    return {item, created: false};
}

module.exports.aliasesForCommand = async (channel, command) => {
    let data = await Alias.findAll({where: {channel, command}});
    if (data) {
        return data.map(({dataValues: {alias}}) => alias);
    } else {
        return [];
    }
};

module.exports.commandForAlias = async (channel, alias) => {
    let data = await Alias.findOne({where: {channel, alias}});
    if (data) {
        return data.dataValues;
    } else {
        return null;
    }
}

module.exports.addAliasForCommand = async (channel, command, alias) => {
    await sequelize.sync();
    // an alias can only be mapped to one command per channel
    return await updateOrCreate(Alias, {channel, alias}, {channel, alias, command}); 
};