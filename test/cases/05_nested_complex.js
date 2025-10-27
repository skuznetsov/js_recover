// Test Case 5: Nested Complex Obfuscation
// Tests: Combination of multiple obfuscation patterns

function complexObfuscated(x, y) {
    var a, b, c, result;

    // Boolean + sequence + control flow
    !0 && (a = 1, b = 2, c = 3);

    // Sequence in if condition + single statement
    if ((a = x, b = y, a > b))
        result = a;
    else
        result = b;

    // Logical operators + sequence + booleans
    !1 || (result++, console.log(result));

    // Nested sequence expressions
    ((a = 10, b = 20), (c = a + b, result = c));

    // Complex control flow with sequences
    for (var i = (a = 0, b = 10, 0); i < 5; i++)
        (console.log(i), result += i);

    // Ternary with sequences
    var final = !0 ? (a++, b++, a + b) : (a--, b--, a - b);

    return {
        a: a,
        b: b,
        c: c,
        result: result,
        final: final
    };
}

// Expected transformations:
// Multiple iterations should simplify this progressively
// Each iteration should apply different mutators
// Should test convergence detection
