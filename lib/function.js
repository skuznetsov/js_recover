const Utils = require('./utils');

class Function {
    constructor(name, node) {
        this.name = name;
        this.params = node.params;
        this.callers = [];
        this.definers = [node];
    }

    addCaller(node) {
        this.callers.push(node);
    }

    addDefiner(node) {
        this.definers.push(node);
    }
}

module.exports = Function;