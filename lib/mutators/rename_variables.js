const t = require('@babel/types');
const Utils = require('../utils.js');

function renameVariables(node) {
    if (!node || !node._state_id) {
        return false;
    }

    // ,"AssignmentPattern"
    if (["AssignmentExpression"].includes(node.type) && node.operator == "=") {
        try {
            let varName = Utils.extractVariableName(node.left);
            let newValName = ["MemberExpression", "Identifier"].includes(node.right.type) ? Utils.extractVariableName(node.right) : null;
            if (!newValName || !varName) {
                return false;
            }
            
            console.log(`Renaming variable ${varName}.`);

        } catch (ex) {
            console.log(ex);
        }
    }
    return false;
}

module.exports = renameVariables;