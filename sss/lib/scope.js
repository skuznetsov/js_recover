const Utils = require('./utils');
const uuid_v4 = require('uuid/v4');
const Variable = require('./variable');
const Function = require('./function');

let _globalScope = null;
class Scope {
    constructor(node, parentNode, parentStack) {
        let id = uuid_v4();
        node._state_id = id;
        this.node = node;
        let parentNodeStack = [...parentStack];
        parentNodeStack.pop();
        let parentScope = Utils.findNodeScope(parentNode, parentNodeStack);
        this.id = id;
        this.parent = parentScope;
        this.functions = {};
        this.variables = {};
    }

    static globalScope() {
        if (_globalScope) {
            return _globalScope;
        }

        if (!global.astScopes) {
            return null;
        }

        let scope = Object.values(global.astScopes)[0];
        while(scope.parent) {
            scope = scope.parent;
        }
        _globalScope = scope;
        return scope;
    }

    static createScope(node, parentNode, parentStack) {
        global.astScopes ||= {};
        if (!("_state_id" in node)) {
            let scope = new Scope(node, parentNode, parentStack);
            global.astScopes[scope.id] = scope;
        }
    }

    getVariableNames() {
        return Object.keys(this.variables);
    }

    getVariable(varName) {
        let currentScope = this;
        let name = typeof(varName) === 'string' ? varName : Utils.extractVariableParts(varName)?.[0];
        
        if (!name) {
            return null;
        }
        
        while(currentScope) {
            if (name in currentScope.variables) {
                return currentScope.variables[name].getProperty(varName);
            }
            currentScope = currentScope.parent;
        }
        return null;
    }

    addVariable(varName) {
        let nameParts = Utils.extractVariableParts(varName);
        if (!nameParts) {
            return null;
        }
        let name = typeof(varName) === 'string' ? varName : nameParts[0];
        if (this.variables[name]?.addProperty) { // TODO: Check why it may have some value that is not Variable class
            return this.variables[name].addProperty(varName);
        } else {
            let varObject = new Variable(varName, this);
            this.variables[varObject.name] = varObject;
        }
        return this.getVariable(varName);
    }

    addFunction(name, node) {
        let funcVar = this.addVariable(name);
        let func = new Function(name, node);
        if (funcVar) {
            funcVar.value = func;
        }
        return funcVar;
    }
}

module.exports = Scope;