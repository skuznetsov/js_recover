"use strict";

const _ = require("lodash");

module.exports = {
    traverse: function traverse(node, visitor) {
        if (!node) {
            return;
        }

        if (node.constructor.name == "Node" && visitor) {
            visitor(node);
        }

        if (node.constructor.name == "Array") {
            _.each(node, val => {
                traverse(val, visitor);
            });

        } else {
            for (let prop in node) {
                let val = node[prop];
                if (val && ["Node", "Array"].indexOf(val.constructor.name) > -1) {
                    traverse(val, visitor);
                }
            }
        }
    }
};