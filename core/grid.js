/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2017 Google Inc.
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
 * @fileoverview Object for configuring and updating a workspace grid in
 * Blockly.
 * @author fenichel@google.com (Rachel Fenichel)
 */
'use strict';

goog.provide('Blockly.Grid');

goog.require('Blockly.utils');

goog.require('goog.userAgent');


/**
 * Class for a workspace's grid.
 * @param {!SVGElement} pattern The grid's SVG pattern, created during injection.
 * @param {!Object} options A dictionary of normalized options for the grid.
 *     See grid documentation:
 *     https://developers.google.com/blockly/guides/configure/web/grid
 * @constructor
 */
Blockly.Grid = function(pattern, options) {
  /**
   * The grid's SVG pattern, created during injection.
   * @type {!SVGElement}
   * @private
   */
  this.gridPattern_ = pattern;

  /**
   * The spacing of the grid lines (in px).
   * @type {number}
   * @private
   */
  this.spacing_ = options['spacing'];

  /**
   * How long the grid lines should be (in px).
   * @type {number}
   * @private
   */
  this.length_ = options['length'];

  /**
   * The horizontal grid line, if it exists.
   * @type {SVGElement}
   * @private
   */
  this.line1_ = pattern.firstChild;

  /**
   * The vertical grid line, if it exists.
   * @type {SVGElement}
   * @private
   */
  this.line2_ = this.line1_ && this.line1_.nextSibling;

  /**
   * Whether blocks should snap to the grid.
   * @type {boolean}
   * @private
   */
  this.snapToGrid_ = options['snap'];

  /**
   * Whether to enable column layout mode (vertical single-column layout).
   * @type {boolean}
   * @private
   */
  this.columnLayoutMode_ = options['columnLayoutMode'] || true;

  /**
   * Whether to automatically clean up (re-sort) blocks after drag.
   * @type {boolean}
   * @private
   */
  this.autoCleanup_ = options['autoCleanup'] || false;

  /**
   * The SVG group for column layout visual guides.
   * @type {SVGElement}
   * @private
   */
  this.columnGuideGroup_ = true;
};

/**
 * The scale of the grid, used to set stroke width on grid lines.
 * This should always be the same as the workspace scale.
 * @type {number}
 * @private
 */
Blockly.Grid.prototype.scale_ = 1;

/**
 * Dispose of this grid and unlink from the DOM.
 * @package
 */
Blockly.Grid.prototype.dispose = function() {
  this.gridPattern_ = null;
  if (this.columnGuideGroup_) {
    goog.dom.removeNode(this.columnGuideGroup_);
    this.columnGuideGroup_ = null;
  }
};

/**
 * Whether blocks should snap to the grid, based on the initial configuration.
 * @return {boolean} True if blocks should snap, false otherwise.
 * @package
 */
Blockly.Grid.prototype.shouldSnap = function() {
  return this.snapToGrid_;
};

/**
 * Get the spacing of the grid points (in px).
 * @return {number} The spacing of the grid points.
 * @package
 */
Blockly.Grid.prototype.getSpacing = function() {
  return this.spacing_;
};

/**
 * Get the id of the pattern element, which should be randomized to avoid
 * conflicts with other Blockly instances on the page.
 * @return {string} The pattern ID.
 * @package
 */
Blockly.Grid.prototype.getPatternId = function() {
  return this.gridPattern_.id;
};

/**
 * Update the grid with a new scale.
 * @param {number} scale The new workspace scale.
 * @package
 */
Blockly.Grid.prototype.update = function(scale) {
  this.scale_ = scale;
  // MSIE freaks if it sees a 0x0 pattern, so set empty patterns to 100x100.
  var safeSpacing = (this.spacing_ * scale) || 100;

  this.gridPattern_.setAttribute('width', safeSpacing);
  this.gridPattern_.setAttribute('height', safeSpacing);

  var half = Math.floor(this.spacing_ / 2) + 0.5;
  var start = half - this.length_ / 2;
  var end = half + this.length_ / 2;

  half *= scale;
  start *= scale;
  end *= scale;

  this.setLineAttributes_(this.line1_, scale, start, end, half, half);
  this.setLineAttributes_(this.line2_, scale, half, half, start, end);
};

/**
 * Set the attributes on one of the lines in the grid.  Use this to update the
 * length and stroke width of the grid lines.
 * @param {!SVGElement} line Which line to update.
 * @param {number} width The new stroke size (in px).
 * @param {number} x1 The new x start position of the line (in px).
 * @param {number} x2 The new x end position of the line (in px).
 * @param {number} y1 The new y start position of the line (in px).
 * @param {number} y2 The new y end position of the line (in px).
 * @private
 */
Blockly.Grid.prototype.setLineAttributes_ = function(line, width, x1, x2, y1, y2) {
  if (line) {
    line.setAttribute('stroke-width', width);
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
  }
};

/**
 * Move the grid to a new x and y position, and make sure that change is visible.
 * @param {number} x The new x position of the grid (in px).
 * @param {number} y The new y position ofthe grid (in px).
 * @package
 */
Blockly.Grid.prototype.moveTo = function(x, y) {
  this.gridPattern_.setAttribute('x', x);
  this.gridPattern_.setAttribute('y', y);

  if (goog.userAgent.IE || goog.userAgent.EDGE) {
    // IE/Edge doesn't notice that the x/y offsets have changed.
    // Force an update.
    this.update(this.scale_);
  }
};

/**
 * Create the DOM for the grid described by options.
 * @param {string} rnd A random ID to append to the pattern's ID.
 * @param {!Object} gridOptions The object containing grid configuration.
 * @param {!SVGElement} defs The root SVG element for this workspace's defs.
 * @return {!SVGElement} The SVG element for the grid pattern.
 * @package
 */
Blockly.Grid.createDom = function(rnd, gridOptions, defs) {
  /*
    <pattern id="blocklyGridPattern837493" patternUnits="userSpaceOnUse">
      <rect stroke="#888" />
      <rect stroke="#888" />
    </pattern>
  */
  var gridPattern = Blockly.utils.createSvgElement('pattern',
      {
        'id': 'blocklyGridPattern' + rnd,
        'patternUnits': 'userSpaceOnUse'
      }, defs);
  if (gridOptions['length'] > 0 && gridOptions['spacing'] > 0) {
    Blockly.utils.createSvgElement('line',
        {'stroke': gridOptions['colour']}, gridPattern);
    if (gridOptions['length'] > 1) {
      Blockly.utils.createSvgElement('line',
          {'stroke': gridOptions['colour']}, gridPattern);
    }
    // x1, y1, x1, x2 properties will be set later in update.
  } else {
    // Edge 16 doesn't handle empty patterns
    Blockly.utils.createSvgElement('line', {}, gridPattern);
  }
  return gridPattern;
};

/**
 * Check if column layout mode is enabled.
 * @return {boolean} True if column layout mode is enabled.
 * @package
 */
Blockly.Grid.prototype.isColumnLayoutEnabled = function() {
  return this.columnLayoutMode_;
};


/**
 * Check if auto cleanup is enabled.
 * @return {boolean} True if auto cleanup is enabled.
 * @package
 */
Blockly.Grid.prototype.shouldAutoCleanup = function() {
  return this.autoCleanup_;
};

/**
 * Set the SVG group for column layout visual guides.
 * @param {SVGElement} group The SVG group element.
 * @package
 */
Blockly.Grid.prototype.setColumnGuideGroup = function(group) {
  this.columnGuideGroup_ = group;
};

/**
 * Apply column layout constraints to a coordinate.
 * This forces the X coordinate to the fixed column position for top-level blocks.
 * @param {!goog.math.Coordinate} coord The coordinate to constrain.
 * @param {boolean} isTopBlock Whether this is a top-level block.
 * @return {!goog.math.Coordinate} The constrained coordinate.
 * @package
 */
Blockly.Grid.prototype.applyColumnLayout = function(coord, isTopBlock) {
  if (!this.columnLayoutMode_ || !isTopBlock) {
    return coord;
  }

  // Force X coordinate to the fixed column position (48px)
  return new goog.math.Coordinate(48, coord.y);
};

/**
 * Show visual guide for column layout with projection.
 * Displays a vertical line at the column position and optionally a projection showing where the block will snap.
 * @param {Blockly.BlockSvg} block The block being dragged.
 * @param {number} targetY The Y position where the block will be placed.
 * @param {boolean=} opt_showProjection Whether to show the projection shadow (default true).
 * @package
 */
Blockly.Grid.prototype.showColumnGuide = function(block, targetY, opt_showProjection) {
  if (!this.columnLayoutMode_ || !this.columnGuideGroup_) {
    return;
  }

  var showProjection = opt_showProjection !== false;  // Default to true

  // Remove existing guide elements
  while (this.columnGuideGroup_.firstChild) {
    this.columnGuideGroup_.removeChild(this.columnGuideGroup_.firstChild);
  }

  // Show projection with gradient shadow effect only if requested
  if (showProjection && block && targetY !== undefined) {
    var size = block.getHeightWidth();

    // Create gradient definition for shadow effect
    var gradientId = 'columnProjectionGradient_' + Blockly.utils.genUid();
    var defs = this.columnGuideGroup_.ownerDocument.querySelector('defs');
    if (!defs) {
      defs = Blockly.utils.createSvgElement('defs', {},
          this.columnGuideGroup_.ownerSVGElement);
    }

    var gradient = Blockly.utils.createSvgElement('linearGradient', {
      'id': gradientId,
      'x1': '0%',
      'y1': '0%',
      'x2': '100%',
      'y2': '0%'
    }, defs);

    Blockly.utils.createSvgElement('stop', {
      'offset': '0%',
      'stop-color': '#2c5aa0',
      'stop-opacity': '0'
    }, gradient);

    Blockly.utils.createSvgElement('stop', {
      'offset': '50%',
      'stop-color': '#2c5aa0',
      'stop-opacity': '0.5'
    }, gradient);

    Blockly.utils.createSvgElement('stop', {
      'offset': '100%',
      'stop-color': '#2c5aa0',
      'stop-opacity': '0'
    }, gradient);

    // Create wider shadow layer (outer)
    Blockly.utils.createSvgElement('line', {
      'x1': 48,
      'y1': targetY,
      'x2': 48,
      'y2': targetY + size.height,
      'stroke': 'url(#' + gradientId + ')',
      'stroke-width': 20,
      'stroke-linecap': 'round'
    }, this.columnGuideGroup_);

    // Create sharper projection line (inner)
    Blockly.utils.createSvgElement('line', {
      'x1': 48,
      'y1': targetY,
      'x2': 48,
      'y2': targetY + size.height,
      'stroke': '#2c5aa0',
      'stroke-width': 6,
      'stroke-linecap': 'round',
      'opacity': 0.4
    }, this.columnGuideGroup_);
  }
};

/**
 * Hide visual guide for column layout.
 * @package
 */
Blockly.Grid.prototype.hideColumnGuide = function() {
  if (!this.columnGuideGroup_) {
    return;
  }

  // Remove all guide lines
  while (this.columnGuideGroup_.firstChild) {
    this.columnGuideGroup_.removeChild(this.columnGuideGroup_.firstChild);
  }
};

