/**
 * This value ought to be an int (no decimal places) due to its high frequency usage in drawing UI,
 * and visually this having decimal places being of little to no value to the user when you could just ceil whatever height measurement you get.
 * 
 * TODO: (speculation) I've never liked saying "line height" I believe that deals with the vertical alignment of text within some container is "line height" a good wording.
 * */
let APP_lineHeight = 20;

init();

function APP_measureLineHeightAndCharacterWidth() {
    const measureElement = document.createElement('div');
    measureElement.textContent = "0";
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
    document.body.appendChild(wrapper);

    APP_lineHeight = Math.ceil(measureElement.getBoundingClientRect().height);

    // This permits me to in 'explorer.js' set the first span of every "tree-view-node" to be the same width, regardless of whether its content is '-', '+', or '' (an empty string).
    // In theory this width calculation and 'APP_lineHeight' can be done at the same time. But combining the steps could result in confusion or unexpected side effects when trying to modify lineheight or width but then again they do rely on the same css styling so you're already doing this
    measureElement.textContent = "-";
    const minusWidth = Math.ceil(measureElement.getBoundingClientRect().width);
    measureElement.textContent = "+";
    const plusWidth = Math.ceil(measureElement.getBoundingClientRect().width);
    const largerWidth = minusWidth > plusWidth ? minusWidth : plusWidth; // 11
    EXPLORER_firstSpanWidthValue = largerWidth;
    EXPLORER_firstSpanWidth = EXPLORER_firstSpanWidthValue + 'px';

    wrapper.removeChild(measureElement);
    document.body.removeChild(wrapper);

    const root = document.documentElement;
    const computedStyles = window.getComputedStyle(root);
    const appLineHeight = APP_lineHeight + 'px';
    const propertyName = '--APP-line-height';
    if (computedStyles.getPropertyValue(propertyName) !== appLineHeight) {
        root.style.setProperty(propertyName, appLineHeight);
    }
}

function init() {
    document
        .getElementById('HEADER_buttonSettings')
        .addEventListener('click', HEADER_buttonSettings_onClick);

    window.myAPI.onMessage(window_myAPI_onMessage);

    APP_measureLineHeightAndCharacterWidth();

    const EDITOR_gotoF_button = document.getElementById('EDITOR_gotoF');
    EDITOR_gotoF_button.addEventListener('click', window.myAPI.editorDocumentSymbolsRequest);
    document.body.addEventListener('keydown', documentBody_onKeyDown, /*useCapture*/ true);

    EXPLORER_init();
    EDITOR_init();
}

async function window_myAPI_onMessage(data) {
    EDITOR_documentSymbolResult = data;
    if (!EDITOR_listComponent) {
        EDITOR_listComponent = new ListComponent();
    }
    EDITOR_listComponent.setItems(APP_lineHeight, APP_lineHeight + 'px',
        EDITOR_listComponent_drawItemAction,
        EDITOR_listComponent_onkeydownAction,
        EDITOR_listComponent_getItemsCountFunc);
    return DIALOG_show_async(get_DialogKind_DocumentSymbol(), dialog_documentSymbol_onResizeAction);
}

function EDITOR_listComponent_getItemsCountFunc() {
    if (EDITOR_documentSymbolResult) {
        return EDITOR_documentSymbolResult.length;
    }
    else {
        return 0;
    }
}

function EDITOR_listComponent_onkeydownAction(div, index) {
    if (index === -1) {
        // TODO: if (index === -1)
    }
    else {
        // TODO: Ensure that json parsing the title like this is a safe way of doing things
        const startPosition = JSON.parse(div.title);
        EDITOR_moveCursor_indexLine_indexColumn(startPosition.line, startPosition.character);
    }
}

function EDITOR_listComponent_drawItemAction(div, index) {
    if (index === -1) {
        div.textContent = '';
        div.title = '';
        div.style.display = 'none';
    }
    else {
        let item = EDITOR_documentSymbolResult[index];
        div.textContent = item.name;
        div.title = JSON.stringify(item.range.start);
        div.style.display = '';
    }
}

function dialog_documentSymbol_onResizeAction() {
    if (EDITOR_listComponent) {
        EDITOR_listComponent.boundingClientRect = null;
        EDITOR_listComponent.event_scroll();
    }
}

async function documentBody_onKeyDown(event) {
    switch (event.key) {
        case 's':
        case 'S':
            if (!event.ctrlKey) return;
            const unvalidatedAbsolutePath = EDITOR_textSourceIdentifier;
            const rawData = EDITOR_getFinalizedEditsAndRawSaveFileData();
            if (rawData.uint8arrayTextBytes) {
                event.preventDefault();
                event.stopPropagation();
                return window.myAPI.editorSaveFile(unvalidatedAbsolutePath, rawData.uint8arrayTextBytes, rawData.countOfBytesInUse, rawData.lineEndString, rawData.fileStartsWithBom);
            }
            return;
        case 'F':
            if (!event.ctrlKey) return;
            return DIALOG_show_async(get_DialogKind_FindAll());
        case 'Escape':
            // TODO: Provide a way to disable the next (body, and useCapture) 'Escape' keypress...
            // ...so a widget can restore focus to the relevant UI rather than
            // the 'EDITOR' when the user presses 'Escape' to "cancel".
            const editor = document.getElementById('EDITOR');
            if (editor) {
                editor.focus();
            }
            return;
        case 'e':
            if (event.altKey) {
                EXPLORER_setShow(true);
                const EXPLORER_Element = document.getElementById('EXPLORER');
                if (EXPLORER_Element.children.length === 1) {
                    EXPLORER_Element.children[0].focus();
                }
            }
            return;
        case 'E':
            if (event.altKey && event.shiftKey) {
                const editor = document.getElementById('EDITOR');
                if (editor) {
                    editor.focus();
                    EXPLORER_setShow(false);
                }
            }
            return;
        case 'd':
            if (event.altKey) {
                const dialogCloseButton = document.getElementById('DIALOG_closeButton');
                if (dialogCloseButton) {
                    dialogCloseButton.focus();
                }
            }
            return;
        case 'h':
            if (event.altKey) {
                const settingsButton = document.getElementById('HEADER_buttonSettings');
                if (settingsButton) {
                    settingsButton.focus();
                }
            }
            return;
    }
}

async function HEADER_buttonSettings_onClick() {
    return DIALOG_show_async(get_DialogKind_Settings());
}
