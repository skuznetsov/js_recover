function removeLocationInformation(node) {
    if (!node) {
        return false;
    }

    let wasChanged = false;
    for (let prop in node) {
        if (["loc", "start", "end"].includes(prop)) {
            delete node[prop];
            wasChanged = true;
            continue;
        }
    }
    return wasChanged;
}

module.exports = removeLocationInformation;