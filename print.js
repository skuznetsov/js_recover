#!/usr/bin/env node

"use strict";

const fs = require('fs');
const parser = require('babylon');
const _ = require('lodash');
const request = require('request');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
// const unparse = require('./unparse');
const print = require('babel-generator').default;
const traverse = require("./traverser").traverse;

String.prototype.last = function() {
  return this[this.length-1];  
};

function removeLocationInformation(node) {
    if (!node) {
        return;
    }

    console.log(`Cleaning ${node.type}...`);
    
    for (let prop in node) {
        if (["loc", "start", "end"].indexOf(prop) > -1) {
            node[prop] = null;
            continue;
        }
    }
}


const processingFileName = fs.realpathSync(process.argv[2] || "data/simpleWorker.js");
const code = fs.readFileSync(processingFileName, "utf8");
let mainPath = process.argc > 2 ? process.argv[3] : "/tmp/jsUnparse";
mainPath = fs.realpathSync(mainPath);
mainPath += (mainPath.last() == "/" ? "" : "/");
createAllFoldersInPath(mainPath);

console.log(`Processing ${processingFileName}...`);

let mapUrl = (code.match(/^\/\/#\s*sourceMappingURL=(.+)$/gim)||[""])[0].replace(/^\/\/#\s*sourceMappingURL=/, '');

new Promise((resolve, reject) => {
    if (mapUrl) {
        request.get(mapUrl, function(err, response, body) {
            if (err) {
                resolve(null);
                return;
            }
            let smc = new SourceMapConsumer(JSON.parse(body));
            if (smc.sources && smc.sources.length > 0) {
                _.each(smc.sources, (src, idx) => {
                    let fileName = mainPath +
                                   (mainPath.last() == '/'
                                    || src[0] == '/' ? "" : "/" )
                                    + src; 
                    createAllFoldersInPath(fileName);
                    fs.writeFileSync(fileName, smc.sourcesContent[idx], {flag: "w" } );
                });
            }
            resolve(smc);
        });
    } else {
        resolve(null);
    }
}).then (smc => {
    const ast = parser.parse(code, {
    // parse in strict mode and allow module declarations
    sourceType: "file",

    plugins: [
        // enable experimental async functions
        "asyncFunctions",

        // enable jsx and flow syntax
        "jsx",
        "flow"
    ]
    });

    traverse(ast, removeLocationInformation);
    // unparse.setupNodePrototype(ast, smc);
    const outputFilePath = `${processingFileName}.gen`;
    createAllFoldersInPath(outputFilePath);
    let res = print(ast, {}, "");
    fs.writeFile(outputFilePath, res.code.toString(), err => {
        if (err) {
            console.log(`ERROR: Cannot save into ${outputFilePath}`);
            throw err;
        }
        console.log(`Saving into ${outputFilePath}`);
        process.exit(0);
    });
}).catch( err => {
    console.log("ERROR:\n", err );
    
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