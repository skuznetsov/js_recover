"use strict";

const _ = require('lodash');

const nodesHierarchy = [];
const spacesPerLevel = 2;
let level = 0;
let _smc;

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
    _smc = smc;
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
        let printMethod = module.exports[this.type];
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

module.exports.VariableDeclaration = function() {
    let res = "";
    res += this.kind + " ";
    _.each(this.declarations, (node, idx) => {
        res += node;
        res += (idx < this.declarations.length - 1) ? ", " : "";
    });
    
    return res;
}

module.exports.VariableDeclarator = function() {
    let res = "";
    res += this.id.toString();
    
    if (this.init) {
        res += " = " + this.init;
    }
    
    return res;
}

module.exports.Identifier = function() {
    let name = this.name;
    if (_smc) {
        let origLoc = _smc.originalPositionFor({line: this.loc.start.line, column: this.loc.start.column});
        if (origLoc && origLoc.name) {
            name = origLoc.name;
        }
    }
    return name;
}

module.exports.CallExpression = function() {
    return RenderCallExpression(this);
}

module.exports.NumericLiteral = function() {
    return module.exports.StringLiteral.call(this);
}

module.exports.StringLiteral = function() {
    return this.extra.raw;
}

module.exports.ExpressionStatement = function() {
    return this.expression;
}

module.exports.SequenceExpression = function() {
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

module.exports.MemberExpression = function() {
    let res = "";
    res += this.object;

    if (this.computed) {
        res += "[" + this.property + "]";
    } else {
        res += "." + this.property;
    }
    
    return res;
}

module.exports.ObjectExpression = function() {
    return module.exports.ObjectPattern.call(this);
}

module.exports.ObjectPattern = function() {
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

module.exports.ObjectProperty = function() {
    let id = this.key;  

    if (this.computed) {
        id = `[${id}]`;
    }
    return id + ": " + this.value;
}
                
module.exports.NewExpression = function() {
    return "new " + RenderCallExpression(this); 
}

module.exports.ArrayExpression = function() {
    return module.exports.ArrayPattern.call(this);
}

module.exports.ArrayPattern = function() {
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

module.exports.ForStatement = function() {
    let res = "";

    res += prependNewLineIfNeeded();
    res += "for (" + (this.init ? this.init : "") + "; " +
                    (this.test ? this.test : "") + "; " +
                    (this.update ? this.update : "") +
            ") ";
    res += spacesIfNeeded(this.body);
    
    return res;
}

module.exports.BinaryExpression = function() {
    return module.exports.LogicalExpression.call(this);
}

module.exports.LogicalExpression = function() {
    return this.left + " " + this.operator + " " + this.right;
}

module.exports.UpdateExpression = function() {
    let needBracketsForUpdate = !!(this.extra && this.extra.parenthesizedArgument);
    if (this.prefix) {
        return (needBracketsForUpdate ? "(" : "") + this.operator + this.argument + (needBracketsForUpdate ? ")" : "");
    } else {
        return (needBracketsForUpdate ? "(" : "") + this.argument + this.operator + (needBracketsForUpdate ? ")" : "");
    }
}

module.exports.File = function() {
    return this.program;
}

module.exports.Program = function() {
    return module.exports.BlockStatement.call(this);   
}

module.exports.ClassBody = function() {
    return module.exports.BlockStatement.call(this);
}

module.exports.BlockStatement = function() {
    let res = "";

    if (this.type != "Program") {
        res += "{\n";
        level++;
    }
    if (this.type != "ClassBody" && this.directives && this.directives.length > 0) {
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

module.exports.IfStatement = function() {
    let res = "";

    res += prependNewLineIfNeeded();
    res += "if (" + this.test + ")" + spacesIfNeeded(this.consequent);
    if (this.alternate) {
        res += spaces() + (this.consequent.type == "BlockStatement" ? " " : "") +
                "else " + spacesIfNeeded(this.alternate);
    }
    
    return res;
}

module.exports.FunctionExpression = function() {
    return module.exports.FunctionDeclaration.call(this);
}

module.exports.FunctionDeclaration = function() {
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

module.exports.AssignmentPattern = function() {
    return module.exports.AssignmentExpression.call(this);
}

module.exports.AssignmentExpression = function() {
    return `${this.left} ${this.operator || "="} ${this.right}`;
}

module.exports.NullLiteral = function() {
    return "null";
}

module.exports.Directive = function() {
    return this.value + ";";
}

module.exports.DirectiveLiteral = function() {
    return this.extra.raw;
}

module.exports.ReturnStatement = function() {
    return "return " + (this.argument ? this.argument : "");
}

module.exports.UnaryExpression = function() {
    let needBrackets = !!(this.extra && this.extra.parenthesizedArgument && !(this.argument.extra && this.argument.extra.parenthesized));
    if (this.prefix) {
        return this.operator + (this.operator.length > 1 ? " " : "") + (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "");
    } else {
        return (needBrackets ? "(" : "") + this.argument  + (needBrackets ? ")" : "") + this.operator;
    }
}

module.exports.ConditionalExpression = function() {
    return this.test + " ? " + this.consequent + " : " + this.alternate;
}

module.exports.ThisExpression = function() {
    return "this";
}

module.exports.RegExpLiteral = function() {
    return this.extra.raw;
}

module.exports.SwitchCase = function() {
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
                
module.exports.SwitchStatement = function() {
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

module.exports.BreakStatement = function() {
    return `break  ${this.label || ""}`;
}

module.exports.ContinueStatement = function() {
    return `continue ${this.label || ""}`;
}

module.exports.ThrowStatement = function() {
    return "throw " + this.argument;
}

module.exports.TryStatement = function() {
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

module.exports.CatchClause = function() {
    return "catch (" + this.param + ") " + spacesIfNeeded(this.body);
}

module.exports.ArrowFunctionExpression = function() {
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

    if (needFunctionBrackets) {
        res += ")";
    } 
    res += " => " + spacesIfNeeded(this.body);
    
    return res;
}

module.exports.BooleanLiteral = function() {
    return this.value ? "true" : "false";
}

module.exports.TemplateLiteral = function() {
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

module.exports.TemplateElement = function() {
    return this.value.raw;
}

module.exports.ForInStatement = function() {
    let res = prependNewLineIfNeeded();
    res += `for (${this.left} in ${this.right}) ${spacesIfNeeded(this.body)}`;
    
    return res;
}

module.exports.WhileStatement = function() {
    let res = prependNewLineIfNeeded();
    res += `while (${this.test})\n${spacesIfNeeded(this.body)}`;
    
    return res;
}

module.exports.EmptyStatement = function() {
    // TODO: Check if correct
    return "<<<[[[;]]]>>>";
}
                
module.exports.ExportDefaultDeclaration = function() {
    let res = prependNewLineIfNeeded();
    res += `export default ${this.declaration}`;
    
    return res;
}

module.exports.ClassExpression = function() {
    return module.exports.ClassDeclaration.call(this);
}

module.exports.ClassDeclaration = function() {
    return `class ${this.id || ""} ${this.superClass ? " extends " + this.superClass : ""} ${this.body}`;
}
               
module.exports.ClassMethod = function() {
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

module.exports.DebuggerStatement = function() {
    return "debugger";
}   

module.exports.DoWhileStatement = function() {
    return `do ${this.body} while (${this.test})`;
}

module.exports.LabeledStatement = function() {
    return `${this.label}: ${this.body}`;
}

                
module.exports.WithStatement = function() {
    return `with (${this.object}) ${this.body}`;
}

module.exports.ObjectMethod = function() {
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
                
module.exports.RestElement = function() {
    return `...${this.argument}`;
}
                
module.exports.ExportAllDeclaration = function() {
    return `export * from ${this.source}`;
}

 module.exports.BindExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TaggedTemplateExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DoExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.MetaProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.Super = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.RestProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.SpreadProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.AwaitExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.YieldExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.Decorator = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ForOfStatement = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ClassProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExportNamespaceSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExportDefaultSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExportNamespaceSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExportNamedDeclaration = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExportSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ImportDeclaration = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ImportNamespaceSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ImportSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ImportDefaultSpecifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DeclareClass = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.FunctionTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DeclareFunction = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DeclareModule = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DeclareTypeAlias = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.DeclareInterface = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.InterfaceExtends = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.InterfaceDeclaration = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeAlias = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeParameterDeclaration = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ExistentialTypeParam = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeParameterInstantiation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ObjectTypeIndexer = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ObjectTypeProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ObjectTypeCallProperty = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ObjectTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.QualifiedTypeIdentifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.GenericTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeofTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TupleTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.FunctionTypeParam = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.AnyTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.VoidTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.BooleanTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.MixedTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.NumberTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.StringTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.FunctionTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.StringLiteralTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.BooleanLiteralTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.NumericLiteralTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.NullLiteralTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ThisTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ArrayTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.NullableTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.IntersectionTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.UnionTypeAnnotation = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeCastExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.TypeCastExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.ClassImplements = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXIdentifier = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXNamespacedName = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXMemberExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXEmptyExpression = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXExpressionContainer = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXSpreadAttribute = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXAttribute = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXOpeningElement = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXClosingElement = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
 module.exports.JSXElement = function() {
     return `<<<[[[ MISSED: ${JSON.stringify(this, null, '\t')} ]]]>>> `;
 }
 
