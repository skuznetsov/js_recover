"use strict";

var classCallCheck = require("babel-runtime/helpers/class-call-check").default;
var ObjectKeys = require("babel-runtime/core-js/object/keys").default;
var sourceMap = require("source-map");
var t = require("babel-runtime/helpers/interop-require-wildcard").default(require("babel-types"));

/**
 * Build a sourcemap.
 */

function SourceMap(position, opts, code) {
  // istanbul ignore next

  var _this = this;

  classCallCheck(this, SourceMap);

  this.position = position;
  this.opts = opts;
  this.last = { generated: {}, original: {} };

  if (opts.sourceMaps) {
    this.map = new sourceMap.SourceMapGenerator({
      file: opts.sourceMapTarget,
      sourceRoot: opts.sourceRoot
    });

    if (typeof code === "string") {
      this.map.setSourceContent(opts.sourceFileName, code);
    } else if (typeof code === "object") {
      ObjectKeys(code).forEach(function (sourceFileName) {
        _this.map.setSourceContent(sourceFileName, code[sourceFileName]);
      });
    }
  } else {
    this.map = null;
  }
}

  /**
   * Get the sourcemap.
   */

SourceMap.prototype.get = function get() {
  var map = this.map;
  if (map) {
    return map.toJSON();
  } else {
    return map;
  }
};

  /**
   * Mark a node's generated position, and add it to the sourcemap.
   */

SourceMap.prototype.mark = function mark(node) {
  var loc = node.loc;
  if (!loc) return; // no location info

  var map = this.map;
  if (!map) return; // no source map

  if (t.isProgram(node) || t.isFile(node)) return; // illegal mapping nodes

  var position = this.position;

  var generated = {
    line: position.line,
    column: position.column
  };

  var original = loc.start;

  // Avoid emitting duplicates on either side. Duplicated
  // original values creates unnecesssarily large source maps
  // and increases compile time. Duplicates on the generated
  // side can lead to incorrect mappings.
  if (comparePosition(original, this.last.original) || comparePosition(generated, this.last.generated)) {
    return;
  }

  this.last = {
    source: loc.filename || this.opts.sourceFileName,
    generated: generated,
    original: original
  };

  map.addMapping(this.last);
};

function comparePosition(a, b) {
  return a.line === b.line && a.column === b.column;
}

module.exports = SourceMap;