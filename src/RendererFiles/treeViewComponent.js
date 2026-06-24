
/** File contains more than one class (noted only because it doesn't feel obvious that there would be more than one class, this note doesn't exist in every file) */

/** See the "interface TreeViewDirector" towards the bottom of this file */

/**
 * The director maintains a flat optimized list of every element i.e.: represent each element in a uint8array and each one is a byte that maps to the actual.
 * 
 * Then the actual can be a hierarchical datastructure.
 * 
 * You just keep flattening it into a byte array and map back and forth.
 */
class TreeViewComponent {
    constructor(itemHeight) {
        this.rootElement = document.createElement('div');
        this.rootElement.classList.add('TREEVIEW', 'unselectable');
        this.rootElement.tabIndex = 0;
        this.rootElement.style.height = '100%';

        this.virtualizationElement = document.createElement('div');
        this.virtualizationElement.className = 'TREEVIEW_virtualization';
        this.rootElement.appendChild(this.virtualizationElement);

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorElement = document.createElement('div');
        this.cursorElement.className = 'TREEVIEW_cursor';
        this.rootElement.appendChild(this.cursorElement);

        this.itemListElement = document.createElement('div');
        this.itemListElement.className = 'TREEVIEW_itemList';
        this.rootElement.appendChild(this.itemListElement);

        this.itemHeightTotal = 0;

        /** Consider the existence of such methods as 'state_cursor_setIndex' before mutating state directly */
        this.cursorIndex = 0;

        this._ONSCROLLscrollTop = 0;
        this._ONSCROLLvirtualIndex = 0;
        this._ONSCROLLvirtualCount = 0;
        
        this.event_scroll_async_timer = null;
        this.event_scroll_async_bool = null;

        this.beltIndexZero = 0;
    }

    /**
     * @param {*} director interface TreeViewDirectory { director.drawItem(divItem, indexItem), director.onkeydown(this.itemListElement.children[relativeIndex], this.cursorIndex, this.items[this.cursorIndex]); }
     * @param {*} itemHeightNumber '50'; cursorTop = currentIndex * itemHeightNumber;
     * @param {*} itemHeightStyleAttributeValueString '50px'; div.style.height = itemHeightStyleAttributeValueString;
     */
    setItems(director, itemHeightNumber, itemHeightStyleAttributeValueString) {
        this.itemListElement.innerHTML = '';
        this.virtualizationElement.style.height = 1 + 'px';
        this.state_cursor_setIndex(0);
        
        this.director = director;
        this.itemHeightNumber = itemHeightNumber;
        this.itemHeightStyleAttributeValueString = itemHeightStyleAttributeValueString;

        this.cursorElement.style.height = this.itemHeightStyleAttributeValueString;
        this.itemHeightTotal = this.director.tvd_getTotalCount() * this.itemHeightNumber;
        this.virtualizationElement.style.height = this.itemHeightTotal + 'px';
        this.boundingClientRect = null;
    }

    /**
     * if (this.rootElement.parentElement) { await this.draw_render_fullReset_async(); return; }
     * Because the "list" is already drawn somewhere and 'draw_delete()' needs to be invoked prior to drawing at a different location.
     * 
     * @param {HTMLElement} parentElement 
     * @param {*} insertBeforeThisChild (if falsey, the list UI is appended to the parent element)
     */
    async draw_create_async(parentElement, insertBeforeThisChild) {
        if (this.rootElement.parentElement) {
            // It is the case that I invoke 'draw_create_async' when creating the tree view for the first time.
            // But I also do this when I re-open the os input file dialog and pick either a separate or the same folder.
            // In this scenario having this invoke a "fullReset" is necessary otherwise nothing appears in the treeview.
            //
            // TODO: but, perhaps this is best left to the consumer of the TreeViewComponent to invoke themselves...
            // ...in such a scenario. Until further decision is made I'll have the invocation here.
            return this.draw_render_fullReset_async();
        }
        parentElement.insertBefore(this.rootElement, insertBeforeThisChild);
        this.draw_addEvents();
        return this.draw_render_async();
    }

    /**
     * if (!this.rootElement.parentElement) return;
     * Because the "list" is not drawn, no UI needs to be removed.
     * (the purpose of this method is more-so related to unsubscribing of events and other such non-automatic actions that need to be performed)
     * 
     * @returns 
     */
    draw_delete() {
        if (!this.rootElement.parentElement) return;
        this.draw_removeEvents();
        this.boundingClientRect = null;
        this.rootElement.parentElement.removeChild(this.rootElement);
    }

    draw_addEvents() {
        this.rootElement.addEventListener('click', this);
        this.rootElement.addEventListener('keydown', this);
        this.rootElement.addEventListener('scroll', this);
        this.rootElement.addEventListener('dblclick', this);
        this.rootElement.addEventListener('contextmenu', this);
        window.addEventListener('resize', this);
    }
    
    draw_removeEvents() {
        this.rootElement.removeEventListener('click', this);
        this.rootElement.removeEventListener('keydown', this);
        this.rootElement.removeEventListener('scroll', this);
        this.rootElement.addEventListener('dblclick', this);
        this.rootElement.addEventListener('contextmenu', this);
        window.removeEventListener('resize', this);
    }

    // The browser automatically looks for this exact method name
    handleEvent(event) {
        switch (event.type) {
            case 'click':
                this.event_click(event);
                break;
            case 'keydown':
                this.event_keydown(event);
                break;
            case 'scroll':
                this.event_scroll_async_WRAPIT();
                break;
            case 'dblclick':
                this.event_dblclick(event);
                break;
            case 'contextmenu':
                this.event_contextmenu(event);
                break;
            case 'resize':
                this.event_windowResize();
                break;
        }
    }

    async draw_render_async() {
        if (!this.boundingClientRect) {
            this.ensure_boundingClientRect();
        }

        if (this.itemListElement.children.length !== this.virtualCount) {
            return this.draw_render_fullReset_async();
        }
        else {
            this.virtualIndex_ofScrollTop = Math.floor(this.rootElement.scrollTop / this.itemHeightNumber);

            if (this._ONSCROLLscrollTop === this.rootElement.scrollTop &&
                this._ONSCROLLvirtualIndex === this.virtualIndex_ofScrollTop &&
                this._ONSCROLLvirtualCount === this.virtualCount) {
                    return;
            }

            this._ONSCROLLscrollTop = this.rootElement.scrollTop;

            // If I delay setting 'this._ONSCROLLvirtualIndex' then I can just use that.
            // I can't bear to do that right now though. I'm just gonna make this variable.
            let prevVli = this._ONSCROLLvirtualIndex;
            let currVli = this.virtualIndex_ofScrollTop;

            this._ONSCROLLvirtualIndex = this.virtualIndex_ofScrollTop;

            if (this._ONSCROLLvirtualCount === this.virtualCount &&
                this.itemListElement.children.length === this.virtualCount) {

                // The same count of lines is on the UI so you can probably
                // redraw them one by one and save "some" of the existing HTML.

                let diff = currVli - prevVli;

                let totalCount = this.director.tvd_getTotalCount();

                if (diff > 0 && diff < this.virtualCount) {
                    return this.director.tvd_drawItem_BATCH_async(prevVli + this._ONSCROLLvirtualCount, diff, 1);
                }
                else if (diff < 0 && (diff *= -1) < this.virtualCount) {
                    return this.director.tvd_drawItem_BATCH_async(currVli, diff, 2);
                }
                else {
                    return this.director.tvd_drawItem_BATCH_async(this.virtualIndex_ofScrollTop, this.virtualCount, 3);
                }
            }
        }
    }

    /**
     * This actually only gets invoked if 'this.itemListElement.children.length !== this.virtualCount'...
     * ...But it is a bit more complicated if you want to involve a change to totalCount, you'd need to force the final 'else' case
     * so it is easier to just invoke this directly when you change totalCount?
     */
    async draw_render_fullReset_async() {

        this._ONSCROLLvirtualCount = this.virtualCount;

        this.virtualIndex_ofScrollTop = Math.floor(this.rootElement.scrollTop / this.itemHeightNumber);
        this.beltIndexZero = 0;
        let verticalStyleNumber = this.virtualIndex_ofScrollTop * this.itemHeightNumber;

        let totalCount = this.director.tvd_getTotalCount();

        if (this.itemListElement.children.length !== this.virtualCount) {
            this.itemListElement.innerHTML = '';

            // this is zero'd, could use change for clarity of algorithm and match patterns but focus elsewhere first
            for (let i = 0; i < this.virtualCount; i++) {
                
                let divItem = document.createElement('div');
                divItem.style.height = this.itemHeightStyleAttributeValueString;
                divItem.style.whiteSpace = 'nowrap';
                divItem.style.position = 'absolute';
                this.itemListElement.appendChild(divItem);
    
                let iconSpan = document.createElement('span');
                iconSpan.style.width = EXPLORER_firstSpanWidth;
                iconSpan.style.display = 'inline-block';
                // TODO: Consider what differences if any exist between the '' iconSpan having an empty height of 0 when left unset, versus if you were to set it to 1px, does this matter? It doesn't seem to impact the "horizontal" space being taken.
                divItem.appendChild(iconSpan);
                divItem.appendChild(document.createTextNode(i));
            }
        }

        // TODO: This if statement check is awkward because the previous if statement ought to have guaranteed this one to be true.
        if (this.itemListElement.children.length === this.virtualCount) {
            return this.director.tvd_drawItem_BATCH_async(this.virtualIndex_ofScrollTop, this.virtualCount, 3);
        }
    }

    /**
     * TODO: To detect whether the "expand/collapse icon" was clicked, the logic 'if(event.target === nodeElement.children[0])' is used...
     * ...this logic is flawed if one ever were to put an element within the span that became the target...
     * ...thus, you should consider checking the x position of the event against the x position of the nodeElement.children[0].
     * @param {*} event 
     */
    async event_click(event) {
        this.ensure_boundingClientRect();

        let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;
        let index = Math.floor(rY / this.itemHeightNumber);
        index = this.state_cursor_validateIndex(index);

        let matchedIndex = this.indexItemTo_beltIndexItem(index);
        if (matchedIndex < 0) {
            return;
        }
        let divItem = this.itemListElement.children[matchedIndex];

        if (event.target === divItem.children[0]) {
            return this.director.tvd_expandCollapseIconWasClicked_async(divItem, index);
        }
        else {
            this.state_cursor_setIndex(index);
        }
    }

    async event_dblclick(event) {
        this.ensure_boundingClientRect();

        let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;
        let index = Math.floor(rY / this.itemHeightNumber);
        index = this.state_cursor_validateIndex(index);

        let matchedIndex = this.indexItemTo_beltIndexItem(index);
        if (matchedIndex < 0) {
            return;
        }

        let divItem = this.itemListElement.children[matchedIndex];

        if (event.target === divItem.children[0]) {
            // ignore because:
            // await this.director.tvd_expandCollapseIconWasClicked_async(divItem, index);
        }
        else {
            let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
            if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                return this.director.tvd_ondblclick_async(this.itemListElement.children[matchedIndex], this.cursorIndex);
            }
        }
    }

    async event_contextmenu(event) {
        this.ensure_boundingClientRect();

        if (event.button === 2) {
            let rY = event.clientY - this.boundingClientRect.top + this.rootElement.scrollTop;

            this.state_cursor_setIndex(this.state_cursor_validateIndex(
                Math.floor(rY / this.itemHeightNumber)));

            // TODO: you need to move this above the divItem assignment and do checks earlier... double check all other uses
            let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
            if (matchedIndex < 0) {
                return;
            }

            if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                return this.director.tvd_oncontextmenu_async(this.itemListElement.children[matchedIndex], this.cursorIndex, event, matchedIndex);
            }
        } else {
            if (this.cursorIndex >= this.director.tvd_getTotalCount()) {
                return;
            }

            this.state_cursor_setIndex(this.state_cursor_validateIndex(
                this.cursorIndex));
            
            let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
            if (matchedIndex < 0) {
                return;
            }

            // TODO: Handle context menu with keyboard when active node is out of view
            if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                return this.director.tvd_oncontextmenu_async(this.itemListElement.children[matchedIndex], this.cursorIndex, event, matchedIndex);
            }
        }
    }

    async event_keydown(event) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (event.ctrlKey) {
                    this.rootElement.scrollBy(0, this.itemHeightNumber);
                }
                else {
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex + 1));
                }
                return;
            case 'ArrowUp':
                event.preventDefault();
                if (event.ctrlKey) {
                    this.rootElement.scrollBy(0, -1 * this.itemHeightNumber);
                }
                else {
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex - 1));
                }
                return;
            case 'ArrowRight':
                if (!event.ctrlKey) { // If holding ctrl, don't preventDefault so the user can scroll horizontally?
                    event.preventDefault();
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex));
                    // TODO: 'ArrowRight' when the cursor is on a valid item but isn't part of the virtualization result.
                    let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
                    if (matchedIndex < 0) {
                        return;
                    }
                    if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                        return this.director.tvd_arrowRight_async(this.itemListElement.children[matchedIndex], this.cursorIndex);
                    }
                }
                return;
            case 'ArrowLeft':
            	if (!event.ctrlKey) { // If holding ctrl, don't preventDefault so the user can scroll horizontally?
                    event.preventDefault();
                    this.state_cursor_setIndex(this.state_cursor_validateIndex(
                        this.cursorIndex));
                    let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
                    if (matchedIndex < 0) {
                        return;
                    }
                    if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                        return this.director.tvd_arrowLeft_async(this.itemListElement.children[matchedIndex], this.cursorIndex);
                    }
                }
            	return;
            case ' ':
            case 'Enter':
                event.preventDefault();
                this.state_cursor_setIndex(this.state_cursor_validateIndex(
                    this.cursorIndex));
                let matchedIndex = this.indexItemTo_beltIndexItem(this.cursorIndex);
                if (matchedIndex < 0) {
                    return;
                }
                if (matchedIndex >= 0 && matchedIndex < this.itemListElement.children.length) {
                    return this.director.tvd_onkeydown_async(this.itemListElement.children[matchedIndex], this.cursorIndex, event.key);
                }
                return;
        }
    }

    /**
     * TODO: intra-app resizes or movements will also invoke this; i.e.: if a list is shown in a dialog and the dialog is resized or moved.
     */
    event_windowResize() {
        this.boundingClientRect = null;
    }

    async event_scroll_async_WRAPIT() {
        this.event_scroll_async_bool = true;
	    if (!this.event_scroll_async_timer) {
            // TODO: Consider trying setTimeout before the await?
	    	await this.event_scroll_async();
	        this.event_scroll_async_timer = setTimeout(this.event_scroll_async_timeoutFunc, 100, this);
	    }
    }
    
    async event_scroll_async_timeoutFunc(context) {
        if (/*trailing && lastArgs*/ context.event_scroll_async_bool) {
            context.event_scroll_async_bool = false; // This should be set to false immediately due to async logic; and any synchronous throttles should follow the pattern for consistency... unless they are passing the variable to the function being throttled...
            await context.event_scroll_async();
            context.event_scroll_async_timer = setTimeout(context.event_scroll_async_timeoutFunc, 100, context);
        } else {
            context.event_scroll_async_timer = null;
        }
    }

	/**
	 * TODO: this should probably return the invocation rather than awaiting?...
	 * ...but take care to consider whether any oddities will occur with setTimeout and async whether you've awaited here or not.
	*/
    async event_scroll_async() {
        return this.draw_render_async();
    }

    ensure_boundingClientRect() {
        if (!this.boundingClientRect) {
            this.boundingClientRect = this.rootElement.getBoundingClientRect();
            this.virtualCount = Math.ceil(this.rootElement.offsetHeight / this.itemHeightNumber);
        }
    }

    /**
     * if (this.cursorIndex === index) return;
     * 
     * @param {*} index 
     */
    state_cursor_setIndex(index) {
        if (this.cursorIndex === index) return;

        this.cursorIndex = index;
        this.cursorTranslateYNumber = this.cursorIndex * this.itemHeightNumber;
        this.cursorElement.style.transform = `translateY(${this.cursorTranslateYNumber}px)`;

        this.ensure_boundingClientRect();

        if (this.cursorTranslateYNumber + (2 * this.itemHeightNumber) > this.rootElement.scrollTop + this.boundingClientRect.height) {
            let currentBottom = this.rootElement.scrollTop + this.boundingClientRect.height;
            let changeToMakeBottomTouch = this.cursorTranslateYNumber - currentBottom;
            let entireValueToScrollBy = changeToMakeBottomTouch + (2 * this.itemHeightNumber);
            this.rootElement.scrollBy(0, entireValueToScrollBy);
        }
        else if (this.cursorTranslateYNumber < this.rootElement.scrollTop) {
            this.rootElement.scrollBy(0, this.cursorTranslateYNumber - this.rootElement.scrollTop);
        }
    }

    /**
     * if (this.cursorIndex === index) return;
     * 
     * @param {*} index 
     */
    state_cursor_validateIndex(index) {
        if (index >= this.director.tvd_getTotalCount()) {
            index = this.director.tvd_getTotalCount() - 1;
        }
        if (index < 0) {
            index = 0;
        }
        return index;
    }

    /**
     * TODO: It should be >= ?
     * 
     * @returns you capture the variable then check it for < 0 (or the opposite '>=') i.e. => if (indexLine_VirtualRelative < 0) { return bad_state; } else { return good_state; }
     */
    indexItemTo_beltIndexItem(indexItem) {
        let unmatchedIndexItem = indexItem - this.virtualIndex_ofScrollTop;
        // TODO: You don't check the data, you just check whether an HTML element exists that could receive UI to render. Probably need to remove 'unmatchedIndexItem >= this.director.tvd_getTotalCount() ||'
        return unmatchedIndexItem >= this.director.tvd_getTotalCount() ||
               unmatchedIndexItem >= this.itemListElement.children.length ||
               unmatchedIndexItem < 0
                   ? -1
                   : ((unmatchedIndexItem = (unmatchedIndexItem + this.beltIndexZero)) > this.virtualCount
                       ? unmatchedIndexItem - this.virtualCount
                       : unmatchedIndexItem);
    }
}

const get_TreeViewNodeKind_None = () => 0;
const get_TreeViewNodeKind_isExpandable_isExpanded = () => 1;
const get_TreeViewNodeKind_isExpandable_NOTisExpanded = () => 2;
const get_TreeViewNodeKind_NOTisExpandable_isExpanded = () => 3;
const get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded = () => 4;

class TreeViewNodeList {
    data_literal;
    capacity_literal;

    capacity_abstract;
    count_abstract = 0;

    // Storing the nodeKind as an int32 isn't the most ideal thing in the world.
    // Previously the ints were being grouped via a class instance.
    // So this still ought to be better than what was done previously.
    field_count = 3;
    // this.nodeKind = nodeKind;
    // this.key = key;
    // this.depth = depth;

    nodeKind_offset = 0;
    key_offset = 1;
    depth_offset = 2;

    constructor(initialCapacity_abstract) {
        let temp_capacity_literal = initialCapacity_abstract * this.field_count;

        this.data_literal = new Uint32Array(temp_capacity_literal);
        this.capacity_abstract = initialCapacity_abstract;
        this.capacity_literal = temp_capacity_literal;

        this.count_abstract = 0;
    }

    /**
     * Does not clear the information, only sets 'this.count' to '0'.
     */
    clear() {
        this.count_abstract = 0;
    }

    /**
     * 
     * @param {TreeViewNode} trackedSyntax a place to read the data into, since it is stored as just int32 data (not the class)
     * @returns {TrackedSyntax}
     */
    getElementAt(index_abstract) {
        let index_literal = index_abstract * this.field_count;
        TreeView_pooledNode_nodeKind = this.data_literal[index_literal + this.nodeKind_offset];
        TreeView_pooledNode_key = this.data_literal[index_literal + this.key_offset];
        TreeView_pooledNode_depth = this.data_literal[index_literal + this.depth_offset];
    }

    getKey(index_abstract) {
        return this.data_literal[(index_abstract * this.field_count) + this.key_offset];
    }

    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} key 
     */
    setKey(index_abstract, key) {
        this.data_literal[(index_abstract * this.field_count) + this.key_offset] = key;
    }
    
    getDepth(index_abstract) {
        return this.data_literal[(index_abstract * this.field_count) + this.depth_offset];
    }
    
    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} depth 
     */
    setDepth(index_abstract, depth) {
        this.data_literal[(index_abstract * this.field_count) + this.depth_offset] = depth;
    }
    
    /**
     * TODO: This function has the 'index_abstract' as the first parameter,
     * meanwhile 'getElementAt(...)' takes this as second parameter.
     * A decision on a consistent position needs to be made.
     * @param {number} index_abstract 
     * @param {number} nodeKind 
     */
    setNodeKind(index_abstract, nodeKind) {
        this.data_literal[(index_abstract * this.field_count) + this.nodeKind_offset] = nodeKind;
    }

    insert(index_abstract, nodeKind, key, depth) {
        this.ensureCapacityForInsertion(index_abstract, 1);

        let index_literal = index_abstract * this.field_count;

        if (index_abstract !== this.count_abstract) {
            this.copyTo(this.data_literal, index_abstract, this.data_literal, index_abstract + 1, this.count_abstract - index_abstract);
        }

        this.data_literal[index_literal + this.nodeKind_offset] = nodeKind;
        this.data_literal[index_literal + this.key_offset] = key;
        this.data_literal[index_literal + this.depth_offset] = depth;

        this.count_abstract++;
    }

    /**
     * Does not clear trailing information.
     * 
     * count === 0 immediately returns
     */
    removeAt(index_abstract, count_abstract) {

        if (index_abstract > this.count_abstract) { throw new Error('removeAt(...): index_abstract > this.count_abstract'); }
        if (index_abstract + count_abstract > this.count_abstract) { throw new Error('removeAt(...): index_abstract + count_abstract > this.count_abstract'); }
        if (count_abstract === 0) { return; }

        if (index_abstract + count_abstract === this.count_abstract) {
            let shiftableCount_abstract = this.count_abstract - (index_abstract + count_abstract);
            if (shiftableCount_abstract > 0) {
                this.copyTo(
                    this.data_literal,
                    index_abstract + count_abstract,
                    this.data_literal,
                    index_abstract,
                    shiftableCount_abstract);
            }
        }
        else {
            this.copyTo(
                this.data_literal,
                index_abstract + count_abstract,
                this.data_literal,
                index_abstract,
                this.count_abstract - (index_abstract + count_abstract));
        }

        this.count_abstract -= count_abstract;
    }

    /**
     * - If the size asked for cannot be allocated, an exception will be thrown. (presumably the wording "thrown by the runtime" is involved.)
     * - JavaScript numbers do not wrap around to negative values when the value is very large.
     *       They instead approach infinity and lose precision.
     *       - There still is a check for whether the new, expected to be larger, capacity is smaller for whatever reason.
     *         Since this ought to be a negligible check for this method to perform.
     *         And failure to catch that case if it happens is an infinite loop.
     */
    ensureCapacityForInsertion(index_abstract, count_abstract) {
        let capacityPrevious_abstract = this.capacity_abstract;
        while (true) {
            if (this.count_abstract + count_abstract > this.capacity_abstract) {
                this.doubleCapacity();
            }
            else if (index_abstract >= this.capacity_abstract) {
                this.doubleCapacity();
            }
            else {
                break;
            }

            if (this.capacity_abstract === capacityPrevious_abstract) {
                break;
            }
            if (this.capacity_abstract < capacityPrevious_abstract) {
                throw new Error('ensureCapacityForInsertion(...): this.capacity_abstract < capacityPrevious_abstract');
            }

            capacityPrevious_abstract = this.capacity_abstract;
        }
    }

    doubleCapacity() {
        let capacityNew_literal = this.capacity_literal * 2;
        let dataNew_literal = new Uint32Array(capacityNew_literal);
        this.copyTo(this.data_literal, 0, dataNew_literal, 0, this.count_abstract);
        this.data_literal = dataNew_literal;
        this.capacity_literal = capacityNew_literal;
        this.capacity_abstract *= 2;
    }

    /**
     * inclusive/exclusive
     */
    copyTo(dataSource_literal, sourceStart_abstract, dataDestination_literal, destinationStart_abstract, length_abstract) {

        if (dataSource_literal === dataDestination_literal) {
            if (dataSource_literal !== this.data_literal) {
                throw new Error('dataSource_literal === dataDestination_literal ; but dataSource_literal !== this.data_literal');
            }

            // TODO: use 'copyWithin' method here and other such locations

            let distance_abstract = destinationStart_abstract - sourceStart_abstract;

            if (distance_abstract > 0) {
                for (var i_abstract = sourceStart_abstract + length_abstract - 1; i_abstract >= sourceStart_abstract; i_abstract--) {
                    let iplusd_abstract = i_abstract + distance_abstract;
                    let iplusd_literal = iplusd_abstract * this.field_count;
                    let i_literal = i_abstract * this.field_count;
                    this.data_literal[iplusd_literal + this.nodeKind_offset] = this.data_literal[i_literal + this.nodeKind_offset];
                    this.data_literal[iplusd_literal + this.key_offset] = this.data_literal[i_literal + this.key_offset];
                    this.data_literal[iplusd_literal + this.depth_offset] = this.data_literal[i_literal + this.depth_offset];
                }
            }
            else {
                for (var i_abstract = destinationStart_abstract; i_abstract < this.count_abstract; i_abstract++) {
                    let iminusd_abstract = i_abstract - distance_abstract;
                    let iminusd_literal = iminusd_abstract * this.field_count;
                    let i_literal = i_abstract * this.field_count;
                    this.data_literal[i_literal + this.nodeKind_offset] = this.data_literal[iminusd_literal + this.nodeKind_offset];
                    this.data_literal[i_literal + this.key_offset] = this.data_literal[iminusd_literal + this.key_offset];
                    this.data_literal[i_literal + this.depth_offset] = this.data_literal[iminusd_literal + this.depth_offset];
                }
            }
        }
        else {
            // TODO: use 'set' method here and other such locations
            for (var i_abstract = 0; i_abstract < length_abstract; i_abstract++) {
                let dSplusi_abstract = destinationStart_abstract + i_abstract;
                let dSplusi_literal = dSplusi_abstract * this.field_count;
                let sSplusi_abstract = sourceStart_abstract + i_abstract;
                let sSplusi_literal = sSplusi_abstract * this.field_count;
                dataDestination_literal[dSplusi_literal + this.nodeKind_offset] = dataSource_literal[sSplusi_literal + this.nodeKind_offset];
                dataDestination_literal[dSplusi_literal + this.key_offset] = dataSource_literal[sSplusi_literal + this.key_offset];
                dataDestination_literal[dSplusi_literal + this.depth_offset] = dataSource_literal[sSplusi_literal + this.depth_offset];
            }
        }
    }
}

let TreeView_pooledNode_nodeKind = get_TreeViewNodeKind_None();
let TreeView_pooledNode_key = 0;
let TreeView_pooledNode_depth = 0;

/*
// All TreeViewDirector API that is expected to exist from the perspective of the TreeViewComponent is prefixed with 'tvd_'.
interface TreeViewDirector {

    constructor() {
        // The TreeViewComponent doesn't actually touch this field, thus it isn't prefixed with 'tvd_',
        // but it is still likely that every TreeViewDirector would want to include this field on their object.
        this.nodeList = new TreeViewNodeList(32);

        // The TreeViewComponent doesn't actually touch this field, thus it isn't prefixed with 'tvd_',
        // but it is still likely that every TreeViewDirector would want to include this field on their object.
        this.component = new TreeViewComponent();

        // #override
    }

    //  
    // @param {number} caseThreeOrigin if left undefined or (falsey but not 0), this will default to 'this.component.beltIndexZero'
    // 
    async tvd_drawItem_BATCH_async(start, length, onePositiveDiff_twoNegativeDiff_orThreeFullScreen, caseThreeOrigin) {

        let upperBound = start + length;
        let totalCount = this.nodeList.count_abstract;
        let loopCounter = 0;

        let arrayKeys = new Array(length);
        for (var indexItem = start; indexItem < upperBound; indexItem++) {
            arrayKeys[loopCounter++] = this.nodeList.getKey(indexItem);
        }
        let arrayEntries = await window.myAPI.getFilesystemEntryById_ARRAY(arrayKeys);
        loopCounter = 0;

        let lastIndex = this.component.beltIndexZero - 1;
        if (lastIndex < 0) {
            lastIndex += this.component.virtualCount; // TODO: 'this.component.virtualCount' or 'this.component.itemListElement.children.length'
        }

        let loopTotalIterations = upperBound - start;
        let caseTwoDivIndex = lastIndex - (loopTotalIterations - 1);
        if (caseTwoDivIndex < 0) {
            caseTwoDivIndex += this.component.itemListElement.children.length;
        }

        let verticalStyleNumber = start * this.component.itemHeightNumber;
        let depth = 0;

        if (!caseThreeOrigin && caseThreeOrigin !== 0) {
            caseThreeOrigin = this.component.beltIndexZero;
        }
        if (caseThreeOrigin < 0 || caseThreeOrigin >= this.component.itemListElement.children.length) {
            throw new RangeError();
        }

        for (var indexItem = start; indexItem < upperBound; indexItem++) {

            let divItem;
            let divIndex;

            switch (onePositiveDiff_twoNegativeDiff_orThreeFullScreen) {
                case 1:
                    divIndex = this.component.beltIndexZero + loopCounter;
                    if (divIndex >= this.component.itemListElement.children.length) {
                        divIndex -= this.component.itemListElement.children.length;
                    }
                    divItem = this.component.itemListElement.children[divIndex];
                    break;
                case 2:
                    divIndex = caseTwoDivIndex++;
                    if (caseTwoDivIndex >= this.component.itemListElement.children.length) {
                        caseTwoDivIndex -= this.component.itemListElement.children.length;
                    }
                    divItem = this.component.itemListElement.children[divIndex];
                    break;
                case 3:
                    divIndex = caseThreeOrigin + loopCounter;
                    if (divIndex >= this.component.itemListElement.children.length) {
                        divIndex -= this.component.itemListElement.children.length;
                    }
                    divItem = this.component.itemListElement.children[divIndex];
                    break;
            }

            if (indexItem >= totalCount) {
                // TODO: Will the user agent remove a text node that has an "empty" nodeValue?
                divItem.lastChild.nodeValue = '~';
                divItem.lastChild.title = '';
            }
            else {
                divItem.style.display = '';

                this.nodeList.getElementAt(indexItem);
                let key = TreeView_pooledNode_key;
                depth = TreeView_pooledNode_depth;
                let nodeKind = TreeView_pooledNode_nodeKind;

                // TODO: ipc to main in bulk with all ids that are to be rendered in the current render...
                // ...don't include the ones that are already rendered either only the new ones that came into view.
                
                let isDirectory = nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded() ||
                                  nodeKind === get_TreeViewNodeKind_isExpandable_NOTisExpanded();

                let entry = arrayEntries[loopCounter];
                let textNode = divItem.lastChild;
                textNode.nodeValue = entry.basename;
                textNode.title = entry.absolutePath;

                if (isDirectory && !entry.isDirectory) {
                    // A file was deleted then a directory was created with same absolute file path or vice versa.
                    this.nodeList.setNodeKind(indexItem, get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded());
                }

                switch (nodeKind) {
                    case get_TreeViewNodeKind_isExpandable_isExpanded():
                        divItem.children[0].textContent = '-';
                        break;
                    case get_TreeViewNodeKind_isExpandable_NOTisExpanded():
                        divItem.children[0].textContent = '+';
                        break;
                    case get_TreeViewNodeKind_NOTisExpandable_isExpanded():
                        divItem.children[0].textContent = '';
                        break;
                    case get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded():
                        divItem.children[0].textContent = '';
                        break;
                }
            }

            divItem.style.transform = `translate(${EXPLORER_offsetPerDepth * depth}px, ${verticalStyleNumber}px)`;
            verticalStyleNumber += this.component.itemHeightNumber;

            loopCounter++;
        }

        if (onePositiveDiff_twoNegativeDiff_orThreeFullScreen === 1) {
            let newZerothIndex = this.component.beltIndexZero + loopCounter;
            if (newZerothIndex >= this.component.itemListElement.children.length) {
                newZerothIndex -= this.component.itemListElement.children.length;
            }
            this.component.beltIndexZero = newZerothIndex;
        }
        else if (onePositiveDiff_twoNegativeDiff_orThreeFullScreen === 2) {
            this.component.beltIndexZero = lastIndex - (loopTotalIterations - 1);
        }
    }
    
    //
    // Not every key invokes this. 
    //
    async tvd_onkeydown_async(divItem, indexItem, key) {
        // #override
    }
    
    async tvd_ondblclick_async(divItem, indexItem) {
        // #override
    }
    
    async tvd_oncontextmenu_async(divItem, indexItem, event, relativeIndex) {
        // #override
    }

    // TODO: To detect whether the "expand/collapse icon" was clicked, the logic 'if(event.target === nodeElement.children[0])' is used...
    // ...this logic is flawed if one ever were to put an element within the span that became the target...
    // ...thus, you should consider checking the x position of the event against the x position of the nodeElement.children[0].
    // @param {*} event 
    //
    async tvd_expandCollapseIconWasClicked_async(divItem, indexItem) {
        // #override
    }
    
    async tvd_arrowRight_async(divItem, indexItem) {
        // #override
	}
    
    async tvd_arrowLeft_async(divItem, indexItem) {
        // #override
    }

    tvd_getTotalCount() {
        // #override
        return this.nodeList.count_abstract;
    }
}
*/

// /**
//  * Be wary of when 'await'(s) are used, perhaps locally copy the data from this if there is concern of it being overwritten during an 'await'.
//  * 
//  * NOTE: You do not store nodes as object instances. They are stored in a TreeViewNodeList as a typed array which contains values...
//  * ...you then read out a node that exists at some index within the TreeViewNodeList by reading the values into this pooled object.
//  */
// interface TreeViewNode {
//     constructor (nodeKind, key, depth) {
//         this.nodeKind = nodeKind;
//         this.key = key;
//         this.depth = depth;
//     }
// }
