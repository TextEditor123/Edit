const get_WidgetKind_None = () => 0;
const get_WidgetKind_InputText = () => 1;
const get_WidgetKind_YesCancel = () => 2;

let WIDGET_currentWidgetKind = get_WidgetKind_None();
/** A delegate of the form: async ({ isCancelled = false, value = '' }) => {}; */
let WIDGET_currentCallback = null;
let WIDGET_restoreFocusToElement = null;
let WIDGET_left = 0;
let WIDGET_top = 0;
let WIDGET_target = null;

// You aren't focusing the widget element itself so blur likely won't work.
//WIDGET_element.addEventListener('focusout', () => WIDGET_hide());

function WIDGET_show(widgetKind, left, top, placeholder, callback) {
    let WIDGET_element = document.getElementById('WIDGET');
    if (WIDGET_currentWidgetKind !== get_WidgetKind_None()) {
        WIDGET_element = null;
        WIDGET_hide(true);
    }

    if (!WIDGET_element) {
        WIDGET_element = document.createElement('div');
        WIDGET_element.id = 'WIDGET';
        document.body.appendChild(WIDGET_element);
    }
    
    WIDGET_left = left;
    WIDGET_top = top;
    WIDGET_restoreFocusToElement = document.activeElement;
    WIDGET_currentWidgetKind = widgetKind;
    WIDGET_currentCallback = callback;

    WIDGET_element.style.left = WIDGET_left + 'px';
    WIDGET_element.style.top = WIDGET_top + 'px';
    WIDGET_element.style.visibility = '';

    switch (widgetKind) {
        case get_WidgetKind_InputText():
            WIDGET_CreateInputText(placeholder);
            break;
        case get_WidgetKind_YesCancel():
            WIDGET_CreateYesCancel(placeholder);
            break;
    }
}

function WIDGET_hide(shouldRestoreFocus) {

    WIDGET_currentCallback = null;

    const WIDGET_element = document.getElementById('WIDGET');

    switch (WIDGET_currentWidgetKind) {
        case get_WidgetKind_InputText():
            let input = document.getElementById('WIDGET_inputText');
            input.removeEventListener('keydown', WIDGET_inputTextOnKeyDown);
            break;
        case get_WidgetKind_YesCancel():
            let yesButtonElement = document.getElementById('WIDGET_YesCancel_yes');
            yesButtonElement.removeEventListener('onclick', WIDGET_YesCancelButtonOnClick_yes);
            let cancelButtonElement = document.getElementById('WIDGET_YesCancel_cancel');
            cancelButtonElement.removeEventListener('onclick', WIDGET_YesCancelButtonOnClick_cancel);
            break;
    }
    WIDGET_element.remove();
    WIDGET_currentWidgetKind = get_WidgetKind_None();
    WIDGET_target = null;
    if (shouldRestoreFocus && WIDGET_restoreFocusToElement)
        WIDGET_restoreFocusToElement.focus();
}

async function WIDGET_inputTextOnKeyDown(event) {
    if (event.key === 'Enter') {
        let input = document.getElementById('WIDGET_inputText');
        if (WIDGET_currentCallback) {
            await WIDGET_currentCallback({
                isCancelled: false,
                value: input.value
            });
        }
        WIDGET_hide(true);
    }
    else if (event.key === 'Escape') {
        let input = document.getElementById('WIDGET_inputText');
        if (WIDGET_currentCallback) {
            await WIDGET_currentCallback({
                isCancelled: true,
                value: input.value
            });
        }
        WIDGET_hide(true);
    }
}

async function WIDGET_YesCancelButtonOnClick_yes(event) {
    if (WIDGET_currentCallback) {
        await WIDGET_currentCallback({
            isCancelled: false,
            value: 'Yes'
        });
    }
    WIDGET_hide(true);
}

async function WIDGET_YesCancelButtonOnClick_cancel(event) {
    if (WIDGET_currentCallback) {
        await WIDGET_currentCallback({
            isCancelled: true,
            value: 'Cancel'
        });
    }
    WIDGET_hide(true);
}

function WIDGET_CreateInputText(placeholder) {

    const WIDGET_element = document.getElementById('WIDGET');

    if (!placeholder)
        placeholder = '';

    let input = document.createElement('input');
    input.type = "text";
    input.placeholder = placeholder;
    input.id = 'WIDGET_inputText';
    input.addEventListener('keydown', WIDGET_inputTextOnKeyDown.bind(this));
    WIDGET_element.appendChild(input);
    input.focus();
}

function WIDGET_CreateYesCancel(placeholder) {

    const WIDGET_element = document.getElementById('WIDGET');

    if (!placeholder)
        placeholder = '';

    let topDivElement = document.createElement('div');
    topDivElement.textContent = placeholder;

    let bottomDivElement = document.createElement('div');
    let yesButtonElement = document.createElement('button');
    yesButtonElement.textContent = 'Yes';
    yesButtonElement.id = 'WIDGET_YesCancel_yes';
    yesButtonElement.addEventListener('click', WIDGET_YesCancelButtonOnClick_yes);
    bottomDivElement.appendChild(yesButtonElement);
    let cancelButtonElement = document.createElement('button');
    cancelButtonElement.textContent = 'Cancel';
    cancelButtonElement.id = 'WIDGET_YesCancel_cancel';
    cancelButtonElement.addEventListener('click', WIDGET_YesCancelButtonOnClick_cancel);
    bottomDivElement.appendChild(cancelButtonElement);

    WIDGET_element.appendChild(topDivElement);
    WIDGET_element.appendChild(bottomDivElement);
    yesButtonElement.focus();
}
