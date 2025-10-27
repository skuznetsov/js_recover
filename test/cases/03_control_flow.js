// Test Case 3: Control Flow Normalization
// Tests: Single-statement if/while/for -> block statements

function testControlFlow(x) {
    // Single statement if
    if (x > 0)
        console.log("positive");

    // Single statement if-else
    if (x > 10)
        console.log("large");
    else
        console.log("small");

    // Single statement while
    var i = 0;
    while (i < 3)
        i++;

    // Single statement for
    for (var j = 0; j < 5; j++)
        console.log(j);

    // Nested single statements
    if (x > 0)
        if (x < 100)
            console.log("in range");

    return i + j;
}

// Expected transformations:
// if (x > 0) console.log("positive") -> if (x > 0) { console.log("positive"); }
// All single-statement control flow should be wrapped in blocks
