/*
This file takes all of the Electron app's renderer process javascript files
and combines them into a single file named '__PREPROCESSEDbundle__.js'

This file is ran as a prebuild step in package.json.

The generated file named '__PREPROCESSEDbundle__.js'
is then given to babel as the build step
in order to apply the compiler configuration.

====

Notes:
- Perhaps I'll rename the file to bundler.cjs
- I'd written the "note:" already but I guess I should be extra clear... bundlers exist and they work well... I write the code that I think is interesting for this project and would never do this in a job scenario unless for some weird reason it was necessary.
- I think that's a big problem with a lot of what I do.
    - it's easy to look at the code I write and say "well vite and such and such is this guy an idiot?" no I'm just having fun.
    - at the same time there's somewhat of a responsibility on my end to ensure that someone who doesn't know that vite or some other weird thing I'm implementing already exists so that they don't foolishly do this in a job scenario. I should consider putting this at the top of the readme
- Preprocessor text token (see "marker details comment" at end of this file) is used to strip out text from a javascript file.
    - in essence: I found that vscode wasn't showing me lsp cross file even if the files were in the same directory, and that directory was part of the workspace.
    - So, I needed to add an import to the top of each file that indicated to vscode what each file was dependent on.
    - This gave me cross file lsp.
    - (note: you probably can put a setting in package.json to do this but I thought it was an interesting problem nevertheless
             so I went about this way cause I'm not writing this code as a "job" I just wanted to do the more interesting thing
             than google for a package.json setting, in a job environment I'd never do most of the things you see me do)
    - But, you don't need the import statements after you've combined them all into a single file.
    - Thus the preprocessor text token wraps the imports so that I can remove them when I combine it all into a single file

===

"you're having fun? all you do is talk about anxiety and panic attacks"
But that's the rush of it all. Is that it is difficult for me.

I've manually re-indented 'main.cjs' from 2 spaces to 4 at one point.
That file is 1,700 lines.
I just now re-indented this entire file using vscode and it was trivial to achieve.
Why?
Because I frequently code to exhaustion and then keep going.
It's a terrible idea and what I just mentioned is 1 example of the mental fatigue that comes from it.
Nevertheless sometimes I do squeeze out something meaningful in a state of immense mental fatigue.
And I'm always prepared to just walk away at any moment.

I want the code to destroy me mentally.
It is how I feel alive.

Any low you can get the code to make you feel. You'll eventually overcome that low and swing the pendulum in the other direction
and achieve the most insane natural high you've ever experienced.
*/

const fs = require('fs');
const path = require('path');

const inputFolder = './src/RendererFiles';
//const inputFolder = './src/Test';
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
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, '');

    let files = fs.readdirSync(inputFolder).filter(file => file.endsWith('.js'));

    files.sort((a, b) => {
        const indexA = filePriorityOrder.indexOf(a);
        const indexB = filePriorityOrder.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });

    if (files.length === 0) {
        console.log(`No JavaScript files found in ${inputFolder}`);
        process.exitCode = 0;
        return;
    }

    for (let i = 0; i < files.length; i++) {
        bundleFile(files[i]);
    }

    flushAppendToFile();
    console.log(`Successfully bundled ${files.length} files in prioritized order into ${outputFile}`);
}
catch (err) {
    console.error('Bundling failed:', err.message);
    process.exitCode = 1;
}

function bundleFile(fileName) {

    appendToWriteBuilder(`\n\n// ${fileName}\n\n`);

    const filePath = path.join(inputFolder, fileName);
    let text = readTextNoBOM(filePath);

    // 0 => None
    // 1 => StartFound
    let preprocessorMarkerContext = 0;

    let pos = 0;

    markerWhileLoop: while (pos < text.length) {
        switch (text[pos]) {
            /* see "marker details comment" at end of this file */
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
                        singleLineCommentWhile: while (pos < text.length) {
                            switch (text[pos]) {
                                case '/':
                                    if (pos <= text.length - 7 && text[pos + 1] === '/' && text[pos + 2] === '_' && text[pos + 3] === '_' && text[pos + 4] === '#' && text[pos + 5] === '_' && text[pos + 6] === '_') {
                                        console.log(`${filePath} warning: preprocessor mark was found after the first non-whitespace character within a single line comment.`);
                                    }
                                    break;
                                // Single line comments cannot delete their ending newline character(s) otherwise a line ending of just '\n' or just '\r' would result in:
                                // ```
                                // let x = 2; // set x to 2
                                // return x + 1;
                                // ```
                                //
                                // Would become:
                                // ```
                                // let x = 2; return x + 1;
                                // ```
                                case '\r':
                                case '\n':
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
                    else if (text[pos] === '\\') {
                        pos++;
                        if (pos <= text.length - 1) {
                            pos++;
                        }
                        continue;
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

/*
# marker details comment

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
