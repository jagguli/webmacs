// eslint-disable-line max-lines
/**
 * Copyright 2016-2017 Florian Bruhin (The Compiler) <mail@qutebrowser.org>
 *
 * This file is part of qutebrowser.
 *
 * qutebrowser is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * qutebrowser is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with qutebrowser.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Ported chrome-caretbrowsing extension.
 * Create and control div caret, which listen commands from qutebrowser,
 * change document selection model and div caret position.
 */

// see https://cs.chromium.org/chromium/src/ui/accessibility/extensions/caretbrowsing/

"use strict";

const axs = {};

axs.dom = {};

axs.color = {};

axs.utils = {};

axs.dom.parentElement = function(node) {
    if (!node) {
        return null;
    }
    const composedNode = axs.dom.composedParentNode(node);
    if (!composedNode) {
        return null;
    }
    switch (composedNode.nodeType) {
    case Node.ELEMENT_NODE:
        return composedNode;
    default:
        return axs.dom.parentElement(composedNode);
    }
};

axs.dom.shadowHost = function(node) {
    if ("host" in node) {
        return node.host;
    }
    return null;
};

axs.dom.composedParentNode = function(node) {
    if (!node) {
        return null;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return axs.dom.shadowHost(node);
    }
    const parentNode = node.parentNode;
    if (!parentNode) {
        return null;
    }
    if (parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return axs.dom.shadowHost(parentNode);
    }
    if (!parentNode.shadowRoot) {
        return parentNode;
    }
    const points = node.getDestinationInsertionPoints();
    if (points.length > 0) {
        return axs.dom.composedParentNode(points[points.length - 1]);
    }
    return null;
};

axs.color.Color = function(red, green, blue, alpha) { // eslint-disable-line max-params,max-len
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
};

axs.color.parseColor = function(colorText) {
    if (colorText === "transparent") {
        return new axs.color.Color(0, 0, 0, 0);
    }
    let match = colorText.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
    if (match) {
        const blue = parseInt(match[3], 10);
        const green = parseInt(match[2], 10);
        const red = parseInt(match[1], 10);
        return new axs.color.Color(red, green, blue, 1);
    }
    match = colorText.match(/^rgba\((\d+), (\d+), (\d+), (\d*(\.\d+)?)\)/);
    if (match) {
        const red = parseInt(match[1], 10);
        const green = parseInt(match[2], 10);
        const blue = parseInt(match[3], 10);
        const alpha = parseFloat(match[4]);
        return new axs.color.Color(red, green, blue, alpha);
    }
    return null;
};

axs.color.flattenColors = function(color1, color2) {
    const colorAlpha = color1.alpha;
    return new axs.color.Color(
        ((1 - colorAlpha) * color2.red) + (colorAlpha * color1.red),
        ((1 - colorAlpha) * color2.green) + (colorAlpha * color1.green),
        ((1 - colorAlpha) * color2.blue) + (colorAlpha * color2.blue),
        color1.alpha + (color2.alpha * (1 - color1.alpha)));
};

axs.utils.getParentBgColor = function(_el) {
    let el = _el;
    let el2 = el;
    let iter = null;
    el = [];
    for (iter = null; (el2 = axs.dom.parentElement(el2));) {
        const style = window.getComputedStyle(el2, null);
        if (style) {
            const color = axs.color.parseColor(style.backgroundColor);
            if (color &&
                (style.opacity < 1 &&
                 (color.alpha *= style.opacity),
                 color.alpha !== 0 &&
                 (el.push(color), color.alpha === 1))) {
                iter = !0;
                break;
            }
        }
    }
    if (!iter) {
        el.push(new axs.color.Color(255, 255, 255, 1));
    }
    for (el2 = el.pop(); el.length;) {
        iter = el.pop();
        el2 = axs.color.flattenColors(iter, el2);
    }
    return el2;
};

axs.utils.getFgColor = function(el, el2, color) {
    let color2 = axs.color.parseColor(el.color);
    if (!color2) {
        return null;
    }
    if (color2.alpha < 1) {
        color2 = axs.color.flattenColors(color2, color);
    }
    if (el.opacity < 1) {
        const el3 = axs.utils.getParentBgColor(el2);
        color2.alpha *= el.opacity;
        color2 = axs.color.flattenColors(color2, el3);
    }
    return color2;
};

axs.utils.getBgColor = function(el, elParent) {
    let color = axs.color.parseColor(el.backgroundColor);
    if (!color) {
        return null;
    }
    if (el.opacity < 1) {
        color.alpha *= el.opacity;
    }
    if (color.alpha < 1) {
        const bgColor = axs.utils.getParentBgColor(elParent);
        if (bgColor === null) {
            return null;
        }
        color = axs.color.flattenColors(color, bgColor);
    }
    return color;
};

axs.color.colorChannelToString = function(_color) {
    const color = Math.round(_color);
    if (color < 15) {
        return `0${color.toString(16)}`;
    }
    return color.toString(16);
};

axs.color.colorToString = function(color) {
    if (color.alpha === 1) {
        const red = axs.color.colorChannelToString(color.red);
        const green = axs.color.colorChannelToString(color.green);
        const blue = axs.color.colorChannelToString(color.blue);
        return `#${red}${green}${blue}`;
    }
    const arr = [color.red, color.green, color.blue, color.alpha].join();
    return `rgba(${arr})`;
};

const Cursor = function(node, index, text) { // eslint-disable-line func-style,max-len
    this.node = node;
    this.index = index;
    this.text = text;
};

Cursor.prototype.clone = function() {
    return new Cursor(this.node, this.index, this.text);
};

Cursor.prototype.copyFrom = function(otherCursor) {
    this.node = otherCursor.node;
    this.index = otherCursor.index;
    this.text = otherCursor.text;
};

const TraverseUtil = {};

TraverseUtil.getNodeText = function(node) {
    if (node.constructor === Text) {
        return node.data;
    }
    return "";
};

TraverseUtil.treatAsLeafNode = function(node) {
    return node.childNodes.length === 0 ||
        node.nodeName === "SELECT" ||
        node.nodeName === "OBJECT";
};

TraverseUtil.isWhitespace = function(ch) {
    return (ch === " " || ch === "\n" || ch === "\r" || ch === "\t");
};

TraverseUtil.isVisible = function(node) {
    if (!node.style) {
        return true;
    }
    const style = window.getComputedStyle(node, null);
    return (Boolean(style) &&
            style.display !== "none" &&
            style.visibility !== "hidden");
};

TraverseUtil.isSkipped = function(_node) {
    let node = _node;
    if (node.constructor === Text) {
        node = node.parentElement;
    }
    if (node.className === "CaretBrowsing_Caret" ||
        node.className === "CaretBrowsing_AnimateCaret") {
        return true;
    }
    return false;
};

TraverseUtil.forwardsChar = function(cursor, nodesCrossed) { // eslint-disable-line max-statements,max-len
    for (;;) {
        let childNode = null;
        if (!TraverseUtil.treatAsLeafNode(cursor.node)) {
            for (let i = cursor.index;
                 i < cursor.node.childNodes.length;
                 i++) {
                const node = cursor.node.childNodes[i];
                if (TraverseUtil.isSkipped(node)) {
                    nodesCrossed.push(node);
                } else if (TraverseUtil.isVisible(node)) {
                    childNode = node;
                    break;
                }
            }
        }
        if (childNode) {
            cursor.node = childNode;
            cursor.index = 0;
            cursor.text = TraverseUtil.getNodeText(cursor.node);
            if (cursor.node.constructor !== Text) {
                nodesCrossed.push(cursor.node);
            }
        } else {
            if (cursor.index < cursor.text.length) {
                return cursor.text[cursor.index++];
            }

            while (cursor.node !== null) {
                let siblingNode = null;
                for (let node = cursor.node.nextSibling;
                     node !== null;
                     node = node.nextSibling) {
                    if (TraverseUtil.isSkipped(node)) {
                        nodesCrossed.push(node);
                    } else if (TraverseUtil.isVisible(node)) {
                        siblingNode = node;
                        break;
                    }
                }
                if (siblingNode) {
                    cursor.node = siblingNode;
                    cursor.text = TraverseUtil.getNodeText(siblingNode);
                    cursor.index = 0;

                    if (cursor.node.constructor !== Text) {
                        nodesCrossed.push(cursor.node);
                    }

                    break;
                }

                const parentNode = cursor.node.parentNode;
                if (parentNode &&
                    parentNode.constructor !== HTMLBodyElement) {
                    cursor.node = cursor.node.parentNode;
                    cursor.text = null;
                    cursor.index = 0;
                } else {
                    return null;
                }
            }
        }
    }
};

TraverseUtil.getNextChar = function( // eslint-disable-line max-params
    startCursor, endCursor, nodesCrossed, skipWhitespace) {
    startCursor.copyFrom(endCursor);
    let fChar = TraverseUtil.forwardsChar(endCursor, nodesCrossed);
    if (fChar === null) {
        return null;
    }

    const initialWhitespace = TraverseUtil.isWhitespace(fChar);

    while ((TraverseUtil.isWhitespace(fChar)) ||
           (TraverseUtil.isSkipped(endCursor.node))) {
        fChar = TraverseUtil.forwardsChar(endCursor, nodesCrossed);
        if (fChar === null) {
            return null;
        }
    }
    if (skipWhitespace || !initialWhitespace) {
        startCursor.copyFrom(endCursor);
        startCursor.index--;
        return fChar;
    }

    for (let i = 0; i < nodesCrossed.length; i++) {
        if (TraverseUtil.isSkipped(nodesCrossed[i])) {
            endCursor.index--;
            startCursor.copyFrom(endCursor);
            startCursor.index--;
            return " ";
        }
    }
    endCursor.index--;
    return " ";
};

TraverseUtil.backwardsChar = function(cursor, nodesCrossed) {
    while (true) {
        // Move down until we get to a leaf node.
        var childNode = null;
        if (!TraverseUtil.treatAsLeafNode(cursor.node)) {
            for (var i = cursor.index - 1; i >= 0; i--) {
                var node = cursor.node.childNodes[i];
                if (TraverseUtil.isSkipped(node)) {
                    nodesCrossed.push(node);
                    continue;
                }
                if (TraverseUtil.isVisible(node)) {
                    childNode = node;
                    break;
                }
            }
        }
        if (childNode) {
            cursor.node = childNode;
            cursor.text = TraverseUtil.getNodeText(cursor.node);
            if (cursor.text.length)
                cursor.index = cursor.text.length;
            else
                cursor.index = cursor.node.childNodes.length;
            if (cursor.node.constructor != Text)
                nodesCrossed.push(cursor.node);
            continue;
        }

        // Return the previous character from this leaf node.
        if (cursor.text.length > 0 && cursor.index > 0) {
            return cursor.text[--cursor.index];
        }

        // Move to the previous sibling, going up the tree as necessary.
        while (true) {
            // Try to move to the previous sibling.
            var siblingNode = null;
            for (var node = cursor.node.previousSibling;
                 node != null;
                 node = node.previousSibling) {
                if (TraverseUtil.isSkipped(node)) {
                    nodesCrossed.push(node);
                    continue;
                }
                if (TraverseUtil.isVisible(node)) {
                    siblingNode = node;
                    break;
                }
            }
            if (siblingNode) {
                cursor.node = siblingNode;
                cursor.text = TraverseUtil.getNodeText(siblingNode);
                if (cursor.text.length)
                    cursor.index = cursor.text.length;
                else
                    cursor.index = cursor.node.childNodes.length;
                if (cursor.node.constructor != Text)
                    nodesCrossed.push(cursor.node);
                break;
            }

            // Otherwise, move to the parent.
            if (cursor.node.parentNode &&
                cursor.node.parentNode.constructor != HTMLBodyElement) {
                cursor.node = cursor.node.parentNode;
                cursor.text = null;
                cursor.index = 0;
            } else {
                return null;
            }
        }
    }
};

const CaretBrowsing = {};

CaretBrowsing.isEnabled = false;

CaretBrowsing.onEnable = undefined;

CaretBrowsing.onJump = undefined;

CaretBrowsing.isWindowFocused = false;

CaretBrowsing.isCaretVisible = false;

CaretBrowsing.caretElement = undefined;

CaretBrowsing.caretX = 0;

CaretBrowsing.caretY = 0;

CaretBrowsing.caretWidth = 0;

CaretBrowsing.caretHeight = 0;

CaretBrowsing.caretForeground = "#000";

CaretBrowsing.caretBackground = "#fff";

CaretBrowsing.isSelectionCollapsed = false;

CaretBrowsing.blinkFunctionId = null;

CaretBrowsing.targetX = null;

CaretBrowsing.blinkFlag = true;

CaretBrowsing.isWindows =
    window.navigator.userAgent.indexOf("Windows") !== -1;

CaretBrowsing.positionCaret = function() {
    var start = new Cursor(document.body, 0, '');
    var end = new Cursor(document.body, 0, '');
    var nodesCrossed = [];
    var result = TraverseUtil.getNextChar(start, end, nodesCrossed, true);
    if (result == null) {
        return;
    }
    CaretBrowsing.setAndValidateSelection(start, start);
}

CaretBrowsing.isFocusable = function(targetNode) {
    if (!targetNode || typeof (targetNode.tabIndex) !== "number") {
        return false;
    }

    if (targetNode.tabIndex >= 0) {
        return true;
    }

    if (targetNode.hasAttribute &&
        targetNode.hasAttribute("tabindex") &&
        targetNode.getAttribute("tabindex") === "-1") {
        return true;
    }

    return false;
}

CaretBrowsing.isControlThatNeedsArrowKeys = function(node) { // eslint-disable-line complexity,max-len
    if (!node) {
        return false;
    }

    if (node === document.body || node !== document.activeElement) {
        return false;
    }

    if (node.constructor === HTMLSelectElement) {
        return true;
    }

    if (node.constructor === HTMLInputElement) {
        switch (node.type) { // eslint-disable-line default-case
        case "email":
        case "number":
        case "password":
        case "search":
        case "text":
        case "tel":
        case "url":
        case "":
            return true;
        case "datetime":
        case "datetime-local":
        case "date":
        case "month":
        case "radio":
        case "range":
        case "week":
            return true;
        }
    }

    if (node.getAttribute && CaretBrowsing.isFocusable(node)) {
        const role = node.getAttribute("role");
        switch (role) { // eslint-disable-line default-case
        case "combobox":
        case "grid":
        case "gridcell":
        case "listbox":
        case "menu":
        case "menubar":
        case "menuitem":
        case "menuitemcheckbox":
        case "menuitemradio":
        case "option":
        case "radiogroup":
        case "scrollbar":
        case "slider":
        case "spinbutton":
        case "tab":
        case "tablist":
        case "textbox":
        case "tree":
        case "treegrid":
        case "treeitem":
            return true;
        }
    }

    return false;
};

CaretBrowsing.injectCaretStyles = function() {
    const style = ".CaretBrowsing_Caret {" +
          "  position: absolute;" +
          "  z-index: 2147483647;" +
          "  min-height: 10px;" +
          "  background-color: #000;" +
          "}" +
          ".CaretBrowsing_AnimateCaret {" +
          "  position: absolute;" +
          "  z-index: 2147483647;" +
          "  min-height: 10px;" +
          "}" +
          ".CaretBrowsing_FlashVert {" +
          "  position: absolute;" +
          "  z-index: 2147483647;" +
          "  background: linear-gradient(" +
          "      270deg," +
          "      rgba(128, 128, 255, 0) 0%," +
          "      rgba(128, 128, 255, 0.3) 45%," +
          "      rgba(128, 128, 255, 0.8) 50%," +
          "      rgba(128, 128, 255, 0.3) 65%," +
          "      rgba(128, 128, 255, 0) 100%);" +
          "}";
    const node = document.createElement("style");
    node.innerHTML = style;
    document.body.appendChild(node);
};

CaretBrowsing.setInitialCursor = function() {
    if (!CaretBrowsing.initiated) {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            return;
        }

        CaretBrowsing.positionCaret();
        CaretBrowsing.injectCaretStyles();
        CaretBrowsing.toggle();
        CaretBrowsing.initiated = true;
        CaretBrowsing.selectionEnabled = false;
        return;
    }

    // if (!window.getSelection().toString()) {
    //     CaretBrowsing.positionCaret();
    // }
    CaretBrowsing.toggle();
};

CaretBrowsing.setAndValidateSelection = function(start, end) {
    const sel = window.getSelection();
    sel.setBaseAndExtent(start.node, start.index, end.node, end.index);

    if (sel.rangeCount !== 1) {
        return false;
    }

    return (sel.anchorNode === start.node &&
            sel.anchorOffset === start.index &&
            sel.focusNode === end.node &&
            sel.focusOffset === end.index);
};

CaretBrowsing.isCollapsed = function(sel) {
    return (sel.anchorOffset == sel.focusOffset &&
            sel.anchorNode == sel.focusNode);
};

/**
 * Return true if the selection directionality is ambiguous, which happens
 * if, for example, the user double-clicks in the middle of a word to select
 * it. In that case, the selection should extend by the right edge if the
 * user presses right, and by the left edge if the user presses left.
 * @param {Selection} sel The selection.
 * @return {boolean} True if the selection directionality is ambiguous.
 */
CaretBrowsing.isAmbiguous = function(sel) {
    return (sel.anchorNode != sel.baseNode ||
            sel.anchorOffset != sel.baseOffset ||
            sel.focusNode != sel.extentNode ||
            sel.focusOffset != sel.extentOffset);
};

CaretBrowsing.makeAnchorCursor = function(sel) {
    return new Cursor(sel.anchorNode, sel.anchorOffset,
                      TraverseUtil.getNodeText(sel.anchorNode));
};

CaretBrowsing.makeFocusCursor = function(sel) {
    return new Cursor(sel.focusNode, sel.focusOffset,
                      TraverseUtil.getNodeText(sel.focusNode));
};

CaretBrowsing.makeLeftCursor = function(sel) {
    var range = sel.rangeCount == 1 ? sel.getRangeAt(0) : null;
    if (range &&
        range.endContainer == sel.anchorNode &&
        range.endOffset == sel.anchorOffset) {
        return CaretBrowsing.makeFocusCursor(sel);
    } else {
        return CaretBrowsing.makeAnchorCursor(sel);
    }
};

CaretBrowsing.makeRightCursor = function(sel) {
    var range = sel.rangeCount == 1 ? sel.getRangeAt(0) : null;
    if (range &&
        range.endContainer == sel.anchorNode &&
        range.endOffset == sel.anchorOffset) {
        return CaretBrowsing.makeAnchorCursor(sel);
    } else {
        return CaretBrowsing.makeFocusCursor(sel);
    }
};

CaretBrowsing.setFocusToNode = function(nodeArg) {
    let node = nodeArg;
    while (node && node !== document.body) {
        if (CaretBrowsing.isFocusable(node) && node.constructor !== HTMLIFrameElement) {
            node.focus();
            if (node.constructor === HTMLInputElement && node.select) {
                node.select();
            }
            return true;
        }
        node = node.parentNode;
    }

    return false;
};

CaretBrowsing.setCaretElementNormalStyle = function() {
    const element = CaretBrowsing.caretElement;
    element.className = "CaretBrowsing_Caret";
    if (CaretBrowsing.isSelectionCollapsed) {
        element.style.opacity = "1.0";
    } else {
        element.style.opacity = "0.0";
    }
    element.style.left = `${CaretBrowsing.caretX}px`;
    element.style.top = `${CaretBrowsing.caretY}px`;
    element.style.width = `${CaretBrowsing.caretWidth}px`;
    element.style.height = `${CaretBrowsing.caretHeight}px`;
    element.style.color = CaretBrowsing.caretForeground;
};

CaretBrowsing.animateCaretElement = function() {
    const element = CaretBrowsing.caretElement;
    element.style.left = `${CaretBrowsing.caretX - 50}px`;
    element.style.top = `${CaretBrowsing.caretY - 100}px`;
    element.style.width = `${CaretBrowsing.caretWidth + 100}px`;
    element.style.height = `${CaretBrowsing.caretHeight + 200}px`;
    element.className = "CaretBrowsing_AnimateCaret";

    window.setTimeout(() => {
        if (!CaretBrowsing.caretElement) {
            return;
        }
        CaretBrowsing.setCaretElementNormalStyle();
        element.style.transition = "all 0.8s ease-in";
        function listener() {
            element.removeEventListener(
                "transitionend", listener, false);
            element.style.transition = "none";
        }
        element.addEventListener(
            "transitionend", listener, false);
    }, 0);
};

CaretBrowsing.flashCaretElement = function() {
    const x = CaretBrowsing.caretX;
    const y = CaretBrowsing.caretY;

    const vert = document.createElement("div");
    vert.className = "CaretBrowsing_FlashVert";
    vert.style.left = `${x - 6}px`;
    vert.style.top = `${y - 100}px`;
    vert.style.width = "11px";
    vert.style.height = `${200}px`;
    document.body.appendChild(vert);

    window.setTimeout(() => {
        document.body.removeChild(vert);
        if (CaretBrowsing.caretElement) {
            CaretBrowsing.setCaretElementNormalStyle();
        }
    }, 250);
};

CaretBrowsing.createCaretElement = function() {
    const element = document.createElement("div");
    element.className = "CaretBrowsing_Caret";
    document.body.appendChild(element);
    CaretBrowsing.caretElement = element;

    if (CaretBrowsing.onEnable === "anim") {
        CaretBrowsing.animateCaretElement();
    } else if (CaretBrowsing.onEnable === "flash") {
        CaretBrowsing.flashCaretElement();
    } else {
        CaretBrowsing.setCaretElementNormalStyle();
    }
};

CaretBrowsing.recreateCaretElement = function() {
    if (CaretBrowsing.caretElement) {
        window.clearInterval(CaretBrowsing.blinkFunctionId);
        CaretBrowsing.caretElement.parentElement.removeChild(
            CaretBrowsing.caretElement);
        CaretBrowsing.caretElement = null;
        CaretBrowsing.updateIsCaretVisible();
    }
};

CaretBrowsing.getCursorRect = function(cursor) { // eslint-disable-line max-statements,max-len
    let node = cursor.node;
    const index = cursor.index;
    const rect = {
        "left": 0,
        "top": 0,
        "width": 1,
        "height": 0,
    };
    if (node.constructor === Text) {
        let left = index;
        let right = index;
        const max = node.data.length;
        const newRange = document.createRange();
        while (left > 0 || right < max) {
            if (left > 0) {
                left--;
                newRange.setStart(node, left);
                newRange.setEnd(node, index);
                const rangeRect = newRange.getBoundingClientRect();
                if (rangeRect && rangeRect.width && rangeRect.height) {
                    rect.left = rangeRect.right;
                    rect.top = rangeRect.top;
                    rect.height = rangeRect.height;
                    break;
                }
            }
            if (right < max) {
                right++;
                newRange.setStart(node, index);
                newRange.setEnd(node, right);
                const rangeRect = newRange.getBoundingClientRect();
                if (rangeRect && rangeRect.width && rangeRect.height) {
                    rect.left = rangeRect.left;
                    rect.top = rangeRect.top;
                    rect.height = rangeRect.height;
                    break;
                }
            }
        }
    } else {
        rect.height = node.offsetHeight;
        while (node !== null) {
            rect.left += node.offsetLeft;
            rect.top += node.offsetTop;
            node = node.offsetParent;
        }
    }
    rect.left += window.pageXOffset;
    rect.top += window.pageYOffset;
    return rect;
};

CaretBrowsing.updateCaretOrSelection =
    function(scrollToSelection) { // eslint-disable-line max-statements
            const previousX = CaretBrowsing.caretX;
        const previousY = CaretBrowsing.caretY;

        const sel = window.getSelection();
        if (sel.rangeCount === 0) {
            if (CaretBrowsing.caretElement) {
                CaretBrowsing.isSelectionCollapsed = false;
                CaretBrowsing.caretElement.style.opacity = "0.0";
            }
            return;
        }

        const range = sel.getRangeAt(0);
        if (!range) {
            if (CaretBrowsing.caretElement) {
                CaretBrowsing.isSelectionCollapsed = false;
                CaretBrowsing.caretElement.style.opacity = "0.0";
            }
            return;
        }

        if (CaretBrowsing.isControlThatNeedsArrowKeys(
            document.activeElement)) {
            let node = document.activeElement;
            CaretBrowsing.caretWidth = node.offsetWidth;
            CaretBrowsing.caretHeight = node.offsetHeight;
            CaretBrowsing.caretX = 0;
            CaretBrowsing.caretY = 0;
            while (node.offsetParent) {
                CaretBrowsing.caretX += node.offsetLeft;
                CaretBrowsing.caretY += node.offsetTop;
                node = node.offsetParent;
            }
            CaretBrowsing.isSelectionCollapsed = false;
        } else if (range.startOffset !== range.endOffset ||
                   range.startContainer !== range.endContainer) {
            const rect = range.getBoundingClientRect();
            if (!rect) {
                return;
            }
            CaretBrowsing.caretX = rect.left + window.pageXOffset;
            CaretBrowsing.caretY = rect.top + window.pageYOffset;
            CaretBrowsing.caretWidth = rect.width;
            CaretBrowsing.caretHeight = rect.height;
            CaretBrowsing.isSelectionCollapsed = false;
        } else {
            const rect = CaretBrowsing.getCursorRect(
                new Cursor(range.startContainer,
                           range.startOffset,
                           TraverseUtil.getNodeText(range.startContainer)));
            CaretBrowsing.caretX = rect.left;
            CaretBrowsing.caretY = rect.top;
            CaretBrowsing.caretWidth = rect.width;
            CaretBrowsing.caretHeight = rect.height;
            CaretBrowsing.isSelectionCollapsed = true;
        }

        if (CaretBrowsing.caretElement) {
            const element = CaretBrowsing.caretElement;
            if (CaretBrowsing.isSelectionCollapsed) {
                element.style.opacity = "1.0";
                element.style.left = `${CaretBrowsing.caretX}px`;
                element.style.top = `${CaretBrowsing.caretY}px`;
                element.style.width = `${CaretBrowsing.caretWidth}px`;
                element.style.height = `${CaretBrowsing.caretHeight}px`;
            } else {
                element.style.opacity = "0.0";
            }
        } else {
            CaretBrowsing.createCaretElement();
        }

        let elem = range.startContainer;
        if (elem.constructor === Text) {
            elem = elem.parentElement;
        }
        const style = window.getComputedStyle(elem);
        const bg = axs.utils.getBgColor(style, elem);
        const fg = axs.utils.getFgColor(style, elem, bg);
        CaretBrowsing.caretBackground = axs.color.colorToString(bg);
        CaretBrowsing.caretForeground = axs.color.colorToString(fg);

        if (scrollToSelection) {
            const rect = CaretBrowsing.getCursorRect(
                new Cursor(sel.focusNode, sel.focusOffset,
                           TraverseUtil.getNodeText(sel.focusNode)));

            const yscroll = window.pageYOffset;
            const pageHeight = window.innerHeight;
            const caretY = rect.top;
            const caretHeight = Math.min(rect.height, 30);
            if (yscroll + pageHeight < caretY + caretHeight) {
                window.scroll(0, (caretY + caretHeight - pageHeight + 100));
            } else if (caretY < yscroll) {
                window.scroll(0, (caretY - 100));
            }
        }

        if (Math.abs(previousX - CaretBrowsing.caretX) > 500 ||
            Math.abs(previousY - CaretBrowsing.caretY) > 100) {
            if (CaretBrowsing.onJump === "anim") {
                CaretBrowsing.animateCaretElement();
            } else if (CaretBrowsing.onJump === "flash") {
                CaretBrowsing.flashCaretElement();
            }
        }
    };

CaretBrowsing.toggle = function(enabled) {
    if (enabled == undefined) {
        enabled = !CaretBrowsing.isEnabled;
    }

    CaretBrowsing.isEnabled = enabled;
    const obj = {};
    obj.enabled = CaretBrowsing.isEnabled;
    CaretBrowsing.updateIsCaretVisible();
    __webmacsHandler__.onCaretBrowsing(obj.enabled);
};

CaretBrowsing.onClick = function() {
    console.log("onclick" + CaretBrowsing.isEnabled);
    if (!CaretBrowsing.isEnabled) {
        return true;
    }
    window.setTimeout(() => {
        CaretBrowsing.targetX = null;
        CaretBrowsing.updateCaretOrSelection(false);
    }, 0);
    return true;
};

CaretBrowsing.caretBlinkFunction = function() {
    if (CaretBrowsing.caretElement) {
        if (CaretBrowsing.blinkFlag) {
            CaretBrowsing.caretElement.style.backgroundColor =
                CaretBrowsing.caretForeground;
            CaretBrowsing.blinkFlag = false;
        } else {
            CaretBrowsing.caretElement.style.backgroundColor =
                CaretBrowsing.caretBackground;
            CaretBrowsing.blinkFlag = true;
        }
    }
};

CaretBrowsing.updateIsCaretVisible = function() {
    CaretBrowsing.isCaretVisible =
        (CaretBrowsing.isEnabled && CaretBrowsing.isWindowFocused);
    if (CaretBrowsing.isCaretVisible && !CaretBrowsing.caretElement) {
        CaretBrowsing.setInitialCursor();
        CaretBrowsing.updateCaretOrSelection(true);
        if (CaretBrowsing.caretElement) {
            CaretBrowsing.blinkFunctionId = window.setInterval(
                CaretBrowsing.caretBlinkFunction, 500);
        }
    } else if (!CaretBrowsing.isCaretVisible &&
               CaretBrowsing.caretElement) {
        window.clearInterval(CaretBrowsing.blinkFunctionId);
        if (CaretBrowsing.caretElement) {
            CaretBrowsing.isSelectionCollapsed = false;
            CaretBrowsing.caretElement.parentElement.removeChild(
                CaretBrowsing.caretElement);
            CaretBrowsing.caretElement = null;
        }
    }
};

CaretBrowsing.onWindowFocus = function() {
    CaretBrowsing.isWindowFocused = true;
    CaretBrowsing.updateIsCaretVisible();
};

CaretBrowsing.onWindowBlur = function() {
    CaretBrowsing.isWindowFocused = false;
    CaretBrowsing.updateIsCaretVisible();
};

CaretBrowsing.init = function() {
    CaretBrowsing.isWindowFocused = document.hasFocus();

    document.addEventListener("click", CaretBrowsing.onClick, false);
    window.addEventListener("focus", CaretBrowsing.onWindowFocus, false);
    window.addEventListener("blur", CaretBrowsing.onWindowBlur, false);
};

window.setTimeout(() => {
    if (!window.caretBrowsingLoaded) {
        window.caretBrowsingLoaded = true;
        CaretBrowsing.init();
    }
}, 0);

/**
 * Moves the cursor forwards to the next valid position.
 * @param {Cursor} cursor The current cursor location.
 *     On exit, the cursor will be at the next position.
 * @param {Array<Node>} nodesCrossed Any HTML nodes crossed between the
 *     initial and final cursor position will be pushed onto this array.
 * @return {?string} The character reached, or null if the bottom of the
 *     document has been reached.
 */
CaretBrowsing.forwards = function(cursor, nodesCrossed) {
    var previousCursor = cursor.clone();
    var result = TraverseUtil.forwardsChar(cursor, nodesCrossed);

    // Work around the fact that TraverseUtil.forwardsChar returns once per
    // char in a block of text, rather than once per possible selection
    // position in a block of text.
    if (result && cursor.node != previousCursor.node && cursor.index > 0) {
        cursor.index = 0;
    }

    return result;
};

/**
 * Moves the cursor backwards to the previous valid position.
 * @param {Cursor} cursor The current cursor location.
 *     On exit, the cursor will be at the previous position.
 * @param {Array<Node>} nodesCrossed Any HTML nodes crossed between the
 *     initial and final cursor position will be pushed onto this array.
 * @return {?string} The character reached, or null if the top of the
 *     document has been reached.
 */
CaretBrowsing.backwards = function(cursor, nodesCrossed) {
    var previousCursor = cursor.clone();
    var result = TraverseUtil.backwardsChar(cursor, nodesCrossed);

    // Work around the fact that TraverseUtil.backwardsChar returns once per
    // char in a block of text, rather than once per possible selection
    // position in a block of text.
    if (result &&
        cursor.node != previousCursor.node &&
        cursor.index < cursor.text.length) {
        cursor.index = cursor.text.length;
    }

    return result;
};

/**
 * Called when the user presses the right arrow. If there's a selection,
 * moves the cursor to the end of the selection range. If it's a cursor,
 * moves past one character.
 * @param {Event} evt The DOM event.
 * @return {boolean} True if the default action should be performed.
 */
CaretBrowsing.moveRight = function(by_word) {
    CaretBrowsing.targetX = null;
    var use_mark = false;

    var sel = window.getSelection();
    if (!use_mark && !CaretBrowsing.isCollapsed(sel)) {
        var right = CaretBrowsing.makeRightCursor(sel);
        CaretBrowsing.setAndValidateSelection(right, right);
        return false;
    }

    var start = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeLeftCursor(sel) :
        CaretBrowsing.makeAnchorCursor(sel);
    var end = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeRightCursor(sel) :
        CaretBrowsing.makeFocusCursor(sel);
    var previousEnd = end.clone();
    var nodesCrossed = [];
    while (true) {
        var result;
        if (by_word) {
            result = TraverseUtil.getNextWord(previousEnd, end, nodesCrossed);
        } else {
            previousEnd = end.clone();
            result = CaretBrowsing.forwards(end, nodesCrossed);
        }

        if (result === null) {
            return CaretBrowsing.moveLeft(by_word);
        }

        if (CaretBrowsing.setAndValidateSelection(
            use_mark ? start : end, end)) {
            break;
        }
    }

    if (!use_mark) {
        nodesCrossed.push(end.node);
        CaretBrowsing.setFocusToFirstFocusable(nodesCrossed);
    }

    return false;
};

/**
 * Called when the user presses the left arrow. If there's a selection,
 * moves the cursor to the start of the selection range. If it's a cursor,
 * moves backwards past one character.
 * @param {Event} evt The DOM event.
 * @return {boolean} True if the default action should be performed.
 */
CaretBrowsing.moveLeft = function(by_word) {
    CaretBrowsing.targetX = null;
    var use_mark = false;

    var sel = window.getSelection();
    if (!use_mark && !CaretBrowsing.isCollapsed(sel)) {
        var left = CaretBrowsing.makeLeftCursor(sel);
        CaretBrowsing.setAndValidateSelection(left, left);
        return false;
    }

    var start = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeLeftCursor(sel) :
        CaretBrowsing.makeFocusCursor(sel);
    var end = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeRightCursor(sel) :
        CaretBrowsing.makeAnchorCursor(sel);
    var previousStart = start.clone();
    var nodesCrossed = [];
    while (true) {
        var result;
        if (by_word) {
            result = TraverseUtil.getPreviousWord(
                start, previousStart, nodesCrossed);
        } else {
            previousStart = start.clone();
            result = CaretBrowsing.backwards(start, nodesCrossed);
        }

        if (result === null) {
            break;
        }

        if (CaretBrowsing.setAndValidateSelection(
            use_mark ? end : start, start)) {
            break;
        }
    }

    if (!use_mark) {
        nodesCrossed.push(start.node);
        CaretBrowsing.setFocusToFirstFocusable(nodesCrossed);
    }

    return false;
};


/**
 * Called when the user presses the down arrow. If there's a selection,
 * moves the cursor to the end of the selection range. If it's a cursor,
 * attempts to move to the equivalent horizontal pixel position in the
 * subsequent line of text. If this is impossible, go to the first character
 * of the next line.
 * @param {Event} evt The DOM event.
 * @return {boolean} True if the default action should be performed.
 */
CaretBrowsing.moveDown = function() {
    var sel = window.getSelection();
    var use_mark = false;
    if (!use_mark && !CaretBrowsing.isCollapsed(sel)) {
        var right = CaretBrowsing.makeRightCursor(sel);
        CaretBrowsing.setAndValidateSelection(right, right);
        return false;
    }

    var start = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeLeftCursor(sel) :
        CaretBrowsing.makeAnchorCursor(sel);
    var end = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeRightCursor(sel) :
        CaretBrowsing.makeFocusCursor(sel);
    var endRect = CaretBrowsing.getCursorRect(end);
    if (CaretBrowsing.targetX === null) {
        CaretBrowsing.targetX = endRect.left;
    }
    var previousEnd = end.clone();
    var leftPos = end.clone();
    var rightPos = end.clone();
    var bestPos = null;
    var bestY = null;
    var bestDelta = null;
    var bestHeight = null;
    var nodesCrossed = [];
    var y = -1;
    while (true) {
        if (null === CaretBrowsing.forwards(rightPos, nodesCrossed)) {
            if (CaretBrowsing.setAndValidateSelection(
                use_mark ? start : leftPos, leftPos)) {
                break;
            } else {
                return CaretBrowsing.moveLeft();
            }
            break;
        }
        var range = document.createRange();
        range.setStart(leftPos.node, leftPos.index);
        range.setEnd(rightPos.node, rightPos.index);
        var rect = range.getBoundingClientRect();
        if (rect && rect.width < rect.height) {
            y = rect.top + window.pageYOffset;

            // Return the best match so far if we get half a line past the best.
            if (bestY != null && y > bestY + bestHeight / 2) {
                if (CaretBrowsing.setAndValidateSelection(
                    use_mark ? start : bestPos, bestPos)) {
                    break;
                } else {
                    bestY = null;
                }
            }

            // Stop here if we're an entire line the wrong direction
            // (for example, we reached the top of the next column).
            if (y < endRect.top - endRect.height) {
                if (CaretBrowsing.setAndValidateSelection(
                    use_mark ? start : leftPos, leftPos)) {
                    break;
                }
            }

            // Otherwise look to see if this current position is on the
            // next line and better than the previous best match, if any.
            if (y >= endRect.top + endRect.height) {
                var deltaLeft = Math.abs(CaretBrowsing.targetX - rect.left);
                if ((bestDelta == null || deltaLeft < bestDelta) &&
                    (leftPos.node != end.node || leftPos.index != end.index)) {
                    bestPos = leftPos.clone();
                    bestY = y;
                    bestDelta = deltaLeft;
                    bestHeight = rect.height;
                }
                var deltaRight = Math.abs(CaretBrowsing.targetX - rect.right);
                if (bestDelta == null || deltaRight < bestDelta) {
                    bestPos = rightPos.clone();
                    bestY = y;
                    bestDelta = deltaRight;
                    bestHeight = rect.height;
                }

                // Return the best match so far if the deltas are getting worse,
                // not better.
                if (bestDelta != null &&
                    deltaLeft > bestDelta &&
                    deltaRight > bestDelta) {
                    if (CaretBrowsing.setAndValidateSelection(
                        use_mark ? start : bestPos, bestPos)) {
                        break;
                    } else {
                        bestY = null;
                    }
                }
            }
        }
        leftPos = rightPos.clone();
    }

    if (!use_mark) {
        CaretBrowsing.setFocusToNode(leftPos.node);
    }

    window.setTimeout(() => {
        CaretBrowsing.updateCaretOrSelection(true);
    }, 0);

    return false;
};

/**
 * Called when the user presses the up arrow. If there's a selection,
 * moves the cursor to the start of the selection range. If it's a cursor,
 * attempts to move to the equivalent horizontal pixel position in the
 * previous line of text. If this is impossible, go to the last character
 * of the previous line.
 * @param {Event} evt The DOM event.
 * @return {boolean} True if the default action should be performed.
 */
CaretBrowsing.moveUp = function() {
    var sel = window.getSelection();
    var use_mark = false;
    if (!use_mark && !CaretBrowsing.isCollapsed(sel)) {
        var left = CaretBrowsing.makeLeftCursor(sel);
        CaretBrowsing.setAndValidateSelection(left, left);
        return false;
    }

    var start = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeLeftCursor(sel) :
        CaretBrowsing.makeFocusCursor(sel);
    var end = CaretBrowsing.isAmbiguous(sel) ?
        CaretBrowsing.makeRightCursor(sel) :
        CaretBrowsing.makeAnchorCursor(sel);
    var startRect = CaretBrowsing.getCursorRect(start);
    if (CaretBrowsing.targetX === null) {
        CaretBrowsing.targetX = startRect.left;
    }
    var previousStart = start.clone();
    var leftPos = start.clone();
    var rightPos = start.clone();
    var bestPos = null;
    var bestY = null;
    var bestDelta = null;
    var bestHeight = null;
    var nodesCrossed = [];
    var y = 999999;
    while (true) {
        if (null === CaretBrowsing.backwards(leftPos, nodesCrossed)) {
            CaretBrowsing.setAndValidateSelection(
                use_mark ? end : rightPos, rightPos);
            break;
        }
        var range = document.createRange();
        range.setStart(leftPos.node, leftPos.index);
        range.setEnd(rightPos.node, rightPos.index);
        var rect = range.getBoundingClientRect();
        if (rect && rect.width < rect.height) {
            y = rect.top + window.pageYOffset;

            // Return the best match so far if we get half a line past the best.
            if (bestY != null && y < bestY - bestHeight / 2) {
                if (CaretBrowsing.setAndValidateSelection(
                    use_mark ? end : bestPos, bestPos)) {
                    break;
                } else {
                    bestY = null;
                }
            }

            // Exit if we're an entire line the wrong direction
            // (for example, we reached the bottom of the previous column.)
            if (y > startRect.top + startRect.height) {
                if (CaretBrowsing.setAndValidateSelection(
                    use_mark ? end : rightPos, rightPos)) {
                    break;
                }
            }

            // Otherwise look to see if this current position is on the
            // next line and better than the previous best match, if any.
            if (y <= startRect.top - startRect.height) {
                var deltaLeft = Math.abs(CaretBrowsing.targetX - rect.left);
                if (bestDelta == null || deltaLeft < bestDelta) {
                    bestPos = leftPos.clone();
                    bestY = y;
                    bestDelta = deltaLeft;
                    bestHeight = rect.height;
                }
                var deltaRight = Math.abs(CaretBrowsing.targetX - rect.right);
                if ((bestDelta == null || deltaRight < bestDelta) &&
                    (rightPos.node != start.node || rightPos.index != start.index)) {
                    bestPos = rightPos.clone();
                    bestY = y;
                    bestDelta = deltaRight;
                    bestHeight = rect.height;
                }

                // Return the best match so far if the deltas are getting worse,
                // not better.
                if (bestDelta != null &&
                    deltaLeft > bestDelta &&
                    deltaRight > bestDelta) {
                    if (CaretBrowsing.setAndValidateSelection(
                        use_mark ? end : bestPos, bestPos)) {
                        break;
                    } else {
                        bestY = null;
                    }
                }
            }
        }
        rightPos = leftPos.clone();
    }

    if (!use_mark) {
        CaretBrowsing.setFocusToNode(rightPos.node);
    }

    window.setTimeout(() => {
        CaretBrowsing.updateCaretOrSelection(true);
    }, 0);

    return false;
};
