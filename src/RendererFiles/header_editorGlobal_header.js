//__#__
// preprocessor.cjs
import "./fieldBuffer"
//__#__

const EDITOR_baseElement = document.getElementById('EDITOR');

const get_EDITOR_virtualization_horizontal = () => EDITOR_baseElement.children[0];
const get_EDITOR_virtualization_vertical = () => EDITOR_baseElement.children[1];
const get_EDITOR_gutter = () => EDITOR_baseElement.children[4];
const get_EDITOR_horizontal_scrollbar = () => EDITOR_baseElement.children[2].children[0];
const get_EDITOR_horizontal_scrollbar_virtualization_boundary = () => EDITOR_baseElement.children[2].children[0].children[0];
const get_EDITOR_body = () => EDITOR_baseElement.children[5];
const get_EDITOR_presentation = () => EDITOR_baseElement.children[5].children[0];
const get_EDITOR_cursorListElement = () => EDITOR_baseElement.children[5].children[1];
const get_EDITOR_textElement = () => EDITOR_baseElement.children[5].children[2];

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


