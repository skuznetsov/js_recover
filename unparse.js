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
        let printMethod = this[this.type];
        if (printMethod) {
            res += printMethod.call(this);
        } else {
            res += `MISSED (even in methods) <[ ${JSON.stringify(this, null, '\t')} ]>\n`;
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

function VariableDeclaration() {
    let res = "";
    res += this.kind + " ";
    _.each(this.declarations, (node, idx) => {
        res += node;
        res += (idx < this.declarations.length - 1) ? ", " : "";
    });
    
    return res;
}

function VariableDeclarator() {
    let res = "";
    res += this.id.toString();
    
    if (this.init) {
        res += " = " + this.init;
    }
    
    return res;
}

function Identifier() {
    let name = this.name;
    if (smc) {
        let origLoc = smc.originalPositionFor({line: this.loc.start.line, column: this.loc.start.column});
        if (origLoc && origLoc.name) {
            name = origLoc.name;
        }
    }
    return name;
}

function CallExpression() {
    return RenderCallExpression(this);
}

function NumericLiteral() {
    return StringLiteral();
}

function StringLiteral() {
    return this.extra.raw;
}

function ExpressionStatement() {
    return this.expression;
}

function SequenceExpression() {
    let res = "";

    if (this.expressions && this.expressions.length > 0) {
        _.each(this.expressions, (expr, idx) => {
            res += expr;
            if (idx < this.expressions.length - 1) {
                res += ", ";
            }
        });
    }
    
    return res;
}

function MemberExpression() {
    let res = "";
    res += this.object;

    if (this.computed) {
        res += "[" + this.property + "]";
    } else {
        res += "." + this.property;
    }
    
    return res;
}

function ObjectExpression() {
    return ObjectPattern();
}

function ObjectPattern() {
    let res = "";

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
    
    return res;
}

function ObjectProperty() {
    let id = this.key;  

    if (this.computed) {
        id = `[${id}]`;
    }
    return id + ": " + this.value;
}
                
function NewExpression() {
    return "new " + RenderCallExpression(this); 
}

function ArrayExpression() {
    return ArrayPattern();
}

function ArrayPattern() {
    let res = "";

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

    return res;
}

function ForStatement() {
    let res = "";

    res += prependNewLineIfNeeded();
    res += "for (" + (this.init ? this.init : "") + "; " +
                    (this.test ? this.test : "") + "; " +
                    (this.update ? this.update : "") +
            ") ";
    res += spacesIfNeeded(this.body);
    
    return res;
}

function BinaryExpression() {
    return LogicalExpression();
}

function LogicalExpression() {
    return this.left + " " + this.operator + " " + this.right;
}

function UpdateExpression() {
    let needBracketsForUpdate = !!(this.extra && this.extra.parenthesizedArgument);
    if (this.prefix) {
        return (needBracketsForUpdate ? "(" : "") + this.operator + this.argument + (needBracketsForUpdate ? ")" : "");
    } else {
        return (needBracketsForUpdate ? "(" : "") + this.argument + this.operator + (needBracketsForUpdate ? ")" : "");
    }
}

function File() {
    return this.program;
}

function Program() {
    return BlockStatement();   
}

function ClassBody() {
    return BlockStatement();
}

function BlockStatement() {
    let res = "";

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

    return res;
}

function IfStatement() {
    let res = "";

    res += prependNewLineIfNeeded();
    res += "if (" + this.test + ")" + spacesIfNeeded(this.consequent);
    if (this.alternate) {
        res += spaces() + (this.consequent.type == "BlockStatement" ? " " : "") +
                "else " + spacesIfNeeded(this.alternate);
    }
    
    return res;
}

function FunctionExpression() {
    return FunctionDeclaration();
}

function FunctionDeclaration() {
    let res = "";

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

    return res;
}

function AssignmentPattern() {
    return AssignmentExpression();
}

function AssignmentExpression() {
    return `${this.left} ${this.operator || "="} ${this.right}`;
}

function NullLiteral() {
    return "null";
}

function Directive() {
    return this.value + ";";
}

function DirectiveLiteral() {
    return this.extra.raw;
}

function ReturnStatement() {
    return "return " + (this.argument ? this.argument : "");
}

function UnaryExpression() {
    let needBrackets = !!(this.extra && this.extra.parenthesizedArgument && !(this.argument.extra && this.argument.extra.parenthesized));
    if (this.prefix) {
        return this.operator + (this.operator.length > 1 ? " " : "") + (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "");
    } else {
        return (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "") + this.operator;
    }
}

function ConditionalExpression() {
    return this.test + " ? " + this.consequent + " : " + this.alternate;
}

function ThisExpression() {
    return "this";
}

function RegExpLiteral() {
    return this.extra.raw;
}

function SwitchCase() {
    let res = "";

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
    
    return res;
}
                
function SwitchStatement() {
    let res = "";

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
    
    return res;
}

function BreakStatement() {
    return `break  ${this.label || ""}`;
}

function ContinueStatement() {
    return `continue ${this.label || ""}`;
}

function ThrowStatement() {
    return "throw " + this.argument;
}

function TryStatement() {
    let res = "";

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

    return res;
}

function CatchClause() {
    return "catch (" + this.param + ") " + spacesIfNeeded(this.body);
}

function ArrowFunctionExpression() {
    let res = "";

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
    
    return res;
}

function BooleanLiteral() {
    return this.value ? "true" : "false";
}

function TemplateLiteral() {
    let res = "";

    res += "`";
    _.each(this.quasis, (node, idx) =>{
        res += node;
        if (!node.tail) {
            res += "${" + this.expressions[idx] + "}";
        } 
    });
    res += "`";

    return res;
}

function TemplateElement() {
    return this.value.raw;
}

function ForInStatement() {
    let res = prependNewLineIfNeeded();
    res += `for (${this.left} in ${this.right}) ${spacesIfNeeded(this.body)}`;
    
    return res;
}

function WhileStatement() {
    let res = prependNewLineIfNeeded();
    res += `while (${this.test})\n${spacesIfNeeded(this.body)}`;
    
    return res;
}

function EmptyStatement() {
    // TODO: Check if correct
    return "<<<[[[;]]]>>>";
}
                
function ExportDefaultDeclaration() {
    let res = prependNewLineIfNeeded();
    res += `export default ${this.declaration}`;
    
    return res;
}

function ClassExpression() {
    return ClassDeclaration();
}

function ClassDeclaration() {
    return `class ${this.id || ""} ${this.superClass ? " extends " + this.superClass : ""} ${this.body}`;
}
               
function ClassMethod() {
    let res = prependNewLineIfNeeded();
    let id = this.id || this.key;
    res += spaces() + (id ? id + " " : "") + "(";
    if (this.params.length > 0) {
        _.each(this.params, (arg, idx) => {
            res += arg + (idx < this.params.length - 1 ? ", " : "");
        });
    }
    res += ") " + spacesIfNeeded(this.body);
    res += "\n";
    
    return res;
}

function DebuggerStatement() {
    return "debugger";
}   

function DoWhileStatement() {
    return `do ${this.body} while (${this.test})`;
}

function LabeledStatement() {
    return `${this.label}: ${this.body}`;
}

                
function WithStatement() {
    return `with (${this.object}) ${this.body}`;
}

function ObjectMethod() {
    let res = prependNewLineIfNeeded();
    let methodId = this.id || this.key;
    res += this.kind + " " + (methodId ? methodId + " " : "") + "(";
    if (this.params.length > 0) {
        _.each(this.params, (arg, idx) => {
            res += arg + (idx < this.params.length - 1 ? ", " : "");
        });
    }
    res += ") " + spacesIfNeeded(this.body);
    res += "\n";
    
    return res;
}
                
function RestElement() {
    return `...${this.argument}`;
}
                
function ExportAllDeclaration() {
    return `export * from ${this.source}`;
}

 function BindExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TaggedTemplateExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DoExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function MetaProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function Super() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function RestProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function SpreadProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function AwaitExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function YieldExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function Decorator() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ForOfStatement() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ClassProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExportNamespaceSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExportDefaultSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExportNamespaceSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExportNamedDeclaration() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExportSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ImportDeclaration() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ImportNamespaceSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ImportSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ImportDefaultSpecifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DeclareClass() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function FunctionTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DeclareFunction() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DeclareModule() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DeclareTypeAlias() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function DeclareInterface() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function InterfaceExtends() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function InterfaceDeclaration() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeAlias() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeParameterDeclaration() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ExistentialTypeParam() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeParameterInstantiation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ObjectTypeIndexer() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ObjectTypeProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ObjectTypeCallProperty() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ObjectTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function QualifiedTypeIdentifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function GenericTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeofTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TupleTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function FunctionTypeParam() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function AnyTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function VoidTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function BooleanTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function MixedTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function NumberTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function StringTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function FunctionTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function StringLiteralTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function BooleanLiteralTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function NumericLiteralTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function NullLiteralTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ThisTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ArrayTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function NullableTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function IntersectionTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function UnionTypeAnnotation() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeCastExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function TypeCastExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function ClassImplements() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXIdentifier() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXNamespacedName() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXMemberExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXEmptyExpression() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXExpressionContainer() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXSpreadAttribute() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXAttribute() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXOpeningElement() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXClosingElement() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 function JSXElement() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
