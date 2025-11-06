/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2025
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Object representing a collapse/expand icon on a block.
 */
'use strict';

goog.provide('Blockly.CollapseIcon');

goog.require('Blockly.Icon');
goog.require('Blockly.utils');


/**
 * Class for a collapse icon.
 * @param {!Blockly.Block} block The block associated with this icon.
 * @param {string} inputName The name of the substack input, or '__next__' for next chain.
 * @extends {Blockly.Icon}
 * @constructor
 */
Blockly.CollapseIcon = function(block, inputName) {
  Blockly.CollapseIcon.superClass_.constructor.call(this, block);
  this.inputName_ = inputName;
  this.createIcon();
};
goog.inherits(Blockly.CollapseIcon, Blockly.Icon);

/**
 * This icon doesn't have a bubble, so it shouldn't be hidden when collapsed.
 */
Blockly.CollapseIcon.prototype.collapseHidden = false;

/**
 * Size of the collapse icon (diameter of the circle).
 */
Blockly.CollapseIcon.prototype.SIZE = 20;

/**
 * Create the icon on the block.
 * Override to add mousedown handler to prevent dragging.
 */
Blockly.CollapseIcon.prototype.createIcon = function() {
  if (this.iconGroup_) {
    // Icon already exists.
    return;
  }
  this.iconGroup_ = Blockly.utils.createSvgElement('g',
      {'class': 'blocklyIconGroup'}, null);
  if (this.block_.isInFlyout) {
    Blockly.utils.addClass(
        /** @type {!Element} */ (this.iconGroup_), 'blocklyIconGroupReadonly');
  }
  this.drawIcon_(this.iconGroup_);

  this.block_.getSvgRoot().appendChild(this.iconGroup_);

  // Bind mousedown to prevent dragging
  Blockly.bindEventWithChecks_(
      this.iconGroup_, 'mousedown', this, this.iconMouseDown_);

  // Bind mouseup for the actual click action
  Blockly.bindEventWithChecks_(
      this.iconGroup_, 'mouseup', this, this.iconClick_);

  this.updateEditable();
};

/**
 * Handle mousedown to prevent block dragging.
 * @param {!Event} e Mouse down event.
 * @private
 */
Blockly.CollapseIcon.prototype.iconMouseDown_ = function(e) {
  if (this.block_.workspace.isDragging()) {
    return;
  }
  // Prevent the event from reaching the block
  e.stopPropagation();
  e.preventDefault();
};

/**
 * Draw the collapse icon.
 * @param {!Element} group The icon group.
 * @private
 */
Blockly.CollapseIcon.prototype.drawIcon_ = function(group) {
  // Completely invisible background circle for larger click area (hot zone)
  // No hover effect, no visible background - just for clicking
  var hasContent = this.block_.getCollapsedBlockCountForSubstack_(this.inputName_) > 0;
  this.hotZone_ = Blockly.utils.createSvgElement('circle',
      {
        'class': 'blocklyIconShape',
        'r': '12',  // Larger radius for easy clicking
        'cx': '10',
        'cy': '10',
        'fill': 'transparent',
        'stroke': 'none',
        'style': hasContent ? 'cursor: pointer;' : 'cursor: default;'
      },
      group);

  // Arrow symbol - points down when expanded (default), right when collapsed
  // White icon with no background for visibility on colored blocks
  var isCollapsed = this.block_.isSubstackCollapsed(this.inputName_);
  var hasContent = this.block_.getCollapsedBlockCountForSubstack_(this.inputName_) > 0;
  this.arrowPath_ = Blockly.utils.createSvgElement('path',
      {
        'class': 'blocklyCollapseIconArrow',
        'd': isCollapsed ?
            'M 7,6 L 11,10 L 7,14' :   // Right arrow (collapsed state - can expand)
            'M 6,7 L 10,11 L 14,7',    // Down arrow (expanded state - can collapse)
        'fill': 'none',
        'stroke': '#ffffff',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-opacity': hasContent ? '0.9' : '0.3',  // Dim if empty
        'style': 'pointer-events: none;' + (hasContent ? '' : ' cursor: default;')
      },
      group);
};

/**
 * Update the icon to reflect the current collapse state and content availability.
 */
Blockly.CollapseIcon.prototype.updateIcon = function() {
  if (this.arrowPath_) {
    // Update arrow direction based on collapse state
    var isCollapsed = this.block_.isSubstackCollapsed(this.inputName_);
    var hasContent = this.block_.getCollapsedBlockCountForSubstack_(this.inputName_) > 0;

    this.arrowPath_.setAttribute('d', isCollapsed ?
        'M 7,6 L 11,10 L 7,14' :    // Right arrow (collapsed state - can expand)
        'M 6,7 L 10,11 L 14,7');    // Down arrow (expanded state - can collapse)

    // Update opacity based on whether there's content
    this.arrowPath_.setAttribute('stroke-opacity', hasContent ? '0.9' : '0.3');

    // Update cursor based on whether there's content
    if (this.hotZone_) {
      this.hotZone_.setAttribute('style', hasContent ? 'cursor: pointer;' : 'cursor: default;');
    }
  }
};

/**
 * Clicking on the icon toggles the collapse state.
 * @param {!Event} e Mouse click event.
 * @protected
 */
Blockly.CollapseIcon.prototype.iconClick_ = function(e) {
  if (this.block_.workspace.isDragging()) {
    return;
  }
  if (!this.block_.isInFlyout && !Blockly.utils.isRightButton(e)) {
    // Stop the event from bubbling up to the block
    e.stopPropagation();
    e.preventDefault();

    // Check if there's content to collapse
    var count = this.block_.getCollapsedBlockCountForSubstack_(this.inputName_);
    if (count === 0) {
      // No content to collapse, ignore click
      return;
    }

    var currentState = this.block_.isSubstackCollapsed(this.inputName_);
    this.block_.setSubstackCollapsed(this.inputName_, !currentState);
  }
};

/**
 * Render the icon with custom positioning for substack icons.
 * @param {number} cursorX Horizontal offset at which to position the icon.
 * @param {number=} opt_cursorY Optional vertical offset for substack icons.
 * @return {number} Horizontal offset for next item to draw.
 */
Blockly.CollapseIcon.prototype.renderIcon = function(cursorX, opt_cursorY) {
  this.iconGroup_.setAttribute('display', 'block');

  // For substack icons (not '__next__'), use custom Y positioning if provided
  if (this.inputName_ !== '__next__' && opt_cursorY !== undefined) {
    // Position inside the block, near the right edge but within the block boundary
    var blockWidth = this.block_.width || 100;
    // Position icon 30px from the right edge, inside the block
    var x = this.block_.RTL ? -(blockWidth - 30) : (blockWidth - 30);
    this.iconGroup_.setAttribute('transform',
        'translate(' + x + ',' + opt_cursorY + ')');
    this.computeIconLocation();
    return cursorX; // Don't advance cursor for substack icons
  }

  // For '__next__' icons (hat blocks), use standard positioning in top-left
  var TOP_MARGIN = 5;
  var width = this.SIZE;
  if (this.block_.RTL) {
    cursorX -= width;
  }
  this.iconGroup_.setAttribute('transform',
      'translate(' + cursorX + ',' + TOP_MARGIN + ')');
  this.computeIconLocation();
  if (this.block_.RTL) {
    cursorX -= Blockly.BlockSvg.SEP_SPACE_X;
  } else {
    cursorX += width + Blockly.BlockSvg.SEP_SPACE_X;
  }
  return cursorX;
};

/**
 * This icon doesn't have a visible bubble.
 * @return {boolean} Always false.
 */
Blockly.CollapseIcon.prototype.isVisible = function() {
  return false;
};

/**
 * This icon doesn't have a bubble to show/hide.
 * @param {boolean} visible Ignored.
 */
Blockly.CollapseIcon.prototype.setVisible = function(visible) {
  // No-op, this icon doesn't have a bubble
};

/**
 * Dispose of this icon.
 */
Blockly.CollapseIcon.prototype.dispose = function() {
  // Dispose of and unlink the icon.
  if (this.iconGroup_) {
    goog.dom.removeNode(this.iconGroup_);
    this.iconGroup_ = null;
  }
  this.arrowPath_ = null;
  this.block_ = null;
};
