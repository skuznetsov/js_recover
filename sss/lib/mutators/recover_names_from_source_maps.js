function recoverNamesFromSourceMaps(node, opts, parentStack) {
    let parent = parentStack.last()?.node;
    let smc = opts.sourceMapConsumer;  
    if (smc) {
        let origLoc = smc.originalPositionFor({line: node.loc.start.line, column: node.loc.start.column});
        if (origLoc && origLoc.name) {
            node.name = origLoc.name;
            return true;
        }
    }
    return false;
}

module.exports = recoverNamesFromSourceMaps;