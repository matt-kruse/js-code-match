const traverse = require('object-traversal').traverse;
const api = require('jscodeshift');
const gridLogger = require("grid-log");

const defaultOptions ={
  parser: 'flow', // Default to flow for JScript support
  variablePrefix: '$$',
  debug: false,
  logFullSource: false, // When showing debug output, show the full source AST
};
gridLogger.options({ascii:true})
let options = Object.assign({},defaultOptions);
let countVar = null;
let counterValue = 0;

function codeMatch(src, newOptions={}) {
  Object.assign(options,newOptions);
  countVar = options.variablePrefix + 'COUNT';
  let src_ast = api.withParser(options.parser)(src);
  return {
    cleanNodeAttributes,
    logFindResults,
    find: (find_src) => find(src_ast, find_src),
    replace: (find_src,replace_src,replaceFunction) => {
      src_ast = replace(src_ast,find_src,replace_src,replaceFunction)
    },
    jscodeshift: () => src_ast,
    ast: () => src_ast,
    toSource: () => src_ast.toSource()
  }
}

function stringify(node) {
  return JSON.stringify(node.value ?? node,null,2);
}

function clone(obj) {
  return structuredClone(obj);
  // return JSON.parse(JSON.stringify(obj));
}

function logFindResults(results) {
  let args = [ ['LINE','SOURCE','MATCHES','AST'] ];
  results.forEach(r=>args.push([r.line,r.toSource(),r.values,r.getValue()]));
  gridLogger.apply(null,args);
}

function isVar(str) {
  return (str??'').startsWith(options.variablePrefix);
}

function def(o) {
  return typeof o!="undefined";
}

// Remove metadata attributes from AST objects for better printing
function cleanNodeAttributes(node) {
  if (Array.isArray(node)) {
    return node.map(n=>cleanNodeAttributes(n));
  }
  let removeAttributes = ['loc', 'range', 'typeAnnotation', 'comments', 'leadingComments', 'trailingComments', 'tokens'];
  node = clone(node);
  traverse(node, ({parent, key}) => {
    if (removeAttributes.includes(key)) {
      delete parent[key];
    }
  });
  return node;
}

// Compare AST objects to see if they match with $$VAR placeholders
// Returns a set of matches
function compareObjects(from,to,matches={}) {
  // console.log(`compareObjects()`,from,to);
  const IGNORE_ATTRIBUTES = ['loc','range','typeAnnotation','comments','leadingComments','trailingComments','optional','typeArguments'];

  // Special Case: The comparable has a $$1 placeholder in the name attribute, which acts as a wildcard
  // Grab the matching value and store it
  if (to && to.name && isVar(to.name)) {
    matches[to.name] = from;
    return matches;
  }

  // Special Case: Handle a { $$1 } BlockStatement
  // to match an entire block body
  if (to?.type === "BlockStatement" && from?.type==="BlockStatement") {
    let name = to?.body?.[0]?.expression?.name;
    if (to?.body?.length===1 && isVar(name)) {
      // The match is the entire BlockStatement which will be merged later
      matches[name] = from;
      return matches;
    }
  }

  // Otherwise, match the attributes 1:1
  // Use the "to" Object for the list of attributes to match, not the from
  for (let attr in to) {
    if (!IGNORE_ATTRIBUTES.includes(attr) && !compareAttribute(from, to, attr, matches)) {
      return false;
    }
  }
  return matches;
}

// Compare a single attribute from two objects
function compareAttribute(from,to,attr,matches={}) {
  try {
    let a = from[attr];
    let b = to[attr];
    if (a === null && b === null) return true;
    return (typeof a === "object") ? compareObjects(a, b, matches) : (a === b);
  } catch (e) {
    options.debug && console.error(`Error in compareAttribute(${JSON.stringify(from)},${to},${attr},${matches})`);
    return false;
  }
}

function find(source_ast, find) {
  let find_ast = typeof find=='string' ? getASTFromStatement(find) : find;
  options.debug && gridLogger(["FIND SOURCE","AST"],[find,find_ast]);
  options.debug && options.logFullSource && gridLogger(['SOURCE'],[cleanNodeAttributes(source_ast)]);

  let match_results = [];
  // Get the first node type to start a search against src
  let type = find_ast.type;
  options.debug && console.log(`Looking for AST Node Type ${type}`);
  source_ast.find(type).forEach( node=> {
    options.debug && gridLogger(["POTENTIAL MATCH","MATCH PATTERN"],[cleanNodeAttributes(node.value),find_ast]);
    let matches = compareObjects(node.value, find_ast);
    if (matches) {
      // Extract the text values from the matching nodes
      let matchValues = {};
      for (let key in matches) {
        let m = matches[key];
        matchValues[key] = m.raw ?? m.value ?? m.name ?? m.type ?? null;
      }
      let loc = node?.value?.loc?.start?.line ?? -1;
      match_results.push({
        node,
        matches,
        values: matchValues,
        line: loc,
        toSource: ()=>api(node).toSource(),
        getValue: ()=>cleanNodeAttributes(node.value)
      });
    } else {
      options.debug && gridLogger('No Match')
    }
  });
  return match_results;
}

function replace(source_ast, template, replace, replaceFunction=()=>{}) {
  let original_src = options.debug ? source_ast.toSource() : null;
  let match_ast = typeof template=='string' ? getASTFromStatement(template) : template;
  let replace_ast = typeof replace=='string' ? getASTFromStatement(replace) : replace;

  options.debug && gridLogger(["MATCH SRC","REPLACE SRC"],[template,replace],["AST","AST"],[cleanNodeAttributes(match_ast),cleanNodeAttributes(replace_ast)]);
  // Get the first node type to start a search against src
  let type = match_ast.type;
  options.debug && options.logFullSource && gridLogger(["SOURCE AST"],[cleanNodeAttributes(source_ast.get().value.program.body)]);
  options.debug && console.log(`Looking for AST Node Type ${type}`);
  source_ast.find(type).forEach( node=> {
    options.debug && gridLogger(["POTENTIAL MATCH","MATCH PATTERN"],[cleanNodeAttributes(node.value),cleanNodeAttributes(match_ast)]);
    let matches = compareObjects(node.value, match_ast);
    if (matches) {
      let newNode = null;
      let current_replace_ast = replace_ast;
      let replaceFunctionResult = replaceFunction(node,matches);
      // If the replace function returns a string value, treat it as the new replace template
      if (typeof replaceFunctionResult=='string') {
        current_replace_ast = getASTFromStatement(replaceFunctionResult);
      }
      // If it's returned an object, assume it's the replacement node
      if (typeof replaceFunctionResult=='object') {
        newNode = replaceFunctionResult;
      }
      //. Otherwise maybe it has manipulated the matches and the normal template should be used
      else {
        newNode = populateReplaceAST(current_replace_ast, matches);
      }
      node.replace(newNode);
    }
    else {
      options.debug && console.log(`Not a match`);
    }
  });
  options.debug && gridLogger(["SOURCE","RESULT"],[original_src,source_ast.toSource()]);
  return source_ast;
}

// Try to reconstruct the source for a plain AST node
function getNodeSource(node) {
  try {
    let start = node.loc.start.token;
    let end = node.loc.end.token;
    let tokens = node.loc.tokens.slice(start, end);
    return tokens.map(t=>t.value).join(' ');
  } catch (e) {
    return '?';
  }
}

// Convert a JS string into a single AST object
function getASTFromStatement(src_template) {
  let ast = api.withParser(options.parser)(src_template);
  let body = ast.get().value.program.body[0];
  if (body?.type==="ExpressionStatement" && body.expression) {
    body = body.expression;
  }
  return body;
}

// Clone a template AST node and replace it with values for placeholders
function populateReplaceAST(targetASTNode, matches={}) {
  matches[countVar]=counterValue;
  let replaceClone = cleanNodeAttributes(clone(targetASTNode));
  return replaceMatchNodes(replaceClone, matches);
}

function increment$$COUNT(match,matches) {
  if (match!==countVar) return;
  if (def(matches[match])) {
    counterValue++;
    matches[match] = counterValue;
  }
}

// Replace all AST nodes whose name attr is a $$VAR with replacement AST Node
function replaceMatchNodes(ast,matches) {
  // Case: The target node has a $$1 name
  if (isVar(ast?.name) && def(matches[ast.name])) {
    // If this is a $$COUNT Identifier, then convert it to a literal
    if (ast.name===countVar) {
      ast.type='Literal';
      ast.value=matches[countVar];
      increment$$COUNT(ast.name,matches);
      delete ast.name;
    }
    else {
      ast = matches[ast.name];
    }
  }
  // Special Case: Handle BlockStatements
  else if (ast?.type==="BlockStatement") {
    // Go through the BlockStatement body looking for placeholders
    let body = ast.body;
    for (let i=body.length-1; i>=0; i--) {
      // If this body expression is a placeholder, replace with the items from the match body
      let expr = body[i];
      let name = expr?.expression?.name;
      if (isVar(name) && def(matches[name])) {
        // The match contains the entire BlockStatement from the original source
        // Pick out the body array and merge it with the target body array
        if (isVar(name) && def(matches[name])) {
          body.splice(i, 1, ...matches[name].body);
        }
      }
    }
    // Now process the body
    replaceMatchNodes(body,matches);
  }
  // Special Case: The target node has a "$$1" string
  else if (ast?.type==="Literal" && isVar(ast.value) && def(matches[ast.value])) {
    let match = matches[ast.value];
    increment$$COUNT(ast.value,matches);
    ast.value = match?.value ?? match?.name ?? match;
    ast.raw = `"${ast.value}"`;
  }
  else {
    for (let prop in ast) {
      if (typeof ast[prop]=="object") {
        ast[prop] = replaceMatchNodes(ast[prop],matches);
      }
    }
  }

  // Replace vars in comments if they exist
  if (ast?.comments?.length) {
   ast.comments.forEach(c=>{
     for (let $$var in matches) {
       // We can only replace string values
       let m = matches[$$var];
       let str = m.name ?? m.value ?? m.raw;
       if (!str) {
         str = getNodeSource(m);
       }
       if (str) {
         c.value = c.value.replace($$var, str);
       }
     }
   });
  }

  return ast;
}

module.exports = codeMatch;
