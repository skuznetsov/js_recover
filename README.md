# js_recover
This tool allows to deobfuscate compressed and obfuscated JavaScript code so it allows to read the code by developer.
It needed when you may lost your original source code and need to recover your code from JS bundle.
Also it is useful for forensics to be sure that loaded code is not malitious.

## Main components

Tool consists of 3 components:
1. JavaScript parser that generates Abstract Syntax Trees
2. Mutators that modify AST as per requirements
3. JavaScript generator that generates JS code after AST was mutated.

## Method of use

```
app.js input_script.js
```

Tool will generate `input_script.js.out` which can be in turn passed to the tool again to recover more information.
