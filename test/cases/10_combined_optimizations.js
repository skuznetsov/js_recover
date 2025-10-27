// Test Case 10: Combined Optimizations
// Tests: Constant folding + DCE + String deobfuscation working together

function testCombined() {
    // Phase 1: String deobfuscation
    var obfuscatedMsg = "\x48\x65\x6c\x6c\x6f";  // → "Hello"

    // Phase 2: Constant folding
    var computed = 5 + 3 * 2;  // → 11 (if operator precedence handled)
    var concatStr = "Result: " + (10 + 5);  // → "Result: 15"

    // Phase 3: Dead code elimination (after constants folded)
    var result = 0;

    if (10 > 5) {  // → if (true) after folding
        result = 100;
    } else {
        result = 200;  // Dead code after if(true) simplification
    }

    // Complex: String + Const + DCE
    var complexString = "\x41" + "B" + "C";  // → "ABC"

    if (2 + 2 === 4) {  // → if (true)
        complexString += "D";
    }

    // Nested optimization opportunities
    var nested = (true || false) ? (5 + 5) : (3 * 3);
    // Step 1: true || false → true
    // Step 2: true ? X : Y → X
    // Step 3: 5 + 5 → 10
    // Final: var nested = 10

    return {
        obfuscatedMsg,
        computed,
        concatStr,
        result,
        complexString,
        nested
    };
}

// Expected transformation sequence:
// Iteration 1: String deobfuscation, some constant folding
// Iteration 2: More constant folding, dead code elimination
// Iteration 3: Final cleanup
// Should converge in 2-3 iterations
