function removeLocationInformation(node) {
    if (!node) {
        return false;
    }

    delete node.loc;
    delete node.start;
    delete node.end;
    return true;
}

module.exports = removeLocationInformation;