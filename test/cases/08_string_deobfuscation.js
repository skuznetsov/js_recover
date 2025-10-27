// Test Case 8: String Deobfuscation
// Tests: Hex, Unicode, Octal escape sequences

function testStringDeobfuscation() {
    // Hex escapes
    var hexString = "\x48\x65\x6c\x6c\x6f";  // "Hello"
    var hexMixed = "W\x6f\x72\x6c\x64";      // "World"

    // Unicode escapes
    var unicodeString = "\u0048\u0065\u006c\u006c\u006f";  // "Hello"
    var unicodeMixed = "T\u0065\u0073\u0074";               // "Test"

    // Octal escapes
    var octalString = "\110\145\154\154\157";  // "Hello"

    // Mixed escapes
    var mixedEscapes = "\x48\u0065\154\154\x6f";  // "Hello"

    // Preserve legitimate escapes
    var withNewline = "Line1\nLine2";     // Should keep \n
    var withTab = "Col1\tCol2";           // Should keep \t
    var withQuote = "He said \"Hi\"";     // Should keep \"

    return {
        hexString,
        hexMixed,
        unicodeString,
        unicodeMixed,
        octalString,
        mixedEscapes,
        withNewline,
        withTab,
        withQuote
    };
}

// Expected transformations:
// "\x48\x65\x6c\x6c\x6f" → "Hello"
// "\u0048\u0065\u006c\u006c\u006f" → "Hello"
// Preserve: \n, \t, \", \'
