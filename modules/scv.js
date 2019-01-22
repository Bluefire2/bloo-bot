/*
 * A module to deal with storing and retrieving guild variables. This module handles
 * getting and setting all the variables, as well as creating/removing/listing/truncating
 * the main storage table. I'll probably change this code a lot as I start storing more
 * and more data, but the interface will remain the same. The idea is to blackbox this
 * part of the code and not worry about it in my other modules.
 */

// TODO: tbh this is complete garbage, just rewrite this completely, maybe use MongoDB or something
const sql = require('sqlite');
const path = require('path');

const CVTableName = 'guildsCV';
const CVDBFilePath = path.join(__dirname, '..', 'data', 'CV.sqlite');

const allowedVariables = [
    'prefix',
    'aliases'
];

sql.open(CVDBFilePath.toString());

const scvFunctions = {
    create: () => {
        return sql.run(`CREATE TABLE ${CVTableName} (id bigint, prefix varchar(255), aliases varchar(1000))`);
    },
    drop: () => {
        return sql.run(`DROP TABLE ${CVTableName}`);
    },
    add: (variable, datatype) => {
        return sql.run(`ALTER TABLE ${CVTableName} ADD ${variable} ${datatype}`);
    },
    listTable: () => {
        return sql.all(`SELECT * FROM ${CVTableName}`).then((rows) => {
            rows.forEach((row) => {
                console.log(row);
            });
        });
    },
    truncate: () => {
        return sql.run(`DROP TABLE ${CVTableName}`).then(() => {
            module.exports.create();
        });
    },
    set: async (channelID, variable, value) => {
        if (allowedVariables.includes(variable)) {
            let row = await sql.get(`SELECT * FROM ${CVTableName} WHERE id = "${channelID}"`);
            if (!row) {
                // if the guild has no entry in the db, create one
                await sql.run(`INSERT INTO ${CVTableName} (id) VALUES (?)`, channelID);
                await sql.run(`UPDATE ${CVTableName} SET ${variable} = ? WHERE id = "${channelID}"`, value);
            } else {
                await sql.run(`UPDATE ${CVTableName} SET ${variable} = ? WHERE id = "${channelID}"`, value);
            }
            return value;
        } else {
            // do nothing
            throw new Error("No such variable");
        }
    },
    get: async (channelID, variable) => {
        if (allowedVariables.includes(variable)) {
            let row = await sql.get(`SELECT * FROM ${CVTableName} WHERE id = "${channelID}"`);
            if (!row) {
                // if the guild has no entry in the db, create one
                await sql.run(`INSERT INTO ${CVTableName} (id) VALUES (?)`, channelID);
                return false;
            } else {
                return row[variable] === null ? false : row[variable];
            }
        } else {
            return false;
        }
    },
    getMultiple: (channelID, variables) => {
        let getPromises = variables.map((elem) => {
            return scvFunctions.get(channelID, elem);
        });

        return Promise.all(getPromises).then((values) => {
            let varValues = {};

            values.forEach((varValue) => {
                let varName = variables[i];
                varValues[varName] = varValue;
            });

            return varValues;
        });
    }
};

module.exports = scvFunctions;