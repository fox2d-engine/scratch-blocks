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
 * @fileoverview Manages collapse buttons in the left gutter area.
 * The gutter is an SVG group positioned to the left of the block canvas,
 * similar to VSCode's line number gutter with collapse icons.
 */
'use strict';

goog.provide('Blockly.CollapseGutter');

goog.require('Blockly.utils');


/**
 * Class for managing collapse buttons in the workspace gutter.
 * @param {!Blockly.WorkspaceSvg} workspace The workspace.
 * @constructor
 */
Blockly.CollapseGutter = function(workspace) {
  /**
   * The workspace this gutter belongs to.
   * @type {!Blockly.WorkspaceSvg}
   * @private
   */
  this.workspace_ = workspace;

  /**
   * The gutter SVG group element.
   * @type {SVGElement}
   * @private
   */
  this.svgGroup_ = null;

  /**
   * Background rectangle for the gutter.
   * @type {SVGElement}
   * @private
   */
  this.backgroundRect_ = null;

  /**
   * Map of button elements by key (blockId_inputName).
   * @type {!Object.<string, !SVGElement>}
   * @private
   */
  this.buttons_ = {};

  /**
   * Throttle timer for refresh operations.
   * @type {?number}
   * @private
   */
  this.throttleTimer_ = null;

  /**
   * Whether the gutter is currently visible.
   * @type {boolean}
   * @private
   */
  this.visible_ = true;

  /**
   * Request animation frame ID for updates.
   * @type {?number}
   * @private
   */
  this.updateFrameId_ = null;

  /**
   * Event listeners for cleanup.
   * @type {!Array}
   * @private
   */
  this.eventListeners_ = [];
};

/**
 * Width of the gutter in pixels.
 * @const
 */
Blockly.CollapseGutter.WIDTH = 20;

/**
 * Buffer zone outside viewport for button visibility (in pixels).
 * Buttons slightly outside the viewport remain visible for smoother scrolling.
 * @const
 */
Blockly.CollapseGutter.VISIBILITY_BUFFER = 30;

/**
 * Default Y offset for hat block collapse buttons.
 * @const
 */
Blockly.CollapseGutter.HAT_BLOCK_Y_OFFSET = 10;

/**
 * Create the gutter's DOM.
 * @return {!SVGElement} The gutter's SVG group.
 */
Blockly.CollapseGutter.prototype.createDom = function() {
  this.svgGroup_ = Blockly.utils.createSvgElement('g', {
    'class': 'blocklyCollapseGutter'
  }, null);

  // Background (same style as minimap)
  this.backgroundRect_ = Blockly.utils.createSvgElement('rect', {
    'class': 'blocklyCollapseGutterBackground',
    'width': Blockly.CollapseGutter.WIDTH,
    'height': '100%',
    'fill': '#f8f8f8',
    'fill-opacity': '0.8',
    'stroke': '#ddd',
    'stroke-width': 1
  }, this.svgGroup_);

  // Set initial opacity (same as minimap)
  this.svgGroup_.setAttribute('opacity', '0.5');

  // Hover effects (same as minimap) - save listeners for cleanup
  var self = this;
  this.eventListeners_.push(
      Blockly.bindEvent_(this.svgGroup_, 'mouseenter', null, function() {
        self.svgGroup_.setAttribute('opacity', '0.8');
      })
  );
  this.eventListeners_.push(
      Blockly.bindEvent_(this.svgGroup_, 'mouseleave', null, function() {
        self.svgGroup_.setAttribute('opacity', '0.5');
      })
  );

  return this.svgGroup_;
};

/**
 * Create or update a collapse button for a block's substack.
 * @param {!Blockly.BlockSvg} block The block.
 * @param {string} inputName The input name ('__next__' for hat blocks, 'SUBSTACK', etc.).
 * @private
 */
Blockly.CollapseGutter.prototype.updateButton_ = function(block, inputName) {
  var key = block.id + '_' + inputName;

  // Calculate button position
  var blockPos = block.getRelativeToSurfaceXY();
  var scale = this.workspace_.scale;

  // Determine Y offset based on input type
  var yOffset = 0;
  if (inputName === '__next__') {
    // Hat block: position at top of block
    yOffset = Blockly.CollapseGutter.HAT_BLOCK_Y_OFFSET;
  } else {
    // Substack: find the input and position at its Y coordinate
    for (var i = 0; i < block.inputList.length; i++) {
      var input = block.inputList[i];
      if (input.name === inputName && input.connection && input.connection.offsetInBlock_) {
        yOffset = input.connection.offsetInBlock_.y || 0;
        break;
      }
    }
  }

  // Y position in blockCanvas coordinates (before blockCanvas transform)
  var yBlockCanvas = blockPos.y + yOffset;

  // Apply the same transform as blockCanvas: translate + scale
  // This gives us the visual Y position relative to the SVG root
  var yTransformed = yBlockCanvas * scale + this.workspace_.scrollY;

  // Check if button is visible in viewport
  var metrics = this.workspace_.getMetrics();
  var viewportTop = metrics.absoluteTop;
  var viewportBottom = viewportTop + metrics.viewHeight;

  if (yTransformed < viewportTop - Blockly.CollapseGutter.VISIBILITY_BUFFER ||
      yTransformed > viewportBottom + Blockly.CollapseGutter.VISIBILITY_BUFFER) {
    if (this.buttons_[key]) {
      this.buttons_[key].setAttribute('display', 'none');
    }
    return;
  }

  var button = this.buttons_[key];
  if (!button) {
    // Create new button
    button = this.createButton_(block, inputName);
    this.buttons_[key] = button;
    this.svgGroup_.appendChild(button);
  }

  // Update position and state
  // Position relative to gutter (which is at absoluteTop)
  var yGutter = yTransformed - viewportTop;
  button.setAttribute('display', 'block');
  button.setAttribute('transform', 'translate(' + (Blockly.CollapseGutter.WIDTH / 2) + ',' + yGutter + ')');

  var isCollapsed = block.isSubstackCollapsed(inputName);
  var hasContent = block.getCollapsedBlockCountForSubstack_(inputName) > 0;

  // Update icon (the path element)
  var icon = button.icon_;
  if (icon) {
    // Right chevron when collapsed, down chevron when expanded (VSCode style)
    var pathD = isCollapsed ?
        'M -2,-4 L 2,0 L -2,4' :      // Right chevron (collapsed - can expand)
        'M -4,-2 L 0,2 L 4,-2';       // Down chevron (expanded - can collapse)
    icon.setAttribute('d', pathD);
    icon.setAttribute('stroke-opacity', hasContent ? '0.7' : '0.3');
  }

  button.style.cursor = hasContent ? 'pointer' : 'default';
};

/**
 * Create a new collapse button element.
 * @param {!Blockly.BlockSvg} block The block.
 * @param {string} inputName The input name.
 * @return {!SVGElement} The button group element.
 * @private
 */
Blockly.CollapseGutter.prototype.createButton_ = function(block, inputName) {
  var buttonGroup = Blockly.utils.createSvgElement('g', {
    'class': 'blocklyCollapseGutterButton'
  }, null);

  // Transparent circle for larger click area (invisible)
  Blockly.utils.createSvgElement('circle', {
    'r': '10',
    'fill': 'transparent',
    'stroke': 'none'
  }, buttonGroup);

  // Chevron icon (VSCode style - simple line, no background)
  var icon = Blockly.utils.createSvgElement('path', {
    'd': 'M -4,-2 L 0,2 L 4,-2',  // Down chevron by default
    'fill': 'none',
    'stroke': '#666',
    'stroke-width': '1.5',
    'stroke-opacity': '0.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }, buttonGroup);

  // Store reference
  buttonGroup.icon_ = icon;

  // Hover effect - just brighten the icon
  buttonGroup.addEventListener('mouseenter', function() {
    icon.setAttribute('stroke-opacity', '1');
    icon.setAttribute('stroke', '#444');
  });
  buttonGroup.addEventListener('mouseleave', function() {
    var hasContent = block.getCollapsedBlockCountForSubstack_(inputName) > 0;
    icon.setAttribute('stroke-opacity', hasContent ? '0.7' : '0.3');
    icon.setAttribute('stroke', '#666');
  });

  // Click event
  var self = this;
  buttonGroup.addEventListener('click', function(e) {
    e.stopPropagation();
    e.preventDefault();

    var count = block.getCollapsedBlockCountForSubstack_(inputName);
    if (count === 0) {
      return;
    }

    var currentState = block.isSubstackCollapsed(inputName);
    block.setSubstackCollapsed(inputName, !currentState);

    // Immediately refresh gutter to update icon state
    self.refresh();
  });

  return buttonGroup;
};

/**
 * Remove a button from the gutter.
 * @param {string} blockId The block ID.
 * @param {string} inputName The input name.
 * @private
 */
Blockly.CollapseGutter.prototype.removeButton_ = function(blockId, inputName) {
  var key = blockId + '_' + inputName;
  if (this.buttons_[key]) {
    goog.dom.removeNode(this.buttons_[key]);
    delete this.buttons_[key];
  }
};

/**
 * Refresh all buttons (called on scroll, zoom, block move).
 * Uses throttling to avoid excessive updates.
 */
Blockly.CollapseGutter.prototype.refresh = function() {
  if (this.updateFrameId_) {
    return;
  }

  var self = this;
  this.updateFrameId_ = requestAnimationFrame(function() {
    self.updateFrameId_ = null;
    self.refreshImmediate_();
  });
};

/**
 * Immediately refresh all button positions.
 * @private
 */
Blockly.CollapseGutter.prototype.refreshImmediate_ = function() {
  if (!this.svgGroup_ || !this.visible_) {
    return;
  }

  // Collect buttons that should be displayed
  var neededButtons = {};
  var topBlocks = this.workspace_.getTopBlocks(false);

  for (var i = 0; i < topBlocks.length; i++) {
    this.collectButtons_(topBlocks[i], neededButtons);
  }

  // Update needed buttons
  for (var key in neededButtons) {
    var info = neededButtons[key];
    this.updateButton_(info.block, info.inputName);
  }

  // Remove buttons that are no longer needed
  for (var key in this.buttons_) {
    if (!neededButtons[key]) {
      goog.dom.removeNode(this.buttons_[key]);
      delete this.buttons_[key];
    }
  }
};

/**
 * Recursively collect buttons needed for a block and its children.
 * @param {!Blockly.BlockSvg} block The block.
 * @param {!Object} neededButtons Output object mapping keys to {block, inputName}.
 * @private
 */
Blockly.CollapseGutter.prototype.collectButtons_ = function(block, neededButtons) {
  // Skip blocks that are hidden (collapsed by parent)
  if (block.isCollapsedHidden_) {
    return;
  }

  // Skip blocks that are not in the DOM
  if (!block.svgGroup_ || !block.svgGroup_.parentNode) {
    return;
  }

  // Hat blocks: check for __next__ chain
  if (!block.previousConnection && block.nextConnection) {
    var count = block.getCollapsedBlockCountForSubstack_('__next__');
    if (count > 0) {
      var key = block.id + '_' + '__next__';
      neededButtons[key] = {block: block, inputName: '__next__'};
    }
  }

  // C-shaped blocks: check substacks
  for (var i = 0; i < block.inputList.length; i++) {
    var input = block.inputList[i];
    if (input.type === Blockly.NEXT_STATEMENT) {
      // Skip custom_block for procedures_definition
      if (!(block.type === 'procedures_definition' && input.name === 'custom_block')) {
        var key = block.id + '_' + input.name;
        neededButtons[key] = {block: block, inputName: input.name};
      }
    }
  }

  // Recurse into children (but not collapsed ones)
  var children = block.getChildren(false);
  for (var i = 0; i < children.length; i++) {
    this.collectButtons_(children[i], neededButtons);
  }
};

/**
 * Move the gutter to the correct position.
 * @param {!Object} metrics Workspace metrics.
 */
Blockly.CollapseGutter.prototype.position = function(metrics) {
  if (!this.svgGroup_) {
    return;
  }

  if (!metrics) {
    return;
  }

  // Position on the left side of the workspace
  var x = metrics.absoluteLeft;
  var y = metrics.absoluteTop;

  this.svgGroup_.setAttribute('transform',
      'translate(' + x + ', ' + y + ')');

  // Update background height
  if (this.backgroundRect_) {
    this.backgroundRect_.setAttribute('height', metrics.viewHeight);
  }
};

/**
 * Initialize the gutter.
 */
Blockly.CollapseGutter.prototype.init = function() {
  // Position the gutter first
  var metrics = this.workspace_.getMetrics();
  if (metrics) {
    this.position(metrics);
  }
  // Then refresh buttons
  this.refresh();
};

/**
 * Show or hide the gutter.
 * @param {boolean} visible Whether to show the gutter.
 */
Blockly.CollapseGutter.prototype.setVisible = function(visible) {
  this.visible_ = visible;
  if (this.svgGroup_) {
    this.svgGroup_.setAttribute('display', visible ? 'block' : 'none');
  }
  if (visible) {
    this.refresh();
  }
};

/**
 * Clear all buttons from the gutter.
 */
Blockly.CollapseGutter.prototype.clear = function() {
  for (var key in this.buttons_) {
    goog.dom.removeNode(this.buttons_[key]);
  }
  this.buttons_ = {};
};

/**
 * Dispose of this gutter manager.
 */
Blockly.CollapseGutter.prototype.dispose = function() {
  if (this.updateFrameId_) {
    cancelAnimationFrame(this.updateFrameId_);
    this.updateFrameId_ = null;
  }

  if (this.throttleTimer_) {
    clearTimeout(this.throttleTimer_);
    this.throttleTimer_ = null;
  }

  // Unbind all event listeners
  for (var i = 0; i < this.eventListeners_.length; i++) {
    Blockly.unbindEvent_(this.eventListeners_[i]);
  }
  this.eventListeners_ = [];

  this.clear();

  if (this.svgGroup_) {
    goog.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }

  this.backgroundRect_ = null;
  this.workspace_ = null;
};
