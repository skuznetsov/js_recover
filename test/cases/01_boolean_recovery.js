// Test Case 1: Boolean Recovery
// Tests: !0 -> true, !1 -> false, void 0 -> undefined

function testBooleans() {
    var isTrue = !0;
    var isFalse = !1;
    var isUndefined = void 0;

    if (!0) {
        console.log("This should execute");
    }

    if (!1) {
        console.log("This should not execute");
    }

    var result = !0 ? "yes" : "no";

    return {
        isTrue: isTrue,
        isFalse: isFalse,
        isUndefined: isUndefined,
        result: result
    };
}

// Expected transformations:
// !0 -> true
// !1 -> false
// void 0 -> undefined
