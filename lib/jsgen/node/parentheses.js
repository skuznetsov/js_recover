"use strict";

module.exports = {
  NullableTypeAnnotation: NullableTypeAnnotation,
  UpdateExpression: UpdateExpression,
  ObjectExpression: ObjectExpression,
  Binary: Binary,
  BinaryExpression: BinaryExpression,
  SequenceExpression: SequenceExpression,
  YieldExpression: YieldExpression,
  ClassExpression: ClassExpression,
  UnaryLike: UnaryLike,
  FunctionExpression: FunctionExpression,
  ArrowFunctionExpression: ArrowFunctionExpression,
  ConditionalExpression: ConditionalExpression,
  AssignmentExpression: AssignmentExpression
};

var t = require("babel-runtime/helpers/interop-require-wildcard").default(require("babel-types"));

var PRECEDENCE = {
  "||": 0,
  "&&": 1,
  "|": 2,
  "^": 3,
  "&": 4,
  "==": 5,
  "===": 5,
  "!=": 5,
  "!==": 5,
  "<": 6,
  ">": 6,
  "<=": 6,
  ">=": 6,
  "in": 6,
  "instanceof": 6,
  ">>": 7,
  "<<": 7,
  ">>>": 7,
  "+": 8,
  "-": 8,
  "*": 9,
  "/": 9,
  "%": 9,
  "**": 10
};

function NullableTypeAnnotation(node, parent) {
  return t.isArrayTypeAnnotation(parent);
}

module.exports.FunctionTypeAnnotation = NullableTypeAnnotation;

function UpdateExpression(node, parent) {
  if (t.isMemberExpression(parent) && parent.object === node) {
    // (foo++).test()
    return true;
  }

  return false;
}

function ObjectExpression(node, parent, printStack) {
  return isFirstInStatement(printStack, { considerArrow: true });
}

function Binary(node, parent) {
  if ((t.isCallExpression(parent) || t.isNewExpression(parent)) && parent.callee === node) {
    return true;
  }

  if (t.isUnaryLike(parent)) {
    return true;
  }

  if (t.isMemberExpression(parent) && parent.object === node) {
    return true;
  }

  if (t.isBinary(parent)) {
    var parentOp = parent.operator;
    var parentPos = PRECEDENCE[parentOp];

    var nodeOp = node.operator;
    var nodePos = PRECEDENCE[nodeOp];

    if (parentPos > nodePos) {
      return true;
    }

    // Logical expressions with the same precedence don't need parens.
    if (parentPos === nodePos && parent.right === node && !t.isLogicalExpression(parent)) {
      return true;
    }
  }

  return false;
}

function BinaryExpression(node, parent) {
  if (node.operator === "in") {
    // let i = (1 in []);
    if (t.isVariableDeclarator(parent)) {
      return true;
    }

    // for ((1 in []);;);
    if (t.isFor(parent)) {
      return true;
    }
  }

  return false;
}

function SequenceExpression(node, parent) {
  if (t.isForStatement(parent)) {
    // Although parentheses wouldn"t hurt around sequence
    // expressions in the head of for loops, traditional style
    // dictates that e.g. i++, j++ should not be wrapped with
    // parentheses.
    return false;
  }

  if (t.isExpressionStatement(parent) && parent.expression === node) {
    return false;
  }

  if (t.isReturnStatement(parent)) {
    return false;
  }

  if (t.isThrowStatement(parent)) {
    return false;
  }

  if (t.isSwitchStatement(parent) && parent.discriminant === node) {
    return false;
  }

  if (t.isWhileStatement(parent) && parent.test === node) {
    return false;
  }

  if (t.isIfStatement(parent) && parent.test === node) {
    return false;
  }

  if (t.isForInStatement(parent) && parent.right === node) {
    return false;
  }

  // Otherwise err on the side of overparenthesization, adding
  // explicit exceptions above if this proves overzealous.
  return true;
}

function YieldExpression(node, parent) {
  return t.isBinary(parent) || t.isUnaryLike(parent) || t.isCallExpression(parent) || t.isMemberExpression(parent) || t.isNewExpression(parent);
}

exports.AwaitExpression = YieldExpression;

function ClassExpression(node, parent, printStack) {
  return isFirstInStatement(printStack, { considerDefaultExports: true });
}

function UnaryLike(node, parent) {
  if (t.isMemberExpression(parent, { object: node })) {
    return true;
  }

  if (t.isCallExpression(parent, { callee: node }) || t.isNewExpression(parent, { callee: node })) {
    return true;
  }

  return false;
}

function FunctionExpression(node, parent, printStack) {
  return isFirstInStatement(printStack, { considerDefaultExports: true });
}

function ArrowFunctionExpression(node, parent) {
  // export default (function () {});
  if (t.isExportDeclaration(parent)) {
    return true;
  }

  if (t.isBinaryExpression(parent) || t.isLogicalExpression(parent)) {
    return true;
  }

  if (t.isUnaryExpression(parent)) {
    return true;
  }

  return UnaryLike(node, parent);
}

function ConditionalExpression(node, parent) {
  if (t.isUnaryLike(parent)) {
    return true;
  }

  if (t.isBinary(parent)) {
    return true;
  }

  if (t.isConditionalExpression(parent, { test: node })) {
    return true;
  }

  return UnaryLike(node, parent);
}

function AssignmentExpression(node) {
  if (t.isObjectPattern(node.left)) {
    return true;
  } else {
    return ConditionalExpression.apply(undefined, arguments);
  }
}

// Walk up the print stack to deterimine if our node can come first
// in statement.
function isFirstInStatement(printStack) {
  var _ref = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var considerArrow = !!_ref.considerArrow;
  var considerDefaultExports = !!_ref.considerDefaultExports;

  var i = printStack.length - 1;
  var node = printStack[i];
  i--;
  var parent = printStack[i];
  while (i > 0) {
    if (t.isExpressionStatement(parent, { expression: node })) {
      return true;
    }

    if (considerDefaultExports && t.isExportDefaultDeclaration(parent, { declaration: node })) {
      return true;
    }

    if (considerArrow && t.isArrowFunctionExpression(parent, { body: node })) {
      return true;
    }

    if (t.isCallExpression(parent, { callee: node }) || t.isSequenceExpression(parent) && parent.expressions[0] === node || t.isMemberExpression(parent, { object: node }) || t.isConditional(parent, { test: node }) || t.isBinary(parent, { left: node }) || t.isAssignmentExpression(parent, { left: node })) {
      node = parent;
      i--;
      parent = printStack[i];
    } else {
      return false;
    }
  }

  return false;
}