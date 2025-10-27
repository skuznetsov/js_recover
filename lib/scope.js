const Utils = require('./utils');
const uuid_v4 = require('uuid/v4');
const Variable = require('./variable');
const Function = require('./function');
const ParentStack = require('./parent_stack');

let _globalScopeCache = new WeakMap(); // Cache per context

class Scope {
    constructor(node, parentNode, parentStack, context) {
        let id = uuid_v4();
        node._state_id = id;
        this.node = node;
        // FIX: O(1) linked list pop instead of O(N) array copy
        const parentNodeStack = ParentStack.pop(parentStack);
        let parentScope = Utils.findNodeScope(parentNode, parentNodeStack, context);
        this.id = id;
        this.parent = parentScope;
        this.functions = {};
        this.variables = {};
    }

    static globalScope(context) {
        if (!context || !context.astScopes) {
            return null;
        }

        // Check cache first
        if (_globalScopeCache.has(context)) {
            return _globalScopeCache.get(context);
        }

        let scope = Object.values(context.astScopes)[0];
        if (!scope) {
            return null;
        }

        while(scope.parent) {
            scope = scope.parent;
        }

        _globalScopeCache.set(context, scope);
        return scope;
    }

    static createScope(node, parentNode, parentStack, context) {
        if (!context || !context.astScopes) {
            throw new Error('Context with astScopes is required for Scope.createScope');
        }

        if (!("_state_id" in node)) {
            let scope = new Scope(node, parentNode, parentStack, context);
            context.astScopes[scope.id] = scope;
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

        // FIX: Detect circular scope chains to prevent infinite loops
        const visited = new Set();

        while(currentScope) {
            // Check for circular reference
            if (visited.has(currentScope)) {
                console.error(`ERROR: Circular scope chain detected at scope ${currentScope.id}`);
                console.error(`  Variable: ${name}`);
                console.error(`  Visited scopes: ${Array.from(visited).map(s => s.id).join(' → ')}`);
                throw new Error('Circular scope chain detected');
            }
            visited.add(currentScope);

            if (name in currentScope.variables) {
                const variable = currentScope.variables[name];
                // Safety check: ensure it's a Variable instance with getProperty method
                if (variable && typeof variable.getProperty === 'function') {
                    return variable.getProperty(varName);
                }
                // If not a Variable instance, skip this scope and continue search
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