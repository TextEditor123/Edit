// Google AI Overview "javascript simple bundler that just moves all the files into one":

const fs = require('fs');
const path = require('path');

const inputFolder = './src/RendererFiles';
const outputFile = './preprocessor/__PREPROCESSEDbundle__.js';

// 1. Define the exact loading priority order
const filePriorityOrder = [
  "fieldBuffer.js",
  "header_editorGlobal_header.js",
  "widgetGlobal.js",
  "menuGlobal.js",
  "dialogGlobal.js",
  "trackedSyntaxTypes.js",
  "treeViewComponent.js",
  "dialogImplementationsGlobal.js",
  "listComponent.js",
  "listTypes.js",
  "editorGlobal.js",
  "javascriptFeatures.js",
  "explorerGlobal.js",
  "applicationRendererRoot.js"
];

let writeBuilder = [];
let writeBuilderTotalLength = 0;

try {

  // 5. Save the output bundle
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, '');



  // 2. Read the directory and filter for .js files
  let files = fs.readdirSync(inputFolder).filter(file => file.endsWith('.js'));

  // 3. Sort files based on your custom priority array
  files.sort((a, b) => {
    const indexA = filePriorityOrder.indexOf(a);
    const indexB = filePriorityOrder.indexOf(b);

    // If both files are in the priority list, sort by their array position
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    
    // If only file A is in the list, move it ahead of file B
    if (indexA !== -1) return -1;
    
    // If only file B is in the list, move it ahead of file A
    if (indexB !== -1) return 1;

    // If neither file is in the list, fall back to default alphabetical order
    return a.localeCompare(b);
  });

  if (files.length === 0) {
    console.log(`No JavaScript files found in ${inputFolder}`);
    process.exit(0);
  }

  // 4. Combine the contents using the sorted paths
  const combinedCode = files.map(fileName => aaa(fileName)).join('\n\n');

  flushAppendToFile();

  console.log(`Successfully bundled ${files.length} files in prioritized order into ${outputFile}`);
} catch (err) {
  console.error('Bundling failed:', err.message);
}

/*
I go to editorGlobal.js and go to the definition for the function 'EDITOR_indexLineTo_beltIndexLine'.

I replace a specific span of 4 spaces by '~~~~' to illustrate what is happening.

function EDITOR_indexLineTo_beltIndexLine(indexLine) {
    let virtualIndexLine = (indexLine + get_EDITOR_offsetLine()) - get_EDITOR_virtualIndexLine();
~~~~// TODO: The following line of code (when I at one point had it commented out in a specific way, I'm adding this clarification after originally having made this comment I don't remember the specifics of how it was commented out, but parts of it were and other parts weren't) either didn't "preprocess" correctly or... well I mean it probably is my fault i.e.: the "preprocess" but yeah this is coming out to be 'return;' and that's it nothing else in the compiled end result so somewhere along the pipeline it got borked.
    return someExpressionIsHereButThatIsntImportantRightNow;
}

function EDITOR_indexLineTo_beltIndexLine(indexLine) {
    let virtualIndexLine = (indexLine + get_EDITOR_offsetLine()) - get_EDITOR_virtualIndexLine();
~~~~
    return someExpressionIsHereButThatIsntImportantRightNow;
}

The comment was removed, but the 4 spaces of indentation wasn't.
There's a variety of others things I can do in addition to this one.
But I wanna focus on this one particularly first. I wanna do this one.

posNewline
posChar

```
a
    // bbb
```
init: {
    posChar = -1
    posNewline = -1
    substart = 0
}

skipEmptyLine: {
    if (isChar === -1) | chunk(overritePos(posNewline))
}

posThis = 0 | isChar    => posChar = 0
posThis = 1 | isNewline => char= -1

posThis = 2 | isNonNewlineWhitespace => nop
posThis = 3 | isNonNewlineWhitespace => nop
posThis = 4 | isNonNewlineWhitespace => nop
posThis = 5 | isNonNewlineWhitespace => nop

posThis = 6 | isCommenty => lexComment | if (posThis isNewLine) | verify(posNewline )



*/

function aaa(fileName) {

  appendToWriteBuilder(`\n\n// ========\n// ========\n// ${fileName}\n// ========\n// ========\n\n`);

  const filePath = path.join(inputFolder, fileName);
  let text = readTextNoBOM(filePath);

  // 0 => None
  // 1 => StartFound
  let preprocessorMarkerContext = 0;

  let pos = 0;

  markerWhileLoop: while (pos < text.length) {
    switch (text[pos]) {
      /*
      - [x] The marker is specifically "//__#__" being the first non-whitespace found in a text file and at the start of a new line.
      - [ ] It doesn't have to start at character index 0, but it needs to appear prior to any other text and at the start of a new line.
      - [x] An error if "//__#__" was the first non-whitespace in a file, but an ending marker of the same text was never encountered.
      - [x] A warning message is written to the console if "//__#__" is found at any location other than what was just described.
          - [x] as a token itself
          - [x] as part of a single line comment
          - [x] as part of a multi line comment
          - [x] as part of a string
      - [ ] Only 1 of them per file is supported.
      - [ ] The main idea is to permit javascript header files.
      - [ ] I'm not getting lsp results in vscode unless I add an import, but I don't need the import when I smush it all into 1 file.
      - [ ] TODO: If this throws an error, bable shouldn't be ran; it currently is not working this way.
      - [ ] It needs to start the line

      //__#__
      // preprocessor.cjs
      import "./javascriptFeatures";
      //__#__
      */
      case '/':
        /** @type {boolean} */
        let meetsNewLineRequirement;
        if (pos > 0) {
          meetsNewLineRequirement = text[pos - 1] === '\r' || text[pos - 1] === '\n';
        }
        else {
          meetsNewLineRequirement = true;
        }

        if (pos <= text.length - 7 &&
            text[pos + 1] === '/' &&
            text[pos + 2] === '_' &&
            text[pos + 3] === '_' &&
            text[pos + 4] === '#' &&
            text[pos + 5] === '_' &&
            text[pos + 6] === '_') {
              if (preprocessorMarkerContext === 0) {
                if (meetsNewLineRequirement) {
                  pos += 7;
                  preprocessorMarkerContext = 1; // StartFound
                  continue;
                }
                else {
                  console.log('warning failed newline requirement => break markerWhileLoop;');
                  break markerWhileLoop;
                }
              }
              else {
                if (meetsNewLineRequirement) {
                  pos += 7;
                  preprocessorMarkerContext = 0;
                  break markerWhileLoop;
                }
                else {
                  console.log('warning failed newline requirement => skipped this match because it did not start at a newline.');
                  pos += 7;
                  break;
                }
              }
        }
        else {
          if (preprocessorMarkerContext === 0) {
            break markerWhileLoop;
          }
          else {
            pos++;
            break;
          }
        }
        break;
      case ' ':
      case '\t':
      case '\r':
      case '\n':
        pos++;
        break;
      default:
        if (preprocessorMarkerContext === 0) {
          break markerWhileLoop;
        }
        else {
          pos++;
          break;
        }
    }
  }

  if (preprocessorMarkerContext === 1 /*StartFound*/) {
    // Then the end was never found
    //
    // This is an Error because it is very specific, for some reason the file started with '//__#__'.
    // And it was inside my 'RendererFiles' folder, so what's going on?
    //
    // When it comes to '//__#__' being lexed after the first non-whitespace character
    // that feels far too vague to permit it being an error.
    //
    throw new Error(`${filePath} => if (preprocessorMarkerContext === 1 /*StartFound*/)`);
  }

  let chunkStart = pos;
  while (pos < text.length) {
    switch (text[pos]) {
      case '/':
        if (pos <= text.length - 7 && text[pos + 1] === '/' && text[pos + 2] === '_' && text[pos + 3] === '_' && text[pos + 4] === '#' && text[pos + 5] === '_' && text[pos + 6] === '_') {
              console.log(`${filePath} warning: preprocessor mark was found after the first non-whitespace character as a token itself.`);
        }

        if (pos <= text.length - 2) {
          if (text[pos + 1] === '/') {
            endChunk();
            pos += 2;
            if (fileName === "editorGlobal.js") {
              let a = 2;
            }
            singleLineCommentWhile: while (pos < text.length) {
              switch (text[pos]) {
                case '/':
                  if (pos <= text.length - 7 && text[pos + 1] === '/' && text[pos + 2] === '_' && text[pos + 3] === '_' && text[pos + 4] === '#' && text[pos + 5] === '_' && text[pos + 6] === '_') {
                        console.log(`${filePath} warning: preprocessor mark was found after the first non-whitespace character within a single line comment.`);
                  }
                  break;
                case '\r':
                  pos++;
                  if (pos <= text.length - 2) {
                    if (text[pos + 1] === '\n') {
                      pos++;
                    }
                  }
                  break singleLineCommentWhile;
                case '\n':
                  pos++;
                  break singleLineCommentWhile;
              }
              pos++;
            }
            startChunk();
            continue;
          }
          else if (text[pos + 1] === '*') {
            endChunk();
            pos += 2;
            multiLineCommentWhile: while (pos < text.length) {
              switch (text[pos]) {
                case '/':
                  if (pos <= text.length - 7 && text[pos + 1] === '/' && text[pos + 2] === '_' && text[pos + 3] === '_' && text[pos + 4] === '#' && text[pos + 5] === '_' && text[pos + 6] === '_') {
                        console.log(`${filePath} warning: preprocessor mark was found after the first non-whitespace character within a multi line comment.`);
                  }
                  break;
                case '*':
                  if (pos <= text.length - 2) {
                    if (text[pos + 1] === '/') {
                      pos += 2;
                      break multiLineCommentWhile;
                    }
                  }
                  break;
              }
              pos++;
            }
            startChunk();
            continue;
          }
        }
        break;
      case '\'':
      case '"':
      case '`':
        let terminator = text[pos];
        pos++;
        stringWhile: while (pos < text.length) {
          if (text[pos] === '/' && pos <= text.length - 7 && text[pos + 1] === '/' && text[pos + 2] === '_' && text[pos + 3] === '_' && text[pos + 4] === '#' && text[pos + 5] === '_' && text[pos + 6] === '_') {
                console.log(`${filePath} warning: preprocessor mark was found after the first non-whitespace character within a string which has the terminator ${terminator}.`);
          }
          else if (text[pos] === terminator) {
            pos++;
            break stringWhile;
          }
          pos++;
        }
        continue;
    }
    pos++;
  }
  endChunk();

  function startChunk() {
    if (chunkStart !== -1 && chunkStart < pos) {
      appendToWriteBuilder(text.substring(chunkStart, pos));
    }
    chunkStart = pos;
  }
  
  function endChunk() {
    if (chunkStart < pos) {
      appendToWriteBuilder(text.substring(chunkStart, pos));
    }
    chunkStart = -1;
  }
}

function appendToWriteBuilder(substring) {
  writeBuilder.push(substring);
  writeBuilderTotalLength += substring.length;
  if (writeBuilderTotalLength > 1024) {
    flushAppendToFile();
  }
}

function flushAppendToFile() {
  fs.appendFileSync(outputFile, writeBuilder.join(''), 'utf8');
  // TODO: I hear 'array.length = 0' will clear the references to the entries but I don't feel confident that it is reality. Nevertheless, this isn't a major concern right now.
  writeBuilder.length = 0;
  writeBuilderTotalLength = 0;
}

/**
 * started off with code snippet from Google AI Overview for "node fs determine if file has bom":
 * 
 * Copy, pasted, modified; from main.csj originally named 'hasBOM(...)'
 */
function readTextNoBOM(filePath) {
  // Use a small buffer to read just the first 3-4 bytes
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);

  let stat = fs.statSync(filePath);

  // Check for common BOM signatures
  // UTF-8: EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    const bufferaaa = Buffer.alloc(stat.size - 4);
    fs.readSync(fd, bufferaaa, 0, bufferaaa.length, 3);
    fs.closeSync(fd);
    return bufferaaa.toString();
  }
  else {
    const bufferaaa = Buffer.alloc(stat.size);
    fs.readSync(fd, bufferaaa, 0, bufferaaa.length, 0);
    fs.closeSync(fd);
    return bufferaaa.toString();
  }

  /*
  // UTF-16 Little Endian: FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return 'UTF-16LE';
  }
  // UTF-16 Big Endian: FE FF
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return 'UTF-16BE';
  }
  */
}
