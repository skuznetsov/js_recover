// Test Case 9: Dead Code Elimination
// Tests: Unreachable code, constant conditions

function testDeadCodeElimination(x) {
    var result = 0;

    // Dead if branch
    if (false) {
        result = 999;  // Should be removed
    }

    // Always-true if
    if (true) {
        result = 100;
    } else {
        result = 200;  // Should be removed
    }

    // Dead while loop
    while (false) {
        result++;  // Should be removed
    }

    // Dead ternary
    var ternary = false ? 1 : 2;  // Should become: var ternary = 2

    // Unreachable after return
    function unreachableCode() {
        return 42;
        console.log("Never executed");  // Should be removed
        var x = 10;                     // Should be removed
    }

    // Nested dead code
    if (true) {
        result = 300;
        if (false) {
            result = 400;  // Should be removed
        }
    }

    // Constant arithmetic enabling DCE
    if (2 + 2 === 4) {
        result += 50;
    } else {
        result = 0;  // Should be removed after constant folding
    }

    return result + unreachableCode();
}

// Expected transformations:
// if (false) { ... } → (removed)
// if (true) { A } else { B } → { A }
// while (false) { ... } → (removed)
// false ? A : B → B
// Code after return → (removed)
