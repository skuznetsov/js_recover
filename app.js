#!/usr/bin/env node

"use strict";

if (!process.env.NODE_CONFIG_DIR) {
    process.env.NODE_CONFIG_DIR = __dirname + "/config";
}

const config = require('config');
const fs = require('fs');
const parser = require('babylon');
const _ = require('lodash');
const request = require('request');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const CodeGenerator = require('./jsgen').CodeGenerator;
const traverse = require("./traverser").traverse;
const t = require("babel-runtime/helpers/interop-require-wildcard").default(require("babel-types"));


if (typeof(config.verbose) === "undefined" ) {
    console.error(`ERROR: Cannot find config file at ${process.env.NODE_CONFIG_DIR}`);
    process.exit(1);
}


String.prototype.last = function() {
  return this[this.length-1];  
};

const processingFileName = fs.realpathSync(process.argv[2] || config.defaultFileToProcess);
const code = fs.readFileSync(processingFileName, "utf8");
console.log(`Processing ${processingFileName}...`);

let mapUrl = (code.match(/^\/\/#\s*sourceMappingURL=(.+)$/gim)||[""])[0].replace(/^\/\/#\s*sourceMappingURL=/, '');

new Promise((resolve, reject) => {
    if (config.sourceMaps.use && mapUrl) {
        try {
            request.get(mapUrl, function (err, response, body) {
                if (err)
                {
                    resolve(null);
                    return;
                }
                let mainPath = process.argc > 2 ? process.argv[3] : config.sourceMaps.defaultOutputFolder;
                mainPath = fs.realpathSync(mainPath);
                mainPath += (mainPath.last() == "/" ? "" : "/");
                createAllFoldersInPath(mainPath);

                let smc = new SourceMapConsumer(JSON.parse(body));
                if (config.sourceMaps.saveOriginals && smc.sources && smc.sources.length > 0) {
                    _.each(smc.sources, (src, idx) => {
                        let fileName = mainPath +
                            (mainPath.last() == '/'
                                || src[0] == '/' ? "" : "/")
                            + src;
                        createAllFoldersInPath(fileName);
                        fs.writeFileSync(fileName, smc.sourcesContent[idx], { flag: "w" });
                    });
                }
                resolve(smc);
            });
        } catch (ex) {
            resolve(null);
        }    
    } else {
        resolve(null);
    }
}).then (smc => {
    const ast = parser.parse(code, config.parser);

    const jsGen = new CodeGenerator(ast, config.codeGenerator, "");

    // Step 1
    traverse(
        ast,
        [
            recoverNamesFromSourceMaps,
            fixControlFlowStatementsWithOneStatement,
            removeLocationInformation,
            replaceSequentialAssignmentsInFunctions,
        ],
        {
            generator: jsGen,
            sourceMapConsumer: smc
        });

    // Step 2
    traverse(
        ast,
        [
            replaceSequentialAssignments,
        ]);

    // Step 3
    traverse(
        ast,
        [
            replaceSequentialAssignmentsInFlowControl
        ]);
    
    
    if (config.verbose) {
        console.log("Traversal finished.");
    }
    
    const outputFilePath = `${processingFileName}.out`;

    createAllFoldersInPath(outputFilePath);

    let res = null;
    try {
        console.log("Generating code...")    
        res = jsGen.generate();
    } catch(ex) {
        console.log("ERROR:", ex.stack);
    }
    
    if (res) {
        console.log("Writing generated code...")    
        
        fs.writeFile(outputFilePath, res.code, err => {
            if (err) {
                console.log(`ERROR: Cannot save into ${outputFilePath}`);
                throw err;
            }
            console.log(`Saving into ${outputFilePath}`);
            process.exit(0);
        });
    }
}).catch( ex => {
    console.log("ERROR:", ex.stack);
});


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

//
//
// Visitors section
//
//

function removeLocationInformation(node) {
    if (!node) {
        return;
    }

    for (let prop in node) {
        if (["loc", "start", "end"].indexOf(prop) > -1) {
            delete node[prop];
            continue;
        }
    }
}

function wrapSingleStatementIntoBlock(node, prop) {
    let tempNode = t.blockStatement([node[prop]]);
    tempNode.parentNode = node;
    tempNode.parentNodeProperty = prop;
    node[prop].parentNode = tempNode;
    node[prop].parentNodeProperty = "body";
    node[prop] = tempNode;
}

function fixControlFlowStatementsWithOneStatement(node, opts)
{
    if (opts && opts.generator)
    {
        let jsGen = opts.generator;
        if (jsGen.IsControlFlowStatement(node))
        {
            if (node.body && !_.includes(["EmptyStatement", "BlockStatement"], node.body.type))
            {
                wrapSingleStatementIntoBlock(node, "body");
            }
            if (node.consequent && node.consequent.type != "BlockStatement")
            {
                wrapSingleStatementIntoBlock(node, "consequent");
            }
            if (node.alternate && !_.includes(["IfStatement", "BlockStatement"], node.alternate.type)) {
                wrapSingleStatementIntoBlock(node, "alternate");
            }
        }
    }
}

function recoverNamesFromSourceMaps(node, opts) {
    let smc = opts.sourceMapConsumer;  
    if (smc) {
        let origLoc = smc.originalPositionFor({line: node.loc.start.line, column: node.loc.start.column});
        if (origLoc && origLoc.name) {
            node.name = origLoc.name;
        }
    }
}

function replaceSequentialAssignments(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return;
    }
    
    if (node.type == "SequenceExpression") {
        if (parent.parentNode && parent.type == "ExpressionStatement" && parent.parentNode.type == "BlockStatement") {
            if (config.verbose) {
                console.log(`Rewriting sequence expression. Parent is ${parent.type}, Grandparent is ${parent.parentNode.type}`);
            }
            let child = node;
            if (parent.type == "ExpressionStatement") {
                parentProperty = parent.parentNodeProperty;
                child = parent;
                parent = parent.parentNode;
            }

            let expressions = _.map(node.expressions, n => {
                let e = t.expressionStatement(n);
                n.parentNode = e;
                n.parentNodeProperty = "expression";
                return e;
            });
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                _.map(expressions, e => { 
                    e.parentNode = parent;
                    e.parentNodeProperty = parentProperty;
                });
                let pos = parent[parentProperty].indexOf(child);
                let params = [pos, 1].concat(expressions);
                let test = parent[parentProperty].splice.apply(parent[parentProperty], params);
            } else {
                let b = t.blockStatement(expressions);
                _.map(expressions, e => { 
                    e.parentNode = b;
                    e.parentNodeProperty = "body";
                });
                parent[parentProperty] = b;
            }
        }
    }    
}

function replaceSequentialAssignmentsInFlowControl(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return;
    }

    if (node.type == "ReturnStatement" && node.argument && ["SequenceExpression"].indexOf(node.argument.type) > -1) {
        if (config.verbose) {
            console.log(`Return argument is ${node.argument.type}`);
        }                
        let lastExpression = node.argument.expressions.pop();
        let expressions = _.map(node.argument.expressions, n => {
            let e = t.expressionStatement(n);
            n.parentNode = e;
            n.parentNodeProperty = "expression";
            e.parentNode = parent;
            e.parentNodeProperty = parentProperty;
            return e;
        });

        node.argument = lastExpression;
        try {
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                let pos = parent[parentProperty].indexOf(node);
                let params = [pos, 0].concat(expressions);
                let test = parent[parentProperty].splice.apply(parent[parentProperty], params);
            } else {
                expressions = _.map(e => { })
                let b = t.blockStatement(expressions.concat([node]));
                _.each(expressions, e => {
                    e.parentNode = b;
                    e.parentNodeProperty = "body";
                });
                parent[parentProperty] = b;
            }
        } catch (e) {
            console.log(`ERROR: ${parent.type} in property ${parentProperty}`, parent[parentProperty]);
            throw e;
        }    
    }    
}

function replaceSequentialAssignmentsInFunctions(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return;
    }

    if (["FunctionExpression", "FunctionDeclaration"].indexOf(node.type) > -1) {
        // if (config.verbose) {
            console.log(`Function Definition. Name: ${node.type == "FunctionExpression" ? (node.parentNode.left || { id: "" }).id : node.id}`);
        // }                
    }
}