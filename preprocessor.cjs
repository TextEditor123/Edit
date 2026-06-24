// Google AI Overview "javascript simple bundler that just moves all the files into one":

const fs = require('fs');
const path = require('path');

const inputFolder = './src/RendererFiles';
const outputFile = './preprocessor/__PREPROCESSEDbundle__.js';

// 1. Define the exact loading priority order
const filePriorityOrder = [
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

function aaa(fileName) {

  appendToWriteBuilder(`\n\n// ========\n// ========\n// ${fileName}\n// ========\n// ========\n\n`);

  const filePath = path.join(inputFolder, fileName);
  let text = fs.readFileSync(filePath, 'utf-8');

  /*
  while (pos < text.length) {
    switch (text[pos]) {*/
      /*
      - [ ] The marker is specifically "//__#__" being the first non-whitespace found in a text file.
      - [ ] It doesn't have to start at character index 0, but it needs to appear prior to any other text.
      - [ ] A warning message is written to the console if "//__#__" is found at any location other than what was just described.

      //__#__
      // preprocessor.js
      import "./javascriptFeatures";
      //__#__
      */
     /*
      case '/':
        if (pos <= text.length - 7 &&
            text[pos + 1] === '/' &&
            text[pos + 2] === '_' &&
            text[pos + 3] === '_' &&
            text[pos + 4] === '#' &&
            text[pos + 5] === '_' &&
            text[pos + 6] === '_') {
              endChunk();
              pos += 2;
              singleLineCommentWhile: while (pos < text.length) {
                switch (text[pos]) {
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
      break;
    }
    //__#__
  }
    */


  let chunkStart = 0;
  let pos = 0;
  while (pos < text.length) {
    switch (text[pos]) {
      case '/':
        if (pos <= text.length - 2) {
          if (text[pos + 1] === '/') {
            endChunk();
            pos += 2;
            singleLineCommentWhile: while (pos < text.length) {
              switch (text[pos]) {
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
          if (text[pos] === terminator) {
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
