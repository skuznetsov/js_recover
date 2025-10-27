const Utils = require('./utils');

class Variable {
    constructor(name, scope) {
        this.history = [];
        this.properties = {};
        if (typeof(name) === 'string') {
            this.name = name;
        } else if ("type" in name) {
            let parts = Utils.extractVariableParts(name);
            this.name = parts[0];
            this.addProperty(name);
        }
        this.scope = scope;
    }

    toString() {
        return `${this.name} {\n${Object.values(this.properties).map(el=>"   " + el.toString()).join(", ")} }`;
    }

    enumerateProperties() {

    }

    getScope() {
        return this.scope;
    }

    get propertyNames() {
        return Object.keys(this.properties);
    }

    getProperty(propName) {
        if (typeof(propName) === 'string') {
            if (propName == this.name) {
                return this;
            }
            if (propName in this.properties) {
                return this.properties[propName];
            }
        } else if ("type" in propName) {
            let parts = Utils.extractVariableParts(propName);
            if (parts[0] == this.name) {
                parts.shift();
            }
            let currentProperty = this;
            while(parts.length > 0) {
                let currentPart = parts.shift();
                currentProperty = currentProperty?.getProperty?.call(currentProperty, currentPart);
                if (!currentProperty) {
                    return null;
                }
            }
            return currentProperty;
        }
        return null;
    }

    isUsed() {
        let isUsed = 0;
        if (Object.keys(this.properties) == 0) {
            return this.history.length > 0 ? 1 : 0;
        }
        for(let propName of this.propertyNames) {
            isUsed |= this.getProperty(propName).isUsed();
        }

        return isUsed;
    }

    get value() {
        return this.history[0];
    }

    set value(value) {
        this.history.unshift(value);
    }

    addProperty(propName) {
        if (typeof(propName) === 'string') {
            if (propName in this.properties && this.properties.hasOwnProperty(propName)) {
                return this.properties[propName];
            } else {
                let variable = new Variable(propName, this.scope);
                this.properties[propName] = variable;
            }
            return this.properties[propName];
        } else if ("type" in propName) {
            let parts = Utils.extractVariableParts(propName);
            if (parts[0] == this.name) {
                parts.shift();
            }
            let currentProperty = this;
            while(parts.length > 0) {
                let currentPart = parts.shift();
                currentProperty = currentProperty.addProperty(currentPart);
            }
            return currentProperty;
        }
    }
}
module.exports = Variable;