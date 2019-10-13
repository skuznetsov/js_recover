function traverse(ast, visitors, opts) {
    if (!ast) {
        return;
    }

    let wasChanged = false;
    let nodesToProcess = [ast];

    while (nodesToProcess.length) {
        let node = nodesToProcess.shift();
        // console.log(`Processing node ${node.type}. ${nodesToProcess.length} nodes to go.`);

        if (node && typeof(node) == "object" && (["Node", "Array"].includes(node.constructor.name) || ("type" in node && node.type))) {
            for (let prop in node) {
                if (["parentNode", "parentNodeProperty"].indexOf(prop) > -1) {
                    continue;
                }
                
                let val = node[prop];
                if (val && typeof(val) == "object" && (["Node", "Array"].includes(val.constructor.name) || ("type" in val && val.type))) {
                    if (val.constructor.name == "Node" || val.type) {
                        val.parentNode = node;
                        val.parentNodeProperty = prop;
                        nodesToProcess.push(val);
                    } else if (val.constructor.name == "Array") {
                        for (let subNode of val) {
                            if (!subNode || !subNode.constructor) {
                                continue;
                            }
                            if (subNode.constructor.name == "Node" || val.type) {
                                subNode.parentNode = node;
                                subNode.parentNodeProperty = prop;
                                nodesToProcess.push(subNode);
                            }
                        }
                    }
                }
            }
            wasChanged |= applyVisitors(visitors, node, opts);
        }
    }
    return wasChanged;
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
        if (val && typeof(val) == "object" && (["Node", "Array"].includes(val.constructor.name) || ("type" in val && val.type))) {
            if (val.constructor.name == "Node" || val.type) {
                val.parentNode = node;
                val.parentNodeProperty = prop;
                wasChanged |= traverseInsideOut(val, visitors, opts);
            } else if (val.constructor.name == "Array") {
                for (let subNode of val) {
                    if (!subNode || !subNode.constructor) {
                        continue;
                    }
                    if (subNode.constructor.name == "Node" || val.type) {
                        subNode.parentNode = node;
                        subNode.parentNodeProperty = prop;
                        wasChanged |= traverseInsideOut(subNode, visitors, opts);
                    }
                }
            }
        }
    }
    wasChanged |= applyVisitors(visitors, node, opts);

    return wasChanged;
}

function applyVisitors(visitors, node, opts) {
    let wasChanged = 0;
    if (node.constructor.name == "Node" && visitors) {
        if (visitors instanceof Function) {
            wasChanged |= (visitors(node, opts) ? 1 : 0);
        } else {
            for(let idx in visitors) {
                let visitor = visitors[idx];
                if (visitor instanceof Function) {
                    wasChanged |= (visitor(node, opts) ? 1 : 0);
                }
            }
        }
    }
    return wasChanged;
}

module.exports = traverse;