//__#__
// preprocessor.cjs
import "./header_editorGlobal_header"
import "./fieldBuffer"
import "./javascriptFeatures"
//__#__

/*
###################################
# Wording related to "indexLine": #
###################################

- indexLine        // The line number of '1' corresponds to the '0' indexLine; The end position of this line is located at index '0' within 'EDITOR_lineEndPositionList'.
- virtualIndexLine // If you map the indexLine to an index that exists from virtualIndex to (virtualIndex + virtualCount - 1); both sides are inclusive;
                   // Then you could imagine that the UI has HTML divs available to be rendered into.
                   // And that this 'virtualIndexLine' says: "given my indexLine, is this being shown in the UI?"
                   // BUT there is more to this, you next have to consider the position of the belt.
    - TODO: Consider calling this 'partial' instead of 'virtual' because 'virtual' sounds too "usable". You often can't do anything with this because you have to map it to the "belt".
    - TODO: I actually think the word 'virtual' fits well here. It is a non-physical index.
            And then you take that non-physical index and map it to the "belt" which sounds like a more 'physical' concept.
            To me I've been using the word 'virtual' for a while when mapping to the UI so it is confusing to me.
            But I think in time this actually sounds sensible.
- beltIndexLine    // I'm not well versed in this topic.
                   // But I think of a belt and a pully wheel.
                   // The belt wraps around the pulley wheel, and the belt has indices from 0 to (virtualCount - 1); both sides are inclusive.
                   // As you scroll this belt is constantly rotating around the pulley wheel and your zeroth index is constantly changing.
                   //
                   // This concept makes far more sense if you consider things from a 'cumulative layout shift' perspective.
                   // Because the simpler approach of moving the HTML elements around cannot be done in a performant manner given the intracicies of how HTML works.

Why is it not a 'lineIndex' wording pattern?

It tends to be the case that you are working with an 'index'
so the inclusion of that word is rather unimportant when reading over the code.

I actually think 'lineIndex' "rolls off the tongue" a little easier.
But if you apply the pattern it hides the word 'line'.
And the importance when reading the code lies with the words 'line' and 'column'.

- [ ] When getting the beltIndex of anything that follows this pattern you don't check whether the underlying data has a large enough count, it is solely related to whether the itemHeight and height of the element can fit "that many divs".
    - [ ] TreeView
    - [ ] List
- [ ] When creating divs for the viewport you follow up by drawing the viewport afterwards.
    - [ ] Thus the creation of divs ought to be fully ignoring any excessive calculations because its style is just overriden immediately afterwards.
*/

/*
#####################
# Handling of tabs: #
#####################

What I do with tabs is a terrible idea.
I convert them from '\t' to '\t\0\0\0'.
Then I set tab-size to 1 for '#EDITOR_text'.

This maps a tab width of 4 to 4 characters.
I save out the content by skipping over the '\0'.

And the editor itself ought to handle '\0' such that you are at the expected position
rather than ever being at or modifying a '\0' itself.
I haven't gotten to this part though.

Perhaps what I'm doing is working with font styling I don't know I need to find time to look into it.

But the issue is that tab is a control character and has extra processing than a normal character.
And it can introduce oddities involving tabstop or very tiny changes in horizontal positioning of surrounding text or something.

'\0' is a similar problem, it is a special character that might cause odd behavior.
*/

let EDITOR_trackedSyntaxList = new TrackedSyntaxList(32);

/**
 * @type {UInt32List}
 */
let EDITOR_findOverlay_searchResultPositionList;

let EDITOR_textByteList = new ByteList(1024);
const EDITOR_encoder = new TextEncoder();
const EDITOR_decoder = new TextDecoder();

class EDITOR_Cursor {

    static STATIC_CURSOR_ID = 1;
    /**
     * I'm not sure how large I want this, what matters is that I just have a size of anything for the time being, then can change this constant later.
     */
    static GAP_BUFFER_CAPACITY = 32;

    /**
     * After invoking the constructor you likely would want to add to:
     * - get_EDITOR_cursorListElement(),
     * - EDITOR_cursorList,
     * 
     * `get_EDITOR_cursorListElement().appendChild(cursorInstance.caretRow)`
     * `EDITOR_cursorList.splice(index, 0, cursorInstance)`
     */
    constructor() {
        this.indexLine = 0;
        this.indexColumn = 0;
        /**
         * When moving cursor vertically, if the current column index cannot be matched due to the upcoming line being too short,
         * then this will allow a later vertical movement to a line that is long enough to match the original column rather than the minimized one.
         */
        this.STORED_indexColumn = 0;
        this.cursorTranslateYValue = 0;
        this.cursorTranslateXValue = 0;
        this.selectionAnchor = 0;
        this.selectionEnd = 0;
        this.DRAWN_selectionAnchor = 0;
        this.DRAWN_selectionEnd = 0;
        this.DRAWN_selection_virtualIndexLine = 0;
        this.DRAWN_selection_virtualCount = 0;
        this.editKind = get_EditKind_None();
        this.editLength = 0;
        this.editPosition = 0;
        this.editIndexLine = 0;
        this.editIndexColumn = 0;
        this.END_editIndexLine = 0;
        this.END_editIndexColumn = 0;
        // TODO: This is supposed to say 'cursorId'
        this.cursorIndex = EDITOR_Cursor.STATIC_CURSOR_ID++;
        this.htmlId = "EDITOR_cursor-" + this.cursorIndex;
        
        /**
         * When this is cleared the information is not removed, only 'gapBufferCount' is set to 0.
         */
        this.gapBuffer = new Uint8Array(EDITOR_Cursor.GAP_BUFFER_CAPACITY);
        this.gapBufferCount = 0;
        this.gapBufferWriteToSpanElement = null;
        this.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;

        this.caretRow = document.createElement('div');
        this.caretRow.id = "EDITOR_caretRow-" + this.cursorIndex;
        this.caretRow.className = "EDITOR_caretRow";
        this.cursorElement = document.createElement('div');
        this.cursorElement.id = "EDITOR_cursor-" + this.cursorIndex;
        this.cursorElement.className = "EDITOR_cursor";
        
        this.caretRow.appendChild(this.cursorElement);

        /**
         * Upon an enter keystroke this is inserted onto the newly added line.
         * 
         * The value is stored here to avoid high overhead from indentation matching when holding down the Enter key.
         * 
         * TODO: ^ that being said, you preferably wouldn't store this string allocation long term. If a more "localized" caching can be implemented, that would be preferable. (or the timing upon which this is set to null)
         * 
         * TODO: Don't null this just change the count to 0 and use a separate bool to indicate "nullness". UNLESS if clearing cache and this is for some reason MASSIVE idk maybe > 256 then maybe clear it idk
         * 
         * TODO: clear these when setting text, if not already? My code isn't working so I can't give a better TODO than this
         * 
         * @type {ByteList | null}
         */
        this.cached_indentation_byteList = null;
        this.cached_indentation_string = null;
        this.enterKeyEventKind = get_EnterKeyEventKind_None();

        /**
         * TODO: probably is sensible to use this for the enter key too but I'm firstly adding it for the sake of backspace so
         * I don't have to waste time looping over the removed text to find the line end positions that are being removed.
         * (I could do some kind of other tracking but I chose not to for no particular reason, well I think I chose this one out of laziness and that the other solutions long term like a
         *  list at the editor level 1 of them that is shared among all cursors is probably better or something.)
         * 
         * ========
         * 
         * TODO: Cursor should store this as -1 to signify false,
         * and then it is a number 0 to ... the offset in the pending line end position list
         * and then you have another number too separately that says the length of line endings that this cursor contributed to modifying.
         */
        this.editLineFeedCount = 0;

        /**
         * TODO: Consider putting this at the editor level and then delay setting it to null until all cursors have made use of it?...
         * ...an NRE is thrown with this at the editor level so I'm moving it per cursor but...
         * Then again it is only multiple references, not multiple separate objects...
         */
        this.EDITOR_paste_clipboardContent = null;

        /** same comment that pertains to this.EDITOR_paste_clipboardContent is somewhat relevant here */
        this.EDITOR_duplicate_small = 0;
        /** same comment that pertains to this.EDITOR_paste_clipboardContent is somewhat relevant here */
        this.EDITOR_duplicate_length = 0;
    }

    hasSelection() {
        return this.selectionAnchor >= 0 &&
               this.selectionEnd >= 0 &&
               this.selectionAnchor != this.selectionEnd;
    }
    
    /**
     * The code that clears the editor is dependent on this method NOT clearing 'cursor.selectionDivExists'
     * 
     * Somewhat duplicated code: This messes with the language features if I invoke clear() in the constructor, it puts "| undefined" on all the types.
     */
    clear() {
        this.indexLine = 0;
        this.indexColumn = 0;
        this.STORED_indexColumn = 0;
        this.cursorTranslateYValue = 0;
        this.cursorTranslateXValue = 0;
        this.selectionAnchor = 0;
        this.selectionEnd = 0;
        this.DRAWN_selectionAnchor = 0;
        this.DRAWN_selectionEnd = 0;
        this.DRAWN_selection_virtualIndexLine = 0;
        this.DRAWN_selection_virtualCount = 0;
        this.editKind = get_EditKind_None();
        this.editLength = 0;
        this.editPosition = 0;
        this.editIndexLine = 0;
        this.editIndexColumn = 0;
        this.END_editIndexLine = 0;
        this.END_editIndexColumn = 0;

        this.gapBufferCount = 0;

        this.cached_indentation_byteList = null;
        this.cached_indentation_string = null;
        this.enterKeyEventKind = get_EnterKeyEventKind_None();

        this.editLineFeedCount = 0;

        this.EDITOR_paste_clipboardContent = null;

        this.EDITOR_duplicate_small = 0;
        this.EDITOR_duplicate_length = 0;
    }

    /**
     * Not all properties are necessarily cloned in this method:
     */
    clone() {
        let clone = new EDITOR_Cursor();
        clone.indexLine = this.indexLine;
        clone.indexColumn = this.indexColumn;
        clone.STORED_indexColumn = this.STORED_indexColumn;
        clone.cursorTranslateYValue = this.cursorTranslateYValue;
        clone.cursorTranslateXValue = this.cursorTranslateXValue;
        return clone;
    }
}

const EDITOR_debug = document.getElementById('EDITOR_debug');
const EDITOR_findOverlay = document.getElementById('EDITOR_findOverlay');
EDITOR_findOverlay.style.visibility = 'hidden';

const EDITOR_gutterBackgroundColor = document.getElementById('EDITOR_gutter_background_color');

/**
 * Null characters provide visual width for proportional fonts. They do not get copied or saved out.
 */
let EDITOR_on_tab_bytes = EDITOR_tab_tabsbytes;

/**
 * When a cursor removes a line end the position of the line end is stored in this list until the edit is finalized.
 */
let EDITOR_lineEndPositionList_PENDING = new UInt32List(128);

/**
 * IMPORTANT: use EDITOR_readLineEndPositionList(...) rather than indexing into this directly...
 * ...due to the possibility of pending edits.
 */
let EDITOR_lineEndPositionList = new UInt32List(128);

let EDITOR_primaryCursor = new EDITOR_Cursor();
get_EDITOR_cursorListElement().appendChild(EDITOR_primaryCursor.caretRow);
/**
 * Ensure that the cursors are sorted ascending by positionIndex (which is calculated via the method 'EDITOR_getPositionIndex(...)') at all times.
 */
let EDITOR_cursorList = [EDITOR_primaryCursor];

let EDITOR_textSourceIdentifier = '';
let EDITOR_FORMATTED_textSourceIdentifier = '';
let EDITOR_extensionKind = get_ExtensionKind_None();

let EDITOR_lineEndString = null;

let EDITOR_documentSymbolResult;
/**
 * @type {ListComponent}
 */
let EDITOR_listComponent = null;

let EDITOR_onMouseMove_timer = null;
let EDITOR_onMouseMove_event = null;

let didChangeTextDocumentNotificationPromise = null;

let EDITOR_onResize_timer = null;
let EDITOR_onResize_bool = null;

let EDITOR_offsetWithinSpan_withRespectToThisSpan = null;

let EDITOR_timer = null;

let EDITOR_pooledTrackedSyntax_trackedSyntaxKind = get_TrackedSyntaxKind_None();

let EDITOR_characterWidth = 8;
let EDITOR_horizontal_scrollbar_widthValue = 0;

let EDITOR_beltIndexZero = 0;

let w_indexColumn_Goal = -1;
let w_indexColumn_Sum = -1;
let w_indexColumn_SpanTextContentRelative = -1;
let w_indexSpan = -1;
let w_span = null;
let w_div = null;
let w_beltIndexLine = -1;

let EDITOR_syntaxHighlighting_previousIndexVirtual = 0;
let EDITOR_syntaxHighlighting_previousVirtualCount = 0;

let gutterWidthTotal = 0;

/**
 * TODO: It should be >= ?
 * 
 * @example EDITOR_indexLineTo_beltIndexLine(cursor.indexLine);
 * @returns you capture the variable then check it for < 0 (or the opposite '>=') i.e. => if (indexLine_VirtualRelative < 0) { return bad_state; } else { return good_state; }
 */
function EDITOR_indexLineTo_beltIndexLine(indexLine) {
    let virtualIndexLine = (indexLine + get_EDITOR_offsetLine()) - get_EDITOR_virtualIndexLine();
    // TODO: The following line of code (when I at one point had it commented out in a specific way, I'm adding this clarification after originally having made this comment I don't remember the specifics of how it was commented out, but parts of it were and other parts weren't) either didn't "preprocess" correctly or... well I mean it probably is my fault i.e.: the "preprocess" but yeah this is coming out to be 'return;' and that's it nothing else in the compiled end result so somewhere along the pipeline it got borked.
    return virtualIndexLine >= get_EDITOR_textElement().children.length ||
           virtualIndexLine < 0
               ? -1
               : ((virtualIndexLine = (virtualIndexLine + EDITOR_beltIndexZero)) > get_EDITOR_virtualCount()
                   ? virtualIndexLine - get_EDITOR_virtualCount()
                   : virtualIndexLine);
}

/** The argument is a beltIndexLine i.e.: the result of 'EDITOR_indexLineTo_beltIndexLine' (no validation is performed on the argument, it is presumed to be the index of a valid text editor line div dom element). This returns -1 if you go out of viewport. It will wrap around if you go too large because 'EDITOR_beltIndexZero' isn't 0. */
function EDITOR_beltIndexLine_NEXT(beltIndexLine) {
    beltIndexLine++;
    if (beltIndexLine >= get_EDITOR_textElement().children.length) {
        beltIndexLine -= get_EDITOR_textElement().children.length;
    }
    return beltIndexLine;
}

/** The argument is a beltIndexLine i.e.: the result of 'EDITOR_indexLineTo_beltIndexLine' (no validation is performed on the argument, it is presumed to be the index of a valid text editor line div dom element). This returns -1 if you go out of viewport. It will wrap around if you go too small because 'EDITOR_beltIndexZero' isn't 0. */
function EDITOR_beltIndexLine_PREVIOUS(beltIndexLine) {
    beltIndexLine--;
    if (beltIndexLine < 0) {
        beltIndexLine += get_EDITOR_textElement().children.length;
    }
    return beltIndexLine;
}

function EDITOR_init() {
    EDITOR_measureLineHeightAndCharacterWidth();

    let gutterPaddingLeft = get_EDITOR_gutterPaddingLeft() + 'px';
    let gutterPaddingRight = get_EDITOR_gutterPaddingRight() + 'px';
    let gutterWidth = EDITOR_characterWidth + 'px';

    get_EDITOR_gutter().style.paddingLeft = gutterPaddingLeft;
    get_EDITOR_gutter().style.paddingRight = gutterPaddingRight; 
    get_EDITOR_gutter().style.width = gutterWidth;

    EDITOR_gutterBackgroundColor.style.paddingLeft = gutterPaddingLeft;
    EDITOR_gutterBackgroundColor.style.paddingRight = gutterPaddingRight; 
    EDITOR_gutterBackgroundColor.style.width = gutterWidth;

    let left = (get_EDITOR_gutterPaddingLeft() + get_EDITOR_gutterPaddingRight() + EDITOR_characterWidth) + 'px';
    let width = 'calc(100% - ' + left + ')';

    //get_EDITOR_body().style.marginLeft = left;
    gutterWidthTotal = left;

    get_EDITOR_body().style.width = width;

    EDITOR_drawHorizontalScrollbar();

    EDITOR_registerHandlers();
}

/**
 * @param {*} indexLine
 * @returns {number} the last valid POSITION index on the line, but with respect to any pending edits.
 */
function EDITOR_readLineEndPositionList(indexLine) {
    let lineEndPositionIndex = EDITOR_lineEndPositionList.data[indexLine];

    // If you need to determine the text without finalizing an edit, you DO have to loop forwards right?
    for (var i = 0; i < EDITOR_cursorList.length; i++) {
        let cursor = EDITOR_cursorList[i];
        if (cursor.editLength > 0 & cursor.editPosition <= lineEndPositionIndex) {
            switch (cursor.editKind) {
                case get_EditKind_InsertLtr():
                    lineEndPositionIndex += cursor.editLength;
                    break;
                case get_EditKind_DeleteLtr():
                case get_EditKind_BackspaceRtl():
                case get_EditKind_RemoveTextNoBatching():
                    lineEndPositionIndex -= cursor.editLength;
                    break;
            }
        }
    }

    return lineEndPositionIndex;
}

function EDITOR_clear() {
    EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
    EDITOR_primaryCursor.clear();
    EDITOR_clearSelectionStyle(EDITOR_primaryCursor);
    set_EDITOR_recentBoundingClientRect_isNull_intFalsey(1);
    EDITOR_textSourceIdentifier = '';
    EDITOR_FORMATTED_textSourceIdentifier = '';
    EDITOR_extensionKind = get_ExtensionKind_None();
    set_EDITOR_fileStartsWithBom(false);
    EDITOR_lineEndString = null;
    get_EDITOR_textElement().innerHTML = '';
    EDITOR_lineEndPositionList.clear();
    get_EDITOR_gutter().innerHTML = '';
    EDITOR_textByteList.clear();
    set_EDITOR_longestLine_indexLine(0);
    set_EDITOR_longestLine_length(0);
    
    // Explicitly inlining 'clearMulticursorState()' because it currently is and I just don't want to make a decision about this right now.
    // So what I can do is mark the code paragraph for later decision making.
    set_EDITOR_indexCursor(0);
    set_EDITOR_offsetLine(0);
    set_EDITOR_offsetColumn_withRespectToThisIndexLine(0);
    set_EDITOR_offsetColumn(0);
    set_EDITOR_totalShift(0);
    EDITOR_offsetWithinSpan_withRespectToThisSpan = null;
    set_EDITOR_offsetWithinSpan(0);
    
    EDITOR_trackedSyntaxList.clear();
    EDITOR_drawCursor(EDITOR_primaryCursor);
}

/**
 * This function finalizes any pending edits foreach cursor in the EDITOR_cursorList.
 * 
 * Does NOT clear multicursors, only finalizes their respective edits;
 * 
 * see also: 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'
 * 
 * TODO: many places where this is invoked, it is likely intended to actually invoke 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...in order to permit slow 1 by 1 support for multicursor foreach scenario...
 * ...actually that's a good point...
 * ...you might wanna start by enabling multi-cursor insertion, but anything else invokes 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...then you can slowly add in support without breaking things?...
 * ...so specifically what I'm saying here is, an upcoming task would be...
 * ...simply to ensure that nearly every event invokes 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors'...
 * ...and that the ones which can't i.e.: batch insertions; you could do a check if cursor count >1 then finalize only the non-primary or some such...
 * ...then you remove the safeguard for 1 feature at a time.
 */
function EDITOR_finalizeAllCursors() {
    for (let i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        EDITOR_finalizeEdit(EDITOR_cursorList[i]);
    }
}

/**
 * This function finalizes pending edits foreach cursor in the EDITOR_cursorList
 * AND removes any non-EDITOR_primaryCursor from the EDITOR_cursorList.
 * 
 * see also: 'EDITOR_finalizeAllCursors'
 * 
 * TODO: a good name for this function
 */
function EDITOR_finalizeAllCursors_andClearNonPrimaryCursors() {
    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        let cursor = EDITOR_cursorList[i];
        EDITOR_finalizeEdit(cursor);
        if (cursor !== EDITOR_primaryCursor) {
            // A cursor is not necessarily rendered, thus this check
            if (cursor.caretRow.parentElement === get_EDITOR_cursorListElement()) {
                get_EDITOR_cursorListElement().removeChild(cursor.caretRow);
            }
            EDITOR_clearSelectionStyle(cursor);
            EDITOR_cursorList.splice(i, 1);
        }
    }
}

/**
 * Returns the underlying uint8array that contains the encoded characters for the text.
 * The uint8array's capacity (i.e.: length) is not what should be saved out.
 * Instead only save the countOfBytesInUse.
 * 
 * The editor stores all line endings as '\n'.
 * When saving the bytes, swap out any '\n' for the 'lineEndString' which may or may not be '\n' (i.e.: it could be '\r\n' or '\r').
 * 
 * Tab characters are stored as '\t\0\0\0'.
 * When saving out the bytes you need to skip over these '\0' characters.
 * 
 * A '\0' character does NOT terminate the subarray's bytes that are in use.
 * You need to iterate specifically for 'countOfBytesInUse'.
 * 
 * @param {*} NOTfinalizePendingEdits if there is a pending edit, it needs to be finalized in order to see the updated text. The default behavior is to finalize the pending edits. To use default behavior, do NOT provide the parameter, or provide a falsey expression like 'null'.
 * @returns
 */
function EDITOR_getFinalizedEditsAndRawSaveFileData(NOTfinalizePendingEdits) {
    if (!NOTfinalizePendingEdits) {
        EDITOR_finalizeAllCursors();
    }
    return {
        uint8arrayTextBytes: EDITOR_textByteList.bytes,
        countOfBytesInUse: EDITOR_textByteList.count,
        lineEndString: EDITOR_lineEndString,
        fileStartsWithBom: Boolean(get_EDITOR_fileStartsWithBom())
    };
}

/**
 * 
 * @param {string} text 
 * @param {string} textSourceIdentifier I intend to have this be an absolute path. Then when the app saves a file, it can verify against the database that this absolute path is "safe" and then write to the file.
 * @param {string} lineEndString pass null (or do not include the parameter) to have line endings set to the first encountered kind in the text. Otherwise specify here. The string is used EXACTLY AS PROVIDED if non-falsey.
 */
function EDITOR_setText(text, fileStartsWithBom, textSourceIdentifier, FORMATTED_textSourceIdentifier, extensionKind, lineEndString) {
    EDITOR_clear();

    set_EDITOR_fileStartsWithBom(fileStartsWithBom);

    EDITOR_textSourceIdentifier = textSourceIdentifier;
    EDITOR_FORMATTED_textSourceIdentifier = FORMATTED_textSourceIdentifier;
    EDITOR_extensionKind = extensionKind;
    EDITOR_language_line_lex_SET(EDITOR_extensionKind);
    EDITOR_lineEndString = lineEndString;

    // When doing a "full reset" it is easier to just add EOF at the end.
    EDITOR_lineEndPositionList.clear();

    /**
     * TODO: I don't know whether I should calculate this from the EDITOR_lineEndPositionList or some such...
     * ...But all in all this detail is nothing relative to me starting the code that tracks the longest line
     * so I stop drawing the horizontal scrollbar during some scroll events.
     * 
     * In terms of changing it after the fact it isn't a big deal is what I mean.
     */
    let lineLength = 0;

    for (var sourceI = 0; sourceI < text.length; sourceI++) {
        switch (text[sourceI]) {
            case '\r':
                if (sourceI < text.length - 1 & text[sourceI + 1] === '\n') {
                    if (!EDITOR_lineEndString) {
                        EDITOR_lineEndString = '\r\n';
                    }
                    sourceI++;
                }
                else {
                    if (!EDITOR_lineEndString) {
                        EDITOR_lineEndString = '\r';
                    }
                }
                if (lineLength > get_EDITOR_longestLine_length()) {
                    set_EDITOR_longestLine_length(lineLength);
                    set_EDITOR_longestLine_indexLine(EDITOR_lineEndPositionList.count);
                }
                lineLength = 0;
                EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);
                EDITOR_textByteList.insert(EDITOR_textByteList.count, get_EDITOR_ASCII_LINE_FEED());
                break;
            case '\n':
                if (!EDITOR_lineEndString) {
                    EDITOR_lineEndString = '\n';
                }
                if (lineLength > get_EDITOR_longestLine_length()) {
                    set_EDITOR_longestLine_length(lineLength);
                    set_EDITOR_longestLine_indexLine(EDITOR_lineEndPositionList.count);
                }
                lineLength = 0;
                EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);
                EDITOR_textByteList.insert(EDITOR_textByteList.count, get_EDITOR_ASCII_LINE_FEED());
                break;
            case '\t':
                lineLength += 4;
                EDITOR_textByteList.insertBytes(EDITOR_textByteList.count, EDITOR_tab_tabsbytes, /*offset*/ 0, /*length*/ 4);
                break;
            default:
                lineLength++;
                // TODO: add a function for '.add' and avoid the "pointless" passing of count in scenarios like this.
                //
                // tbh: TODO: 'charCodeAt' also might be more allocation expensive than you expect. It returns a JavaScript number. Switching and returning an index from byte array prehardcoded might avoid an allocation per number returned?
                // ... although I hear most engines store numbers such that the pointer represents the value and you avoid the allocation but even then where is the metadata that tells you how to read that pointer differently than the other ones etc...
                //
                EDITOR_textByteList.insert(EDITOR_textByteList.count, text.charCodeAt(sourceI));
                break;
        }
    }

    EDITOR_lineEndPositionList.insert(EDITOR_lineEndPositionList.count, EDITOR_textByteList.count);

    update_VirtualIndexLine();
    update_virtualCount();

    update_verticalVirtualizationBoundary();

    switch (EDITOR_extensionKind) {
        case get_ExtensionKind_JavaScript():
            EDITOR_trackedSyntaxList = JS_full_lex(EDITOR_textByteList.bytes, EDITOR_textByteList.count);
            break;
    }

    EDITOR_drawGutter_Width();
    // Force 'case 3' within 'EDITOR_onScroll_WRAPIT();' downstream
    // TODO: (this comment is being made sometime after this solution was written but from memory...)...
    // ...I believe this works because when you change the text you guarantee a virtual index line of '0' because the scrollTop gets moved to 0...
    // ...the partial solution is to set it to anything other than '0' so the editor detects that a line of text needs to be drawn...
    // ...but this isn't enough because you want the editor to draw every line, thus you make the difference...
    // ...in the virtual index line equal to the count of lines being displayed, i.e.: set virtual index line to 'get_EDITOR_virtualCount()'...
    // ...then it sees the new value for virtual index line is 0...
    // ...the difference between the previous and new value is 'get_EDITOR_virtualCount()'...
    // ...thus 'get_EDITOR_virtualCount()' amount of lines get redrawn...
    // ...i.e.: the entire viewport is redrawn with the new file's text.
    set_EDITOR_ONSCROLLvirtualIndexLine(get_EDITOR_virtualCount());
    EDITOR_onScroll_WRAPIT();
}

/**
 * You may want to update the vertical virtualization boundary prior to actually updating the EDITOR_lineEndPositionList.
 * Thus this function takes a 'lineCount' which defaults to EDITOR_lineEndPositionList.count if falsey.
 * @param {number | null | undefined} lineCount In order to permit arbitrarily updating the vertical virtualization boundary, this takes a lineCount. If falsey, then EDITOR_lineEndPositionList.count is used.
 */
function update_verticalVirtualizationBoundary(lineCount) {
    if (!lineCount) lineCount = EDITOR_lineEndPositionList.count;
    get_EDITOR_virtualization_vertical().style.height = ((lineCount + get_EDITOR_virtualCount() - 1) * get_EDITOR_lineHeight()) + 'px';
}

function update_VirtualIndexLine() {
    // TODO: This floor logic seems very odd. Because given the previous and the current you can determine it without dividing maybe I think?
    set_EDITOR_virtualIndexLine(Math.floor(EDITOR_baseElement.scrollTop / get_EDITOR_lineHeight()));
    //let transform = `translateY(${get_EDITOR_virtualIndexLine() * get_EDITOR_lineHeight()}px)`;
    //if (transform === EDITOR_gutterBackgroundColor.style.transform) {
    //    console.log('if (transform === EDITOR_gutterBackgroundColor.style.transform)');
    //}
    //EDITOR_gutterBackgroundColor.style.transform = transform;
}

function update_virtualCount() {
    set_EDITOR_virtualCount(Math.ceil(EDITOR_baseElement.offsetHeight / get_EDITOR_lineHeight()));
    // This worsens the CLS by 0.24; nevertheless I need to just continue looking at things and making sense of it all
    // and I'm sort of ignoring any short term movement in CLS just in case it is misleading.
    get_EDITOR_textElement().style.height = (get_EDITOR_virtualCount() * get_EDITOR_lineHeight()) + 'px';
}

/**
 * If the 'get_EDITOR_drawn_count_of_digits_longest_line_number() === positiveNumbersOnly_countDigitsLoop(EDITOR_lineEndPositionList.count)'
 * then the function does nothing.
 * 
 * TODO: Track the min and max until length changes and then only 2 operations at worst case than while
 */
function EDITOR_drawGutter_Width() {
    let digitCountOfLargestLineNumber = positiveNumbersOnly_countDigitsLoop(EDITOR_lineEndPositionList.count);
    if (get_EDITOR_drawn_count_of_digits_longest_line_number() === digitCountOfLargestLineNumber) return;

    set_EDITOR_drawn_count_of_digits_longest_line_number(digitCountOfLargestLineNumber);

    set_EDITOR_gutterWidthStyleValue(Math.ceil(digitCountOfLargestLineNumber * EDITOR_characterWidth));
    set_EDITOR_gutterWidthTotal(get_EDITOR_gutterWidthStyleValue() + get_EDITOR_gutterPaddingLeft() + get_EDITOR_gutterPaddingRight());

    let gutterWidth = get_EDITOR_gutterWidthStyleValue() + 'px';
    get_EDITOR_gutter().style.width = gutterWidth;
    EDITOR_gutterBackgroundColor.style.width = gutterWidth;
    
    let left = get_EDITOR_gutterWidthTotal() + 'px';
    let width = 'calc(100% - ' + left + ')';
    //get_EDITOR_body().style.marginLeft = left;
    gutterWidthTotal = left;
    get_EDITOR_body().style.width = width;

    EDITOR_drawHorizontalScrollbar();
}

/**
 * If the state is bad then the following is returned:
 * { goalColumnI: -1, runColumnI: -1, indexChild: -1, lineDiv: null, };
 * 
 * if (walked.goalColumnI === -1) { throw new Error('walked.goalColumnI === -1'); }
 * 
 * if (walked.lineDiv.children.length === 0) { throw new Error('walked.lineDiv.children.length === 0'); }
 * 
 * NOTE: when copying and pasting code be sure the snippet uses the respective 'break' or 'return' that you're interested in...
 * ...as those keywords are common in code that use the result of this function, but can vary on a case by case basis.
 * 
 * @param {EDITOR_Cursor} cursor
 * @returns
 */
function walkLineUntilIndexColumn(cursor) {
    let beltIndexLine = EDITOR_indexLineTo_beltIndexLine(cursor.indexLine);
    if (beltIndexLine < 0) {
        w_indexColumn_Goal = -1;
        w_indexColumn_Sum = -1;
        w_indexColumn_SpanTextContentRelative = -1;
        w_indexSpan = -1;
        w_span = null;
        w_div = null;
        w_beltIndexLine = beltIndexLine;
        return;
    }
    
    let div = get_EDITOR_textElement().children[beltIndexLine];
    let indexColumn_Goal = cursor.indexColumn + get_EDITOR_offsetColumn();
    let indexColumn_Sum = 0;

    for (var indexSpan = 0; indexSpan < div.children.length; indexSpan++) {
        let span = div.children[indexSpan];
        if (indexColumn_Goal <= indexColumn_Sum + span.textContent.length) {
            // '<=' because end-of-line text insertion (end of line but prior to the line ending itself).
            // The line ending isn't written to the span, it is represented by the encompassing div itself.
            w_indexColumn_Goal = indexColumn_Goal;
            w_indexColumn_Sum = indexColumn_Sum;
            w_indexColumn_SpanTextContentRelative = indexColumn_Goal - indexColumn_Sum;
            w_indexSpan = indexSpan;
            w_span = span;
            w_div = div;
            w_beltIndexLine = beltIndexLine;
            return;
        }
        else {
            indexColumn_Sum += span.textContent.length;
        }
    }

    // TODO: When the column index is too large, how should this be handled?
    w_indexColumn_Goal = -1;
    w_indexColumn_Sum = -1;
    w_indexColumn_SpanTextContentRelative = -1;
    w_indexSpan = -1;
    w_span = null;
    w_div = null;
    w_beltIndexLine = beltIndexLine;
    return;
}

/**
 * Use case: HTML was previously rendered, but the content of the line was modified
 * and logic to more efficiently manipulate the existing HTML is not yet written.
 * 
 * Example modifications:
 * - The same line index had its contents modified.
 * - Visually the line index that virtually appears as that child element is not the same as it previously was
 *   due to various reasons, perhaps a change in scroll position.
 * 
 * Prior to invoking this function ensure the provided elements's innerHTML is empty:
 * - "gutterLineElement.innerHTML = '';"
 * - "divElement.innerHTML = '';"
 * @param {number} indexLine 
 * @param {HTMLElement} gutterLineElement 
 * @param {HTMLElement} divElement 
 */
function EDITOR_drawLine(indexLine, gutterLineElement, textLineElement) {
    if (indexLine >= EDITOR_lineEndPositionList.count) {
        gutterLineElement.textContent = '~';
    }
    else {
        gutterLineElement.textContent = indexLine + 1;
    }

    let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(indexLine);
    if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
        trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
    }
    let line = EDITOR_getLineBoundaryPositions(indexLine);
    EDITOR_createSpansForLineOfText(textLineElement, line.start, line.end, trackedSyntax_StartingIndex);
}

/**
 * if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) { trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract; }
 * @param {*} indexLineAaa 
 * @returns 
 */
function EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(indexLineAaa) {

    // TODO: 'indexLineAaa' and 'indexLineBbb'; babel compiler error when both were named indexLine.

    let line = EDITOR_getLineBoundaryPositions(indexLineAaa);
    let positionIndex = line.start;

    let left = 0;
    let right = EDITOR_trackedSyntaxList.count_abstract - 1;

    let indexLineBbb = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        EDITOR_trackedSyntaxList.getElementAt(mid);
        
        if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > positionIndex) {
            indexLineBbb = mid;

            if (get_EDITOR_pooledTrackedSyntax_start() === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() <= positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return indexLineBbb;
}

/**
 * if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) { trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract; }
 * Probably should make 1 of these and accept a predicate.
 */
function EDITOR_trackedSyntaxReposition_find(positionIndex) {

    let left = 0;
    let right = EDITOR_trackedSyntaxList.count_abstract - 1;

    let indexLine = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        let start = EDITOR_trackedSyntaxList.getStart(mid);
        
        if (positionIndex <= start) {
            indexLine = mid;

            if (positionIndex === start) {
                break;
            }
            
            right = mid - 1;
        }
        else if (positionIndex > start) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return indexLine;
}

/** modification of Google AI Overview "javascript count of digits" */
function positiveNumbersOnly_countDigitsLoop(number) {
  if (number <= 0) return 1;
  let count = 0;

  while (number > 0) {
    number = Math.floor(number / 10); // Remove the last digit
    count++;
  }

  return count;
}

/**
 * This method will NOT "put a cursor on screen". You need to ensure
 * your cursor exists as a child by appendChild'ing to EDTIOR_cursorListElement.
 * This method instead only moves a cursor that ALREADY is being shown on screen.
 * 
 * If the 'cursor' is not EDITOR_primaryCursor, then the 'NOTscrollCursorIntoView' parameter has no effect.
 * i.e.: only the EDITOR_primaryCursor will ever be scrolled into view via this method.
 * 
 * @param {EDITOR_Cursor} cursor 
 * @param {boolean} NOTscrollCursorIntoView 
 */
function EDITOR_drawCursor(cursor, NOTscrollCursorIntoView) {
    cursor.cursorTranslateYValue = (cursor.indexLine + get_EDITOR_offsetLine()) * get_EDITOR_lineHeight();
    cursor.cursorTranslateXValue = (cursor.indexColumn + get_EDITOR_offsetColumn()) * EDITOR_characterWidth;

    cursor.caretRow.style.transform = `translateY(${cursor.cursorTranslateYValue}px)`;
    cursor.cursorElement.style.transform = `translateX(${cursor.cursorTranslateXValue}px)`;

    EDITOR_createStyleForSelection(cursor);

    if (cursor === EDITOR_primaryCursor) {
        let text = '';

        text += '(' + cursor.indexLine + ', ' + cursor.indexColumn + ')';
        
        if (DIALOG_Settings_editorDebugShowAdjacentCharacters) {
	        let previous = EDITOR_getCharacterPrevious(cursor.indexColumn, EDITOR_getPositionIndex(cursor));
	        if (previous === '\n') previous = '\\n';
	        else if (previous === '\t') previous = '\\t';
	        let current = EDITOR_getCharacterCurrent(cursor.indexColumn, EDITOR_getPositionIndex(cursor), EDITOR_getLineEnd_pos(cursor.indexLine));
	        if (current === '\n') current = '\\n';
	        else if (current === '\t') current = '\\t';
	        text += ' | (' + previous + ', ' + current + ')';
        }
        
        text += ' | (' + cursor.editLength + ')';

        text += ' | (' + get_EDITOR_longestLine_indexLine() + ', ' + get_EDITOR_longestLine_length() + ')';

        EDITOR_debug.replaceChildren(text);

        if (!NOTscrollCursorIntoView) {
            EDITOR_scrollCursorIntoView(cursor);
        }
    }
}

function EDITOR_getLineAndColumnIndices_raw(positionIndex) {
    let left = 0;
    let right = EDITOR_lineEndPositionList.count - 1;

    let indexLine = -1;
    let indexColumn = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (EDITOR_lineEndPositionList.data[mid] >= positionIndex) {
            indexLine = mid;

            if (EDITOR_lineEndPositionList.data[mid] === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (EDITOR_lineEndPositionList.data[mid] < positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    if (indexLine === -1) {
        return {
          indexLine: 0,
          indexColumn: 0,  
        };
    }

    if (indexLine === 0) {
        indexColumn = positionIndex;
    }
    else {
        indexColumn = positionIndex - (EDITOR_lineEndPositionList.data[indexLine - 1] + 1);
    }

    return {
        indexLine: indexLine,
        indexColumn: indexColumn,
    };
}

function EDITOR_getLineAndColumnIndices(positionIndex) {
    let left = 0;
    let right = EDITOR_lineEndPositionList.count - 1;

    let indexLine = -1;
    let indexColumn = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        
        if (EDITOR_readLineEndPositionList(mid) >= positionIndex) {
            indexLine = mid;

            if (EDITOR_readLineEndPositionList(mid) === positionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (EDITOR_readLineEndPositionList(mid) < positionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    if (indexLine === -1) {
        return {
          indexLine: 0,
          indexColumn: 0,  
        };
    }

    if (indexLine === 0) {
        indexColumn = positionIndex;
    }
    else {
        indexColumn = positionIndex - (EDITOR_readLineEndPositionList(indexLine - 1) + 1);
    }

    return {
        indexLine: indexLine,
        indexColumn: indexColumn,
    };
}

/**
 * This function only clears both the 'cursor.selectionDivExists' and the HTML associated with the selection NOT the actual selection position properties of the cursor.
 * 
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_clearSelectionStyle(cursor) {
    let shouldExistSelectionDiv = false;
    if (cursor.selectionDivExists) {
        for (var i = 0; i < get_EDITOR_presentation().children.length; i++) {
            if (get_EDITOR_presentation().children[i].id === cursor.htmlId) {
                let textSelectionDiv = get_EDITOR_presentation().children[i];
                if (!shouldExistSelectionDiv) {
                    get_EDITOR_presentation().removeChild(textSelectionDiv);
                    cursor.selectionDivExists = false;
                }
                break;
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_createStyleForSelection(cursor) {
    if (cursor.DRAWN_selectionAnchor !== cursor.selectionAnchor ||
        cursor.DRAWN_selectionEnd !== cursor.selectionEnd ||
        cursor.DRAWN_selection_virtualCount !== get_EDITOR_virtualCount() ||
        cursor.DRAWN_selection_virtualIndexLine !== get_EDITOR_virtualIndexLine()) {

        cursor.DRAWN_selectionAnchor = cursor.selectionAnchor;
        cursor.DRAWN_selectionEnd = cursor.selectionEnd;
        cursor.DRAWN_selection_virtualCount = get_EDITOR_virtualCount();
        cursor.DRAWN_selection_virtualIndexLine = get_EDITOR_virtualIndexLine();

        let shouldExistSelectionDiv;
        if (cursor.DRAWN_selectionAnchor === cursor.DRAWN_selectionEnd) {
            shouldExistSelectionDiv = false;
        }
        else {
            shouldExistSelectionDiv = true;
        }

        let textSelectionDiv;

        if (cursor.selectionDivExists) {
            for (var i = 0; i < get_EDITOR_presentation().children.length; i++) {
                if (get_EDITOR_presentation().children[i].id === cursor.htmlId) {
                    textSelectionDiv = get_EDITOR_presentation().children[i];
                    if (!shouldExistSelectionDiv) {
                        get_EDITOR_presentation().removeChild(textSelectionDiv);
                        cursor.selectionDivExists = false;
                    }
                    break;
                }
            }
        }
        else if (shouldExistSelectionDiv) {
            textSelectionDiv = document.createElement('div')
            textSelectionDiv.id = cursor.htmlId;
            get_EDITOR_presentation().appendChild(textSelectionDiv);
            cursor.selectionDivExists = true;
        }

        if (!cursor.selectionDivExists) return;

        // TODO: only somewhat simple viewport based virtualization is implemented from what I remember. i.e.: I think the divs are re-used, but every div is redrawn for the viewport, rather than only recalculating the css for the divs that came or left the viewport.

        let start = cursor.selectionAnchor;
        let startLineAndColumnIndices = EDITOR_getLineAndColumnIndices(start);
        let startLine = startLineAndColumnIndices.indexLine;
        let startColumn = startLineAndColumnIndices.indexColumn;

        let end = cursor.selectionEnd;
        let endLineAndColumnIndices = EDITOR_getLineAndColumnIndices(end);
        let INCLUSIVEendLine = endLineAndColumnIndices.indexLine;
        let INCLUSIVEendColumn = endLineAndColumnIndices.indexColumn;

        // # Virtualization
        if (startLine < get_EDITOR_virtualIndexLine()) {
            startLine = get_EDITOR_virtualIndexLine();
            startColumn = 0;
        }
        let lastIndexLineBeingShown = get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1;
        if (INCLUSIVEendLine > lastIndexLineBeingShown) {
            INCLUSIVEendLine = lastIndexLineBeingShown;
            INCLUSIVEendColumn = EDITOR_getLastValidIndexColumn(INCLUSIVEendLine);
        }

        if (start > end) {
            let temp = end;
            let tempLine = INCLUSIVEendLine;
            let tempColumn = INCLUSIVEendColumn;
            end = start;
            INCLUSIVEendLine = startLine;
            INCLUSIVEendColumn = startColumn;
            start = temp;
            startLine = tempLine;
            startColumn = tempColumn;
        }
        //
        // I do not want to fill the screen with display:none divs for when there is a selection to be shown there (I do it all the time but it doesn't seem sensible here).
        // Thus the first step is to ensure there are a matching amount of divs for the selections to apply their style to.
        //
        let selectedLineCount = INCLUSIVEendLine - startLine + 1;
        if (textSelectionDiv.children.length < selectedLineCount) {
            for (let i = textSelectionDiv.children.length; i < selectedLineCount; i++) {
                textSelectionDiv.appendChild(document.createElement('div'));
            }
        }
        else if (textSelectionDiv.children.length > selectedLineCount) {
            for (let i = selectedLineCount; i < textSelectionDiv.children.length; i++) {
                textSelectionDiv.removeChild(textSelectionDiv.children[i]);
            }
        }

        let lineSelectionDiv;
        let childDivIndex = 0;

        if (startLine == INCLUSIVEendLine) {
            lineSelectionDiv = textSelectionDiv.children[childDivIndex++];
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.transform = `translate(${startColumn * EDITOR_characterWidth}px, ${get_EDITOR_lineHeight() * startLine}px)`;
            lineSelectionDiv.style.width = (INCLUSIVEendColumn - startColumn) * EDITOR_characterWidth + 'px';
        }
        else {
            // start line
            lineSelectionDiv = textSelectionDiv.children[childDivIndex++];
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.transform = `translate(${startColumn * EDITOR_characterWidth}px, ${get_EDITOR_lineHeight() * startLine}px)`;
            let line = EDITOR_getLineBoundaryPositions(startLine);
            let lineLength = line.end - line.start;
            lineSelectionDiv.style.width = (lineLength + 1 - startColumn) * EDITOR_characterWidth + 'px';

            // between lines
            for (var lineI = startLine + 1; lineI < INCLUSIVEendLine; lineI++) {
                lineSelectionDiv = textSelectionDiv.children[childDivIndex++];
                lineSelectionDiv.className = 'EDITOR_selection';
                lineSelectionDiv.style.transform = `translateY(${get_EDITOR_lineHeight() * lineI}px)`;
                let line = EDITOR_getLineBoundaryPositions(lineI);
                let lineLength = line.end - line.start;
                lineSelectionDiv.style.width = (lineLength + 1) * EDITOR_characterWidth + 'px';
            }

            // end line
            lineSelectionDiv = textSelectionDiv.children[childDivIndex++];
            lineSelectionDiv.className = 'EDITOR_selection';
            lineSelectionDiv.style.transform = `translateY(${get_EDITOR_lineHeight() * INCLUSIVEendLine}px)`;
            lineSelectionDiv.style.width = INCLUSIVEendColumn * EDITOR_characterWidth + 'px';
        }
    }
}

function EDITOR_createStyleForSelection_indentMore(cursor) {
    let textSelectionDiv;
    if (cursor.selectionDivExists) {
        for (var i = 0; i < get_EDITOR_presentation().children.length; i++) {
            if (get_EDITOR_presentation().children[i].id === cursor.htmlId) {
                textSelectionDiv = get_EDITOR_presentation().children[i];
                break;
            }
        }
    }
    else {
        // TODO: Silent error confusing bad idea
        return;
    }

    let extraWidth = 4 * EDITOR_characterWidth;
    for (let i = 0; i < textSelectionDiv.children.length; i++) {
        let lineSelectionDiv = textSelectionDiv.children[i];
        let widthNumberValue = parseFloat(lineSelectionDiv.style.width, 10);
        widthNumberValue += extraWidth;
        lineSelectionDiv.style.width = widthNumberValue + 'px';
    }

    cursor.DRAWN_selectionAnchor = cursor.selectionAnchor;
    cursor.DRAWN_selectionEnd = cursor.selectionEnd;
}

function EDITOR_getLastValidIndexColumn(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return EDITOR_readLineEndPositionList(indexLine) - 0;
        }
        else {
            return EDITOR_readLineEndPositionList(indexLine) - (EDITOR_readLineEndPositionList(indexLine - 1) + 1);
        }
    }
    return 0;
}

/**
 * result.start is the position of the first character on that line.
 * 
 * result.end is the position of the "line end" (i.e.: ascii code for '\n' or EOF).
 * 
 * The inclusivity/exclusivity is in reference to whether the position
 * points to non-line-end-text that exists on the line
 * 
 * NOTE: In performance critical sections this code is explicitly inlined and modified to be as performant as it seemingly can get for that specific section of code.
 * 
 * @returns an object with properties 'start' inclusive, 'end' exclusive
 */
function EDITOR_getLineBoundaryPositions(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return {
                start: 0,
                end: EDITOR_readLineEndPositionList(indexLine) - 0
            }
        }
        else {
            return {
                start: (EDITOR_readLineEndPositionList(indexLine - 1) + 1),
                end: EDITOR_readLineEndPositionList(indexLine)
            }
        }
    }
    return {
        start: 0,
        end: 0
    }
}

function EDITOR_getLineStart_pos(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return 0;
        }
        else {
            return (EDITOR_readLineEndPositionList(indexLine - 1) + 1);
        }
    }
    return 0;
}

function EDITOR_getLineEnd_pos(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return EDITOR_readLineEndPositionList(indexLine) - 0;
        }
        else {
            return EDITOR_readLineEndPositionList(indexLine);
        }
    }
    return 0;
}

/**
 * result.start is the position of the first character on that line.
 * 
 * result.end is the position of the "line end" (i.e.: ascii code for '\n' or EOF).
 * 
 * The inclusivity/exclusivity is in reference to whether the position
 * points to non-line-end-text that exists on the line
 * 
 * @returns an object with properties 'start' inclusive, 'end' exclusive
 */
function EDITOR_getLineBoundaryPositions_raw(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return {
                start: 0,
                end: EDITOR_lineEndPositionList.data[indexLine] - 0
            }
        }
        else {
            return {
                start: (EDITOR_lineEndPositionList.data[indexLine - 1] + 1),
                end: EDITOR_lineEndPositionList.data[indexLine]
            }
        }
    }
    return {
        start: 0,
        end: 0
    }
}

function EDITOR_getLineStart_pos_raw(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return 0;
        }
        else {
            return (EDITOR_lineEndPositionList.data[indexLine - 1] + 1);
        }
    }
    return 0;
}

function EDITOR_getLineEnd_pos_raw(indexLine) {
    if (indexLine < EDITOR_lineEndPositionList.count) {
        if (indexLine === 0) {
            return EDITOR_lineEndPositionList.data[indexLine] - 0;
        }
        else {
            return EDITOR_lineEndPositionList.data[indexLine];
        }
    }
    return 0;
}

function EDITOR_measureLineHeightAndCharacterWidth() {
    let measureElement = document.createElement('div');
    measureElement.style.width = "fit-content";
    measureElement.style.position = 'absolute';
    measureElement.style.visibility = 'hidden';
    measureElement.style.padding = '0';
    measureElement.style.border = 'none';
    measureElement.style.left = '0';
    measureElement.style.top = '0';

    // AI is saying "// The foolproof way to prevent ALL scrollbars during measurement" is this paragraph of code.
    // The foolproof way to prevent ALL scrollbars during measurement
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed'; // Removes it from the normal page layout flow
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '0';        // Forces a tiny container footprint
    wrapper.style.height = '0';       // Forces a tiny container footprint
    wrapper.style.overflow = 'hidden'; // Prevents any layout leaking out or causing scrollbars
    wrapper.style.visibility = 'hidden'; // Keeps it completely invisible to the user

    wrapper.appendChild(measureElement);
    get_EDITOR_textElement().appendChild(wrapper);

    let len = 396;
    measureElement.innerHTML = 'A'.repeat(len);
    let measureElementBoundingClientRect = measureElement.getBoundingClientRect();
    EDITOR_characterWidth = measureElementBoundingClientRect.width / len; // 7.146002258917298
    set_EDITOR_lineHeight(Math.ceil(measureElementBoundingClientRect.height)); // 15

    wrapper.removeChild(measureElement);
    get_EDITOR_textElement().removeChild(wrapper);

    const root = document.documentElement;
    const computedStyles = window.getComputedStyle(root);
    let teLineHeight = get_EDITOR_lineHeight() + 'px';
    let propertyName = '--EDITOR-line-height';
    if (computedStyles.getPropertyValue(propertyName) !== teLineHeight) {
        // avoid layout with if statement
        root.style.setProperty(propertyName, teLineHeight);
    }
}

// TODO: I believe this throttling logic can still be improved upon... I feel like there are too many functions being defined but I'm not sure. I'd prefer 1 less function be involved per throttle case.
function EDITOR_onMouseMove_WRAPIT(event) {
    if (event.buttons & 1 && get_EDITOR_isSourceOfLeftMouseButton()) {
		EDITOR_onMouseMove_event = event;
		
	    if (!EDITOR_onMouseMove_timer) {
	        if (true /*options.leading*/) {
	            EDITOR_onMouseMove(event);
	        }
	        EDITOR_onMouseMove_timer = setTimeout(EDITOR_onMouseMove_timeoutFunc, 90);
	    }
    }
    else {
        set_EDITOR_isSourceOfLeftMouseButton(false);
    }
}

function EDITOR_onMouseMove_timeoutFunc() {
    if (/*trailing && lastArgs*/ EDITOR_onMouseMove_event) {
        EDITOR_onMouseMove(EDITOR_onMouseMove_event);
        EDITOR_onMouseMove_event = null;
        EDITOR_onMouseMove_timer = setTimeout(EDITOR_onMouseMove_timeoutFunc, 90);
    } else {
        EDITOR_onMouseMove_timer = null;
    }
}

function EDITOR_onMouseMove(event) {
    if (get_EDITOR_recentBoundingClientRect_isNull_intFalsey()) {
        return;
    }

    let rX = event.clientX - get_EDITOR_recentBoundingClientRect_left() - get_EDITOR_gutterWidthTotal() + EDITOR_baseElement.scrollLeft;
    let rY = event.clientY - get_EDITOR_recentBoundingClientRect_top() + EDITOR_baseElement.scrollTop;

    let indexColumn = Math.round(rX / EDITOR_characterWidth);
    let indexLine = Math.floor(rY / get_EDITOR_lineHeight());

    if (indexColumn < 0) {
        indexColumn = 0;
    }
    
    if (indexLine < 0) {
        indexLine = 0;
    }

    if (indexLine >= EDITOR_lineEndPositionList.count) {
        indexLine = EDITOR_lineEndPositionList.count - 1;
    }

    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(indexLine);
    if (indexColumn > lastValidIndexColumn) {
        indexColumn = lastValidIndexColumn;
    }

    let cursor = EDITOR_primaryCursor;
    cursor.indexLine = indexLine;
    cursor.indexColumn = indexColumn;
    EDITOR_drawCursor(cursor);

    if (get_EDITOR_detailRank() === 3) {
        EDITOR_onMouseMoveDetailRankThree(event, indexLine, indexColumn);
    }
    else if (get_EDITOR_detailRank() === 2) {
        EDITOR_onMouseMoveDetailRankTwo(event, indexLine, indexColumn);
    }
    else if (get_EDITOR_detailRank() === 1) {
        EDITOR_onMouseMoveDetailRankOne(event, indexLine, indexColumn);
    }
}

function EDITOR_onMouseMoveDetailRankOne(event, indexLineClicked, indexColumnClicked) {
    let cursor = EDITOR_primaryCursor;
    cursor.indexLine = indexLineClicked;
    cursor.indexColumn = indexColumnClicked;

    cursor.selectionEnd = EDITOR_getPositionIndex(cursor);

    EDITOR_drawCursor(cursor);
}

function getCharacter(positionIndex) {

    // in this getCharacter function, you'd actually already know the total shift if you just looped forwards.
    // Also this currently is EXTREMELY unoptimized given that it resets the totalShift each time it gets invoked rather than remembering the previous result.

    // maybe when hitting ArrowRight you'd want to finalize the edits?
    // because if you have multicursor with two cursors on the same line
    // you type some letters
    // then ctrl arrow right
    // how would this interact with the line end positions?
    //
    // I think if it were something like this, that it'd relate to whether the user moved they're cursor outisde the range of that cursor's pending "gap buffer" insertion text.
    //
    // additionally this function feels "random access", you need to consider a consecutive approach where you accumulate this state.
    // and that's what the plan was... but it doesn't quite feel like it would go here. Or that there'd be a second function in which you agree to using contextual information to determine the result much faster.

    // Cursors overlapping missed cases:
    // =================================
    // two cursors same line hit home
    // two cursors same line hit end

    // this only gets 1 character why is it using the ..._decode_... functions.

    let totalShift = 0;
    // If you need to determine the text without finalizing an edit, you DO have to loop forwards right?
    for (var i = 0; i < EDITOR_cursorList.length; i++) {
        let cursor = EDITOR_cursorList[i];
        switch (cursor.editKind) {
            case get_EditKind_InsertLtr():
                if (positionIndex >= cursor.editPosition & positionIndex < cursor.editPosition + cursor.editLength) {
                    // TODO: I hear fromCharCode is faster than 'String.fromCodePoint(...)' thus I'm seeing if it is sufficient for my current personal usage...
                    // ...long term it presumably fails for characters that I don't tend to type, but until then this is working so I'll just use fromCharCode.
                    //
                    // TODO: This takes a spread/array; if I give it a single byte does it allocate a length of 1 array every invocation?
                    return String.fromCharCode(cursor.gapBuffer[positionIndex - cursor.editPosition]);
                }
                else if (cursor.editPosition <= positionIndex) {
                    totalShift += cursor.editLength;
                }
                break;
            case get_EditKind_DeleteLtr():
            case get_EditKind_BackspaceRtl():
            case get_EditKind_RemoveTextNoBatching():
                totalShift -= cursor.editLength;
                break;
        }
    }
    // TODO: I hear fromCharCode is faster than 'String.fromCodePoint(...)' thus I'm seeing if it is sufficient for my current personal usage...
    // ...long term it presumably fails for characters that I don't tend to type, but until then this is working so I'll just use fromCharCode.
    //
    // TODO: This takes a spread/array; if I give it a single byte does it allocate a length of 1 array every invocation?
    return String.fromCharCode(EDITOR_textByteList.bytes[positionIndex - totalShift]);
}

/**
 * 'positionIndex' is a calculated value that is commonly calculated.
 * It tends to be the case that you already are using a variable to store the positionIndex.
 * Thus providing that positionIndex is ideal.
 * 
 * @param {*} cursor 
 * @param {*} positionIndex 
 */
function EDITOR_getCharacterPrevious(indexColumn, positionIndex) {
    // TODO: Make a 'getCharacter(...) method so the gap buffer logic can be in one location.
    if (indexColumn !== 0) {
        return getCharacter(positionIndex - 1);
    }
    else {
        // TODO: I'm pretty sure this was supposed to say '\0' but it happens to "work" due to them both being 0.
        return get_CharacterKind_None();
    }
}

/**
  * 'positionIndex' is a calculated value that is commonly calculated.
 * It tends to be the case that you already are using a variable to store the positionIndex.
 * Thus providing that positionIndex is ideal.
 * 
 * @param {*} indexColumn 
 * @param {*} positionIndex 
 * @param {*} line 
 */
function EDITOR_getCharacterCurrent(indexColumn, positionIndex, lineEnd) {
    if (indexColumn < lineEnd) {
        return getCharacter(positionIndex);
    }
    else {
        // TODO: I'm pretty sure this was supposed to say '\0' but it happens to "work" due to them both being 0.
        return get_CharacterKind_None();
    }
}

function EDITOR_getCharacterPrevious_KIND(indexColumn, positionIndex) {
    if (indexColumn !== 0) {
        return EDITOR_getCharacterKind(EDITOR_getCharacterPrevious(indexColumn, positionIndex));
    }
    else {
        return get_CharacterKind_None();
    }
}

function EDITOR_getCharacterCurrent_KIND(indexColumn, positionIndex, lineEnd) {
    if (indexColumn < lineEnd) {
        return EDITOR_getCharacterKind(EDITOR_getCharacterCurrent(indexColumn, positionIndex, lineEnd));
    }
    else {
        return get_CharacterKind_None();
    }
}

function EDITOR_onMouseMoveDetailRankTwo(event, indexLineClicked, indexColumnClicked) {
    let nextPositionIndex = EDITOR_getPositionIndex_Overload(indexLineClicked, indexColumnClicked);
    let cursor = EDITOR_primaryCursor;

    if (nextPositionIndex <= get_EDITOR_detail_smallPosition()) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            cursor.selectionAnchor = get_EDITOR_detail_largePosition();
        }

        cursor.indexLine = indexLineClicked;
        cursor.indexColumn = indexColumnClicked;
        let positionIndex = nextPositionIndex;

        cursor.selectionEnd = positionIndex;

        if (nextPositionIndex < get_EDITOR_detail_smallPosition()) {
            let goalCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, positionIndex, EDITOR_getLineEnd_pos(cursor.indexLine));

            let leftWasFound = false;

            let tempPositionIndex = positionIndex;

            while (cursor.indexColumn > 0) {
                let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, tempPositionIndex);
                if (leftCharacterKind !== goalCharacterKind) {
                    cursor.selectionEnd = tempPositionIndex;
                    leftWasFound = true;
                    break;
                }
                tempPositionIndex--;
                cursor.indexColumn--;
            }

            if (!leftWasFound) {
                cursor.selectionEnd = tempPositionIndex;
            }
        }

        EDITOR_drawCursor(cursor);
    }
    else {
        if (cursor.selectionAnchor > cursor.selectionEnd) {
            cursor.selectionAnchor = get_EDITOR_detail_smallPosition();
        }

        if (nextPositionIndex >= get_EDITOR_detail_largePosition()) {
            cursor.indexLine = indexLineClicked;
            cursor.indexColumn = indexColumnClicked;
            let positionIndex = nextPositionIndex;

            cursor.selectionEnd = positionIndex;

            let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, positionIndex);
            let goalCharacterKind = leftCharacterKind;

            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
            lineLength = line.end - line.start;
            let rightWasFound = false;

            let tempPositionIndex = positionIndex;
            while (cursor.indexColumn < lineLength) {
                let rightCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, tempPositionIndex, line.end);
                if (rightCharacterKind !== goalCharacterKind) {
                    cursor.selectionEnd = tempPositionIndex;
                    rightWasFound = true;
                    break;
                }
                tempPositionIndex++;
                cursor.indexColumn++;
            }

            if (!rightWasFound) {
                // end of line
                cursor.selectionEnd = tempPositionIndex;
            }
        }
        else {
            let largeLineAndColumnIndices = EDITOR_getLineAndColumnIndices(get_EDITOR_detail_largePosition());
            cursor.indexLine = largeLineAndColumnIndices.indexLine;
            cursor.indexColumn = largeLineAndColumnIndices.indexColumn;
            cursor.selectionEnd = get_EDITOR_detail_largePosition();
        }

        EDITOR_drawCursor(cursor);
    }
}

function EDITOR_onMouseMoveDetailRankThree(event, indexLineClicked, indexColumnClicked) {
    let cursor = EDITOR_primaryCursor;

    if (indexLineClicked === get_EDITOR_detailRank3OriginLine()) {
        if (cursor.positionIndex !== get_EDITOR_detail_smallPosition()) {
            let smallLineAndColumnPositionIndices = EDITOR_getLineAndColumnIndices(get_EDITOR_detail_smallPosition());
            cursor.indexLine = smallLineAndColumnPositionIndices.indexLine;
            cursor.indexColumn = smallLineAndColumnPositionIndices.indexColumn;
        }

        if (cursor.selectionEnd !== get_EDITOR_detail_smallPosition()) {
            cursor.selectionEnd = get_EDITOR_detail_smallPosition();
        }

        if (cursor.selectionAnchor !== get_EDITOR_detail_largePosition()) {
            cursor.selectionAnchor = get_EDITOR_detail_largePosition();
        }

        EDITOR_drawCursor(cursor);
    }
    else if (indexLineClicked < get_EDITOR_detailRank3OriginLine()) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            let smallLineAndColumnPositionIndices = EDITOR_getLineAndColumnIndices(get_EDITOR_detail_smallPosition());

            cursor.indexLine = smallLineAndColumnPositionIndices.indexLine;
            cursor.indexColumn = smallLineAndColumnPositionIndices.indexColumn;

            cursor.selectionEnd = get_EDITOR_detail_smallPosition();

            EDITOR_drawCursor(cursor);
        }

        cursor.indexLine = indexLineClicked;
        cursor.indexColumn = 0;

        cursor.selectionEnd = EDITOR_getPositionIndex_Overload(indexLineClicked, 0);

        EDITOR_drawCursor(cursor);
    }
    else if (indexLineClicked > get_EDITOR_detailRank3OriginLine()) {

        if (cursor.selectionAnchor !== get_EDITOR_detail_smallPosition()) {
            cursor.selectionAnchor = get_EDITOR_detail_smallPosition();
        }

        cursor.indexLine = indexLineClicked;
        cursor.indexColumn = indexColumnClicked;
        let positionIndex = EDITOR_getPositionIndex_Overload(indexLineClicked, indexColumnClicked);

        // move to end of line...
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let lineLength = line.end - line.start;
        positionIndex += lineLength - cursor.indexColumn;

        if (cursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
            cursor.indexColumn = lineLength;
            cursor.selectionEnd = positionIndex;
        }
        else {
            // wrap to the next line
            cursor.indexLine++;
            cursor.indexColumn = 0;
            positionIndex++;

            cursor.selectionEnd = positionIndex;
        }

        EDITOR_drawCursor(cursor);
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_getPositionIndex(cursor) {
    return EDITOR_getLineStart_pos(cursor.indexLine) + cursor.indexColumn;
}

function EDITOR_getPositionIndex_Overload(indexLine, indexColumn) {
    return EDITOR_getLineStart_pos(indexLine) + indexColumn;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_getPositionIndex_raw(cursor) {
    return EDITOR_getLineStart_pos_raw(cursor.indexLine) + cursor.indexColumn;
}

function EDITOR_onMouseDownDetailRankOne(event, indexLineClicked, indexColumnClicked) {
    let cursor = EDITOR_primaryCursor;

    let selectionPlusContextMenuCase = event.button === 2 && cursor.hasSelection();

    if (event.shiftKey && !selectionPlusContextMenuCase) {
        if (!cursor.hasSelection()) {
            cursor.selectionAnchor = EDITOR_getPositionIndex(cursor);
        }
    }

    if (!selectionPlusContextMenuCase) {
        cursor.indexLine = indexLineClicked;
        cursor.indexColumn = indexColumnClicked;
        cursor.STORED_indexColumn = cursor.indexColumn;
    
        cursor.selectionEnd = EDITOR_getPositionIndex(cursor);

        if (!event.shiftKey) {
            cursor.selectionAnchor = cursor.selectionEnd;
        }
    }

    EDITOR_drawCursor(cursor);
}

function EDITOR_onMouseDownDetailRankTwo(event, indexLineClicked, indexColumnClicked) {
    if (event.shiftKey) {
        EDITOR_onMouseDownDetailRankOne(event, indexLineClicked, indexColumnClicked);
        return;
    }

    let cursor = EDITOR_primaryCursor;

    cursor.indexLine = indexLineClicked;
    cursor.indexColumn = indexColumnClicked;
    let positionIndex = EDITOR_getPositionIndex(cursor);
    
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    let leftCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, positionIndex);
    let rightCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, positionIndex, line.end);

    if (leftCharacterKind === rightCharacterKind) {
        let goalCharacterKind = rightCharacterKind;

        let tempIndexColumn = cursor.indexColumn;
        let tempPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        while (tempIndexColumn > 0) {
            tempIndexColumn--;
            tempPositionIndex--;
            leftCharacterKind = EDITOR_getCharacterPrevious_KIND(tempIndexColumn, tempPositionIndex);
            if (leftCharacterKind !== goalCharacterKind) {
                cursor.selectionAnchor = tempPositionIndex;
                break;
            }
        }

        let lineLength = line.end - line.start;
        let rightWasFound = false;
        tempIndexColumn = cursor.indexColumn;
        tempPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        while (tempIndexColumn < lineLength) {
            tempIndexColumn++;
            tempPositionIndex++;
            rightCharacterKind = EDITOR_getCharacterCurrent_KIND(tempIndexColumn, tempPositionIndex, line.end);
            if (rightCharacterKind !== goalCharacterKind) {
                cursor.indexColumn = tempIndexColumn;
                cursor.selectionEnd = tempPositionIndex;
                rightWasFound = true;
                break;
            }
        }

        if (!rightWasFound) {
            // end of line
            cursor.indexColumn = tempIndexColumn;
            cursor.selectionEnd = tempPositionIndex;
        }

        EDITOR_drawCursor(cursor);
    }
    else if (leftCharacterKind > rightCharacterKind) {
        let goalCharacterKind = leftCharacterKind;

        let tempIndexColumn = cursor.indexColumn;
        let originalPositionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, tempIndexColumn);
        let tempPositionIndex = originalPositionIndex;

        while (cursor.indexColumn > 0) {
            tempIndexColumn--;
            tempPositionIndex--;
            leftCharacterKind = EDITOR_getCharacterPrevious_KIND(tempIndexColumn, tempPositionIndex);
            if (leftCharacterKind !== goalCharacterKind) {
                cursor.selectionAnchor = tempPositionIndex;
                break;
            }
        }

        cursor.selectionEnd = originalPositionIndex;

        EDITOR_drawCursor(cursor);
    }
    else {
        let goalCharacterKind = rightCharacterKind;

        let positionIndex = EDITOR_getPositionIndex_Overload(cursor.indexLine, cursor.indexColumn);
        cursor.selectionAnchor = positionIndex;

        let lineLength = line.end - line.start;
        let rightWasFound = false;

        while (cursor.indexColumn < lineLength) {
            cursor.indexColumn++;
            positionIndex++;
            rightCharacterKind = EDITOR_getCharacterCurrent(cursor.indexColumn, positionIndex, line.end);
            if (rightCharacterKind !== goalCharacterKind) {
                cursor.selectionEnd = positionIndex;
                rightWasFound = true;
                break;
            }
        }

        if (!rightWasFound) {
            // end of line
            cursor.selectionEnd = positionIndex;
        }

        EDITOR_drawCursor(cursor);
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        set_EDITOR_detail_smallPosition(cursor.selectionAnchor);
        set_EDITOR_detail_largePosition(cursor.selectionEnd);
    }
    else {
        set_EDITOR_detail_smallPosition(cursor.selectionEnd);
        set_EDITOR_detail_largePosition(cursor.selectionAnchor);
    }
}

function EDITOR_onMouseDownDetailRankThree(event, indexLineClicked, indexColumnClicked) {
    if (event.shiftKey) {
        EDITOR_onMouseDownDetailRankOne(event, indexLineClicked, indexColumnClicked);
        return;
    }

    let cursor = EDITOR_primaryCursor;

    cursor.indexLine = indexLineClicked;
    cursor.indexColumn = indexColumnClicked;
    
    cursor.selectionAnchor = EDITOR_getPositionIndex_Overload(cursor.indexLine, 0);
    
    set_EDITOR_detailRank3OriginLine(cursor.indexLine);

    if (cursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        cursor.selectionEnd = line.end;
        EDITOR_drawCursor(cursor);
    }
    else {
        cursor.indexLine++;
        cursor.indexColumn = 0;
        let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        cursor.selectionEnd = line.start;
        EDITOR_drawCursor(cursor);
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        set_EDITOR_detail_smallPosition(cursor.selectionAnchor);
        set_EDITOR_detail_largePosition(cursor.selectionEnd);
    }
    else {
        set_EDITOR_detail_smallPosition(cursor.selectionEnd);
        set_EDITOR_detail_largePosition(cursor.selectionAnchor);
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_insertGapBufferSpan(cursor) {
    walkLineUntilIndexColumn(cursor);
    if (w_indexColumn_Goal === -1 || !w_div || w_div.children.length === 0) {
        cursor.gapBufferWriteToSpanElement = null;
        cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
        return;
    }

    if (w_indexColumn_Goal == 0) {
        // TODO: Ensure 'w_div.children[0]' is equal to the 'w_span' and then change this line to use 'w_span'
        cursor.gapBufferWriteToSpanElement = w_span;
        cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
    }
    else {
        cursor.gapBufferWriteToSpanElement = w_div.children[w_indexSpan];

        if (w_indexColumn_Goal === w_indexColumn_Sum + cursor.gapBufferWriteToSpanElement.textContent.length) {
            cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = cursor.gapBufferWriteToSpanElement.textContent.length;
        }
        else {
            cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = w_indexColumn_SpanTextContentRelative;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} editKind 
 * @param {*} editPosition 
 * @param {*} editLength 
 */
function EDITOR_startEdit(cursor, editKind, editPosition, editLength) {
    cursor.editKind = editKind;
    cursor.editPosition = editPosition;
    cursor.editIndexLine = cursor.indexLine;
    cursor.editIndexColumn = cursor.indexColumn;
    cursor.editLength = editLength;

    switch (editKind) {
        case get_EditKind_InsertLtr():
            EDITOR_insertGapBufferSpan(cursor);
            break;
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} indexCursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_insert(cursor, indexCursor) {
    return cursor.editKind != get_EditKind_InsertLtr() ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn + cursor.editLength ||
           cursor.editLength >= EDITOR_Cursor.GAP_BUFFER_CAPACITY ||
           cursor.hasSelection();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_backspace(cursor) {
    return cursor.editKind != get_EditKind_BackspaceRtl() ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn ||
           cursor.hasSelection();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_NOTcanBatch_delete(cursor) {
    return cursor.editKind != get_EditKind_DeleteLtr() ||
           cursor.indexLine !== cursor.editIndexLine ||
           cursor.indexColumn !== cursor.editIndexColumn ||
           cursor.hasSelection();
}

/**
 * javascript is single threaded, if this does end up working, don't repeat this in other languages, runtimes, etc... without care.
 * Also I looked at all the async logic and believe everything is in proper timing. This pattern perhaps would break if an await where added somewhere in a critical section?
 * It's actually extremely scuffed lmao. I'm counting on the get_ticket_didChangeTextDocumentNotificationPromise() not being captured on lambda "creation"?
 * but instead inside the lambda when I ask for it it gets the value.
 * This could make sense for references. It "should" be fine because maybe I'm actually capturing 'this' and then accessing the variable from there?
 * could 'this.get_ticket_didChangeTextDocumentNotificationPromise()' result in different lambda variablel capturing such and such?
 * I should probably make sure it works but I'm not there yet.
 */
async function EDITOR_didChangeTextDocumentNotification(absolutePath, version, startLine, startCharacter, endLine, endCharacter, text, ticket) {
    await window.myAPI.didChangeTextDocumentNotification(absolutePath, version, startLine, startCharacter, endLine, endCharacter, text, );
    if (get_ticket_didChangeTextDocumentNotificationPromise() === ticket) {
        didChangeTextDocumentNotificationPromise = null;
    }
}

/**
 * TODO: Exception during finalize softlocks the editor because you can't even clear to reset the state: 'Uncaught (in promise) Error: removeAt(...): index > this.count'
 * 
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_finalizeEdit(cursor) {
    /**
     * Later code needs to know the line index that the removal occurred on.
     * In a naive approach, presume every edit only spans a single line.
     * Then reversing backwards gets you the first line index that "fits" the edit and thus the line index the edit occurred on.
     * 
     * If for whatever reason the first time around this loop fails, then you never decremented so you wouldn't increment to restore
     * the iteration variable to the previous loop's state.
     */
    let indexLine_editOccurredOn = -1;

    switch (cursor.editKind) {
        case get_EditKind_InsertLtr():
            {
                for (let i = EDITOR_lineEndPositionList.count - 1; i >= 0; i--) {
                    if (cursor.editPosition <= EDITOR_lineEndPositionList.data[i]) {
                        EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                    }
                    else {
                        if (i === EDITOR_lineEndPositionList.count - 1) {
                            indexLine_editOccurredOn = i;
                        }
                        else {
                            indexLine_editOccurredOn = i + 1;
                        }
                        break;
                    }
                }
                for (var i = 0; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
                    EDITOR_trackedSyntaxList.getElementAt(i);
                    if (cursor.editPosition <= get_EDITOR_pooledTrackedSyntax_start()) {
                        EDITOR_trackedSyntaxList.setStart(i, get_EDITOR_pooledTrackedSyntax_start() + cursor.editLength);
                    }
                    else if (EDITOR_pooledTrackedSyntax_trackedSyntaxKind === get_TrackedSyntaxKind_Comment() &&
                            cursor.editPosition === get_EDITOR_pooledTrackedSyntax_start() + 1) {

                        // TODO: Insertion of '*' probably shouldn't remove.
                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (cursor.editPosition > get_EDITOR_pooledTrackedSyntax_start() && cursor.editPosition < get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length()) {
                        EDITOR_trackedSyntaxList.setLength(i, get_EDITOR_pooledTrackedSyntax_length() + cursor.editLength);
                    }
                }
                EDITOR_textByteList.insertBytes(cursor.editPosition, cursor.gapBuffer, /*offset*/ 0, /*length*/ cursor.gapBufferCount);

                set_ticket_didChangeTextDocumentNotificationPromise(get_ticket_didChangeTextDocumentNotificationPromise() + 1);
                let ticket = get_ticket_didChangeTextDocumentNotificationPromise();
                let textSourceIdentifier = EDITOR_FORMATTED_textSourceIdentifier;
                let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(cursor.editPosition);
                // TODO: Account for any '\t\0\0\0' that exist on the line
                let text = EDITOR_decoder.decode(cursor.gapBuffer.subarray(0, cursor.gapBufferCount));
                set_didChangeTextDocument_version(get_didChangeTextDocument_version() + 1);
                let version = get_didChangeTextDocument_version();
                if (didChangeTextDocumentNotificationPromise) {
                    didChangeTextDocumentNotificationPromise = didChangeTextDocumentNotificationPromise.then(async () => {
                        await EDITOR_didChangeTextDocumentNotification(
                            textSourceIdentifier,
                            version,
                            lineAndColumnIndices.indexLine,
                            lineAndColumnIndices.indexColumn,
                            lineAndColumnIndices.indexLine,
                            lineAndColumnIndices.indexColumn,
                            text,
                            ticket);
                    });
                }
                else {
                    didChangeTextDocumentNotificationPromise = EDITOR_didChangeTextDocumentNotification(
                        textSourceIdentifier,
                        version,
                        lineAndColumnIndices.indexLine,
                        lineAndColumnIndices.indexColumn,
                        lineAndColumnIndices.indexLine,
                        lineAndColumnIndices.indexColumn,
                        text,
                        ticket);
                }

                if (indexLine_editOccurredOn === get_EDITOR_longestLine_indexLine()) {
                    set_EDITOR_longestLine_length(get_EDITOR_longestLine_length() + cursor.editLength);
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                break;
            }
        case get_EditKind_Enter():
            {
                // TODO: A notification needs to sent to the LSP here
                // TODO: Update the tracked syntax list here... the enter key event actually is invoking 'EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength'...

                // I don't know what to do so I'm starting by making this enum, then switch over it.
                switch (cursor.enterKeyEventKind) {
                    case get_EnterKeyEventKind_StartOfLine():
                        if (cursor.cached_indentation_byteList) {
                            // TODO: Enter key should instead store the position of the indentation, then you can write the byte array that contains all of the "text"...
                            // ...you can insert the span that has the indentation into the same array again.
                            EDITOR_textByteList.insertBytes(cursor.editPosition, cursor.cached_indentation_byteList.bytes, /*offset*/ 0, cursor.cached_indentation_byteList.count);
                        }
                        EDITOR_textByteList.insert(cursor.editPosition + cursor.cached_indentation_byteList.count, get_EDITOR_ASCII_LINE_FEED());
                        for (var i = cursor.editIndexLine; i < EDITOR_lineEndPositionList.count; i++) {
                            EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                        }

                        if (cursor.editIndexLine <= get_EDITOR_longestLine_indexLine()) {
                            set_EDITOR_longestLine_indexLine(get_EDITOR_longestLine_indexLine() + 1);
                        }
                        EDITOR_lineEndPositionList.insert(cursor.editIndexLine, cursor.editPosition + cursor.cached_indentation_byteList.count);
                        break;
                    case get_EnterKeyEventKind_EndOfLine():
                        EDITOR_textByteList.insert(cursor.editPosition, get_EDITOR_ASCII_LINE_FEED());

                        if (cursor.cached_indentation_byteList) {
                            EDITOR_textByteList.insertBytes(cursor.editPosition + 1, cursor.cached_indentation_byteList.bytes, /*offset*/ 0, cursor.cached_indentation_byteList.count);
                        }
                        for (var i = cursor.editIndexLine; i < EDITOR_lineEndPositionList.count; i++) {
                            EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                        }

                        if (cursor.editIndexLine <= get_EDITOR_longestLine_indexLine()) {
                            set_EDITOR_longestLine_indexLine(get_EDITOR_longestLine_indexLine() + 1);
                        }
                        EDITOR_lineEndPositionList.insert(cursor.editIndexLine, cursor.editPosition);
                        break;
                    case get_EnterKeyEventKind_AmongALine():
                        EDITOR_textByteList.insert(cursor.editPosition, get_EDITOR_ASCII_LINE_FEED());

                        if (cursor.cached_indentation_byteList) {
                            EDITOR_textByteList.insertBytes(cursor.editPosition + 1, cursor.cached_indentation_byteList.bytes, /*offset*/ 0, cursor.cached_indentation_byteList.count);
                        }
                        for (var i = cursor.editIndexLine; i < EDITOR_lineEndPositionList.count; i++) {
                            EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                        }
                        
                        if (cursor.editIndexLine <= get_EDITOR_longestLine_indexLine()) {
                            set_EDITOR_longestLine_indexLine(get_EDITOR_longestLine_indexLine() + 1);
                        }
                        EDITOR_lineEndPositionList.insert(cursor.editIndexLine, cursor.editPosition);
                        break;
                    case get_EnterKeyEventKind_FallbackCase():
                        EDITOR_textByteList.insert(cursor.editPosition, get_EDITOR_ASCII_LINE_FEED());
                        
                        if (cursor.cached_indentation_byteList) {
                            EDITOR_textByteList.insertBytes(cursor.editPosition + 1, cursor.cached_indentation_byteList.bytes, /*offset*/ 0, cursor.cached_indentation_byteList.count);
                        }
                        for (var i = cursor.editIndexLine; i < EDITOR_lineEndPositionList.count; i++) {
                            EDITOR_lineEndPositionList.data[i] += cursor.editLength;
                        }

                        if (cursor.editIndexLine <= get_EDITOR_longestLine_indexLine()) {
                            set_EDITOR_longestLine_indexLine(get_EDITOR_longestLine_indexLine() + 1);
                        }
                        EDITOR_lineEndPositionList.insert(cursor.editIndexLine, cursor.editPosition);
                        break;
                }

                if (!cursor.enterKeyEventKind || cursor.enterKeyEventKind === get_EnterKeyEventKind_None() )  {
                    throw new Error('if (!enterKeyEventKind...)');
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                return;
            }
        case get_EditKind_Tab():
            {
                EDITOR_textByteList.insertBytes(cursor.editPosition, EDITOR_on_tab_bytes, /*offset*/ 0, /*length*/ 4);

                for (var i = cursor.editIndexLine; i < EDITOR_lineEndPositionList.count; i++) {
                    EDITOR_lineEndPositionList.data[i] += 4;
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                return;
            }
        case get_EditKind_IndentMore():
            {
                let ORIGINAL_incrementBy = get_EDITOR_indent_ORIGINAL_indentBy();
                let incrementBy = get_EDITOR_indent_ORIGINAL_indentBy();
                set_EDITOR_indent_ORIGINAL_indentBy(0);

                let startingIndex = get_EDITOR_indent_startingIndex();
                set_EDITOR_indent_startingIndex(0);
                let SMALL_lineAndColumnIndices_indexLine = get_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine();
                set_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine(0);

                for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices_indexLine; lineI--) {
                    let linePos = EDITOR_getLineBoundaryPositions(lineI);

                    // # Insert the text on the respective line.
                    EDITOR_textByteList.insertBytes(linePos.start, EDITOR_on_tab_bytes, 0 /*offset*/, 4 /*length*/);
                    
                    // # Increment the entry in 'EDITOR_lineEndPositionList' for the respective line
                    EDITOR_lineEndPositionList.data[lineI] += incrementBy;

                    // # Each loop you reduce incrementBy, because you're initial starting the loop knowing you will eventually insert 4 characters on every line.
                    //     # thus, the first iteration of the loop you're increasing that line's end position by the length of text inserted per line by the amount of lines.
                    //     # The next iteration is a smaller indexLine so you decrement because you have the insertion of one less line to consider.
                    incrementBy -= 4;
                }

                // # Any line that is not part of the selected set of lines, and is at a greater indexLine, needs to have their line end position entry updated.
                for (var lineI = startingIndex + 1; lineI < EDITOR_lineEndPositionList.count; lineI++) {
                    EDITOR_lineEndPositionList.data[lineI] += ORIGINAL_incrementBy;
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                return;
            }
        case get_EditKind_IndentLess():
            {
                let ORIGINAL_decrementBy = get_EDITOR_indent_ORIGINAL_indentBy();
                let decrementBy = get_EDITOR_indent_ORIGINAL_indentBy();
                set_EDITOR_indent_ORIGINAL_indentBy(0);

                let startingIndex = get_EDITOR_indent_startingIndex();
                set_EDITOR_indent_startingIndex(0);
                let SMALL_lineAndColumnIndices_indexLine = get_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine();
                set_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine(0);

                for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices_indexLine; lineI--) {
                    let innerRemoveCount = 0;
                    let linePos = EDITOR_getLineBoundaryPositions(lineI);
                    let line = linePos;
                    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(lineI);
                    let upperLimitIndexColumn;
                    if (lastValidIndexColumn > 4) {
                        upperLimitIndexColumn = 4;
                    }
                    else {
                        upperLimitIndexColumn = lastValidIndexColumn;
                    }
                    let seenSpace = false;
                    outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
                        let c = getCharacter(line.start + i);
                        switch (c) {
                            case ' ':
                                seenSpace = true;
                                innerRemoveCount++;
                                break;
                            case '\t':
                                if (!seenSpace) {
                                    innerRemoveCount += 4;
                                }
                                break outer;
                            default:
                                break outer;
                        }
                    }

                    EDITOR_textByteList.removeAt(linePos.start, innerRemoveCount);
                    EDITOR_lineEndPositionList.data[lineI] -= decrementBy;

                    decrementBy -= innerRemoveCount;
                }

                for (var lineI = startingIndex + 1; lineI < EDITOR_lineEndPositionList.count; lineI++) {
                    EDITOR_lineEndPositionList.data[lineI] -= ORIGINAL_decrementBy;
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                break;
            }
        case get_EditKind_Paste():
            {
                let content = cursor.EDITOR_paste_clipboardContent;
                cursor.EDITOR_paste_clipboardContent = null;

                let linesInsertedCount = 0;
                let insertionLength = 0;

                for (var sourceI = 0; sourceI < content.length; sourceI++) {
                    switch (content[sourceI]) {
                        case '\t':
                            EDITOR_textByteList.insertBytes(cursor.editPosition + insertionLength, EDITOR_tab_tabsbytes, /*offset*/ 0, /*length*/ 4);
                            insertionLength += 4;
                            break;
                        case '\n':
                            EDITOR_textByteList.insert(cursor.editPosition + insertionLength, get_EDITOR_ASCII_LINE_FEED());
                            EDITOR_lineEndPositionList.insert(cursor.editIndexLine + linesInsertedCount, cursor.editPosition + insertionLength);
                            insertionLength++;
                            linesInsertedCount++;
                            break;
                        case '\r':
                            if (sourceI < content.length - 1 && content[sourceI + 1] === '\n') {
                                sourceI++;
                            }
                            EDITOR_textByteList.insert(cursor.editPosition + insertionLength, get_EDITOR_ASCII_LINE_FEED());
                            EDITOR_lineEndPositionList.insert(cursor.editIndexLine + linesInsertedCount, cursor.editPosition + insertionLength);
                            insertionLength++;
                            linesInsertedCount++;
                            break;
                        default:
                            EDITOR_textByteList.insert(cursor.editPosition + insertionLength, content.charCodeAt(sourceI));
                            insertionLength++;
                            break;
                    }
                }

                for (var i = cursor.editIndexLine + linesInsertedCount; i < EDITOR_lineEndPositionList.count; i++) {
                    EDITOR_lineEndPositionList.data[i] += insertionLength;
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                return;
            }
        case get_EditKind_Duplicate():
            {
                let small = cursor.EDITOR_duplicate_small;
                let length = cursor.EDITOR_duplicate_length;

                cursor.EDITOR_duplicate_small = 0;
                cursor.EDITOR_duplicate_length = 0;

                let linesInsertedCount = 0;
                let insertionLength = 0;

                EDITOR_textByteList.duplicateWithin(small, cursor.editPosition, length);
                
                // TODO: cursor between '\t\0\0\0' is presumed to be the concern of the editor, duplication logic presumes correctness i.e.: that if the '\t' is selected that the '\0\0\0' that come after is selected too...
                // ...and that no partial selection over those characters could ever occur.

                // TODO: You should be able to do this much faster than looping over the selected bytes since you know the line end positions that exist and would know whether the selection will insert line endings.

                for (let offset = 0; offset < length; offset++) {
                    switch (EDITOR_textByteList.bytes[small + offset]) {
                        case get_EDITOR_ASCII_TAB():
                            insertionLength += 4; // ??? I think this is copy pasted from 'paste' logic where the tab would change to 4 characters total, in the case of duplication you get what you select.
                            break;
                        case get_EDITOR_ASCII_LINE_FEED():
                            EDITOR_lineEndPositionList.insert(cursor.editIndexLine + linesInsertedCount, cursor.editPosition + insertionLength);
                            insertionLength++;
                            linesInsertedCount++;
                            break;
                        default:
                            insertionLength++;
                            break;
                    }
                }

                for (var i = cursor.editIndexLine + linesInsertedCount; i < EDITOR_lineEndPositionList.count; i++) {
                    EDITOR_lineEndPositionList.data[i] += insertionLength;
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);
                return;
            }
        case get_EditKind_DeleteLtr():
        case get_EditKind_BackspaceRtl():
        case get_EditKind_RemoveTextNoBatching():
            {
                // TODO: surely u'd get this before doing the edit?
                let startLineAndColumnIndices;
                if (cursor.editKind === get_EditKind_RemoveTextNoBatching()) {
                    startLineAndColumnIndices = {
                        indexLine: cursor.editIndexLine,
                        indexColumn: cursor.editIndexColumn,
                    };
                }
                else {
                    startLineAndColumnIndices = EDITOR_getLineAndColumnIndices_raw(cursor.editPosition);
                }
                let endLineAndColumnIndices;
                if (cursor.editKind === get_EditKind_RemoveTextNoBatching()) {
                    endLineAndColumnIndices = {
                        indexLine: cursor.END_editIndexLine,
                        indexColumn: cursor.END_editIndexColumn,
                    };
                }
                else {
                    endLineAndColumnIndices = EDITOR_getLineAndColumnIndices_raw(cursor.editPosition + cursor.editLength);
                }

                if (cursor.editLineFeedCount > 0) {
                    let count = 0;
                    let lastMatchedIndexLine = 0;
                    for (let i = EDITOR_lineEndPositionList_PENDING.count - 1; i >= 0; i--) {
                        let lineEndPos = EDITOR_lineEndPositionList_PENDING.data[i];
                        if (cursor.editPosition <= lineEndPos && cursor.editPosition + cursor.editLength > lineEndPos) {
                            lastMatchedIndexLine = EDITOR_getLineAndColumnIndices_raw(lineEndPos).indexLine;
                            count++;
                            EDITOR_lineEndPositionList_PENDING.removeAt(i, 1);
                        }
                        else if (cursor.editPosition > lineEndPos) {
                            break;
                        }
                    }
                    if (count > 0) {
                        EDITOR_lineEndPositionList.removeAt(lastMatchedIndexLine, count);
                    }
                }
                for (let i = EDITOR_lineEndPositionList.count - 1; i >= 0; i--) {
                    if (cursor.editPosition < EDITOR_lineEndPositionList.data[i]) {
                        EDITOR_lineEndPositionList.data[i] -= cursor.editLength;
                    }
                    else {
                        if (i === EDITOR_lineEndPositionList.count - 1) {
                            indexLine_editOccurredOn = i;
                        }
                        else {
                            indexLine_editOccurredOn = i + 1;
                        }
                        break;
                    }
                }
                for (var i = EDITOR_trackedSyntaxList.count_abstract - 1; i >= 0; i--) {
                    EDITOR_trackedSyntaxList.getElementAt(i);
                    if (cursor.editPosition < get_EDITOR_pooledTrackedSyntax_start()) {
                        EDITOR_trackedSyntaxList.setStart(i, get_EDITOR_pooledTrackedSyntax_start() - cursor.editLength);
                    }
                    else if (get_EDITOR_pooledTrackedSyntax_start() >= cursor.editPosition && get_EDITOR_pooledTrackedSyntax_start() < cursor.editPosition + cursor.editLength) {
                        // TODO: This needs to remove more than 1 at a time
                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (EDITOR_pooledTrackedSyntax_trackedSyntaxKind === get_TrackedSyntaxKind_Comment() &&
                            (get_EDITOR_pooledTrackedSyntax_start() + 1) >= cursor.editPosition && (get_EDITOR_pooledTrackedSyntax_start() + 1) < cursor.editPosition + cursor.editLength) {
                        // TODO: You can invalidate a >1 char long by removing beyond just the first unless a character afterwards falls into place that is valid by chance
                        //
                        // only multi-line-comments that span multiple lines are stored in EDITOR_trackedSyntaxList with the 'get_TrackedSyntaxKind_Comment()'
                        //
                        EDITOR_trackedSyntaxList.removeAt(i, 1);
                    }
                    else if (cursor.editPosition > get_EDITOR_pooledTrackedSyntax_start() && cursor.editPosition < get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length()) {
                        EDITOR_trackedSyntaxList.setLength(i, get_EDITOR_pooledTrackedSyntax_length() - cursor.editLength);
                    }
                }

                EDITOR_textByteList.removeAt(cursor.editPosition, cursor.editLength);

                set_ticket_didChangeTextDocumentNotificationPromise(get_ticket_didChangeTextDocumentNotificationPromise() + 1);
                let ticket = get_ticket_didChangeTextDocumentNotificationPromise();
                let textSourceIdentifier = EDITOR_FORMATTED_textSourceIdentifier;
                // TODO: Account for any '\t\0\0\0' that exist on the line            
                let text = '';
                set_didChangeTextDocument_version(get_didChangeTextDocument_version() + 1);
                let version = get_didChangeTextDocument_version();
                if (didChangeTextDocumentNotificationPromise) {
                    didChangeTextDocumentNotificationPromise = didChangeTextDocumentNotificationPromise.then(async () => {
                        await EDITOR_didChangeTextDocumentNotification(
                            textSourceIdentifier,
                            version,
                            startLineAndColumnIndices.indexLine,
                            startLineAndColumnIndices.indexColumn,
                            endLineAndColumnIndices.indexLine,
                            endLineAndColumnIndices.indexColumn,
                            text,
                            ticket);
                    });
                }
                else {
                    didChangeTextDocumentNotificationPromise = EDITOR_didChangeTextDocumentNotification(
                        textSourceIdentifier,
                        version,
                        startLineAndColumnIndices.indexLine,
                        startLineAndColumnIndices.indexColumn,
                        endLineAndColumnIndices.indexLine,
                        endLineAndColumnIndices.indexColumn,
                        text,
                        ticket);
                }

                if (indexLine_editOccurredOn === get_EDITOR_longestLine_indexLine()) {
                    set_EDITOR_longestLine_length(get_EDITOR_longestLine_length() - cursor.editLength);
                }

                EDITOR_finalizeEdit_ClearEditState(cursor);

                /*
                - Syntax is fully encompassed by the removed text  => remove
                - Syntax's open is encompassed by the removed text => invalidate

                invalidate => remove

                Are these the same thing then?

                If the open is removed then yeah
                strings are possibly more complex than the multi-line-comment because the same open as close

                TODO: If the open is > 1 characters long then an insertions among those characters is a break too.
                */

                break;
            }
    }

    // indexLine_editOccurredOn is initialized to -1
    //
    // When gap buffer is finalized editor tries to redraw the line in order to lex it again.
    // You need to NOT do this when you are working with multiple cursors however, because it bugs everything out.
    // 
    if (EDITOR_cursorList.length === 1) {
        if (indexLine_editOccurredOn >= 0 && indexLine_editOccurredOn < EDITOR_lineEndPositionList.count) {
            if (get_EDITOR_gutter().children.length === get_EDITOR_virtualCount() &&
                get_EDITOR_textElement().children.length === get_EDITOR_virtualCount()) {
                    // TODO: Am I missing this 'indexLine_editOccurredOn < get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount()' in the 'EDITOR_indexLineTo_beltIndexLine' function??
                    let beltIndexLine = EDITOR_indexLineTo_beltIndexLine(indexLine_editOccurredOn);
                    if (beltIndexLine >= 0) {
                        let gutterLineElement = get_EDITOR_gutter().children[beltIndexLine];
                        gutterLineElement.innerHTML = '';
                        let textLineElement = get_EDITOR_textElement().children[beltIndexLine];
                        textLineElement.innerHTML = '';
                        EDITOR_drawLine(indexLine_editOccurredOn, gutterLineElement, textLineElement);
                    }
                    else {
                        // TODO: Consider what to do in this case.
                    }
            }
            else {
                // TODO: Consider what to do in this case.
            }
        }
    }
}

function EDITOR_finalizeEdit_ClearEditState(cursor) {
    cursor.editKind = get_EditKind_None();
    cursor.editLength = 0;
    cursor.editPosition = 0;
    cursor.editIndexLine = 0;
    cursor.editIndexColumn = 0;
    cursor.END_editIndexLine = 0;
    cursor.END_editIndexColumn = 0;
    cursor.gapBufferCount = 0;
    cursor.gapBufferWriteToSpanElement = null;
    cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex = 0;
    cursor.editLineFeedCount = 0;
    EDITOR_lineEndPositionList_PENDING.clear();
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_preKeyboardMovementSelectionLogic(cursor, shiftKey) {
    if (shiftKey) {
        if (!cursor.hasSelection()) {
            cursor.selectionAnchor = EDITOR_getPositionIndex(cursor);
            cursor.selectionIndexAnchorLine = cursor.indexLine;
            cursor.selectionIndexAnchorColumn = cursor.indexColumn;
        }
    }
    else {
        if (cursor.hasSelection()) {
            cursor.selectionAnchor = cursor.selectionEnd;
            cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
            cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_postKeyboardMovementSelectionLogic(cursor, shiftKey) {
    if (shiftKey) {
        cursor.selectionEnd = EDITOR_getPositionIndex(cursor);
        cursor.selectionIndexEndLine = cursor.indexLine;
        cursor.selectionIndexEndColumn = cursor.indexColumn;
    }
}

/**
 * More accurate description for this method beyond the name:
 * Duplicate the primaryCursor, then move the primaryCursor ArrowDown.
 */
function EDITOR_createCursorLineBelow(event) {
    let indexLastCursor = EDITOR_cursorList.length - 1;
    let lastCursor = EDITOR_cursorList[indexLastCursor];
    let clone = lastCursor.clone();
    event.shiftKey = false;
    EDITOR_arrowDown(lastCursor, /*shiftKey*/ false);
    EDITOR_cursorList.splice(indexLastCursor, 0, clone);
    get_EDITOR_cursorListElement().appendChild(clone.caretRow);
    EDITOR_drawCursor(clone);
    EDITOR_scrollCursorIntoView(lastCursor);
}

function EDITOR_createCursorAtNextMatchSelection(event) {
    if (!EDITOR_primaryCursor.hasSelection()) {
        return;
    }

    if (get_EDITOR_findOverlay_show() && !get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching()) {
        EDITOR_findOverlay_showSetter(false);
    }

    if (!get_EDITOR_findOverlay_show()) {
        set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching(true);
        EDITOR_findOverlay_showSetter(true);
        EDITOR_findOverlay_doSearch();

        let small = EDITOR_primaryCursor.selectionAnchor;
        let large = EDITOR_primaryCursor.selectionEnd;
        if (EDITOR_primaryCursor.selectionAnchor > EDITOR_primaryCursor.selectionEnd) {
            small = EDITOR_primaryCursor.selectionEnd;
            large = EDITOR_primaryCursor.selectionAnchor;
        }
        let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	    if (!spanCurrent) return;
        let current = parseInt(spanCurrent.textContent, 10);
        if (current) {
            set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber(current);
        }
        else {
            EDITOR_findOverlay_showSetter(false);
            return;
        }
    }

    let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	let upcomingNumber = parseInt(spanCurrent.textContent, 10);
	let total = parseInt(spanTotal.textContent, 10);
	if (upcomingNumber && total) {
		upcomingNumber++;
		if (upcomingNumber > total || upcomingNumber < 1) {
			upcomingNumber = 1;
		}
        if (get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber() === upcomingNumber) {
            return;
        }
	}
	else {
		spanCurrent.textContent = 'parseInt not successful?';
        return;
	}

    let prePosition = EDITOR_getPositionIndex(EDITOR_primaryCursor);

    // Avoid two cursors on the same line; wasteful double determination of primaryCursor index is occurring in this function; even a single case is likely not good long term.
    let upcomingPositionIndex = EDITOR_findOverlay_searchResultPositionList.data[upcomingNumber - 1];
    if (upcomingPositionIndex) {
        let upcomingLineAndColumnIndices = EDITOR_getLineAndColumnIndices(upcomingPositionIndex);
        let indexOfPrimaryCursor = -1;
        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            if (EDITOR_cursorList[i] === EDITOR_primaryCursor) {
                indexOfPrimaryCursor = i;
                break;
            }
        }
        let isPermitted = true;
        if (upcomingLineAndColumnIndices.indexLine === EDITOR_primaryCursor.indexLine) {
            //isPermitted = false;
        }
        // if u have a pending you need finalize before allow any of this keybind
        // if u have this keybind consecutively but then do ANYTHING else you are not allowed to press this keybind again until you clear all multicursors from the origin of having used this keybind.
        // u cannot keybind this if u have multicursors active but u ARE allowed to consecutively use this keybind to make multiple multi-cursors provided the origin of the multicursors was this event and every multicursor only came from this event and no other keybinds were pressed between.
        // it sounds like u need to track the multicursor origin and then when clearing the multicursors to only be primary u need to clear the origin cause no longer multicursor
        // cause there is too much going on so like I said u need to start by limiting interactions and then expand freedom later
        if (upcomingPositionIndex < prePosition) {
            if (upcomingLineAndColumnIndices.indexLine === EDITOR_cursorList[0].indexLine) {
                //isPermitted = false;
            }
        }

        if (!isPermitted) {
            alert('EDITOR_createCursorAtNextMatchSelection: two cursors would have been on the same line, thus this action was prevented. After closing this alert the previous one or many cursors that you had will remain and you can do a multicursor edit with them, then start a new multicursor edit at this "previously a second occurrence" of your selection on a single line. 1 cursor per line is done for the initial implementation to simplify things, then will be expanded upon after to support more than 1 on same line.');
            return;
        }
    }

    let clone = EDITOR_primaryCursor.clone();
    clone.selectionAnchor = EDITOR_primaryCursor.selectionAnchor;
    clone.selectionEnd = EDITOR_primaryCursor.selectionEnd;

    EDITOR_btnNext_onclick();

    let postPosition = EDITOR_getPositionIndex(EDITOR_primaryCursor);

    if (prePosition != postPosition && postPosition != get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber()) {
        let input = document.getElementById('EDITOR_findOverlay_input_elementId');
        if (!input || !input.value) return;

        let indexOfPrimaryCursor = -1;

        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            if (EDITOR_cursorList[i] === EDITOR_primaryCursor) {
                indexOfPrimaryCursor = i;
                break;
            }
        }

        EDITOR_cursorList.splice(indexOfPrimaryCursor, 0, clone);
        get_EDITOR_cursorListElement().appendChild(clone.caretRow);
        EDITOR_drawCursor(clone);

        EDITOR_primaryCursor.selectionAnchor = postPosition;
        EDITOR_primaryCursor.selectionEnd = postPosition + input.value.length;
        EDITOR_primaryCursor.indexColumn += input.value.length;
        EDITOR_drawCursor(EDITOR_primaryCursor);

        // Move primary cursor to index 0 of cursor list.
        if (postPosition < prePosition) {
            EDITOR_cursorList.splice(indexOfPrimaryCursor + 1, 1);
            EDITOR_cursorList.splice(0, 0, EDITOR_primaryCursor);
        }
    }
    else { // TODO: this is dead code with the pre-check of next match number?
        //EDITOR_primaryCursor.selectionAnchor = clone.selectionAnchor;
        //EDITOR_primaryCursor.selectionEnd = clone.selectionEnd;
        //EDITOR_primaryCursor.indexLine = clone.indexLine;
        //EDITOR_primaryCursor.indexColumn = clone.indexColumn;
        //EDITOR_drawCursor(EDITOR_primaryCursor);
    }
}

function EDITOR_cursorIndex_find_closestLessThanOrEqualToExistingCursorIndex(positionIndex) {
    let left = 0;
    let right = EDITOR_cursorList.length - 1;

    let index = -1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);

        let cursorPositionIndex = EDITOR_getPositionIndex(EDITOR_cursorList[mid]);
        
        if (positionIndex <= cursorPositionIndex) {
            index = mid;

            if (positionIndex === cursorPositionIndex) {
                break;
            }
            
            right = mid - 1;
        }
        else if (positionIndex > cursorPositionIndex) {
            left = mid + 1;
        }
        else {
            return; // NaN
        }
    }

    return index;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} shiftKey 
 */
function EDITOR_arrowDown(cursor, shiftKey) {
    EDITOR_movementBasedCacheInvalidation(cursor);
    EDITOR_preKeyboardMovementSelectionLogic(cursor, shiftKey);
    if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
        cursor.indexLine++;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
        if (cursor.STORED_indexColumn > lastValidIndexColumn) {
            cursor.indexColumn = lastValidIndexColumn;
        }
        else {
            cursor.indexColumn = cursor.STORED_indexColumn;
        }
    }
    EDITOR_postKeyboardMovementSelectionLogic(cursor, shiftKey);
    EDITOR_drawCursor(cursor);
}

/**
 * This function is expected to be used for a variety of scenarios,
 * but the initial use-case is caching the indentation when holding the 'enter' key, so that each consecutive event can know what the indentation was on the previous
 * event and not have to re-calculate it.
 * 
 * Then, the idea is that when the cursor moves you invoke this to invalidate that indentation cache so it gets recalculated.
 * 
 * TODO: I am quite certain that there are cases where this should be invoked but it isn't currently.
 * 
 * TODO: I believe this function to be an unoptimized solution, just that there are more pressing matters to attend to.
 * 
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_movementBasedCacheInvalidation(cursor) {
    if (cursor.editKind === get_EditKind_Enter()) {
        //
        // this only happens once even if you have many cursors because the next cursor that enters this function would be and editKind of None.
        //
        // The main concern is when a user holds down the Enter key, so while this change causes any cursor movement to finalize a pending Enter edit, it won't be nearly as detrimental as if holding down the Enter key were to not be optimized.
        //
        // TODO: Permit more than one Enter key edit event to batch
        // TODO: Cap the amount of enter key edit events that can batch as was done with the insertion.
        // TODO: Having Enter be an insertion, instead of its own EditKind, sounds like the better long term goal but it is believed that this change is trainsitionally helpful in getting to that final best solution.
        //
        EDITOR_finalizeAllCursors();
    }
    cursor.cached_indentation_byteList = null;
    cursor.cached_indentation_string = null;
    set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching(false);
}

/**
 * @param {*} clipboardContent This is a temporary hack to help in transitioning paste to an edit.
 */
function EDITOR_editEvent(editKind, event, clipboardContent) {
    // check for pending => selection
    // if so then finalize all current pending
    // ...this actually is checking for selection, then presuming at least 1 cursor has a pending...
    let shouldFinalizeAllCursors = false;
    let atLeastOneCursorHasASelection = false;
    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
        let cursor = EDITOR_cursorList[i];
        if (cursor.hasSelection()) {
            shouldFinalizeAllCursors = true;
            atLeastOneCursorHasASelection = true;
            break;
        }
    }
    if (shouldFinalizeAllCursors) {
        shouldFinalizeAllCursors = false;
        EDITOR_finalizeAllCursors();
    }

    // If you have delete/backspace you need to ONLY remove the selection if it exists not remove selection then delete/backspace
    // but insert needs to remove selection AND insert.
    if (editKind === get_EditKind_InsertLtr() || editKind === get_EditKind_Enter() || editKind === get_EditKind_Paste()) {
        // check for get_editKind_None() => selection
        // if so then attempt to remove selection foreach cursor
        // then finalize all those newly made selection removal edits
        if (atLeastOneCursorHasASelection) {
            shouldFinalizeAllCursors = true;
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor);
                }
            }
        }
        if (shouldFinalizeAllCursors) {
            shouldFinalizeAllCursors = false;
            EDITOR_finalizeAllCursors();
        }
    }

    // check for NOTcanBatch... I don't want the switch in the for loop... if you have a selection then you have a not can batch?
    switch (editKind) {
        case get_EditKind_InsertLtr():
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_insert(cursor, i)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case get_EditKind_DeleteLtr():
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_delete(cursor)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case get_EditKind_BackspaceRtl():
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                if (EDITOR_NOTcanBatch_backspace(cursor)) {
                    shouldFinalizeAllCursors = true;
                    break;
                }
            }
            break;
        case get_EditKind_Tab():
            shouldFinalizeAllCursors = true;
            break;
        case get_EditKind_IndentMore():
            shouldFinalizeAllCursors = true;
            break;
        case get_EditKind_IndentLess():
            shouldFinalizeAllCursors = true;
            break;
        case get_EditKind_Enter():
            shouldFinalizeAllCursors = true;
            break;
        case get_EditKind_Paste():
            shouldFinalizeAllCursors = true;
            break;
        case get_EditKind_Duplicate():
            shouldFinalizeAllCursors = true;
            break;
        default:
            throw new Error(`The EditKind:${editKind} was not recognized.`);
            break;
    }
    if (shouldFinalizeAllCursors) {
        shouldFinalizeAllCursors = false;
        EDITOR_finalizeAllCursors();
    }

    // start/continue edit... I don't want the switch in the for loop
    switch (editKind) {
        case get_EditKind_InsertLtr():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                set_EDITOR_indexCursor(i);
                EDITOR_movementBasedCacheInvalidation(cursor);
                if (get_EDITOR_offsetColumn_withRespectToThisIndexLine() !== cursor.indexLine) {
                    set_EDITOR_offsetColumn_withRespectToThisIndexLine(cursor.indexLine);
                    set_EDITOR_offsetColumn(0);
                }
                // You can do this because the function 'EDITOR_NOTcanBatch_insert' was already checked for all the cursors, if it is possible to batch, the editKind will stay InsertLtr otherwise it is finalized and set to None.
                // TODO: Use if === get_EditKind_None() for copy and paste safety / it might just even be more readable
                if (cursor.editKind !== get_EditKind_InsertLtr()) {
                    EDITOR_startEdit(cursor, get_EditKind_InsertLtr(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                }
                EDITOR_insertDo(cursor, event.key);
                cursor.STORED_indexColumn = cursor.indexColumn;
                EDITOR_drawCursor(cursor);
                set_EDITOR_offsetColumn(get_EDITOR_offsetColumn() + cursor.editLength);
                set_EDITOR_totalShift(get_EDITOR_totalShift() + cursor.editLength); // this isn't needed here, but it is needed elsewhere so in order to create a pattern it was included here... TODO: maybe get rid of this or...?
            }
            break;
        case get_EditKind_DeleteLtr():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                set_EDITOR_indexCursor(i);
                EDITOR_movementBasedCacheInvalidation(cursor);
                if (get_EDITOR_offsetColumn_withRespectToThisIndexLine() !== cursor.indexLine) {
                    set_EDITOR_offsetColumn_withRespectToThisIndexLine(cursor.indexLine);
                    set_EDITOR_offsetColumn(0);
                }
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor);
                }
                else {
                    if (cursor.editKind !== get_EditKind_DeleteLtr()) {
                        EDITOR_startEdit(cursor, get_EditKind_DeleteLtr(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                    }
                    EDITOR_deleteDo(cursor, event);
                }
                EDITOR_drawCursor(cursor);
                set_EDITOR_offsetColumn(get_EDITOR_offsetColumn() - cursor.editLength);
                set_EDITOR_totalShift(get_EDITOR_totalShift() - cursor.editLength); // this isn't needed here, but it is needed elsewhere so in order to create a pattern it was included here... TODO: maybe get rid of this or...?
            }
            break;
        case get_EditKind_BackspaceRtl():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                set_EDITOR_indexCursor(i);
                EDITOR_movementBasedCacheInvalidation(cursor);
                if (get_EDITOR_offsetColumn_withRespectToThisIndexLine() !== cursor.indexLine) {
                    set_EDITOR_offsetColumn_withRespectToThisIndexLine(cursor.indexLine);
                    set_EDITOR_offsetColumn(0);
                }
                if (cursor.hasSelection()) {
                    EDITOR_removeSelection(cursor);
                }
                else {
                    if (cursor.editKind !== get_EditKind_BackspaceRtl()) {
                        EDITOR_startEdit(cursor, get_EditKind_BackspaceRtl(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                    }
                    EDITOR_backspaceDo(cursor, event);
                    cursor.STORED_indexColumn = cursor.indexColumn;
                }
                EDITOR_drawCursor(cursor);
                set_EDITOR_offsetColumn(get_EDITOR_offsetColumn() - cursor.editLength);
                set_EDITOR_totalShift(get_EDITOR_totalShift() - cursor.editLength); // this isn't needed here, but it is needed elsewhere so in order to create a pattern it was included here... TODO: maybe get rid of this or...?
            }
            break;
        case get_EditKind_Tab():
            for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                let cursor = EDITOR_cursorList[i];
                EDITOR_movementBasedCacheInvalidation(cursor);
                if (cursor.hasSelection()) {
                    if (event.shiftKey) {
                        if (cursor.editKind !== get_EditKind_IndentLess()) {
                            EDITOR_startEdit(cursor, get_EditKind_IndentLess(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                        }
                        EDITOR_indentLess(cursor);
                    }
                    else {
                        if (cursor.editKind !== get_EditKind_IndentMore()) {
                            EDITOR_startEdit(cursor, get_EditKind_IndentMore(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                        }
                        EDITOR_indentMore(cursor);
                    }
                }
                else {
                    if (event.shiftKey) {
                    	// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor...
                    	// ...multi-cursor in and of itself is buggy that's why I'm not overly concerned with adding this in a bugged state...
                    	// ...everything is buggy and it is very anxiety inducing and for the time being I guess it just has to be that way as I transition
                    	// towards a useable editor all the features are coming together but there's this awkward phase of "I can start using it but also not really" or something I just idk.
                    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
                        if (cursor.editKind !== get_EditKind_IndentLess()) {
                            EDITOR_startEdit(cursor, get_EditKind_IndentLess(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                        }
                        EDITOR_indentLess(cursor);
                    }
                    else {
                        if (cursor.editKind !== get_EditKind_Tab()) {
                            EDITOR_startEdit(cursor, get_EditKind_Tab(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                        }
                        EDITOR_tabKey(cursor);
                    }
                }
                EDITOR_drawCursor(cursor);
            }
            break;
        case get_EditKind_Enter():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.editKind !== get_EditKind_Enter()) {
                    EDITOR_startEdit(cursor, get_EditKind_Enter(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                }
                EDITOR_EnterKey(cursor, event.ctrlKey, event.shiftKey);
                cursor.STORED_indexColumn = cursor.indexColumn;
                EDITOR_drawCursor(cursor);
                set_EDITOR_offsetLine(get_EDITOR_offsetLine() + 1);
            }
            break;
        case get_EditKind_Paste():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.editKind !== get_EditKind_Enter()) {
                    EDITOR_startEdit(cursor, get_EditKind_Paste(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                }
                EDITOR_paste(cursor, clipboardContent);
                cursor.STORED_indexColumn = cursor.indexColumn;
                EDITOR_drawCursor(cursor);
            }
            break;
        case get_EditKind_Duplicate():
            for (var i = 0; i < EDITOR_cursorList.length; i++) {
                let cursor = EDITOR_cursorList[i];
                if (cursor.editKind !== get_EditKind_Duplicate()) {
                    EDITOR_startEdit(cursor, get_EditKind_Duplicate(), EDITOR_getPositionIndex_raw(cursor), /*editLength*/ 0);
                }
                EDITOR_duplicateSelection(cursor);
                cursor.STORED_indexColumn = cursor.indexColumn;
                EDITOR_drawCursor(cursor);
            }
            break;
        default:
            throw new Error(`The EditKind:${editKind} was not recognized.`);
            break;
    }
}

function EDITOR_registerHandlers() {
    EDITOR_baseElement.addEventListener('keydown', async event => {
        // Explicitly inlining 'clearMulticursorState()' because it currently is and I just don't want to make a decision about this right now.
        // So what I can do is mark the code paragraph for later decision making.
        set_EDITOR_indexCursor(0);
        set_EDITOR_offsetLine(0);
        set_EDITOR_offsetColumn_withRespectToThisIndexLine(0);
        set_EDITOR_offsetColumn(0);
        set_EDITOR_totalShift(0);
        EDITOR_offsetWithinSpan_withRespectToThisSpan = null;
        set_EDITOR_offsetWithinSpan(0);

        switch (event.key) {
            case 'ArrowLeft':
            {
                event.preventDefault();
                
                for (var i = 0; i < EDITOR_cursorList.length; i++) {
                    let cursor = EDITOR_cursorList[i];
                    set_EDITOR_indexCursor(i);
                    EDITOR_movementBasedCacheInvalidation(cursor);
                    if (get_EDITOR_offsetColumn_withRespectToThisIndexLine() !== cursor.indexLine) {
                        set_EDITOR_offsetColumn_withRespectToThisIndexLine(cursor.indexLine);
                        set_EDITOR_offsetColumn(0);
                    }

                    if (cursor.hasSelection() && !event.shiftKey) {
                        let small;
                        if (cursor.selectionAnchor < cursor.selectionEnd) {
                            small = cursor.selectionAnchor;
                        }
                        else {
                            small = cursor.selectionEnd;
                        }
                        let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(small);
                        cursor.indexLine = lineAndColumnIndices.indexLine;
                        cursor.indexColumn = lineAndColumnIndices.indexColumn;
                        cursor.selectionAnchor = cursor.selectionEnd;
                        cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
                        cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
                    }
                    else {
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        if (event.ctrlKey & cursor.indexColumn > 0) {
                            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
                            let indexPosition = line.start + cursor.indexColumn;
                            let originalCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, indexPosition);
                            cursor.indexColumn--;
                            indexPosition--;
    
                            while (cursor.indexColumn > 0) {
                                if (EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, indexPosition) === originalCharacterKind) {
                                    cursor.indexColumn--;
                                    indexPosition--;
                                }
                                else {
                                    break;
                                }
                            }
                        }
                        else {
                            if (cursor.indexColumn > 0) {
                                cursor.indexColumn--;
                            }
                            else if (cursor.indexLine > 0) {
                                cursor.indexLine--;
                                cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    }
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                    set_EDITOR_offsetColumn(get_EDITOR_offsetColumn() + cursor.editLength);
                    set_EDITOR_totalShift(get_EDITOR_totalShift() + cursor.editLength);
                }
                break;
            }
            case 'ArrowDown':
            {
                event.preventDefault();
                if (event.ctrlKey) {
                    EDITOR_baseElement.scrollBy(0, get_EDITOR_lineHeight());
                }
                else if (event.altKey) {
                    if (event.shiftKey) {
                        EDITOR_createCursorLineBelow(event);
                    }
                }
                else {
                    let lastCursor = EDITOR_cursorList[EDITOR_cursorList.length - 1];
                    if (lastCursor.indexLine === EDITOR_lineEndPositionList.count - 1) {
                        if (EDITOR_cursorList.length - 1 > 0 && EDITOR_cursorList[EDITOR_cursorList.length - 2].indexLine === lastCursor.indexLine - 1) {
                            alert("ArrowDown: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                            return;
                        }
                    }
                    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                        EDITOR_arrowDown(EDITOR_cursorList[i], /*shiftKey*/ event.shiftKey);
                    }
                }
                break;
            }
            case 'ArrowUp':
            {
                event.preventDefault();
                if (event.ctrlKey) {
                    EDITOR_baseElement.scrollBy(0, -1 * get_EDITOR_lineHeight());
                }
                else {
                    let firstCursor = EDITOR_cursorList[0];
                    if (firstCursor.indexLine === 0) {
                        if (EDITOR_cursorList.length - 1 > 0 && EDITOR_cursorList[1].indexLine === firstCursor.indexLine + 1) {
                            alert("ArrowUp: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                            return;
                        }
                    }
                    for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                        let cursor = EDITOR_cursorList[i];
                        EDITOR_movementBasedCacheInvalidation(cursor);
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        if (cursor.indexLine > 0) {
                            cursor.indexLine--;
                            let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                            if (cursor.STORED_indexColumn > lastValidIndexColumn) {
                                cursor.indexColumn = lastValidIndexColumn;
                            }
                            else {
                                cursor.indexColumn = cursor.STORED_indexColumn;
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        EDITOR_drawCursor(cursor);
                    }
                }
                break;
            }
            case 'ArrowRight':
            {
                event.preventDefault();

                for (var i = 0; i < EDITOR_cursorList.length; i++) {
                    let cursor = EDITOR_cursorList[i];
                    set_EDITOR_indexCursor(i);
                    EDITOR_movementBasedCacheInvalidation(cursor);
                    if (get_EDITOR_offsetColumn_withRespectToThisIndexLine() !== cursor.indexLine) {
                        set_EDITOR_offsetColumn_withRespectToThisIndexLine(cursor.indexLine);
                        set_EDITOR_offsetColumn(0);
                    }

                    if (cursor.hasSelection() && !event.shiftKey) {
                        let large;
                        if (cursor.selectionAnchor < cursor.selectionEnd) {
                            large = cursor.selectionEnd;
                        }
                        else {
                            large = cursor.selectionAnchor;
                        }
                        let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(large);
                        cursor.indexLine = lineAndColumnIndices.indexLine;
                        cursor.indexColumn = lineAndColumnIndices.indexColumn;
                        cursor.selectionAnchor = cursor.selectionEnd;
                        cursor.selectionIndexAnchorLine = cursor.selectionIndexEndLine;
                        cursor.selectionIndexAnchorColumn = cursor.selectionIndexEndColumn;
                    }
                    else {
                        EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                        if (event.ctrlKey & cursor.indexColumn < lastValidIndexColumn) {
                            let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);
                            let indexPosition = line.start + cursor.indexColumn;
                            let originalCharacterKind = EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, indexPosition, line.end);
                            cursor.indexColumn++;
                            indexPosition++;
        
                            while (cursor.indexColumn < lastValidIndexColumn) {
                                if (EDITOR_getCharacterCurrent_KIND(cursor.indexColumn, indexPosition, line.end) === originalCharacterKind) {
                                    cursor.indexColumn++;
                                    indexPosition++;
                                }
                                else {
                                    break;
                                }
                            }
                        }
                        else {
                            if (cursor.indexColumn < lastValidIndexColumn) {
                                cursor.indexColumn++;
                            }
                            else if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
                                cursor.indexColumn = 0;
                                cursor.indexLine++;
                            }
                        }
                        EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    }
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                    set_EDITOR_offsetColumn(get_EDITOR_offsetColumn() + cursor.editLength);
                    set_EDITOR_totalShift(get_EDITOR_totalShift() + cursor.editLength);
                }
                break;
            }
            case 'Home':
            {
                event.preventDefault();
                if (event.ctrlKey && EDITOR_cursorList.length > 1) {
                    alert("Home: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                    return;
                }
                for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_movementBasedCacheInvalidation(cursor);
                    EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    if (event.ctrlKey) {
                        cursor.indexLine = 0;
                        cursor.indexColumn = 0;
                    }
                    else {
                        let endExclusiveIndentationIndexColumn = EDITOR_findEndExclusiveIndentationIndexColumn(cursor);
                        if (cursor.indexColumn == endExclusiveIndentationIndexColumn) {
                            cursor.indexColumn = 0;
                        }
                        else {
                            cursor.indexColumn = endExclusiveIndentationIndexColumn;
                        }
                    }
                    EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                }
                break;
            }
            case 'End':
            {
                event.preventDefault();
                if (event.ctrlKey && EDITOR_cursorList.length > 1) {
                    alert("End: this would cause two cursors to exist on the same line, for the initial simpler implementation two cursors being on the same line is not permitted.");
                    return;
                }
                for (var i = EDITOR_cursorList.length - 1; i >= 0; i--) {
                    let cursor = EDITOR_cursorList[i];
                    EDITOR_movementBasedCacheInvalidation(cursor);
                    EDITOR_preKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    if (event.ctrlKey) {
                        cursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
                    EDITOR_postKeyboardMovementSelectionLogic(cursor, event.shiftKey);
                    cursor.STORED_indexColumn = cursor.indexColumn;
                    EDITOR_drawCursor(cursor);
                }
                break;
            }
            case 'PageDown':
            {
                if (event.ctrlKey) {
                    // This doesn't seem to make a difference for me but I feel like I should have this line regardless...
                    // ...in case someone's computer for some reason would end up having default behavior even though mine seems to not.
                    event.preventDefault();
                    EDITOR_primaryCursor.indexLine = get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount();
                    if (get_EDITOR_virtualCount() > 1) {
                        // this seems to more commonly have the cursor staying within the viewport rather than overlapping outside.
                        EDITOR_primaryCursor.indexLine--;
                    }
                    if (EDITOR_primaryCursor.indexLine >= EDITOR_lineEndPositionList.count) {
                        // TODO: You can't delete EOF can you? i.e.: cursor final position of file then delete?
                        EDITOR_primaryCursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    EDITOR_primaryCursor.indexColumn = 0;
                    // TODO: allow someone to select via this keybind, but for now it causes a bad selection if you { 'Ctrl' + 'a' } then use it so I'm clearing any active selection here for now.
                    EDITOR_primaryCursor.selectionAnchor = EDITOR_primaryCursor.selectionEnd;
                    EDITOR_drawCursor(EDITOR_primaryCursor);
                }
                break;
            }
			case 'PageUp':
            {
                if (event.ctrlKey) {
                    // This doesn't seem to make a difference for me but I feel like I should have this line regardless...
                    // ...in case someone's computer for some reason would end up having default behavior even though mine seems to not.
                    event.preventDefault();
                    EDITOR_primaryCursor.indexLine = get_EDITOR_virtualIndexLine();
                    if (get_EDITOR_virtualCount() > 1) {
                        // this seems to more commonly have the cursor staying within the viewport rather than overlapping outside.
                        EDITOR_primaryCursor.indexLine++;
                    }
                    if (EDITOR_primaryCursor.indexLine >= EDITOR_lineEndPositionList.count) {
                        // TODO: You can't delete EOF can you? i.e.: cursor final position of file then delete?
                        EDITOR_primaryCursor.indexLine = EDITOR_lineEndPositionList.count - 1;
                    }
                    EDITOR_primaryCursor.indexColumn = 0;
                    // TODO: allow someone to select via this keybind, but for now it causes a bad selection if you { 'Ctrl' + 'a' } then use it so I'm clearing any active selection here for now.
                    EDITOR_primaryCursor.selectionAnchor = EDITOR_primaryCursor.selectionEnd;
                    EDITOR_drawCursor(EDITOR_primaryCursor);
                }
                break;
            }
            case 'Delete':
            {
                EDITOR_editEvent(get_EditKind_DeleteLtr(), event);
                break;
            }
            case 'Backspace':
            {
                EDITOR_editEvent(get_EditKind_BackspaceRtl(), event);
                break;
            }
            case 'Escape':
            {
                EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
                break;
            }
            case ' ':
            {
                event.preventDefault();
                // len is 1 of this case, pattern doesn't match on purpose
                break;
            }
            case 'Tab':
            {
                event.preventDefault();
                EDITOR_editEvent(get_EditKind_Tab(), event);
                break;
            }
            case 'Enter':
            {
                // Enter key relies on cached data that would be cleared, pattern doesn't match on purpose
                EDITOR_editEvent(get_EditKind_Enter(), event);
                break;
            }
            case 'F12':
            {
                //await window.myAPI.editorDocumentSymbolsRequest();
                break;
            }
        }

        // TODO: Checking for a length of 1 is probably wrong but it'll let me start writing some code
        if (event.key.length === 1) {
            if (event.ctrlKey) {
                EDITOR_movementBasedCacheInvalidation(EDITOR_primaryCursor);
                switch (event.key) {
                    case 'c':
                        EDITOR_finalizeAllCursors();
                        await EDITOR_copySelection(EDITOR_primaryCursor);
                        break;
                    case 'x':
                        EDITOR_finalizeAllCursors();
                        await EDITOR_copySelection(EDITOR_primaryCursor);
                        EDITOR_removeSelection(EDITOR_primaryCursor); // TODO: Multicursor bad
                        EDITOR_drawCursor(EDITOR_primaryCursor);
                        break;
                    case 'v':
                        let clipboard = await window.myAPI.readClipboard();
                        EDITOR_editEvent(get_EditKind_Paste(), event, clipboard);
                        break;
                    case 'd':
                        EDITOR_editEvent(get_EditKind_Duplicate(), event);
                        break;
                    case 'a':
                        event.preventDefault();
                        EDITOR_finalizeAllCursors(); // TODO: Multicursor bad
                        EDITOR_primaryCursor.selectionAnchor = 0;
                        EDITOR_primaryCursor.selectionEnd = EDITOR_textByteList.count;
                        let selectionEndLineAndColumnIndices = EDITOR_getLineAndColumnIndices(EDITOR_primaryCursor.selectionEnd);
                        EDITOR_primaryCursor.indexLine = selectionEndLineAndColumnIndices.indexLine;
                        EDITOR_primaryCursor.indexColumn = selectionEndLineAndColumnIndices.indexColumn;
                        EDITOR_drawCursor(EDITOR_primaryCursor, /*NOTscrollCursorIntoView*/ true);
                        break;
                    case 'f':
                        EDITOR_findOverlay_showSetter(!get_EDITOR_findOverlay_show());
                        break;
                    case 'z':
                        //alert('undo');
                        break;
                    case 'y':
                        //alert('redo');
                        break;
                }
            }
            else if (event.altKey) {
            	switch (event.key) {
                    case '>':
                        if (event.shiftKey) {
                            let local_findOverlay_isBeingShownDueToMultiCursorMatching = get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching();
                            EDITOR_movementBasedCacheInvalidation(EDITOR_primaryCursor);
                            set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching(local_findOverlay_isBeingShownDueToMultiCursorMatching);
                            EDITOR_createCursorAtNextMatchSelection(event);
                        }
                        break;
                }
            }
            else {
                EDITOR_editEvent(get_EditKind_InsertLtr(), event);
            }

            return;
        }
    });

    EDITOR_baseElement.addEventListener('mousedown', event => {
        EDITOR_movementBasedCacheInvalidation(EDITOR_primaryCursor);
        
        if (EDITOR_cursorList.length > 1) {
            EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();
        }
        
        // TODO: You might want to do this inside 'EDITOR_finalizeAllCursors_andClearNonPrimaryCursors();' at the end... I'm not sure.
        set_EDITOR_indexCursor(0);
        set_EDITOR_offsetColumn(0);
        set_EDITOR_offsetLine(0);

        if (get_EDITOR_recentBoundingClientRect_isNull_intFalsey()) {
            let boundingClientRect = EDITOR_baseElement.getBoundingClientRect();
            set_EDITOR_recentBoundingClientRect_left(boundingClientRect.left);
            set_EDITOR_recentBoundingClientRect_top(boundingClientRect.top);
            set_EDITOR_recentBoundingClientRect_isNull_intFalsey(0);
        }

        if (event.button === 0) {
            set_EDITOR_isSourceOfLeftMouseButton(true);
            EDITOR_onMouseMove_timer = null;
        }

        let rY = event.clientY - get_EDITOR_recentBoundingClientRect_top() + EDITOR_baseElement.scrollTop;
        let rX = event.clientX - get_EDITOR_recentBoundingClientRect_left() - get_EDITOR_gutterWidthTotal() + EDITOR_baseElement.scrollLeft;
        
        let indexLine = Math.floor(rY / get_EDITOR_lineHeight());
        let indexColumn = Math.round(rX / EDITOR_characterWidth);

        if (indexLine < 0) {
            indexLine = 0;
        }

        if (indexColumn < 0) {
            indexColumn = 0;
        }

        if (indexLine >= EDITOR_lineEndPositionList.count) {
            indexLine = EDITOR_lineEndPositionList.count - 1;
        }

        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(indexLine);
        if (indexColumn > lastValidIndexColumn) {
            indexColumn = lastValidIndexColumn;
        }

        if (rX < -1 * get_EDITOR_gutterPaddingRight()) {
            set_EDITOR_detailRank(3);
            EDITOR_onMouseDownDetailRankThree(event, indexLine, indexColumn);
            return;
        }

        if (event.detail % 3 === 0) {
            set_EDITOR_detailRank(3);
            EDITOR_onMouseDownDetailRankThree(event, indexLine, indexColumn);
        }
        else if (event.detail % 2 === 0) {
            set_EDITOR_detailRank(2);
            EDITOR_onMouseDownDetailRankTwo(event, indexLine, indexColumn);
        }
        else {
            set_EDITOR_detailRank(1);
            EDITOR_onMouseDownDetailRankOne(event, indexLine, indexColumn);
        }
    });

    EDITOR_baseElement.addEventListener('mousemove', EDITOR_onMouseMove_WRAPIT.bind(this));

    EDITOR_baseElement.addEventListener('scroll', EDITOR_onScroll_WRAPIT.bind(this));

    EDITOR_baseElement.addEventListener('wheel', event => {
        if (event.shiftKey) {
            EDITOR_baseElement.scrollBy(event.deltaY, 0);
            get_EDITOR_horizontal_scrollbar().scrollLeft = EDITOR_baseElement.scrollLeft;
        }
    });

    EDITOR_baseElement.addEventListener('contextmenu', async event => {
        let optionList = [
            new MenuOption(get_CommandKind_Cut(), 'Cut', null),
            new MenuOption(get_CommandKind_Copy(), 'Copy', null),
            new MenuOption(get_CommandKind_Paste(), 'Paste', null),
            new MenuOption(get_CommandKind_Find(), 'Find', null),
        ];

        let menuLeft = get_EDITOR_recentBoundingClientRect_left() + get_EDITOR_gutterWidthTotal() + EDITOR_primaryCursor.cursorTranslateXValue - EDITOR_baseElement.scrollLeft;
        let menuTop = get_EDITOR_recentBoundingClientRect_top() + EDITOR_primaryCursor.cursorTranslateYValue + get_EDITOR_lineHeight() - EDITOR_baseElement.scrollTop;

        if (event.button === 2) {
            menuSet('EDITOR', null, optionList, menuLeft, menuTop);
        } else {
            menuSet('EDITOR', null, optionList, menuLeft, menuTop);
        }
    });

    window.addEventListener('resize', EDITOR_onResize_WRAPIT.bind(this));

    get_EDITOR_horizontal_scrollbar().addEventListener('scroll', () => {
        EDITOR_baseElement.scrollLeft = get_EDITOR_horizontal_scrollbar().scrollLeft;
    });
}

function EDITOR_findOverlay_doSearch() {
	let input = document.getElementById('EDITOR_findOverlay_input_elementId');
    if (!input || !input.value) return;
    
    let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
    
    set_EDITOR_findOverlay_wasSearched(true);

    let searchEncoded = EDITOR_encoder.encode(input.value);

    EDITOR_finalizeAllCursors();

    EDITOR_findOverlay_searchResultPositionList.clear();

    let offset = 0;
    let posStartOfMatch = 0;

    /** Given the current EDITOR_primaryCursor position, which match comes next. */
    let nextMatchNumber = -1;
    let nextMatchPos;

    if (EDITOR_primaryCursor.hasSelection()) {
        let small = EDITOR_primaryCursor.selectionAnchor;
        let large = EDITOR_primaryCursor.selectionEnd;
        if (EDITOR_primaryCursor.selectionAnchor > EDITOR_primaryCursor.selectionEnd) {
            small = EDITOR_primaryCursor.selectionEnd;
            large = EDITOR_primaryCursor.selectionAnchor;
        }
        nextMatchPos = small;
    }
    else {
        nextMatchPos = EDITOR_getPositionIndex(EDITOR_primaryCursor);
    }
    
    if (get_EDITOR_findOverlay_options_matchWord() && ((searchEncoded[0] >= 97 && searchEncoded[0] <= 122) || (searchEncoded[0] >= 65 && searchEncoded[0] <= 90) || (searchEncoded[0] >= 48 && searchEncoded[0] <= 57) || (searchEncoded[0] === 95))) {
		for (let i = 0; i < EDITOR_textByteList.count; i++) {
			if ((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95)) {
				if (EDITOR_textByteList.bytes[i] === searchEncoded[0]) {
    				while (i < EDITOR_textByteList.count) { // context switch to checking match
    					if (EDITOR_textByteList.bytes[i] === searchEncoded[offset]) {
				            if (offset === 0) {
				                posStartOfMatch = i;
				            }
				            offset++;
				            if (offset === searchEncoded.length) { // found "possible match"
				            	if (i + 1 >= EDITOR_textByteList.count ||
				            		!((EDITOR_textByteList.bytes[i + 1] >= 97 && EDITOR_textByteList.bytes[i + 1] <= 122) || (EDITOR_textByteList.bytes[i + 1] >= 65 && EDITOR_textByteList.bytes[i + 1] <= 90) || (EDITOR_textByteList.bytes[i + 1] >= 48 && EDITOR_textByteList.bytes[i + 1] <= 57) || (EDITOR_textByteList.bytes[i + 1] === 95))) { // ends on a word, therefore take match
					            		EDITOR_findOverlay_searchResultPositionList.insert(EDITOR_findOverlay_searchResultPositionList.count, posStartOfMatch);
                                        if (nextMatchNumber === -1 && posStartOfMatch >= nextMatchPos) {
                                            nextMatchNumber = EDITOR_findOverlay_searchResultPositionList.count;
                                            nextMatchPos = posStartOfMatch;
                                        }
				                		offset = 0;
				                		break;
				            	}
				            	else { // does NOT end on a word, therefore ignore match
				            		offset = 0;
				            		while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
				            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
				            				i--; // backtrack by one due to outer for loop's incrementation step
				            				break;
				            			}
			            				i++;
				            		}
				                	break;
				            	}
				            }
				            i++;
				        }
				        else {
				            offset = 0;
				            while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
		            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
		            				i--; // backtrack by one due to outer for loop's incrementation step
		            				break;
		            			}
	            				i++;
		            		}
				            break;
				        }
					}
				}
				else {
					while (i < EDITOR_textByteList.count) { // move pos to next NON(letterOrDigit) or EOF
            			if (!((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95))) {
            				i--; // backtrack by one due to outer for loop's incrementation step
            				break;
            			}
        				i++;
            		}
				}
			}
			else {
				while (i < EDITOR_textByteList.count) { // move pos to next letterOrDigit or EOF
        			if ((EDITOR_textByteList.bytes[i] >= 97 && EDITOR_textByteList.bytes[i] <= 122) || (EDITOR_textByteList.bytes[i] >= 65 && EDITOR_textByteList.bytes[i] <= 90) || (EDITOR_textByteList.bytes[i] >= 48 && EDITOR_textByteList.bytes[i] <= 57) || (EDITOR_textByteList.bytes[i] === 95)) {
        				i--; // backtrack by one due to outer for loop's incrementation step
        				break;
        			}
    				i++;
        		}
			}
	    }
    }
    else {
    	for (let i = 0; i < EDITOR_textByteList.count; i++) {
	        if (EDITOR_textByteList.bytes[i] === searchEncoded[offset]) {
	            if (offset === 0) {
	                posStartOfMatch = i;
	            }
	            offset++;
	            if (offset === searchEncoded.length) {
	                EDITOR_findOverlay_searchResultPositionList.insert(EDITOR_findOverlay_searchResultPositionList.count, posStartOfMatch);
                    if (nextMatchNumber === -1 && posStartOfMatch >= nextMatchPos) {
                        nextMatchNumber = EDITOR_findOverlay_searchResultPositionList.count;
                        nextMatchPos = posStartOfMatch;
                    }
	                offset = 0;
	            }
	        }
	        else {
	            // I'm not sure how I like this. It feels wasteful to set this to 0.
	            // But if I check to see if it is 0, that feels even more wasteful.
	            offset = 0;
	        }
	    }
    }

    if (nextMatchNumber === -1) {
        nextMatchNumber = 1;
    }
    spanCurrent.textContent = nextMatchNumber;
    spanTotal.textContent = EDITOR_findOverlay_searchResultPositionList.count;
}

function EDITOR_findOverlay_input_onkeydown(event) {
    switch (event.key) {
        case 'Enter':
            EDITOR_findOverlay_doSearch();
            break;
        case 'Escape':
        	set_EDITOR_findOverlay_wasSearched(false);
            EDITOR_findOverlay_showSetter(false);
            EDITOR_baseElement.focus();
            break;
    }
}

function EDITOR_findOverlay_input_onblur() {
	if (!get_EDITOR_findOverlay_wasSearched()) {
		EDITOR_findOverlay_doSearch();
	}
}

function EDITOR_findOverlay_input_onchange() {
	set_EDITOR_findOverlay_wasSearched(false);
}

function EDITOR_findOverlay_checkboxMatchWord_onchange() {
	// for an onchange event, event.target might always be precise?
	let checkboxMatchWord = document.getElementById('EDITOR_findOverlay_checkboxMatchWord');
    if (checkboxMatchWord) {
    	set_EDITOR_findOverlay_options_matchWord(checkboxMatchWord.checked);
    	EDITOR_findOverlay_doSearch();
    }
}

function EDITOR_findOverlay_showSetter(showValue) {
    EDITOR_finalizeAllCursors();

    if (!get_EDITOR_findOverlay_show() && showValue) {
        EDITOR_findOverlay.style.visibility = '';
        EDITOR_findOverlay_searchResultPositionList = new UInt32List(256);
        
        let input = document.createElement('input');
        input.id = 'EDITOR_findOverlay_input_elementId';
        // 'change' needs to be the first event added so the 'Enter' keydown happens with proper timing
        input.addEventListener('change', EDITOR_findOverlay_input_onchange);
        input.addEventListener('keydown', EDITOR_findOverlay_input_onkeydown);
        input.addEventListener('blur', EDITOR_findOverlay_input_onblur);
        EDITOR_findOverlay.appendChild(input);
        if (!get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching()) {
            input.focus();
        }
        
        let divCurrentOfTotal = document.createElement('div');
        let spanBlank = document.createElement('span');
        spanBlank.textContent = '1';
        spanBlank.id = 'EDITOR_findOverlay_current';
        divCurrentOfTotal.appendChild(spanBlank);
        let spanBlankOf = document.createElement('span');
        spanBlankOf.textContent = ' of ';
        divCurrentOfTotal.appendChild(spanBlankOf);
        let spanBlankOfBlank = document.createElement('span');
        spanBlankOfBlank.textContent = '10';
        spanBlankOfBlank.id = 'EDITOR_findOverlay_total';
        divCurrentOfTotal.appendChild(spanBlankOfBlank);
        EDITOR_findOverlay.appendChild(divCurrentOfTotal);
        
        let divPrevNext = document.createElement('div');
        let btnPrev = document.createElement('button');
        btnPrev.textContent = 'prev';
        btnPrev.id = 'EDITOR_findOverlay_prev';
        btnPrev.style.marginRight = '5px';
        let btnNext = document.createElement('button');
        btnNext.textContent = 'next';
        btnNext.id = 'EDITOR_findOverlay_next';
        btnPrev.addEventListener('click', EDITOR_btnPrev_onclick);
        btnNext.addEventListener('click', EDITOR_btnNext_onclick); 
        divPrevNext.appendChild(btnPrev);
        divPrevNext.appendChild(btnNext);
        EDITOR_findOverlay.appendChild(divPrevNext);
        
        let divOptions = document.createElement('div');
        let checkboxMatchWord = document.createElement('input');
	    checkboxMatchWord.type = 'checkbox';
	    checkboxMatchWord.id = 'EDITOR_findOverlay_checkboxMatchWord';
	    checkboxMatchWord.checked = Boolean(get_EDITOR_findOverlay_options_matchWord());
	    checkboxMatchWord.addEventListener('change', EDITOR_findOverlay_checkboxMatchWord_onchange);
	    divOptions.appendChild(checkboxMatchWord);
	    let label_for_checkboxMatchWord = document.createElement('label');
	    label_for_checkboxMatchWord.htmlFor = 'EDITOR_findOverlay_checkboxMatchWord';
	    label_for_checkboxMatchWord.textContent = 'matchWord';
	    divOptions.appendChild(label_for_checkboxMatchWord);
	    EDITOR_findOverlay.appendChild(divOptions);
        
        if (EDITOR_primaryCursor.hasSelection()) {
        	EDITOR_finalizeAllCursors();
            let selectionAnchor = EDITOR_primaryCursor.selectionAnchor;
            let selectionEnd = EDITOR_primaryCursor.selectionEnd;
            let small;
            let large;
            if (selectionAnchor < selectionEnd) {
                small = selectionAnchor;
                large = selectionEnd;
            }
            else {
                small = selectionEnd;
                large = selectionAnchor;
            }
            let offset = small;
            let length = large - small;
            if (length <= 256) {
                input.value = EDITOR_decode_textonly(offset, length);
                EDITOR_findOverlay_doSearch();
            }
        }
    }
    else if (get_EDITOR_findOverlay_show() && !showValue) {
        EDITOR_findOverlay.style.visibility = 'hidden';
        EDITOR_findOverlay_searchResultPositionList = null;
        let input = document.getElementById('EDITOR_findOverlay_input_elementId');
        if (input && input.parentElement === EDITOR_findOverlay) {
        	input.removeEventListener('change', EDITOR_findOverlay_input_onchange);
            input.removeEventListener('keydown', EDITOR_findOverlay_input_onkeydown);
            input.removeEventListener('blur', EDITOR_findOverlay_input_onblur);
            EDITOR_findOverlay.removeChild(input);
        }
        let btnPrev = document.getElementById('EDITOR_findOverlay_prev');
        if (btnPrev) {
        	btnPrev.removeEventListener('click', EDITOR_btnPrev_onclick);
        }
        let btnNext = document.getElementById('EDITOR_findOverlay_next');
        if (btnNext) {
        	btnNext.removeEventListener('click', EDITOR_btnNext_onclick);
        }
        let checkboxMatchWord = document.getElementById('EDITOR_findOverlay_checkboxMatchWord');
        if (checkboxMatchWord) {
        	checkboxMatchWord.removeEventListener('change', EDITOR_findOverlay_checkboxMatchWord_onchange);
        }
        EDITOR_findOverlay.innerHTML = '';
        set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching(false);
    }

    set_EDITOR_findOverlay_show(showValue);
}

function EDITOR_btnPrev_onclick(/*event*/) {
	let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	
	let current = parseInt(spanCurrent.textContent, 10);
	let total = parseInt(spanTotal.textContent, 10);
	
	if (current && total) {
		current--;
		if (current < 1 || current >= total) {
			if (total > 1) {
				current = total;
			}
			else {
				current = 1;
			}
		}
		spanCurrent.textContent = current;
	}
	else {
		spanCurrent.textContent = 'parseInt not successful?';
	}

    let index = current - 1;
    if (index >= 0 && index < total && index < EDITOR_findOverlay_searchResultPositionList.count) {
        let pos = EDITOR_findOverlay_searchResultPositionList.data[index];
        if (pos <= EDITOR_textByteList.count) {
            EDITOR_moveCursor_position(pos);
        }
    }
}

function EDITOR_btnNext_onclick() {
	let spanCurrent = document.getElementById('EDITOR_findOverlay_current');
	if (!spanCurrent) return;
	
	let spanTotal = document.getElementById('EDITOR_findOverlay_total');
	if (!spanTotal) return;
	
	let current = parseInt(spanCurrent.textContent, 10);
	let total = parseInt(spanTotal.textContent, 10);
	
	if (current && total) {
		current++;
		if (current > total || current < 1) {
			current = 1;
		}
		spanCurrent.textContent = current;
	}
	else {
		spanCurrent.textContent = 'parseInt not successful?';
	}

    let index = current - 1;
    if (index >= 0 && index < total && index < EDITOR_findOverlay_searchResultPositionList.count) {
        let pos = EDITOR_findOverlay_searchResultPositionList.data[index];
        if (pos <= EDITOR_textByteList.count) {
            EDITOR_moveCursor_position(pos);
        }
    }
}

/**
 * Invoking 'EDITOR_finalizeAllCursors()' is a good idea prior to invoking this. Long term perhaps this won't be so important.
 * @param {*} cursor 
 */
async function EDITOR_copySelection(cursor) {
	if (!cursor.hasSelection()) {
		// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor
    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
	}
	let selectionAnchor = cursor.selectionAnchor;
    let selectionEnd = cursor.selectionEnd;
    let small;
    let large;
    if (selectionAnchor < selectionEnd) {
        small = selectionAnchor;
        large = selectionEnd;
    }
    else {
        small = selectionEnd;
        large = selectionAnchor;
    }
    return window.myAPI.editorSetClipboard(EDITOR_textByteList.bytes, small, large - small, EDITOR_lineEndString);
}

/**
 * Invoking 'EDITOR_finalizeAllCursors()' is a good idea prior to invoking this. Long term perhaps this won't be so important.
 * @param {EDITOR_Cursor} cursor 
 */
async function EDITOR_duplicateSelection(cursor) {
	if (!cursor.hasSelection()) {
		// TODO: This code has a bug and doesn't work with multicursor... EDITOR_onMouseDownDetailRankThree needs to accept a cursor rather than acting on EDITOR_primaryCursor...
        // ...these days the todo is somewhat incorrect, it takes cursor now, but you'd need to check whether this causes the selection of two cursors to overlap.
    	EDITOR_onMouseDownDetailRankThree({shiftKey:false}, cursor.indexLine, cursor.indexColumn);
	}

	let selectionAnchor = cursor.selectionAnchor;
    let selectionEnd = cursor.selectionEnd;
    let small;
    let large;
    if (selectionAnchor < selectionEnd) {
        small = selectionAnchor;
        large = selectionEnd;
    }
    else {
        small = selectionEnd;
        large = selectionAnchor;
    }

    let length = large - small;

    cursor.editPosition = large;
    let large_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(large);
    cursor.editIndexLine = large_lineAndColumnIndices.indexLine;
    cursor.editIndexColumn = large_lineAndColumnIndices.indexColumn;
    cursor.editLength = length;

    cursor.indexLine = large_lineAndColumnIndices.indexLine;
    cursor.indexColumn = large_lineAndColumnIndices.indexColumn;

    cursor.EDITOR_duplicate_small = small;
    cursor.EDITOR_duplicate_length = length;

    EDITOR_duplicateSelection_drawUi(cursor, small, large, length);

    cursor.selectionAnchor = large;
    cursor.selectionEnd = large + length;
}

function EDITOR_duplicateSelection_drawUi(cursor, small, large, length) {
    let positionIndex = large;

    walkLineUntilIndexColumn(cursor);
    if (w_indexColumn_Goal === -1 || !w_div || w_div.children.length === 0) {
        // TODO: silent error bad
        alert('// EDITOR_paste TODO: silent error bad');
        return;
    }

    let linesInsertedCount = 0;
    let insertionLength = 0;

    /** is a 0 based index, inclusive */
    let wordStart = 0;
    let wordLength = 0;

    // No need to consider '\r\n' and etc... only '\n'
    let linefeedLength = 0;
    let beltIndexLine_current = EDITOR_indexLineTo_beltIndexLine(cursor.indexLine + get_EDITOR_offsetLine());
    let beltIndexLine_first = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine());
    let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);
    let last_valid_indexColumn_currentLine = EDITOR_getLastValidIndexColumn(cursor.indexLine);

    // TODO: An optimization to check whether you even need to redraw any lines perhaps is possible but it would add too much complexity at the moment and so it isn't being considered...
    // ...i.e.: if you're inserting so many lines that you know you'll scroll or that only a small amount of lines need to be redrawn due to predicting a scroll event.

    let shouldPreserveCssClassWhenSplittingAmongLine = false;
    let hasSeenLinefeed = false;

    let original_indexColumn_SpanTextContentRelative = w_indexColumn_SpanTextContentRelative;
    let original_span_textContent_length = w_span.textContent.length;
    let original_tracked_syntax_start = positionIndex - cursor.indexColumn + w_indexColumn_Sum;

    for (var offset = 0; offset < length; offset++) {
        switch (EDITOR_textByteList.bytes[small + offset]) {
            case '\n':
                //
                if (wordLength > 0) writeWord();
                //
                insertionLength++;
                linesInsertedCount++;
                //
                linefeedLength++;
                break;
            default:
                //
                if (linefeedLength > 0) writeLinefeed();
                // TODO: Extremely important next line but it doesn't fully pattern with every case so it is somewhat out of nowhere
                if (beltIndexLine_current > beltIndexLine_last) return;
                //
                insertionLength++;
                //
                if (wordLength === 0) {
                    wordStart = small + offset;
                }
                wordLength++;
                break;
        }
    }

    if (wordLength > 0) writeWord();
    else if (linefeedLength > 0) writeLinefeed();

    EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(positionIndex, insertionLength);

    if (linesInsertedCount > 0) {
        update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + linesInsertedCount);
        // I uncommented this, it isn't doing what I want it to. I'm just gonna be done for now.
        //EDITOR_drawGutter_Width();
    }

    function writeWord() {
        w_span.textContent = 
            w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) +
            EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(wordStart, wordStart + wordLength)) +
            w_span.textContent.slice(w_indexColumn_SpanTextContentRelative);

        cursor.indexColumn += wordLength;
        last_valid_indexColumn_currentLine += wordLength;
        w_indexColumn_SpanTextContentRelative += wordLength;
        wordStart = 0;
        wordLength = 0;
    }
    
    /**
     * TODO: If this ends up working don't duplicate this code, this is the 'EDITOR_EnterKey' function; copy, paste, and probably modified.
     */
    function writeLinefeed() {
        if (!hasSeenLinefeed) {
            handleNotHasSeenLinefeed();
        }

        // TODO: this is a very lazy solution to the problem, likely a more optimal way is available. Also name the variable?
        // I don't think everything fully works but I'm trying to decide if I should go eat something.
        for (let handleLineCounter = 0; handleLineCounter < linefeedLength; handleLineCounter++) {
            if (beltIndexLine_current > beltIndexLine_last) {
                // A scroll should take place and handle the rest
                // Note: any lines indices that don't change between the current scrollTop and what is shown with the new scrollTop...
                // ...won't redraw so you still need to run this code for some of the lines.
                // you could probably predict which lines in particular overlap or some such but it isn't being done here currently.
                break;
            }

            if (cursor.indexColumn === 0 && last_valid_indexColumn_currentLine !== 0) { // start of line
                
                EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, beltIndexLine_current);
                get_EDITOR_textElement().children[beltIndexLine_current].appendChild(document.createElement('span'));

                w_div = lineDiv;
                w_indexSpan = 0;
                w_span = lineDiv.children[w_indexSpan];
                w_indexColumn_Goal = 0;
                w_indexColumn_Sum = 0;
                w_indexColumn_SpanTextContentRelative = 0;
                cursor.indexLine++;
                cursor.indexColumn = 0;
                EDITOR_beltIndexLine_NEXT(beltIndexLine_current);

                continue;
            }
            else {
                // ensure this conditional branch continues if handled, otherwise it will execute the fallback case erroneously
                if (last_valid_indexColumn_currentLine === cursor.indexColumn) { // end of line

                    EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(beltIndexLine_current));
                    let span = document.createElement('span');
                    get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)].appendChild(span);

                    w_div = lineDiv;
                    w_indexSpan = 0;
                    w_span = lineDiv.children[w_indexSpan];
                    w_indexColumn_Goal = 0;
                    w_indexColumn_Sum = 0;
                    w_indexColumn_SpanTextContentRelative = 0;
                    cursor.indexLine++;
                    cursor.indexColumn = 0;
                    last_valid_indexColumn_currentLine = 0;
                    EDITOR_beltIndexLine_NEXT(beltIndexLine_current);

                    continue;
                }
                else { // among a line
                    // This case can only happen once at the start of the edit

                    let spanClassName = '';
                    let spanText = '';

                    if (w_indexColumn_Goal > 0) {
                        if (w_indexColumn_Goal !== w_indexColumn_Sum + w_span.textContent.length) {
                            let firstText = w_span.textContent.substring(0, w_indexColumn_SpanTextContentRelative);
                            let lastText = w_span.textContent.substring(w_indexColumn_SpanTextContentRelative);
                            last_valid_indexColumn_currentLine = lastText.length;
                            w_span.textContent = firstText;
                            spanText += lastText; // This might NOT have to be +=, but it is due to the enter key method having needed += and this continues the pattern.
                            if (shouldPreserveCssClassWhenSplittingAmongLine) {
                                spanClassName = w_span.className;
                            }
                        }
                    }

                    EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(beltIndexLine_current));

                    let aaa = get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)];
                    let span = document.createElement('span');
                    span.className = spanClassName;
                    span.textContent = spanText;
                    aaa.appendChild(span);

                    let rememberIndex = w_indexSpan + 1;
                    let rememberLength = w_div.children.length;
                    for (let i = rememberIndex; i < rememberLength; i++) {
                        aaa.appendChild(w_div.children[rememberIndex]);
                    }

                    w_div = lineDiv;
                    w_indexSpan = 0;
                    w_span = lineDiv.children[w_indexSpan];
                    w_indexColumn_Goal = 0;
                    w_indexColumn_Sum = 0;
                    w_indexColumn_SpanTextContentRelative = 0;
                    cursor.indexLine++;
                    cursor.indexColumn = 0;
                    // last_valid_indexColumn_currentLine is being set when splitting the text.
                    EDITOR_beltIndexLine_NEXT(beltIndexLine_current);

                    continue;
                }
            }
        }

        linefeedLength = 0;
    }

    /** Maybe some cases are not necessary here because in order to have linefeed inserted it would've had to already existed thus the syntax would already be '..M' */
    function handleNotHasSeenLinefeed() {
        // The only way to invoke this is if you encountered a linefeed for the first time,
        // therefore 'w_span' is the original span and no variable for the original needs to be made.
        // (unless in the future you don't end up using the w_span in some way or etc...)
        //
        hasSeenLinefeed = true;
        switch (w_span.className) {
            case 'eCm':
                if (original_indexColumn_SpanTextContentRelative >= 2 && (original_indexColumn_SpanTextContentRelative <= original_span_textContent_length - 2)) {
                    w_span.className = 'eCM';
                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                    EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_Comment(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, original_span_textContent_length);
                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                }
                break;
            case 'eCM':
                shouldPreserveCssClassWhenSplittingAmongLine = true;
                break;
            case 'eSm':
                if (original_indexColumn_SpanTextContentRelative >= 1 && (original_indexColumn_SpanTextContentRelative <= original_span_textContent_length - 1)) {
                    w_span.className = 'eSM';
                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                    EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_String(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, original_span_textContent_length);
                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                }
                break;
            case 'eSM':
                shouldPreserveCssClassWhenSplittingAmongLine = true;
                break;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_indentMore(cursor) {

    // You need to batch these edits so that if they hold down the tab key, you don't modify the underlying bytes of the text until the edit is finalized.
    // This function (and the 'less' version) are somewhat spahetti-code-y.
    // So make a "TOC", where you list out the main ideas, each main idea being a single line comment that starts with '#'
    // Do not overthink each individual main idea, you can easily change them as needed as you go, just start trying to make sense of things.

    // I think "TOC" has 18 lines of text I tried counting it
    // TOC:
    // ====
    // # Small and large selection positions
    // # Determine the starting indexLine (the start is the large position, this confused me for a moment)
    // # Determine the total count of text that will be inserted, prior to actually beginning the edit.
    // # Update the 'START POSITIONS specifically' of the tracked syntax list by the total count of text that will be inserted.
    // # Descending indexLine loop:
    //     # Insert the text on the respective line.
    //     # Increment the entry in 'EDITOR_lineEndPositionList' for the respective line
    //     # There's a second modification to the start positions of the tracked syntax list
    //     # Then, you immediately know the trackedSyntax that encompasses the insertion (if it exists), so you increment its length by the text inserted on that respective line.
    //     # Each loop you reduce incrementBy, because you're initial starting the loop knowing you will eventually insert 4 characters on every line.
    //         # thus, the first iteration of the loop you're increasing that line's end position by the length of text inserted per line by the amount of lines.
    //         # The next iteration is a smaller indexLine so you decrement because you have the insertion of one less line to consider.
    // # Any line that is not part of the selected set of lines, and is at a greater indexLine, needs to have their line end position entry updated.
    // # Update the cursor's selection to reflect the inserted text
    // # Update the cursor's indexColumn to reflect the inserted text
    // # Update the cursor's selection to reflect the inserted text
    // # Draw the cursor
    // # Redraw the entire viewport (I didn't even think about this... this should change)

    // Some of the ideas that I listed are vague.
    // Likely I have that wording because even I can't remember what was going on.
    //
    // For example "you immediately know the trackedSyntax that encompasses the insertion (if it exists)"
    // I can't remember why this works but I remember that it does.
    // So I need to figure out why it works.

    // # Small and large selection positions
    let SMALL_pos;
    let LARGE_pos;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        SMALL_pos = cursor.selectionAnchor;
        LARGE_pos = cursor.selectionEnd;
    }
    else {
        SMALL_pos = cursor.selectionEnd;
        LARGE_pos = cursor.selectionAnchor;
    }
    let SMALL_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(SMALL_pos);
    let LARGE_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(LARGE_pos);

    // # Determine the starting indexLine (the start is the large position, this confused me for a moment)
    let startingIndex = LARGE_lineAndColumnIndices.indexLine;
    let startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
    if (startingLinePos.start === LARGE_pos) {
        startingIndex -= 1;
        if (startingIndex >= 0) {
            startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
        }
    }
    if (startingIndex < SMALL_lineAndColumnIndices.indexLine) {
        return;
    }

    // # Determine the total count of text that will be inserted, prior to actually beginning the edit.
    let ORIGINAL_incrementBy = (startingIndex + 1 - SMALL_lineAndColumnIndices.indexLine) * 4;
    set_EDITOR_indent_ORIGINAL_indentBy(ORIGINAL_incrementBy);
    set_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine(SMALL_lineAndColumnIndices.indexLine);
    set_EDITOR_indent_startingIndex(startingIndex);
    let incrementBy = ORIGINAL_incrementBy;

    // # Update the 'START POSITIONS specifically' of the tracked syntax list by the total count of text that will be inserted.
    let trackedSyntaxReposition_i = EDITOR_trackedSyntaxReposition_find(startingLinePos.end + 1);
    if (trackedSyntaxReposition_i === NaN || trackedSyntaxReposition_i === -1) {
        trackedSyntaxReposition_i = EDITOR_trackedSyntaxList.count_abstract;
    }
    for (var i = trackedSyntaxReposition_i; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.setStart(
            i,
            EDITOR_trackedSyntaxList.getStart(i) + ORIGINAL_incrementBy);
    }
    trackedSyntaxReposition_i--;

    // TODO: Consider having this string available rather than making it everytime this function is invoked.
    let EDITOR_on_tab_string = '';
    for (let i = 0; i < EDITOR_on_tab_bytes.length; i++) {
        EDITOR_on_tab_string += String.fromCharCode(EDITOR_on_tab_bytes[i]);
    }

    // # Descending indexLine loop:
    //     # Insert the text on the respective line.
    //     # Increment the entry in 'EDITOR_lineEndPositionList' for the respective line
    //     # There's a second (relative to this entire function) modification to the start positions of the tracked syntax list
    //     # Then, you immediately know the trackedSyntax that encompasses the insertion (if it exists), so you increment its length by the text inserted on that respective line.
    //     # Each loop you reduce incrementBy, because you're initial starting the loop knowing you will eventually insert 4 characters on every line.
    //         # thus, the first iteration of the loop you're increasing that line's end position by the length of text inserted per line by the amount of lines.
    //         # The next iteration is a smaller indexLine so you decrement because you have the insertion of one less line to consider.
    for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices.indexLine; lineI--) {
        let linePos = EDITOR_getLineBoundaryPositions(lineI);

        for (; trackedSyntaxReposition_i >= 0; trackedSyntaxReposition_i--) {
            let start = EDITOR_trackedSyntaxList.getStart(trackedSyntaxReposition_i);
            if (linePos.start <= start) {
                // # There's a second (relative to this entire function) modification to the start positions of the tracked syntax list
                EDITOR_trackedSyntaxList.setStart(trackedSyntaxReposition_i, start + incrementBy);
            }
            else {
                break;
            }
        }
        EDITOR_trackedSyntaxList.getElementAt(trackedSyntaxReposition_i);
        if (linePos.start > get_EDITOR_pooledTrackedSyntax_start() && linePos.start < get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length()) {
            // # Then, you immediately know the trackedSyntax that encompasses the insertion (if it exists), so you increment its length by the text inserted on that respective line.
            EDITOR_trackedSyntaxList.setLength(trackedSyntaxReposition_i, get_EDITOR_pooledTrackedSyntax_length() + 4);
        }

        // # Each loop you reduce incrementBy, because you're initial starting the loop knowing you will eventually insert 4 characters on every line.
        //     # thus, the first iteration of the loop you're increasing that line's end position by the length of text inserted per line by the amount of lines.
        //     # The next iteration is a smaller indexLine so you decrement because you have the insertion of one less line to consider.
        incrementBy -= 4;

        // Draw the line to reflect the edit, if it is being currently shown on screen.
        let beltIndexLine = EDITOR_indexLineTo_beltIndexLine(lineI);
        if (beltIndexLine >= 0) {
                let div = get_EDITOR_textElement().children[beltIndexLine];
                let span;
                if (div.children[0].className === '') {
                    span = div.children[0];
                }
                else {
                    span = document.createElement('span');
                    div.insertBefore(span, div.children[0]);
                }
                if (span.textContent.length > 0 &&
                    (span.textContent[0] === ' ' || span.textContent[0] === '\t' || span.textContent[0] === '\0') &&
                    (span.textContent[span.textContent.length - 1] === ' ' || span.textContent[span.textContent.length - 1] === '\t' || span.textContent[span.textContent.length - 1] === '\0')) {
                        span.textContent += EDITOR_on_tab_string;
                }
                else {
                    span.textContent = EDITOR_on_tab_string + span.textContent;
                }
        }
    }

    // # Update the cursor's selection to reflect the inserted text
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        cursor.selectionEnd += ORIGINAL_incrementBy;
    }
    else {
        cursor.selectionAnchor += ORIGINAL_incrementBy;
    }

    // # Update the cursor's indexColumn to reflect the inserted text
    cursor.indexColumn += 4;

    // # Update the cursor's selection to reflect the inserted text
    let smallLinePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
    if (SMALL_pos > smallLinePos.start) {
        if (cursor.selectionAnchor < cursor.selectionEnd) {
            cursor.selectionAnchor += 4;
        }
        else {
            cursor.selectionEnd += 4;
        }
    }

    // # Draw the cursor
    EDITOR_createStyleForSelection_indentMore(cursor);
    EDITOR_drawCursor(cursor);
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_indentLess(cursor) {

    /////////////////////// P_1
    let textSelectionDiv;
    if (cursor.selectionDivExists) {
        for (var i = 0; i < get_EDITOR_presentation().children.length; i++) {
            if (get_EDITOR_presentation().children[i].id === cursor.htmlId) {
                textSelectionDiv = get_EDITOR_presentation().children[i];
                break;
            }
        }
    }
    else {
        // TODO: Silent error confusing bad idea
    }
    let lesstraWidth_1 = 1 * EDITOR_characterWidth;
    let lesstraWidth_2 = 2 * EDITOR_characterWidth;
    let lesstraWidth_3 = 3 * EDITOR_characterWidth;
    let lesstraWidth_4 = 4 * EDITOR_characterWidth;
    /////////////////////// P_1

    // selection positions
    let SMALL_pos;
    let LARGE_pos;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        SMALL_pos = cursor.selectionAnchor;
        LARGE_pos = cursor.selectionEnd;
    }
    else {
        SMALL_pos = cursor.selectionEnd;
        LARGE_pos = cursor.selectionAnchor;
    }
    let SMALL_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(SMALL_pos);
    let LARGE_lineAndColumnIndices = EDITOR_getLineAndColumnIndices(LARGE_pos);

    // starting index
    let startingIndex = LARGE_lineAndColumnIndices.indexLine;
    let startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
    if (startingLinePos.start === LARGE_pos) {
        startingIndex -= 1;
        if (startingIndex >= 0) {
            startingLinePos = EDITOR_getLineBoundaryPositions(startingIndex);
        }
    }
    if (startingIndex < SMALL_lineAndColumnIndices.indexLine) {
        return;
    }

    // loop over the lines to sum the "amount" of whitespace being removed
    let DETERMINE_decrementBy = 0;
    for (var lineI = SMALL_lineAndColumnIndices.indexLine; lineI <= startingIndex; lineI++) {
        let linePos = EDITOR_getLineBoundaryPositions(lineI);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(lineI);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    DETERMINE_decrementBy++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        DETERMINE_decrementBy += 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }
    }

    // Remember the total whitespace removed
    let ORIGINAL_decrementBy = DETERMINE_decrementBy;
    set_EDITOR_indent_ORIGINAL_indentBy(ORIGINAL_decrementBy);
    set_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine(SMALL_lineAndColumnIndices.indexLine);
    set_EDITOR_indent_startingIndex(startingIndex);
    let decrementBy = ORIGINAL_decrementBy;

    // TODO: use better formatting
    // TODO: This handles the line that the small-selection-position resides on?
    {
        let linePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(SMALL_lineAndColumnIndices.indexLine);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        let count = 0;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    count++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        count+= 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }

        let smallLinePos = EDITOR_getLineBoundaryPositions(SMALL_lineAndColumnIndices.indexLine);
        if (SMALL_pos > smallLinePos.start) {
            if (cursor.selectionAnchor < cursor.selectionEnd) {
                cursor.selectionAnchor -= count;
            }
            else {
                cursor.selectionEnd -= count;
            }
        }

        if (cursor.indexLine === SMALL_lineAndColumnIndices.indexLine) {
            cursor.indexColumn -= count;
        }
    }

    // TODO: This at a glance seems to not account for when the cursor is small-position-ended and large-position-anchored...
    // ...this is moving the cursor actually, maybe it is fine? but maybe it is logic that could've been done during a loop but instead you made a new one to separately do this?
    // Also, this entire function is terribly written. You seemingly hacked something together; the code doesn't feel self explanatory. Furthermore there are both a lack of comments (given the confusing nature of how this is written), and dead comments.
    if (cursor.indexLine !== SMALL_lineAndColumnIndices.indexLine) {
        let linePos = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        let count = 0;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    count++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        count+= 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }
        let c = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        // TODO: git blame the below todo and remind them to delete the dead code
        // TODO: Delete this dead code / use better formatting
        /*if (SMALL_pos > smallLinePos.start) {
            if (cursor.selectionAnchor < cursor.selectionEnd) {
                cursor.selectionAnchor -= count;
            }
            else {
                cursor.selectionEnd -= count;
            }
        }*/
        if (cursor.indexLine === LARGE_lineAndColumnIndices.indexLine) {
            cursor.indexColumn -= count;
        }
    }

    let trackedSyntaxReposition_i = EDITOR_trackedSyntaxReposition_find(startingLinePos.end + 1);
    if (trackedSyntaxReposition_i === NaN || trackedSyntaxReposition_i === -1) {
        trackedSyntaxReposition_i = EDITOR_trackedSyntaxList.count_abstract;
    }
    for (var i = trackedSyntaxReposition_i; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.setStart(
            i,
            EDITOR_trackedSyntaxList.getStart(i) - ORIGINAL_decrementBy);
    }
    trackedSyntaxReposition_i--;

    let selectionLineDivIndex = 0;
    if (textSelectionDiv) {
        selectionLineDivIndex = textSelectionDiv.children.length - 1;
    }

    for (var lineI = startingIndex; lineI >= SMALL_lineAndColumnIndices.indexLine; lineI--) {
        let innerRemoveCount = 0;
        let linePos = EDITOR_getLineBoundaryPositions(lineI);
        let line = linePos;
        let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(lineI);
        let upperLimitIndexColumn;
        if (lastValidIndexColumn > 4) {
            upperLimitIndexColumn = 4;
        }
        else {
            upperLimitIndexColumn = lastValidIndexColumn;
        }
        let seenSpace = false;
        outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
            let c = getCharacter(line.start + i);
            switch (c) {
                case ' ':
                    seenSpace = true;
                    innerRemoveCount++;
                    break;
                case '\t':
                    if (!seenSpace) {
                        innerRemoveCount += 4;
                    }
                    break outer;
                default:
                    break outer;
            }
        }

        for (; trackedSyntaxReposition_i >= 0; trackedSyntaxReposition_i--) {
            let start = EDITOR_trackedSyntaxList.getStart(trackedSyntaxReposition_i);
            if (linePos.start <= start) {
                EDITOR_trackedSyntaxList.setStart(trackedSyntaxReposition_i, start - decrementBy);
            }
            else {
                break;
            }
        }
        EDITOR_trackedSyntaxList.getElementAt(trackedSyntaxReposition_i);
        if (linePos.start > get_EDITOR_pooledTrackedSyntax_start() && linePos.start < get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length()) {
            EDITOR_trackedSyntaxList.setLength(trackedSyntaxReposition_i, get_EDITOR_pooledTrackedSyntax_length() - innerRemoveCount);
        }

        decrementBy -= innerRemoveCount;
        /////////////////////// P_2
        // TODO: This is not entirely correct. Presumably most specifically I am referring to the first line that is selected.
        if (textSelectionDiv && innerRemoveCount >= 1 && innerRemoveCount <= 4) {
            let lineSelectionDiv = textSelectionDiv.children[selectionLineDivIndex--];
            let widthNumberValue = parseFloat(lineSelectionDiv.style.width, 10);
            let lesstraWidth;
            switch (innerRemoveCount) {
                case 1:
                    lesstraWidth = lesstraWidth_1;
                    break;
                case 2:
                    lesstraWidth = lesstraWidth_2;
                    break;
                case 3:
                    lesstraWidth = lesstraWidth_3;
                    break;
                case 4:
                    lesstraWidth = lesstraWidth_4;
                    break;
            }
            widthNumberValue -= lesstraWidth;
            lineSelectionDiv.style.width = widthNumberValue + 'px';
        }
        /////////////////////// P_2

        // Draw the line to reflect the edit, if it is being currently shown on screen.
        let beltIndexLine = EDITOR_indexLineTo_beltIndexLine(lineI);
        if (beltIndexLine >= 0) {
                let div = get_EDITOR_textElement().children[beltIndexLine];
                let span = div.children[0];
                span.textContent = span.textContent.slice(innerRemoveCount);
        }
    }

    if (cursor.selectionAnchor < cursor.selectionEnd) {
        cursor.selectionEnd -= ORIGINAL_decrementBy;
    }
    else {
        cursor.selectionAnchor -= ORIGINAL_decrementBy;
    }

    /////////////////////// P_3
    cursor.DRAWN_selectionAnchor = cursor.selectionAnchor;
    cursor.DRAWN_selectionEnd = cursor.selectionEnd;
    /////////////////////// P_3

    EDITOR_drawCursor(cursor);
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} content 
 */
function EDITOR_paste(cursor, content) {
    let positionIndex = EDITOR_getPositionIndex(cursor);

    cursor.editPosition = positionIndex;
    cursor.editIndexLine = cursor.indexLine;
    cursor.editIndexColumn = cursor.indexColumn;

    cursor.EDITOR_paste_clipboardContent = content;

    walkLineUntilIndexColumn(cursor);
    if (w_indexColumn_Goal === -1 || !w_div || w_div.children.length === 0) {
        // TODO: silent error bad
        alert('// EDITOR_paste TODO: silent error bad');
        return;
    }

    // TODO: Consider having this string available rather than making it everytime this function is invoked.
    let EDITOR_on_tab_string = '';
    for (let i = 0; i < EDITOR_on_tab_bytes.length; i++) {
        EDITOR_on_tab_string += String.fromCharCode(EDITOR_on_tab_bytes[i]);
    }

    // for generating tabs of some count
    let stringBuilderArray = [];

    let linesInsertedCount = 0;
    let insertionLength = 0;

    /** is a 0 based index, inclusive */
    let wordStart = 0;
    let wordLength = 0;

    // Consider '\t\0\0\0'
    let tabLength = 0;
    let previouslyGeneratedTabString_value = null;
    let previouslyGeneratedTabString_tabLengthThatWasUsed = 0;

    // Consider '\r\n' and etc...
    let linefeedLength = 0;

    let beltIndexLine_current = EDITOR_indexLineTo_beltIndexLine(cursor.indexLine + get_EDITOR_offsetLine());
    let beltIndexLine_first = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine());
    let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);
    let last_valid_indexColumn_currentLine = EDITOR_getLastValidIndexColumn(cursor.indexLine);

    // TODO: An optimization to check whether you even need to redraw any lines perhaps is possible but it would add too much complexity at the moment and so it isn't being considered...
    // ...i.e.: if you're inserting so many lines that you know you'll scroll or that only a small amount of lines need to be redrawn due to predicting a scroll event.

    let shouldPreserveCssClassWhenSplittingAmongLine = false;
    let hasSeenLinefeed = false;

    let original_indexColumn_SpanTextContentRelative = w_indexColumn_SpanTextContentRelative;
    let original_span_textContent_length = w_span.textContent.length;
    let original_tracked_syntax_start = positionIndex - cursor.indexColumn + w_indexColumn_Sum;

    for (var sourceI = 0; sourceI < content.length; sourceI++) {
        switch (content[sourceI]) {
            case '\n':
                //
                if (wordLength > 0) writeWord();
                else if (tabLength > 0) writeTab();
                //
                insertionLength++;
                linesInsertedCount++;
                //
                linefeedLength++;
                break;
            case '\r':
                //
                if (wordLength > 0) writeWord();
                else if (tabLength > 0) writeTab();
                //
                if (sourceI < content.length - 1 && content[sourceI + 1] === '\n') {
                    sourceI++;
                }
                insertionLength++;
                linesInsertedCount++;
                //
                linefeedLength++;
                break;
            case '\t':
                //
                if (wordLength > 0) writeWord();
                else if (linefeedLength > 0) writeLinefeed();
                // TODO: Extremely important next line but it doesn't fully pattern with every case so it is somewhat out of nowhere
                if (beltIndexLine_current > beltIndexLine_last) return;
                //
                insertionLength += 4;
                //
                tabLength++;
                break;
            default:
                //
                if (tabLength > 0) writeTab();
                else if (linefeedLength > 0) writeLinefeed();
                // TODO: Extremely important next line but it doesn't fully pattern with every case so it is somewhat out of nowhere
                if (beltIndexLine_current > beltIndexLine_last) return;
                //
                insertionLength++;
                //
                if (wordLength === 0) {
                    wordStart = sourceI;
                }
                wordLength++;
                break;
        }
    }

    if (wordLength > 0) writeWord();
    else if (tabLength > 0) writeTab();
    else if (linefeedLength > 0) writeLinefeed();

    EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(positionIndex, insertionLength);

    if (linesInsertedCount > 0) {
        update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + linesInsertedCount);
        // I uncommented this, it isn't doing what I want it to.
        // I'm just gonna be done for now.
        //EDITOR_drawGutter_Width();
    }
    
    function writeWord() {
        w_span.textContent = 
            w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) +
            content.substring(wordStart, wordStart + wordLength) +
            w_span.textContent.slice(w_indexColumn_SpanTextContentRelative);

        cursor.indexColumn += wordLength;
        last_valid_indexColumn_currentLine += wordLength;
        w_indexColumn_SpanTextContentRelative += wordLength;
        wordStart = 0;
        wordLength = 0;
    }

    function writeTab() {
        if (previouslyGeneratedTabString_tabLengthThatWasUsed !== tabLength) {
            for (let i = 0; i < tabLength; i++) {
                stringBuilderArray.push(EDITOR_on_tab_string);
            }
            previouslyGeneratedTabString_value = stringBuilderArray.join('');
            previouslyGeneratedTabString_tabLengthThatWasUsed = tabLength;
            stringBuilderArray.length = 0;
        }

        w_span.textContent =
            w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) +
            previouslyGeneratedTabString_value +
            w_span.textContent.slice(w_indexColumn_SpanTextContentRelative);

        let thisInsertionLength = 4 * tabLength;
        cursor.indexColumn += thisInsertionLength;
        last_valid_indexColumn_currentLine += thisInsertionLength;
        w_indexColumn_SpanTextContentRelative += thisInsertionLength;
        tabLength = 0;
    }
    
    /**
     * TODO: If this ends up working don't duplicate this code, this is the 'EDITOR_EnterKey' function; copy, paste, and probably modified.
     */
    function writeLinefeed() {
        if (!hasSeenLinefeed) {
            handleNotHasSeenLinefeed();
        }

        // TODO: this is a very lazy solution to the problem, likely a more optimal way is available. Also name the variable?
        // I don't think everything fully works but I'm trying to decide if I should go eat something.
        for (let handleLineCounter = 0; handleLineCounter < linefeedLength; handleLineCounter++) {
            if (beltIndexLine_current > beltIndexLine_last) {
                // A scroll should take place and handle the rest
                // Note: any lines indices that don't change between the current scrollTop and what is shown with the new scrollTop...
                // ...won't redraw so you still need to run this code for some of the lines.
                // you could probably predict which lines in particular overlap or some such but it isn't being done here currently.
                break;
            }

            if (cursor.indexColumn === 0 && last_valid_indexColumn_currentLine !== 0) { // start of line

                EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, beltIndexLine_current);
                let lineDiv = get_EDITOR_textElement().children[beltIndexLine_current];
                get_EDITOR_textElement().children[beltIndexLine_current].appendChild(document.createElement('span'));

                w_div = lineDiv;
                w_indexSpan = 0;
                w_span = lineDiv.children[w_indexSpan];
                w_indexColumn_Goal = 0;
                w_indexColumn_Sum = 0;
                w_indexColumn_SpanTextContentRelative = 0;
                cursor.indexLine++;
                cursor.indexColumn = 0;
                EDITOR_beltIndexLine_NEXT(beltIndexLine_current);
                continue;
            }
            else {
                // ensure this conditional branch continues if handled, otherwise it will execute the fallback case erroneously
                if (last_valid_indexColumn_currentLine === cursor.indexColumn) { // end of line
                    
                    EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(beltIndexLine_current));
                    let span = document.createElement('span');
                    let lineDiv = get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)];
                    get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)].appendChild(span);

                    w_div = lineDiv;
                    w_indexSpan = 0;
                    w_span = lineDiv.children[w_indexSpan];
                    w_indexColumn_Goal = 0;
                    w_indexColumn_Sum = 0;
                    w_indexColumn_SpanTextContentRelative = 0;
                    cursor.indexLine++;
                    cursor.indexColumn = 0;
                    last_valid_indexColumn_currentLine = 0;
                    EDITOR_beltIndexLine_NEXT(beltIndexLine_current);

                    continue;
                }
                else { // among a line

                    let spanClassName = '';
                    let spanText = '';

                    if (w_indexColumn_Goal > 0) {
                        if (w_indexColumn_Goal !== w_indexColumn_Sum + w_span.textContent.length) {
                            let firstText = w_span.textContent.substring(0, w_indexColumn_SpanTextContentRelative);
                            let lastText = w_span.textContent.substring(w_indexColumn_SpanTextContentRelative);
                            last_valid_indexColumn_currentLine = lastText.length;
                            w_span.textContent = firstText;
                            spanText += lastText; // This might NOT have to be +=, but it is due to the enter key method having needed += and this continues the pattern.
                            if (shouldPreserveCssClassWhenSplittingAmongLine) {
                                spanClassName = w_span.className;
                            }
                        }
                    }

                    EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(beltIndexLine_current));

                    let aaa = get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)];
                    let span = document.createElement('span');
                    span.className = spanClassName;
                    span.textContent = spanText;
                    aaa.appendChild(span);

                    let rememberIndex = w_indexSpan + 1;
                    let rememberLength = w_div.children.length;
                    for (let i = rememberIndex; i < rememberLength; i++) {
                        aaa.appendChild(w_div.children[rememberIndex]);
                    }

                    w_div = lineDiv;
                    w_indexSpan = 0;
                    w_span = lineDiv.children[w_indexSpan];
                    w_indexColumn_Goal = 0;
                    w_indexColumn_Sum = 0;
                    w_indexColumn_SpanTextContentRelative = 0;
                    cursor.indexLine++;
                    cursor.indexColumn = 0;
                    // last_valid_indexColumn_currentLine is being set when splitting the text.
                    EDITOR_beltIndexLine_NEXT(beltIndexLine_current);

                    continue;
                }
            }
        }

        linefeedLength = 0;
    }

    function handleNotHasSeenLinefeed() {
        // The only way to invoke this is if you encountered a linefeed for the first time,
        // therefore 'w_span' is the original span and no variable for the original needs to be made.
        // (unless in the future you don't end up using the w_span in some way or etc...)
        //
        hasSeenLinefeed = true;
        switch (w_span.className) {
            case 'eCm':
                if (original_indexColumn_SpanTextContentRelative >= 2 && (original_indexColumn_SpanTextContentRelative <= original_span_textContent_length - 2)) {
                    w_span.className = 'eCM';
                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                    EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_Comment(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, original_span_textContent_length);
                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                }
                break;
            case 'eCM':
                shouldPreserveCssClassWhenSplittingAmongLine = true;
                break;
            case 'eSm':
                if (original_indexColumn_SpanTextContentRelative >= 1 && (original_indexColumn_SpanTextContentRelative <= original_span_textContent_length - 1)) {
                    w_span.className = 'eSM';
                    let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                    EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_String(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, original_span_textContent_length);
                    shouldPreserveCssClassWhenSplittingAmongLine = true;
                }
                break;
            case 'eSM':
                shouldPreserveCssClassWhenSplittingAmongLine = true;
                break;
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_tabKey(cursor) {
    let indexPosition = EDITOR_getPositionIndex(cursor);
    cursor.editPosition = indexPosition;
    cursor.editIndexLine = cursor.indexLine;
    cursor.editIndexColumn = cursor.indexColumn;
    
    EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, 4);

    walkLineUntilIndexColumn(cursor);

    cursor.indexColumn += 4; // this has to come after the 'walkLineUntilIndexColumn' invocation.

    if (w_indexColumn_Goal === -1 || !w_div || w_div.children.length === 0) {
        // TODO: silent error bad
        return;
    }

    // TODO: Consider having this string available rather than making it everytime this function is invoked.
    let EDITOR_on_tab_string = '';
    for (let i = 0; i < EDITOR_on_tab_bytes.length; i++) {
        EDITOR_on_tab_string += String.fromCharCode(EDITOR_on_tab_bytes[i]);
    }

    w_span.textContent = 
        w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) +
        EDITOR_on_tab_string +
        w_span.textContent.slice(w_indexColumn_SpanTextContentRelative);
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @returns the COLUMN index that exclusively ends the indentation.
 */
function EDITOR_findEndExclusiveIndentationIndexColumn(cursor) {
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    for (var i = 0; i < lastValidIndexColumn; i++) {
        let c = getCharacter(line.start + i);
        switch (c) {
            case ' ':
            case '\t':
            case '\0': // tabs are stored as: '\t\0\0\0'
                break;
            default:
                return i;
        }
    }

    return 0;
}

/**
 * If a line has an indentation of 4 space characters, but the user's cursor is positioned after the second space character,
 * then only the first 2 space characters will be used as indentation.
 * 
 * This is intentional, it seems like the more expected behavior in my mind.
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_cacheIndentation(cursor) {
    cursor.cached_indentation_byteList = new ByteList(32);
    let indentationBuilder = [];
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    let line = EDITOR_getLineBoundaryPositions(cursor.indexLine);

    let upperLimitIndexColumn;

    if (lastValidIndexColumn > cursor.indexColumn) {
        upperLimitIndexColumn = cursor.indexColumn;
    }
    else {
        upperLimitIndexColumn = lastValidIndexColumn;
    }

    outer: for (var i = 0; i < upperLimitIndexColumn; i++) {
        let c = getCharacter(line.start + i);
        switch (c) {
            case ' ':
                cursor.cached_indentation_byteList.insert(cursor.cached_indentation_byteList.count, get_EDITOR_ASCII_SPACE());
                indentationBuilder.push(c);
                break;
            case '\t':
                cursor.cached_indentation_byteList.insert(cursor.cached_indentation_byteList.count, get_EDITOR_ASCII_TAB());
                indentationBuilder.push(c);
                break;
            case '\0': // tabs are stored as: '\t\0\0\0'
                cursor.cached_indentation_byteList.insert(cursor.cached_indentation_byteList.count, 0);
                indentationBuilder.push(c);
                break;
            default:
                break outer;
        }
    }

    cursor.cached_indentation_string = indentationBuilder.join('');
}

function EDITOR_lineWasInsertedValidateGutter() {
    if (get_EDITOR_gutter().children.length > 0 && get_EDITOR_gutter().children.length === get_EDITOR_virtualCount()) {
        if (get_EDITOR_gutter().children[get_EDITOR_gutter().children.length - 1].textContent === '~') {
            let successFoundTildeAtIndex = get_EDITOR_gutter().children.length - 1;
            for (let i = get_EDITOR_gutter().children.length - 2; i >= 0; i--) {
                if (get_EDITOR_gutter().children[i].textContent === '~') {
                    successFoundTildeAtIndex = i;
                }
                else {
                    successFoundTildeAtIndex = i + 1;
                    break;
                }
            }
            if (successFoundTildeAtIndex > 0) {
                let number = parseInt(get_EDITOR_gutter().children[successFoundTildeAtIndex - 1].textContent);
                get_EDITOR_gutter().children[successFoundTildeAtIndex].textContent = number + 1;
            }
        }
    }

    EDITOR_drawGutter_Width();
}

/**
 * TODO: This uses a linear search and likely can be optimized.
 * 
 * @param {*} indexPosition 
 * @param {*} insertionCount 
 */
function EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount) {
    for (var i = 0; i < EDITOR_trackedSyntaxList.count_abstract; i++) {
        EDITOR_trackedSyntaxList.getElementAt(i);
        if (indexPosition <= get_EDITOR_pooledTrackedSyntax_start()) {
            EDITOR_trackedSyntaxList.setStart(i, get_EDITOR_pooledTrackedSyntax_start() + insertionCount);
        }
        else if (indexPosition > get_EDITOR_pooledTrackedSyntax_start() && indexPosition < get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length()) {
            EDITOR_trackedSyntaxList.setLength(i, get_EDITOR_pooledTrackedSyntax_length() + insertionCount);
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {boolean} ctrlKey 
 * @param {boolean} shiftKey 
 * @returns 
 */
function EDITOR_EnterKey(cursor, ctrlKey, shiftKey) {
    if (!cursor.cached_indentation_byteList)
        EDITOR_cacheIndentation(cursor);

    if (ctrlKey) cursor.indexColumn = 0;
    else if (shiftKey) cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
    
    update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + 1);

    let indexPosition = EDITOR_getPositionIndex_raw(cursor);
    cursor.editPosition = indexPosition;
    cursor.editIndexLine = cursor.indexLine;
    cursor.editIndexColumn = cursor.indexColumn;
    let insertionCount = 1;
    let shouldRenderEntireViewport = false;
    
    let beltIndexLine_current = EDITOR_indexLineTo_beltIndexLine(cursor.indexLine);
    if (beltIndexLine_current < 0)
        shouldRenderEntireViewport = true;

    // There are some cases that I don't feel like thinking about at the moment, this if statement singles them out.
    if (get_EDITOR_virtualCount() <= 1 || get_EDITOR_textElement().children.length !== get_EDITOR_virtualCount())
        shouldRenderEntireViewport = true;

    let beltIndexLine_first = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine());
    let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);

    // TODO: reminder for when virtualization padding is improved, this function might need to be looked at.
    // TODO: Track the enter keystroke the same as any other insertion edit and have it pending until it needs to be finalized.

    // 4 cases:
    // - "start of line":
    // - "end of line":
    // - "among a line":
    // - "fallback case": this last case is a fallback case and redraws the entire viewport in the case that the UI is in an "unpredictable state" and cannot be optimally redrawn in a smaller more specific redraw.

    // TODO: I'm not gonna put this on the fallback case, 'EDITOR_lineWasInsertedValidateGutter()'...
    // ...just cause it is different and I have a weird vibe but I'm too tired to investigate right now.
    // and it is gonna mess me up at some point cause the invocation does the longest line number drawing
    
    if (!shouldRenderEntireViewport && cursor.indexColumn === 0) { // start of line
        cursor.enterKeyEventKind = get_EnterKeyEventKind_StartOfLine();

        EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, beltIndexLine_current);
        get_EDITOR_textElement().children[beltIndexLine_current].appendChild(document.createElement('span'));

        if (cursor.cached_indentation_byteList) {
            insertionCount += cursor.cached_indentation_byteList.count;
        }

        EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

        if (ctrlKey) {
            cursor.indexColumn = insertionCount - 1;
        }
        else {
            cursor.indexLine++;
            cursor.indexColumn = insertionCount - 1;
        }

        EDITOR_lineWasInsertedValidateGutter();

        cursor.editLength = insertionCount;
        return;
    }
    else {
         if (!shouldRenderEntireViewport) {
            // ensure this conditional branch returns if handled, otherwise it will execute the fallback case erroneously
            let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);

            if (lastValidIndexColumn === cursor.indexColumn) { // end of line
                cursor.enterKeyEventKind = get_EnterKeyEventKind_EndOfLine();
                
                EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(beltIndexLine_current));
                let span = document.createElement('span');
                span.textContent = cursor.cached_indentation_string;
                get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(beltIndexLine_current)].appendChild(span);
                
                if (cursor.cached_indentation_byteList) {
                    insertionCount += cursor.cached_indentation_byteList.count;
                }

                EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

                cursor.indexLine++;
                cursor.indexColumn = insertionCount - 1;

                EDITOR_lineWasInsertedValidateGutter();

                cursor.editLength = insertionCount;
                return;
            }
            else { // among a line
                cursor.enterKeyEventKind = get_EnterKeyEventKind_AmongALine();

                let spanClassName = '';
                let spanText = cursor.cached_indentation_string;

                walkLineUntilIndexColumn(cursor);

                let shouldPreserveCssClassWhenSplittingAmongLine = false;
                
                if (!ctrlKey && !shiftKey) { // Is this '!ctrlKey && !shiftKey' check redundant? I feel like this conditional branch would never be reached regardless.
                    switch (w_span.className) {
                        case 'eCm':
                            if (w_indexColumn_SpanTextContentRelative >= 2 && (w_indexColumn_SpanTextContentRelative <= w_span.textContent.length - 2)) {
                                w_span.className = 'eCM';
                                let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                                EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_Comment(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, w_span.textContent.length);
                                shouldPreserveCssClassWhenSplittingAmongLine = true;
                            }
                            break;
                        case 'eCM':
                            shouldPreserveCssClassWhenSplittingAmongLine = true;
                            break;
                        case 'eSm':
                            if (w_indexColumn_SpanTextContentRelative >= 1 && (w_indexColumn_SpanTextContentRelative <= w_span.textContent.length - 1)) {
                                w_span.className = 'eSM';
                                let indexOfGreaterThanOrEqual = EDITOR_trackedSyntaxReposition_find(indexPosition);
                                EDITOR_trackedSyntaxList.insert(indexOfGreaterThanOrEqual, get_TrackedSyntaxKind_String(), indexPosition - cursor.indexColumn + w_indexColumn_Sum, w_span.textContent.length);
                                shouldPreserveCssClassWhenSplittingAmongLine = true;
                            }
                            break;
                        case 'eSM':
                            shouldPreserveCssClassWhenSplittingAmongLine = true;
                            break;
                    }
                }
                
                if (w_indexColumn_Goal > 0) {
                    if (w_indexColumn_Goal !== w_indexColumn_Sum + w_span.textContent.length) {
                        let firstText = w_span.textContent.substring(0, w_indexColumn_SpanTextContentRelative);
                        let lastText = w_span.textContent.substring(w_indexColumn_SpanTextContentRelative);
                        w_span.textContent = firstText;
                        spanText += lastText; // += due to the possibility of indentation
                        if (shouldPreserveCssClassWhenSplittingAmongLine) {
                            spanClassName = w_span.className;
                        }
                    }
                }

                EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, EDITOR_beltIndexLine_NEXT(w_beltIndexLine));

                let aaa = get_EDITOR_textElement().children[EDITOR_beltIndexLine_NEXT(w_beltIndexLine)];
                let span = document.createElement('span');
                span.className = spanClassName;
                span.textContent = spanText;
                aaa.appendChild(span);

                let rememberIndex = w_indexSpan + 1;
                let rememberLength = w_div.children.length;
                for (let i = rememberIndex; i < rememberLength; i++) {
                    aaa.appendChild(w_div.children[rememberIndex]);
                }
                
                if (cursor.cached_indentation_byteList) {
                    insertionCount += cursor.cached_indentation_byteList.count;
                }

                EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

                cursor.indexLine++;
                cursor.indexColumn = insertionCount - 1;

                EDITOR_lineWasInsertedValidateGutter();

                cursor.editLength = insertionCount;
                return;
            }
         }

        // TODO: You cannot do the fallback case anywhere because it relies on the edit being finalized.

        // fallback case
        cursor.enterKeyEventKind = get_EnterKeyEventKind_FallbackCase();

        // fallback to inefficient viewport redraw if previous cases can't optimally render
        if (cursor.cached_indentation_byteList) {
            insertionCount += cursor.cached_indentation_byteList.count;
        }

        // TODO: I don't know how to test this one. This trackedSyntax repositioning in this case, a before and after of it working never was observed...
        // ...this is the same solution used elsewhere and it seems like it would work if I could replicate this case. I think I need a very small window height???
        //
        EDITOR_trackedSyntaxList_inefficientUpdateStartAndLength(indexPosition, insertionCount);

        cursor.indexLine++;
        cursor.indexColumn = insertionCount - 1;

        cursor.editLength = insertionCount;

        alert('get_EnterKeyEventKind_FallbackCase()');
    }
}

/** The invoker needs to ensure there is at least one empty span on the 'inclusiveSmallestBeltIndexLineToShift' after everything is said and done. */
function EDITOR_shiftLinesOfTextDownByOne(beltIndexLine_last, inclusiveSmallestBeltIndexLineToShift) {
    let lastDiv = get_EDITOR_textElement().children[beltIndexLine_last];
    for (let i = lastDiv.children.length - 1; i >= 0; i--) {
        lastDiv.removeChild(lastDiv.children[i]);
    }

    for (let i = beltIndexLine_last; i !== inclusiveSmallestBeltIndexLineToShift;) {
        let takeDiv = get_EDITOR_textElement().children[i];
        i = EDITOR_beltIndexLine_PREVIOUS(i);
        let moveFromDiv = get_EDITOR_textElement().children[i];
        for (let i = moveFromDiv.children.length - 1; i >= 0; i--) {
            takeDiv.appendChild(moveFromDiv.children[i]);
        }
    }
}

/**
 * 'smallestBeltIndexLineToReceive' somewhat 'exclusive' in that it doesn't get shifted. It is the smallest line that receives the shift of the next line, and thus all content on this line is lost in the process.
 * 
 * TODO: an idea that you might be able to short circuit if you start shifting 'out of bounds lines of text' into 'out of bounds lines of text'?
 * */
function EDITOR_shiftLinesOfText_ToASmaller_IndexLine_byDistance(beltIndexLine_last, smallestBeltIndexLineToReceive, distance) {
    // TODO: if smallestBeltIndexLineToReceive < 0 throw an error?

    let breakingPoint = beltIndexLine_last;
    for (let i = 1 /*starts at one*/; i < distance; i++) {
        breakingPoint = EDITOR_beltIndexLine_PREVIOUS(breakingPoint);
    }

    for (let destinationIndex = smallestBeltIndexLineToReceive; destinationIndex !== breakingPoint;) {
        let destinationDiv = get_EDITOR_textElement().children[destinationIndex];
        let sourceIndex = destinationIndex;
        for (let i = 0; i < distance; i++) {
            sourceIndex = EDITOR_beltIndexLine_NEXT(sourceIndex);
        }
        destinationDiv.replaceChildren(...get_EDITOR_textElement().children[sourceIndex].childNodes);
        if (get_EDITOR_gutter().children[sourceIndex].textContent === '~') {
            get_EDITOR_gutter().children[destinationIndex].textContent = '~';
        }
        destinationIndex = EDITOR_beltIndexLine_NEXT(destinationIndex);
    }

    let beltIndexLine = breakingPoint;
    for (let i = 0; ; i++) {
        EDITOR_drawLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - (distance - i), get_EDITOR_gutter().children[beltIndexLine], get_EDITOR_textElement().children[beltIndexLine]);
        if (beltIndexLine === beltIndexLine_last) break; // awkward positioning of this break, it seems somewhat necessary but need to take time to read the code further and try to have it moved somewhere more sensible.
        beltIndexLine = EDITOR_beltIndexLine_NEXT(beltIndexLine);
    }
}

function EDITOR_onResize_WRAPIT() {
    const timeoutFunc = () => {
        if (/*trailing && lastArgs*/ EDITOR_onResize_bool) {
            EDITOR_onResize();
            EDITOR_onResize_bool = false;
            EDITOR_onResize_timer = setTimeout(timeoutFunc, 200);
        } else {
            EDITOR_onResize_timer = null;
        }
    };

	EDITOR_onResize_bool = true;
	
    if (!EDITOR_onResize_timer) {
        EDITOR_onResize_timer = setTimeout(timeoutFunc, 200);
    }
}

function EDITOR_onResize() {
    set_EDITOR_recentBoundingClientRect_isNull_intFalsey(1);
    let remember_virtualCount = get_EDITOR_virtualCount();
    update_virtualCount();
    if (get_EDITOR_virtualCount() !== remember_virtualCount) {
        update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count + 1);
        EDITOR_onScroll_WRAPIT();
        // # Redraw cursor selection virtualization
        // Code Duplication: # Redraw cursor selection virtualization... TODO: This is using 'EDITOR_primaryCursor' rather than 'EDITOR_cursorList[i]' so it is surely incorrect?
        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            EDITOR_createStyleForSelection(EDITOR_primaryCursor);
        }
    }
    EDITOR_drawHorizontalScrollbar();
}

/**
 * You need to change this logic to know the longest line.
 * Then when the longest line changes or some such likely related to finalization of an edit (not pending edits).
 * then at that point you redraw this.
 */
function EDITOR_drawHorizontalScrollbar() {
    if (get_EDITOR_horizontal_scrollbar().style.left !== gutterWidthTotal) {
        get_EDITOR_horizontal_scrollbar().style.left = gutterWidthTotal;
    }

    if (EDITOR_horizontal_scrollbar_widthValue !== (EDITOR_baseElement.clientWidth - get_EDITOR_gutterWidthTotal())) {
        EDITOR_horizontal_scrollbar_widthValue = EDITOR_baseElement.clientWidth - get_EDITOR_gutterWidthTotal();
        get_EDITOR_horizontal_scrollbar().style.width = EDITOR_horizontal_scrollbar_widthValue + 'px';
    }

    if (get_EDITOR_longestLine_length() !== get_EDITOR_longestLine_length_PreviousValueWhenLastDrewHorizontalScrollbar()) {
        set_EDITOR_longestLine_length_PreviousValueWhenLastDrewHorizontalScrollbar(get_EDITOR_longestLine_length());
        set_EDITOR_contentWidth(Math.ceil(get_EDITOR_longestLine_length() * EDITOR_characterWidth));
        get_EDITOR_horizontal_scrollbar_virtualization_boundary().style.width = get_EDITOR_contentWidth() + 'px';
        get_EDITOR_virtualization_horizontal().style.width = get_EDITOR_contentWidth() + get_EDITOR_gutterWidthTotal() + 'px';

        get_EDITOR_textElement().style.width = get_EDITOR_horizontal_scrollbar_virtualization_boundary().style.width;
        get_EDITOR_cursorListElement().style.width = get_EDITOR_horizontal_scrollbar_virtualization_boundary().style.width;
    }
    
    // TODO: this is directly tied to a scroll event on EDITOR_baseElement so handle it from there perhaps?
    // TODO: this code is duplicated inside EDITOR_onScroll_WRAPIT when it returns early due to nothing vertically having changed, reduce duplication?
    if (get_EDITOR_horizontal_scrollbar().scrollLeft !== EDITOR_baseElement.scrollLeft) {
        get_EDITOR_horizontal_scrollbar().scrollLeft = EDITOR_baseElement.scrollLeft;
    }
}

let isScrolling = false; // Tracks if we are actively in a scroll cycle
let scrollTimeoutId = null;

function EDITOR_onScroll_WRAPIT() {
    // TODO: These will run when scrolling horizontally at the moment, this is unfortunate, I am moving code around.
    update_VirtualIndexLine();
    //
    // If I delay setting 'set_EDITOR_ONSCROLLvirtualIndexLine()' then I can just use that.
    // I can't bear to do that right now though. I'm just gonna make this variable.
    let prevVli = get_EDITOR_ONSCROLLvirtualIndexLine();
    let currVli = get_EDITOR_virtualIndexLine();
    //
    set_EDITOR_ONSCROLLvirtualIndexLine(get_EDITOR_virtualIndexLine());

    let zeroNoAction_oneForceEntireViewportDrawThroughPrevVliAndCurrVli_twoReturn = 0;

    // 1. LEADING EDGE (Runs only once at the absolute start of scrolling)
    if (!isScrolling) {
        isScrolling = true;
        zeroNoAction_oneForceEntireViewportDrawThroughPrevVliAndCurrVli_twoReturn = EDITOR_onScroll_LeadingEdge();
    }

    if (zeroNoAction_oneForceEntireViewportDrawThroughPrevVliAndCurrVli_twoReturn === 1) {
        prevVli = 0;
        currVli = get_EDITOR_virtualCount();
    }
    else if (zeroNoAction_oneForceEntireViewportDrawThroughPrevVliAndCurrVli_twoReturn === 2) {
        return;
    }

    // 2. ACTIVE SCROLLING (Runs smoothly on every frame using requestAnimationFrame)
    EDITOR_requestTick();

    // 3. TRAILING EDGE (Clears and resets, running exactly 150ms after the last movement)
    clearTimeout(scrollTimeoutId);
    scrollTimeoutId = setTimeout(() => {
        isScrolling = false; // Reset the state flag
        EDITOR_onScroll_TrailingEdge();
    }, 150); // 150ms is standard for catching a user's natural scroll pause
}

/**
 * @returns zeroNoAction_oneForceEntireViewportDrawThroughPrevVliAndCurrVli_twoReturn
 */
function EDITOR_onScroll_LeadingEdge() {
    EDITOR_finalizeAllCursors();
    if (get_EDITOR_ONSCROLLscrollTop() === EDITOR_baseElement.scrollTop &&
        prevVli === get_EDITOR_virtualIndexLine() &&
        get_EDITOR_ONSCROLLvirtualCount() === get_EDITOR_virtualCount()) {
            // TODO: this is directly tied to a scroll event on EDITOR_baseElement so handle it from there perhaps?
            // TODO: this code is duplicated inside EDITOR_drawHorizontalScrollbar, reduce duplication?
            if (get_EDITOR_horizontal_scrollbar().scrollLeft !== EDITOR_baseElement.scrollLeft) {
                get_EDITOR_horizontal_scrollbar().scrollLeft = EDITOR_baseElement.scrollLeft;
            }
            return 2;
    }

    EDITOR_timer = setTimeout(EDITOR_onScroll_timeoutFunc, 1000);

    if (get_EDITOR_ONSCROLLvirtualCount() !== get_EDITOR_virtualCount() ||
        get_EDITOR_gutter().children.length !== get_EDITOR_virtualCount() ||
        get_EDITOR_textElement().children.length !== get_EDITOR_virtualCount()) {
            // Force case 3
            prevVli = 0;
            currVli = get_EDITOR_virtualCount();

            // TODO: Duplicated setting of scrolltop; this case and just baseline everytime vertical scrolls it is done in this method elsewhere
            set_EDITOR_ONSCROLLscrollTop(EDITOR_baseElement.scrollTop);
            EDITOR_createViewport();
            return 1;
    }

    return 0;
}

let ticking = false;

function EDITOR_requestTick() {
    //set_EDITOR_onScroll_bool(true);
    set_EDITOR_ONSCROLLscrollTop(EDITOR_baseElement.scrollTop);

    if (!ticking) {
        window.requestAnimationFrame(() => {
            // Put your actual layout rendering logic cleanly in here
            EDITOR_performLayoutUpdate(); 
            ticking = false;
        });
        ticking = true;
    }
}

function EDITOR_performLayoutUpdate() {
    let diff = currVli - prevVli;

    let lowerBound;
    let upperBound;
    let beltIndexLine;

    if (diff > 0 && diff < get_EDITOR_virtualCount()) {
        // Note: this case has 'vertical = (prevVli + get_EDITOR_virtualCount()) * get_EDITOR_lineHeight();'
        // I believe 'get_EDITOR_virtualCount' === 'get_EDITOR_ONSCROLLvirtualCount' in this case, thus all vertical calculations can be moved after the if statements to be lowerBound * ...
        // All cases other than this one were exact 1 to 1 matches.
        //
        lowerBound = prevVli + get_EDITOR_ONSCROLLvirtualCount();
        upperBound = lowerBound + diff;

        beltIndexLine = EDITOR_beltIndexZero;

        EDITOR_beltIndexZero = beltIndexLine + diff;
        if (EDITOR_beltIndexZero >= get_EDITOR_textElement().children.length)
            EDITOR_beltIndexZero -= get_EDITOR_textElement().children.length;
    }
    else if (diff < 0 && (diff *= -1) < get_EDITOR_virtualCount()) {
        lowerBound = currVli;
        upperBound = lowerBound + diff;

        let lastIndex = EDITOR_beltIndexZero === 0
            ? get_EDITOR_textElement().children.length - 1
            : EDITOR_beltIndexZero - 1;

        EDITOR_beltIndexZero = lastIndex - (diff - 1);
        if (EDITOR_beltIndexZero < 0)
            EDITOR_beltIndexZero += get_EDITOR_textElement().children.length;

        beltIndexLine = EDITOR_beltIndexZero;
    }
    else {
        lowerBound = get_EDITOR_virtualIndexLine();
        upperBound = lowerBound + get_EDITOR_virtualCount();

        beltIndexLine = EDITOR_beltIndexZero;
    }

    let vertical = lowerBound * get_EDITOR_lineHeight();

    beltIndexLine--; // The 0th loop will increment somewhat awkwardly. This decrement avoids that.

    // Not feelings great, just am grinding out some progress this is kinda messy but I think it is working.
    //
    /**
     * Important detail to consider:
     * the lines that are >= EDITOR_lineEndPositionList.count will continually increment lineStart by 1
     * So if you expect this to accurately represent the EOF position when it is in view, it probably does NOT.
     * 
     * TODO: I think I saw how to do it in a way that is more sensible. There is no reason to not just put the lineStart = lineEnd + 1 inside the if that is immediately following I think? Then you'd avoid this 'note'...
     * ...ugh for completeness I need to mention that this would be an issue now that I see it.
     * You have lineEnd = -1 so then you'd need a note for that unless you changed the initial value to be 0 somehow or something, just idk.
     */
    let lineStart = 0;
    let lineEnd;
    if (lowerBound < EDITOR_lineEndPositionList.count) {
        if (lowerBound === 0) {
            //lineStart = -1; // awkward 0th loop if lowerBound is 0
            lineEnd = -1; // awkward 0th loop if lowerBound is 0
        }
        else {
            lineEnd = EDITOR_lineEndPositionList.data[lowerBound - 1]; // awkward 0th loop if lowerBound is 0
        }
    }
    else {
        lineEnd = -1; // awkward 0th loop if lowerBound is 0
    }

    //let left = `${gutterWidthTotal}px`;

    for (var indexLine = lowerBound; indexLine < upperBound; indexLine++) {
        let top = `${vertical}px`;

        vertical += get_EDITOR_lineHeight();

        beltIndexLine++;
        if (beltIndexLine >= get_EDITOR_textElement().children.length)
            beltIndexLine -= get_EDITOR_textElement().children.length;

        let gutter = get_EDITOR_gutter().children[beltIndexLine];
        let div = get_EDITOR_textElement().children[beltIndexLine];

        // - [ ] TODO: order of setting 'transform' vs 'textContent' vs 'className'; you need to understand the differences, if any.
        //     - [ ] TODO: there exists an HTML syntax that will group your changes. I'm not talking about animation frame, I think it is something like the name "fragment". Is this useful here?
        gutter.style.top = top;
        div.style.top = top;
        //div.style.left = left;

        lineStart = lineEnd + 1;
        if (indexLine < EDITOR_lineEndPositionList.count) {
            gutter.textContent = indexLine + 1;
            lineEnd = EDITOR_lineEndPositionList.data[indexLine];
        }
        else {
            gutter.textContent = '~';
            lineEnd = lineStart;
        }

        // TODO: perhaps some debug assertion that lineEnd > lineStart?
        // TODO: perhaps just always use 'EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(lineStart, lineEnd));'...
        // ...I think it would depend on the internal details of the function / measurements...
        // ...I could see it being better for caching but maybe worse if a subarray allocation is occuring but maybe there isn't an allocation when lineStart===lineEnd... etc...
        // ...but maybe the function invocation is too much code to cache and nothing I'm saying is even remotely true I have no idea lol
        let textContent = lineStart === lineEnd
            ? ''
            : EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(lineStart, lineEnd));

        // Corrupt state if assumption is not met:
        // - All lines of text are to contain at least 1 span at all times even if that span is just an empty one.
        let span = div.children[0];
        span.className = 'eN';
        span.textContent = textContent;

        /*
        I feel like the AI whisperer.

        Google AI overview:
        "
        What are your thoughts on the comment in this code snippet:
        '
        //     - Maybe div.children[i].remove is faster OR maybe it tells the GC more about your intent and is better that way?
        for (let i = div.children.length - 1; i >= childIndex; i--) {
            div.removeChild(div.children[i]);
        }
        '
        "

        ...

        > The comment raises a great question about JavaScript performance and memory management, but its assumptions are slightly off.

        All in all it said > Speed is identical


        Then it said

        > To clear ALL children: If childIndex is 0, using div.textContent = '' or div.replaceChildren() is drastically faster than looping.

        And then asked > Is childIndex usually zero, or are you keeping some initial children?

        I say "'childIndex' is guaranteed to be at least '1'"

        It says > The Best Alternative: Range API
        > ```
        const range = document.createRange();
        range.setStartAfter(div.children[childIndex - 1]);
        range.setEndAfter(div.lastChild);
        range.deleteContents();
        > ```

        I have no opinion on whether range is the write API, but I never heard of the API and now I have I gotta look into it.
        */

        // - [ ] TODO: or perhaps there is a better function to be using.
        //     - Maybe div.children[i].remove is faster OR maybe it tells the GC more about your intent and is better that way?
        for (let i = div.children.length - 1; i >= 1; i--) {
            div.removeChild(div.children[i]);
        }
    }
}

function EDITOR_onScroll_TrailingEdge() {
    // Put code here that should ONLY execute when scrolling stops completely
    //EDITOR_onScroll_timeoutFunc();
}

function EDITOR_onScroll_timeoutFunc() {
    if (get_EDITOR_onScroll_bool()) {
        set_EDITOR_onScroll_bool(false);
        //EDITOR_syntaxHighlighting(); // unless you desire to go the way of debounce in which case you wouldn't include this invocation.
        EDITOR_timer = setTimeout(EDITOR_onScroll_timeoutFunc, 1000);
    } else {
        //EDITOR_syntaxHighlighting();

        EDITOR_timer = null;
        // Code Duplication: # Redraw cursor selection virtualization... TODO: This is using 'EDITOR_primaryCursor' rather than 'EDITOR_cursorList[i]' so it is surely incorrect?
        for (let i = 0; i < EDITOR_cursorList.length; i++) {
            EDITOR_createStyleForSelection(EDITOR_primaryCursor);
        }
    }
}

/*
TODO: for function 2, you need to determine whether you will lex the
- [ ] textContent on the span,
- [ ] or if you will decode from the bytes again.

I'm going to do
- [ ] textContent on the span,

but there is 0 reasoning, understanding, or measurements behind my decision.
*/

function EDITOR_syntaxHighlighting() {
    // If I delay setting 'set_EDITOR_ONSCROLLvirtualIndexLine()' then I can just use that.
    // I can't bear to do that right now though. I'm just gonna make this variable.
    let prevVli = EDITOR_syntaxHighlighting_previousIndexVirtual;
    let currVli = get_EDITOR_virtualIndexLine();
    //
    EDITOR_syntaxHighlighting_previousIndexVirtual = get_EDITOR_virtualIndexLine();

    let diff = currVli - prevVli;

    let lowerBound;
    let upperBound;
    let vertical;
    let origin;

    let beltIndexZero = EDITOR_beltIndexZero;
    let beltIndexFinal = EDITOR_beltIndexLine_PREVIOUS(beltIndexZero);

    let i = 0;

    // - [ ] TODO: lineStart, and lineEnd; these are currently being retrieved via "random access"...
    // ...But,  this logic currently goes from 1 indexLine to the very next indexLine by a difference of '1'.
    // Currently, there is not any logic for code folding.
    // I do not initially believe there is a benefit to leaving the code in the current state by some argument of
    // "optimizing that the next line is an indexLine of 1, rather than 'random access' would not work if code folding were ever added".
    // ...
    // I believe this in part because I don't believe the code in its current state would work if code folding were ever added.
    // And thus an argument of that kind ought to suggest that the current code is applicable when using a code folding feature.
    // But ultimately I believe these changes one way or the other are "extremely trivial" given that they're common patterns in the codebase
    // and can be changed to whatever well known manner is preferable at any moment within this "black box" of a function.
    // ... 
    // That felt kinda rambly... what I'm saying is:
    // "The lineStart of the next line is the lineEnd of the previous line + 1"
    // - [ ] TODO: in reference to the above TODO about "lineStart, and lineEnd;"...
    // ...'EDITOR_onScroll_WRAPIT()' actually has the same logic in it. And that is running synchronously ever scroll event, so you should 100% prioritize that today above anything.
    //
    // 
    // - [ ] TODO: get the initial trackedSyntax_i, then just keep re-using it, rather than doing the binary search for the trackedSyntax_i every line. (pass it in to / return from 'JS_line_lex_newVersion')
    //
    // - [ ] TODO: There is something in this method that is decently pointless overhead relating to...:
    //     - An empty line, a line only consisting of whitespace, or a line that is indented.
    //         - ...this one is perhaps less obvious from a non-branching perspective. And perhaps even just adding a conditional branch that avoids invoking 'JS_line_lex_newVersion' in this case is worthwhile.
    //     - A line that is out of bounds of 'indexLine < EDITOR_lineEndPositionList.count'
    //         - ...consider separating the loop bounds in some way to remove conditional branches related to 'if (indexLine < EDITOR_lineEndPositionList.count)'
    //
    // - [ ] TODO: The reverse case currently loops in reverse...
    // ...this means the above 'TODO' cases won't be applicable there, they'll only work for the initial forwards case. So:
    //     - [ ] determine the smallest index that will be handled by the reverse case and then start from there?
    //
    // - [x] TODO: Checking the length is 1 is probably not useful; short of there having been "corrupt state" from someone messing with developer tools or an exception having stopped code early, but it doesn't feel sensible to cover these cases here.
    //
    // - [ ] TODO: If you have nothing better to do with you time: give a moment of thought to the reference chasing that may or may not be occuring inside these loops...
    // ...it is hard to say:
    // 1. because the engine is gonna do optimizations that I don't necessarily understand completely
    // 2. the fully optimized "minimal reference chasing" solution might be only nominal
    // 3. ummm
    // 
    // 
    // - [ ] TODO: rename the 'trackedSyntaxExhausted' variable because it makes me anxious that I will manifest that state of being into reality whenever I read the variable name.
    //
    // - [ ] You really should do the logic to not include lines of text that are just whitespace in the preprocessor.cjs cause you now are getting the babel note:
    //     - [ ] [BABEL] Note: The code generator has deoptimised the styling of C:\Users\hunte\Repos\New folder (3)\Edit\preprocessor\__PREPROCESSEDbundle__.js as it exceeds the max of 500KB.
    //     - ... I don't actually know if they're counting whitespace as part of that 500KB, I'd presume they are so you should stop doing it. At least when it comes to the comments that are indented, and you include the indentation for no reason even though you removed the comment.

    
    let beltIndexCurrent = beltIndexZero;
    let indexLine = currVli;
    for (; i < get_EDITOR_virtualCount(); i++) {
        if (get_EDITOR_textElement().children[beltIndexCurrent].children[0].className === 'eN') {
            get_EDITOR_textElement().children[beltIndexCurrent].children[0].className = '';

            let lineStart;
            let lineEnd;
            if (indexLine < EDITOR_lineEndPositionList.count) {
                if (indexLine === 0) {
                    lineStart = 0;
                    lineEnd = EDITOR_lineEndPositionList.data[indexLine] - 0;
                }
                else {
                    lineStart = (EDITOR_lineEndPositionList.data[indexLine - 1] + 1);
                    lineEnd = EDITOR_lineEndPositionList.data[indexLine];
                }
            }
            else {
                lineStart = 0;
                lineEnd = 0;
            }

            JS_line_lex_newVersion(get_EDITOR_textElement().children[beltIndexCurrent], beltIndexCurrent, indexLine, lineStart);
        }
        else {
            break;
        }
        beltIndexCurrent = EDITOR_beltIndexLine_NEXT(beltIndexCurrent);
        indexLine++;
    }
    
    beltIndexCurrent = beltIndexFinal;
    indexLine = currVli + get_EDITOR_virtualCount() - 1;
    for (; i < get_EDITOR_virtualCount(); i++) {
        if (get_EDITOR_textElement().children[beltIndexCurrent].children[0].className === 'eN') {
            get_EDITOR_textElement().children[beltIndexCurrent].children[0].className = '';

            let lineStart;
            let lineEnd;
            if (indexLine < EDITOR_lineEndPositionList.count) {
                if (indexLine === 0) {
                    lineStart = 0;
                    lineEnd = EDITOR_lineEndPositionList.data[indexLine] - 0;
                }
                else {
                    lineStart = (EDITOR_lineEndPositionList.data[indexLine - 1] + 1);
                    lineEnd = EDITOR_lineEndPositionList.data[indexLine];
                }
            }
            else {
                lineStart = 0;
                lineEnd = 0;
            }

            JS_line_lex_newVersion(get_EDITOR_textElement().children[beltIndexCurrent], beltIndexCurrent, indexLine, lineStart);
        }
        else {
            break;
        }
        beltIndexCurrent = EDITOR_beltIndexLine_PREVIOUS(beltIndexCurrent);
        indexLine--;
    }

    //if (diff > 0 && diff < get_EDITOR_virtualCount()) {
    //    
    //}
    //else if (diff < 0 && (diff *= -1) < get_EDITOR_virtualCount()) {
    //    
    //}
    //else {
    //    
    //}
//
    //for (var indexLine = lowerBound; indexLine < upperBound; indexLine++) {
    //    
    //}

    /*
    You know there's diff many lines to syntax highlight.
    You can guess that is diff < get_EDITOR_virtualCount()
    that you'll start at 'EDITOR_beltIndexZero'
    and loop diff amount of times.

    Then you maybe have to check the next div whether it has the not syntax highlighted css class
    in case many scroll events occured and somehow if this results you lose information you have add a step if needed to check
    and do it only at the edge instead of entire.

    It's always either the first or last.
    So your edges to check might be 'EDITOR_beltIndexZero' and PREVIOUS('EDITOR_beltIndexZero')

    Then you can loop positive or negative depending on first or last.

    My concern is with a scroll to a larger scrollY, then a scroll to a smaller scrollY
    such that either scrollY are not equal, and that there is at least a difference of 1 lineHeight between both scrollY to ensure the changes aren't cancelling out.

    I think then you'd need to edge check 'EDITOR_beltIndexZero' find a hit, loop until you no longer see the not syntax highlighted css class
    then this tells you to edge check PREVIOUS('EDITOR_beltIndexZero') and the remainder of your 'diff' to loop is in reverse.

    I'm trying to think about whether the scroll function could leave behind data that indicates to this function
    whether it is a 'EDITOR_beltIndexZero', PREVIOUS('EDITOR_beltIndexZero'), or both case without checking the edge divs whether they have the not syntax highlighted css class.
    */
}

function EDITOR_createViewport() {
    set_EDITOR_ONSCROLLvirtualCount(get_EDITOR_virtualCount());

    get_EDITOR_gutter().innerHTML = '';
    get_EDITOR_textElement().innerHTML = '';
    let trackedSyntax_StartingIndex = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(0 + get_EDITOR_virtualIndexLine());
    if (trackedSyntax_StartingIndex === NaN || trackedSyntax_StartingIndex === -1) {
        trackedSyntax_StartingIndex = EDITOR_trackedSyntaxList.count_abstract;
    }

    let trackedSyntax_I = trackedSyntax_StartingIndex;

    EDITOR_beltIndexZero = 0;
    let top = `0px`;
    //let left = `${gutterWidthTotal}px`;

    for (var i = 0; i < get_EDITOR_virtualCount(); i++) {

        let indexLine = i + get_EDITOR_virtualIndexLine();

        let gutterLineElement = document.createElement('div');
        if (indexLine >= EDITOR_lineEndPositionList.count) {
            gutterLineElement.textContent = '~';
        }
        else {
            gutterLineElement.textContent = indexLine + 1;
        }
        gutterLineElement.className = 'eG';
        get_EDITOR_gutter().appendChild(gutterLineElement);
        gutterLineElement.style.top = top;

        let line = EDITOR_getLineBoundaryPositions(indexLine);
        let div = document.createElement('div');
        div.className = 'eT';
        get_EDITOR_textElement().appendChild(div);
        div.style.top = top;
        //div.style.left = left;

        div.appendChild(document.createElement('span'));
    }
    EDITOR_drawHorizontalScrollbar();
}

/**
 * If you were to make a function for this logic, it presumably would look like this.
 * I'm not sure if I like the idea of having a function for this though, given it is inside a loop, I'd want to investigate whether it has any performance impacts.
 * TODO: make a decision
 * 
 * @param line is the result from 'EDITOR_getLineBoundaryPositions(...)'
 * 
 * @returns trackedSyntax_I the index that was left off on
 */
function EDITOR_createSpansForLineOfText(div, lineStart, lineEnd, trackedSyntax_I) {
	let childIndex = 0;

    if (lineStart === lineEnd) {
    	if (childIndex < div.children.length) {
            let span = div.children[childIndex++];
			span.textContent = '';
            span.className = '';
		}
		else {
			div.appendChild(document.createElement('span'));
            childIndex++;
		}
    }
    else {
        let substart = lineStart;
        for (; trackedSyntax_I < EDITOR_trackedSyntaxList.count_abstract;) {
            EDITOR_trackedSyntaxList.getElementAt(trackedSyntax_I);
    
            if (substart >= lineEnd) {
                break;
            }
    
            if (get_EDITOR_pooledTrackedSyntax_start() >= lineEnd) {
                break;
            }
    
            if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() < lineStart) {
                trackedSyntax_I++;
                continue;
            }
    
            if (get_EDITOR_pooledTrackedSyntax_start() > substart) {
                let subend = get_EDITOR_pooledTrackedSyntax_start() > lineEnd ? lineEnd : get_EDITOR_pooledTrackedSyntax_start(); // probably a nonsense line of code given the previous if statements
                childIndex = EDITOR_language_line_lex(div, substart, subend, childIndex);
                substart += (subend - substart);
            }
    
            {
                let span;
                if (childIndex < div.children.length) {
					span = div.children[childIndex++];
                    //span.className = ''; className is guaranteed to be set in this specific case
				}
				else {
					span = document.createElement('span');
                    div.appendChild(span);
                    childIndex++;
				}
                let trackedSyntaxEnd = get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length();
                let subend = trackedSyntaxEnd > lineEnd ? lineEnd : trackedSyntaxEnd;
                span.textContent = EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(substart, subend));
                substart += (subend - substart);
                switch (EDITOR_pooledTrackedSyntax_trackedSyntaxKind) {
                    case get_TrackedSyntaxKind_Comment():
                        span.className = 'eCM';
                        break;
                    case get_TrackedSyntaxKind_String():
                        span.className = 'eSM';
                        break;
                    default:
                        span.className = '';
                        break;
                }
            }
    
            if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() <= lineEnd) {
                trackedSyntax_I++;
                continue;
            }
    
            break;
        }
    
        if (substart < lineEnd) {
            childIndex = EDITOR_language_line_lex(div, substart, lineEnd, childIndex);
        }
    }

    let aaa = div.children.length - childIndex;
    for (let i = 0; i < aaa; i++) {
        div.removeChild(div.children[childIndex]);
    }

    return trackedSyntax_I;
}

/**
 * TODO: This function uses 'EDITOR_getLineAndColumnIndices' but it needs to be raw.
 * 
 * @param {EDITOR_Cursor} cursor 
 * @returns 
 */
function EDITOR_removeSelection(cursor) {
    // When you do the multicursor you would need to actually keep sorted the pending line end positions

    if (cursor.editKind != get_EditKind_None()) {
        // TODO: multicursor confusion scenario is likely to happy due to this code, but the code isn't related enough for me to change it yet.
        EDITOR_finalizeEdit(cursor);
    }

    let smallPosition;
    let largePosition;
    if (cursor.selectionAnchor < cursor.selectionEnd) {
        smallPosition = cursor.selectionAnchor;
        largePosition = cursor.selectionEnd;
    }
    else {
        smallPosition = cursor.selectionEnd;
        largePosition = cursor.selectionAnchor;
    }

    cursor.selectionAnchor = 0;
    cursor.selectionEnd = 0;

    let editLength = largePosition - smallPosition;
    // editLength is 0 in this ...startEdit invocation intentionally, you cannot set the editLength until the end (TODO: remember what the exact reason was and put it here... I think it was because 'EDITOR_readLineEndPositionList' function is used rather than reading directly)
    EDITOR_startEdit(cursor, get_EditKind_RemoveTextNoBatching(), smallPosition, /*editLength*/ 0);

    let smallLineAndColumnIndices = EDITOR_getLineAndColumnIndices(smallPosition);
    cursor.indexLine = smallLineAndColumnIndices.indexLine;
    cursor.indexColumn = smallLineAndColumnIndices.indexColumn;
    cursor.editIndexLine = smallLineAndColumnIndices.indexLine;
    cursor.editIndexColumn = smallLineAndColumnIndices.indexColumn;

    let largeLineAndColumnIndices = EDITOR_getLineAndColumnIndices(largePosition);
    cursor.END_editIndexLine = largeLineAndColumnIndices.indexLine;
    cursor.END_editIndexColumn = largeLineAndColumnIndices.indexColumn;

    let indexTrackedSyntax = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(cursor.indexLine);
    if (indexTrackedSyntax === NaN || indexTrackedSyntax === -1) {
        indexTrackedSyntax = EDITOR_trackedSyntaxList.count_abstract;
    }
    let possibleTrackedSyntaxToSpanSingleLine = false;
    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
        EDITOR_trackedSyntaxList.getElementAt(indexTrackedSyntax);
        if (get_EDITOR_pooledTrackedSyntax_start() < EDITOR_lineEndPositionList.data[cursor.indexLine]) {
            possibleTrackedSyntaxToSpanSingleLine = true;
        }
        // TODO: This has no reason to be a for loop
        for (let i = cursor.indexLine - 1; i >= 0; i--) {
            let lineEndPosition = EDITOR_lineEndPositionList.data[i];
            if (get_EDITOR_pooledTrackedSyntax_start() < lineEndPosition &&
                get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > lineEndPosition) {
                    possibleTrackedSyntaxToSpanSingleLine = false;
                    break;
            }
            else {
                break;
            }
        }
    }

    let linesRemovedCount = 0;
    // -1 since you can't remove EOF
    for (var iVarDependent = cursor.indexLine; iVarDependent < EDITOR_lineEndPositionList.count - 1; iVarDependent++) {
        // TODO: all of these reads need to be raw for this work with multicursor just remember that for tomorrow don't worry about this right now just focus on the one task but remember this for tomorrow.
        let lineEnding = EDITOR_readLineEndPositionList(iVarDependent);
        if (lineEnding >= cursor.editPosition && lineEnding < cursor.editPosition + editLength) {
            linesRemovedCount++;
            cursor.editLineFeedCount++;
            EDITOR_lineEndPositionList_PENDING.insert(EDITOR_lineEndPositionList_PENDING.count, lineEnding);

            if (possibleTrackedSyntaxToSpanSingleLine) {
                let NOTlineEndBelongsToSyntax;
                if (iVarDependent >= EDITOR_lineEndPositionList.count)
                    NOTlineEndBelongsToSyntax = true;
                else if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() <= EDITOR_lineEndPositionList.data[iVarDependent])
                    NOTlineEndBelongsToSyntax = true;
                
                if (NOTlineEndBelongsToSyntax) {
                    EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);

                    // do not increment because removed
                    possibleTrackedSyntaxToSpanSingleLine = false;
                    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
                        EDITOR_trackedSyntaxList.getElementAt(indexTrackedSyntax);
                        if (get_EDITOR_pooledTrackedSyntax_start() < lineEnding &&
                            get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > lineEnding) {
                                possibleTrackedSyntaxToSpanSingleLine = true;
                        }
                    }
                }
            }
        }
        else {
            break;
        }
    }

    if (linesRemovedCount > 0 && possibleTrackedSyntaxToSpanSingleLine) {
        // The next line end will NOT be removed, so you need to check whether it was encompassed by the possible syntax.
        //
        // Inside the for loop you need to do this when you exhaust the encompassed line ends for a given syntax and move to the next one too.
        //
        let NOTlineEndBelongsToSyntax;
        if (iVarDependent >= EDITOR_lineEndPositionList.count)
            NOTlineEndBelongsToSyntax = true;
        else if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() <= EDITOR_lineEndPositionList.data[iVarDependent])
            NOTlineEndBelongsToSyntax = true;
        
        if (NOTlineEndBelongsToSyntax)
            EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);
    }

    let finalLineEndPosition = EDITOR_readLineEndPositionList(cursor.indexLine + linesRemovedCount);
    let largestDrawnIndexLine = get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1;
    let visibleLinesRemovedCount = 0;

    // 5 stages
    // ========
    // - Remove selection on large position line
    // - Remove selection on small position line
    // - Visually merge the small position line and large position line (if applicable)
    // - Remove middle line(s)
    // - 'Draw lines that came into view' / 'clear text for any lines > text length and use a '~' in the gutter'

    // Remove selection on small position line
    let smallLineDiv = null;
    {
        cursor.indexLine = smallLineAndColumnIndices.indexLine;
        cursor.indexColumn = smallLineAndColumnIndices.indexColumn;

        walkLineUntilIndexColumn(cursor);
        
        let lineBoundaryPositions = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let remaining;
        if (largePosition > lineBoundaryPositions.end) {
            remaining = lineBoundaryPositions.end - smallPosition;
        }
        else {
            remaining = largePosition - smallPosition;
        }

        if (w_span && w_indexColumn_SpanTextContentRelative >= 0) {
            smallLineDiv = w_div;
            while (remaining > 0) {
                let available = w_span.textContent.length - w_indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;    
                
                if (count > 0) {
                    w_span.textContent = w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) + w_span.textContent.slice(w_indexColumn_SpanTextContentRelative + count);
                }

                if (w_div.children.length > 1 && w_span.textContent.length === 0) {
                    w_div.removeChild(w_span);
                }
                else {
                    w_indexSpan++;
                }
    
                if (remaining > 0) {
                    if (w_indexSpan >= w_div.children.length) break;
                    w_span = w_div.children[w_indexSpan];
                    w_indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }

    // Remove selection on large position line
    let largeLineDiv = null;
    if (linesRemovedCount > 0) {
        cursor.indexLine = cursor.indexLine + linesRemovedCount;
        cursor.indexColumn = 0;

        let lineBoundaryPositions = EDITOR_getLineBoundaryPositions(cursor.indexLine);
        let remaining = largePosition - lineBoundaryPositions.start;

        walkLineUntilIndexColumn(cursor);

        if (w_span && w_indexColumn_SpanTextContentRelative >= 0) {
            largeLineDiv = w_div;
            while (remaining > 0) {
                let available = w_span.textContent.length - w_indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;

                if (count > 0)
                    w_span.textContent = w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) + w_span.textContent.slice(w_indexColumn_SpanTextContentRelative + count);

                if (w_div.children.length > 1 && w_span.textContent.length === 0)
                    w_div.removeChild(w_span);
                else
                    w_indexSpan++;
    
                if (remaining > 0) {
                    if (w_indexSpan >= w_div.children.length) break;
                    w_span = w_div.children[w_indexSpan];
                    w_indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }

    // The line of text that comes into view depends on the cumulative lines removed by multicursors that came before or on that line

    // TODO: There's a presumption that you have the HTML, this isn't always the case so I'll have to revisit this

    // Merge the first and last lines (if applicable)
    //
    // Four cases of existence (!... implies it does NOT exist, i.e.: it is not rendered on the UI)
    // =======================
    // - [ ] keeping, removing
    // - [ ] keeping, !removing
    // - [ ] !keeping, removing
    // - [ ] !keeping, !removing
    //
    // - [ ] Ensure all 4 cases of existence handle 'EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);'
    //
    if (linesRemovedCount > 0) {
        cursor.indexLine = smallLineAndColumnIndices.indexLine;
        cursor.indexColumn = smallLineAndColumnIndices.indexColumn;

        if (smallLineDiv) {
            if (largeLineDiv) { // - [x] keeping, removing
                let rememberLargeLineDivLength = largeLineDiv.children.length;
                for (var i = 0; i < rememberLargeLineDivLength; i++) {
                    if (largeLineDiv.children[0].textContent.length > 0) {
                        smallLineDiv.appendChild(largeLineDiv.children[0]);
                    }
                    else {
                        largeLineDiv.removeChild(largeLineDiv.children[0]);
                    }
                }
                visibleLinesRemovedCount++;
                //largeLineDiv.innerHTML = '';
                //get_EDITOR_textElement().appendChild(largeLineDiv);
            }
            else { // - [ ] keeping, !removing

            }
        }
        else {
            if (largeLineDiv) { // - [ ] !keeping, removing
                
            }
            else { // - [ ] !keeping, !removing
                
            }
        }

        //if (largeLineDiv) {
        //    
        //}
        
        /*if (smallIndexLine < get_EDITOR_textElement().children.length && smallIndexLine >= 0) {
            
            let smallLineDiv = get_EDITOR_textElement().children[smallIndexLine];


            // Goal: If you have the line that the selection's small position is on (the keeping div)
            // then you need to get the text for the line that the selection's large position is on (the removing div).
            //
            // The goal splits into two cases:
            //
            // - If the line that the selection's large position is on exists in the viewport,
            // then you can move the HTML from the div that represents that line,
            // to the div that represents the line that the selection's small position is on.
            //
            // - If the line that the selection's large position is on does NOT exist in the viewport,
            // then you need to generate the HTML for the line's text and add it
            // to the div that represents the line that the selection's small position is on.
            // 
            // Funnily enough I might be able to just invoke 'EDITOR_drawLine(...)'.
            //
            // The function has a very frustrating quirk where the invoker has to
            // provide the div that the HTML gets appended to.
            // 
            // In addition to that, if you want to redraw the line,
            // the invoker has to set 'innerHTML' to '' prior to invoking the function.
            //
            // But this might mean I can invoke 'EDITOR_drawLine(...)'
            // without setting 'innerHTML' to '', and this would append the text of that line...
            //
            // Although I'm presuming that I'd generate the HTML
            // prior to modifying the line end position indices.
            //
            // In the current state of the code, this merging of the small and large lines
            // is done AFTER already having modified the line end position indices.


            let removingDiv = get_EDITOR_textElement().children[largeIndexLine];
            let rememberRemovingDivLength = removingDiv.children.length;

            for (var i = 0; i < rememberRemovingDivLength; i++) {
                if (removingDiv.children[0].textContent.length > 0) {
                    smallLineDiv.appendChild(removingDiv.children[0]);
                }
                else {
                    removingDiv.removeChild(removingDiv.children[0]);
                }
            }

            visibleLinesRemovedCount++;
            removingDiv.innerHTML = '';
            get_EDITOR_textElement().appendChild(removingDiv);
        }*/
    }

    // Remove middle line(s)
    if (linesRemovedCount > 0) {
        // off by 1 character
        //
        // Finalizing all cursors fixes the issue... but why was it off by 1 character?
        // 
        // TODO: this needs to be understood but delaying the finalization of an edit is more along the lines of an optimization...
        // ...versus selecting and removing text which needs to work properly both in terms of editing the text and visually displaying the correct result.
        // 
        // TODO: Did I put this here so that multicursors would work or something??? If it is a sensible stepping stone to the final multicursor support then fine I guess but it wouldn't go here it needs to go at the end of the function I think; putting it here is strictly wrong?
        //EDITOR_finalizeAllCursors();



        cursor.indexLine = smallLineAndColumnIndices.indexLine;

        let beltIndexLine_current = EDITOR_indexLineTo_beltIndexLine(smallLineAndColumnIndices.indexLine + 1);

        let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);

        // TODO: This will be wrong because you'd need to explicitly redraw the large selection line index.
        EDITOR_shiftLinesOfText_ToASmaller_IndexLine_byDistance(beltIndexLine_last, beltIndexLine_current, linesRemovedCount);

        EDITOR_drawGutter_Width();
    }

    cursor.editLength = editLength;

    /*
    // 'Draw lines that came into view' / 'clear text for any lines > text length and use a '~' in the gutter'
    if (linesRemovedCount > 0) {

        // off by 1 character
        //
        // Finalizing all cursors fixes the issue... but why was it off by 1 character?
        // 
        // TODO: this needs to be understood but delaying the finalization of an edit is more along the lines of an optimization...
        // ...versus selecting and removing text which needs to work properly both in terms of editing the text and visually displaying the correct result.
        // 
        EDITOR_finalizeAllCursors();

        // 3 cases (TODO: Ensure these for backspace and delete)
        // =======
        // - [ ] inViewTildeCase
        // - [ ] comesIntoViewDueToRemovalTildeCase
        // - [ ] notInViewTildeCase
        //
        // Each case might be the same solution I don't know I just need time to think I'm completely exhausted but ima figure it out by just typing everything out and overtime it will happen
        // 

        let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);

        if (get_EDITOR_textElement().children.length === get_EDITOR_gutter().children.length) {
            for (let i = 0; i < visibleLinesRemovedCount; i++) {
                // TODO: wrap around suspect?
                let gutterLineElement = get_EDITOR_gutter().children[beltIndexLine_last - i];
                gutterLineElement.innerHTML = ''; // I don't believe this will have already been cleared.
                // TODO: wrap around suspect?
                let textLineElement = get_EDITOR_textElement().children[beltIndexLine_last - i];
                textLineElement.innerHTML = ''; // Might already be cleared, furthermore might ALWAYS be cleared.
                EDITOR_drawLine(largestDrawnIndexLine - i, gutterLineElement, textLineElement);
            }
        }

        EDITOR_drawGutter_Width();

        // TODO: 'update_verticalVirtualizationBoundary(EDITOR_lineEndPositionList.count);'?
        // TODO: EDITOR_REMOVE_line_drawGutter(linesRemovedCount);
    }
    */
    
    cursor.STORED_indexColumn = cursor.indexColumn;
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} event 
 * @returns 
 */
function EDITOR_deleteDo(cursor, event) {
    if (cursor.hasSelection()) {
        EDITOR_removeSelection(cursor);
        return;
    }

    // raw?
    let lineEnd = EDITOR_getLineEnd_pos(cursor.indexLine);
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);

    walkLineUntilIndexColumn(cursor);
    if (w_indexColumn_Goal == lastValidIndexColumn) {

        if (cursor.indexLine < EDITOR_lineEndPositionList.count - 1) {
            cursor.editLength++;

            if (w_span.className === 'eCM') {
                EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);
            }

            // NOT start of file, remove the line ending and join the lines

            // Visually, immediately merge the lines if both are visible.
            let beltIndexLine_next = EDITOR_indexLineTo_beltIndexLine(cursor.indexLine + 1);
            if (beltIndexLine_next >= 0) {
                let keepingDiv = w_div;
                let removingDiv = get_EDITOR_textElement().children[beltIndexLine_next];

                let rememberRemovingDivLength = removingDiv.children.length;
                for (var i = 0; i < rememberRemovingDivLength; i++) {
                    if (removingDiv.children[0].textContent.length > 0) {
                        keepingDiv.appendChild(removingDiv.children[0]);
                    }
                    else {
                        removingDiv.removeChild(removingDiv.children[0]);
                    }
                }

                // TODO: This is NOT an optimal solution to removing the empty span after joining the lines
                if (keepingDiv.children.length > 1 && keepingDiv.children[0].textContent.length === 0) {
                    keepingDiv.removeChild(keepingDiv.children[0]);
                }

                let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);
                EDITOR_shiftLinesOfText_ToASmaller_IndexLine_byDistance(beltIndexLine_last, beltIndexLine_next, 1);
            }

            cursor.editLineFeedCount++;
            EDITOR_lineEndPositionList_PENDING.insert(EDITOR_lineEndPositionList_PENDING.count, lineEnd);
            
            // TODO: temp and bad idea.
            EDITOR_finalizeAllCursors();
        }
        else {
            // Start of file
            // nothing?
        }
    }
    else {
        let remaining = 1;

        if (event.ctrlKey) {
            // cursor.editPosition is intended to be equal due to the batch requirements / a new edit would also be equal.
            let tempIndexColumn = cursor.indexColumn;
            let tempPosition = cursor.editPosition;

            let originalCharacterKind = EDITOR_getCharacterCurrent_KIND(tempIndexColumn, tempPosition, lineEnd);
            
            tempIndexColumn++;
            tempPosition++;
            
            while (cursor.indexColumn < lastValidIndexColumn) {
                if (EDITOR_getCharacterCurrent_KIND(tempIndexColumn, tempPosition, lineEnd) !== originalCharacterKind) {
                    break;
                }
                tempIndexColumn++;
                tempPosition++;
                remaining++;
            }
        }

        if (!w_span|| !w_span.textContent || w_indexColumn_SpanTextContentRelative < 0) {
            cursor.editLength += remaining;
        }
        else {
            // TODO: The shared "remove" method would likely look something like this 'while (remaining ...)' logic...
            // ...and also have to include the line ending removal logic
            while (remaining > 0) {
                let available = w_span.textContent.length - w_indexColumn_SpanTextContentRelative;
                let count = remaining > available ? available : remaining;
                remaining -= count;
    
                // When the cursor is at the end of a span, there is no text to delete, because the text starts in the next span.
                if (count > 0) {
                    // this is probably wrong
                    w_span.textContent = w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative) + w_span.textContent.slice(w_indexColumn_SpanTextContentRelative + count);
                    cursor.editLength += count;
                }

                if (w_div.children.length > 1 && w_span.textContent.length === 0) {
                    w_div.removeChild(w_span);
                }
                else {
                    w_indexSpan++;
                }
    
                if (remaining > 0) {
                    if (w_indexSpan >= w_div.children.length) return;
                    
                    w_span = w_div.children[w_indexSpan];
                    w_indexColumn_SpanTextContentRelative = 0;
                }
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {*} event 
 * @returns 
 */
function EDITOR_backspaceDo(cursor, event) {
    if (cursor.hasSelection()) {
        EDITOR_removeSelection(cursor);
        return;
    }

    walkLineUntilIndexColumn(cursor);
    
    if (w_indexColumn_Goal == 0) {
        if (cursor.indexLine > 0) {
            let rememberIndexLine = cursor.indexLine;

            // TODO: multicursor bugs are more likely to occur with this logic:
            // TODO: this logic is extremely suspect given editIndexLine and editIndexColumn...
            // ...as well if you move the cursor during a pending edit then finalize does it edit the correct positions?
            //
            // wrap to previous line
            cursor.indexLine--;
            cursor.indexColumn = EDITOR_getLastValidIndexColumn(cursor.indexLine);
            cursor.editPosition--;
            cursor.editLength++;

            if (w_span.className === 'eCM') {
                EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor);
            }

            // Visually, immediately merge the lines if both are visible.
            let beltIndexLine_previous = EDITOR_indexLineTo_beltIndexLine(rememberIndexLine - 1);
            if (beltIndexLine_previous >= 0) {
                let keepingDiv = get_EDITOR_textElement().children[beltIndexLine_previous];
                let removingDiv = w_div;

                let rememberRemovingDivLength = removingDiv.children.length;
                for (var i = 0; i < rememberRemovingDivLength; i++) {
                    if (removingDiv.children[0].textContent.length > 0) {
                        keepingDiv.appendChild(removingDiv.children[0]);
                    }
                    else {
                        removingDiv.removeChild(removingDiv.children[0]);
                    }
                }

                // TODO: This is NOT an optimal solution to removing the empty span after joining the lines
                if (keepingDiv.children.length > 1 && keepingDiv.children[0].textContent.length === 0) {
                    keepingDiv.removeChild(keepingDiv.children[0]);
                }

                let beltIndexLine_last = EDITOR_indexLineTo_beltIndexLine(get_EDITOR_virtualIndexLine() + get_EDITOR_virtualCount() - 1);
                EDITOR_shiftLinesOfText_ToASmaller_IndexLine_byDistance(beltIndexLine_last, w_beltIndexLine, 1);
            }

            cursor.editLineFeedCount++;
            EDITOR_lineEndPositionList_PENDING.insert(EDITOR_lineEndPositionList_PENDING.count, cursor.editPosition);

            // TODO: temp and bad idea.
            EDITOR_finalizeAllCursors();
        }
        else {
            // Start of file
            // nothing?
        }
    }
    else {
        let remaining = 1;

        if (event.ctrlKey) {
            // cursor.editPosition is intended to be equal due to the batch requirements / a new edit would also be equal.
            let originalCharacterKind = EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, cursor.editPosition);
            cursor.indexColumn--;
            cursor.editPosition--;
            //cursor.editIndexLine--;
            cursor.editIndexColumn--;

            while (cursor.indexColumn > 0) {
                if (EDITOR_getCharacterPrevious_KIND(cursor.indexColumn, cursor.editPosition) !== originalCharacterKind) {
                    break;
                }
                cursor.indexColumn--;
                cursor.editPosition--;
                //cursor.editIndexLine--;
                cursor.editIndexColumn--;
                remaining++;
            }
        }
        else {
            cursor.indexColumn -= 1;
            cursor.editPosition -= 1;
            //cursor.editIndexLine -= 1;
            cursor.editIndexColumn -= 1;
        }

        if (!w_span || !w_span.textContent || w_indexColumn_SpanTextContentRelative < 0) {
            cursor.editLength += remaining;
        }
        else {
            // TODO: The shared "remove" method would likely look something like this 'while (remaining ...)' logic...
            // ...and also have to include the line ending removal logic
            while (remaining > 0) {
                let count = remaining > w_indexColumn_SpanTextContentRelative ? w_indexColumn_SpanTextContentRelative : remaining;
                remaining -= count;
    
                // this is probably wrong
                w_span.textContent = w_span.textContent.slice(0, w_indexColumn_SpanTextContentRelative - count) + w_span.textContent.slice(w_indexColumn_SpanTextContentRelative);
    
                cursor.editLength += count;

                if (w_div.children.length > 1 && w_span.textContent.length === 0) {
                    w_div.removeChild(w_span);
                }
                
                w_indexSpan--;
    
                if (remaining > 0) {
                    if (w_indexSpan < 0) return;
    
                    w_span = w_div.children[w_indexSpan];
                    w_indexColumn_SpanTextContentRelative = w_span.textContent.length;
                }
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 * @param {string} character 
 */
function EDITOR_insertDo(cursor, character) {
    /*
    TODO: (optimization idea) if you are inserting at the 0th or length position it might be worthwhile
    to have a conditional branch make the textContent with 1 less slice invocation.

    TODO: (optimization idea) I'm going to get this less optimized version to work, but you might want to
    make a copy of the span so you only have to "insert" text to the end of the span.
    And then this removes 1 of the slice invocations, rather than inserting "possibly" among the existing textContent.
    */
    
    if (cursor.gapBufferWriteToSpanElement !== EDITOR_offsetWithinSpan_withRespectToThisSpan) {
        set_EDITOR_offsetWithinSpan(0);
        EDITOR_offsetWithinSpan_withRespectToThisSpan = cursor.gapBufferWriteToSpanElement;
    }

    if (cursor.gapBufferWriteToSpanElement) {
        cursor.gapBufferWriteToSpanElement.textContent = 
            cursor.gapBufferWriteToSpanElement.textContent.slice(0, (cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex + get_EDITOR_offsetWithinSpan()) + cursor.gapBufferCount) +
            character +
            cursor.gapBufferWriteToSpanElement.textContent.slice((cursor.gapBufferWriteToSpanElement_SpanTextContentRelativeIndex + get_EDITOR_offsetWithinSpan()) + cursor.gapBufferCount);
    }

    cursor.gapBuffer[cursor.gapBufferCount] = character.charCodeAt(0);
    cursor.gapBufferCount++;

    cursor.editLength++;
    cursor.indexColumn++;

    set_EDITOR_offsetWithinSpan(get_EDITOR_offsetWithinSpan() + cursor.gapBufferCount);
}

function EDITOR_stopTrackingIfTrackedSyntaxMadeToSpanSingleLine(cursor) {
    // binary search for 'if (get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > positionIndex)'
    let indexTrackedSyntax = EDITOR_drawViewPort_FindTrackedSyntax_StartingIndex(cursor.indexLine);
    if (indexTrackedSyntax === NaN || indexTrackedSyntax === -1) {
        indexTrackedSyntax = EDITOR_trackedSyntaxList.count_abstract;
    }
    if (indexTrackedSyntax < EDITOR_trackedSyntaxList.count_abstract) {
        EDITOR_trackedSyntaxList.getElementAt(indexTrackedSyntax);
        if (get_EDITOR_pooledTrackedSyntax_start() < cursor.editPosition) {
            let moreThanOneLineEndPositionIsEncompassed = false;

            // TODO: This has no reason to be a for loop
            for (let i = cursor.indexLine - 1; i >= 0; i--) {
                let lineEndPosition = EDITOR_lineEndPositionList.data[i];
                if (get_EDITOR_pooledTrackedSyntax_start() < lineEndPosition &&
                    get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > lineEndPosition) {
                        moreThanOneLineEndPositionIsEncompassed = true;
                        break;
                }
                else {
                    break;
                }
            }
            
            if (!moreThanOneLineEndPositionIsEncompassed) {
                // TODO: This has no reason to be a for loop
                for (let i = cursor.indexLine + 1; i < EDITOR_lineEndPositionList.count; i++) {
                    let lineEndPosition = EDITOR_lineEndPositionList.data[i];
                    if (get_EDITOR_pooledTrackedSyntax_start() < lineEndPosition &&
                        get_EDITOR_pooledTrackedSyntax_start() + get_EDITOR_pooledTrackedSyntax_length() > lineEndPosition) {
                            moreThanOneLineEndPositionIsEncompassed = true;
                            break;
                    }
                    else {
                        break;
                    }
                }

                if (!moreThanOneLineEndPositionIsEncompassed) {
                    EDITOR_trackedSyntaxList.removeAt(indexTrackedSyntax, 1);
                }
            }
        }
    }
}

/**
 * @param {EDITOR_Cursor} cursor 
 */
function EDITOR_scrollCursorIntoView(cursor) {
    let scrollX = 0;
    let scrollY = 0;

    if (cursor.cursorTranslateYValue < EDITOR_baseElement.scrollTop) {
        scrollY = cursor.cursorTranslateYValue - EDITOR_baseElement.scrollTop;
    }
    else if (cursor.cursorTranslateYValue >= EDITOR_baseElement.scrollTop + EDITOR_baseElement.offsetHeight) {
        // I want to use clientHeight but I don't have any logic for no scrollbar thus single page fitting text might bug out and trigger
        // scrollBy over and over.

        // make the bottom touch then add lineHeight is probably the algorithm to get a perfect fill maybe do lineHeight * 2 skip an event when spamming arrowDown?
        let currentBottom = EDITOR_baseElement.scrollTop + EDITOR_baseElement.offsetHeight;
        let changeToMakeBottomTouch = cursor.cursorTranslateYValue - currentBottom;
        scrollY = changeToMakeBottomTouch + (2 * get_EDITOR_lineHeight());
    }

    if (cursor.cursorTranslateXValue < EDITOR_baseElement.scrollLeft) {
        scrollX = cursor.cursorTranslateXValue - EDITOR_baseElement.scrollLeft;
    }
    else if (cursor.cursorTranslateXValue >= EDITOR_baseElement.scrollLeft + EDITOR_baseElement.offsetWidth) {
        // I want to use clientWidth but I don't have any logic for no scrollbar thus single page fitting text might bug out and trigger
        // scrollBy over and over.

        // make the right touch then add characterWidth is probably the algorithm to get a perfect fill maybe do characterWidth * 2 skip an event when spamming arrowRight?
        let currentRight = EDITOR_baseElement.scrollLeft + EDITOR_baseElement.offsetWidth;
        let changeToMakeRightTouch = cursor.cursorTranslateXValue - currentRight;
        scrollX = changeToMakeRightTouch + (4 * EDITOR_characterWidth);
    }

    EDITOR_baseElement.scrollBy(scrollX, scrollY);
}

function EDITOR_getCharacterKind(character) {
    switch (character) {
        case 'a':
        case 'b':
        case 'c':
        case 'd':
        case 'e':
        case 'f':
        case 'g':
        case 'h':
        case 'i':
        case 'j':
        case 'k':
        case 'l':
        case 'm':
        case 'n':
        case 'o':
        case 'p':
        case 'q':
        case 'r':
        case 's':
        case 't':
        case 'u':
        case 'v':
        case 'w':
        case 'x':
        case 'y':
        case 'z':
        case 'A':
        case 'B':
        case 'C':
        case 'D':
        case 'E':
        case 'F':
        case 'G':
        case 'H':
        case 'I':
        case 'J':
        case 'K':
        case 'L':
        case 'M':
        case 'N':
        case 'O':
        case 'P':
        case 'Q':
        case 'R':
        case 'S':
        case 'T':
        case 'U':
        case 'V':
        case 'W':
        case 'X':
        case 'Y':
        case 'Z':
        case '_':
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
            return get_CharacterKind_LetterOrDigit();
        case ' ':
        case '\t':
        case '\r':
        case '\n':
            return get_CharacterKind_Whitespace();
        default:
            return get_CharacterKind_Punctuation();
    }
}

async function EDITOR_MenuOnClick(indexClicked, elementClicked) {
    const commandKind = parseInt(elementClicked.dataset.commandKind, 10);
    if (!commandKind) {
        return;
    }

    switch (commandKind) {
        case get_CommandKind_Cut():
            EDITOR_finalizeAllCursors();
            await EDITOR_copySelection(EDITOR_primaryCursor);
            EDITOR_removeSelection(EDITOR_primaryCursor);
            EDITOR_drawCursor(EDITOR_primaryCursor);
            return;
        case get_CommandKind_Copy():
            EDITOR_finalizeAllCursors();
            return EDITOR_copySelection(EDITOR_primaryCursor);
        case get_CommandKind_Paste():
            EDITOR_finalizeAllCursors();
            let clipboard = await window.myAPI.readClipboard();
            EDITOR_paste(EDITOR_primaryCursor, clipboard);
            EDITOR_drawCursor(EDITOR_primaryCursor);
            return;
        case get_CommandKind_Find():
            EDITOR_findOverlay_showSetter(!get_EDITOR_findOverlay_show());
            return;
    }
}

/**
 * This clears the cursor's selection.
 */
function EDITOR_moveCursor_position(intValue) {
    let lineAndColumnIndices = EDITOR_getLineAndColumnIndices(intValue);
    EDITOR_moveCursor_indexLine_indexColumn(lineAndColumnIndices.indexLine, lineAndColumnIndices.indexColumn);
}

/**
 * This clears the cursor's selection.
 */
function EDITOR_moveCursor_indexLine_indexColumn(indexLine, indexColumn) {
    let lastValidIndexColumn = EDITOR_getLastValidIndexColumn(indexLine);

    if (indexColumn > lastValidIndexColumn) {
        EDITOR_primaryCursor.indexColumn = lastValidIndexColumn;
    }
    else {
        EDITOR_primaryCursor.indexColumn = indexColumn;
    }

    EDITOR_primaryCursor.indexLine = indexLine;
    
    // TODO: selectionAnchor = selectionEnd; EDITOR_drawCursor(cursor); # being the way to clear a selection should be documented / wrapped by a method for ease of use / readability?
    EDITOR_primaryCursor.selectionAnchor = EDITOR_primaryCursor.selectionEnd;
    EDITOR_drawCursor(EDITOR_primaryCursor);
}

/**
 * Tabs are stored as '\t\0\0\0', all line feeds converted to '\n'.
 * 
 * textonly is in reference to conversion of the raw storage of the text editor such that a tab of '\t\0\0\0' is returned as just '\t', and all line feeds as EDITOR_lineEndString
 * 
 * @returns {string}
 */
function EDITOR_decode_textonly(start, length) {

    if (!EDITOR_lineEndString)
        EDITOR_lineEndString = '\n';

	// TODO: repeated duplications of the same extremely large selection might benefit from temporary caching of this functions result.
	let EDITOR_decode_pooled_stringBuilder_array = new Array(length);

    let end = start + length;
	
	let bytes = EDITOR_textByteList.bytes;
	
	if (length <= 0) {
		return '';
	}
    
	for (let i = start; i < end; i++) {
		switch (bytes[i]) {
			case 0: // NUL
				break;
			case 9: // TAB
				EDITOR_decode_pooled_stringBuilder_array.push('\t');
				break;
			case 10: // LF
				EDITOR_decode_pooled_stringBuilder_array.push(EDITOR_lineEndString);
				break;
			case 32: // Space
				EDITOR_decode_pooled_stringBuilder_array.push(' ');
				break;
			case 33: // !
				EDITOR_decode_pooled_stringBuilder_array.push('!');
				break;
			case 34: // "
				EDITOR_decode_pooled_stringBuilder_array.push('"');
				break;
			case 35: // #
				EDITOR_decode_pooled_stringBuilder_array.push('#');
				break;
			case 36: // $ (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('$');
				break;
			case 37: // %
				EDITOR_decode_pooled_stringBuilder_array.push('%');
				break;
			case 38: // & (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('&');
				break;
			case 39: // ' (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push('\'');
				break;
			case 40: // (
				EDITOR_decode_pooled_stringBuilder_array.push('(');
				break;
			case 41: // )
				EDITOR_decode_pooled_stringBuilder_array.push(')');
				break;
			case 42: // *
				EDITOR_decode_pooled_stringBuilder_array.push('*');
				break;
			case 43: // +
				EDITOR_decode_pooled_stringBuilder_array.push('+');
				break;
			case 44: // , (I think???)
				EDITOR_decode_pooled_stringBuilder_array.push(',');
				break;
			case 45: // -
				EDITOR_decode_pooled_stringBuilder_array.push('-');
				break;
			case 46: // .
				EDITOR_decode_pooled_stringBuilder_array.push('.');
				break;
			case 47: // /
				EDITOR_decode_pooled_stringBuilder_array.push('/');
				break;
			case 48: // 0
				EDITOR_decode_pooled_stringBuilder_array.push('0');
				break;
			case 49: // 1
				EDITOR_decode_pooled_stringBuilder_array.push('1');
				break;
			case 50: // 2
				EDITOR_decode_pooled_stringBuilder_array.push('2');
				break;
			case 51: // 3
				EDITOR_decode_pooled_stringBuilder_array.push('3');
				break;
			case 52: // 4
				EDITOR_decode_pooled_stringBuilder_array.push('4');
				break;
			case 53: // 5
				EDITOR_decode_pooled_stringBuilder_array.push('5');
				break;
			case 54: // 6
				EDITOR_decode_pooled_stringBuilder_array.push('6');
				break;
			case 55: // 7
				EDITOR_decode_pooled_stringBuilder_array.push('7');
				break;
			case 56: // 8
				EDITOR_decode_pooled_stringBuilder_array.push('8');
				break;
			case 57: // 9
				EDITOR_decode_pooled_stringBuilder_array.push('9');
				break;
			case 58: // :
				EDITOR_decode_pooled_stringBuilder_array.push(':');
				break;
			case 59: // ;
				EDITOR_decode_pooled_stringBuilder_array.push(';');
				break;
			case 60: // <
				EDITOR_decode_pooled_stringBuilder_array.push('<');
				break;
			case 61: // =
				EDITOR_decode_pooled_stringBuilder_array.push('=');
				break;
			case 62: // >
				EDITOR_decode_pooled_stringBuilder_array.push('>');
				break;
			case 63: // ?
				EDITOR_decode_pooled_stringBuilder_array.push('?');
				break;
			case 64: // @
				EDITOR_decode_pooled_stringBuilder_array.push('@');
				break;
			case 65: // A
				EDITOR_decode_pooled_stringBuilder_array.push('A');
				break;
			case 66: // B
				EDITOR_decode_pooled_stringBuilder_array.push('B');
				break;
			case 67: // C
				EDITOR_decode_pooled_stringBuilder_array.push('C');
				break;
			case 68: // D
				EDITOR_decode_pooled_stringBuilder_array.push('D');
				break;
			case 69: // E
				EDITOR_decode_pooled_stringBuilder_array.push('E');
				break;
			case 70: // F
				EDITOR_decode_pooled_stringBuilder_array.push('F');
				break;
			case 71: // G
				EDITOR_decode_pooled_stringBuilder_array.push('G');
				break;
			case 72: // H
				EDITOR_decode_pooled_stringBuilder_array.push('H');
				break;
			case 73: // I
				EDITOR_decode_pooled_stringBuilder_array.push('I');
				break;
			case 74: // J
				EDITOR_decode_pooled_stringBuilder_array.push('J');
				break;
			case 75: // K
				EDITOR_decode_pooled_stringBuilder_array.push('K');
				break;
			case 76: // L
				EDITOR_decode_pooled_stringBuilder_array.push('L');
				break;
			case 77: // M
				EDITOR_decode_pooled_stringBuilder_array.push('M');
				break;
			case 78: // N
				EDITOR_decode_pooled_stringBuilder_array.push('N');
				break;
			case 79: // O
				EDITOR_decode_pooled_stringBuilder_array.push('O');
				break;
			case 80: // P
				EDITOR_decode_pooled_stringBuilder_array.push('P');
				break;
			case 81: // Q
				EDITOR_decode_pooled_stringBuilder_array.push('Q');
				break;
			case 82: // R
				EDITOR_decode_pooled_stringBuilder_array.push('R');
				break;
			case 83: // S
				EDITOR_decode_pooled_stringBuilder_array.push('S');
				break;
			case 84: // T
				EDITOR_decode_pooled_stringBuilder_array.push('T');
				break;
			case 85: // U
				EDITOR_decode_pooled_stringBuilder_array.push('U');
				break;
			case 86: // V
				EDITOR_decode_pooled_stringBuilder_array.push('V');
				break;
			case 87: // W
				EDITOR_decode_pooled_stringBuilder_array.push('W');
				break;
			case 88: // X
				EDITOR_decode_pooled_stringBuilder_array.push('X');
				break;
			case 89: // Y
				EDITOR_decode_pooled_stringBuilder_array.push('Y');
				break;
			case 90: // Z
				EDITOR_decode_pooled_stringBuilder_array.push('Z');
				break;
			case 91: // [
				EDITOR_decode_pooled_stringBuilder_array.push('[');
				break;
			case 92: // \
				EDITOR_decode_pooled_stringBuilder_array.push('\\');
				break;
			case 93: // ]
				EDITOR_decode_pooled_stringBuilder_array.push(']');
				break;
			case 94: // ^
				EDITOR_decode_pooled_stringBuilder_array.push('^');
				break;
			case 95: // _
				EDITOR_decode_pooled_stringBuilder_array.push('_');
				break;
			case 96: // `
				EDITOR_decode_pooled_stringBuilder_array.push('`');
				break;
			case 97: // a
				EDITOR_decode_pooled_stringBuilder_array.push('a');
				break;
			case 98: // b
				EDITOR_decode_pooled_stringBuilder_array.push('b');
				break;
			case 99: // c
				EDITOR_decode_pooled_stringBuilder_array.push('c');
				break;
			case 100: // d
				EDITOR_decode_pooled_stringBuilder_array.push('d');
				break;
			case 101: // e
				EDITOR_decode_pooled_stringBuilder_array.push('e');
				break;
			case 102: // f
				EDITOR_decode_pooled_stringBuilder_array.push('f');
				break;
			case 103: // g
				EDITOR_decode_pooled_stringBuilder_array.push('g');
				break;
			case 104: // h
				EDITOR_decode_pooled_stringBuilder_array.push('h');
				break;
			case 105: // i
				EDITOR_decode_pooled_stringBuilder_array.push('i');
				break;
			case 106: // j
				EDITOR_decode_pooled_stringBuilder_array.push('j');
				break;
			case 107: // k
				EDITOR_decode_pooled_stringBuilder_array.push('k');
				break;
			case 108: // l
				EDITOR_decode_pooled_stringBuilder_array.push('l');
				break;
			case 109: // m
				EDITOR_decode_pooled_stringBuilder_array.push('m');
				break;
			case 110: // n
				EDITOR_decode_pooled_stringBuilder_array.push('n');
				break;
			case 111: // o
				EDITOR_decode_pooled_stringBuilder_array.push('o');
				break;
			case 112: // p
				EDITOR_decode_pooled_stringBuilder_array.push('p');
				break;
			case 113: // q
				EDITOR_decode_pooled_stringBuilder_array.push('q');
				break;
			case 114: // r
				EDITOR_decode_pooled_stringBuilder_array.push('r');
				break;
			case 115: // s
				EDITOR_decode_pooled_stringBuilder_array.push('s');
				break;
			case 116: // t
				EDITOR_decode_pooled_stringBuilder_array.push('t');
				break;
			case 117: // u
				EDITOR_decode_pooled_stringBuilder_array.push('u');
				break;
			case 118: // v
				EDITOR_decode_pooled_stringBuilder_array.push('v');
				break;
			case 119: // w
				EDITOR_decode_pooled_stringBuilder_array.push('w');
				break;
			case 120: // x
				EDITOR_decode_pooled_stringBuilder_array.push('x');
				break;
			case 121: // y
				EDITOR_decode_pooled_stringBuilder_array.push('y');
				break;
			case 122: // z
				EDITOR_decode_pooled_stringBuilder_array.push('z');
				break;
			case 123: // {
				EDITOR_decode_pooled_stringBuilder_array.push('{');
				break;
			case 124: // |
				EDITOR_decode_pooled_stringBuilder_array.push('|');
				break;
			case 125: // }
				EDITOR_decode_pooled_stringBuilder_array.push('}');
				break;
			case 126: // ~
				EDITOR_decode_pooled_stringBuilder_array.push('~');
				break;
			default:
				EDITOR_decode_pooled_stringBuilder_array.push(
					EDITOR_decoder.decode(bytes.subarray(i, i + 1)));
				break;
		}
	}
	
	return EDITOR_decode_pooled_stringBuilder_array.join('');
}

function EDITOR_toExtensionKind(extensionWithPeriod) {
    switch (extensionWithPeriod) {
        case '.js':
        case '.cjs':
            return get_ExtensionKind_JavaScript();
        default:
            return get_ExtensionKind_None();
    }
}

function EDITOR_language_line_lex_SET(extensionKind) {
    switch (extensionKind) {
        case get_ExtensionKind_JavaScript():
            EDITOR_language_line_lex = JS_line_lex;
            break;
        default:
            EDITOR_language_line_lex = PLAINTEXT_line_lex;
            break;
    }
}

/**
 * TODO: this can be way faster all I did was take JS_line_lex and then strip away all the details...
 * ...I'm more concerned with tightening the difference between best and worst case...
 * ...by reducing worst case.
 * This makes line lexing JS faster so it is preferable even if I don't write this plaintext implementation perfectly.
 * "maybe" it's faster I didn't measure anything but I swear I know what I'm doing
 * not only did I not measure it but I went back and forth between vscode I actually have no idea if this faster I can't remember anything I'm super tired.
 * I'm tired and I still have to write more of the multicursor logic so I'm just vibing out the optimizations for a bit I'll get measurements later when the app works more.
 */
function PLAINTEXT_line_lex(div, substart, lineEnd, childIndex) {
    let length = 0;
    let pos = substart;

    let bytes = EDITOR_textByteList.bytes;

    while (pos < lineEnd) {
        length++;
        pos++;
    }

    if (length > 0) {
        let span;
        if (childIndex < div.children.length) {
            span = div.children[childIndex++];
            span.className = '';
        }
        else {
            span = document.createElement('span');
            div.appendChild(span);
            childIndex++;
        }
        span.textContent = EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(substart, substart + length));
    }

    return childIndex;
}


/*
10:50 AM
11:50 PM?

// ran app
// Opened editorGlobal.js
// I think I scrolled around or something
//
// Heap Snapshot 1 (5.1 MB)
// 

598 kB Code
854 kB Strings
9 kB JS arrays
560 kB Typed arrays
377 kB System objects
1,109 kB Other JS objects
1,570 kB Other non-JS objects (such as HTML and CSS)
5,077 kB Total

// scrolling and occassionally stopping to allow syntax throttle debounce then go back to scrolling again

756 kB Code
927 kB Strings
21 kB JS arrays
560 kB Typed arrays
385 kB System objects
1,214 kB Other JS objects
5,339 kB Other non-JS objects (such as HTML and CSS)
9,202 kB Total

// scrolling and occassionally stopping to allow syntax throttle debounce then go back to scrolling again

662 kB Code
927 kB Strings
21 kB JS arrays
560 kB Typed arrays
385 kB System objects
1,216 kB Other JS objects
15,593 kB Other non-JS objects (such as HTML and CSS)
19,365 kB Total

// scrolling and occassionally stopping to allow syntax throttle debounce then go back to scrolling again

799 kB Code
927 kB Strings
23 kB JS arrays
560 kB Typed arrays
385 kB System objects
1,220 kB Other JS objects
22,842 kB Other non-JS objects (such as HTML and CSS)
26,757 kB Total

I gave the numbers to Google AI and from 2 to 3 it says:
"Other JS Objects (1,216 kB vs 1,214 kB): A negligible increase of just 2 kB.".
Always make sure you read clearly what the AI says lol

nvm I'm a clown

I thought 1,216 was the older value.
always double check the data or something to figure out if the before picture is the after picture or something*


That's so weird it's like every dom element that I make NEVER gets cleaned up by GC.

- The AI is recommending virtual scrolling so I don't render thousands of lines.
- And that I re-use dom nodes

So since or maybe I'm doing them wrong

I'll have to think this through while I eat a lb of 98% lean ground chicken real quick

====================================

9:00 AM

I need to determine more specifically where the issue is.
It might be in the:
- synchronous scrolling
- debounced syntax highlighting
- some mixture of both (determine the % contribution of each)s

There will come a day where you lose everything.
And you need to prepared for it.
Short term comfort, feeling cozy...
Mix this with, but how do I enjoy life with that mindset.
But the best way to learn is through daily purposeful fatigue.
Because your rate of learning is time gated via various factors such as sleep and energy.
If you practice daily with intent to be better.
You will be ready for whatever comes.
If you live with your parents, at any moment they can die.
And you should absolutely have this in the back of your mind.
Everything in your life can be turned upside down at any moment.
That's why you must feel an immense sense of daily anxiety and panic until you've sufficiently fatigued yourself.
Only then can you feel that comfort. It is a necessity it is a good thing.

I can see the 'Other non-JS object (such as HTML and CSS)' is growing even when I comment out the debounced syntax highlighting function invocation.
Scroll wheel seems more problematic at than clicking and dragging the scrollbar.

It isn't about being in constant panic it is about feeling the consequences of your inaction prior to the moment where it becomes mandatory for you to act.
Thus you have no choice but to stay ahead of things because you have some degree of a "I have an assignment due tomorrow and I haven't even started it yet" type panic every morning.
And so you get it done, then you're free to do whatever you want for the rest of the day. If you wanna sit there and watch paint dry after you learned something for the day then umm... idk that sounds like a bad idea
because every experience you engage in has some lesson involved that you can then go on to apply in places that have some career value.
Like if Billy went fishing with his dad when he was very young and had to count up the fish he caught then he was in math class and getting A's on all the addition tests.

PerformanceEventTiming causing extremely skewed heap snapshots?

// { once: true } is massive for the events that I make in order to remove UI

// That being said I'm allocating 307 {once, capture} objects seemingly from scrolling?

- {once, capture} 
- "material-node-height"
- 8,131 PerformanceEventTiming...

AI recommends:
- Protect It with a RequestAnimationFrame Throttle
- a simple text caching layer

"To determine if a scroll event is the leading edge (the very first movement) or the trailing edge (the final rest point)
without using raw timeouts that block garbage collection, you can use a clean, flag-based debouncer."

// 11,169 PerformanceEventTiming allocations :3

1. Implement Strict Text Caching (Stop Unnecessary Decoding)
- In your loop, you execute EDITOR_decoder.decode(EDITOR_textByteList.bytes.subarray(lineStart, lineEnd))
  and immediately apply it to the span.textContent.Even if you scroll by a single pixel and the text line content remains completely unchanged,
  updating textContent with a freshly decoded string causes the browser to clear the text sub-tree, compute the content bounds, and register a layout shift event timing record.
  You can eliminate over 90% of these allocations by checking if the content has actually changed before touching the DOM:
2. Swap translateY for Grid Position or Absolute Top Layouts
- Your code alters element coordinates via transform = 'translateY(' + vertical + 'px)'.
  While transforms bypass browser reflow operations,
  shifting thousands of translated layers across a large virtual viewport forces the compositing engine to continuously append individual
  performance marker frames.Because this is a virtual scroller for an editor, you can completely sidestep dynamic transform calculations.
  Position your line container elements using standard CSS absolute top values tied directly to their absolute virtual index positions,
  or leverage a fixed layout grid.

I referenced:
    '1. Implement Strict Text Caching (Stop Unnecessary Decoding)'
    and said "The text editor only generates text for the lines that newly came into view. Would this be quite as effective given this information?"

No, adding that check will not be effective if you are already isolating your logic to only touch lines that newly came into view.
If your code already filters out the rows currently resting inside the viewport and only fires for the raw "new additions,"
the text content is guaranteed to be different anyway. That means your code is already doing the heavy lifting of avoiding redundant DOM writes.

The Real Cause: Why 11,169 Records Exist:
Since you already optimized the row generation, those 11,169 PerformanceEventTiming entries are being triggered by Browser Layout Thrashing
within those newly added rows.

Even though you are only appending or updating a small handful of rows per scroll tick,
your loop does two things simultaneously that force the browser to log a performance event record every single time:

```javascript
// 1. You write a dynamic structural style change
gutter.style.transform = transform;
div.style.transform = transform;

// 2. You immediately write a layout-changing text string right next to it
gutter.textContent = indexLine + 1;
span.textContent = textContent;
```

"
Use visibility: hidden during updates: Before altering the transform and textContent of your recycled row elements,
set their style to visibility: hidden. Once all properties are updated, turn them back to visibility: visible.
This tells the engine to skip intermediate layout tracking metrics while the row is being modified.
"

I referenced:
    '2. Swap translateY for Grid Position or Absolute Top Layouts'
    and said "But how would I keep GPU accelaration?"

You can maintain full hardware (GPU) acceleration while using absolute positioning by pairing top with the
will-change: transform or transform: translateZ(0) CSS properties.
This technique gives you the best of both worlds: it keeps your layout nodes isolated for smooth rendering,
while forcing the browser to promote each line container to its own independent GPU layer.

So anyways I was like:
"The gutter is made up of a div which contains all of the line numbers, where each line number is a div of its own within that parent... I have more information after you read this"

And then they said:
"
Got it. That means your text editor uses a dual-column layout: one parent container for the line number gutter, and a separate parallel container for the text lines.
Each row inside the gutter is an individual child div.When scrolling, your loop syncs these columns by updating the transform and textContent of the gutter child nodes
and text child nodes at the exact same index (beltIndexLine).I have read and noted this structure. Please share the rest of the information!
"

GASP I cannot believe they said that

I said:
"
The gutter has a different background color than the lines of text.
I worried that applying a background color to multiple elements would be less optimized than if I were to apply that background color to a single element.
Thus, the gutter elements do not actually create the gutter background color.
I have a separate div entirely from the dual-column layout,
this separate div draws the background color of the gutter by having its height equal to the editor,
the width equal to the longest line number's width,
and the top equal to the scrollTop.
"

"
That background element approach is highly creative,
but it is actually the direct cause of your remaining PerformanceEventTiming allocations and the virtual scroll ghosting!By setting the background element's top equal to
scrollTop inside the scroll event, you are mixing two completely different layout systems: GPU composite rendering (the translated lines) and CPU layout thrashing
(the absolute top background).
"


hmm

"Modulo Ring Buffer Placement pattern"

Wait what? I had no idea 'display: contents' had so much value

I asked:
If I wanted to have a simple parent container that solely grouped the individual children (which is the intent of what I'm currently doing).
Is there a way I achieve this without worrying about the parent container's visual bounding box?
I don't need the parent to do anything other than group the elements.

It said:
Yes, you can achieve this by using the CSS property display: contents on your parent container.
|
This tells the browser's layout engine to completely ignore the parent container’s visual bounding box, margins, padding, and size constraints.
The container becomes visually "invisible" to the rendering engine, while still acting as a clean grouping mechanism in your JavaScript code.

The Alternative: Absolute Layer Isolation
If display: contents disrupts your absolute positioning hierarchy (since absolute children look for the nearest parent with position: relative/absolute),
the alternative is to leave the parent container as a standard block but completely isolate its rendering footprint using CSS containment.


"When using translateY is the 'top' issue still a thing?":
No, the "top" issue is completely gone when you use translateY.When you mutate the CSS top property,
the browser is forced to run a full CPU layout calculation because top affects the actual geometry of the document.
Conversely, translateY is treated as a visual-only paint effect handled by the GPU compositor.
*/
