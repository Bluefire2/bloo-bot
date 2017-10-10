const sql = require('sqlite');
const path = require('path');

const CVTableName = 'guildsCV';
const CVDBFilePath = path.join(__dirname, '..', 'data', 'CV.sqlite');
sql.open(CVDBFilePath.toString());

const allowedVariables = [
    'prefix'
];

module.exports = {
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
    }
};