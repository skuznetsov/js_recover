/**
 * Track current position in code generation.
 */

"use strict";

const classCallCheck = require("babel-runtime/helpers/class-call-check").default;

function Position() {
    classCallCheck(this, Position);

    this.line = 1;
    this.column = 0;
}

  /**
   * Push a string to the current position, mantaining the current line and column.
   */

Position.prototype.push = function push(str) {
    for (var i = 0; i < str.length; i++) {
        if (str[i] === "\n") {
            this.line++;
            this.column = 0;
        } else {
            this.column++;
        }
    }
};

  /**
   * Unshift a string from the current position, mantaining the current line and column.
   */

Position.prototype.unshift = function unshift(str) {
    for (var i = 0; i < str.length; i++) {
        if (str[i] === "\n") {
            this.line--;
        } else {
            this.column--;
        }
    }
};

module.exports = Position;