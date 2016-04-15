"use strict";

const _ = require('lodash');

const nodesHierarchy = [];
const spacesPerLevel = 4;
let level = 0;

Array.prototype.lastNth = function (n) {
    return this[this.length - ((n||0)+1)];
};

Array.prototype.has = function (id) {
    return this.indexOf(id) >= 0;
};


function spaces(_level) {
    let res = "";
    _level = _level || level; 
    for (let idx = 0; idx < level * spacesPerLevel; idx++) {
        res += " ";
    }
    
    return res;
}

module.exports.setupNodePrototype = (ast, smc) => {
    ast.__proto__.toString = function () {
        nodesHierarchy.push(this);
        let res = "";
        if (this == null) {
            return "";
        }
        let wrapInParenthesis = !!(this.extra && this.extra.parenthesized);

        if (this.leadingComments && this.leadingComments.length > 0) {
            _.each(this.leadingComments, comment => {
                if (comment.type == "CommentLine") {
                    res += spaces() + `//${comment.value}\n`;
                } else {
                    let commentBlock = comment.value.replace(/\n/, "\n" + spaces());
                    res += spaces() + `/*${commentBlock}*/\n`;
                }
            });
        }
        
        if (wrapInParenthesis) {
            res += "(";
        }
        switch (this.type) {
            case "VariableDeclaration":
                res += this.kind + " ";
                _.each(this.declarations, (node, idx) => {
                    res += node;
                    res += (idx < this.declarations.length - 1) ? ", " : "";
                });
                break;
            case "VariableDeclarator":
                res += this.id.toString();
                if (this.init) {
                    res += " = " + this.init;
                }
                break;
            case "Identifier":
                let name = this.name;
                if (smc) {
                    let origLoc = smc.originalPositionFor({line: this.loc.start.line, column: this.loc.start.column});
                    if (origLoc && origLoc.name) {
                        name = origLoc.name;
                    }
                }
                res += name;
                break;
            case "CallExpression":
                res += RenderCallExpression(this);
                break;
            case "NumericLiteral":
            case "StringLiteral":
                res += this.extra.raw;
                break;
            case "ExpressionStatement":
                res += this.expression;
                break;
            case "SequenceExpression":
                if (this.expressions && this.expressions.length > 0) {
                    _.each(this.expressions, (expr, idx) => {
                        res += expr;
                        if (idx < this.expressions.length - 1) {
                            res += ", ";
                        }
                    });
                }
                break;
            case "MemberExpression":
                res += this.object;
                if (this.computed) {
                    res += "[" + this.property + "]";
                } else {
                    res += "." + this.property;
                }
                break;
            case "ObjectExpression":
                res += "{";
                if (this.properties.length == 1) {
                    res += this.properties[0];
                } else if (this.properties.length > 1) {
                    level++;
                    res += "\n";
                    _.each(this.properties, (arg, idx) => {
                        res += spaces() + arg + (idx < this.properties.length - 1 ? ", " : "") + "\n";
                    });
                    level--;
                    res += spaces();
                }
                res += "}";
                break;
            case "ObjectProperty":
                res += this.key + ": " + this.value;
                break;
            case "NewExpression":
                res += "new " + RenderCallExpression(this); 
                break;
            case "ArrayExpression":
                res += "[";
                if (this.elements.length == 1) {
                    res += this.elements[0];
                } else if (this.elements.length > 1) {
                    level++;
                    res += "\n";
                    _.each(this.elements, (arg, idx) => {
                        res += spaces() + arg + (idx < this.elements.length - 1 ? ", " : "") + "\n";
                    });
                    level--;
                    res += spaces();
                }
                res += "]";
                break;
            case "ForStatement":
                res += prependNewLineIfNeeded();
                res += "for (" + (this.init ? this.init : "") + "; " +
                                (this.test ? this.test : "") + "; " +
                                (this.update ? this.update : "") +
                    ") ";
                    res += spacesIfNeeded(this.body);
                break;
            case "BinaryExpression":
            case "LogicalExpression":
                res += this.left + " " + this.operator + " " + this.right;
                break;
            case "UpdateExpression":
                let needBracketsForUpdate = !!(this.extra && this.extra.parenthesizedArgument);
                if (this.prefix) {
                    res += (needBracketsForUpdate ? "(" : "") + this.operator + this.argument + (needBracketsForUpdate ? ")" : "");
                } else {
                    res += (needBracketsForUpdate ? "(" : "") + this.argument + this.operator + (needBracketsForUpdate ? ")" : "");
                }
                break;
            case "File":
                res += this.program;
                break;
            case "Program":
            case "BlockStatement":
            case "ClassBody":
                if (this.type != "Program") {
                    res += "{\n";
                    level++;
                }
                if (this.type != "ClassBody" && this.directives.length > 0) {
                    _.each(this.directives, arg => {
                        res += spaces() + arg + "\n";
                    });
                }
                if (this.body && this.body.length > 0) {
                    _.each(this.body, stmt => {
                        res += spaces() + stmt + shouldAddSemicolon(stmt) + "\n";
                    });
                }
                if (this.type != "Program") {
                    level--;
                    res += spaces() + "}";
                }
                break;
            case "IfStatement":
                res += prependNewLineIfNeeded();
                res += "if (" + this.test + ")" + spacesIfNeeded(this.consequent);
                if (this.alternate) {
                    res += spaces() + (this.consequent.type == "BlockStatement" ? " " : "") +
                           "else " + spacesIfNeeded(this.alternate);
                }
                break;
            case "FunctionDeclaration":
            case "FunctionExpression":
                if (this.type == "FunctionDeclaration") {
                    res += prependNewLineIfNeeded();
                }
                res += "function " + (this.id ? this.id + " " : "") + "(";
                if (this.params.length > 0) {
                    _.each(this.params, (arg, idx) => {
                        res += arg + (idx < this.params.length - 1 ? ", " : "");
                    });
                }
                res += ") " + spacesIfNeeded(this.body);
                if (this.type == "FunctionDeclaration") {
                    res += "\n";
                }
                break;
            case "AssignmentExpression":
                res += `${this.left} ${this.operator} ${this.right}`;
                break;
            case "NullLiteral":
                res += "null";
                break;
            case "Directive":
                res += this.value + ";";
                break;
            case "DirectiveLiteral":
                res += this.extra.raw;
                break;
            case "ReturnStatement":
                res += "return " + (this.argument ? this.argument : "");
                break;
            case "UnaryExpression":
                let needBrackets = !!(this.extra && this.extra.parenthesizedArgument && !(this.argument.extra && this.argument.extra.parenthesized));
                if (this.prefix) {
                    res += this.operator + (this.operator.length > 1 ? " " : "") + (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "");
                } else {
                    res += (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "") + this.operator;
                }
                break;
            case "ConditionalExpression":
                res += this.test + " ? " + this.consequent + " : " + this.alternate;
                break;
            case "ThisExpression":
                res += "this";
                break;
            case "RegExpLiteral":
                res += this.extra.raw;
                break;
            case "SwitchCase":
                if (this.test) {
                    res += spaces() + "case " + this.test + ":\n";
                } else {
                    res += spaces() + "default:\n";
                }
                if (this.consequent && this.consequent.length > 0) {
                    level++;
                    _.each(this.consequent, node => {
                        res += spaces() + node + ";\n";
                    });
                    level--;
                }
                break;
            case "SwitchStatement":
                res += prependNewLineIfNeeded();
                res += "switch (" + this.discriminant + ") {\n";
                if (this.cases && this.cases.length > 0) {
                    level++;
                    _.each(this.cases, caseNode => {
                        res += spaces() + caseNode + "\n";
                    });
                    level--;
                }
                res += spaces() + "}";
                break;
            case "BreakStatement":
                res += `break  ${this.label || ""}`;
                break;
            case "ContinueStatement":
                res += `continue ${this.label || ""}`;
                break;
            case "ThrowStatement":
                res += "throw " + this.argument;
                break;
            case "TryStatement":
                res += "try " + this.block;
                if (this.handler) {
                    res += this.handler;
                }
                if (this.guardedHandlers && this.guardedHandlers.length > 0) {
                    _.each(this.guardedHandlers, node => {
                    res += node; 
                    });
                }
                if (this.finally) {
                    res += this.finally;
                }
                break;
            case "CatchClause":
                res += "catch (" + this.param + ") " + spacesIfNeeded(this.body);
                break;
            case "ArrowFunctionExpression":
                let needFunctionBrackets = false;
                if (this.id) {
                    needFunctionBrackets = true;
                    res += this.id + " ";
                }
                if (!this.params || this.params.length == 0 || this.params.length > 1) {
                    needFunctionBrackets = true;
                }
                if (needFunctionBrackets) { 
                    res += "(";
                }
                if (this.params && this.params.length > 0) {
                    _.each(this.params, (arg, idx) => {
                        res += arg + (idx < this.params.length - 1 ? ", " : "");
                    });
                }
                if (needBrackets) {
                    res += ")";
                } 
                res += " => " + spacesIfNeeded(this.body);
                break;
            case "BooleanLiteral":
                res += this.value ? "true" : "false";
                break;
            case "TemplateLiteral":
                res += "`";
                _.each(this.quasis, (node, idx) =>{
                    res += node;
                    if (!node.tail) {
                        res += "${" + this.expressions[idx] + "}";
                    } 
                });
                res += "`";
                break;
            case "TemplateElement":
                res += this.value.raw;
                break;
            case "ForInStatement":
                res += prependNewLineIfNeeded();
                res += `for (${this.left} in ${this.right}) ${spacesIfNeeded(this.body)}`;
                break;
            case "WhileStatement":
                res += prependNewLineIfNeeded();
                res += `while (${this.test})\n${spacesIfNeeded(this.body)}`;
                break;
            case "EmptyStatement":
                break;
                
            case "ExportDefaultDeclaration":
                res += prependNewLineIfNeeded();
                res += `export default ${this.declaration}`;
                break;

            case "ClassDeclaration":
                res += `class ${this.id || ""} ${this.superclass ? " : " + this.superclass : ""} ${this.body}`;
                break;
                
            case "ClassMethod":
                res += prependNewLineIfNeeded();
                let id = this.id || this.key;
                res += spaces() + (id ? id + " " : "") + "(";
                if (this.params.length > 0) {
                    _.each(this.params, (arg, idx) => {
                        res += arg + (idx < this.params.length - 1 ? ", " : "");
                    });
                }
                res += ") " + spacesIfNeeded(this.body);
                res += "\n";
                break;
                
            case "DebuggerStatement":
                res += "debugger";
                break;
                
            case "DoWhileStatement":
                res += `do ${this.body} while (${this.test})`;
                break;
                
            case "LabeledStatement":
                res += `${this.label}: ${this.body}`;
                break;
                
            case "WithStatement":
                res += `with (${this.object}) ${this.body}`;
                break;

            case "ObjectMethod":
                res += prependNewLineIfNeeded();
                let methodId = this.id || this.key;
                res += spaces() + this.kind + " " + (methodId ? methodId + " " : "") + "(";
                if (this.params.length > 0) {
                    _.each(this.params, (arg, idx) => {
                        res += arg + (idx < this.params.length - 1 ? ", " : "");
                    });
                }
                res += ") " + spacesIfNeeded(this.body);
                res += "\n";
                break;

            // ObjectPattern
            // ArrayPattern
            // BindExpression
            // TaggedTemplateExpression
            // DoExpression
            // MetaProperty
            // Super
            // RestProperty
            // SpreadProperty
            // AwaitExpression
            // YieldExpression
            // ArrayPattern
            // AssignmentPattern
            // Decorator
            // ForOfStatement
            // ClassExpression
            // ClassProperty
            // ExportNamespaceSpecifier
            // ExportAllDeclaration
            // ExportDefaultSpecifier
            // ExportNamespaceSpecifier
            // ExportNamedDeclaration
            // ExportSpecifier
            // ImportDeclaration
            // ImportNamespaceSpecifier
            // ImportSpecifier
            // ImportDefaultSpecifier
            // DeclareClass
            // FunctionTypeAnnotation
            // TypeAnnotation
            // DeclareFunction
            // DeclareModule
            // DeclareTypeAlias
            // DeclareInterface
            // InterfaceExtends
            // InterfaceDeclaration
            // TypeAlias
            // TypeParameterDeclaration
            // ExistentialTypeParam
            // TypeParameterInstantiation
            // ObjectTypeIndexer
            // ObjectTypeProperty
            // ObjectTypeCallProperty
            // ObjectTypeAnnotation
            // QualifiedTypeIdentifier
            // GenericTypeAnnotation
            // TypeofTypeAnnotation
            // TupleTypeAnnotation
            // FunctionTypeParam
            // AnyTypeAnnotation
            // VoidTypeAnnotation
            // BooleanTypeAnnotation
            // MixedTypeAnnotation
            // NumberTypeAnnotation
            // StringTypeAnnotation
            // FunctionTypeAnnotation
            // StringLiteralTypeAnnotation
            // BooleanLiteralTypeAnnotation
            // NumericLiteralTypeAnnotation
            // NullLiteralTypeAnnotation
            // ThisTypeAnnotation
            // ArrayTypeAnnotation
            // NullableTypeAnnotation
            // IntersectionTypeAnnotation
            // UnionTypeAnnotation
            // TypeCastExpression
            // TypeCastExpression
            // ClassImplements
            // JSXIdentifier
            // JSXNamespacedName
            // JSXMemberExpression
            // JSXEmptyExpression
            // JSXExpressionContainer
            // JSXSpreadAttribute
            // JSXAttribute
            // JSXOpeningElement
            // JSXClosingElement
            // JSXElement
            default:
                res += `MISSED <[ '${this.type}' ]>\n`;
                break;
        }
        if (wrapInParenthesis) {
            res += ")";
        }

        if (this.trailingComments && this.trailingComments.length > 0) {
            res += "\n";
            _.each(this.trailingComments, comment => {
                if (comment.type == "CommentLine") {
                    res += spaces() + `//${comment.value}\n`;
                } else {
                    let commentBlock = comment.value.replace(/\n/, "\n" + spaces());
                    res += spaces() + `/*${commentBlock}*/\n`;
                }
            });
        }

        nodesHierarchy.pop();        
        return res;
    }
};


function RenderCallExpression(node) {
    let res = "";
    if (node.static) {
        res += "static ";
    }
    res += (node.callee ||  "").toString() + " (";
    if ((node.arguments ||  []).length > 0) {
        _.each((node.arguments || []), (arg, idx) => {
            res += arg.toString() + (idx < (node.arguments || []).length - 1 ? ", " : "");
        });
    }
    res += ")";
    return res;
}

function shouldAddSemicolon(node) {
    if (["ForStatement", "IfStatement", "FunctionDeclaration",
         "WhileStatement", "DoWhileStatement", "ForInStatement"
        ].has(node.type) || (node.trailingComments || []).length > 0) {
        return "";
    }
            
    return ";";
}

function spacesIfNeeded(node) {
    let res;
    if (node.type == "BlockStatement") {
        res = "\n" + spaces() + node;
    } else {
        level++;
        res = "\n" + spaces() + node + shouldAddSemicolon(node) + "\n";
        level--;
    }
    return res;
}

function prependNewLineIfNeeded() {
    let res = "";
    let parent = nodesHierarchy.lastNth(1);
    let child = nodesHierarchy.lastNth();
    
    if (["BlockStatement", "Program"].has(parent.type) && parent.body.indexOf(child) > 0) {
        res += "\n" + spaces();
    }

    return res;
}
