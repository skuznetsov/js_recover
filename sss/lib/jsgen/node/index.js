"use strict";

const ObjectКeys = require("babel-runtime/core-js/object/keys").default;

module.exports = {
  isUserWhitespacable: isUserWhitespacable,
  needsWhitespace: needsWhitespace,
  needsWhitespaceBefore: needsWhitespaceBefore,
  needsWhitespaceAfter: needsWhitespaceAfter,
  needsParens: needsParens
};

const whitespace = require("./whitespace");
const parens = require("./parentheses");
const t = require("babel-runtime/helpers/interop-require-wildcard").default(require("babel-types"));

function find(obj, node, parent, printStack) {
  if (!obj) return;
  var result = undefined;

  var types = ObjectКeys(obj);
  for (var i = 0; i < types.length; i++) {
    var type = types[i];

    if (t.is(type, node)) {
      var fn = obj[type];
      result = fn(node, parent, printStack);
      if (result != null) break;
    }
  }

  return result;
}

function isOrHasCallExpression(node) {
  if (t.isCallExpression(node)) {
    return true;
  }

  if (t.isMemberExpression(node)) {
    return isOrHasCallExpression(node.object) || !node.computed && isOrHasCallExpression(node.property);
  } else {
    return false;
  }
}

function isUserWhitespacable(node) {
  return t.isUserWhitespacable(node);
}

function needsWhitespace(node, parent, type) {
  if (!node) return 0;

  if (t.isExpressionStatement(node)) {
    node = node.expression;
  }

  var linesInfo = find(whitespace.nodes, node, parent);

  if (!linesInfo) {
    var items = find(whitespace.list, node, parent);
    if (items) {
      for (var i = 0; i < items.length; i++) {
        linesInfo = needsWhitespace(items[i], node, type);
        if (linesInfo) break;
      }
    }
  }

  return linesInfo && linesInfo[type] || 0;
}

function needsWhitespaceBefore(node, parent) {
  return needsWhitespace(node, parent, "before");
}

function needsWhitespaceAfter(node, parent) {
  return needsWhitespace(node, parent, "after");
}

function needsParens(node, parent, printStack) {
  if (!parent) return false;

  if (t.isNewExpression(parent) && parent.callee === node) {
    if (isOrHasCallExpression(node)) return true;
  }

  return find(parens, node, parent, printStack);
}
