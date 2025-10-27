#!/usr/bin/env node --max-old-space-size=16386

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
const CodeGenerator = require('@babel/generator').CodeGenerator;
// const astring = require('astring');
// const generate = require('@babel/generator').default;
const {traverseTopDown, traverseBottomUp} = require("./lib/traverser");

// Node mutators
// const dumpScopes = require("./lib/mutators/dump_scopes");
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

Array.prototype.last = function (n = 0) {
    let value = (n >= 0 && n <= this.length - 1) ? this[this.length - (n + 1)] : null;
    return value;
};

function dumpScopes(scopes, parent, level = 0) {
    let children = Object.values(scopes).filter(el => el.parent == parent);
    for (let scope of children) {
        let varsOrFuncs = Object.values(scope.variables);
        let funcs = varsOrFuncs.filter(el => el.value?.constructor?.name == "Function");
        let vars = varsOrFuncs.filter(el => el.value?.constructor?.name != "Function");

        if (varsOrFuncs.length > 0) {
            if (funcs.length > 0) {
                console.log('Functions:');
                for (let func of funcs) {
                    console.log(`Name: ${func.value.name}, call count: ${func.value.callCount}`);
                }
            }
            if (vars.length > 0) {
                console.log('Variables:');
                for (let variable of vars) {
                    console.log(variable.toString());
                }
            }
        }
        dumpScopes(scopes, scope, level + 1);
    }
    
}



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

fs.writeFileSync(`${processingFileName}.ast.before.json`, JSON.stringify(ast, null, 2));

const jsGen = new CodeGenerator(ast, config.codeGenerator, "");

// Pre-step
let status = traverseTopDown(
    ast,
    [
        removeLocationInformation
    ],
    {
        config
    }
);

status = traverseTopDown(
    ast,
    [
        createScopes,
        defineFunctions,
        assignValuesToVariables
    ],
    {
        config
    }
);


status = traverseTopDown(
    ast,
    [
        countFunctionInvocations,
        recoverBooleans
    ],
    {
        config
    }
);

let trial = 0;
while (true) {
    console.log('Traversing...');
    status = traverseBottomUp( ast, fixControlFlowStatementsWithOneStatement, { config });
    status |= traverseBottomUp( ast, replaceSequentialAssignments, { config });
    status |= traverseBottomUp( ast, replaceSequentialAssignmentsInFlowControl, { config });

    // if (!status) {
    if (trial > 10) {
        console.log('Traversing completed.');
        break;
    }
    trial++;
}

dumpScopes(global.astScopes, null);

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

fs.writeFileSync(`${processingFileName}.ast.after.json`, JSON.stringify(ast, (k, v) => ['parentNode', 'parentNodeProperty'].includes(k) ? null : v, 2));
// fs.writeFileSync('./scopes.json', JSON.stringify(global.astScopes, (k,v) => ['parent'].includes(k) ? null : v, 2));

const outputFilePath = `${processingFileName}.out`;

Utils.createAllFoldersInPath(outputFilePath);

let res = null;
try {
    console.log("Generating code...")    
    res = jsGen.generate();
//    res = astring.generate(ast);
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
