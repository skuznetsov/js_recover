const Utils = require('./utils');
const uuid_v4 = require('uuid/v4');
const Variable = require('./variable')

class Scope {
    constructor(node) {
        let id = uuid_v4();
        node._state_id = id;
        this.node = node;
        let parentScope = Utils.findNodeScope(node.parentNode);
        this.id = id;
        this.parent = parentScope;
        this.functions = {};
        this.variables = {};
    }

    static createScope(node) {
        global.astScopes = global.astScopes || {};
        if (!("_state_id" in node)) {
            let scope = new Scope(node);
            global.astScopes[scope.id] = scope;
        }
    }

    getVariable(varName) {
        let currentScope = this;
        let name = typeof(varName) === 'string' ? varName : Utils.extractVariableParts(varName)[0];
        while(currentScope) {
            if (name in currentScope.variables) {
                return currentScope.variables[name].getProperty(varName);
            }
            currentScope = currentScope.parent;
        }
        return null;
    }

    addVariable(varName) {
        let name = typeof(varName) === 'string' ? varName : Utils.extractVariableParts(varName)[0];
        if (name in this.variables) {
            return this.variables[name].addProperty(varName);
        } else {
            let varObject = new Variable(varName, this);
            this.variables[varObject.name] = varObject;
        }
        return this.getVariable(varName);
    }
}

module.exports = Scope;