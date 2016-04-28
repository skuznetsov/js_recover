"use strict";

const _ = require("lodash");

module.exports = {
    traverse: function traverse(node, visitors, opts) {
        if (!node) {
            return;
        }

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

        if (node.constructor.name == "Array") {
            _.each(node, val => {
                traverse(val, visitors, opts);
            });

        } else {
            for (let prop in node) {
                let val = node[prop];
                if (val && ["Node", "Array"].indexOf(val.constructor.name) > -1) {
                    traverse(val, visitors, opts);
                }
            }
        }
    }
};