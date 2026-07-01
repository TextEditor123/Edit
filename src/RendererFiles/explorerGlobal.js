class EXPLORER_TreeViewDirector {

    constructor() {
        /** @type {string} */
        this.chosenDirectory = null;

        /**
         * @type {TreeViewNodeList}
         * */
        this.nodeList = new TreeViewNodeList(32);
        this.component = new TreeViewComponent();
    }

    /** // Invoke this?: 'await this.component.draw_render_fullReset_async();' */
    setChosenDirectory(chosenDirectory, chosenDirectoryAbsolutePathId) {
        this.chosenDirectory = chosenDirectory;
        this.chosenDirectoryAbsolutePathId = chosenDirectoryAbsolutePathId;

        this.nodeList.clear();

        if (!this.chosenDirectory) return;

        let nodeKind = get_TreeViewNodeKind_isExpandable_NOTisExpanded();
        this.nodeList.insert(this.nodeList.count_abstract, nodeKind, this.chosenDirectoryAbsolutePathId, 0);
        this.component.itemHeightTotal = this.tvd_getTotalCount() * this.component.itemHeightNumber;
        this.component.virtualizationElement.style.height = this.component.itemHeightTotal + 'px';
    }
    
    /** // Invoke this?: 'await this.component.draw_render_fullReset_async();' */
    setChosenWorkspace(chooseWorkspaceResult) {
        this.chosenWorkspace = chooseWorkspaceResult.workspaceFileAbsolutePath;

        this.nodeList.clear();

        if (!this.chosenWorkspace) return;

        for (let i = 0; i < chooseWorkspaceResult.directories.length; i++) {
            let directory = chooseWorkspaceResult.directories[i];
            let nodeKind = get_TreeViewNodeKind_isExpandable_NOTisExpanded();
            this.nodeList.insert(this.nodeList.count_abstract, nodeKind, directory.id, 0);
        }

        this.component.itemHeightTotal = this.tvd_getTotalCount() * this.component.itemHeightNumber;
        this.component.virtualizationElement.style.height = this.component.itemHeightTotal + 'px';
    }

    /** 
     * @param {number} caseThreeOrigin if left undefined or (falsey but not 0), this will default to 'this.component.beltIndexZero'
     */
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

        if (!caseThreeOrigin && caseThreeOrigin !== 0) {
            caseThreeOrigin = this.component.beltIndexZero;
        }
        if (caseThreeOrigin < 0 || caseThreeOrigin >= this.component.itemListElement.children.length) {
            throw new RangeError();
        }

        for (var indexItem = start; indexItem < upperBound; indexItem++) {

            let depth = 0;
            let nodeKind = get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded();

            let divItem;
            let divIndex;

            switch (onePositiveDiff_twoNegativeDiff_orThreeFullScreen) {
                case 1:
                    divIndex = this.component.beltIndexZero + loopCounter;
                    if (divIndex >= this.component.itemListElement.children.length)
                        divIndex -= this.component.itemListElement.children.length;
                    break;
                case 2:
                    divIndex = caseTwoDivIndex++;
                    if (caseTwoDivIndex >= this.component.itemListElement.children.length)
                        caseTwoDivIndex -= this.component.itemListElement.children.length;
                    break;
                case 3:
                    divIndex = caseThreeOrigin + loopCounter;
                    if (divIndex >= this.component.itemListElement.children.length)
                        divIndex -= this.component.itemListElement.children.length;
                    break;
            }
            divItem = this.component.itemListElement.children[divIndex];

            if (indexItem >= totalCount) {
                // TODO: Will the user agent remove a text node that has an "empty" nodeValue?
                divItem.lastChild.nodeValue = '~';
                divItem.lastChild.title = '';
            }
            else {
                this.nodeList.getElementAt(indexItem);
                let key = TreeView_pooledNode_key;
                depth = TreeView_pooledNode_depth;
                nodeKind = TreeView_pooledNode_nodeKind;
                
                let isDirectory = nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded() ||
                                  nodeKind === get_TreeViewNodeKind_isExpandable_NOTisExpanded();

                let entry = arrayEntries[loopCounter];
                let textNode = divItem.lastChild;
                textNode.nodeValue = entry.basename;
                textNode.title = entry.absolutePath;

                if (isDirectory && !entry.isDirectory) {
                    // A file was deleted then a directory was created with same absolute file path or vice versa.
                    this.nodeList.setNodeKind(indexItem, get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded());
                    nodeKind = get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded();
                }
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
    
    /**
     * Not every key invokes this. 
     */
    async tvd_onkeydown_async(divItem, indexItem, eventKey) {
        switch (eventKey) {
            case ' ':
            case 'Enter':
                this.nodeList.getElementAt(indexItem);
                let key = TreeView_pooledNode_key;
                let depth = TreeView_pooledNode_depth;
                let nodeKind = TreeView_pooledNode_nodeKind;
                if (nodeKind === get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded()) {
                    // TODO: open the file by id in one ipc call
                    const entry = await window.myAPI.getFilesystemEntryById(key);
                    if (!entry) return;
        
                    if (!entry.isDirectory) {
                        let shouldFocus;
                        if (eventKey === ' ') {
                            shouldFocus = false;
                        }
                        else if (eventKey === 'Enter') {
                            shouldFocus = true;
                        }
                        await EXPLORER_openInEditor(entry.absolutePath, shouldFocus);
                    }
                }
                break;
        }
    }
    
    async tvd_ondblclick_async(divItem, indexItem) {
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;

        if (nodeKind === get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded()) {
            // TODO: open the file by id in one ipc call
            const entry = await window.myAPI.getFilesystemEntryById(key);
            if (!entry) return;

            if (!entry.isDirectory) {
                await EXPLORER_openInEditor(entry.absolutePath, /*shouldFocus*/ true);
            }
        }
    }
    
    async tvd_oncontextmenu_async(divItem, indexItem, event, relativeIndex) {
        let optionList = [
            new MenuOption(get_CommandKind_Copy(), 'Copy', null),
            new MenuOption(get_CommandKind_CopyAbsolutePath(), 'Copy Absolute Path', null),
        ];

        this.component.ensure_boundingClientRect();
        let nodeListBoundingClientRect = this.component.boundingClientRect;

        // TODO: !!!! You might need to be careful with async and the TreeView_pooledNode; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;

        let target = {
            id: key,
            depth: depth,
            nodeKind: nodeKind,
            indexItem: indexItem,
            divRelativeIndex: relativeIndex,
        };

        if (event.button === 2) {
            this.addSpecificMenuOptionsForTarget(optionList, divItem, target);
            menuSet('EXPLORER', target, optionList, menuOptionX=event.clientX, menuOptionY=event.clientY);
        } else {
            this.addSpecificMenuOptionsForTarget(optionList, divItem, target);
            menuSet('EXPLORER', target, optionList, menuOptionX=nodeListBoundingClientRect.left, menuOptionY=(nodeListBoundingClientRect.top + ((this.component.cursorIndex + 1) * this.component.itemHeightNumber)));
        }
    }

    /**
     * TODO: To detect whether the "expand/collapse icon" was clicked, the logic 'if(event.target === nodeElement.children[0])' is used...
     * ...this logic is flawed if one ever were to put an element within the span that became the target...
     * ...thus, you should consider checking the x position of the event against the x position of the nodeElement.children[0].
     * @param {*} event 
     */
    async tvd_expandCollapseIconWasClicked_async(divItem, indexItem) {
        // TODO: !!!! You might need to be careful with async and the TreeView_pooledNode; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;

        if (nodeKind === get_TreeViewNodeKind_isExpandable_NOTisExpanded()) {

            divItem.children[0].textContent = '-';
            this.nodeList.setNodeKind(indexItem, get_TreeViewNodeKind_isExpandable_isExpanded());

            const filesystemEntries = await window.myAPI.getFilesystemEntries_argumentIsId(key);
    
            for (let i = 0; i < filesystemEntries.length; i++) {
                let entry = filesystemEntries[i];
                let nodeKind;
                if (entry.isDirectory) {
                    nodeKind = get_TreeViewNodeKind_isExpandable_NOTisExpanded();
                }
                else {
                    nodeKind = get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded();
                }
                // TODO: Insert range, or at the least 'pre-emptively' resize the list so that it fits each insertion without resizing per insertion.
                this.nodeList.insert(indexItem + 1 + i, nodeKind, entry.id, depth + 1);
                this.component.itemHeightTotal = this.tvd_getTotalCount() * this.component.itemHeightNumber;
                this.component.virtualizationElement.style.height = this.component.itemHeightTotal + 'px';
            }

            await this.component.draw_render_fullReset_async();
        }
        else if (nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded()) {

            divItem.children[0].textContent = '+';
            this.nodeList.setNodeKind(indexItem, get_TreeViewNodeKind_isExpandable_NOTisExpanded());

            let countChildren = 0;
            for (let i = indexItem + 1; i < this.nodeList.count_abstract; i++) {
                // If currentDepth < ithElementDepth; // then current is a parent of ithElement.
                if (depth < this.nodeList.getDepth(i)) {
                    countChildren++;
                }
                else {
                    break;
                }
            }
            if (countChildren > 0) { // TODO: is this check necessary?
                this.nodeList.removeAt(indexItem + 1, countChildren);
                this.component.itemHeightTotal = this.tvd_getTotalCount() * this.component.itemHeightNumber;
                this.component.virtualizationElement.style.height = this.component.itemHeightTotal + 'px';
                await this.component.draw_render_fullReset_async();
            }
        }
    }
    
    async tvd_arrowRight_async(divItem, indexItem) {
    	// TODO: !!!! You might need to be careful with async and the TreeView_pooledNode; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;
        
        if (nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded()) {
            if (indexItem + 1 < this.nodeList.count_abstract) {
                if (this.nodeList.getDepth(indexItem + 1) > depth) {
                    this.component.state_cursor_setIndex(this.component.state_cursor_validateIndex(
        		        this.component.cursorIndex + 1));
                }
            }
    	}
    	else if (nodeKind === get_TreeViewNodeKind_isExpandable_NOTisExpanded()) {
    		return this.tvd_expandCollapseIconWasClicked_async(divItem, indexItem);
    	}
	}
    
    async tvd_arrowLeft_async(divItem, indexItem) {
    	// TODO: !!!! You might need to be careful with async and the TreeView_pooledNode; I'm not certain whether you do or don't have to be careful, and I don't feel like looking into it at the moment.
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;
        
        if (nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded()) {
        	return this.tvd_expandCollapseIconWasClicked_async(divItem, indexItem);
        }
        else {
        	let distanceToParent = 0;
            for (let i = indexItem - 1; i >= 0; i--) {
                // If ithElementDepth < currentDepth; // then ithElement is the parent of current.
                if (this.nodeList.getDepth(i) < depth) {
                    distanceToParent++;
                    break;
                }
                else {
                    distanceToParent++;
                }
            }
            if (distanceToParent > 0) {
            	this.component.state_cursor_setIndex(this.component.state_cursor_validateIndex(
        			indexItem - distanceToParent));
            }
        }
    }

    tvd_getTotalCount() {
        return this.nodeList.count_abstract;
    }

    /**
     * This method should only pertain itself with the contents of the flat list, any UI changes will be made based on the returned 'changeCount'
     * which is interpreted as one for the item itself, plus the count of any children that were recursively removed.
     * 
     * TODO: Include the word "directory"?
     * 
     * @param {*} indexItem 
     * @returns 
     */
    async removeFromNodeList_async(indexItem) {
        this.nodeList.getElementAt(indexItem);
        let key = TreeView_pooledNode_key;
        let depth = TreeView_pooledNode_depth;
        let nodeKind = TreeView_pooledNode_nodeKind;

        if (nodeKind === get_TreeViewNodeKind_NOTisExpandable_isExpanded()) {
            alert("TODO: if (nodeKind === get_TreeViewNodeKind_NOTisExpandable_isExpanded())");
            return;
        }

        if (nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded()) {

            let countChildren = 0;
            for (let i = indexItem + 1; i < this.nodeList.count_abstract; i++) {
                // If currentDepth < ithElementDepth; then current is a parent of ithElement.
                if (depth < this.nodeList.getDepth(i)) {
                    countChildren++;
                }
                else {
                    break;
                }
            }
            this.nodeList.removeAt(indexItem, 1 + countChildren);
            this.component.itemHeightTotal = this.tvd_getTotalCount() * this.component.itemHeightNumber;
            this.component.virtualizationElement.style.height = this.component.itemHeightTotal + 'px';
            return 1 + countChildren;
        }
    }

    /** TODO: any usage of this needs to respect the actual zeroth UI div not the literal. */
    async setNodeListEntryId_async(indexItem, pathId) {
        this.nodeList.setKey(indexItem, pathId);
    }

    addSpecificMenuOptionsForTarget(optionList, divItem, target) {
        if (!divItem) return;

        // check the "text icon": { '-', '+', '' }
        if (target.nodeKind === get_TreeViewNodeKind_isExpandable_isExpanded() ||
            target.nodeKind === get_TreeViewNodeKind_isExpandable_NOTisExpanded()) {
            
            // Directory
            optionList.push(new MenuOption(get_CommandKind_NewFile_File(), 'NewFile', null));
            optionList.push(new MenuOption(get_CommandKind_NewFile_Directory(), 'NewDirectory', null));
            optionList.push(new MenuOption(get_CommandKind_DeleteFile_Directory(), 'Delete', null));
            optionList.push(new MenuOption(get_CommandKind_RenameFile_Directory(), 'Rename', null));
            optionList.push(new MenuOption(get_CommandKind_Paste(), 'Paste', null));
            optionList.push(new MenuOption(get_CommandKind_Cut(), 'Cut', null));
        }
        else {
            // File
            optionList.push(new MenuOption(get_CommandKind_DeleteFile_File(), 'Delete', null));
            optionList.push(new MenuOption(get_CommandKind_RenameFile_File(), 'Rename', null));
            optionList.push(new MenuOption(get_CommandKind_Cut(), 'Cut', null));
        }
    }
}

const EXPLORER_isExpandedText = '-';
const EXPLORER_NOTisExpandedText = '+';
const EXPLORER_cannotBeExpandedText = '';

/** Pixels */
const EXPLORER_offsetPerDepth = 8;

let EXPLORER_show = true;

/** 8 */
let EXPLORER_firstSpanWidthValue = 8;
/** 8px */
let EXPLORER_firstSpanWidth = 8;

let menuOptionX = 0;
let menuOptionY = 0;

let EXPLORER_menuOptionCut_object = null;

let EXPLORER_director = new EXPLORER_TreeViewDirector();

function EXPLORER_init() {
    const EXPLORER_pickFolderOrWorkspaceButton = document.getElementById('EXPLORER_folderOrWorkspaceButtons');
    if (!EXPLORER_pickFolderOrWorkspaceButton) return;

    EXPLORER_pickFolderOrWorkspaceButton.addEventListener('click', EXPLORER_pickFolderOrWorkspaceButton_onClick);
    
    let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
    toggleShowExplorerButton.checked = EXPLORER_show;
    toggleShowExplorerButton.addEventListener('click', toggleShowExplorerButton_onClick);
}

function toggleShowExplorerButton_onClick() {
    // TODO: Will shadowing 'toggleShowExplorerButton' with a declaration of the same name in here cause any oddities in relation to app long garbage collection overhead....
    // ...presumably the answer is 99.999% no but I can't bear to deal with this right now, thus the variable name 'avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton'.
    let avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
    if (avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton) {
        EXPLORER_setShow(avoidClosureCausingAppLongLivingVariable_toggleShowExplorerButton.checked);
    }
}

async function EXPLORER_pickFolderOrWorkspaceButton_onClick() {
    const EXPLORER_pickFolderOrWorkspaceButton = document.getElementById('EXPLORER_folderOrWorkspaceButtons');
    let optionList = [
        new MenuOption(get_CommandKind_Copy(), 'Folder', null),
        new MenuOption(get_CommandKind_Cut(), 'Workspace', null),
    ];
    let boundingClientRect = EXPLORER_pickFolderOrWorkspaceButton.getBoundingClientRect();
    menuSet(/*context*/ 'EXPLORER_pickFolderOrWorkspaceButton', /*target*/ null, optionList, /*left*/ boundingClientRect.left, /*top*/ boundingClientRect.top + boundingClientRect.height, /*NOTshouldFocus*/ false, /*index*/ 0, /*onHideAction*/ null);
}

/**
Hiding an element's visibility rather than removing the HTML has a cost associated with it.
If a UI piece isn't integral to the app, I wouldn't even transitionally use this as a solution
because it could "slip through the cracks" and never get optimized.

That being said, the explorer in this app IS integral, so I'll go down this route to start off.

...more details involved but I'm thinking and deciding.
*/
function EXPLORER_setShow(shouldShow) {
    const EXPLORER_Element = document.getElementById('EXPLORER');
    if (!EXPLORER_Element) return;

	if (shouldShow && !EXPLORER_show) {
		let editorHackElement = document.getElementById('EDITOR_hack');
		EXPLORER_Element.style.width = '200px';
		EXPLORER_Element.style.visibility = '';
		editorHackElement.style.width = 'calc(100% - 200px)';
		EXPLORER_show = shouldShow;
		let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
		toggleShowExplorerButton.checked = EXPLORER_show;
		EDITOR_onResize();
	}
	else if (!shouldShow && EXPLORER_show) {
		// !show is redundant, but exists for readability.
		let editorHackElement = document.getElementById('EDITOR_hack');
		EXPLORER_Element.style.width = '0px';
		EXPLORER_Element.style.visibility = 'hidden';
		editorHackElement.style.width = '100%';
		EXPLORER_show = shouldShow;
		let toggleShowExplorerButton = document.getElementById('HEADER_toggleShowExplorer');
		toggleShowExplorerButton.checked = EXPLORER_show;
		EDITOR_onResize();
	}
}

async function EXPLORER_openInEditor(absolutePath, shouldFocus) {
    const itHasBom = await window.myAPI.editorReadAllText(absolutePath);

    if (!itHasBom.text && itHasBom.text != '') {
        return;
    }

    EDITOR_setText(
        itHasBom.text,
        itHasBom.fileStartsWithBom,
        /*textSourceIdentifier*/ absolutePath,
        /*FORMATTED_textSourceIdentifier*/ itHasBom.formattedAbsolutePath,
        /*extensionKind*/ EDITOR_toExtensionKind(itHasBom.extension));
    if (shouldFocus) {
        let editor = document.getElementById('EDITOR');
        if (editor) {
            editor.focus();
        }
    }
}

/**
 TODO: REMOVE_HACK: Don't use copy and cut because it makes no sense
 */
async function EXPLORER_pickFolderOrWorkspaceButton_MenuOnClick(indexClicked, elementClicked) {
    const commandKind = parseInt(elementClicked.dataset.commandKind, 10);
    if (!commandKind) {
        return;
    }

    switch (commandKind) {
        case get_CommandKind_Copy():
            {
                const EXPLORER_Element = document.getElementById('EXPLORER');
                if (!EXPLORER_Element) return;
                const EXPLORER_PickFolder = document.getElementById('EXPLORER_folderOrWorkspaceButtons');
                if (!EXPLORER_PickFolder) return;
    
                // { basename: basename, openedDirectory: openedDirectory }
                let chooseDirectoryResult = await window.myAPI.chooseDirectory();
                if (chooseDirectoryResult.canceled) return;
    
                EXPLORER_setShow(true);
                let chosenDirectory = chooseDirectoryResult.openedDirectory;
                EXPLORER_PickFolder.textContent = chooseDirectoryResult.basename;
                EXPLORER_PickFolder.title = chosenDirectory;
    
                EXPLORER_director.setChosenDirectory(chosenDirectory, chooseDirectoryResult.id);
                EXPLORER_director.component.setItems(EXPLORER_director, APP_lineHeight, APP_lineHeight + 'px');
                await EXPLORER_director.component.draw_create_async(EXPLORER_Element, null);
            }
            break;
        case get_CommandKind_Cut():
            {
                const EXPLORER_Element = document.getElementById('EXPLORER');
                if (!EXPLORER_Element) return;
                
                let chooseWorkspaceResult = await window.myAPI.chooseWorkspace();
                if (chooseWorkspaceResult.canceled) return;
    
                EXPLORER_setShow(true);
    
                let pickWorkspaceButton = document.getElementById('EXPLORER_folderOrWorkspaceButtons');
                pickWorkspaceButton.textContent = chooseWorkspaceResult.workspaceFileNameWithoutExtension;
                pickWorkspaceButton.title = chooseWorkspaceResult.workspaceFileAbsolutePath;
    
                EXPLORER_director.setChosenWorkspace(chooseWorkspaceResult);
                EXPLORER_director.component.setItems(EXPLORER_director, APP_lineHeight, APP_lineHeight + 'px');
                await EXPLORER_director.component.draw_create_async(EXPLORER_Element, null);
            }
            break;
    }
}

async function EXPLORER_MenuOnClick(indexClicked, elementClicked) {
    const commandKind = parseInt(elementClicked.dataset.commandKind, 10);
    if (!commandKind) {
        return;
    }

    if (commandKind !== get_CommandKind_Cut() & commandKind !== get_CommandKind_Paste()) {
        EXPLORER_menuOptionCut_object = null;
    }

    switch (commandKind) {
        case get_CommandKind_Copy():
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                await window.myAPI.setClipboard('file:///' + entry.absolutePath);
            }
            break;
        case get_CommandKind_Cut():
            // they don't fully work but I'm not feeling overly interested in anything at the moment I wanna just lay down and do nothing so I'm pleased that I did something at all
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let text = 'file:///' + entry.absolutePath;
                EXPLORER_menuOptionCut_object = {
                    id: text,
                    indexItem: MENU_target.indexItem,
                    divRelativeIndex: MENU_target.divRelativeIndex
                };

                await window.myAPI.setClipboard(text);
            }
            break;
        case get_CommandKind_CopyAbsolutePath():
            if (MENU_target.id) {
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                await window.myAPI.setClipboard(entry.absolutePath);
            }
            break;
        case get_CommandKind_Paste():
            {
                let local_EXPLORER_menuOptionCut_object = EXPLORER_menuOptionCut_object;
                EXPLORER_menuOptionCut_object = null;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let pasteResult = await window.myAPI.copyClipboardAbsolutePathToDirectory(entry.absolutePath, local_EXPLORER_menuOptionCut_object?.id);
                if (pasteResult.success) {
                        /*
                        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

                        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
                        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
                        */

                        // TODO: I belive this final paste logic that comes after this comment and within this scope is extremely similar to the new file logic...

                        let nodeKind;
                        if (pasteResult.isDirectory) {
                            nodeKind = get_TreeViewNodeKind_isExpandable_NOTisExpanded();
                        }
                        else {
                            nodeKind = get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded();
                        }

                        let newIndexItem = MENU_target.indexItem + 1 + pasteResult.indexOf;
                        EXPLORER_director.nodeList.insert(newIndexItem, nodeKind, pasteResult.pathId, MENU_target.depth + 1);

                        if (EXPLORER_director.component.virtualCount > 0) {
                            let largestIndexItemBeingShown = EXPLORER_director.component.virtualIndex + (EXPLORER_director.component.virtualCount - 1);
                            if (newIndexItem >= EXPLORER_director.component.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                                let finalDiv = EXPLORER_director.component.itemListElement.children[EXPLORER_director.component.itemListElement.children.length - 1];

                                EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
                                EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

                                // TODO: Check that the node you're pasting into is expanded.

                                //await EXPLORER_director.tvd_drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                                if (newIndexItem !== largestIndexItemBeingShown) {
                                    //EXPLORER_director.component.itemListElement.insertBefore(finalDiv, EXPLORER_director.component.itemListElement.children[MENU_target.divRelativeIndex + 1 + pasteResult.indexOf]);
                                }
                            }

                            if (pasteResult.sourceFileWasDeleted) {
                                let id = local_EXPLORER_menuOptionCut_object.id;
                                let indexItem = local_EXPLORER_menuOptionCut_object.indexItem;
                                let divRelativeIndex = local_EXPLORER_menuOptionCut_object.divRelativeIndex;

                                // TODO: it isn't just about whether the cut-directory is in the virtualization result...
                                // ...if you paste below you could have some children of the cut-directory in view, but not the cut-directory itself.
    
                                // TODO: Just check indexItem (is easier to tell whether the insertion happened "above" the cut items position in the treeview)?
                                if (MENU_target.divRelativeIndex + 1 + pasteResult.indexOf >= local_EXPLORER_menuOptionCut_object.divRelativeIndex) {
                                    divRelativeIndex += 1;
                                    indexItem += 1;
                                }
    
                                if (divRelativeIndex <= largestIndexItemBeingShown) {

                                    let countOfMoreEntriesToShow = EXPLORER_director.tvd_getTotalCount() - (EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount);

                                    let countChanges;
                                    
                                    if (pasteResult.isDirectory) {
                                        countChanges = await EXPLORER_director.removeFromNodeList_async(indexItem);
                                    }
                                    else {
                                        EXPLORER_director.nodeList.removeAt(indexItem, 1);
                                        countChanges = 1;
                                    }

                                    EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
                                    EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

                                    let remainingChangesToRender = countChanges < EXPLORER_director.component.virtualCount ? countChanges : EXPLORER_director.component.virtualCount - divRelativeIndex;

                                    if (countOfMoreEntriesToShow > remainingChangesToRender) {
                                        countOfMoreEntriesToShow = remainingChangesToRender;
                                    }

                                    for (let i = 0; i < remainingChangesToRender; i++) {
                                        //let divItem = EXPLORER_director.component.itemListElement.children[divRelativeIndex];
                
                                        // TODO: if you remove including the eventual final div in the itemListElement then this moving of the div isn't accomplishing anything and could be skipped.
                                        //EXPLORER_director.component.itemListElement.insertBefore(divItem, undefined);

                                        if (countOfMoreEntriesToShow <= 0) {
                                            //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - 1, /*isNull*/ true);
                                        }
                                        else {
                                            //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - (remainingChangesToRender - i), /*isNull*/ false);
                                            countOfMoreEntriesToShow--;
                                        }
                                    }
                                }
                            }

                            // TODO: fine grained redrawing of only the nodes that are:
                            // - part of the virtualization result
                            // - and have changed in some way that necessitates their UI be redrawn
                            await EXPLORER_director.tvd_drawItem_BATCH_async(EXPLORER_director.component.virtualIndex, EXPLORER_director.component.virtualCount, 3);
                        }

                    }
                break;
            }
        case get_CommandKind_NewFile_Directory():
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_InputText(), menuOptionX, menuOptionY, 'filename', get_CommandKind_NewFile_Directory_WIDGET_InputText_callback);
                break;
            }
        case get_CommandKind_NewFile_File():
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_InputText(), menuOptionX, menuOptionY, 'filename', get_CommandKind_NewFile_File_WIDGET_InputText_callback);
                break;
            }
        case get_CommandKind_DeleteFile_Directory():
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_YesCancel(), menuOptionX, menuOptionY, 'delete ' + filename, get_CommandKind_DeleteFile_Directory_YesCancel_callback);
                break;
            }
        case get_CommandKind_DeleteFile_File():
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_YesCancel(), menuOptionX, menuOptionY, 'delete ' + filename, get_CommandKind_DeleteFile_File_YesCancel_callback);
                break;
            }
        case get_CommandKind_RenameFile_Directory():
            {
                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_InputText(), menuOptionX, menuOptionY, 'rename', get_CommandKind_RenameFile_Directory_InputText_callback);
                let input = document.getElementById('WIDGET_inputText');
                if (input) {
                    input.value = filename;
                }
                break;
            }
        case get_CommandKind_RenameFile_File():
            {
                /*
                Maybe the only difference between the _Directory and _File cases for each ..._...
                is the bool for isDirectory.

                But I'm exhausted and I cannot reduce the code duplication here because my head doesn't function.
                */

                if (!MENU_target.id) return;
                // TODO: optimize this?
                const entry = await window.myAPI.getFilesystemEntryById(MENU_target.id);
                if (!entry) return;
                let filename = entry.basename;
                WIDGET_target = MENU_target;
                WIDGET_show(get_WidgetKind_InputText(), menuOptionX, menuOptionY, 'rename', get_CommandKind_RenameFile_File_InputText_callback);
                let input = document.getElementById('WIDGET_inputText');
                if (input) {
                    input.value = filename;
                }
                break;
            }
    }
}

async function get_CommandKind_NewFile_Directory_WIDGET_InputText_callback(result) {
    if (result.isCancelled) return;
    let newFileResult = await window.myAPI.newFile(entry.absolutePath, result.value, /*isDirectory*/ true);
    if (newFileResult.success) {
        /*
        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
        */

        // TODO: I belive this final new directory logic that comes after this comment and within this scope is 1 to 1 an exact duplication of the new file logic...
        
        let nodeKind = get_TreeViewNodeKind_isExpandable_NOTisExpanded();
        let newIndexItem = WIDGET_target.indexItem + 1 + newFileResult.indexOf;
        EXPLORER_director.nodeList.insert(newIndexItem, nodeKind, newFileResult.pathId, WIDGET_target.depth + 1);

        if (EXPLORER_director.component.virtualCount > 0) {
            let largestIndexItemBeingShown = EXPLORER_director.component.virtualIndex + (EXPLORER_director.component.virtualCount - 1);
            if (newIndexItem >= EXPLORER_director.component.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                //let finalDiv = EXPLORER_director.component.itemListElement.children[EXPLORER_director.component.itemListElement.children.length - 1];

                EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
                EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

                //await EXPLORER_director.tvd_drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                if (newIndexItem !== largestIndexItemBeingShown) {
                    //EXPLORER_director.component.itemListElement.insertBefore(finalDiv, EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex + 1 + newFileResult.indexOf]);
                }
            }
        }

        // TODO: fine grained redrawing of only the nodes that are:
        // - part of the virtualization result
        // - and have changed in some way that necessitates their UI be redrawn
        await EXPLORER_director.tvd_drawItem_BATCH_async(EXPLORER_director.component.virtualIndex, EXPLORER_director.component.virtualCount, 3);
    }
}

async function get_CommandKind_NewFile_File_WIDGET_InputText_callback(result) {
    if (result.isCancelled) return;
    let newFileResult = await window.myAPI.newFile(entry.absolutePath, result.value, /*isDirectory*/ false);
    if (newFileResult.success) {
        /*
        // TODO: I saw the result was success but the indexOf was -1 when adding a file with the same name twice that seems erroneous.

        // TODO: I added 3 files total while testing various words that would alphabetically be placed at the start, end, or somewhere in the middle...
        // ...I think the middle case for some reason ended up in the parent? I'm not quite sure what happened.
        */

        let nodeKind = get_TreeViewNodeKind_NOTisExpandable_NOTisExpanded();
        let newIndexItem = WIDGET_target.indexItem + 1 + newFileResult.indexOf;
        EXPLORER_director.nodeList.insert(newIndexItem, nodeKind, newFileResult.pathId, WIDGET_target.depth + 1);

        if (EXPLORER_director.component.virtualCount > 0) {
            let largestIndexItemBeingShown = EXPLORER_director.component.virtualIndex + (EXPLORER_director.component.virtualCount - 1);
            if (newIndexItem >= EXPLORER_director.component.virtualIndex && newIndexItem <= largestIndexItemBeingShown) {
                //let finalDiv = EXPLORER_director.component.itemListElement.children[EXPLORER_director.component.itemListElement.children.length - 1];

                EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
                EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

                //await EXPLORER_director.tvd_drawItem_async(finalDiv, newIndexItem, /*isNull*/ false);
                if (newIndexItem !== largestIndexItemBeingShown) {
                    //EXPLORER_director.component.itemListElement.insertBefore(finalDiv, EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex + 1 + newFileResult.indexOf]);
                }
            }
        }

        // TODO: fine grained redrawing of only the nodes that are:
        // - part of the virtualization result
        // - and have changed in some way that necessitates their UI be redrawn
        await EXPLORER_director.tvd_drawItem_BATCH_async(EXPLORER_director.component.virtualIndex, EXPLORER_director.component.virtualCount, 3);
    }
}

async function get_CommandKind_DeleteFile_Directory_YesCancel_callback(result) {
    if (result.isCancelled) return;
    let deleteFileResult = await window.myAPI.deleteFile(entry.absolutePath, /*isDirectory*/ true);
    if (deleteFileResult) {
        let countOfMoreEntriesToShow = EXPLORER_director.tvd_getTotalCount() - (EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount);

        let countChanges = await EXPLORER_director.removeFromNodeList_async(WIDGET_target.indexItem);

        EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
        EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

        let remainingChangesToRender = countChanges < EXPLORER_director.component.virtualCount ? countChanges : EXPLORER_director.component.virtualCount - WIDGET_target.divRelativeIndex;

        if (countOfMoreEntriesToShow > remainingChangesToRender) {
            countOfMoreEntriesToShow = remainingChangesToRender;
        }

        for (let i = 0; i < remainingChangesToRender; i++) {
            //let divItem = EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex];

            // TODO: if you remove including the eventual final div in the itemListElement then this moving of the div isn't accomplishing anything and could be skipped.
            //EXPLORER_director.component.itemListElement.insertBefore(divItem, undefined);

            if (countOfMoreEntriesToShow <= 0) {
                //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - 1, /*isNull*/ true);
            }
            else {
                //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - (remainingChangesToRender - i), /*isNull*/ false);
                countOfMoreEntriesToShow--;
            }
        }

        // TODO: fine grained redrawing of only the nodes that are:
        // - part of the virtualization result
        // - and have changed in some way that necessitates their UI be redrawn
        await EXPLORER_director.tvd_drawItem_BATCH_async(EXPLORER_director.component.virtualIndex, EXPLORER_director.component.virtualCount, 3);
    }
}

async function get_CommandKind_DeleteFile_File_YesCancel_callback(result) {
    if (result.isCancelled) return;
    let deleteFileResult = await window.myAPI.deleteFile(entry.absolutePath, /*isDirectory*/ false);
    if (deleteFileResult) {
        let noMoreEntriesToShow = EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount >= EXPLORER_director.tvd_getTotalCount();

        EXPLORER_director.nodeList.removeAt(WIDGET_target.indexItem, 1);

        if (EXPLORER_director.component.virtualCount > 0) {
            //let divItem = EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex];

            EXPLORER_director.component.itemHeightTotal = EXPLORER_director.tvd_getTotalCount() * EXPLORER_director.component.itemHeightNumber;
            EXPLORER_director.component.virtualizationElement.style.height = EXPLORER_director.component.itemHeightTotal + 'px';

            //EXPLORER_director.component.itemListElement.insertBefore(divItem, undefined);
            if (noMoreEntriesToShow) {
                //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - 1, /*isNull*/ true);
            }
            else {
                //await EXPLORER_director.tvd_drawItem_async(divItem, EXPLORER_director.component.virtualIndex + EXPLORER_director.component.virtualCount - 1, /*isNull*/ false);
            }
        }

        // TODO: fine grained redrawing of only the nodes that are:
        // - part of the virtualization result
        // - and have changed in some way that necessitates their UI be redrawn
        await EXPLORER_director.tvd_drawItem_BATCH_async(EXPLORER_director.component.virtualIndex, EXPLORER_director.component.virtualCount, 3);
    }
}

async function get_CommandKind_RenameFile_Directory_InputText_callback(result) {
    if (result.isCancelled) return;
    let renameFileResult = await window.myAPI.renameFile(entry.absolutePath, result.value, /*isDirectory*/ true);
    if (renameFileResult.success) {
        await EXPLORER_director.setNodeListEntryId_async(WIDGET_target.indexItem, renameFileResult.pathId);
        let divItem = EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex];
        divItem.lastChild.nodeValue = result.value;
    }
}

async function get_CommandKind_RenameFile_File_InputText_callback(result) {
    if (result.isCancelled) return;
    let renameFileResult = await window.myAPI.renameFile(entry.absolutePath, result.value, /*isDirectory*/ false);
    if (renameFileResult.success) {
        await EXPLORER_director.setNodeListEntryId_async(WIDGET_target.indexItem, renameFileResult.pathId);
        let divItem = EXPLORER_director.component.itemListElement.children[WIDGET_target.divRelativeIndex];
        divItem.lastChild.nodeValue = result.value;
    }
}

/*
I didn't plan on mentioning anything about the movies today.
But I saw the last one and it was just an odd premise that stood out.
Everyone is color blind and you take red, blue, green pills to see each color but only 1 at a time.
It was odd.
*/