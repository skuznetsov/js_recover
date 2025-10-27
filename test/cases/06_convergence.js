// Test Case 6: Convergence Testing
// Tests: Iterative simplification requiring multiple passes

function convergenceTest(n) {
    var result = 0;

    // This requires multiple iterations to fully simplify
    // Iteration 1: Expand outer sequence
    // Iteration 2: Convert logical to if
    // Iteration 3: Expand inner sequences
    // Iteration 4: Normalize control flow

    (n > 0) && (
        (result = 10, console.log("step1")),
        (result += 20, console.log("step2")),
        n > 10 && (
            result *= 2,
            console.log("step3")
        )
    );

    // Nested conditionals with sequences
    !0 && (
        n > 5 ? (
            (result++, console.log("branch1")),
            result += 10
        ) : (
            (result--, console.log("branch2")),
            result -= 10
        )
    );

    // Complex for loop requiring multiple simplifications
    for (var i = (result = 0, n); i > 0; i--)
        i % 2 === 0 && (result += i, console.log(i));

    return result;
}

// Expected behavior:
// Should require 3-5 iterations to fully simplify
// Tests that convergence detection works correctly
// Should NOT hit MAX_ITERATIONS
