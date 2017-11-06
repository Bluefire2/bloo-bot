module.exports.objectIsEmpty = obj => {
    // https://stackoverflow.com/a/32108184/1175276
    return Object.keys(obj).length === 0 && obj.constructor === Object;
};