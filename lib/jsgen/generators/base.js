"use strict";

module.exports = {
  File: File,
  Program: Program,
  BlockStatement: BlockStatement,
  Noop: Noop,
  Directive: Directive,
  DirectiveLiteral: DirectiveLiteral
};

function File(node) {
  this.print(node.program, node);
}

function Program(node) {
  this.printInnerComments(node, false);

  if (node.directives && node.directives.length) {
    this.printSequence(node.directives, node);
    this.newline();
  }

  this.printSequence(node.body, node);
}

function BlockStatement(node, parent) {

  if (!this.format.bsd && this.IsControlFlowStatement(parent)) {
    this.newline();
  }

  this.push("{");
  this.printInnerComments(node);
  if (node.body.length) {
    this.newline();

    if (node.directives && node.directives.length) {
      this.printSequence(node.directives, node, { indent: true });
      this.newline();
    }      

    this.printSequence(node.body, node, { indent: true });
    if (!this.format.retainLines && !this.format.concise) this.removeLast("\n");
    this.rightBrace();
    if (!this.format.bsd && parent.type == "IfStatement" && parent.alternate) {
      this.newline();
    }
  } else {
    this.push("}");
  }
}

function Noop() {}

function Directive(node) {
  this.print(node.value, node);
  this.semicolon();
}

function DirectiveLiteral(node) {
  this.push(this._stringLiteral(node.value));
}
