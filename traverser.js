"use strict";

const _ = require("lodash");

module.exports = {
    traverse: function traverse(ast, visitors, opts) {
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
                                _.each(val, subNode => {
                                    if (subNode.constructor.name == "Node") {
                                        subNode.parentNode = node;
                                        subNode.parentNodeProperty = prop;
                                        nodesToProcess.push(subNode);
                                    }
                                });
                                break;
                        }
                    }
                }
                applyVisitors(visitors, node, opts);
            }
        }
    }
};

function applyVisitors(visitors, node, opts) {
                if (node.constructor.name == "Node" && visitors) {
                if (visitors instanceof Function) {
                    visitors(node, opts);
                } else {
                    _.each(visitors, visitor => {
                        if (visitor instanceof Function) {
                            visitor(node, opts);
                        }
                    });
                }
            }
}