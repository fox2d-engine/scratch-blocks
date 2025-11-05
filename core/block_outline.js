/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2024 TurboWarp
 * https://github.com/TurboWarp/scratch-blocks
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
 * @fileoverview Minimap showing simplified view of all blocks
 * Optimized version using Canvas 2D for better performance
 * @author TurboWarp
 */
'use strict';

goog.provide('Blockly.BlockOutline');

goog.require('Blockly.utils');

/**
 * Class for a block minimap.
 * @param {!Blockly.WorkspaceSvg} workspace The workspace to display a minimap for.
 * @constructor
 */
Blockly.BlockOutline = function(workspace) {
  /**
   * @type {!Blockly.WorkspaceSvg}
   * @private
   */
  this.workspace_ = workspace;

  /**
   * @type {SVGElement}
   * @private
   */
  this.svgGroup_ = null;

  /**
   * @type {SVGForeignObjectElement}
   * @private
   */
  this.foreignObject_ = null;

  /**
   * @type {HTMLCanvasElement}
   * @private
   */
  this.canvas_ = null;

  /**
   * @type {CanvasRenderingContext2D}
   * @private
   */
  this.ctx_ = null;

  /**
   * @type {SVGElement}
   * @private
   */
  this.viewportIndicator_ = null;

  /**
   * @type {boolean}
   * @private
   */
  this.visible_ = true;

  /**
   * Scale factor for minimap (how much smaller than actual blocks)
   * @type {number}
   * @private
   */
  this.scale_ = 0.08;

  /**
   * Horizontal offset (left margin) for content in minimap
   * @type {number}
   * @private
   */
  this.horizontalOffset_ = 2;

  /**
   * Vertical offset (top margin) for content in minimap
   * @type {number}
   * @private
   */
  this.verticalOffset_ = 2;

  /**
   * @type {number}
   * @private
   */
  this.updateFrameId_ = null;

  /**
   * Whether the viewport indicator is actively being dragged.
   * @type {boolean}
   * @private
   */
  this.isDraggingViewport_ = false;

  /**
   * Cached data used while dragging the viewport indicator.
   * @type {?Object}
   * @private
   */
  this.viewportDragState_ = null;

  /**
   * @type {number}
   * @private
   */
  this.canvasOffsetY_ = 0;

  /**
   * @type {SVGElement}
   * @private
   */
  this.backgroundRect_ = null;

  /**
   * Mouse move event listener for viewport dragging.
   * @type {?function(!Event)}
   * @private
   */
  this.mouseMoveListener_ = null;

  /**
   * Mouse up event listener for viewport dragging.
   * @type {?function(!Event)}
   * @private
   */
  this.mouseUpListener_ = null;

  /**
   * Cached workspace bounds to avoid recalculating on every refresh.
   * @type {?Object}
   * @private
   */
  this.cachedBounds_ = null;

  /**
   * Last known number of top blocks, used to detect when to recalculate bounds.
   * @type {number}
   * @private
   */
  this.lastBlockCount_ = 0;
};

/**
 * Width of the minimap panel.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.WIDTH = 120;

/**
 * Opacity when not hovering.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.OPACITY_DEFAULT = 0.5;

/**
 * Opacity when hovering.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.OPACITY_HOVER = 0.8;

/**
 * Padding around workspace bounds when calculating minimap area.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.WORKSPACE_BOUNDS_PADDING = 20;

/**
 * Border radius for simplified block rendering.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.SIMPLIFIED_BLOCK_RADIUS = 1;

/**
 * Right margin for minimap content.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.RIGHT_MARGIN = 2;

/**
 * Minimum scale factor to keep blocks readable.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.MIN_SCALE = 0.03;

/**
 * Default scale factor when content width is zero.
 * @type {number}
 * @const
 */
Blockly.BlockOutline.DEFAULT_SCALE = 0.08;

/**
 * Create the minimap's DOM.
 * @return {!SVGElement} The minimap's SVG group.
 */
Blockly.BlockOutline.prototype.createDom = function() {
  this.svgGroup_ = Blockly.utils.createSvgElement('g', {
    'class': 'blocklyMinimap'
  }, null);

  // Background (semi-transparent)
  this.backgroundRect_ = Blockly.utils.createSvgElement('rect', {
    'class': 'blocklyMinimapBackground',
    'width': Blockly.BlockOutline.WIDTH,
    'height': '100%',
    'fill': '#f8f8f8',
    'fill-opacity': '0.8',
    'stroke': '#ddd',
    'stroke-width': 1
  }, this.svgGroup_);

  // Use foreignObject to embed HTML canvas
  this.foreignObject_ = Blockly.utils.createSvgElement('foreignObject', {
    'class': 'blocklyMinimapCanvas',
    'width': Blockly.BlockOutline.WIDTH,
    'height': '100%',
    'x': 0,
    'y': 0,
    'overflow': 'hidden'
  }, this.svgGroup_);

  // Create canvas element
  this.canvas_ = document.createElement('canvas');
  this.canvas_.width = Blockly.BlockOutline.WIDTH * window.devicePixelRatio;
  this.canvas_.height = 600 * window.devicePixelRatio; // Will be updated
  this.canvas_.style.width = Blockly.BlockOutline.WIDTH + 'px';
  this.canvas_.style.height = '600px'; // Will be updated with actual pixel value
  this.canvas_.style.display = 'block';
  this.canvas_.style.position = 'relative'; // Allow positioning
  this.canvas_.style.top = '0px'; // Will be updated for scrolling
  // Allow pointer events so clicks can go through to foreignObject
  this.canvas_.style.pointerEvents = 'none';

  this.ctx_ = this.canvas_.getContext('2d');

  // Check if context creation succeeded
  if (!this.ctx_) {
    console.error('Blockly.BlockOutline: Failed to get 2D canvas context');
    return this.svgGroup_;
  }

  // Scale context for high DPI displays
  this.ctx_.scale(window.devicePixelRatio, window.devicePixelRatio);

  this.foreignObject_.appendChild(this.canvas_);

  // Viewport indicator (shows current visible area)
  this.viewportIndicator_ = Blockly.utils.createSvgElement('rect', {
    'class': 'blocklyMinimapViewport',
    'fill': 'rgba(100, 150, 255, 0.2)',
    'stroke': 'rgba(100, 150, 255, 0.6)',
    'stroke-width': 1,
    'rx': 2,
    'ry': 2,
    'pointer-events': 'all',
    'cursor': 'pointer'
  }, this.svgGroup_);

  // Set initial opacity
  this.svgGroup_.setAttribute('opacity', Blockly.BlockOutline.OPACITY_DEFAULT);

  // Hover effects
  var self = this;
  Blockly.bindEvent_(this.svgGroup_, 'mouseenter', null, function() {
    self.svgGroup_.setAttribute('opacity', Blockly.BlockOutline.OPACITY_HOVER);
  });
  Blockly.bindEvent_(this.svgGroup_, 'mouseleave', null, function() {
    self.svgGroup_.setAttribute('opacity', Blockly.BlockOutline.OPACITY_DEFAULT);
  });

  // Click to navigate - bind to both background and canvas area
  Blockly.bindEvent_(this.backgroundRect_, 'mousedown', this, this.onMinimapClick_);
  Blockly.bindEvent_(this.foreignObject_, 'mousedown', this, this.onMinimapClick_);

  // Drag viewport indicator
  Blockly.bindEvent_(this.viewportIndicator_, 'mousedown', this, this.onViewportDragStart_);

  return this.svgGroup_;
};

/**
 * Handle click on minimap to navigate.
 * @param {!Event} e Mouse event.
 * @private
 */
Blockly.BlockOutline.prototype.onMinimapClick_ = function(e) {
  // Don't handle if this is a viewport indicator drag
  if (this.isDraggingViewport_) {
    return;
  }

  // Check if the click is on the viewport indicator
  var target = e.target || e.srcElement;
  if (target === this.viewportIndicator_) {
    return;
  }

  e.stopPropagation();
  e.preventDefault();

  var svg = this.svgGroup_.ownerSVGElement;
  var point = svg.createSVGPoint();
  point.x = e.clientX;
  point.y = e.clientY;
  var matrix = this.svgGroup_.getScreenCTM().inverse();
  point = point.matrixTransform(matrix);

  var bounds = this.getWorkspaceBounds_();
  var metrics = this.workspace_.getMetrics();
  var workspaceScale = this.workspace_.scale || 1;

  // Calculate scroll offset using shared helper
  var scrollInfo = this.calculateScrollOffset_(bounds, metrics);

  // Account for top margin when calculating click position
  var clickYInCanvas = point.y + scrollInfo.canvasOffsetY - this.verticalOffset_;
  var workspaceY = (clickYInCanvas / this.scale_) + bounds.minY;

  var visibleHeightWorkspace = metrics.viewHeight / workspaceScale;
  var targetViewTopWorkspace = workspaceY - (visibleHeightWorkspace / 2);
  var targetViewTopPx = targetViewTopWorkspace * workspaceScale;

  var minViewTopPx = metrics.contentTop;
  var maxViewTopPx = metrics.contentTop +
      Math.max(0, metrics.contentHeight - metrics.viewHeight);
  if (targetViewTopPx < minViewTopPx) {
    targetViewTopPx = minViewTopPx;
  } else if (targetViewTopPx > maxViewTopPx) {
    targetViewTopPx = maxViewTopPx;
  }

  var horizontalValuePx = metrics.viewLeft - metrics.contentLeft;
  var verticalValuePx = targetViewTopPx - metrics.contentTop;

  this.workspace_.scrollbar.set(horizontalValuePx, verticalValuePx);
};

/**
 * Clean up drag event listeners.
 * @private
 */
Blockly.BlockOutline.prototype.cleanupDragListeners_ = function() {
  if (this.mouseMoveListener_) {
    document.removeEventListener('mousemove', this.mouseMoveListener_);
    this.mouseMoveListener_ = null;
  }
  if (this.mouseUpListener_) {
    document.removeEventListener('mouseup', this.mouseUpListener_);
    this.mouseUpListener_ = null;
  }
  this.isDraggingViewport_ = false;
  this.viewportDragState_ = null;
};

/**
 * Handle viewport indicator drag start.
 * @param {!Event} e Mouse event.
 * @private
 */
Blockly.BlockOutline.prototype.onViewportDragStart_ = function(e) {
  e.stopPropagation();
  e.preventDefault();

  // Clean up any existing listeners first
  this.cleanupDragListeners_();

  var self = this;
  this.isDraggingViewport_ = true;

  var metrics = this.workspace_.getMetrics();
  var workspaceScale = this.workspace_.scale || 1;

  this.viewportDragState_ = {
    startClientY: e.clientY,
    initialViewTopPx: metrics.viewTop,
    contentTopPx: metrics.contentTop,
    contentHeightPx: metrics.contentHeight,
    viewHeightPx: metrics.viewHeight,
    workspaceScale: workspaceScale,
    horizontalValuePx: metrics.viewLeft - metrics.contentLeft
  };

  this.mouseMoveListener_ = function(e) {
    if (!self.isDraggingViewport_) return;

    e.stopPropagation();
    e.preventDefault();

    var state = self.viewportDragState_;
    if (!state) {
      return;
    }

    var deltaY = e.clientY - state.startClientY;
    var workspacePixelsDelta = (deltaY / self.scale_) * state.workspaceScale;
    var newViewTopPx = state.initialViewTopPx + workspacePixelsDelta;

    var minViewTopPx = state.contentTopPx;
    var maxViewTopPx = state.contentTopPx +
        Math.max(0, state.contentHeightPx - state.viewHeightPx);

    if (newViewTopPx < minViewTopPx) {
      newViewTopPx = minViewTopPx;
    } else if (newViewTopPx > maxViewTopPx) {
      newViewTopPx = maxViewTopPx;
    }

    var verticalValue = newViewTopPx - state.contentTopPx;

    self.workspace_.scrollbar.set(state.horizontalValuePx, verticalValue);
  };

  this.mouseUpListener_ = function(_e) {
    self.cleanupDragListeners_();
  };

  document.addEventListener('mousemove', this.mouseMoveListener_);
  document.addEventListener('mouseup', this.mouseUpListener_);
};

/**
 * Initialize the minimap panel.
 */
Blockly.BlockOutline.prototype.init = function() {
  this.refresh();
};

/**
 * Dispose of this minimap panel.
 */
Blockly.BlockOutline.prototype.dispose = function() {
  if (this.updateFrameId_) {
    cancelAnimationFrame(this.updateFrameId_);
    this.updateFrameId_ = null;
  }

  // Clean up event listeners to prevent memory leaks
  this.cleanupDragListeners_();

  if (this.svgGroup_) {
    goog.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }
  this.canvas_ = null;
  this.ctx_ = null;
  this.workspace_ = null;
  this.cachedBounds_ = null;
};

/**
 * Calculate canvas Y offset and scroll percentage for current viewport position.
 * @param {!Object} bounds Workspace bounds.
 * @param {!Object} metrics Workspace metrics.
 * @return {!Object} Object with scrollPercentage and canvasOffsetY.
 * @private
 */
Blockly.BlockOutline.prototype.calculateScrollOffset_ = function(bounds, metrics) {
  var workspaceScale = this.workspace_.scale || 1;
  var viewportTopWorkspace = metrics.viewTop / workspaceScale;
  var visibleHeightWorkspace = metrics.viewHeight / workspaceScale;
  var workspaceScrollableHeight = Math.max(0, bounds.height - visibleHeightWorkspace);
  var currentScrollY = viewportTopWorkspace - bounds.minY;

  var scrollPercentage = 0;
  if (workspaceScrollableHeight > 0) {
    scrollPercentage = Math.max(0, Math.min(1, currentScrollY / workspaceScrollableHeight));
  }

  // Include margins in minimap height calculation
  var contentHeight = bounds.height * this.scale_;
  var bottomMargin = this.verticalOffset_;
  var totalMinimapHeight = contentHeight + this.verticalOffset_ + bottomMargin;
  var minimapScrollableHeight = Math.max(0, totalMinimapHeight - metrics.viewHeight);
  var canvasOffsetY = scrollPercentage * minimapScrollableHeight;

  return {
    scrollPercentage: scrollPercentage,
    canvasOffsetY: canvasOffsetY
  };
};

/**
 * Get bounds of all blocks in workspace.
 * @return {!Object} Object with minX, minY, maxX, maxY, width, height.
 * @private
 */
Blockly.BlockOutline.prototype.getWorkspaceBounds_ = function() {
  var topBlocks = this.workspace_.getTopBlocks(false);

  if (topBlocks.length === 0) {
    return {minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0};
  }

  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;

  for (var i = 0; i < topBlocks.length; i++) {
    var block = topBlocks[i];
    if (!block.getSvgRoot()) continue;

    var blockBounds = block.getBoundingRectangle();
    minX = Math.min(minX, blockBounds.topLeft.x);
    minY = Math.min(minY, blockBounds.topLeft.y);
    maxX = Math.max(maxX, blockBounds.bottomRight.x);
    maxY = Math.max(maxY, blockBounds.bottomRight.y);
  }

  var padding = Blockly.BlockOutline.WORKSPACE_BOUNDS_PADDING;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    minX: minX,
    minY: minY,
    maxX: maxX,
    maxY: maxY,
    width: maxX - minX,
    height: maxY - minY
  };
};

/**
 * Render a block with real shape on canvas by extracting SVG path.
 * @param {!Blockly.Block} block The block to render.
 * @param {number} boundsOffsetX X offset for rendering (workspace bounds minX).
 * @param {number} boundsOffsetY Y offset for rendering (workspace bounds minY).
 * @private
 */
Blockly.BlockOutline.prototype.renderBlockOnCanvas_ = function(block, boundsOffsetX, boundsOffsetY) {
  if (!block.getSvgRoot() || !this.ctx_) return;

  var svgRoot = block.getSvgRoot();
  var blockPosition = block.getRelativeToSurfaceXY();

  // Get the main path element that defines the block shape
  var pathElement = svgRoot.querySelector('.blocklyPath');
  if (!pathElement) {
    // Fallback to simple rectangle if no path found
    this.renderBlockSimplified_(block, boundsOffsetX, boundsOffsetY);
    return;
  }

  var pathData = pathElement.getAttribute('d');
  if (!pathData) {
    this.renderBlockSimplified_(block, boundsOffsetX, boundsOffsetY);
    return;
  }

  var blockColor = block.getColour ? block.getColour() : '#888';

  this.ctx_.save();

  // Apply transform: translate to position and scale with margins
  this.ctx_.translate(
      (blockPosition.x - boundsOffsetX) * this.scale_ + this.horizontalOffset_,
      (blockPosition.y - boundsOffsetY) * this.scale_ + this.verticalOffset_
  );
  this.ctx_.scale(this.scale_, this.scale_);

  // Draw the path
  this.ctx_.fillStyle = blockColor;
  this.ctx_.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  this.ctx_.lineWidth = 1 / this.scale_; // Adjust for scale

  var path = new Path2D(pathData);
  this.ctx_.fill(path);
  this.ctx_.stroke(path);

  this.ctx_.restore();

  // Recursively render child blocks (nested blocks)
  var childBlocks = block.getChildren(false);
  for (var i = 0; i < childBlocks.length; i++) {
    this.renderBlockOnCanvas_(childBlocks[i], boundsOffsetX, boundsOffsetY);
  }
};

/**
 * Render a simplified rectangle version of a block (fallback).
 * @param {!Blockly.Block} block The block to render.
 * @param {number} boundsOffsetX X offset for rendering (workspace bounds minX).
 * @param {number} boundsOffsetY Y offset for rendering (workspace bounds minY).
 * @private
 */
Blockly.BlockOutline.prototype.renderBlockSimplified_ = function(block, boundsOffsetX, boundsOffsetY) {
  var blockBounds = block.getBoundingRectangle();
  var canvasX = (blockBounds.topLeft.x - boundsOffsetX) * this.scale_ + this.horizontalOffset_;
  var canvasY = (blockBounds.topLeft.y - boundsOffsetY) * this.scale_ + this.verticalOffset_;
  var canvasWidth = (blockBounds.bottomRight.x - blockBounds.topLeft.x) * this.scale_;
  var canvasHeight = (blockBounds.bottomRight.y - blockBounds.topLeft.y) * this.scale_;

  // Ensure minimum size for visibility
  canvasWidth = Math.max(2, canvasWidth);
  canvasHeight = Math.max(2, canvasHeight);

  var blockColor = block.getColour ? block.getColour() : '#888';
  var cornerRadius = Blockly.BlockOutline.SIMPLIFIED_BLOCK_RADIUS;

  this.ctx_.fillStyle = blockColor;
  this.ctx_.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  this.ctx_.lineWidth = 0.5;

  // Draw rounded rectangle path
  this.ctx_.beginPath();
  this.ctx_.moveTo(canvasX + cornerRadius, canvasY);
  this.ctx_.lineTo(canvasX + canvasWidth - cornerRadius, canvasY);
  this.ctx_.quadraticCurveTo(
      canvasX + canvasWidth, canvasY,
      canvasX + canvasWidth, canvasY + cornerRadius);
  this.ctx_.lineTo(canvasX + canvasWidth, canvasY + canvasHeight - cornerRadius);
  this.ctx_.quadraticCurveTo(
      canvasX + canvasWidth, canvasY + canvasHeight,
      canvasX + canvasWidth - cornerRadius, canvasY + canvasHeight);
  this.ctx_.lineTo(canvasX + cornerRadius, canvasY + canvasHeight);
  this.ctx_.quadraticCurveTo(
      canvasX, canvasY + canvasHeight,
      canvasX, canvasY + canvasHeight - cornerRadius);
  this.ctx_.lineTo(canvasX, canvasY + cornerRadius);
  this.ctx_.quadraticCurveTo(canvasX, canvasY, canvasX + cornerRadius, canvasY);
  this.ctx_.closePath();

  this.ctx_.fill();
  this.ctx_.stroke();
};

/**
 * Update viewport indicator position and size, and scroll canvas.
 */
Blockly.BlockOutline.prototype.updateViewportIndicator = function() {
  if (!this.viewportIndicator_) return;

  var metrics = this.workspace_.getMetrics();
  var bounds = this.getWorkspaceBounds_();

  if (bounds.width === 0 || bounds.height === 0) {
    this.viewportIndicator_.setAttribute('width', 0);
    this.viewportIndicator_.setAttribute('height', 0);
    return;
  }

  var workspaceScale = this.workspace_.scale || 1;
  var viewportTopWorkspace = metrics.viewTop / workspaceScale;
  var actualVisibleHeight = metrics.viewHeight / workspaceScale;
  var viewHeight = actualVisibleHeight * this.scale_;

  // Calculate scroll offset using shared helper
  var scrollInfo = this.calculateScrollOffset_(bounds, metrics);
  this.canvasOffsetY_ = scrollInfo.canvasOffsetY;

  // Move canvas up/down using CSS top property
  if (this.canvas_) {
    this.canvas_.style.top = (-this.canvasOffsetY_) + 'px';
  }

  // Calculate viewport indicator position (include top margin)
  var viewYInCanvas = (viewportTopWorkspace - bounds.minY) * this.scale_ + this.verticalOffset_;
  var viewX = 0;
  var viewY = viewYInCanvas - this.canvasOffsetY_; // Adjust for canvas offset
  var viewWidth = Blockly.BlockOutline.WIDTH;

  this.viewportIndicator_.setAttribute('x', viewX);
  this.viewportIndicator_.setAttribute('y', viewY);
  this.viewportIndicator_.setAttribute('width', viewWidth);
  this.viewportIndicator_.setAttribute('height', viewHeight);
};

/**
 * Refresh the minimap (debounced with requestAnimationFrame).
 */
Blockly.BlockOutline.prototype.refresh = function() {
  if (!this.visible_ || !this.canvas_) {
    return;
  }

  if (this.updateFrameId_) {
    cancelAnimationFrame(this.updateFrameId_);
  }

  var self = this;
  this.updateFrameId_ = requestAnimationFrame(function() {
    self.updateFrameId_ = null;
    self.refreshNow_();
  });
};

/**
 * Refresh the minimap immediately (internal).
 * @private
 */
Blockly.BlockOutline.prototype.refreshNow_ = function() {
  if (!this.ctx_) return;

  var bounds = this.getWorkspaceBounds_();

  if (bounds.width === 0 || bounds.height === 0) {
    return;
  }

  var metrics = this.workspace_.getMetrics();

  // Calculate dynamic scale to fit content width
  // Only recalculate if block count changed or bounds are invalid
  var currentBlockCount = this.workspace_.getTopBlocks(false).length;
  var shouldRecalculateScale = !this.cachedBounds_ ||
                                this.lastBlockCount_ !== currentBlockCount ||
                                this.cachedBounds_.width !== bounds.width;

  if (shouldRecalculateScale) {
    var leftMargin = this.horizontalOffset_;
    var rightMargin = Blockly.BlockOutline.RIGHT_MARGIN;
    var availableWidth = Blockly.BlockOutline.WIDTH - leftMargin - rightMargin;
    var contentWidth = bounds.width;

    if (contentWidth > 0) {
      // Scale to fit width exactly (no max cap, but keep min)
      var scaleToFitWidth = availableWidth / contentWidth;
      this.scale_ = Math.max(scaleToFitWidth, Blockly.BlockOutline.MIN_SCALE);
    } else {
      this.scale_ = Blockly.BlockOutline.DEFAULT_SCALE;
    }

    // Cache bounds and block count
    this.cachedBounds_ = bounds;
    this.lastBlockCount_ = currentBlockCount;
  }

  // Now calculate canvas height with the correct scale
  var contentHeight = bounds.height * this.scale_;
  var bottomMargin = this.verticalOffset_; // Same as top margin
  var canvasHeight = Math.max(metrics.viewHeight, contentHeight + this.verticalOffset_ + bottomMargin);

  // Update canvas size if needed
  var targetCanvasHeight = canvasHeight * window.devicePixelRatio;
  if (this.canvas_.height !== targetCanvasHeight) {
    this.canvas_.height = targetCanvasHeight;
    this.canvas_.style.height = canvasHeight + 'px';
    // Re-get context and apply scale (canvas height change clears context)
    this.ctx_ = this.canvas_.getContext('2d');
    this.ctx_.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  // Clear canvas
  this.ctx_.clearRect(0, 0, this.canvas_.width, this.canvas_.height);

  // Render all top-level blocks
  var topBlocks = this.workspace_.getTopBlocks(false);
  for (var i = 0; i < topBlocks.length; i++) {
    this.renderBlockOnCanvas_(topBlocks[i], bounds.minX, bounds.minY);
  }

  // Update viewport indicator
  this.updateViewportIndicator();
};

/**
 * Move the minimap to the correct position.
 * @param {!Object} metrics Workspace metrics.
 */
Blockly.BlockOutline.prototype.position = function(metrics) {
  if (!this.svgGroup_) {
    return;
  }

  if (!metrics) {
    return;
  }

  var x = metrics.viewWidth + metrics.absoluteLeft - Blockly.BlockOutline.WIDTH;

  if (metrics.toolboxPosition == Blockly.TOOLBOX_AT_RIGHT) {
    x -= metrics.flyoutWidth;
  }

  var y = metrics.absoluteTop;

  this.svgGroup_.setAttribute('transform',
      'translate(' + x + ', ' + y + ')');

  this.backgroundRect_.setAttribute('height', metrics.viewHeight);

  // Update foreignObject height
  if (this.foreignObject_) {
    this.foreignObject_.setAttribute('height', metrics.viewHeight);
  }

  this.updateViewportIndicator();
};

/**
 * Show or hide the minimap panel.
 * @param {boolean} visible True to show, false to hide.
 */
Blockly.BlockOutline.prototype.setVisible = function(visible) {
  this.visible_ = visible;
  if (this.svgGroup_) {
    this.svgGroup_.style.display = visible ? 'block' : 'none';
  }
};
