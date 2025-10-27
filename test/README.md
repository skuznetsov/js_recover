# Test Suite for js_recover

## Overview

This test suite validates the JavaScript deobfuscation pipeline, including:
- Boolean recovery (!0 → true, !1 → false, void 0 → undefined)
- Sequence expression expansion
- Control flow normalization
- Logical operator to conditional conversion
- Nested complex obfuscation patterns
- Convergence detection

## Running Tests

```bash
# Run all tests
node test/run_tests.js

# Or make executable and run
chmod +x test/run_tests.js
./test/run_tests.js

# Clean previous outputs
node test/run_tests.js --clean
```

## Test Cases

### 01_boolean_recovery.js
Tests basic boolean and undefined recovery:
- `!0` → `true`
- `!1` → `false`
- `void 0` → `undefined`

Expected: 1 iteration, all booleans converted

### 02_sequence_expressions.js
Tests sequence expression expansion:
- `(a=1, b=2, c=3)` → separate statements
- Sequences in assignments
- Sequences with function calls

Expected: 1-2 iterations

### 03_control_flow.js
Tests control flow normalization:
- Single-statement if/else → block statements
- Single-statement while/for loops → blocks
- Nested single statements

Expected: 1 iteration

### 04_logical_operators.js
Tests logical operators to conditionals:
- `a && b()` → `if (a) { b(); }`
- `a || b()` → `if (!a) { b(); }`
- Chained logical operators

Expected: 1-2 iterations

### 05_nested_complex.js
Tests combination of multiple patterns:
- Boolean + sequence + control flow
- Nested sequences
- Complex ternaries

Expected: 2-3 iterations

### 06_convergence.js
Tests iterative simplification requiring multiple passes:
- Deeply nested obfuscation
- Progressive simplification
- Convergence detection

Expected: 3-5 iterations (must not hit 100 iteration limit)

## Test Output

Each test produces:
- `<testname>.js.out` - Deobfuscated JavaScript
- `<testname>.js.ast.before.json` - Input AST
- `<testname>.js.ast.after.json` - Output AST

## Success Criteria

A test passes if:
1. ✅ No execution errors
2. ✅ Converged (reached fixed point)
3. ✅ Output is syntactically valid JavaScript
4. ✅ Did not hit MAX_ITERATIONS (100)

## Adding New Tests

1. Create `test/cases/NN_testname.js` with obfuscated code
2. Add comments describing expected transformations
3. Run test suite
4. Verify output in `test/cases/NN_testname.js.out`

Example:
```javascript
// test/cases/07_my_test.js
function myTest() {
    var x = !0;  // Should become true
    return x;
}

// Expected: !0 -> true
```

## Debugging Failed Tests

If a test fails:

1. **Check output file exists**: `ls test/cases/<testname>.js.out`
2. **Check syntax**: `node -c test/cases/<testname>.js.out`
3. **Compare diff**: `diff test/cases/<testname>.js test/cases/<testname>.js.out`
4. **Check AST**: `cat test/cases/<testname>.js.ast.after.json | jq .`
5. **Run manually with verbose**:
   ```bash
   # Edit config/default.json: "verbose": true
   node app.js test/cases/<testname>.js
   ```

## Known Limitations

Current mutators do NOT handle:
- ❌ String obfuscation (hex/unicode/base64)
- ❌ Constant folding (2+2 → 4)
- ❌ Array access resolution (arr[0] where arr is known)
- ❌ Dead code elimination
- ❌ Switch-case flattening
- ❌ Computed property names

These will be added in future iterations.
