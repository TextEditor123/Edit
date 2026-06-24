const EDITOR_baseElement = document.getElementById('EDITOR');

const get_EDITOR_virtualization_horizontal = () => EDITOR_baseElement.children[0];
const get_EDITOR_virtualization_vertical = () => EDITOR_baseElement.children[1];
const get_EDITOR_gutter = () => EDITOR_baseElement.children[3].children[1];
const get_EDITOR_horizontal_scrollbar = () => EDITOR_baseElement.children[2].children[0];
const get_EDITOR_horizontal_scrollbar_virtualization_boundary = () => EDITOR_baseElement.children[2].children[0].children[0];
const get_EDITOR_body = () => EDITOR_baseElement.children[4];
const get_EDITOR_presentation = () => EDITOR_baseElement.children[4].children[0];
const get_EDITOR_cursorListElement = () => EDITOR_baseElement.children[4].children[1];
const get_EDITOR_textElement = () => EDITOR_baseElement.children[4].children[2];

/**
 * having a boolean be a byte isn't ideal, but most engines store them as either 4bytes or 8bytes
 * 
 * primarily the goal is to remove the variable from the marking phase of gc.
 * because the boolean variable could store anything so the gc still has to check that it still stores a primitive
 * and that takes time albeit a small amount of time.
 * */
const EDITOR_byte_fields = new Uint8Array(16);

/** returns a number, beware '===' */
const get_EDITOR_detailRank = () => EDITOR_byte_fields[0];
const set_EDITOR_detailRank = (byte) => EDITOR_byte_fields[0] = byte;

/** returns a number, beware '===' */
const get_EDITOR_recentBoundingClientRect_isNull_intFalsey = () => EDITOR_byte_fields[1];
const set_EDITOR_recentBoundingClientRect_isNull_intFalsey = (byte) => EDITOR_byte_fields[1] = byte;
set_EDITOR_recentBoundingClientRect_isNull_intFalsey(1);

/** returns a number, beware '===' */
const get_EDITOR_findOverlay_show = () => EDITOR_byte_fields[2];
const set_EDITOR_findOverlay_show = (byte) => EDITOR_byte_fields[2] = byte;

/** returns a number, beware '===' */
const get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = () => EDITOR_byte_fields[3];
const set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching = (byte) => EDITOR_byte_fields[3] = byte;

/** returns a number, beware '===' */
const get_EDITOR_isSourceOfLeftMouseButton = () => EDITOR_byte_fields[4];
const set_EDITOR_isSourceOfLeftMouseButton = (byte) => EDITOR_byte_fields[4] = byte;

/** returns a number, beware '===' */
const get_EDITOR_fileStartsWithBom = () => EDITOR_byte_fields[5];
const set_EDITOR_fileStartsWithBom = (byte) => EDITOR_byte_fields[5] = byte;

/** returns a number, beware '===' */
const get_EDITOR_findOverlay_wasSearched = () => EDITOR_byte_fields[6];
const set_EDITOR_findOverlay_wasSearched = (byte) => EDITOR_byte_fields[6] = byte;

/** returns a number, beware '===' */
const get_EDITOR_findOverlay_options_matchWord = () => EDITOR_byte_fields[7];
const set_EDITOR_findOverlay_options_matchWord = (byte) => EDITOR_byte_fields[7] = byte;

/** returns a number, beware '===' */
const get_EDITOR_onScroll_bool = () => EDITOR_byte_fields[8];
const set_EDITOR_onScroll_bool = (byte) => EDITOR_byte_fields[8] = byte;

const get_EDITOR_ASCII_LINE_FEED = () => EDITOR_byte_fields[9];
EDITOR_byte_fields[9] = 10;

const get_EDITOR_ASCII_TAB = () => EDITOR_byte_fields[10];
EDITOR_byte_fields[10] = 9;

const get_EDITOR_ASCII_SPACE = () => EDITOR_byte_fields[11];
EDITOR_byte_fields[11] = 32;

const EDITOR_tab_tabsbytes = new Uint8Array(4);
EDITOR_tab_tabsbytes[0] = get_EDITOR_ASCII_TAB();
EDITOR_tab_tabsbytes[1] = 0;
EDITOR_tab_tabsbytes[2] = 0;
EDITOR_tab_tabsbytes[3] = 0;
const EDITOR_tab_spacesbytes = new Uint8Array(4);
EDITOR_tab_spacesbytes[0] = get_EDITOR_ASCII_SPACE();
EDITOR_tab_spacesbytes[1] = get_EDITOR_ASCII_SPACE();
EDITOR_tab_spacesbytes[2] = get_EDITOR_ASCII_SPACE();
EDITOR_tab_spacesbytes[3] = get_EDITOR_ASCII_SPACE();

/**
 * If you have an extension listed here, it is expected that the "function to invoke" exists.
 * As of right now any patterns to naming the function that gets invoked are tentative.
 * But I am not checking whether JS_full_lex or JS_line_lex exist, I'm just switching on ExtensionKind and presuming that function exists.
 */
const get_ExtensionKind_None = () => 0;
const get_ExtensionKind_JavaScript = () => 1;

/**
 * DeleteLtr and BackspaceRtl are both forms of removing text,
 * their edits are stored the same (i.e.: both in "the form of a delete" keypress)
 * The kind delete/backspace tells you how to restore the cursor when doing a ctrl+z and etc...?
 */
const get_EditKind_None = () => 0;
const get_EditKind_InsertLtr = () => 1;
const get_EditKind_DeleteLtr = () => 2;
const get_EditKind_BackspaceRtl = () => 3;
const get_EditKind_RemoveTextNoBatching = () => 4;
const get_EditKind_Tab = () => 5;
const get_EditKind_IndentMore = () => 6;
const get_EditKind_IndentLess = () => 7;
const get_EditKind_Enter = () => 8;
const get_EditKind_Paste = () => 9;
const get_EditKind_Duplicate = () => 10;

/**
 * TODO: Long term this likely should be removed and all enter key logic reduced into an insertion but this will help in the time being.
 */
const get_EnterKeyEventKind_None = () => 0;
const get_EnterKeyEventKind_StartOfLine = () => 1;
const get_EnterKeyEventKind_EndOfLine = () => 2;
const get_EnterKeyEventKind_AmongALine = () => 3;
const get_EnterKeyEventKind_FallbackCase = () => 4;

/**
 * Do not change the order/values of these, they are used in equality comparisons, the larger the number says when double clicking between a character and a punctuation
 * whoever has larger number gets selected then the selection continues while the same kind is being read.
 * 
 * TODO: Bug only 1 character selected when punctuation then letterOrDigit click between them the letterOrDigit is more than 1 contiguous only 1 selected.
 */
const get_CharacterKind_None = () => 0;
const get_CharacterKind_Whitespace = () => 1;
const get_CharacterKind_Punctuation = () => 2;
const get_CharacterKind_LetterOrDigit = () => 3;

const EDITOR_int_fields = new Uint32Array(32);

const get_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber = () => EDITOR_int_fields[0];
const set_EDITOR_findOverlay_isBeingShownDueToMultiCursorMatching_originMatchNumber = (int) => EDITOR_int_fields[0] = int;

const get_EDITOR_drawn_count_of_digits_longest_line_number = () => EDITOR_int_fields[1];
const set_EDITOR_drawn_count_of_digits_longest_line_number = (int) => EDITOR_int_fields[1] = int;

const get_EDITOR_lineHeight = () => EDITOR_int_fields[2];
const set_EDITOR_lineHeight = (int) => EDITOR_int_fields[2] = int;
set_EDITOR_lineHeight(20);

const get_EDITOR_detail_smallPosition = () => EDITOR_int_fields[3];
const set_EDITOR_detail_smallPosition = (int) => EDITOR_int_fields[3] = int;

const get_EDITOR_detail_largePosition = () => EDITOR_int_fields[4];
const set_EDITOR_detail_largePosition = (int) => EDITOR_int_fields[4] = int;

const get_EDITOR_detailRank3OriginLine = () => EDITOR_int_fields[5];
const set_EDITOR_detailRank3OriginLine = (int) => EDITOR_int_fields[5] = int;

/**
 * Pixels.
 * 
 * The gutter width changes far more frequently than the line height.
 * That is why the gutter width is a JavaScript variable, and the styles are updated from JavaScript.
 * 
 * Whereas the line height is a css variable (and thus could cause layout for the entire application whenever it changes).
 */
const get_EDITOR_gutterWidthStyleValue = () => EDITOR_int_fields[6];
const set_EDITOR_gutterWidthStyleValue = (int) => EDITOR_int_fields[6] = int;
set_EDITOR_gutterWidthStyleValue(32);

/**
 * This is the sum of the 'get_EDITOR_gutterWidthStyleValue()' in addition to the left and right padding
 */
const get_EDITOR_gutterWidthTotal = () => EDITOR_int_fields[7];
const set_EDITOR_gutterWidthTotal = (int) => EDITOR_int_fields[7] = int;
set_EDITOR_gutterWidthTotal(32);

/** The first line of text that you should see shown in the UI given the current scrollTop */
const get_EDITOR_virtualIndexLine = () => EDITOR_int_fields[8];
const set_EDITOR_virtualIndexLine = (int) => EDITOR_int_fields[8] = int;

const get_EDITOR_virtualCount = () => EDITOR_int_fields[9];
const set_EDITOR_virtualCount = (int) => EDITOR_int_fields[9] = int;

/**
 * Prevent earlier members of a then chain from marking didChangeTextDocumentNotificationPromise to null
 * in order to signify resolved
 * 
 * when meanwhile there is more promises in the .then chain that need to resolve.
 * 
 * prefix increment
 */
const get_ticket_didChangeTextDocumentNotificationPromise = () => EDITOR_int_fields[10];
const set_ticket_didChangeTextDocumentNotificationPromise = (int) => EDITOR_int_fields[10] = int;

const get_didChangeTextDocument_version = () => EDITOR_int_fields[11];
const set_didChangeTextDocument_version = (int) => EDITOR_int_fields[11] = int;

/**
 * All the 'EDITOR_cursorList' loops are currently using the variable 'i'.
 * I'm experimenting with a few of the loops though such that at the start of every loop they set this variable equal to 'i'.
 * Then in any functions like getCharacter, I might be able to contextually find the character much faster.
 * */
const get_EDITOR_indexCursor = () => EDITOR_int_fields[12];
const set_EDITOR_indexCursor = (int) => EDITOR_int_fields[12] = int;

const get_EDITOR_offsetLine = () => EDITOR_int_fields[13];
const set_EDITOR_offsetLine = (int) => EDITOR_int_fields[13] = int;

const get_EDITOR_offsetColumn_withRespectToThisIndexLine = () => EDITOR_int_fields[14];
const set_EDITOR_offsetColumn_withRespectToThisIndexLine = (int) => EDITOR_int_fields[14] = int;

const get_EDITOR_offsetColumn = () => EDITOR_int_fields[15];
const set_EDITOR_offsetColumn = (int) => EDITOR_int_fields[15] = int;

const get_EDITOR_totalShift = () => EDITOR_int_fields[16];
const set_EDITOR_totalShift = (int) => EDITOR_int_fields[16] = int;

const get_EDITOR_offsetWithinSpan = () => EDITOR_int_fields[17];
const set_EDITOR_offsetWithinSpan = (int) => EDITOR_int_fields[17] = int;

const get_EDITOR_ONSCROLLvirtualIndexLine = () => EDITOR_int_fields[18];
const set_EDITOR_ONSCROLLvirtualIndexLine = (int) => EDITOR_int_fields[18] = int;
//throw new Error('-1');
// This set used to be -1 to indicate a non existent value, 500 "seems to work" but a proof of it being an equivalent solution has not thoroughly been thought out, only a sort of "yeah that probably works" kinda vibe.
set_EDITOR_ONSCROLLvirtualIndexLine(500);

const get_EDITOR_ONSCROLLvirtualCount = () => EDITOR_int_fields[19];
const set_EDITOR_ONSCROLLvirtualCount = (int) => EDITOR_int_fields[19] = int;
set_EDITOR_ONSCROLLvirtualCount(0);

const get_EDITOR_ONSCROLLscrollTop = () => EDITOR_int_fields[20];
const set_EDITOR_ONSCROLLscrollTop = (int) => EDITOR_int_fields[20] = int;
//throw new Error('-1');
// This set used to be -1 to indicate a non existent value, 500 "seems to work" but a proof of it being an equivalent solution has not thoroughly been thought out, only a sort of "yeah that probably works" kinda vibe.
set_EDITOR_ONSCROLLscrollTop(500);

const get_EDITOR_longestLine_indexLine = () => EDITOR_int_fields[21];
const set_EDITOR_longestLine_indexLine = (int) => EDITOR_int_fields[21] = int;

const get_EDITOR_longestLine_length = () => EDITOR_int_fields[22];
const set_EDITOR_longestLine_length = (int) => EDITOR_int_fields[22] = int;

/**
 * The get_EDITOR_contentWidth() is calculated via Math.ceil(someVar * otherVar) so this is faster to check whether content width will change rather than the multiplication and ceil.
 */
const get_EDITOR_longestLine_length_PreviousValueWhenLastDrewHorizontalScrollbar = () => EDITOR_int_fields[23];
const set_EDITOR_longestLine_length_PreviousValueWhenLastDrewHorizontalScrollbar = (int) => EDITOR_int_fields[23] = int;

const get_EDITOR_contentWidth = () => EDITOR_int_fields[24];
const set_EDITOR_contentWidth = (int) => EDITOR_int_fields[24] = int;

const get_EDITOR_indent_ORIGINAL_indentBy = () => EDITOR_int_fields[25];
const set_EDITOR_indent_ORIGINAL_indentBy = (int) => EDITOR_int_fields[25] = int;

const get_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine = () => EDITOR_int_fields[26];
const set_EDITOR_indent_SMALL_lineAndColumnIndices_indexLine = (int) => EDITOR_int_fields[26] = int;

const get_EDITOR_indent_startingIndex = () => EDITOR_int_fields[27];
const set_EDITOR_indent_startingIndex = (int) => EDITOR_int_fields[27] = int;

const get_EDITOR_recentBoundingClientRect_left = () => EDITOR_int_fields[28];
const set_EDITOR_recentBoundingClientRect_left = (int) => EDITOR_int_fields[28] = int;

const get_EDITOR_recentBoundingClientRect_top = () => EDITOR_int_fields[29];
const set_EDITOR_recentBoundingClientRect_top = (int) => EDITOR_int_fields[29] = int;

const get_EDITOR_pooledTrackedSyntax_start = () => EDITOR_int_fields[30];
const set_EDITOR_pooledTrackedSyntax_start = (int) => EDITOR_int_fields[30] = int;

const get_EDITOR_pooledTrackedSyntax_length = () => EDITOR_int_fields[31];
const set_EDITOR_pooledTrackedSyntax_length = (int) => EDITOR_int_fields[31] = int;
