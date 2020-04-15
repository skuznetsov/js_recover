#!/usr/bin/env node

"use strict";

if (!process.env.NODE_CONFIG_DIR) {
    process.env.NODE_CONFIG_DIR = __dirname + "/config";
}

const config = require('config');
const fs = require('fs');
// const parser = require('babylon');
const parser = require('@babel/parser');
const _ = require('lodash');
const request = require('request');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const CodeGenerator = require('./lib/jsgen').CodeGenerator;
// const generate = require('@babel/generator').default;
const traverse = require("./lib/traverser");

// Node mutators
const dumpScopes = require("./lib/mutators/dump_scopes");
const assignValuesToVariables = require("./lib/mutators/assign_values_to_variables");
const createScopes = require("./lib/mutators/create_scopes");
const replaceSequentialAssignmentsInFlowControl = require("./lib/mutators/replace_sequential_assignments_in_flow_control");
const replaceSequentialAssignments = require("./lib/mutators/replace_sequential_assignments");
const fixControlFlowStatementsWithOneStatement = require("./lib/mutators/fix_control_flow_statements_with_one_statement");
const removeLocationInformation = require("./lib/mutators/remove_location_information");
const removeEmptyFunctions = require("./lib/mutators/remove_empty_functions");
const defineFunctions = require("./lib/mutators/define_functions");
const countFunctionInvocations = require("./lib/mutators/count_function_invocations");
const recoverBooleans = require("./lib/mutators/recover_booleans");
const renameVariables = require("./lib/mutators/rename_variables");
const Utils = require("./lib/utils");

if (typeof (config.verbose) === "undefined") {
    console.error(`ERROR: Cannot find config file at ${process.env.NODE_CONFIG_DIR}`);
    process.exit(1);
}

String.prototype.last = function () {
    return this[this.length - 1];
};

const processingFileName = fs.realpathSync(process.argv[2] || config.defaultFileToProcess);
const code = fs.readFileSync(processingFileName, "utf8");
console.log(`Processing ${processingFileName}...`);

// let mapUrl = (code.match(/^\/\/#\s*sourceMappingURL=(.+)$/gim)||[""])[0].replace(/^\/\/#\s*sourceMappingURL=/, '');

// new Promise((resolve, reject) => {
//     if (config.sourceMaps.use && mapUrl) {
//         try {
//             request.get(mapUrl, function (err, response, body) {
//                 if (err)
//                 {
//                     resolve(null);
//                     return;
//                 }

//                 let smc = new SourceMapConsumer(JSON.parse(body));
//                 if (config.sourceMaps.saveOriginals && smc.sources && smc.sources.length > 0) {
//                     let mainPath = process.argc > 2 ? process.argv[3] : config.sourceMaps.defaultOutputFolder;
//                     mainPath = fs.realpathSync(mainPath);
//                     mainPath += (mainPath.last() == "/" ? "" : "/");
//                     Utils.createAllFoldersInPath(mainPath);
//                     _.each(smc.sources, (src, idx) => {
//                         let fileName = mainPath +
//                             (mainPath.last() == '/'
//                                 || src[0] == '/' ? "" : "/")
//                             + src;
//                         Utils.createAllFoldersInPath(fileName);
//                         fs.writeFileSync(fileName, smc.sourcesContent[idx], { flag: "w" });
//                     });
//                 }
//                 resolve(smc);
//             });
//         } catch (ex) {
//             resolve(null);
//         }    
//     } else {
//         resolve(null);
//     }
// }).then (smc => {
const ast = parser.parse(code, config.parser);

// fs.writeFileSync('./ast.before.json', JSON.stringify(ast, null, 2));

const jsGen = new CodeGenerator(ast, config.codeGenerator, "");

// Pre-step
traverse(
    ast,
    [
        removeLocationInformation,
        defineFunctions,
        countFunctionInvocations,
        recoverBooleans,
    ],
    {
        config
    });

while (true) {
    if (!traverse(
        ast,
        [
            removeEmptyFunctions,
            fixControlFlowStatementsWithOneStatement,
            replaceSequentialAssignments,
            replaceSequentialAssignmentsInFlowControl
        ],
        {
            config
        }
    )) {
        console.log('Traversing completed.');
        break;
    }
    console.log('Traversing...');
}

for (let func in global.Functions) {
    let funcNode = global.Functions[func];
    // if (funcNode.callCount < 2) {
    //     console.error(`Func ${func} called ${funcNode.callCount} times`);
    // }
    if (funcNode.type == "FunctionDeclaration" && (funcNode.isEmptyFunction || funcNode.callCount == 0)) {
        Utils.removeChildFromParentNode(funcNode);
    }
}

global.Functions = null;
// Painting of variables
// traverse(
//     ast,
//     [
//         createScopes,
//         assignValuesToVariables,
//         renameVariables
//     ], {config});

// Dumping scopes of variables
// traverse(ast,dumpScopes, {config});

fs.writeFileSync('./ast.after.json', JSON.stringify(ast, (k, v) => ['parentNode', 'parentNodeProperty'].includes(k) ? null : v, 2));
// fs.writeFileSync('./scopes.json', JSON.stringify(global.astScopes, (k,v) => ['parent'].includes(k) ? null : v, 2));

const outputFilePath = `${processingFileName}.out`;

Utils.createAllFoldersInPath(outputFilePath);

let res = null;
try {
    console.log("Generating code...")    
    res = jsGen.generate();
    // res = generate(ast, {});
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
// }).catch( ex => {
//     console.log("ERROR:", ex.stack);
// });
