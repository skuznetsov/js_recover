/* Recursive function to traverse AST.
It shouls accept AST, array of visitors and options.
it should traverse AST and call method applyVisitors for each node after it submerged to child nodes.
It should return status true if AST was changed during traversal otherwise false. */

const { property } = require('lodash');

function traverseUp(node, visitors, opts, wasChanged = false) {
    if (!node) {
        return wasChanged;
    }

    for (let prop in node) {
        if (!node.hasOwnProperty(prop) || ["parentNode", "parentNodeProperty"].includes(prop)) {
            continue;
        }
        
        let val = node[prop];
        if (val && typeof(val) == "object" && (["Node", "Array"].includes(val.constructor.name) || val.type)) {
            if (val.constructor.name == "Node" || val.type) {
                val.parentNode = node;
                val.parentNodeProperty = prop;
                wasChanged |= traverseUp(val, visitors, opts, wasChanged);
            } else if (val.constructor.name == "Array") {
                for (let subNode of val) {
                    if (!subNode || !subNode.constructor) {
                        continue;
                    }
                    if (subNode.constructor.name == "Node" || val.type) {
                        subNode.parentNode = node;
                        subNode.parentNodeProperty = prop;
                        wasChanged |= traverseUp(subNode, visitors, opts, wasChanged);
                    }
                }
            }
        }
    }
    wasChanged |= applyVisitors(visitors, node, opts, wasChanged);

    return !!wasChanged;
}



function traverseTopDown(node, visitors, opts) {
    let processingStack = [{node: node, parentStack: []}];
    let parentStack = [];
    let wasChanged = false;

    while (processingStack.length > 0) {
        let current = processingStack.pop();
        let currentNode = current.node;

        if (currentNode && typeof currentNode === 'object') {
            for (let prop in currentNode) {
                if (!currentNode.hasOwnProperty(prop)) {
                    continue;
                }

                let childNode = currentNode[prop];
                if (childNode && typeof(childNode) == "object" && (["Node", "Array"].includes(childNode.constructor.name) || childNode.type)) {
                    if (childNode.constructor.name == "Node" || childNode.type) {
                        processingStack.push({node: childNode, parentStack: [...current.parentStack, { propertyName: prop, node: currentNode, index: null}]});
                    } else if (childNode.constructor.name == "Array") {
                        let index = -1;
                        for (let subNode of childNode) {
                            index++;
                            if (!subNode || !subNode.constructor) {
                                continue;
                            }
                            if (subNode.constructor.name == "Node" || subNode.type) {
                                processingStack.push({node: subNode, parentStack: [...current.parentStack, { propertyName: prop, node: currentNode, index}]});
                            }
                        }
                    }
                }
            }

            wasChanged |= applyVisitors(visitors, currentNode, opts, current.parentStack, wasChanged);
        }
    }

    return !!wasChanged;
}

function applyVisitors(visitors, node, opts, stack, wasChanged) {
    if ((node.constructor.name == "Node" || node.type) && visitors) {
        if (visitors instanceof Function) {
            wasChanged |= visitors(node, opts, stack);
        } else {
            for(let idx in visitors) {
                let visitor = visitors[idx];
                if (visitor instanceof Function) {
                    wasChanged |= visitor(node, opts, stack);
                }
            }
        }
    }
    return !!wasChanged;
}

module.exports = {traverseBottomUp, traverseTopDown};


function traverseBottomUp(rootNode, visitors, options) {
    if (!rootNode || typeof rootNode !== 'object') {
        throw new TypeError('rootNode must be an object');
    }

    const processingStack = [{ node: rootNode, parentStack: [], visited: false }];
    const allChanges = [];
    let wasChanged = false;

    while (processingStack.length > 0) {
        const current = processingStack.pop();
        const { node: currentNode, parentStack, visited } = current;

        if (!currentNode || typeof currentNode !== 'object') continue;

        if (!visited) {
            // Push the node back onto the stack as visited
            processingStack.push({ node: currentNode, parentStack, visited: true });

            // Push children onto the stack
            for (const [prop, child] of Object.entries(currentNode)) {
                if (child && typeof child === 'object') {
                    if (child.constructor.name == 'Node' || child.type) {
                        processingStack.push({
                            node: child,
                            parentStack: [...parentStack, { propertyName: prop, node: currentNode, index: null }],
                            visited: false
                        });
                    } else if (Array.isArray(child)) {
                        child.forEach((subNode, index) => {
                            if (subNode && (subNode.constructor.name == 'Node' || subNode.type)) {
                                processingStack.push({
                                    node: subNode,
                                    parentStack: [...parentStack, { propertyName: prop, node: currentNode, index }],
                                    visited: false
                                });
                            }
                        });
                    }
                }
            }
        } else {
            // Post-order processing: children have been processed
            const changes = applyVisitors(visitors, currentNode, options, parentStack, wasChanged);
            // if (changes.length > 0) {
            //     allChanges.push(...changes);
            //     wasChanged = true;
            // }
        }
    }

    // Apply all collected changes
    // allChanges.forEach(change => {
    //     const { type, target, newNode, propertyName, index, parentNode } = change;
    //     switch (type) {
    //         case 'replace':
    //             if (typeof index === 'number') {
    //                 parentNode[propertyName][index] = newNode;
    //             } else {
    //                 parentNode[propertyName] = newNode;
    //             }
    //             break;
    //         case 'remove':
    //             if (typeof index === 'number') {
    //                 parentNode[propertyName].splice(index, 1);
    //             } else {
    //                 delete parentNode[propertyName];
    //             }
    //             break;
    //         case 'add':
    //             if (typeof index === 'number') {
    //                 parentNode[propertyName].splice(index, 0, newNode);
    //             } else {
    //                 parentNode[propertyName] = newNode;
    //             }
    //             break;
    //         // Handle other change types as needed
    //         default:
    //             throw new Error(`Unknown change type: ${type}`);
    //     }
    // });

    return wasChanged;
}

// function applyVisitors(visitors, node, options, stack) {
//     const changes = [];

//     if ((node.constructor.name == 'Node' || node.type) && visitors) {
//         if (typeof visitors === 'function') {
//             const change = visitors(node, options, stack);
//             if (change) changes.push(change);
//         } else if (Array.isArray(visitors)) {
//             for (const visitor of visitors) {
//                 if (typeof visitor === 'function') {
//                     const change = visitor(node, options, stack);
//                     if (change) changes.push(change);
//                 }
//             }
//         }
//     }

//     return changes;
// }
