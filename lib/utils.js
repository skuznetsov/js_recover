const fs = require('fs');
const t = require('babel-types');

function wrapSingleStatementIntoBlock(node, prop) {
    let tempNode = t.blockStatement([node[prop]]);
    tempNode.parentNode = node;
    tempNode.parentNodeProperty = prop;
    node[prop].parentNode = tempNode;
    node[prop].parentNodeProperty = "body";
    node[prop] = tempNode;
}

function createAllFoldersInPath(filePath) {
    let entries = filePath.split('/');
    let path = '';
    entries.forEach(function(element, idx) {
        if (element == "") {
            return;
        }
            
        if (idx >= entries.length - 1) {
            return;
        }
        path += (idx > 0 ? '/' : '') + element;
        try {
            fs.statSync(path);
        } catch(ex) {
            if (ex.code != 'ENOENT') {
                console.log(ex);
                throw ex;
            } else {
                fs.mkdirSync(path);
            }
        }            
    });
}

function replaceChildInParentNode(node, newNode, numElementsToReplace) {
    numElementsToReplace = numElementsToReplace || 1;
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return;
    }
    
    newNode.parentNode = parent;
    newNode.parentNodeProperty = parentProperty;
    if (parent[parentProperty].constructor.name == "Array") {
        // Replace Sequence statement with it's content nodes
        let pos = parent[parentProperty].indexOf(node);
        let params = [pos, numElementsToReplace].concat(newNode);
        let test = parent[parentProperty].splice.apply(parent[parentProperty], params);
    } else {
        parent[parentProperty] = newNode;
    }
}


module.exports = {
    wrapSingleStatementIntoBlock,
    createAllFoldersInPath,
    replaceChildInParentNode
}