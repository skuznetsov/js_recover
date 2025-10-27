// Test Case 2: Sequence Expressions
// Tests: (a=1, b=2, c=3) -> separate statements

function testSequences() {
    var a, b, c, d;

    // Simple sequence expression
    (a = 1, b = 2, c = 3);

    // Sequence in assignment
    d = (a = 10, b = 20, a + b);

    // Sequence with function calls
    (console.log("first"), console.log("second"), console.log("third"));

    return {
        a: a,
        b: b,
        c: c,
        d: d
    };
}

// Expected transformations:
// (a=1, b=2, c=3) -> a=1; b=2; c=3;
// Sequence expressions should be expanded into separate statements
