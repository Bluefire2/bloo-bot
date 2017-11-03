/*
 * A module to deal with storing and retrieving guild variables. This module handles
 * getting and setting all the variables, as well as creating/removing/listing/truncating
 * the main storage table. I'll probably change this code a lot as I start storing more
 * and more data, but the interface will remain the same. The idea is to blackbox this
 * part of the code and not worry about it in my other modules.
 */
const sql = require('sqlite');
const path = require('path');
const Promise = require("bluebird");

const CVTableName = 'guildsCV';
const CVDBFilePath = path.join(__dirname, '..', 'data', 'CV.sqlite');

// TODO: be smarter about opening the db, since it's async. Maybe open it every time get/set is called?
sql.open(CVDBFilePath.toString());

const allowedVariables = [
    'prefix'
];

const scvFunctions = {
    create: () => {
        sql.run(`CREATE TABLE ${CVTableName} (id bigint, prefix varchar(255))`);
    },
    drop: () => {
        sql.run(`DROP TABLE ${CVTableName}`);
    },
    add: (variable, datatype) => {
        sql.run(`ALTER TABLE ${CVTableName} ADD ${variable} ${datatype}`);
    },
    listTable: () => {
        sql.all(`SELECT * FROM ${CVTableName}`).then((rows) => {
            rows.forEach((row) => {
                console.log(row);
            });
        });
    },
    truncate: () => {
        sql.run(`DROP TABLE ${CVTableName}`).then(() => {
            module.exports.create();
        });
    },
    set: (channelID, variable, value) => {
        return new Promise((resolve, reject) => {
            if (allowedVariables.includes(variable)) {
                sql.get(`SELECT * FROM ${CVTableName} WHERE id = "${channelID}"`).then(row => {
                    if (!row) {
                        // if the guild has no entry in the db, create one
                        sql.run(`INSERT INTO ${CVTableName} (id) VALUES (?)`, channelID).then(() => {
                            return sql.run(`UPDATE ${CVTableName} SET ${variable} = ?, WHERE id = "${channelID}"`, value);
                        }).then(() => {
                            resolve(value);
                        });
                    } else {
                        sql.run(`UPDATE ${CVTableName} SET ${variable} = ? WHERE id = "${channelID}"`, value).then(() => {
                            resolve(value);
                        }).catch(err => {
                            console.log(err);
                            reject(err);
                        });
                    }
                }).catch(err => {
                    console.log(err);
                    reject(err);
                });
            } else {
                // do nothing
                reject("No such variable");
            }
        });
    },
    get: (channelID, variable) => {
        return new Promise((resolve, reject) => {
            if (allowedVariables.includes(variable)) {
                sql.get(`SELECT * FROM ${CVTableName} WHERE id = "${channelID}"`).then(row => {
                    if (!row) {
                        // if the guild has no entry in the db, create one
                        sql.run(`INSERT INTO ${CVTableName} (id) VALUES (?)`, channelID);
                        resolve(false);
                    } else {
                        resolve(row[variable] === null ? false : row[variable]);
                    }
                }).catch(err => {
                    console.log(err);
                    reject(err);
                });
            } else {
                resolve(false);
            }
        });
    },
    getMultiple: (channelID, variables) => {
        return new Promise((resolve, reject) => {
            let getPromises = variables.map((elem) => {
                return scvFunctions.get(channelID, elem);
            });

            Promise.all(getPromises).then((values) => {
                let varValues = {};

                values.forEach((varValue) => {
                    let varName = variables[i];
                    varValues[varName] = varValue;
                });

                resolve(varValues);
            }).catch((err) => {
                reject(err);
            });
        });
    }
};

module.exports = scvFunctions;