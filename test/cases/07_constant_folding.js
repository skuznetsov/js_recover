// Test Case 7: Constant Folding
// Tests: Arithmetic, string concat, boolean ops

function testConstantFolding() {
    // Arithmetic
    var sum = 2 + 3;
    var product = 10 * 2;
    var division = 100 / 5;
    var modulo = 17 % 5;
    var power = 2 ** 10;

    // Nested arithmetic
    var complex = (5 + 3) * 2 - 1;

    // String concatenation
    var greeting = "Hello" + " " + "World";
    var mixed = "Count: " + (5 + 5);

    // Boolean operations
    var andOp = true && false;
    var orOp = true || false;
    var notOp = !true;

    // Comparison
    var greater = 10 > 5;
    var less = 3 < 1;
    var equal = 5 === 5;

    // Bitwise
    var bitwiseOr = 8 | 4;
    var bitwiseAnd = 12 & 7;
    var shift = 1 << 3;

    return {
        sum, product, division, modulo, power,
        complex, greeting, mixed,
        andOp, orOp, notOp,
        greater, less, equal,
        bitwiseOr, bitwiseAnd, shift
    };
}

// Expected transformations:
// 2 + 3 → 5
// 10 * 2 → 20
// 100 / 5 → 20
// "Hello" + " " + "World" → "Hello World"
// true && false → false
// 10 > 5 → true
