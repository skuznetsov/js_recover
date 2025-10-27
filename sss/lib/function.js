const Utils = require('./utils');

class Function {
    constructor(name, node) {
        this._name = name;
        this._params = node.params;
        this.callers = [];
        this.definers = [node];
        this.callCount = 0;
    }

    get name() {
        return Utils.extractVariableName(this._name) + "(" + this._params.map(el => Utils.extractVariableName(el)).join(", ") + ")";
    }

    addCaller(node) {
        this.callers.push(node);
    }

    addDefiner(node) {
        this.definers.push(node);
    }
}

module.exports = Function;