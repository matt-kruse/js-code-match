# js-code-match
#### Simple JS Code Manipulation via AST

This is a javascript source-transformation utility which uses jscodeshift under the hood but exposes a much simpler API that matches the mental model that a developer may have.

Transformation is done using ASTs, but driven by code strings instead of directly manipulating the AST structure itself.

## Example

#### Source
```javascript
let x=1;
let y = x*2;
```

#### Transformation
Placeholder values with format $$VAR are used to match against the source and substitute into the replace.
```javascript
let codeMatch = require('js-code-match');
let cm = codeMatchMatch(source);
cm.replace(
    'let $$1 = $$2',
    'const $$1 = $$2;// Changed $$1 to const for $$2'
);
console.log(cm.toSource())
```

#### Output
Because code is transformed at the AST level, whitespace is ignored in matches. Code is matched as a structure.
```javascript
const x = 1;// Changed x to const for 1
const y = x*2;// Changed y to const for x * 2
```

## Transformation Function
A third parameter can be passed to the replace() function that can manipulate matches or swap out the replace template depending on the source match.

#### Transformation
```javascript
cm.replace(
    'let $$1 = $$2',
    'const $$1 = $$2;// Changed $$1 to const for $$2',
    function(node,matches) {
      if (matches.$$1.name=='y') {
        matches.$$1.name='UPDATED'
      }
    }
);
```

#### Output
```
const x = 1;// Changed x to const for 1
const UPDATED = x*2;// Changed UPDATED to const for x * 2
```

## Transforming Blocks
Entire block statements can be matched with a placeholder, which will match N expressions inside the block.

#### Source
```javascript
if (x==1) {
  x++;
}
```

#### Transformation
```javascript
cm.replace(
    `if ($$1) { $$2 }`,
    `if ($$1) { console.log("start"); $$2; console.log("end"); }`
);
```

#### Output
```javascript
if (x==1) {
  console.log("start");
  x++;
  console.log("end");
}
```

## $$COUNT
The special replace placeholder $$COUNT can be used for an auto-incrementing global integer starting at 0.
With each use, it increments.

#### Source
```javascript
func('a');
func('b');
func('c');
```

#### Transformation
```javascript
cm.replace(
    `$$1($$2)`,
    `$$1($$2,$$COUNT,$$COUNT)`
);
```

#### Output
```javascript
func('a', 0, 1);
func('b', 2, 3);
func('c', 4, 5);
```

## Find
You can find matches and return them, without replacing.

#### Source
```javascript
func('a');
func('b');
func('c');
```

#### Find
The "logFindResults" method provides a convenient way to visualize the results of a find operation, for debugging or inspection.
```javascript
let matches = cm.find('$$1($$2)')
cm.logFindResults(matches);
```

#### Results
The find operation returns an array of matches with the following structure:
```javascript
{
    node,
    matches,
    values,
    line,
    toSource(),
    getValue()
}
```

#### Output
```text
+------+-----------+------------------+-----------------------------+
| LINE | SOURCE    | MATCHES          | AST                         |
+------+-----------+------------------+-----------------------------+
| 1    | func('a') | {                | {                           |
|      |           |   "$$1": "func", |   "type": "CallExpression", |
|      |           |   "$$2": "'a'"   |   "callee": {               |
|      |           | }                |     "type": "Identifier",   |
|      |           |                  |     "name": "func",         |
|      |           |                  |     "optional": false       |
|      |           |                  |   },                        |
|      |           |                  |   "typeArguments": null,    |
|      |           |                  |   "arguments": [            |
|      |           |                  |     {                       |
|      |           |                  |       "type": "Literal",    |
|      |           |                  |       "value": "a",         |
|      |           |                  |       "raw": "'a'"          |
|      |           |                  |     }                       |
|      |           |                  |   ],                        |
|      |           |                  |   "optional": false         |
|      |           |                  | }                           |
+------+-----------+------------------+-----------------------------+
| 2    | func('b') | {                | {                           |
|      |           |   "$$1": "func", |   "type": "CallExpression", |
|      |           |   "$$2": "'b'"   |   "callee": {               |
|      |           | }                |     "type": "Identifier",   |
|      |           |                  |     "name": "func",         |
|      |           |                  |     "optional": false       |
|      |           |                  |   },                        |
|      |           |                  |   "typeArguments": null,    |
|      |           |                  |   "arguments": [            |
|      |           |                  |     {                       |
|      |           |                  |       "type": "Literal",    |
|      |           |                  |       "value": "b",         |
|      |           |                  |       "raw": "'b'"          |
|      |           |                  |     }                       |
|      |           |                  |   ],                        |
|      |           |                  |   "optional": false         |
|      |           |                  | }                           |
+------+-----------+------------------+-----------------------------+
| 3    | func('c') | {                | {                           |
|      |           |   "$$1": "func", |   "type": "CallExpression", |
|      |           |   "$$2": "'c'"   |   "callee": {               |
|      |           | }                |     "type": "Identifier",   |
|      |           |                  |     "name": "func",         |
|      |           |                  |     "optional": false       |
|      |           |                  |   },                        |
|      |           |                  |   "typeArguments": null,    |
|      |           |                  |   "arguments": [            |
|      |           |                  |     {                       |
|      |           |                  |       "type": "Literal",    |
|      |           |                  |       "value": "c",         |
|      |           |                  |       "raw": "'c'"          |
|      |           |                  |     }                       |
|      |           |                  |   ],                        |
|      |           |                  |   "optional": false         |
|      |           |                  | }                           |
+------+-----------+------------------+-----------------------------+
```

## Other Functionality

Additional functionality exists but is not yet documented.