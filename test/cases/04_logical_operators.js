// Test Case 4: Logical Operators to Conditionals
// Tests: a && b() -> if(a) b(), a || b() -> if(!a) b()

function testLogicalOperators(flag) {
    var result = 0;

    // Logical AND as conditional
    flag && (result = 10);

    // Logical OR as conditional
    flag || (result = 20);

    // With function calls
    flag && console.log("flag is true");
    flag || console.log("flag is false");

    // Chained logical operators with sequence
    flag && (result++, console.log(result));

    // Complex logical expression
    (flag || result < 0) && (result = 100);

    return result;
}

// Expected transformations:
// flag && (result = 10) -> if (flag) { result = 10; }
// flag || (result = 20) -> if (!flag) { result = 20; }
