function removeParentNodes(node) {
    if (!node) {
        return false;
    }

    for (let prop in node) {
        if (["parentNode", "parentNodeProperty"].includes(prop)) {
            delete node[prop];
            continue;
        }
    }
    return false;
}

module.exports = removeParentNodes;