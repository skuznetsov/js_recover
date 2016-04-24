"use strict";

const inherits = require("babel-runtime/helpers/inherits").default;
const classCallCheck = require("babel-runtime/helpers/class-call-check").default;
const detectIndent = require("detect-indent");
const Whitespace = require("./whitespace");
const SourceMap = require("./source-map");
const Position = require("./position");
const messages = require("babel-runtime/helpers/interop-require-wildcard").default(require("babel-messages"));
const Printer = require("./printer");

/**
 * Babel's code generator, turns an ast into code, maintaining sourcemaps,
 * user preferences, and valid output.
 */

  inherits(CodeGenerator, Printer);

  function CodeGenerator(ast, opts, code) {
    classCallCheck(this, CodeGenerator);

    opts = opts || {};

    var comments = ast.comments || [];
    var tokens = ast.tokens || [];
    var format = CodeGenerator.normalizeOptions(code, opts, tokens);

    var position = new Position();

    Printer.call(this, position, format);

    this.comments = comments;
    this.position = position;
    this.tokens = tokens;
    this.format = format;
    this.opts = opts;
    this.ast = ast;
    this._inForStatementInitCounter = 0;

    this.whitespace = new Whitespace(tokens);
    this.map = new SourceMap(position, opts, code);
  }

  /**
   * Normalize generator options, setting defaults.
   *
   * - Detects code indentation.
   * - If `opts.compact = "auto"` and the code is over 100KB, `compact` will be set to `true`.
    */

  CodeGenerator.normalizeOptions = function normalizeOptions(code, opts, tokens) {
    var style = "    ";
    if (code && typeof code === "string") {
      var _indent = detectIndent(code).indent;
      if (_indent && _indent !== " ") style = _indent;
    }

    var format = {
      auxiliaryCommentBefore: opts.auxiliaryCommentBefore,
      auxiliaryCommentAfter: opts.auxiliaryCommentAfter,
      shouldPrintComment: opts.shouldPrintComment,
      retainLines: opts.retainLines,
      comments: opts.comments == null || opts.comments,
      compact: opts.compact,
      minified: opts.minified,
      concise: opts.concise,
      quotes: opts.quotes || CodeGenerator.findCommonStringDelimiter(code, tokens),
      indent: {
        adjustMultilineComment: true,
        style: style,
        base: 0
      }
    };

    if (format.minified) {
      format.compact = true;
    }

    if (format.compact === "auto") {
      format.compact = code.length > 100000; // 100KB

      if (format.compact) {
        console.error("[BABEL] " + messages.get("codeGeneratorDeopt", opts.filename, "100KB"));
      }
    }

    if (format.compact) {
      format.indent.adjustMultilineComment = false;
    }

    return format;
  };

  /**
   * Determine if input code uses more single or double quotes.
   */

  CodeGenerator.findCommonStringDelimiter = function findCommonStringDelimiter(code, tokens) {
    var occurences = {
      single: 0,
      double: 0
    };

    var checked = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.type.label !== "string") continue;

      var raw = code.slice(token.start, token.end);
      if (raw[0] === "'") {
        occurences.single++;
      } else {
        occurences.double++;
      }

      checked++;
      if (checked >= 3) break;
    }
    if (occurences.single > occurences.double) {
      return "single";
    } else {
      return "double";
    }
  };

  /**
   * Generate code and sourcemap from ast.
   *
   * Appends comments that weren't attached to any node to the end of the generated output.
   */

  CodeGenerator.prototype.generate = function generate() {
    this.print(this.ast);
    this.printAuxAfterComment();

    return {
      map: this.map.get(),
      code: this.get()
    };
  };

module.exports = function (ast, opts, code) {
  var gen = new CodeGenerator(ast, opts, code);
  return gen.generate();
};