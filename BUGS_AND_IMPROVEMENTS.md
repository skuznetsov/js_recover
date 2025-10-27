# Known Issues and Improvement Roadmap

*Last updated: 2025-10-25*
*Discovered via Maieutic architectural analysis*

---

## 🔴 CRITICAL (Production Blockers)

### 1. Global State Pollution
**Location:** `lib/scope.js:39`
**Issue:**
```javascript
global.astScopes ||= {};  // Shared across all processing!
```
Multiple files processed concurrently will overwrite each other's scopes.

**Impact:** Data corruption, wrong scope analysis, crashes
**Fix:**
```javascript
// Pass scopes in context instead
function processFile(code, config) {
    const context = {
        scopes: {},
        config: config
    };
    // Pass context through all functions
}
```

**Priority:** P0 - Fix before production use
**Effort:** 2-3 hours

---

### 2. Memory Leak - Circular Parent References
**Location:** `lib/traverser.js:21-22, 62-63`
**Issue:**
```javascript
val.parentNode = node;  // Child → Parent
val.parentNodeProperty = prop;
// Parent already has child in properties → Circular!
```

**Impact:** Entire AST retained in memory even after processing
**Fix Options:**
1. Use WeakMap for parent references
2. Add cleanup phase: `delete node.parentNode` after processing
3. Store parent info separately from AST

**Priority:** P0 - Memory leak on large files
**Effort:** 3-4 hours

---

### 3. Memory Leak - Unbounded Variable History
**Location:** `lib/variable.js:75-77`
**Issue:**
```javascript
set value(value) {
    this.history.unshift(value);  // Grows forever!
}
```

Variable assigned 10,000 times = 10,000 element array, but only `history[0]` is used.

**Impact:** O(N) memory growth per variable
**Fix:**
```javascript
set value(value) {
    this.history.unshift(value);
    if (this.history.length > 10) {  // Keep last 10
        this.history.length = 10;
    }
}
// Or simpler:
set value(value) {
    this._currentValue = value;  // Only store current
}
```

**Priority:** P1 - Significant memory waste
**Effort:** 30 minutes

---

### 4. Circular Scope Chain - No Protection
**Location:** `lib/scope.js:58-63`
**Issue:**
```javascript
while(currentScope) {
    if (name in currentScope.variables) {
        return currentScope.variables[name].getProperty(varName);
    }
    currentScope = currentScope.parent;  // No cycle detection!
}
```

If scope chain has cycle: Scope A → parent B → parent A → infinite loop.

**Impact:** Hang/freeze on malformed scope tree
**Fix:**
```javascript
getVariable(varName) {
    const visited = new Set();
    let currentScope = this;

    while(currentScope) {
        if (visited.has(currentScope)) {
            throw new Error(`Circular scope chain detected at ${currentScope.id}`);
        }
        visited.add(currentScope);

        // ... rest of logic
        currentScope = currentScope.parent;
    }
}
```

**Priority:** P1 - Defensive programming
**Effort:** 1 hour

---

### 5. New Nodes Lose Scope Context
**Location:** Everywhere new nodes are created (e.g., `t.expressionStatement()`)
**Issue:**
```javascript
let e = t.expressionStatement(n);  // No _state_id!
// Later: Utils.findNodeScope(e) → undefined → crash
```

**Impact:** Crashes when new nodes need scope lookup
**Fix:**
```javascript
// Helper function
function createNodeWithScope(factory, parentNode) {
    const node = factory();
    node._state_id = parentNode._state_id;  // Inherit
    return node;
}

// Usage
let e = createNodeWithScope(
    () => t.expressionStatement(n),
    node
);
```

**Priority:** P1 - Potential crashes
**Effort:** 2 hours

---

## 🟡 HIGH (Performance/Reliability)

### 6. O(N²) Memory - ParentStack Array Copying
**Location:** `lib/traverser.js:63, 72, 130, 139`
**Issue:**
```javascript
parentStack: [...current.parentStack, newItem]  // Full array copy!
```

At depth 10,000: ~50MB just for parent stacks.

**Impact:** Slow on deeply nested code, high memory
**Fix:**
```javascript
// Use linked list instead
parentStack: {
    item: newItem,
    prev: current.parentStack  // Just pointer
}

// Access:
function getParentAtIndex(stack, index) {
    let current = stack;
    for (let i = 0; i < index; i++) {
        if (!current) return null;
        current = current.prev;
    }
    return current;
}
```

**Priority:** P2 - Optimization for large files
**Effort:** 4-5 hours (need to update all parentStack access)

---

### 7. Triple Traversal Inefficiency
**Location:** `app.js:169-185`
**Issue:**
```javascript
changedInThisIteration = traverseBottomUp(ast, mutator1) || ...;
changedInThisIteration = traverseBottomUp(ast, mutator2) || ...;  // 3x work!
changedInThisIteration = traverseBottomUp(ast, mutator3) || ...;
```

Each mutator does full traversal separately.

**Impact:** 3x slower than necessary
**Fix:**
```javascript
// Already supported in applyVisitors!
changedInThisIteration = traverseBottomUp(
    ast,
    [mutator1, mutator2, mutator3],  // Single traversal
    { config }
);
```

**Priority:** P2 - Easy 3x speedup
**Effort:** 10 minutes ✅ EASY WIN

---

### 8. Magic Constant - MAX_ITERATIONS
**Location:** `app.js:160`
**Issue:**
```javascript
const MAX_ITERATIONS = 100;  // Why 100? Not 50? Not 200?
```

No data to support this number. Could be too low (incomplete deobfuscation) or too high (wasted time).

**Impact:** Arbitrary limit, no justification
**Fix:**
```javascript
// Option 1: Make configurable
const MAX_ITERATIONS = config.maxIterations || 100;

// Option 2: Adaptive based on file size
const MAX_ITERATIONS = Math.min(100, Math.ceil(nodeCount / 100));

// Option 3: Detect oscillation
if (lastThreeIterations.every(i => i.changeCount < 5)) {
    break;  // Diminishing returns
}
```

**Priority:** P3 - Nice to have
**Effort:** 1-2 hours

---

## 🟢 MEDIUM (Future Improvements)

### 9. No Visitor Pattern
**Location:** All mutators
**Issue:**
```javascript
// Current: Manual type checking in every mutator
if (node.type === 'SequenceExpression') { ... }
if (node.type === 'BinaryExpression') { ... }
```

Verbose, error-prone, hard to compose.

**Impact:** Code maintainability
**Fix:**
```javascript
// Use Babel visitor pattern
const visitor = {
    SequenceExpression(node, context) {
        // Auto-dispatched
    },
    BinaryExpression(node, context) {
        // Auto-dispatched
    }
};
```

**Priority:** P3 - Refactoring
**Effort:** 1-2 days

---

### 10. No Incremental Processing
**Issue:** Always processes entire file, even if only small part changed.

**Impact:** Slow for iterative development
**Fix:** Mark changed subtrees, skip unchanged
**Priority:** P4 - Optimization
**Effort:** 3-4 days

---

## 📊 PRIORITY RANKING

| Priority | Issue | Impact | Effort | ROI |
|----------|-------|--------|--------|-----|
| **P0** | Global state (#1) | Critical | 2-3h | Must fix |
| **P0** | Circular refs (#2) | Critical | 3-4h | Must fix |
| **P1** | Variable history (#3) | High | 30min | ⭐⭐⭐ QUICK WIN |
| **P2** | Triple traversal (#7) | Medium | 10min | ⭐⭐⭐ QUICK WIN |
| **P1** | Circular scope (#4) | Medium | 1h | ⭐⭐ |
| **P1** | New node scope (#5) | Medium | 2h | ⭐⭐ |
| **P2** | O(N²) memory (#6) | Low | 4-5h | ⭐ |
| **P3** | Magic constant (#8) | Low | 1-2h | ⭐ |
| **P3** | Visitor pattern (#9) | Low | 1-2d | Later |
| **P4** | Incremental (#10) | Low | 3-4d | Later |

---

## 🎯 RECOMMENDED FIXES - SPRINT 1 (4-6 hours)

**Day 1 Morning (2h):**
1. ✅ Fix triple traversal (#7) - 10 min
2. ✅ Fix variable history (#3) - 30 min
3. ✅ Add circular scope detection (#4) - 1h

**Day 1 Afternoon (2-3h):**
4. Fix global state pollution (#1) - 2-3h

**Day 2 (3-4h):**
5. Fix circular parent references (#2) - 3-4h
6. Add new node scope helper (#5) - 2h

**Total:** 8-11 hours for all P0-P1 issues

---

## ✅ ALREADY FIXED

- ✅ Convergence detection (`status |=` → `changedInThisIteration ||`)
- ✅ Async file write (now synchronous)
- ✅ Test infrastructure
- ✅ Documentation (traversal strategy, tests)

---

## 📚 REFERENCES

- **Maieutic Analysis:** Full dialogue in session logs
- **Test Cases:** `test/cases/*.js`
- **Architecture Docs:** `docs/TRAVERSAL_STRATEGY.md`
- **Code Locations:** All references to source files validated
