function traverse(ast, visitors, opts) {
    if (!ast) {
        return;
    }

    let nodesToProcess = [ast];

    while (nodesToProcess.length) {
        let node = nodesToProcess.shift();
        // console.log(`Processing node ${node.type}. ${nodesToProcess.length} nodes to go.`);

        if (node.constructor.name == "Node") {
            for (let prop in node) {
                if (["parentNode", "parentNodeProperty"].indexOf(prop) > -1) {
                    continue;
                }
                
                let val = node[prop];
                if (val && ["Node", "Array"].indexOf(val.constructor.name) > -1) {
                    switch (val.constructor.name) {
                        case "Node":
                            val.parentNode = node;
                            val.parentNodeProperty = prop;
                            nodesToProcess.push(val);
                            break;
                        case "Array":
                            for (let subNode of val) {
                                if (!subNode || !subNode.constructor) {
                                    continue;
                                }
                                if (subNode.constructor.name == "Node") {
                                    subNode.parentNode = node;
                                    subNode.parentNodeProperty = prop;
                                    nodesToProcess.push(subNode);
                                }
                            }
                            break;
                    }
                }
            }
            applyVisitors(visitors, node, opts);
        }
    }
}

function traverseInsideOut(node, visitors, opts) {
    if (!node) {
        return false;
    }

    let wasChanged = false;
    for (let prop in node) {
        if (["parentNode", "parentNodeProperty"].includes(prop)) {
            continue;
        }
        
        let val = node[prop];
        if (val && ["Node", "Array"].includes(val.constructor.name)) {
            switch (val.constructor.name) {
                case "Node":
                    val.parentNode = node;
                    val.parentNodeProperty = prop;
                    wasChanged |= traverseInsideOut(val, visitors, opts);
                    break;
                case "Array":
                    for (let subNode of val) {
                        if (!subNode || !subNode.constructor) {
                            continue;
                        }
                        if (subNode.constructor.name == "Node") {
                            subNode.parentNode = node;
                            subNode.parentNodeProperty = prop;
                            wasChanged |= traverseInsideOut(subNode, visitors, opts);
                        }
                    }
                    break;
            }
        }
    }
    wasChanged |= applyVisitors(visitors, node, opts);

    return wasChanged;
}

function applyVisitors(visitors, node, opts) {
    let wasChanged = false;
    if (node.constructor.name == "Node" && visitors) {
        if (visitors instanceof Function) {
            wasChanged |= visitors(node, opts);
        } else {
            for(visitor of visitors) {
                if (visitor instanceof Function) {
                    wasChanged |= visitor(node, opts);
                }
            }
        }
    }
    return wasChanged;
}

module.exports = traverseInsideOut;