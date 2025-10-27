# AST Traversal Strategy Guide

## Top-Down vs Bottom-Up: Decision Matrix

### **Use TOP-DOWN when:**

1. **Building Context** (Scopes, Symbol Tables)
   ```javascript
   // MUST be top-down: parent scope before child scope
   function createScopes(node) {
       // Need parent scope to exist first
       let parentScope = findScope(node.parent);
       let childScope = new Scope(node, parentScope);
   }
   ```

2. **Propagating Information Downward**
   ```javascript
   // Pass information from root to leaves
   function markDeprecated(node, isDeprecatedContext) {
       if (node.type === 'DeprecatedAPI') {
           isDeprecatedContext = true;
       }
       // Children inherit context
       traverseChildren(node, isDeprecatedContext);
   }
   ```

3. **Early Exit Optimization**
   ```javascript
   // Skip entire subtrees
   if (node.type === 'CommentNode') {
       return; // Don't traverse children
   }
   ```

4. **Readonly Analysis** (no mutations)
   ```javascript
   // Just collecting data, not changing AST
   function countNodes(node) {
       count++;
       traverseChildren(node);
   }
   ```

---

### **Use BOTTOM-UP when:**

1. **Replacing Nodes** (CRITICAL!)
   ```javascript
   // MUST be bottom-up: children simplified before parent
   function simplifyExpression(node) {
       // Children already simplified
       if (node.type === 'BinaryExpression' &&
           node.left.type === 'NumericLiteral' &&
           node.right.type === 'NumericLiteral') {
           // Safe to replace because children are final form
           return computeConstant(node);
       }
   }
   ```

2. **Aggregating Information Upward**
   ```javascript
   // Compute properties from children
   function calculateComplexity(node) {
       let childComplexity = sumChildComplexity(node);
       return childComplexity + getNodeComplexity(node);
   }
   ```

3. **Dependency on Child Results**
   ```javascript
   // Parent decision depends on children's state
   function removeEmptyBlocks(node) {
       // Children already processed
       if (node.type === 'BlockStatement' &&
           node.body.length === 0) {
           removeNode(node);
       }
   }
   ```

4. **Iterative Simplification**
   ```javascript
   // Multiple passes until convergence
   while (hasChanges) {
       hasChanges = traverseBottomUp(ast, simplify);
   }
   ```

---

## **Current Usage in js_recover**

### Phase 1: TOP-DOWN (Analysis)
```javascript
// app.js:135-145
traverseTopDown(ast, [
    createScopes,           // Build scope hierarchy
    defineFunctions,        // Register functions in scopes
    assignValuesToVariables // Track variable assignments
]);
```

**Why top-down?**
- Scopes must be created parent-first
- Functions registered in parent scope
- Variable tracking needs scope context

### Phase 2: TOP-DOWN (Recognition)
```javascript
// app.js:148-157
traverseTopDown(ast, [
    countFunctionInvocations, // Count usage
    recoverBooleans           // !0 -> true, !1 -> false
]);
```

**Why top-down?**
- Simple pattern matching (no mutations)
- Boolean recovery replaces leaves (safe in top-down)

### Phase 3: BOTTOM-UP (Transformation)
```javascript
// app.js:169-185
while (trial < MAX_ITERATIONS) {
    changedInThisIteration = traverseBottomUp(
        ast,
        fixControlFlowStatementsWithOneStatement
    ) || changedInThisIteration;

    changedInThisIteration = traverseBottomUp(
        ast,
        replaceSequentialAssignments
    ) || changedInThisIteration;

    changedInThisIteration = traverseBottomUp(
        ast,
        replaceSequentialAssignmentsInFlowControl
    ) || changedInThisIteration;
}
```

**Why bottom-up?**
- Replacing nodes (children must be final)
- Iterative simplification (convergence loop)
- Complex transformations depend on simplified children

---

## **Common Pitfalls**

### ❌ **DANGER: Top-Down Node Replacement**

```javascript
// BAD: Top-down replacement breaks parent links
function badReplace(node) {
    if (node.type === 'SequenceExpression') {
        // Parent processes first, then children
        // Children not yet simplified!
        // Replacements can be lost
        return expandSequence(node);
    }
}
```

**Problem:**
```
(a=1, (b=2, c=3))
  ^top-down sees SequenceExpression
  └── expands outer: a=1; (b=2, c=3)
      └── inner sequence NOT expanded (already passed)
```

### ✅ **CORRECT: Bottom-Up Replacement**

```javascript
// GOOD: Bottom-up processes children first
function goodReplace(node) {
    // Children already processed and simplified
    if (node.type === 'SequenceExpression') {
        return expandSequence(node);
    }
}
```

**Result:**
```
(a=1, (b=2, c=3))
  └── bottom-up processes inner first
      └── (b=2, c=3) -> b=2; c=3
  └── then processes outer
      └── (a=1, statements) -> a=1; statements
```

---

## **Hybrid Approach (Best Practice)**

Your current implementation is **optimal**:

1. **Analysis Phase (Top-Down)**
   - Build scopes
   - Register symbols
   - Collect metrics

2. **Simplification Phase (Bottom-Up, Iterative)**
   - Replace nodes
   - Simplify expressions
   - Loop until convergence

This is the **standard compiler architecture**:
```
Parse → Analyze (top-down) → Optimize (bottom-up) → Generate
```

---

## **Node Mutation Safety Rules**

### **Rule 1: Never Mutate During Top-Down If Children Unprocessed**

```javascript
// BAD
function topDownMutate(node) {
    if (shouldReplace(node)) {
        replaceWith(node, newNode); // Children not yet processed!
    }
}

// GOOD
function topDownAnalyze(node) {
    if (shouldMark(node)) {
        node._metadata = true; // OK: adding metadata, not replacing
    }
}
```

### **Rule 2: Bottom-Up Mutations Must Be Atomic**

```javascript
// In bottom-up, parent receives FINAL child form
function bottomUpReplace(node, parentStack) {
    // Children are DONE, won't change
    if (canSimplify(node)) {
        let newNode = simplify(node);
        replaceInParent(newNode, parentStack);
        return true; // Signal change
    }
}
```

### **Rule 3: Use Parent Stack for Safe Replacement**

```javascript
// Your correct implementation: lib/utils.js:38-54
static replaceChildInParentNode(newNode, parentStackNode) {
    let parent = parentStackNode.node;
    let parentProperty = parentStackNode.propertyName;

    if (parent[parentProperty].constructor.name == "Array") {
        let pos = parentStackNode.index;
        parent[parentProperty].splice(pos, 1, newNode);
    } else {
        parent[parentProperty] = newNode;
    }
}
```

**Why this works:**
- Bottom-up guarantees parent not yet processed
- Parent still has reference to old child
- Direct mutation via parent property

---

## **Performance Considerations**

### Top-Down (Iterative Stack)
- **Memory**: O(depth) stack space
- **Speed**: Single pass (no revisits)
- **Cache**: Good locality (parent → children)

### Bottom-Up (Post-Order)
- **Memory**: O(depth) stack + visited flags
- **Speed**: Single pass per node
- **Cache**: Mixed (children → parent jumps)

**Your Implementation:**
- Top-down: Iterative stack (`lib/traverser.js:45-84`) ✓ Optimal
- Bottom-up: Visited flags (`lib/traverser.js:110-154`) ✓ Correct

---

## **Convergence Detection Best Practices**

Your new implementation is **correct**:

```javascript
// Each iteration gets fresh status
let changedInThisIteration = false;

changedInThisIteration = mutator1() || changedInThisIteration;
changedInThisIteration = mutator2() || changedInThisIteration;
changedInThisIteration = mutator3() || changedInThisIteration;

if (!changedInThisIteration) break; // No changes -> done
```

**Why `||` not `|=`:**
- `||` is logical OR: `false || false || true || false = true`
- `|=` is bitwise: once `true`, stays `true` forever

---

## **Recommendations**

### ✅ **Keep Current Architecture**
Your phase separation is **textbook correct**:
1. Top-down for analysis
2. Bottom-up for transformation
3. Iterative convergence loop

### 📈 **Potential Improvements**

1. **Visitor Pattern** (reduce boilerplate)
   ```javascript
   // Instead of manual type checking in mutators
   const visitor = {
       SequenceExpression(node) {
           // Auto-dispatched
       },
       BinaryExpression(node) {
           // Auto-dispatched
       }
   };
   ```

2. **Change Tracking** (optimization)
   ```javascript
   // Mark changed subtrees, skip unchanged
   if (!node._changed) return; // Skip
   ```

3. **Parallel Mutators** (if independent)
   ```javascript
   // These don't interfere, can run in parallel
   [mutator1, mutator2, mutator3].forEach(m =>
       traverseBottomUp(ast, m)
   );
   ```

---

## **Summary**

| Task | Direction | Why |
|------|-----------|-----|
| Build scopes | Top-Down | Parent before child |
| Track variables | Top-Down | Need scope context |
| Replace nodes | Bottom-Up | Children first |
| Simplify expressions | Bottom-Up | Depends on children |
| Dead code elimination | Bottom-Up | Aggregate child info |
| Constant folding | Bottom-Up | Compute from children |

**Golden Rule:**
- **Reading/Analyzing**: Top-Down (or either)
- **Writing/Replacing**: Bottom-Up (mandatory)

Your current implementation **follows this rule perfectly**.
