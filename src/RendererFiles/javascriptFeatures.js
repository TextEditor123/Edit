//__#__
// preprocessor.cjs
import "./fieldBuffer"
//__#__

/**
 * @param {Uint8Array} bytes 
 * @returns trackedSyntaxList
 */
function JS_full_lex(bytes, count) {
    let trackedSyntaxList = new TrackedSyntaxList(32);
    let pos = 0;

    while (pos < count) {
        switch (bytes[pos]) {
            case get_js_DOUBLEQUOTE():
                pos = lex_string(bytes, count, pos, trackedSyntaxList, get_js_DOUBLEQUOTE());
                continue;
            case get_js_SINGLEQUOTE():
                pos = lex_string(bytes, count, pos, trackedSyntaxList, get_js_SINGLEQUOTE());
                continue;
            case get_js_BACKTICK():
                pos = lex_string(bytes, count, pos, trackedSyntaxList, get_js_BACKTICK());
                continue;
            case get_js_FORWARDSLASH():
                if (bytes[pos + 1] === get_js_FORWARDSLASH()) {
                    pos = lex_comment_singleLine(bytes, count, pos, trackedSyntaxList);
                    continue;
                }
                else if (bytes[pos + 1] === get_js_ASTERISK()) {
                    pos = lex_comment_multiLine(bytes, count, pos, trackedSyntaxList);
                    continue;
                }

                break;
            case get_js_ASTERISK():
                break;
            case get_js_LINEFEED():
                break;
        }

        pos++;
    }

    return trackedSyntaxList;
}

/**
 * @returns pos
 */
function lex_comment_singleLine(bytes, count, pos, trackedSyntaxList) {
    // The current character is the first forward slash of the 'two consecutive ones' that represent the start of a single line comment.
    let start = pos;
    let length = 0;
    // "changing" this to guarantee at least 1 read means you can continue after the invocation returns (for the while loop)
    // All in all, this already was guaranteed to read at least 1 since the while loop's condition in this method
    // This change is moreso a matter of anxiety and me not wanting to deal with this at the moment so I need to see the explicit read here so I can sleep at night for the time being until my stress levels are lower.
    length++;
    pos++;
    while (pos < count) {
        if (bytes[pos] === get_js_LINEFEED()) {
            break;
        }
        length++;
        pos++;
    }

    return pos;
}

/**
 * This code is somewhat duplicated within 'function JS_line_lex(...)' when handling any "multi-line-comments" that span only a single line.
 * @returns pos
 */
function lex_comment_multiLine(bytes, count, pos, trackedSyntaxList) {
    // The current character is the first forward slash of the 'forwardslash and asterisk' that represent the start of a single line comment.
    let start = pos;
    let length = 0;
    // Move past the 'forwardslash and asterisk'
    length += 2;
    pos += 2;

    let seenLineFeed = false;

    // I'm starting this at 2 because 0 would bug (-1 + 1 === 0)
    // but then I just don't want to deal with this so I need to go 1,
    // then like I'm tired and I don't want to deal with this so I'll just go to 2 and surely nothing bad can happen
    // but in reality I probably only need to start at 1 (or start of other ticket variables + 2 or something idk I don't wanna deal with this right now).
    let ticketSource = 2;
    let ticketAsterisk = -1;
    let ticketForwardSlash = -1;
    while (pos < count) {
        switch (bytes[pos]) {
            case get_js_ASTERISK():
                ticketAsterisk = ticketSource++;
                break;
            case get_js_FORWARDSLASH():
                ticketForwardSlash = ticketSource++;
                break;
            case get_js_LINEFEED():
                seenLineFeed = true;
                ticketSource++;
                break;
            default:
                ticketSource++;
                break;
        }
        length++;
        pos++;
        if (ticketAsterisk + 1 === ticketForwardSlash) {
            break;
        }
    }

    if (seenLineFeed) {
        trackedSyntaxList.insert(trackedSyntaxList.count_abstract, get_TrackedSyntaxKind_Comment(), start, length);
    }

    return pos;
}

/**
 * This code is somewhat duplicated within 'function JS_line_lex(...)' when handling any ASCII code that could start a string.
 * @returns pos
 */
function lex_string(bytes, count, pos, trackedSyntaxList, terminator) {
    // The current character is the byte that represent the start of a string.
    let start = pos;
    let length = 0;
    // likely what started the string is the same as the terminator, so you need to move ahead one position before starting the loop.
    length++;
    pos++;

    let seenLineFeed = false;

    while (pos < count) {

        if (bytes[pos] === get_js_LINEFEED()) { // the editor only stores line feed ASCII codes and "swaps them out" when saving/copying text.
            seenLineFeed = true;
            if (terminator !== get_js_BACKTICK()) break;
        }

        if (bytes[pos] === terminator) {
            length++;
            pos++;
            break;
        }
        else if (bytes[pos] === get_js_BACKSLASH()) {
            length++;
            pos++;
            if (pos < count) {
                length++;
                pos++; // skip the escaped character provided that the file didn't end after the original backslash
            }
            continue;
        }
        length++;
        pos++;
    }

    if (seenLineFeed && terminator === get_js_BACKTICK()) {
        trackedSyntaxList.insert(trackedSyntaxList.count_abstract, get_TrackedSyntaxKind_String(), start, length);
    }

    return pos;
}

function JS_line_lex(div, substart, lineEnd, childIndex) {
    let pos = substart;

    let bytes = EDITOR_textByteList.bytes;

    let span;
    let textContent;
    let className;

    /**
     * At times you are accumulating a larger and larger span of text, up until the point of encountering a differing syntax.
     * The textContent variable might already be in use for the differing syntax.
     * Thus in those scenarios the flushTextContent contains the prior accumulated text that you need to write out prior to the encountered syntax.
     */
    let flushTextContent;

    let shouldSkipContiguous;

    while (pos < lineEnd) {
        switch (bytes[pos]) {
            case 97:  // a
            case 98:  // b
            case 99:  // c
            case 100: // d
            case 101: // e
            case 102: // f
            case 103: // g
            case 104: // h
            case 105: // i
            case 106: // j
            case 107: // k
            case 108: // l
            case 109: // m
            case 110: // n
            case 111: // o
            case 112: // p
            case 113: // q
            case 114: // r
            case 115: // s
            case 116: // t
            case 117: // u
            case 118: // v
            case 119: // w
            case 120: // x
            case 121: // y
            case 122: // z
            case 65:  // A
            case 66:  // B
            case 67:  // C
            case 68:  // D
            case 69:  // E
            case 70:  // F
            case 71:  // G
            case 72:  // H
            case 73:  // I
            case 74:  // J
            case 75:  // K
            case 76:  // L
            case 77:  // M
            case 78:  // N
            case 79:  // O
            case 80:  // P
            case 81:  // Q
            case 82:  // R
            case 83:  // S
            case 84:  // T
            case 85:  // U
            case 86:  // V
            case 87:  // W
            case 88:  // X
            case 89:  // Y
            case 90:  // Z
            case 95:  // _
                let wordstart = pos;

                // you don't know if a word is a keyword until you've read the keyword.
                // so until that point you're tracking it along with all the other text/whitespace on the line
                // and planning to make everything just a single span.

                let charIntSum = 0;

                outer: while (pos < lineEnd) {
                    switch (bytes[pos]) {
                        case 97:  // a
                        case 98:  // b
                        case 99:  // c
                        case 100: // d
                        case 101: // e
                        case 102: // f
                        case 103: // g
                        case 104: // h
                        case 105: // i
                        case 106: // j
                        case 107: // k
                        case 108: // l
                        case 109: // m
                        case 110: // n
                        case 111: // o
                        case 112: // p
                        case 113: // q
                        case 114: // r
                        case 115: // s
                        case 116: // t
                        case 117: // u
                        case 118: // v
                        case 119: // w
                        case 120: // x
                        case 121: // y
                        case 122: // z
                        case 65:  // A
                        case 66:  // B
                        case 67:  // C
                        case 68:  // D
                        case 69:  // E
                        case 70:  // F
                        case 71:  // G
                        case 72:  // H
                        case 73:  // I
                        case 74:  // J
                        case 75:  // K
                        case 76:  // L
                        case 77:  // M
                        case 78:  // N
                        case 79:  // O
                        case 80:  // P
                        case 81:  // Q
                        case 82:  // R
                        case 83:  // S
                        case 84:  // T
                        case 85:  // U
                        case 86:  // V
                        case 87:  // W
                        case 88:  // X
                        case 89:  // Y
                        case 90:  // Z
                        case 95:  // _
                        case 48:  // 0
                        case 49:  // 1
                        case 50:  // 2
                        case 51:  // 3
                        case 52:  // 4
                        case 53:  // 5
                        case 54:  // 6
                        case 55:  // 7
                        case 56:  // 8
                        case 57:  // 9
                            charIntSum += bytes[pos];
                            pos++;
                            break;
                        default:
                            break outer;
                    }
                }
                // heuristic for possible keyword is comparing char int sum:
                //
                // const
                // c 99
                // o 111
                // n 110
                // s 115
                // t 116
                //
                // 551
                // 
                let wordlength = pos - wordstart;
                switch (charIntSum) {
                    case 551: // const
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 99  /* 'c' */ &&
                            bytes[wordstart + 1] === 111 /* 'o' */ &&
                            bytes[wordstart + 2] === 110 /* 'n' */ &&
                            bytes[wordstart + 3] === 115 /* 's' */ &&
                            bytes[wordstart + 4] === 116 /* 't' */) {
                                className = 'eK';
                                textContent = 'const';
                                break;
                        }
                        className = '';
                        break;
                    case 325: // let
                        if (wordlength === 3 &&
                            bytes[wordstart + 0] === 108 /* 'l' */ &&
                            bytes[wordstart + 1] === 101 /* 'e' */ &&
                            bytes[wordstart + 2] === 116 /* 't' */) {
                                className = 'eK';
                                textContent = 'let';
                                break;
                        }
                        className = '';
                        break;
                    case 870: // function
                        if (wordlength === 8 &&
                            bytes[wordstart + 0] === 102 /* 'f' */ &&
                            bytes[wordstart + 1] === 117 /* 'u' */ &&
                            bytes[wordstart + 2] === 110 /* 'n' */ &&
                            bytes[wordstart + 3] === 99  /* 'c' */ &&
                            bytes[wordstart + 4] === 116 /* 't' */ &&
                            bytes[wordstart + 5] === 105 /* 'i' */ &&
                            bytes[wordstart + 6] === 111 /* 'o' */ &&
                            bytes[wordstart + 7] === 110 /* 'n' */) {
                                className = 'eK';
                                textContent = 'function';
                                break;
                        }
                        className = '';
                        break;
                    case 207: // if
                        if (wordlength === 2 &&
                            bytes[wordstart + 0] === 105 /* 'i' */ &&
                            bytes[wordstart + 1] === 102 /* 'f' */) {
                                className = 'eKC';
                                textContent = 'if';
                                break;
                        }
                        className = '';
                        break;
                    case 351: // try
                        if (wordlength === 3 &&
                            bytes[wordstart + 0] === 116 /* 't' */ &&
                            bytes[wordstart + 1] === 114 /* 'r' */ &&
                            bytes[wordstart + 2] === 121 /* 'y' */) {
                                className = 'eK';
                                textContent = 'try';
                                break;
                        }
                        className = '';
                        break;
                    case 327: // for
                        if (wordlength === 3 &&
                            bytes[wordstart + 0] === 102 /* 'f' */ &&
                            bytes[wordstart + 1] === 111 /* 'o' */ &&
                            bytes[wordstart + 2] === 114 /* 'r' */) {
                                className = 'eKC';
                                textContent = 'for';
                                break;
                        }
                        className = '';
                        break;
                    case 329: // var
                        if (wordlength === 3 &&
                            bytes[wordstart + 0] === 118 /* 'v' */ &&
                            bytes[wordstart + 1] === 97  /* 'a' */ &&
                            bytes[wordstart + 2] === 114 /* 'r' */) {
                                className = 'eK';
                                textContent = 'var';
                                break;
                        }
                        className = '';
                        break;
                    case 515: // catch
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 99  /* 'c' */ &&
                            bytes[wordstart + 1] === 97  /* 'a' */ &&
                            bytes[wordstart + 2] === 116 /* 't' */ &&
                            bytes[wordstart + 3] === 99  /* 'c' */ &&
                            bytes[wordstart + 4] === 104 /* 'h' */) {
                                className = 'eK';
                                textContent = 'catch';
                                break;
                        }
                        className = '';
                        break;
                    case 672: // return
                        if (wordlength === 6 &&
                            bytes[wordstart + 0] === 114 /* 'r' */ &&
                            bytes[wordstart + 1] === 101 /* 'e' */ &&
                            bytes[wordstart + 2] === 116 /* 't' */ &&
                            bytes[wordstart + 3] === 117 /* 'u' */ &&
                            bytes[wordstart + 4] === 114 /* 'r' */ &&
                            bytes[wordstart + 5] === 110 /* 'n' */) {
                                className = 'eKC';
                                textContent = 'return';
                                break;
                        }
                        className = '';
                        break;
                    case 658: // switch
                        if (wordlength === 6 &&
                            bytes[wordstart + 0] === 115 /* 's' */ &&
                            bytes[wordstart + 1] === 119 /* 'w' */ &&
                            bytes[wordstart + 2] === 105 /* 'i' */ &&
                            bytes[wordstart + 3] === 116 /* 't' */ &&
                            bytes[wordstart + 4] === 99  /* 'c' */ &&
                            bytes[wordstart + 5] === 104 /* 'h' */) {
                                className = 'eKC';
                                textContent = 'switch';
                                break;
                        }
                        className = '';
                        break;
                    case 412: // case
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 99  /* 'c' */ &&
                            bytes[wordstart + 1] === 97  /* 'a' */ &&
                            bytes[wordstart + 2] === 115 /* 's' */ &&
                            bytes[wordstart + 3] === 101 /* 'e' */) {
                                className = 'eKC';
                                textContent = 'case';
                                break;
                        }
                        className = '';
                        break;
                    case 542: // async
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 97  /* 'a' */ &&
                            bytes[wordstart + 1] === 115 /* 's' */ &&
                            bytes[wordstart + 2] === 121 /* 'y' */ &&
                            bytes[wordstart + 3] === 110 /* 'n' */ &&
                            bytes[wordstart + 4] === 99  /* 'c' */) {
                                className = 'eK';
                                textContent = 'async';
                                break;
                        }
                        className = '';
                        break;
                    case 425: // else
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 101 /* 'e' */ &&
                            bytes[wordstart + 1] === 108 /* 'l' */ &&
                            bytes[wordstart + 2] === 115 /* 's' */ &&
                            bytes[wordstart + 3] === 101 /* 'e' */) {
                                className = 'eKC';
                                textContent = 'else';
                                break;
                        }
                        className = '';
                        break;
                    case 741: // default
                        if (wordlength === 7 &&
                            bytes[wordstart + 0] === 100 /* 'd' */ &&
                            bytes[wordstart + 1] === 101 /* 'e' */ &&
                            bytes[wordstart + 2] === 102 /* 'f' */ &&
                            bytes[wordstart + 3] === 97  /* 'a' */ &&
                            bytes[wordstart + 4] === 117 /* 'u' */ &&
                            bytes[wordstart + 5] === 108 /* 'l' */ &&
                            bytes[wordstart + 6] === 116 /* 't' */) {
                                className = 'eK';
                                textContent = 'default';
                                break;
                        }
                        className = '';
                        break;
                    case 564: // throw
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 116 /* 't' */ &&
                            bytes[wordstart + 1] === 104 /* 'h' */ &&
                            bytes[wordstart + 2] === 114 /* 'r' */ &&
                            bytes[wordstart + 3] === 111 /* 'o' */ &&
                            bytes[wordstart + 4] === 119 /* 'w' */) {
                                className = 'eK';
                                textContent = 'throw';
                                break;
                        }
                        className = '';
                        break;
                    case 330: // new
                        if (wordlength === 3 &&
                            bytes[wordstart + 0] === 110 /* 'n' */ &&
                            bytes[wordstart + 1] === 101 /* 'e' */ &&
                            bytes[wordstart + 2] === 119 /* 'w' */) {
                                className = 'eK';
                                textContent = 'new';
                                break;
                        }
                        className = '';
                        break;
                    case 534: // class
                        if (wordlength === 5) {
                            if (bytes[wordstart + 0] === 97  /* 'a' */ &&
                                bytes[wordstart + 1] === 119 /* 'w' */ &&
                                bytes[wordstart + 2] === 97  /* 'a' */ &&
                                bytes[wordstart + 3] === 105 /* 'i' */ &&
                                bytes[wordstart + 4] === 116 /* 't' */) {
                                
                                    className = 'eK';
                                	textContent = 'await';
                                    break;
                            }
                            else if (bytes[wordstart + 0] === 99  /* 'c' */ &&
                                     bytes[wordstart + 1] === 108 /* 'l' */ &&
                                     bytes[wordstart + 2] === 97  /* 'a' */ &&
                                     bytes[wordstart + 3] === 115 /* 's' */ &&
                                     bytes[wordstart + 4] === 115 /* 's' */) {

                                    className = 'eK';
                                	textContent = 'class';
                                    break;
                            }
                        }
                        className = '';
                        break;
                    case 1222: // constructor
                        if (wordlength === 11 &&
                            bytes[wordstart + 0] === 99   /* 'c' */ &&
                            bytes[wordstart + 1] === 111  /* 'o' */ &&
                            bytes[wordstart + 2] === 110  /* 'n' */ &&
                            bytes[wordstart + 3] === 115  /* 's' */ &&
                            bytes[wordstart + 4] === 116  /* 't' */ &&
                            bytes[wordstart + 5] === 114  /* 'r' */ &&
                            bytes[wordstart + 6] === 117  /* 'u' */ &&
                            bytes[wordstart + 7] === 99   /* 'c' */ &&
                            bytes[wordstart + 8] === 116  /* 't' */ &&
                            bytes[wordstart + 9] === 111  /* 'o' */ &&
                            bytes[wordstart + 10] === 114 /* 'r' */) {
                                className = 'eK';
                                textContent = 'constructor';
                                break;
                        }
                        className = '';
                        break;
                    case 667: // import
                        if (wordlength === 6 &&
                            bytes[wordstart + 0] === 105 /* 'i' */ &&
                            bytes[wordstart + 1] === 109 /* 'm' */ &&
                            bytes[wordstart + 2] === 112 /* 'p' */ &&
                            bytes[wordstart + 3] === 111 /* 'o' */ &&
                            bytes[wordstart + 4] === 114 /* 'r' */ &&
                            bytes[wordstart + 5] === 116 /* 't' */) {
                                className = 'eKC';
                                textContent = 'import';
                                break;
                        }
                        className = '';
                        break;
                    case 436: // from
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 102 /* 'f' */ &&
                            bytes[wordstart + 1] === 114 /* 'r' */ &&
                            bytes[wordstart + 2] === 111 /* 'o' */ &&
                            bytes[wordstart + 3] === 109 /* 'm' */) {
                                className = 'eKC';
                                textContent = 'from';
                                break;
                        }
                        className = '';
                        break;
                    case 674: // export
                        if (wordlength === 6 &&
                            bytes[wordstart + 0] === 101 /* 'e' */ &&
                            bytes[wordstart + 1] === 120 /* 'x' */ &&
                            bytes[wordstart + 2] === 112 /* 'p' */ &&
                            bytes[wordstart + 3] === 111 /* 'o' */ &&
                            bytes[wordstart + 4] === 114 /* 'r' */ &&
                            bytes[wordstart + 5] === 116 /* 't' */) {
                                className = 'eK';
                                textContent = 'export';
                                break;
                        }
                        className = '';
                        break;
                    case 440: // this
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 116 /* 't' */ &&
                            bytes[wordstart + 1] === 104 /* 'h' */ &&
                            bytes[wordstart + 2] === 105 /* 'i' */ &&
                            bytes[wordstart + 3] === 115 /* 's' */) {
                                className = 'eK';
                                textContent = 'this';
                                break;
                        }
                        className = '';
                        break;
                    case 537: // while
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 119 /* 'w' */ &&
                            bytes[wordstart + 1] === 104 /* 'h' */ &&
                            bytes[wordstart + 2] === 105 /* 'i' */ &&
                            bytes[wordstart + 3] === 108 /* 'l' */ &&
                            bytes[wordstart + 4] === 101 /* 'e' */) {
                                className = 'eKC';
                                textContent = 'while';
                                break;
                        }
                        className = '';
                        break;
                    case 517: // break
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 98  /* 'b' */ &&
                            bytes[wordstart + 1] === 114 /* 'r' */ &&
                            bytes[wordstart + 2] === 101 /* 'e' */ &&
                            bytes[wordstart + 3] === 97  /* 'a' */ &&
                            bytes[wordstart + 4] === 107 /* 'k' */) {
                                className = 'eKC';
                                textContent = 'break';
                                break;
                        }
                        className = '';
                        break;
                    case 869: // continue
                        if (wordlength === 8 &&
                            bytes[wordstart + 0] === 99  /* 'c' */ &&
                            bytes[wordstart + 1] === 111 /* 'o' */ &&
                            bytes[wordstart + 2] === 110 /* 'n' */ &&
                            bytes[wordstart + 3] === 116 /* 't' */ &&
                            bytes[wordstart + 4] === 105 /* 'i' */ &&
                            bytes[wordstart + 5] === 110 /* 'n' */ &&
                            bytes[wordstart + 6] === 117 /* 'u' */ &&
                            bytes[wordstart + 7] === 101 /* 'e' */) {
                                className = 'eKC';
                                textContent = 'continue';
                                break;
                        }
                        className = '';
                        break;
                    case 448: // true
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 116 /* 't' */ &&
                            bytes[wordstart + 1] === 114 /* 'r' */ &&
                            bytes[wordstart + 2] === 117 /* 'u' */ &&
                            bytes[wordstart + 3] === 101 /* 'e' */) {
                                className = 'eK';
                                textContent = 'true';
                                break;
                        }
                        className = '';
                        break;
                    case 523: // false
                        if (wordlength === 5 &&
                            bytes[wordstart + 0] === 102 /* 'f' */ &&
                            bytes[wordstart + 1] === 97  /* 'a' */ &&
                            bytes[wordstart + 2] === 108 /* 'l' */ &&
                            bytes[wordstart + 3] === 115 /* 's' */ &&
                            bytes[wordstart + 4] === 101 /* 'e' */) {
                                className = 'eK';
                                textContent = 'false';
                                break;
                        }
                        className = '';
                        break;
                    case 443: // null
                        if (wordlength === 4 &&
                            bytes[wordstart + 0] === 110 /* 'n' */ &&
                            bytes[wordstart + 1] === 117 /* 'u' */ &&
                            bytes[wordstart + 2] === 108 /* 'l' */ &&
                            bytes[wordstart + 3] === 108 /* 'l' */) {
                                className = 'eK';
                                textContent = 'null';
                                break;
                        }
                        className = '';
                        break;
                    default:
                        className = '';
                        break;
                }
                if (className) {
                    // is done when there IS a valid match, in order to write out any pending text that came prior to the keyword.
                    if (substart < wordstart) {
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = wordstart));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }

                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = className;
                        span.textContent = textContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.className = className;
                        span.textContent = textContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                    substart += wordlength;
                }
                continue;
            case get_js_FORWARDSLASH():
                if (bytes[pos + 1] === get_js_FORWARDSLASH()) {

                    if (substart < pos) {
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }

                    // lex_comment_singleLine(...)

                    // The current character is the first forward slash of the 'two consecutive ones' that represent the start of a single line comment.
                    // "changing" this to guarantee at least 1 read means you can continue after the invocation returns (for the while loop)
                    // All in all, this already was guaranteed to read at least 1 since the while loop's condition in this method
                    // This change is moreso a matter of anxiety and me not wanting to deal with this at the moment so I need to see the explicit read here so I can sleep at night for the time being until my stress levels are lower.
                    pos++;
                    while (pos < lineEnd) {
                        if (bytes[pos] === get_js_LINEFEED()) {
                            break;
                        }
                        pos++;
                    }

                    // TODO: I think checking this is redundant because you guaranteed at least one increment?
                    if (substart < pos) {
                        textContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = 'eC';
                            span.textContent = textContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.className = 'eC';
                            span.textContent = textContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }

                    continue;
                }
                else if (bytes[pos + 1] === get_js_ASTERISK()) {
                    if (substart < pos) { // write any text that came prior, and on the same line.
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }

                    // Move past the 'forwardslash and asterisk'
                    pos += 2;

                    // I'm starting this at 2 because 0 would bug (-1 + 1 === 0)
                    // but then I just don't want to deal with this so I need to go 1,
                    // then like I'm tired and I don't want to deal with this so I'll just go to 2 and surely nothing bad can happen
                    // but in reality I probably only need to start at 1 (or start of other ticket variables + 2 or something idk I don't wanna deal with this right now).
                    let ticketSource = 2;
                    let ticketAsterisk = -1;
                    let ticketForwardSlash = -1;
                    while (pos < lineEnd) {
                        switch (bytes[pos]) {
                            case get_js_ASTERISK():
                                ticketAsterisk = ticketSource++;
                                break;
                            case get_js_FORWARDSLASH():
                                ticketForwardSlash = ticketSource++;
                                break;
                            case get_js_LINEFEED():
                                ticketSource++;
                                break;
                            default:
                                ticketSource++;
                                break;
                        }
                        pos++;
                        if (ticketAsterisk + 1 === ticketForwardSlash) {
                            break;
                        }
                    }

                    textContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = 'eCm';
                        span.textContent = textContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.className = 'eCm';
                        span.textContent = textContent;
                        div.appendChild(span);
                        childIndex++;
                    }

                    continue;
                }

                break;
            case get_js_DOUBLEQUOTE():
                if (substart < pos) {
                    flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = '';
                        span.textContent = flushTextContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.textContent = flushTextContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                }
                // This code is somewhat a duplication of 'function lex_string(...)'
                //
                // likely what started the string is the same as the terminator, so you need to move ahead one position before starting the loop.
                pos++;
                outer: while (pos < lineEnd) {
                    switch (bytes[pos]) {
                        case get_js_DOUBLEQUOTE():
                            pos++;
                            break outer;
                        case get_js_BACKSLASH():
                            pos++;
                            if (pos < lineEnd) {
                                pos++; // skip the escaped character provided that the file didn't end after the original backslash
                            }
                            continue /*outer*/;
                        default:
                            pos++;
                            break;
                    }
                }
                textContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                if (childIndex < div.children.length) {
                    span = div.children[childIndex++];
                    span.className = 'eS';
                    span.textContent = textContent;
                }
                else {
                    span = document.createElement('span');
                    span.className = 'eS';
                    span.textContent = textContent;
                    div.appendChild(span);
                    childIndex++;
                }
                continue;
            case get_js_SINGLEQUOTE():
                if (substart < pos) {
                    flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = '';
                        span.textContent = flushTextContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.textContent = flushTextContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                }
                // This code is somewhat a duplication of 'function lex_string(...)'
                //
                // likely what started the string is the same as the terminator, so you need to move ahead one position before starting the loop.
                pos++;
                outer: while (pos < lineEnd) {
                    switch (bytes[pos]) {
                        case get_js_SINGLEQUOTE():
                            pos++;
                            break outer;
                        case get_js_BACKSLASH():
                            pos++;
                            if (pos < lineEnd) {
                                pos++; // skip the escaped character provided that the file didn't end after the original backslash
                            }
                            continue /*outer*/;
                        default:
                            pos++;
                            break;
                    }
                }
                textContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                if (childIndex < div.children.length) {
                    span = div.children[childIndex++];
                    span.className = 'eS';
                    span.textContent = textContent;
                }
                else {
                    span = document.createElement('span');
                    span.className = 'eS';
                    span.textContent = textContent;
                    div.appendChild(span);
                    childIndex++;
                }
                continue;
            case get_js_BACKTICK():
                if (substart < pos) {
                    flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = '';
                        span.textContent = flushTextContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.textContent = flushTextContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                }
                // This code is somewhat a duplication of 'function lex_string(...)'
                //
                // likely what started the string is the same as the terminator, so you need to move ahead one position before starting the loop.
                pos++;
                outer: while (pos < lineEnd) {
                    switch (bytes[pos]) {
                        case get_js_BACKTICK():
                            pos++;
                            break outer;
                        case get_js_BACKSLASH():
                            pos++;
                            if (pos < lineEnd) {
                                pos++; // skip the escaped character provided that the file didn't end after the original backslash
                            }
                            continue /*outer*/;
                        default:
                            pos++;
                            break;
                    }
                }
                textContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                if (childIndex < div.children.length) {
                    span = div.children[childIndex++];
                    span.className = 'eSm';
                    span.textContent = textContent;
                }
                else {
                    span = document.createElement('span');
                    span.className = 'eSm';
                    span.textContent = textContent;
                    div.appendChild(span);
                    childIndex++;
                }
                continue;
            case get_js_EQUALS():
                // I think I actually want to handle the '==', '===', and '===...=' cases just so I can skip over the text quickly.
                // Otherwise every time I see '=' I have to check the left and right side and it is quite redundant?
                //
                // I also have to consider anything of the form '+=' then typing '=' after it for '+=='. I don't think this is valid but I need to consider it I'll probably skip over any '=' that appear after the first '+=' text and is contiguous?
                // No that doesn't work because you're adding this step to every syntax that ends in '=' that it has to understand the '=' case.
                // What you want is a left check, but that the left check only happens once per contiguous block of '=' incase the left '=' isn't part of your syntax.
                //
                
                // NOTE: A presumption is being made here that "any multiline syntax that spans multiple lines, won't end in ="...
                // ...this presumption permits checking only the text that is in bounds of substart and lineEnd.
                
                // TODO: This contiguous skipping logic isn't working for every switch case?
                //
                // TODO: If this contiguous skipping logic works for the '=' it will handle both '!=' and '!==' solely by checking for '!='
                //
                // let shouldSkipContiguous;... sneaky uninitialized variable conversion to a falsey or something was going on?
                shouldSkipContiguous = false;
                if (pos > substart) {
                    if (bytes[pos - 1] === get_js_EQUALS()) {
                        shouldSkipContiguous = true;
                    }
                    else if (bytes[pos - 1] === get_js_BANG()) {
                        shouldSkipContiguous = true;
                    }
                    else if (bytes[pos - 1] === get_js_OPENBRACKET()) {
                        shouldSkipContiguous = true;
                    }
                    else if (bytes[pos - 1] === get_js_CLOSEBRACKET()) {
                        shouldSkipContiguous = true;
                    }
                }
                else {
                    shouldSkipContiguous = false;
                }
                if (!shouldSkipContiguous) {
                    if (pos < lineEnd && bytes[pos + 1] === get_js_EQUALS()) {
                        shouldSkipContiguous = true;
                    }
                }
                
                if (shouldSkipContiguous) {
                    // skip current
                    pos++;
                    // skip contiguous
                    while (pos < lineEnd && bytes[pos] === get_js_EQUALS()) {
                        pos++;
                    }
                    continue;
                }
                else {
                    if (substart < pos) { // write any text that came prior, and on the same line.
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }
                    // I don't know if I would count '=>' as an "assignment operator"... maybe I would but I'm too focused on whether I'd count it as such that I can't figure out the way to make it work. So I need to just make it work first.
                    pos++;
                    substart++;
                    if (pos < lineEnd && bytes[pos] === get_js_CLOSEBRACKET()) {
                        textContent = '=>';
                        pos++;
                        substart++;
                    }
                    else {
                        textContent = '=';
                    }
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = 'eOA';
                        span.textContent = textContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.className = 'eOA';
                        span.textContent = textContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                    continue;
                }
                
                // TODO: you don't understand how code caching or like instruction caching etc works with respect to whether inlining interupts things
                break;
            case get_js_PLUS():
                // ++
                // +=
                
                // If "some syntax that I don't actually think exists" such as '=+' were to exist I'd need to care for '=+' then a '+' making '=++'
                // this should cause a skipping of contiguous '+' in my initial opinion so that's what I'll probably do.
                // 
                // I have a better example now... '++' then you type '+' causing '+++', the first two '++' are syntax highlighted and the third isn't.
                // Some might say you should not syntax highlight any of the plus in that case because you're reading the operator as '++'
                // rather than the combination of '++' and '+'. I think I'm somewhat indifferent but I lean towards syntax highlighting
                // the two plus characters and not doing so for the final '+' (at least my initial opinion is that).
                //
                // ++++
                // It doesn't actually work... I tried it and '+++' works but then '++++' is two '++' rather than one '++' and then just the "text of '++'".
                //
                
                // NOTE: A presumption is being made here that "any multiline syntax that spans multiple lines, won't end in +"...
                // ...this presumption permits checking only the text that is in bounds of substart and lineEnd.
                
                // TODO: This contiguous skipping logic isn't working for every switch case?
                shouldSkipContiguous = pos > substart && bytes[pos - 1] === get_js_PLUS();
                if (!shouldSkipContiguous) {
                    if (pos < lineEnd) {
                        if (bytes[pos + 1] === get_js_PLUS()) {
                            textContent = '++';
                        }
                        else if (bytes[pos + 1] === get_js_EQUALS()) {
                            textContent = '+=';
                        }
                        else {
                            shouldSkipContiguous = true;
                        }
                    }
                    else {
                        shouldSkipContiguous = true;
                    }
                }
                
                if (shouldSkipContiguous) {
                    // skip current
                    pos++;
                    // skip contiguous
                    while (pos < lineEnd && bytes[pos] === get_js_PLUS()) {
                        pos++;
                    }
                    continue;
                }
                else {
                    if (substart < pos) { // write any text that came prior, and on the same line.
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }
                    pos += 2;
                    substart += 2;
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = 'eOA';
                        span.textContent = textContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.className = 'eOA';
                        span.textContent = textContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                    continue;
                }
            case get_js_MINUS():
                // --
                // -=
                
                // NOTE: A presumption is being made here that "any multiline syntax that spans multiple lines, won't end in -"...
                // ...this presumption permits checking only the text that is in bounds of substart and lineEnd.
                
                // When you switch on '+' then check for '-' or '+'... should you do something relating to NOT invoking the decode function and instead
                // you just "know" the text that goes there based on your conditional branching?
                    
                // TODO: This contiguous skipping logic isn't working for every switch case?
                shouldSkipContiguous = pos > substart && bytes[pos - 1] === get_js_MINUS();
                if (!shouldSkipContiguous) {
                    if (pos < lineEnd) {
                        if (bytes[pos + 1] === get_js_MINUS()) {
                            textContent = '--';
                        }
                        else if (bytes[pos + 1] === get_js_EQUALS()) {
                            textContent = '-=';
                        }
                        else {
                            shouldSkipContiguous = true;
                        }
                    }
                    else {
                        shouldSkipContiguous = true;
                    }
                }
                
                if (shouldSkipContiguous) {
                    // skip current
                    pos++;
                    // skip contiguous
                    while (pos < lineEnd && bytes[pos] === get_js_MINUS()) {
                        pos++;
                    }
                    continue;
                }
                else {
                    if (substart < pos) { // write any text that came prior, and on the same line.
                        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
                        if (childIndex < div.children.length) {
                            span = div.children[childIndex++];
                            span.className = '';
                            span.textContent = flushTextContent;
                        }
                        else {
                            span = document.createElement('span');
                            span.textContent = flushTextContent;
                            div.appendChild(span);
                            childIndex++;
                        }
                    }
                    pos += 2;
                    substart += 2;
                    if (childIndex < div.children.length) {
                        span = div.children[childIndex++];
                        span.className = 'eOA';
                        span.textContent = textContent;
                    }
                    else {
                        span = document.createElement('span');
                        span.className = 'eOA';
                        span.textContent = textContent;
                        div.appendChild(span);
                        childIndex++;
                    }
                    continue;
                }
        }
        pos++;
    }

    // TODO: Consider the final pos? Is this gonna bug? I don't think it will.
    if (substart < pos) {
        flushTextContent = EDITOR_decoder.decode(bytes.subarray(substart, substart = pos));
        if (childIndex < div.children.length) {
            span = div.children[childIndex++];
            span.className = '';
            span.textContent = flushTextContent;
        }
        else {
            span = document.createElement('span');
            span.textContent = flushTextContent;
            div.appendChild(span);
            childIndex++;
        }
    }

    return childIndex;
}
