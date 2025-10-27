/* eslint max-len: 0 */

"use strict";

const _ = require("lodash");
const classCallCheck = require("babel-runtime/helpers/class-call-check").default;
const assignToObject = require("babel-runtime/core-js/object/assign").default;

const repeating = require("repeating");
const Buffer = require("./buffer");
const n = require("./node");
const t = require("babel-types");

class Printer extends Buffer {

    constructor(position, format) {
        // for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        //     args[_key] = arguments[_key];
        // }

        // Buffer.call.apply(Buffer, [this].concat(args));
        super(position, format);
        this.insideAux = false;
        this.printAuxAfterOnNextUserNode = false;
        this._printStack = [];
    }

    print(node, parent) {
        var opts = arguments[2] || {};

        if (!node) return;

        this._lastPrintedIsEmptyStatement = false;

        if (parent && parent._compact) {
            node._compact = true;
        }

        var oldInAux = this.insideAux;
        this.insideAux = !node.loc;

        var oldConcise = this.format.concise;
        if (node._compact) {
            this.format.concise = true;
        }

        var printMethod = this[node.type];
        if (!printMethod) {
            throw new ReferenceError("unknown node of type " + JSON.stringify(node.type) + " with constructor " + JSON.stringify(node && node.constructor.name));
        }

        this._printStack.push(node);

        if (node.loc) this.printAuxAfterComment();
        this.printAuxBeforeComment(oldInAux);

        var needsParens = n.needsParens(node, parent, this._printStack);
        if (needsParens) this.push("(");

        this.printLeadingComments(node, parent);

        this.catchUp(node);

        this._printNewline(true, node, parent, opts);

        if (opts.before) opts.before();

        this.map.mark(node);

        this._print(node, parent);

        // Check again if any of our children may have left an aux comment on the stack
        if (node.loc) this.printAuxAfterComment();

        this.printTrailingComments(node, parent);

        if (needsParens) this.push(")");

        // end
        this._printStack.pop();
        if (parent) this.map.mark(parent);
        if (opts.after) opts.after();

        this.format.concise = oldConcise;
        this.insideAux = oldInAux;

        this._printNewline(false, node, parent, opts);
    }

    printAuxBeforeComment(wasInAux) {
        var comment = this.format.auxiliaryCommentBefore;
        if (!wasInAux && this.insideAux && !this.printAuxAfterOnNextUserNode) {
            this.printAuxAfterOnNextUserNode = true;
            if (comment) this.printComment({
                type: "CommentBlock",
                value: comment
            });
        }
    }

    printAuxAfterComment() {
        if (this.printAuxAfterOnNextUserNode) {
            this.printAuxAfterOnNextUserNode = false;
            var comment = this.format.auxiliaryCommentAfter;
            if (comment) this.printComment({
                type: "CommentBlock",
                value: comment
            });
        }
    }

    getPossibleRaw(node) {
        var extra = node.extra;
        if (extra && extra.raw != null && extra.rawValue != null && node.value === extra.rawValue) {
            return extra.raw;
        }
    }

    _print(node, parent) {
        // In minified mode we need to produce as little bytes as needed
        // and need to make sure that string quoting is consistent.
        // That means we have to always reprint as opposed to getting
        // the raw value.
        if (!this.format.minified) {
            var extra = this.getPossibleRaw(node);
            if (extra) {
                this.push("");
                this._push(extra);
                return;
            }
        }

        var printMethod = this[node.type];
        printMethod.call(this, node, parent);
    }

    printJoin(nodes, parent) {
        // istanbul ignore next
        var _this = this;
        var opts = arguments[2] || {};
        if (!nodes || !nodes.length) return;

        var len = nodes.length;
        var node = undefined,
            i = undefined;

        if (opts.indent) this.indent();

        var printOpts = {
            statement: opts.statement,
            addNewlines: len < 2 ? false : opts.addNewlines,
            after: function after() {
                if (opts.iterator) {
                    opts.iterator(node, i);
                }

                if (opts.separator && parent.loc) {
                    _this.printAuxAfterComment();
                }

                if (opts.separator && i < len - 1) {
                    _this.push(opts.separator);
                }
            }
        };

        for (i = 0; i < nodes.length; i++) {
            node = nodes[i];
            this.print(node, parent, printOpts);
        }

        if (opts.indent) this.dedent();
    }

    printAndIndentOnComments(node, parent) {
        var indent = !!node.leadingComments;
        if (indent) this.indent();
        this.print(node, parent);
        if (indent) this.dedent();
    }

    printBlock(parent) {
        var node = parent.body;

        if (!t.isEmptyStatement(node)) {
            this.space();
        }
        this.print(node, parent);
    }

    generateComment(comment) {
        var val = comment.value;
        if (comment.type === "CommentLine") {
            val = "//" + val;
        } else {
            val = "/*" + val + "*/";
        }
        return val;
    }

    printTrailingComments(node, parent) {
        this.printComments(this.getComments("trailingComments", node, parent));
    }

    printLeadingComments(node, parent) {
        this.printComments(this.getComments("leadingComments", node, parent));
    }

    printInnerComments(node) {
        var indent = arguments.length <= 1 || arguments[1] === undefined ? true : arguments[1];

        if (!node.innerComments) return;
        if (indent) this.indent();
        this.printComments(node.innerComments);
        if (indent) this.dedent();
    }

    printSequence(nodes, parent) {
        var opts = arguments[2] || {};

        opts.statement = true;
        return this.printJoin(nodes, parent, opts);
    }

    printList(items, parent) {
        var opts = arguments[2] || {};

        if (opts.separator == null) {
            opts.separator = ",";
            if (!this.format.compact) opts.separator += " ";
        }

        return this.printJoin(items, parent, opts);
    }

    _printNewline(leading, node, parent, opts) {
        if (!opts.statement && !n.isUserWhitespacable(node, parent)) {
            return;
        }

        var lines = 0;

        if (node.start != null && !node._ignoreUserWhitespace && this.tokens.length) {
            // user node
            if (leading) {
                lines = this.whitespace.getNewlinesBefore(node);
            } else {
                lines = this.whitespace.getNewlinesAfter(node);
            }
        } else {
            // generated node
            if (!leading) lines++; // always include at least a single line after
            if (opts.addNewlines) lines += opts.addNewlines(leading, node) || 0;

            var needs = n.needsWhitespaceAfter;
            if (leading) needs = n.needsWhitespaceBefore;
            if (needs(node, parent)) lines++;

            // generated nodes can't add starting file whitespace
            if (!this.buf) lines = 0;
        }

        this.newline(lines);
    }

    getComments(key, node) {
        return node && node[key] || [];
    }

    shouldPrintComment(comment) {
        if (this.format.shouldPrintComment) {
            return this.format.shouldPrintComment(comment.value);
        } else {
            if (!this.format.minified && (comment.value.indexOf("@license") >= 0 || comment.value.indexOf("@preserve") >= 0)) {
                return true;
            } else {
                return this.format.comments;
            }
        }
    }

    printComment(comment) {
        if (!this.shouldPrintComment(comment)) return;

        if (comment.ignore) return;
        comment.ignore = true;

        if (comment.start != null) {
            if (this.printedCommentStarts[comment.start]) return;
            this.printedCommentStarts[comment.start] = true;
        }

        this.catchUp(comment);

        // whitespace before
        this.newline(this.whitespace.getNewlinesBefore(comment));

        var column = this.position.column;
        var val = this.generateComment(comment);

        if (column && !this.isLast(["\n", " ", "[", "{"])) {
            this._push(" ");
            column++;
        }

        //
        if (comment.type === "CommentBlock" && this.format.indent.adjustMultilineComment) {
            var offset = comment.loc && comment.loc.start.column;
            if (offset) {
                var newlineRegex = new RegExp("\\n\\s{1," + offset + "}", "g");
                val = val.replace(newlineRegex, "\n");
            }

            var indent = Math.max(this.indentSize(), column);
            val = val.replace(/\n/g, "\n" + repeating(" ", indent));
        }

        if (column === 0) {
            val = this.getIndent() + val;
        }

        // force a newline for line comments when retainLines is set in case the next printed node
        // doesn't catch up
        if ((this.format.compact || this.format.concise || this.format.retainLines) && comment.type === "CommentLine") {
            val += "\n";
        }

        //
        this._push(val);

        // whitespace after
        this.newline(this.whitespace.getNewlinesAfter(comment));
    }

    printComments(comments) {
        if (!comments || !comments.length) return;

        for (var _i = 0; _i < comments.length; _i++) {
            var comment = comments[_i];
            this.printComment(comment);
        }
    }
}

_.each(
    [require("./generators/template-literals"),
    require("./generators/expressions"),
    require("./generators/statements"),
    require("./generators/classes"),
    require("./generators/methods"),
    require("./generators/modules"),
    require("./generators/types"),
    require("./generators/flow"),
    require("./generators/base"),
    require("./generators/jsx")],
    function (generator) {
        assignToObject(Printer.prototype, generator);
    }
);

module.exports = Printer;