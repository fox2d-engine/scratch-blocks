/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2014 Google Inc.
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
 * @fileoverview Object representing a workspace rendered as SVG.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.WorkspaceSvg');

// TODO(scr): Fix circular dependencies
//goog.require('Blockly.BlockSvg');
goog.require('Blockly.CollapseGutter');
goog.require('Blockly.Colours');
goog.require('Blockly.ConnectionDB');
goog.require('Blockly.constants');
goog.require('Blockly.DataCategory');
goog.require('Blockly.DropDownDiv');
goog.require('Blockly.Events.BlockCreate');
goog.require('Blockly.Gesture');
goog.require('Blockly.Grid');
goog.require('Blockly.Options');
goog.require('Blockly.scratchBlocksUtils');
goog.require('Blockly.ScrollbarPair');
goog.require('Blockly.Touch');
goog.require('Blockly.Trashcan');
//goog.require('Blockly.VerticalFlyout');
goog.require('Blockly.Workspace');
goog.require('Blockly.WorkspaceAudio');
goog.require('Blockly.WorkspaceComment');
goog.require('Blockly.WorkspaceCommentSvg');
goog.require('Blockly.WorkspaceCommentSvg.render');
goog.require('Blockly.WorkspaceDragSurfaceSvg');
goog.require('Blockly.Xml');
goog.require('Blockly.ZoomControls');
goog.require('Blockly.IntersectionObserver');
goog.require('Blockly.BlockOutline');

goog.require('goog.array');
goog.require('goog.dom');
goog.require('goog.math.Coordinate');
goog.require('goog.userAgent');
goog.require('goog.math.Rect');

/**
 * Class for a workspace.  This is an onscreen area with optional trashcan,
 * scrollbars, bubbles, and dragging.
 * @param {!Blockly.Options} options Dictionary of options.
 * @param {Blockly.BlockDragSurfaceSvg=} opt_blockDragSurface Drag surface for
 *     blocks.
 * @param {Blockly.WorkspaceDragSurfaceSvg=} opt_wsDragSurface Drag surface for
 *     the workspace.
 * @extends {Blockly.Workspace}
 * @constructor
 */
Blockly.WorkspaceSvg = function(options, opt_blockDragSurface, opt_wsDragSurface) {
  Blockly.WorkspaceSvg.superClass_.constructor.call(this, options);
  this.getMetrics =
      options.getMetrics || Blockly.WorkspaceSvg.getTopLevelWorkspaceMetrics_;
  this.setMetrics =
      options.setMetrics || Blockly.WorkspaceSvg.setTopLevelWorkspaceMetrics_;

  Blockly.ConnectionDB.init(this);

  if (opt_blockDragSurface) {
    this.blockDragSurface_ = opt_blockDragSurface;
  }

  if (opt_wsDragSurface) {
    this.workspaceDragSurface_ = opt_wsDragSurface;
  }

  this.useWorkspaceDragSurface_ =
      this.workspaceDragSurface_ && Blockly.utils.is3dSupported();

  /**
   * List of currently highlighted blocks.  Block highlighting is often used to
   * visually mark blocks currently being executed.
   * @type !Array.<!Blockly.BlockSvg>
   * @private
   */
  this.highlightedBlocks_ = [];

  /**
   * Whether the modifier key (Cmd/Ctrl) is currently pressed.
   * Used for block hover highlighting.
   * @type {boolean}
   * @private
   */
  this.modifierKeyPressed_ = false;

  /**
   * Last hovered block when modifier key is pressed.
   * @type {Blockly.BlockSvg}
   * @private
   */
  this.lastHoveredBlock_ = null;

  /**
   * Last dimmed blocks (siblings and parent) when modifier key is pressed.
   * @type {!Array<!Blockly.BlockSvg>}
   * @private
   */
  this.lastDimmedBlocks_ = [];

  /**
   * Throttle timer for block hover events.
   * @type {?number}
   * @private
   */
  this.hoverThrottleTimer_ = null;

  /**
   * Whether we are in keyboard navigation mode (arrow keys were used).
   * In this mode, the highlight is locked to the current block and doesn't follow the mouse.
   * @type {boolean}
   * @private
   */
  this.keyboardNavigationMode_ = false;

  /**
   * List of blocks that are currently highlighted.
   * Used to ensure all highlighted blocks are cleared when exiting.
   * @type {!Array<!Blockly.BlockSvg>}
   * @private
   */
  this.highlightedBlocks_list_ = [];

  /**
   * Whether we are in selection mode (click to select blocks for keyboard movement).
   * @type {boolean}
   * @private
   */
  this.selectionMode_ = false;

  /**
   * Currently selected block for keyboard navigation.
   * @type {Blockly.BlockSvg}
   * @private
   */
  this.selectedBlock_ = null;

  /**
   * Timestamp of the last click on empty workspace (for triple-click detection).
   * @type {Array<number>}
   * @private
   */
  this.lastClickTimes_ = [];

  /**
   * List of all blocks that are dimmed in selection mode.
   * @type {!Array<!Blockly.BlockSvg>}
   * @private
   */
  this.allDimmedBlocks_ = [];

  /**
   * List of all selected blocks (for multi-selection).
   * @type {!Array<!Blockly.BlockSvg>}
   * @private
   */
  this.selectedBlocks_ = [];

  /**
   * Object in charge of loading, storing, and playing audio for a workspace.
   * @type {Blockly.WorkspaceAudio}
   * @private
   */
  this.audioManager_ = new Blockly.WorkspaceAudio(options.parentWorkspace);

  /**
   * This workspace's grid object or null.
   * @type {Blockly.Grid}
   * @private
   */
  this.grid_ = this.options.gridPattern ?
      new Blockly.Grid(options.gridPattern, options.gridOptions) : null;

  this.registerToolboxCategoryCallback(Blockly.VARIABLE_CATEGORY_NAME,
      Blockly.DataCategory);
  this.registerToolboxCategoryCallback(Blockly.PROCEDURE_CATEGORY_NAME,
      Blockly.Procedures.flyoutCategory);

  this.procedureReturnsEnabled = Blockly.Procedures.DEFAULT_ENABLE_RETURNS;
  this.initialProcedureReturnTypes_ = null;
  this.procedureReturnChangeTimeout_ = null;
  this.checkProcedureReturnAfterGesture_ = false;

  /**
   * Auto-layout configuration
   * @type {boolean}
   * @private
   */
  this.autoLayoutEnabled_ = options.autoLayout !== false; // Default enabled

  /**
   * Auto-layout debounce timer
   * @type {?number}
   * @private
   */
  this.autoLayoutTimer_ = null;

  /**
   * Auto-layout debounce delay in milliseconds
   * @type {number}
   * @private
   */
  this.autoLayoutDelay_ = options.autoLayoutDelay || 200;

  /**
   * Auto-layout change listener function
   * @type {?Function}
   * @private
   */
  this.autoLayoutListener_ = null;

  // Setup auto-layout listener if enabled
  if (this.autoLayoutEnabled_) {
    this.initAutoLayout_();
  }
};
goog.inherits(Blockly.WorkspaceSvg, Blockly.Workspace);

/**
 * A wrapper function called when a resize event occurs.
 * You can pass the result to `unbindEvent_`.
 * @type {Array.<!Array>}
 */
Blockly.WorkspaceSvg.prototype.resizeHandlerWrapper_ = null;

/**
 * The render status of an SVG workspace.
 * Returns `false` for headless workspaces and true for instances of
 * `Blockly.WorkspaceSvg`.
 * @type {boolean}
 */
Blockly.WorkspaceSvg.prototype.rendered = true;

/**
 * Whether the workspace is visible.  False if the workspace has been hidden
 * by calling `setVisible(false)`.
 * @type {boolean}
 * @private
 */
Blockly.WorkspaceSvg.prototype.isVisible_ = true;

/**
 * Is this workspace the surface for a flyout?
 * @type {boolean}
 */
Blockly.WorkspaceSvg.prototype.isFlyout = false;

/**
 * Is this workspace the surface for a mutator?
 * @type {boolean}
 * @package
 */
Blockly.WorkspaceSvg.prototype.isMutator = false;

/**
 * Whether this workspace has resizes enabled.
 * Disable during batch operations for a performance improvement.
 * @type {boolean}
 * @private
 */
Blockly.WorkspaceSvg.prototype.resizesEnabled_ = true;

/**
 * Whether this workspace has toolbox/flyout refreshes enabled.
 * Disable during batch operations for a performance improvement.
 * @type {boolean}
 * @private
 */
Blockly.WorkspaceSvg.prototype.toolboxRefreshEnabled_ = true;

/**
 * Current horizontal scrolling offset in pixel units.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.scrollX = 0;

/**
 * Current vertical scrolling offset in pixel units.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.scrollY = 0;

/**
 * Horizontal scroll value when scrolling started in pixel units.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.startScrollX = 0;

/**
 * Vertical scroll value when scrolling started in pixel units.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.startScrollY = 0;

/**
 * Distance from mouse to object being dragged.
 * @type {goog.math.Coordinate}
 * @private
 */
Blockly.WorkspaceSvg.prototype.dragDeltaXY_ = null;

/**
 * Current scale.
 * @type {number}
 */
Blockly.WorkspaceSvg.prototype.scale = 1;

/**
 * The workspace's trashcan (if any).
 * @type {Blockly.Trashcan}
 */
Blockly.WorkspaceSvg.prototype.trashcan = null;

/**
 * This workspace's scrollbars, if they exist.
 * @type {Blockly.ScrollbarPair}
 */
Blockly.WorkspaceSvg.prototype.scrollbar = null;

/**
 * The current gesture in progress on this workspace, if any.
 * @type {Blockly.Gesture}
 * @private
 */
Blockly.WorkspaceSvg.prototype.currentGesture_ = null;

/**
 * This workspace's surface for dragging blocks, if it exists.
 * @type {Blockly.BlockDragSurfaceSvg}
 * @private
 */
Blockly.WorkspaceSvg.prototype.blockDragSurface_ = null;

/**
 * This workspace's drag surface, if it exists.
 * @type {Blockly.WorkspaceDragSurfaceSvg}
 * @private
 */
Blockly.WorkspaceSvg.prototype.workspaceDragSurface_ = null;

/**
  * Whether to move workspace to the drag surface when it is dragged.
  * True if it should move, false if it should be translated directly.
  * @type {boolean}
  * @private
  */
Blockly.WorkspaceSvg.prototype.useWorkspaceDragSurface_ = false;

/**
 * Whether the drag surface is actively in use. When true, calls to
 * translate will translate the drag surface instead of the translating the
 * workspace directly.
 * This is set to true in setupDragSurface and to false in resetDragSurface.
 * @type {boolean}
 * @private
 */
Blockly.WorkspaceSvg.prototype.isDragSurfaceActive_ = false;

/**
 * The first parent div with 'injectionDiv' in the name, or null if not set.
 * Access this with getInjectionDiv.
 * @type {!Element}
 * @private
 */
Blockly.WorkspaceSvg.prototype.injectionDiv_ = null;

/**
 * Last known position of the page scroll.
 * This is used to determine whether we have recalculated screen coordinate
 * stuff since the page scrolled.
 * @type {!goog.math.Coordinate}
 * @private
 */
Blockly.WorkspaceSvg.prototype.lastRecordedPageScroll_ = null;

/**
 * Map from function names to callbacks, for deciding what to do when a button
 * is clicked.
 * @type {!Object.<string, function(!Blockly.FlyoutButton)>}
 * @private
 */
Blockly.WorkspaceSvg.prototype.flyoutButtonCallbacks_ = {};

/**
 * Map from function names to callbacks, for deciding what to do when a custom
 * toolbox category is opened.
 * @type {!Object.<string, function(!Blockly.Workspace):!Array.<!Element>>}
 * @private
 */
Blockly.WorkspaceSvg.prototype.toolboxCategoryCallbacks_ = {};

/**
 * Inverted screen CTM, for use in mouseToSvg.
 * @type {SVGMatrix}
 * @private
 */
Blockly.WorkspaceSvg.prototype.inverseScreenCTM_ = null;

/**
 * Inverted screen CTM is dirty.
 * @type {Boolean}
 * @private
 */
Blockly.WorkspaceSvg.prototype.inverseScreenCTMDirty_ = true;

/**
 * Getter for the inverted screen CTM.
 * @return {SVGMatrix} The matrix to use in mouseToSvg
 */
Blockly.WorkspaceSvg.prototype.getInverseScreenCTM = function() {

  // Defer getting the screen CTM until we actually need it, this should
  // avoid forced reflows from any calls to updateInverseScreenCTM.
  if (this.inverseScreenCTMDirty_) {
    var ctm = this.getParentSvg().getScreenCTM();
    if (ctm) {
      this.inverseScreenCTM_ = ctm.inverse();
      this.inverseScreenCTMDirty_ = false;
    }
  }

  return this.inverseScreenCTM_;
};

/**
 * Getter for isVisible
 * @return {boolean} Whether the workspace is visible.  False if the workspace has been hidden
 * by calling `setVisible(false)`.
 */
Blockly.WorkspaceSvg.prototype.isVisible = function() {
  return this.isVisible_;
};

/**
 * Mark the inverse screen CTM as dirty.
 */
Blockly.WorkspaceSvg.prototype.updateInverseScreenCTM = function() {
  this.inverseScreenCTMDirty_ = true;
};

/**
 * Return the absolute coordinates of the top-left corner of this element,
 * scales that after canvas SVG element, if it's a descendant.
 * The origin (0,0) is the top-left corner of the Blockly SVG.
 * @param {!Element} element Element to find the coordinates of.
 * @return {!goog.math.Coordinate} Object with .x and .y properties.
 * @private
 */
Blockly.WorkspaceSvg.prototype.getSvgXY = function(element) {
  var x = 0;
  var y = 0;
  var scale = 1;
  if (goog.dom.contains(this.getCanvas(), element) ||
      goog.dom.contains(this.getBubbleCanvas(), element)) {
    // Before the SVG canvas, scale the coordinates.
    scale = this.scale;
  }
  do {
    // Loop through this block and every parent.
    var xy = Blockly.utils.getRelativeXY(element);
    if (element == this.getCanvas() ||
        element == this.getBubbleCanvas()) {
      // After the SVG canvas, don't scale the coordinates.
      scale = 1;
    }
    x += xy.x * scale;
    y += xy.y * scale;
    element = element.parentNode;
  } while (element && element != this.getParentSvg());
  return new goog.math.Coordinate(x, y);
};

/**
 * Return the position of the workspace origin relative to the injection div
 * origin in pixels.
 * The workspace origin is where a block would render at position (0, 0).
 * It is not the upper left corner of the workspace SVG.
 * @return {!goog.math.Coordinate} Offset in pixels.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getOriginOffsetInPixels = function() {
  return Blockly.utils.getInjectionDivXY_(this.svgBlockCanvas_);
};

/**
 * Return the injection div that is a parent of this workspace.
 * Walks the DOM the first time it's called, then returns a cached value.
 * @return {!Element} The first parent div with 'injectionDiv' in the name.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getInjectionDiv = function() {
  // NB: it would be better to pass this in at createDom, but is more likely to
  // break existing uses of Blockly.
  if (!this.injectionDiv_) {
    var element = this.svgGroup_;
    while (element) {
      var classes = element.getAttribute('class') || '';
      if ((' ' + classes + ' ').indexOf(' injectionDiv ') != -1) {
        this.injectionDiv_ = element;
        break;
      }
      element = element.parentNode;
    }
  }
  return this.injectionDiv_;
};

/**
 * Save resize handler data so we can delete it later in dispose.
 * @param {!Array.<!Array>} handler Data that can be passed to unbindEvent_.
 */
Blockly.WorkspaceSvg.prototype.setResizeHandlerWrapper = function(handler) {
  this.resizeHandlerWrapper_ = handler;
};

/**
 * Create the workspace DOM elements.
 * @param {string=} opt_backgroundClass Either 'blocklyMainBackground' or
 *     'blocklyMutatorBackground'.
 * @return {!Element} The workspace's SVG group.
 */
Blockly.WorkspaceSvg.prototype.createDom = function(opt_backgroundClass) {
  /**
   * <g class="blocklyWorkspace">
   *   <rect class="blocklyMainBackground" height="100%" width="100%"></rect>
   *   [Trashcan and/or flyout may go here]
   *   <g class="blocklyBlockCanvas"></g>
   *   <g class="blocklyBubbleCanvas"></g>
   * </g>
   * @type {SVGElement}
   */
  this.svgGroup_ = Blockly.utils.createSvgElement('g',
      {'class': 'blocklyWorkspace'}, null);

  // Note that a <g> alone does not receive mouse events--it must have a
  // valid target inside it.  If no background class is specified, as in the
  // flyout, the workspace will not receive mouse events.
  if (opt_backgroundClass) {
    /** @type {SVGElement} */
    this.svgBackground_ = Blockly.utils.createSvgElement('rect',
        {'height': '100%', 'width': '100%', 'class': opt_backgroundClass},
        this.svgGroup_);

    if (opt_backgroundClass == 'blocklyMainBackground' && this.grid_) {
      this.svgBackground_.style.fill =
          'url(#' + this.grid_.getPatternId() + ')';
    }
  }
  /** @type {SVGElement} */
  this.svgBlockCanvas_ = Blockly.utils.createSvgElement('g',
      {'class': 'blocklyBlockCanvas'}, this.svgGroup_, this);
  /** @type {SVGElement} */
  this.svgColumnGuideCanvas_ = Blockly.utils.createSvgElement('g',
      {'class': 'blocklyColumnGuideCanvas'}, this.svgGroup_, this);
  /** @type {SVGElement} */
  this.svgBubbleCanvas_ = Blockly.utils.createSvgElement('g',
      {'class': 'blocklyBubbleCanvas'}, this.svgGroup_, this);
  var bottom = Blockly.Scrollbar.scrollbarThickness;
  if (this.options.hasTrashcan) {
    bottom = this.addTrashcan_(bottom);
  }

  // Add collapse gutter (before minimap and zoom controls)
  if (!this.isFlyout) {
    this.collapseGutter_ = new Blockly.CollapseGutter(this);
    var gutterSvg = this.collapseGutter_.createDom();
    this.svgGroup_.appendChild(gutterSvg);

    // Add change listener to refresh gutter when blocks change or viewport changes
    var gutter = this.collapseGutter_;
    this.addChangeListener(function(event) {
      // Refresh on create, delete, change, move, or viewport change (scroll/zoom)
      if (event.type === Blockly.Events.BLOCK_CREATE ||
          event.type === Blockly.Events.BLOCK_DELETE ||
          event.type === Blockly.Events.BLOCK_CHANGE ||
          event.type === Blockly.Events.VIEWPORT_CHANGE ||
          (event.type === Blockly.Events.BLOCK_MOVE && event.recordUndo)) {
        gutter.refresh();
      }
    });

    // Initial refresh after a short delay
    setTimeout(function() {
      gutter.init();
    }, 100);
  }

  // Add block outline panel if enabled (before zoom controls so zoom controls appear on top)
  if (this.options.hasBlockOutline) {
    this.blockOutline_ = new Blockly.BlockOutline(this);
    var outlineSvg = this.blockOutline_.createDom();
    this.svgGroup_.appendChild(outlineSvg);

    // Add change listener to refresh outline when blocks change
    var outline = this.blockOutline_;
    this.addChangeListener(function(event) {
      // Only refresh on create, delete, or change - ignore move during drag
      if (event.type === Blockly.Events.BLOCK_CREATE ||
          event.type === Blockly.Events.BLOCK_DELETE ||
          event.type === Blockly.Events.BLOCK_CHANGE) {
        // Defer refresh to avoid multiple updates
        if (outline.refreshTimeout_) {
          clearTimeout(outline.refreshTimeout_);
        }
        outline.refreshTimeout_ = setTimeout(function() {
          outline.refresh();
          outline.refreshTimeout_ = null;
        }, 100);
      }
      // For BLOCK_MOVE, only refresh if it's not a drag (i.e., after drop)
      else if (event.type === Blockly.Events.BLOCK_MOVE) {
        // Check if this is the end of a drag (recordUndo is true after drop)
        if (event.recordUndo) {
          if (outline.refreshTimeout_) {
            clearTimeout(outline.refreshTimeout_);
          }
          outline.refreshTimeout_ = setTimeout(function() {
            outline.refresh();
            outline.refreshTimeout_ = null;
          }, 100);
        }
      }
    });

    // Initial refresh after a short delay
    setTimeout(function() {
      outline.init();
    }, 100);
  }

  if (this.options.zoomOptions && this.options.zoomOptions.controls) {
    this.addZoomControls_(bottom);
  }

  if (!this.isFlyout) {
    Blockly.bindEventWithChecks_(this.svgGroup_, 'mousedown', this,
        this.onMouseDown_);
    if (this.options.zoomOptions && this.options.zoomOptions.wheel) {
      // Mouse-wheel.
      Blockly.bindEventWithChecks_(this.svgGroup_, 'wheel', this,
          this.onMouseWheel_);
    }
    // Add keyboard event listeners for modifier key tracking
    this.modifierKeyDownListener_ = this.onModifierKeyDown_.bind(this);
    this.modifierKeyUpListener_ = this.onModifierKeyUp_.bind(this);
    document.addEventListener('keydown', this.modifierKeyDownListener_);
    document.addEventListener('keyup', this.modifierKeyUpListener_);

    // Add hover event listeners for block highlighting (using event delegation)
    this.blockHoverListener_ = this.onBlockHover_.bind(this);
    this.blockUnhoverListener_ = this.onBlockUnhover_.bind(this);
    this.svgBlockCanvas_.addEventListener('mouseover', this.blockHoverListener_, false);
    this.svgBlockCanvas_.addEventListener('mouseout', this.blockUnhoverListener_, false);
  }

  this.intersectionObserver = new Blockly.IntersectionObserver(this);

  // Determine if there needs to be a category tree, or a simple list of
  // blocks.  This cannot be changed later, since the UI is very different.
  if (this.options.hasCategories) {
    /**
     * @type {Blockly.Toolbox}
     * @private
     */
    this.toolbox_ = new Blockly.Toolbox(this);
  }
  if (this.grid_) {
    this.grid_.update(this.scale);
    // Set column guide group for column layout visual feedback
    if (this.svgColumnGuideCanvas_) {
      this.grid_.setColumnGuideGroup(this.svgColumnGuideCanvas_);
    }
  }
  this.recordCachedAreas();
  return this.svgGroup_;
};

/**
 * Dispose of this workspace.
 * Unlink from all DOM elements to prevent memory leaks.
 */
Blockly.WorkspaceSvg.prototype.dispose = function() {
  // Stop rerendering.
  this.rendered = false;

  // Remove keyboard event listeners
  if (this.modifierKeyDownListener_) {
    document.removeEventListener('keydown', this.modifierKeyDownListener_);
    this.modifierKeyDownListener_ = null;
  }
  if (this.modifierKeyUpListener_) {
    document.removeEventListener('keyup', this.modifierKeyUpListener_);
    this.modifierKeyUpListener_ = null;
  }

  // Remove block hover event listeners
  if (this.blockHoverListener_ && this.svgBlockCanvas_) {
    this.svgBlockCanvas_.removeEventListener('mouseover', this.blockHoverListener_);
    this.blockHoverListener_ = null;
  }
  if (this.blockUnhoverListener_ && this.svgBlockCanvas_) {
    this.svgBlockCanvas_.removeEventListener('mouseout', this.blockUnhoverListener_);
    this.blockUnhoverListener_ = null;
  }

  // Clear hover throttle timer
  if (this.hoverThrottleTimer_) {
    clearTimeout(this.hoverThrottleTimer_);
    this.hoverThrottleTimer_ = null;
  }

  // Cleanup auto-layout
  this.cleanupAutoLayout_();

  if (this.currentGesture_) {
    this.currentGesture_.cancel();
  }
  if (this.intersectionObserver) {
    this.intersectionObserver.dispose();
    this.intersectionObserver = null;
  }
  Blockly.WorkspaceSvg.superClass_.dispose.call(this);
  if (this.svgGroup_) {
    goog.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }
  this.svgBlockCanvas_ = null;
  this.svgColumnGuideCanvas_ = null;
  this.svgBubbleCanvas_ = null;
  if (this.toolbox_) {
    this.toolbox_.dispose();
    this.toolbox_ = null;
  }
  if (this.flyout_) {
    this.flyout_.dispose();
    this.flyout_ = null;
  }
  if (this.trashcan) {
    this.trashcan.dispose();
    this.trashcan = null;
  }
  if (this.scrollbar) {
    this.scrollbar.dispose();
    this.scrollbar = null;
  }
  if (this.zoomControls_) {
    this.zoomControls_.dispose();
    this.zoomControls_ = null;
  }

  if (this.audioManager_) {
    this.audioManager_.dispose();
    this.audioManager_ = null;
  }

  if (this.grid_) {
    this.grid_.dispose();
    this.grid_ = null;
  }

  if (this.toolboxCategoryCallbacks_) {
    this.toolboxCategoryCallbacks_ = null;
  }
  if (this.flyoutButtonCallbacks_) {
    this.flyoutButtonCallbacks_ = null;
  }
  if (!this.options.parentWorkspace) {
    // Top-most workspace.  Dispose of the div that the
    // SVG is injected into (i.e. injectionDiv).
    goog.dom.removeNode(this.getParentSvg().parentNode);
  }
  if (this.resizeHandlerWrapper_) {
    Blockly.unbindEvent_(this.resizeHandlerWrapper_);
    this.resizeHandlerWrapper_ = null;
  }
  if (this.procedureReturnChangeTimeout_) {
    clearTimeout(this.procedureReturnChangeTimeout_);
  }
};

/**
 * Obtain a newly created block.
 * @param {?string} prototypeName Name of the language object containing
 *     type-specific functions for this block.
 * @param {string=} opt_id Optional ID.  Use this ID if provided, otherwise
 *     create a new ID.
 * @return {!Blockly.BlockSvg} The created block.
 */
Blockly.WorkspaceSvg.prototype.newBlock = function(prototypeName, opt_id) {
  return new Blockly.BlockSvg(this, prototypeName, opt_id);
};

/**
 * Add a trashcan.
 * @param {number} bottom Distance from workspace bottom to bottom of trashcan.
 * @return {number} Distance from workspace bottom to the top of trashcan.
 * @private
 */
Blockly.WorkspaceSvg.prototype.addTrashcan_ = function(bottom) {
  /** @type {Blockly.Trashcan} */
  this.trashcan = new Blockly.Trashcan(this);
  var svgTrashcan = this.trashcan.createDom();
  this.svgGroup_.insertBefore(svgTrashcan, this.svgBlockCanvas_);
  return this.trashcan.init(bottom);
};

/**
 * Add zoom controls.
 * @param {number} bottom Distance from workspace bottom to bottom of controls.
 * @return {number} Distance from workspace bottom to the top of controls.
 * @private
 */
Blockly.WorkspaceSvg.prototype.addZoomControls_ = function(bottom) {
  /** @type {Blockly.ZoomControls} */
  this.zoomControls_ = new Blockly.ZoomControls(this);
  var svgZoomControls = this.zoomControls_.createDom();
  this.svgGroup_.appendChild(svgZoomControls);
  return this.zoomControls_.init(bottom);
};

/**
 * Add a flyout element in an element with the given tag name.
 * @param {string} tagName What type of tag the flyout belongs in.
 * @return {!Element} The element containing the flyout DOM.
 * @private
 */
Blockly.WorkspaceSvg.prototype.addFlyout_ = function(tagName) {
  var workspaceOptions = {
    disabledPatternId: this.options.disabledPatternId,
    parentWorkspace: this,
    RTL: this.RTL,
    oneBasedIndex: this.options.oneBasedIndex,
    horizontalLayout: this.horizontalLayout,
    toolboxPosition: this.options.toolboxPosition,
    stackGlowFilterId: this.options.stackGlowFilterId
  };
  if (this.horizontalLayout) {
    this.flyout_ = new Blockly.HorizontalFlyout(workspaceOptions);
  } else {
    this.flyout_ = new Blockly.VerticalFlyout(workspaceOptions);
  }
  this.flyout_.autoClose = false;

  // Return the element  so that callers can place it in their desired
  // spot in the DOM.  For example, mutator flyouts do not go in the same place
  // as main workspace flyouts.
  return this.flyout_.createDom(tagName);
};

/**
 * Getter for the flyout associated with this workspace.  This flyout may be
 * owned by either the toolbox or the workspace, depending on toolbox
 * configuration.  It will be null if there is no flyout.
 * @return {Blockly.Flyout} The flyout on this workspace.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getFlyout = function() {
  if (this.flyout_) {
    return this.flyout_;
  }
  if (this.toolbox_) {
    return this.toolbox_.flyout_;
  }
  return null;
};

/**
 * Getter for the toolbox associated with this workspace, if one exists.
 * @return {Blockly.Toolbox} The toolbox on this workspace.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getToolbox = function() {
  return this.toolbox_;
};

/**
 * Update items that use screen coordinate calculations
 * because something has changed (e.g. scroll position, window size).
 * @private
 */
Blockly.WorkspaceSvg.prototype.updateScreenCalculations_ = function() {
  this.updateInverseScreenCTM();
  this.recordCachedAreas();
};

/**
 * If enabled, resize the parts of the workspace that change when the workspace
 * contents (e.g. block positions) change.  This will also scroll the
 * workspace contents if needed.
 * @package
 */
Blockly.WorkspaceSvg.prototype.resizeContents = function() {
  if (!this.resizesEnabled_ || !this.rendered) {
    return;
  }
  if (this.scrollbar) {
    // TODO(picklesrus): Once rachel-fenichel's scrollbar refactoring
    // is complete, call the method that only resizes scrollbar
    // based on contents.
    this.scrollbar.resize();
  }
  this.updateInverseScreenCTM();
};

Blockly.WorkspaceSvg.prototype.queueIntersectionCheck = function() {
  if (this.intersectionObserver) {
    this.intersectionObserver.queueIntersectionCheck();
  }
};

/**
 * Call *before* modifying scripts.
 */
Blockly.WorkspaceSvg.prototype.procedureReturnsWillChange = function() {
  if (this.initialProcedureReturnTypes_) {
    // Already queued.
    return;
  }

  this.initialProcedureReturnTypes_ = Blockly.Procedures.getAllProcedureReturnTypes(this);

  if (this.currentGesture_) {
    this.checkProcedureReturnAfterGesture_ = true;
  } else {
    this.procedureReturnChangeTimeout_ = setTimeout(this.processProcedureReturnsChanged_.bind(this));
  }
};

/**
 * @private
 */
Blockly.WorkspaceSvg.prototype.processProcedureReturnsChanged_ = function() {
  var initialTypes = this.initialProcedureReturnTypes_;
  var finalTypes = Blockly.Procedures.getAllProcedureReturnTypes(this);

  this.initialProcedureReturnTypes_ = null;
  this.checkProcedureReturnAfterGesture_ = false;
  this.procedureReturnChangeTimeout_ = null;

  Blockly.Events.setGroup(true);
  var topBlocks = this.getTopBlocks(false);
  for (var i = 0; i < topBlocks.length; i++) {
    var block = topBlocks[i];
    if (block.type !== Blockly.PROCEDURES_CALL_BLOCK_TYPE) continue;

    // After a gesture, we are called early enough that there could still be insertion markers.
    if (block.isInsertionMarker()) continue;

    // Because this block is a top block, it by definition won't have a parent, but if another
    // block is connected below, we should leave it unchanged instead of unplugging.
    if (block.getNextBlock()) continue;

    var procCode = block.getProcCode();
    // If the procedure doesn't exist or is new, ignore it.
    if (
      !Object.prototype.hasOwnProperty.call(initialTypes, procCode) ||
      !Object.prototype.hasOwnProperty.call(finalTypes, procCode)
    ) continue;

    var actualReturnType = finalTypes[procCode];
    if (
      block.getReturn() !== actualReturnType &&
      // If user is allowed to override call block shape, only update the shape if the definition's
      // shape has actually changed.
      (!Blockly.Procedures.USER_CAN_CHANGE_CALL_TYPE || initialTypes[procCode] !== actualReturnType)
    ) {
      Blockly.Procedures.changeReturnType(block, actualReturnType);
    }
  }
  Blockly.Events.setGroup(false);

  // Toolbox refresh can be slow, so only do when needed.
  var toolboxOutdated = false;
  for (var procCode in finalTypes) {
    // If a current procedure existed but its type has changed, the toolbox must be updated.
    // If a new procedure was created, the toolbox is already updated elsewhere.
    if (
      Object.prototype.hasOwnProperty.call(initialTypes, procCode) &&
      initialTypes[procCode] !== finalTypes[procCode]
    ) {
      toolboxOutdated = true;
      break;
    }
  }
  if (toolboxOutdated) {
    this.refreshToolboxSelection_();
  }
};

/**
 * Does not refresh toolbox.
 */
Blockly.WorkspaceSvg.prototype.enableProcedureReturns = function() {
  this.procedureReturnsEnabled = true;
};

/**
 * Resize and reposition all of the workspace chrome (toolbox,
 * trash, scrollbars etc.)
 * This should be called when something changes that
 * requires recalculating dimensions and positions of the
 * trash, zoom, toolbox, etc. (e.g. window resize).
 */
Blockly.WorkspaceSvg.prototype.resize = function() {
  if (this.toolbox_) {
    this.toolbox_.position();
  }
  if (this.flyout_) {
    this.flyout_.position();
  }
  if (this.trashcan) {
    this.trashcan.position();
  }
  if (this.zoomControls_) {
    this.zoomControls_.position();
  }
  if (this.collapseGutter_) {
    this.collapseGutter_.position(this.getMetrics());
  }
  if (this.blockOutline_) {
    this.blockOutline_.position(this.getMetrics());
  }
  if (this.scrollbar) {
    this.scrollbar.resize();
  }
  this.updateScreenCalculations_();
  this.queueIntersectionCheck();
};

/**
 * Resizes and repositions workspace chrome if the page has a new
 * scroll position.
 * @package
 */
Blockly.WorkspaceSvg.prototype.updateScreenCalculationsIfScrolled
    = function() {
  /* eslint-disable indent */
  var currScroll = goog.dom.getDocumentScroll();
  if (!goog.math.Coordinate.equals(this.lastRecordedPageScroll_,
     currScroll)) {
    this.lastRecordedPageScroll_ = currScroll;
    this.updateScreenCalculations_();
  }
}; /* eslint-enable indent */

/**
 * Get the SVG element that forms the drawing surface.
 * @return {!Element} SVG element.
 */
Blockly.WorkspaceSvg.prototype.getCanvas = function() {
  return this.svgBlockCanvas_;
};

/**
 * Get the SVG element that forms the bubble surface.
 * @return {!SVGGElement} SVG element.
 */
Blockly.WorkspaceSvg.prototype.getBubbleCanvas = function() {
  return this.svgBubbleCanvas_;
};

/**
 * Get the SVG element that contains this workspace.
 * @return {!Element} SVG element.
 */
Blockly.WorkspaceSvg.prototype.getParentSvg = function() {
  if (this.cachedParentSvg_) {
    return this.cachedParentSvg_;
  }
  var element = this.svgGroup_;
  while (element) {
    if (element.tagName == 'svg') {
      this.cachedParentSvg_ = element;
      return element;
    }
    element = element.parentNode;
  }
  return null;
};

/**
 * Translate this workspace to new coordinates.
 * @param {number} x Horizontal translation.
 * @param {number} y Vertical translation.
 */
Blockly.WorkspaceSvg.prototype.translate = function(x, y) {
  if (this.useWorkspaceDragSurface_ && this.isDragSurfaceActive_) {
    this.workspaceDragSurface_.translateSurface(x,y);
  } else {
    var translation = 'translate(' + x + ',' + y + ') ' +
        'scale(' + this.scale + ')';
    this.svgBlockCanvas_.setAttribute('transform', translation);
    this.svgColumnGuideCanvas_.setAttribute('transform', translation);
    this.svgBubbleCanvas_.setAttribute('transform', translation);
  }
  // Now update the block drag surface if we're using one.
  if (this.blockDragSurface_) {
    this.blockDragSurface_.translateAndScaleGroup(x, y, this.scale);
  }
  this.queueIntersectionCheck();
};

/**
 * Called at the end of a workspace drag to take the contents
 * out of the drag surface and put them back into the workspace SVG.
 * Does nothing if the workspace drag surface is not enabled.
 * @package
 */
Blockly.WorkspaceSvg.prototype.resetDragSurface = function() {
  // Don't do anything if we aren't using a drag surface.
  if (!this.useWorkspaceDragSurface_) {
    return;
  }

  this.isDragSurfaceActive_ = false;

  var trans = this.workspaceDragSurface_.getSurfaceTranslation();
  this.workspaceDragSurface_.clearAndHide(this.svgGroup_);
  var translation = 'translate(' + trans.x + ',' + trans.y + ') ' +
      'scale(' + this.scale + ')';
  this.svgBlockCanvas_.setAttribute('transform', translation);
  this.svgColumnGuideCanvas_.setAttribute('transform', translation);
  this.svgBubbleCanvas_.setAttribute('transform', translation);
};

/**
 * Called at the beginning of a workspace drag to move contents of
 * the workspace to the drag surface.
 * Does nothing if the drag surface is not enabled.
 * @package
 */
Blockly.WorkspaceSvg.prototype.setupDragSurface = function() {
  // Don't do anything if we aren't using a drag surface.
  if (!this.useWorkspaceDragSurface_) {
    return;
  }

  // This can happen if the user starts a drag, mouses up outside of the
  // document where the mouseup listener is registered (e.g. outside of an
  // iframe) and then moves the mouse back in the workspace.  On mobile and ff,
  // we get the mouseup outside the frame. On chrome and safari desktop we do
  // not.
  if (this.isDragSurfaceActive_) {
    return;
  }

  this.isDragSurfaceActive_ = true;

  // Figure out where we want to put the canvas back.  The order
  // in the is important because things are layered.
  var previousElement = this.svgBlockCanvas_.previousSibling;
  var width = parseInt(this.getParentSvg().getAttribute('width'), 10);
  var height = parseInt(this.getParentSvg().getAttribute('height'), 10);
  var coord = Blockly.utils.getRelativeXY(this.svgBlockCanvas_);
  this.workspaceDragSurface_.setContentsAndShow(this.svgBlockCanvas_,
      this.svgBubbleCanvas_, previousElement, width, height, this.scale);
  this.workspaceDragSurface_.translateSurface(coord.x, coord.y);
};

/**
 * @return {?Blockly.BlockDragSurfaceSvg} This workspace's block drag surface,
 *     if one is in use.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getBlockDragSurface = function() {
  return this.blockDragSurface_;
};

/**
 * Returns the horizontal offset of the workspace.
 * Intended for LTR/RTL compatibility in XML.
 * @return {number} Width.
 */
Blockly.WorkspaceSvg.prototype.getWidth = function() {
  var metrics = this.getMetrics();
  return metrics ? metrics.viewWidth / this.scale : 0;
};

/**
 * Toggles the visibility of the workspace.
 * Currently only intended for main workspace.
 * @param {boolean} isVisible True if workspace should be visible.
 */
Blockly.WorkspaceSvg.prototype.setVisible = function(isVisible) {

  // Tell the scrollbar whether its container is visible so it can
  // tell when to hide itself.
  if (this.scrollbar) {
    this.scrollbar.setContainerVisible(isVisible);
  }

  // Tell the flyout whether its container is visible so it can
  // tell when to hide itself.
  if (this.getFlyout()) {
    this.getFlyout().setContainerVisible(isVisible);
  }

  this.getParentSvg().style.display = isVisible ? 'block' : 'none';
  if (this.toolbox_) {
    // Currently does not support toolboxes in mutators.
    this.toolbox_.HtmlDiv.style.display = isVisible ? 'block' : 'none';
  }
  if (isVisible) {
    this.render();
    // The window may have changed size while the workspace was hidden.
    // Resize recalculates scrollbar position, delete areas, etc.
    this.resize();
  } else {
    Blockly.hideChaff(true);
    Blockly.DropDownDiv.hideWithoutAnimation();
  }
  this.isVisible_ = isVisible;
};

/**
 * Render all blocks in workspace.
 */
Blockly.WorkspaceSvg.prototype.render = function() {
  // Generate list of all blocks.
  var blocks = this.getAllBlocks();
  // Render each block.
  for (var i = blocks.length - 1; i >= 0; i--) {
    blocks[i].render(false);
  }
};

/**
 * Was used back when block highlighting (for execution) and block selection
 * (for editing) were the same thing.
 * Any calls of this function can be deleted.
 * @deprecated October 2016
 */
Blockly.WorkspaceSvg.prototype.traceOn = function() {
  console.warn('Deprecated call to traceOn, delete this.');
};

/**
 * Highlight or unhighlight a block in the workspace.  Block highlighting is
 * often used to visually mark blocks currently being executed.
 * @param {?string} id ID of block to highlight/unhighlight,
 *   or null for no block (used to unhighlight all blocks).
 * @param {boolean=} opt_state If undefined, highlight specified block and
 * automatically unhighlight all others.  If true or false, manually
 * highlight/unhighlight the specified block.
 */
Blockly.WorkspaceSvg.prototype.highlightBlock = function(id, opt_state) {
  if (opt_state === undefined) {
    // Unhighlight all blocks.
    for (var i = 0, block; block = this.highlightedBlocks_[i]; i++) {
      block.setHighlighted(false);
    }
    this.highlightedBlocks_.length = 0;
  }
  // Highlight/unhighlight the specified block.
  var block = id ? this.getBlockById(id) : null;
  if (block) {
    var state = (opt_state === undefined) || opt_state;
    // Using Set here would be great, but at the cost of IE10 support.
    if (!state) {
      goog.array.remove(this.highlightedBlocks_, block);
    } else if (this.highlightedBlocks_.indexOf(block) == -1) {
      this.highlightedBlocks_.push(block);
    }
    block.setHighlighted(state);
  }
};

/**
 * Glow/unglow a block in the workspace.
 * @param {?string} id ID of block to find.
 * @param {boolean} isGlowingBlock Whether to glow the block.
 */
Blockly.WorkspaceSvg.prototype.glowBlock = function(id, isGlowingBlock) {
  var block = null;
  if (id) {
    block = this.getBlockById(id);
    if (!block) {
      throw 'Tried to glow block that does not exist.';
    }
  }
  block.setGlowBlock(isGlowingBlock);
};

/**
 * Glow/unglow a stack in the workspace.
 * @param {?string} id ID of block which starts the stack.
 * @param {boolean} isGlowingStack Whether to glow the stack.
 */
Blockly.WorkspaceSvg.prototype.glowStack = function(id, isGlowingStack) {
  var block = null;
  if (id) {
    block = this.getBlockById(id);
    if (!block) {
      throw 'Tried to glow stack on block that does not exist.';
    }
  }
  block.setGlowStack(isGlowingStack);
};

/**
 * Visually report a value associated with a block.
 * In Scratch, appears as a pop-up next to the block when a reporter block is clicked.
 * @param {?string} id ID of block to report associated value.
 * @param {?string} value String value to visually report.
 */
Blockly.WorkspaceSvg.prototype.reportValue = function(id, value) {
  var block = this.getBlockById(id);
  if (!block) {
    throw 'Tried to report value on block that does not exist.';
  }
  Blockly.DropDownDiv.hideWithoutAnimation();
  Blockly.DropDownDiv.clearContent();
  var contentDiv = Blockly.DropDownDiv.getContentDiv();
  var valueReportBox = goog.dom.createElement('div');
  valueReportBox.setAttribute('class', 'valueReportBox');
  valueReportBox.textContent = value;
  contentDiv.appendChild(valueReportBox);
  Blockly.DropDownDiv.setColour(
      Blockly.Colours.valueReportBackground,
      Blockly.Colours.valueReportBorder
  );
  Blockly.DropDownDiv.showPositionedByBlock(this, block);
};

/**
 * Paste the provided block onto the workspace.
 * @param {!Element} xmlBlock XML block element.
 */
Blockly.WorkspaceSvg.prototype.paste = function(xmlBlock) {
  if (!this.rendered) {
    return;
  }
  if (this.currentGesture_) {
    this.currentGesture_.cancel();  // Dragging while pasting?  No.
  }
  if (xmlBlock.tagName.toLowerCase() == 'comment') {
    this.pasteWorkspaceComment_(xmlBlock);
  } else {
    this.pasteBlock_(xmlBlock);
  }
};

/**
 * Paste the provided block onto the workspace.
 * @param {!Element} xmlBlock XML block element.
 */
Blockly.WorkspaceSvg.prototype.pasteBlock_ = function(xmlBlock) {
  Blockly.Events.disable();
  try {
    var block = Blockly.Xml.domToBlock(xmlBlock, this);
    // Scratch-specific: Give shadow dom new IDs to prevent duplicating on paste
    Blockly.scratchBlocksUtils.changeObscuredShadowIds(block);
    // Move the duplicate to original position.
    var blockX = parseInt(xmlBlock.getAttribute('x'), 10);
    var blockY = parseInt(xmlBlock.getAttribute('y'), 10);
    if (!isNaN(blockX) && !isNaN(blockY)) {
      if (this.RTL) {
        blockX = -blockX;
      }
      // Offset block until not clobbering another block and not in connection
      // distance with neighbouring blocks.
      do {
        var collide = false;
        var allBlocks = this.getAllBlocks();
        for (var i = 0, otherBlock; otherBlock = allBlocks[i]; i++) {
          var otherXY = otherBlock.getRelativeToSurfaceXY();
          if (Math.abs(blockX - otherXY.x) <= 1 &&
              Math.abs(blockY - otherXY.y) <= 1) {
            collide = true;
            break;
          }
        }
        if (!collide) {
          // Check for blocks in snap range to any of its connections.
          var connections = block.getConnections_(false);
          for (var i = 0, connection; connection = connections[i]; i++) {
            var neighbour = connection.closest(Blockly.SNAP_RADIUS,
                new goog.math.Coordinate(blockX, blockY));
            if (neighbour.connection) {
              collide = true;
              break;
            }
          }
        }
        if (collide) {
          if (this.RTL) {
            blockX -= Blockly.SNAP_RADIUS;
          } else {
            blockX += Blockly.SNAP_RADIUS;
          }
          blockY += Blockly.SNAP_RADIUS * 2;
        }
      } while (collide);
      block.moveBy(blockX, blockY);
    }
  } finally {
    Blockly.Events.enable();
  }
  if (Blockly.Events.isEnabled() && !block.isShadow()) {
    Blockly.Events.fire(new Blockly.Events.BlockCreate(block));
  }
  block.select();
};

/**
 * Paste the provided comment onto the workspace.
 * @param {!Element} xmlComment XML workspace comment element.
 * @private
 */
Blockly.WorkspaceSvg.prototype.pasteWorkspaceComment_ = function(xmlComment) {
  Blockly.Events.disable();
  try {
    var comment = Blockly.WorkspaceCommentSvg.fromXml(xmlComment, this);
    // Move the duplicate to original position.
    var commentX = parseInt(xmlComment.getAttribute('x'), 10);
    var commentY = parseInt(xmlComment.getAttribute('y'), 10);
    if (!isNaN(commentX) && !isNaN(commentY)) {
      if (this.RTL) {
        commentX = -commentX;
      }
      // Offset workspace comment.
      // TODO: (github.com/google/blockly/issues/1719) properly offset comment
      // such that it's not interfereing with any blocks
      commentX += 50;
      commentY += 50;
      comment.moveBy(commentX, commentY);
    }
  } finally {
    Blockly.Events.enable();
  }
  if (Blockly.Events.isEnabled()) {
    Blockly.WorkspaceComment.fireCreateEvent(comment);
  }
  comment.select();
};

/**
 * Refresh the toolbox unless there's a drag in progress.
 * @private
 */
Blockly.WorkspaceSvg.prototype.refreshToolboxSelection_ = function() {
  // Updating the toolbox can be expensive. Don't do it when when it is
  // disabled.
  if (this.toolbox_) {
    if (this.toolbox_.flyout_ && !this.currentGesture_ &&
      this.toolboxRefreshEnabled_) {
      this.toolbox_.refreshSelection();
    }
  } else {
    var thisTarget = this.targetWorkspace;
    if (thisTarget && thisTarget.toolbox_ && thisTarget.toolbox_.flyout_ &&
      !thisTarget.currentGesture_ && thisTarget.toolboxRefreshEnabled_) {
      thisTarget.toolbox_.refreshSelection();
    }
  }
};

/**
 * Rename a variable by updating its name in the variable map.  Update the
 *     flyout to show the renamed variable immediately.
 * @param {string} id ID of the variable to rename.
 * @param {string} newName New variable name.
 * @package
 */
Blockly.WorkspaceSvg.prototype.renameVariableById = function(id, newName) {
  Blockly.WorkspaceSvg.superClass_.renameVariableById.call(this, id, newName);
  this.refreshToolboxSelection_();
};

/**
 * Delete a variable by the passed in ID.   Update the flyout to show
 *     immediately that the variable is deleted.
 * @param {string} id ID of variable to delete.
 * @package
 */
Blockly.WorkspaceSvg.prototype.deleteVariableById = function(id) {
  Blockly.WorkspaceSvg.superClass_.deleteVariableById.call(this, id);
  this.refreshToolboxSelection_();
};

/**
 * Create a new variable with the given name.  Update the flyout to show the new
 *     variable immediately.
 * @param {string} name The new variable's name.
 * @param {string=} opt_type The type of the variable like 'int' or 'string'.
 *     Does not need to be unique. Field_variable can filter variables based on
 *     their type. This will default to '' which is a specific type.
 * @param {string=} opt_id The unique ID of the variable. This will default to
 *     a UUID.
 * @param {boolean=} opt_isLocal Whether the variable is locally scoped.
 * @param {boolean=} opt_isCloud Whether the variable is a cloud variable.
 * @return {?Blockly.VariableModel} The newly created variable.
 * @package
 */
Blockly.WorkspaceSvg.prototype.createVariable = function(name, opt_type, opt_id,
    opt_isLocal, opt_isCloud) {
  var variableInMap = (this.getVariable(name, opt_type) != null);
  var newVar = Blockly.WorkspaceSvg.superClass_.createVariable.call(
      this, name, opt_type, opt_id, opt_isLocal, opt_isCloud);
  // For performance reasons, only refresh the the toolbox for new variables.
  // Variables that already exist should already be there.
  if (!variableInMap && (opt_type != Blockly.BROADCAST_MESSAGE_VARIABLE_TYPE)) {
    this.refreshToolboxSelection_();
  }
  return newVar;
};

/**
 * Update cached areas for this workspace.
 */
Blockly.WorkspaceSvg.prototype.recordCachedAreas = function() {
  this.recordBlocksArea_();
  this.recordDeleteAreas_();
};

/**
 * Make a list of all the delete areas for this workspace.
 * @private
 */
Blockly.WorkspaceSvg.prototype.recordDeleteAreas_ = function() {
  if (this.trashcan) {
    this.deleteAreaTrash_ = this.trashcan.getClientRect();
  } else {
    this.deleteAreaTrash_ = null;
  }
  if (this.flyout_) {
    this.deleteAreaToolbox_ = this.flyout_.getClientRect();
  } else if (this.toolbox_) {
    this.deleteAreaToolbox_ = this.toolbox_.getClientRect();
  } else {
    this.deleteAreaToolbox_ = null;
  }
};

/**
 * Record where all of blocks GUI is on the screen
 * @private
 */
Blockly.WorkspaceSvg.prototype.recordBlocksArea_ = function() {
  var parentSvg = this.getParentSvg();
  if (parentSvg) {
    var bounds = parentSvg.getBoundingClientRect();
    this.blocksArea_ = new goog.math.Rect(bounds.left, bounds.top, bounds.width, bounds.height);
  } else {
    this.blocksArea_ = null;
  }
};

/**
 * Is the mouse event over a delete area (toolbox or non-closing flyout)?
 * @param {!Event} e Mouse move event.
 * @return {?number} Null if not over a delete area, or an enum representing
 *     which delete area the event is over.
 */
Blockly.WorkspaceSvg.prototype.isDeleteArea = function(e) {
  var xy = new goog.math.Coordinate(e.clientX, e.clientY);
  if (this.deleteAreaTrash_ && this.deleteAreaTrash_.contains(xy)) {
    return Blockly.DELETE_AREA_TRASH;
  }
  if (this.deleteAreaToolbox_ && this.deleteAreaToolbox_.contains(xy)) {
    return Blockly.DELETE_AREA_TOOLBOX;
  }
  return Blockly.DELETE_AREA_NONE;
};

/**
 * Is the mouse event inside the blocks UI?
 * @param {!Event} e Mouse move event.
 * @return {boolean} True if event is within the bounds of the blocks UI or delete area
 */
Blockly.WorkspaceSvg.prototype.isInsideBlocksArea = function(e) {
  var xy = new goog.math.Coordinate(e.clientX, e.clientY);
  if (this.isDeleteArea(e) || (this.blocksArea_ && this.blocksArea_.contains(xy))) {
    return true;
  }
  return false;
};

/**
 * Handle a mouse-down on SVG drawing surface.
 * @param {!Event} e Mouse down event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onMouseDown_ = function(e) {
  var block = this.getBlockFromEvent_(e);

  // Handle selection mode clicks
  if (this.selectionMode_) {
    if (block) {
      // Select the block instead of starting a gesture
      this.selectBlock_(block);
      e.stopPropagation();
      e.preventDefault();
      return;
    } else {
      // Clicked on empty space - deselect
      if (this.selectedBlock_) {
        this.deselectBlock_();
      }
    }
  }

  // Triple-click detection on empty workspace to toggle selection mode
  if (!block) {
    var now = Date.now();
    this.lastClickTimes_.push(now);

    // Keep only the last 3 click times
    if (this.lastClickTimes_.length > 3) {
      this.lastClickTimes_.shift();
    }

    // Check if we have 3 clicks within 600ms
    if (this.lastClickTimes_.length === 3) {
      var timeSinceFirstClick = now - this.lastClickTimes_[0];
      if (timeSinceFirstClick < 600) {
        // Triple-click detected! Toggle selection mode
        this.toggleSelectionMode();
        this.lastClickTimes_ = []; // Reset click times
        e.stopPropagation();
        e.preventDefault();
        return;
      }
    }
  }

  var gesture = this.getGesture(e);
  if (gesture) {
    gesture.handleWsStart(e, this);
  }
};

/**
 * Start tracking a drag of an object on this workspace.
 * @param {!Event} e Mouse down event.
 * @param {!goog.math.Coordinate} xy Starting location of object.
 */
Blockly.WorkspaceSvg.prototype.startDrag = function(e, xy) {
  // Record the starting offset between the bubble's location and the mouse.
  var point = Blockly.utils.mouseToSvg(e, this.getParentSvg(),
      this.getInverseScreenCTM());
  // Fix scale of mouse event.
  point.x /= this.scale;
  point.y /= this.scale;
  this.dragDeltaXY_ = goog.math.Coordinate.difference(xy, point);
};

/**
 * Track a drag of an object on this workspace.
 * @param {!Event} e Mouse move event.
 * @return {!goog.math.Coordinate} New location of object.
 */
Blockly.WorkspaceSvg.prototype.moveDrag = function(e) {
  var point = Blockly.utils.mouseToSvg(e, this.getParentSvg(),
      this.getInverseScreenCTM());
  // Fix scale of mouse event.
  point.x /= this.scale;
  point.y /= this.scale;
  return goog.math.Coordinate.sum(this.dragDeltaXY_, point);
};

/**
 * Is the user currently dragging a block or scrolling the flyout/workspace?
 * @return {boolean} True if currently dragging or scrolling.
 */
Blockly.WorkspaceSvg.prototype.isDragging = function() {
  return this.currentGesture_ && this.currentGesture_.isDragging();
};

/**
 * Is this workspace draggable and scrollable?
 * @return {boolean} True if this workspace may be dragged.
 */
Blockly.WorkspaceSvg.prototype.isDraggable = function() {
  return !!this.scrollbar;
};

/**
 * Handle a mouse-wheel on SVG drawing surface.
 * @param {!Event} e Mouse wheel event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onMouseWheel_ = function(e) {
  // TODO: Remove gesture cancellation and compensate for coordinate skew during
  // zoom.
  if (this.currentGesture_) {
    this.currentGesture_.cancel();
  }

  // Multiplier variable, so that non-pixel-deltaModes are supported.
  // See LLK/scratch-blocks#1190.
  var multiplier = e.deltaMode === 0x1 ? Blockly.LINE_SCROLL_MULTIPLIER : 1;

  if (e.ctrlKey) {
    // The vertical scroll distance that corresponds to a click of a zoom button.
    var PIXELS_PER_ZOOM_STEP = 50;
    var delta = -e.deltaY / PIXELS_PER_ZOOM_STEP * multiplier;
    var position = Blockly.utils.mouseToSvg(e, this.getParentSvg(),
        this.getInverseScreenCTM());
    this.zoom(position.x, position.y, delta);
  } else {
    // This is a regular mouse wheel event - scroll the workspace
    // First hide the WidgetDiv without animation
    // (mouse scroll makes field out of place with div)
    Blockly.WidgetDiv.hide(true);
    Blockly.DropDownDiv.hideWithoutAnimation();

    var x = this.scrollX - e.deltaX * multiplier;
    var y = this.scrollY - e.deltaY * multiplier;

    if (e.shiftKey && e.deltaX === 0) {
      // Scroll horizontally (based on vertical scroll delta)
      // This is needed as for some browser/system combinations which do not
      // set deltaX. See #1662.
      x = this.scrollX - e.deltaY * multiplier;
      y = this.scrollY; // Don't scroll vertically
    }

    this.startDragMetrics = this.getMetrics();
    this.scroll(x, y);
  }
  e.preventDefault();
};

/**
 * Handle modifier key (Cmd/Ctrl) down event.
 * @param {!KeyboardEvent} e Keyboard event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onModifierKeyDown_ = function(e) {
  // Handle selection mode keyboard navigation
  if (this.selectionMode_ && this.selectedBlock_) {
    var handled = false;
    var metaKey = e.metaKey || e.ctrlKey; // Cmd on Mac, Ctrl on Windows/Linux

    // Cmd/Ctrl + D: Duplicate block
    if (metaKey && e.key === 'd') {
      handled = this.duplicateSelectedBlock_();
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Alt + Arrow keys: Move block
    if (e.altKey) {
      switch (e.key) {
        case 'ArrowUp':
          handled = this.moveBlockUp_(this.selectedBlock_);
          if (handled) {
            this.selectBlock_(this.selectedBlock_); // Refresh selection visuals
          }
          break;
        case 'ArrowDown':
          handled = this.moveBlockDown_(this.selectedBlock_);
          if (handled) {
            this.selectBlock_(this.selectedBlock_); // Refresh selection visuals
          }
          break;
        case 'ArrowLeft':
          handled = this.moveBlockLeft_(this.selectedBlock_);
          if (handled) {
            this.selectBlock_(this.selectedBlock_); // Refresh selection visuals
          }
          break;
        case 'ArrowRight':
          handled = this.moveBlockRight_(this.selectedBlock_);
          if (handled) {
            this.selectBlock_(this.selectedBlock_); // Refresh selection visuals
          }
          break;
      }
    } else if (!metaKey) { // Only handle pure arrow keys (no Cmd/Ctrl)
      // Pure arrow keys: Change focus
      switch (e.key) {
        case 'ArrowUp':
          handled = this.selectPreviousSibling_();
          break;
        case 'ArrowDown':
          handled = this.selectNextSibling_();
          break;
        case 'ArrowLeft':
          handled = this.selectParentBlock_();
          break;
        case 'ArrowRight':
          handled = this.selectFirstChild_();
          break;
        case 'Escape':
          this.deselectBlock_();
          handled = true;
          break;
        case 'Delete':
        case 'Backspace':
          handled = this.deleteSelectenBlock_();
          break;
      }
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
};

/**
 * Handle modifier key (Cmd/Ctrl) up event.
 * @param {!KeyboardEvent} _e Keyboard event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onModifierKeyUp_ = function(_e) {
  // No longer needed - CMD/Ctrl hover functionality removed
};

/**
 * Clear all hover highlighting and dimming effects from blocks.
 * @private
 */
Blockly.WorkspaceSvg.prototype.clearBlockHoverEffects_ = function() {
  // Remove highlight from all tracked highlighted blocks
  if (this.highlightedBlocks_list_) {
    for (var i = 0; i < this.highlightedBlocks_list_.length; i++) {
      var block = this.highlightedBlocks_list_[i];
      if (block && block.svgGroup_) {
        block.removeHoverHighlight();
      }
    }
    this.highlightedBlocks_list_ = [];
  }

  // Also try to remove from lastHoveredBlock and its children as fallback
  if (this.lastHoveredBlock_) {
    this.removeHighlightFromBlockAndChildren_(this.lastHoveredBlock_);
    this.lastHoveredBlock_ = null;
  }

  // Remove dimming classes from all previously dimmed blocks
  // BUT: In selection mode, don't clear dimming since all blocks should stay dimmed
  if (!this.selectionMode_ && this.lastDimmedBlocks_) {
    for (var i = 0; i < this.lastDimmedBlocks_.length; i++) {
      var block = this.lastDimmedBlocks_[i];
      if (block && block.svgGroup_) {
        Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedContainer');
        Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedNext');
      }
    }
    this.lastDimmedBlocks_ = [];
  }
};

/**
 * Recursively remove highlight from a block and all its child blocks.
 * @param {!Blockly.BlockSvg} block The block to remove highlight from.
 * @private
 */
Blockly.WorkspaceSvg.prototype.removeHighlightFromBlockAndChildren_ = function(block) {
  if (!block || !block.svgGroup_) {
    return;
  }

  // Remove the highlight class from this block
  block.removeHoverHighlight();

  // Recursively remove highlight from all child blocks
  var children = block.getChildren(false);
  for (var i = 0; i < children.length; i++) {
    this.removeHighlightFromBlockAndChildren_(children[i]);
  }
};

/**
 * Recursively dim a block and all its child blocks.
 * Does NOT dim next blocks (blocks connected via nextConnection).
 * @param {!Blockly.BlockSvg} block The block to dim.
 * @param {string} className The CSS class to add ('blocklyDimmedContainer' or 'blocklyDimmedNext').
 * @param {!Array<!Blockly.BlockSvg>} dimmedList Array to track dimmed blocks.
 * @private
 */
Blockly.WorkspaceSvg.prototype.dimBlockAndChildren_ = function(block, className, dimmedList) {
  if (!block || !block.svgGroup_) {
    return;
  }

  // Add the dimming class to this block
  Blockly.utils.addClass(block.svgGroup_, className);
  dimmedList.push(block);

  // Recursively dim child blocks connected via input connections
  // For each input connection, also process the entire next chain within that substack
  for (var i = 0; i < block.inputList.length; i++) {
    var input = block.inputList[i];
    if (input.connection) {
      var childBlock = input.connection.targetBlock();
      // Process the first block in the input
      if (childBlock) {
        this.dimBlockAndChildren_(childBlock, className, dimmedList);
        // Also process all blocks in the next chain within this substack
        var nextBlock = childBlock.nextConnection && childBlock.nextConnection.targetBlock();
        while (nextBlock) {
          this.dimBlockAndChildren_(nextBlock, className, dimmedList);
          nextBlock = nextBlock.nextConnection && nextBlock.nextConnection.targetBlock();
        }
      }
    }
  }

  // Do NOT process this block's own nextConnection (that's the sibling, not child)
};

/**
 * Recursively remove dimming from a block and all its child blocks.
 * Does NOT undim next blocks (blocks connected via nextConnection).
 * @param {!Blockly.BlockSvg} block The block to undim.
 * @private
 */
Blockly.WorkspaceSvg.prototype.undimBlockAndChildren_ = function(block) {
  if (!block || !block.svgGroup_) {
    return;
  }

  // Remove dimming classes from this block
  Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedContainer');
  Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedNext');

  // Recursively undim child blocks connected via input connections only
  // Do NOT process next chains - they should remain dimmed
  for (var i = 0; i < block.inputList.length; i++) {
    var input = block.inputList[i];
    if (input.connection) {
      var childBlock = input.connection.targetBlock();
      if (childBlock) {
        this.undimBlockAndChildren_(childBlock);
      }
    }
  }
};

/**
 * Dim all blocks in the workspace.
 * @private
 */
Blockly.WorkspaceSvg.prototype.dimAllBlocks_ = function() {
  // Initialize tracking array
  this.allDimmedBlocks_ = [];

  // Get all top-level blocks
  var topBlocks = this.getTopBlocks(false);

  // Dim each top block, its descendants, and its next chain
  for (var i = 0; i < topBlocks.length; i++) {
    var block = topBlocks[i];
    // Dim this block and all its children (including substacks)
    this.dimBlockAndChildren_(block, 'blocklyDimmedContainer', this.allDimmedBlocks_);

    // Also dim all blocks in the next chain at this level
    var nextBlock = block.nextConnection && block.nextConnection.targetBlock();
    while (nextBlock) {
      this.dimBlockAndChildren_(nextBlock, 'blocklyDimmedContainer', this.allDimmedBlocks_);
      nextBlock = nextBlock.nextConnection && nextBlock.nextConnection.targetBlock();
    }
  }
};

/**
 * Clear dimming from all blocks in the workspace.
 * @private
 */
Blockly.WorkspaceSvg.prototype.clearAllBlockDimming_ = function() {
  if (this.allDimmedBlocks_) {
    for (var i = 0; i < this.allDimmedBlocks_.length; i++) {
      var block = this.allDimmedBlocks_[i];
      if (block && block.svgGroup_) {
        Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedContainer');
        Blockly.utils.removeClass(block.svgGroup_, 'blocklyDimmedNext');
      }
    }
    this.allDimmedBlocks_ = [];
  }
};

/**
 * Recursively highlight a block and all its child blocks.
 * Does NOT highlight next blocks (blocks connected via nextConnection).
 * @param {!Blockly.BlockSvg} block The block to highlight.
 * @private
 */
Blockly.WorkspaceSvg.prototype.highlightBlockAndChildren_ = function(block) {
  if (!block || !block.svgGroup_) {
    return;
  }

  // Add the highlight class to this block
  block.addHoverHighlight();

  // Track this block for cleanup
  if (!this.highlightedBlocks_list_) {
    this.highlightedBlocks_list_ = [];
  }
  this.highlightedBlocks_list_.push(block);

  // Recursively highlight child blocks connected via input connections
  // For each input connection, also process the entire next chain within that substack
  for (var i = 0; i < block.inputList.length; i++) {
    var input = block.inputList[i];
    if (input.connection) {
      var childBlock = input.connection.targetBlock();
      // Process the first block in the input
      if (childBlock) {
        this.highlightBlockAndChildren_(childBlock);
        // Also process all blocks in the next chain within this substack
        var nextBlock = childBlock.nextConnection && childBlock.nextConnection.targetBlock();
        while (nextBlock) {
          this.highlightBlockAndChildren_(nextBlock);
          nextBlock = nextBlock.nextConnection && nextBlock.nextConnection.targetBlock();
        }
      }
    }
  }

  // Do NOT process this block's own nextConnection (that's the sibling, not child)
};

/**
 * Handle mouseover event on block canvas (event delegation).
 * Throttled to avoid excessive processing during fast mouse movements.
 * @param {!MouseEvent} e Mouse event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onBlockHover_ = function(e) {
  if (!this.modifierKeyPressed_) {
    return;
  }

  // Clear any pending throttle timer
  if (this.hoverThrottleTimer_) {
    clearTimeout(this.hoverThrottleTimer_);
  }

  // Throttle to 50ms to prevent excessive processing
  var self = this;
  this.hoverThrottleTimer_ = setTimeout(function() {
    self.hoverThrottleTimer_ = null;
    self.processBlockHover_(e);
  }, 50);
};

/**
 * Process block hover event (actual implementation).
 * @param {!MouseEvent} e Mouse event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.processBlockHover_ = function(e) {
  if (!this.modifierKeyPressed_) {
    return;
  }

  // In keyboard navigation mode, ignore mouse hover events
  if (this.keyboardNavigationMode_) {
    return;
  }

  var block = this.getBlockFromEvent_(e);
  if (!block) {
    return;
  }

  // Step 1: Find the draggable block (same logic as gesture handling)
  // Shadow blocks should use their first non-shadow parent (unless it's a shadow argument reporter)
  var shouldDuplicate = Blockly.scratchBlocksUtils &&
                       Blockly.scratchBlocksUtils.isShadowArgumentReporter(block);

  while (block && block.isShadow() && !shouldDuplicate) {
    block = block.getParent();
  }

  if (!block) {
    return;
  }

  // Only update if we're hovering over a different block than last time
  if (this.lastHoveredBlock_ === block) {
    return;
  }

  // Clear previous highlighting/dimming
  this.clearBlockHoverEffects_();

  if (!this.lastDimmedBlocks_) {
    this.lastDimmedBlocks_ = [];
  }

  // Step 2: Recursively dim all parent blocks and their children (向上递归)
  var parent = block.getParent();
  while (parent) {
    this.dimBlockAndChildren_(parent, 'blocklyDimmedContainer', this.lastDimmedBlocks_);
    parent = parent.getParent();
  }

  // Step 3: Dim all next blocks and their children
  var nextBlock = block.getNextBlock();
  while (nextBlock) {
    this.dimBlockAndChildren_(nextBlock, 'blocklyDimmedNext', this.lastDimmedBlocks_);
    nextBlock = nextBlock.getNextBlock();
  }

  // Step 4: Highlight the current block AND all its children (will override any dimming via CSS priority)
  // This must be done LAST so it overrides any dimming that may have affected this block or its children
  this.highlightBlockAndChildren_(block);

  this.lastHoveredBlock_ = block;
};

/**
 * Handle mouseout event on block canvas (event delegation).
 * @param {!MouseEvent} e Mouse event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.onBlockUnhover_ = function(e) {
  // When leaving a block, onBlockHover_ will be called for the new block (if any)
  // So we don't need to do anything here - the new hover will clear old effects
  // Only clear if we're leaving to empty space (no related block)
  if (!this.modifierKeyPressed_) {
    return;
  }

  var relatedTarget = e.relatedTarget;
  if (!relatedTarget) {
    // Moving to empty space, clear all effects
    this.clearBlockHoverEffects_();
    return;
  }

  // Check if we're moving to another block element
  var element = relatedTarget;
  var foundBlock = false;
  while (element && element !== this.svgBlockCanvas_) {
    if (element.dataset && element.dataset.id) {
      foundBlock = true;
      break;
    }
    element = element.parentElement;
  }

  // If not moving to another block, clear effects
  if (!foundBlock) {
    this.clearBlockHoverEffects_();
  }
};

/**
 * Get the block from a mouse event by traversing up the DOM tree.
 * @param {!MouseEvent} e Mouse event.
 * @return {Blockly.BlockSvg} The block or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.getBlockFromEvent_ = function(e) {
  var element = e.target;
  while (element && element !== this.svgBlockCanvas_) {
    if (element.dataset && element.dataset.id) {
      var blockId = element.dataset.id;
      return this.getBlockById(blockId);
    }
    element = element.parentElement;
  }
  return null;
};

/**
 * Toggle selection mode on/off.
 */
Blockly.WorkspaceSvg.prototype.toggleSelectionMode = function() {
  this.selectionMode_ = !this.selectionMode_;

  // Update button visual state
  if (this.zoomControls_) {
    if (this.selectionMode_) {
      // Active state
      if (this.zoomControls_.selectionModeBackground_) {
        this.zoomControls_.selectionModeBackground_.setAttribute('fill', '#4C97FF');
        this.zoomControls_.selectionModeBackground_.setAttribute('fill-opacity', '1');
        this.zoomControls_.selectionModeBackground_.setAttribute('stroke', '#3373CC');
      }
      if (this.zoomControls_.selectionModeIcon_) {
        this.zoomControls_.selectionModeIcon_.setAttribute('fill', '#FFFFFF');
      }
    } else {
      // Inactive state
      if (this.zoomControls_.selectionModeBackground_) {
        this.zoomControls_.selectionModeBackground_.setAttribute('fill', '#ffffff');
        this.zoomControls_.selectionModeBackground_.setAttribute('fill-opacity', '0.9');
        this.zoomControls_.selectionModeBackground_.setAttribute('stroke', '#C0C0C0');
      }
      if (this.zoomControls_.selectionModeIcon_) {
        this.zoomControls_.selectionModeIcon_.setAttribute('fill', '#575E75');
      }
    }
  }

  // When entering selection mode, dim all blocks
  if (this.selectionMode_) {
    this.dimAllBlocks_();
  } else {
    // When exiting selection mode, clear all dimming and selection
    if (this.selectedBlock_) {
      this.deselectBlock_();
    }
    this.clearAllBlockDimming_();
  }
};

/**
 * Select a block for keyboard navigation.
 * @param {!Blockly.BlockSvg} block The block to select.
 * @private
 */
Blockly.WorkspaceSvg.prototype.selectBlock_ = function(block) {
  if (!block) {
    return;
  }

  // Find the draggable block (same logic as CMD+Hover)
  var shouldDuplicate = Blockly.scratchBlocksUtils &&
                       Blockly.scratchBlocksUtils.isShadowArgumentReporter(block);

  while (block && block.isShadow() && !shouldDuplicate) {
    block = block.getParent();
  }

  if (!block) {
    return;
  }

  // Deselect previous block (this will re-dim it)
  if (this.selectedBlock_) {
    this.deselectBlock_();
  }

  // Select new block
  this.selectedBlock_ = block;

  // Apply selection visual (reuse highlighting logic)
  this.highlightedBlocks_list_ = [];
  this.highlightBlockAndChildren_(block);

  // Remove dimming from the selected block and its children (they should be highlighted, not dimmed)
  this.undimBlockAndChildren_(block);
};

/**
 * Deselect the currently selected block.
 * @private
 */
Blockly.WorkspaceSvg.prototype.deselectBlock_ = function() {
  if (!this.selectedBlock_) {
    return;
  }

  var previouslySelectedBlock = this.selectedBlock_;

  // Clear highlighting first
  this.clearBlockHoverEffects_();

  this.selectedBlock_ = null;

  // Re-dim the previously selected block if still in selection mode
  // This must happen AFTER clearing highlighting to ensure the highlight is gone
  if (this.selectionMode_ && previouslySelectedBlock) {
    this.dimBlockAndChildren_(previouslySelectedBlock, 'blocklyDimmedContainer', this.allDimmedBlocks_ || []);
  }
};

/**
 * Select the previous sibling block.
 * If at the beginning of current substack, try to move to the last block of previous substack.
 * @return {boolean} True if selection changed.
 * @private
 */
Blockly.WorkspaceSvg.prototype.selectPreviousSibling_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  // Case 1: Has a previous sibling in the same chain
  // We need to check if previousConnection is connected to another block's nextConnection
  // (not to a parent block's statement input)
  var previousBlock = null;
  if (this.selectedBlock_.previousConnection &&
      this.selectedBlock_.previousConnection.targetConnection) {
    var targetConn = this.selectedBlock_.previousConnection.targetConnection;
    var sourceBlock = targetConn.getSourceBlock();

    // The key insight: we need to check if targetConn is the nextConnection of the source block
    // If previousConnection connects to another block's nextConnection, it's a sibling
    // If previousConnection connects to another block's statement input, it's a child-parent relationship
    if (targetConn === sourceBlock.nextConnection) {
      // This is connected to another block's nextConnection - it's a sibling
      previousBlock = sourceBlock;
    }
  }

  if (previousBlock) {
    this.selectBlock_(previousBlock);
    return true;
  }

  // Case 2: Check if this is a reporter block (has output connection)
  // Try to find the previous reporter input in the same parent
  if (this.selectedBlock_.outputConnection) {
    var previousReporter = this.getPreviousReporterInput_(this.selectedBlock_);
    if (previousReporter) {
      this.selectBlock_(previousReporter);
      return true;
    }
    // No previous reporter - this is the first reporter in the parent
    // Navigate to the parent block (like pressing Left)
    return this.selectParentBlock_();
  }

  // Case 3: No previous sibling - check if we're in a substack
  // If yes, try to jump to the last block of the previous substack or reporter inputs
  var surroundParent = this.selectedBlock_.getSurroundParent();

  if (!surroundParent) {
    // Not in a substack at all - this is a top-level block with no previous sibling
    return false;
  }

  // Find which substack the current block is in
  var currentSubstack = this.findCurrentSubstack_(this.selectedBlock_, surroundParent);

  if (!currentSubstack) {
    // Can't find current substack (shouldn't happen)
    return false;
  }

  // First, search backwards through all previous substacks to find one with content
  var checkSubstack = currentSubstack;
  while (true) {
    var previousSubstack = this.findPreviousSubstack_(checkSubstack, surroundParent);

    if (!previousSubstack) {
      // No more previous substacks - now try to jump to reporter inputs
      var reporterInputs = this.getReporterInputsBefore_(currentSubstack, surroundParent);
      if (reporterInputs.length > 0) {
        // Select the last reporter input
        var lastReporter = reporterInputs[reporterInputs.length - 1];
        this.selectBlock_(lastReporter);
        return true;
      }
      // No reporter inputs either - navigate to parent block (like pressing Left)
      return this.selectParentBlock_();
    }

    var firstBlockInPrevSubstack = previousSubstack.targetBlock();

    if (firstBlockInPrevSubstack) {
      // Found a non-empty substack! Select its last block
      var lastBlock = this.findLastBlockInChain_(firstBlockInPrevSubstack);
      this.selectBlock_(lastBlock);
      return true;
    }

    // This substack is empty, continue searching backwards
    checkSubstack = previousSubstack;
  }
};

/**
 * Select the next sibling block.
 * If at the end of current substack, try to move to the first block of next substack.
 * For reporter blocks, try to move to the parent's substack.
 * @return {boolean} True if selection changed.
 * @private
 */
Blockly.WorkspaceSvg.prototype.selectNextSibling_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  // Case 1: Has a next sibling in the same chain
  // Simply use getNextBlock() since nextConnection always connects to sibling blocks
  var nextBlock = this.selectedBlock_.getNextBlock();
  if (nextBlock) {
    this.selectBlock_(nextBlock);
    return true;
  }

  // Case 2: Check if this is a reporter block (has output connection)
  // First try to jump to the next reporter input in the same parent
  // If no next reporter, try to jump to the parent's first substack
  if (this.selectedBlock_.outputConnection) {
    // Try to find the next reporter input
    var nextReporter = this.getNextReporterInput_(this.selectedBlock_);
    if (nextReporter) {
      this.selectBlock_(nextReporter);
      return true;
    }

    // No next reporter - try to jump to parent's substack
    var parent = this.selectedBlock_.getParent();
    if (parent) {
      // Find the first substack in the parent
      var firstSubstack = parent.getFirstStatementConnection();
      if (firstSubstack && firstSubstack.targetBlock()) {
        this.selectBlock_(firstSubstack.targetBlock());
        return true;
      }
    }
    // No substack either - navigate to parent block (like pressing Left)
    return this.selectParentBlock_();
  }

  // Case 3: No next sibling - at the end of current substack
  // Try to jump to the first block of the next substack
  var surroundParent = this.selectedBlock_.getSurroundParent();
  if (!surroundParent) {
    // Not in a substack at all
    return false;
  }

  // Find which substack the current block is in
  var currentSubstack = this.findCurrentSubstack_(this.selectedBlock_, surroundParent);
  if (!currentSubstack) {
    // Can't find current substack (shouldn't happen)
    return false;
  }

  // Search forwards through all next substacks to find one with content
  var checkSubstack = currentSubstack;
  while (true) {
    var nextSubstack = this.findNextSubstack_(checkSubstack, surroundParent);
    if (!nextSubstack) {
      // No more next substacks - navigate to parent block (like pressing Left)
      return this.selectParentBlock_();
    }

    var firstBlockInNextSubstack = nextSubstack.targetBlock();
    if (firstBlockInNextSubstack) {
      // Found a non-empty substack! Select its first block
      this.selectBlock_(firstBlockInNextSubstack);
      return true;
    }

    // This substack is empty, continue searching forwards
    checkSubstack = nextSubstack;
  }
};

/**
 * Select the parent (surround) block.
 * @return {boolean} True if selection changed.
 * @private
 */
Blockly.WorkspaceSvg.prototype.selectParentBlock_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  var parentBlock = this.selectedBlock_.getSurroundParent();
  if (parentBlock) {
    this.selectBlock_(parentBlock);
    return true;
  }
  return false;
};

/**
 * Select the first child block.
 * Try reporter inputs (value inputs) first, then statement inputs (substacks).
 * @return {boolean} True if selection changed.
 * @private
 */
Blockly.WorkspaceSvg.prototype.selectFirstChild_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  // First, try to find reporter blocks in value inputs
  for (var i = 0; i < this.selectedBlock_.inputList.length; i++) {
    var input = this.selectedBlock_.inputList[i];
    if (input.connection && input.connection.type === Blockly.INPUT_VALUE) {
      var targetBlock = input.connection.targetBlock();
      if (targetBlock) {
        this.selectBlock_(targetBlock);
        return true;
      }
    }
  }

  // If no reporter inputs, try statement inputs (substacks)
  var firstStatementConnection = this.selectedBlock_.getFirstStatementConnection();
  if (firstStatementConnection && firstStatementConnection.targetBlock()) {
    this.selectBlock_(firstStatementConnection.targetBlock());
    return true;
  }

  return false;
};

/**
 * Get all reporter (value input) blocks that come before a given substack.
 * @param {!Blockly.Connection} substackConnection The substack connection.
 * @param {!Blockly.BlockSvg} parentBlock The parent block.
 * @return {!Array<!Blockly.BlockSvg>} Array of reporter blocks.
 * @private
 */
Blockly.WorkspaceSvg.prototype.getReporterInputsBefore_ = function(substackConnection, parentBlock) {
  var reporters = [];

  if (!substackConnection || !parentBlock) {
    return reporters;
  }

  // Find the index of the substack
  var substackIndex = -1;
  for (var i = 0; i < parentBlock.inputList.length; i++) {
    if (parentBlock.inputList[i].connection === substackConnection) {
      substackIndex = i;
      break;
    }
  }

  if (substackIndex === -1) {
    return reporters;
  }

  // Collect all reporter blocks that come before this substack
  for (var i = 0; i < substackIndex; i++) {
    var input = parentBlock.inputList[i];
    if (input.connection && input.connection.type === Blockly.INPUT_VALUE) {
      var targetBlock = input.connection.targetBlock();
      if (targetBlock) {
        reporters.push(targetBlock);
      }
    }
  }

  return reporters;
};

/**
 * Find the next reporter input after the current reporter block.
 * @param {!Blockly.BlockSvg} currentReporter The current reporter block.
 * @return {Blockly.BlockSvg} The next reporter block or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.getNextReporterInput_ = function(currentReporter) {
  if (!currentReporter || !currentReporter.outputConnection) {
    return null;
  }

  var parent = currentReporter.getParent();
  if (!parent) {
    return null;
  }

  // Find the index of the current reporter's input
  var currentInputIndex = -1;
  for (var i = 0; i < parent.inputList.length; i++) {
    var input = parent.inputList[i];
    if (input.connection &&
        input.connection.type === Blockly.INPUT_VALUE &&
        input.connection.targetBlock() === currentReporter) {
      currentInputIndex = i;
      break;
    }
  }

  if (currentInputIndex === -1) {
    return null;
  }

  // Look for the next value input after this one
  for (var i = currentInputIndex + 1; i < parent.inputList.length; i++) {
    var input = parent.inputList[i];
    if (input.connection && input.connection.type === Blockly.INPUT_VALUE) {
      var targetBlock = input.connection.targetBlock();
      if (targetBlock) {
        return targetBlock;
      }
    }
  }

  return null;
};

/**
 * Find the previous reporter input before the current reporter block.
 * @param {!Blockly.BlockSvg} currentReporter The current reporter block.
 * @return {Blockly.BlockSvg} The previous reporter block or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.getPreviousReporterInput_ = function(currentReporter) {
  if (!currentReporter || !currentReporter.outputConnection) {
    return null;
  }

  var parent = currentReporter.getParent();
  if (!parent) {
    return null;
  }

  // Find the index of the current reporter's input
  var currentInputIndex = -1;
  for (var i = 0; i < parent.inputList.length; i++) {
    var input = parent.inputList[i];
    if (input.connection &&
        input.connection.type === Blockly.INPUT_VALUE &&
        input.connection.targetBlock() === currentReporter) {
      currentInputIndex = i;
      break;
    }
  }

  if (currentInputIndex === -1) {
    return null;
  }

  // Look backwards for the previous value input before this one
  for (var i = currentInputIndex - 1; i >= 0; i--) {
    var input = parent.inputList[i];
    if (input.connection && input.connection.type === Blockly.INPUT_VALUE) {
      var targetBlock = input.connection.targetBlock();
      if (targetBlock) {
        return targetBlock;
      }
    }
  }

  return null;
};

/**
 * Find which substack (input_statement connection) contains the given block.
 * @param {!Blockly.BlockSvg} block The block to find.
 * @param {!Blockly.BlockSvg} parentBlock The parent block to search.
 * @return {Blockly.Connection} The statement connection or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.findCurrentSubstack_ = function(block, parentBlock) {
  if (!block || !parentBlock) {
    return null;
  }

  // Iterate through all inputs of the parent block
  for (var i = 0; i < parentBlock.inputList.length; i++) {
    var input = parentBlock.inputList[i];
    if (input.connection && input.connection.type === Blockly.NEXT_STATEMENT) {
      // Check if this substack contains our block
      var firstBlock = input.connection.targetBlock();
      if (firstBlock) {
        var current = firstBlock;
        while (current) {
          if (current === block) {
            return input.connection;
          }
          current = current.getNextBlock();
        }
      }
    }
  }

  return null;
};

/**
 * Find the next substack after the given one in the parent block.
 * @param {!Blockly.Connection} currentSubstack The current substack connection.
 * @param {!Blockly.BlockSvg} parentBlock The parent block.
 * @return {Blockly.Connection} The next statement connection or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.findNextSubstack_ = function(currentSubstack, parentBlock) {
  if (!currentSubstack || !parentBlock) {
    return null;
  }

  var foundCurrent = false;
  for (var i = 0; i < parentBlock.inputList.length; i++) {
    var input = parentBlock.inputList[i];
    if (input.connection && input.connection.type === Blockly.NEXT_STATEMENT) {
      if (foundCurrent) {
        // This is the next substack
        return input.connection;
      }
      if (input.connection === currentSubstack) {
        foundCurrent = true;
      }
    }
  }

  return null;
};

/**
 * Find the previous substack before the given one in the parent block.
 * @param {!Blockly.Connection} currentSubstack The current substack connection.
 * @param {!Blockly.BlockSvg} parentBlock The parent block.
 * @return {Blockly.Connection} The previous statement connection or null.
 * @private
 */
Blockly.WorkspaceSvg.prototype.findPreviousSubstack_ = function(currentSubstack, parentBlock) {
  if (!currentSubstack || !parentBlock) {
    return null;
  }

  var previousSubstack = null;
  for (var i = 0; i < parentBlock.inputList.length; i++) {
    var input = parentBlock.inputList[i];
    if (input.connection && input.connection.type === Blockly.NEXT_STATEMENT) {
      if (input.connection === currentSubstack) {
        // Return the previous one we found
        return previousSubstack;
      }
      previousSubstack = input.connection;
    }
  }

  return null;
};

/**
 * Find the last block in a chain.
 * @param {!Blockly.BlockSvg} block The first block in the chain.
 * @return {!Blockly.BlockSvg} The last block in the chain.
 * @private
 */
Blockly.WorkspaceSvg.prototype.findLastBlockInChain_ = function(block) {
  if (!block) {
    return null;
  }

  var current = block;
  while (current.getNextBlock()) {
    current = current.getNextBlock();
  }
  return current;
};

/**
 * Refresh the highlighting for the current hovered block.
 * Used after moving blocks via keyboard navigation.
 * @private
 */
Blockly.WorkspaceSvg.prototype.refreshBlockHighlight_ = function() {
  if (!this.lastHoveredBlock_) {
    return;
  }

  // Save the current block reference before clearing
  var block = this.lastHoveredBlock_;

  // Clear all previous effects (this will set lastHoveredBlock_ to null)
  this.clearBlockHoverEffects_();

  // Restore the block reference
  this.lastHoveredBlock_ = block;

  // Re-initialize dimmed blocks array
  if (!this.lastDimmedBlocks_) {
    this.lastDimmedBlocks_ = [];
  }

  // Dim all parent blocks and their children
  var parent = block.getParent();
  while (parent) {
    this.dimBlockAndChildren_(parent, 'blocklyDimmedContainer', this.lastDimmedBlocks_);
    parent = parent.getParent();
  }

  // Dim all next blocks and their children
  var nextBlock = block.getNextBlock();
  while (nextBlock) {
    this.dimBlockAndChildren_(nextBlock, 'blocklyDimmedNext', this.lastDimmedBlocks_);
    nextBlock = nextBlock.getNextBlock();
  }

  // Highlight the current block and all its children (excluding next blocks)
  // Use highlightBlockAndChildren_ which correctly handles parent-child relationships
  this.highlightedBlocks_list_ = [];
  this.highlightBlockAndChildren_(block);
};

/**
 * Move block up: move to before the previous sibling block.
 * If at the beginning of a substack, move to end of previous substack.
 * @param {!Blockly.BlockSvg} block The block to move.
 * @return {boolean} True if the move was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.moveBlockUp_ = function(block) {
  if (!block || !block.previousConnection) {
    return false;
  }

  // Check if we have a previous sibling block (not parent block)
  var previousBlock = null;
  if (block.previousConnection && block.previousConnection.targetConnection) {
    var targetConn = block.previousConnection.targetConnection;
    var sourceBlock = targetConn.getSourceBlock();

    // Check if targetConn is the nextConnection of the source block
    // This distinguishes sibling relationships from parent-child relationships
    if (targetConn === sourceBlock.nextConnection) {
      previousBlock = sourceBlock;
    }
  }

  // Case 1: Has a previous sibling block - swap with it
  if (previousBlock) {
    // Check if previousBlock can have blocks after it (has nextConnection)
    // If not, swapping would cause the current block to be disconnected
    if (!previousBlock.nextConnection) {
      return false;
    }

    var eventsEnabled = Blockly.Events.isEnabled();
    if (eventsEnabled) {
      Blockly.Events.setGroup(true);
    }

    try {
      // Find where previousBlock is connected (its parent connection)
      var targetConnection = previousBlock.previousConnection.targetConnection;
      if (!targetConnection) {
        return false;
      }

      // Step 1: Unplug block, heal the stack (reconnect previousBlock to nextBlock)
      block.unplug(true);

      // Step 2: Unplug previousBlock (don't heal, we'll reconnect manually)
      previousBlock.unplug(false);

      // Step 3: Insert block at previousBlock's old position
      targetConnection.connect(block.previousConnection);

      // Step 4: Connect previousBlock after block
      if (block.nextConnection && previousBlock.previousConnection) {
        block.nextConnection.connect(previousBlock.previousConnection);
      }

      return true;
    } finally {
      if (eventsEnabled) {
        Blockly.Events.setGroup(false);
      }
    }
  }

  // Case 2: No previous sibling - at beginning of substack, try to move to previous substack
  var surroundParent = block.getSurroundParent();
  if (!surroundParent) {
    return false;
  }

  var currentSubstack = this.findCurrentSubstack_(block, surroundParent);
  if (currentSubstack) {
    var previousSubstack = this.findPreviousSubstack_(currentSubstack, surroundParent);
    if (previousSubstack) {
      var firstBlockInPrevSubstack = previousSubstack.targetBlock();

      if (firstBlockInPrevSubstack) {
        // Previous substack has blocks - find the last one
        var lastBlock = this.findLastBlockInChain_(firstBlockInPrevSubstack);

        // Check if the last block can have blocks after it
        if (!lastBlock.nextConnection) {
          // Last block is an end block (e.g., forever), cannot append to it
          return false;
        }

        var eventsEnabled = Blockly.Events.isEnabled();
        if (eventsEnabled) {
          Blockly.Events.setGroup(true);
        }

        try {
          // Unplug block from current substack
          block.unplug(true);

          // Append to the end of previous substack
          if (lastBlock.nextConnection && block.previousConnection) {
            lastBlock.nextConnection.connect(block.previousConnection);
          }

          return true;
        } finally {
          if (eventsEnabled) {
            Blockly.Events.setGroup(false);
          }
        }
      } else {
        // Previous substack is empty - move to the empty substack
        var eventsEnabled = Blockly.Events.isEnabled();
        if (eventsEnabled) {
          Blockly.Events.setGroup(true);
        }

        try {
          // Unplug block from current substack
          block.unplug(true);

          // Connect to the empty previous substack
          previousSubstack.connect(block.previousConnection);

          return true;
        } finally {
          if (eventsEnabled) {
            Blockly.Events.setGroup(false);
          }
        }
      }
    }
  }

  return false;
};

/**
 * Move block down: move to after the next sibling block.
 * If at end of substack, move to beginning of next substack or after parent.
 * @param {!Blockly.BlockSvg} block The block to move.
 * @return {boolean} True if the move was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.moveBlockDown_ = function(block) {
  if (!block) {
    return false;
  }

  var nextBlock = block.getNextBlock();

  // Case 1: Has a next sibling block - swap with it
  if (nextBlock) {
    // Check if current block can have blocks after it (has nextConnection)
    // If not (e.g., forever, delete this clone), cannot move down
    if (!block.nextConnection) {
      return false;
    }

    var eventsEnabled = Blockly.Events.isEnabled();
    if (eventsEnabled) {
      Blockly.Events.setGroup(true);
    }

    try {
      // Step 1: Unplug block (heal the stack - connect previous to nextBlock)
      block.unplug(true);

      // Step 2: Insert block after nextBlock
      // This will automatically handle reconnecting what was after nextBlock
      if (nextBlock.nextConnection && block.previousConnection) {
        nextBlock.nextConnection.connect(block.previousConnection);
      }

      return true;
    } finally {
      if (eventsEnabled) {
        Blockly.Events.setGroup(false);
      }
    }
  }

  // Case 2: No next sibling - at end of substack
  // If block has no nextConnection (e.g., forever, delete this clone), cannot move down
  if (!block.nextConnection) {
    return false;
  }

  var surroundParent = block.getSurroundParent();
  if (!surroundParent) {
    return false;
  }

  // Try to move to next substack first
  var currentSubstack = this.findCurrentSubstack_(block, surroundParent);
  if (currentSubstack) {
    var nextSubstack = this.findNextSubstack_(currentSubstack, surroundParent);
    if (nextSubstack) {
      var eventsEnabled = Blockly.Events.isEnabled();
      if (eventsEnabled) {
        Blockly.Events.setGroup(true);
      }

      try {
        // Unplug block from current substack
        block.unplug(true);

        // Insert at beginning of next substack
        var firstBlockInNextSubstack = nextSubstack.targetBlock();
        if (firstBlockInNextSubstack) {
          // Insert before the first block
          nextSubstack.disconnect();
          nextSubstack.connect(block.previousConnection);
          if (block.nextConnection && firstBlockInNextSubstack.previousConnection) {
            block.nextConnection.connect(firstBlockInNextSubstack.previousConnection);
          }
        } else {
          // Next substack is empty, just connect to it
          nextSubstack.connect(block.previousConnection);
        }

        return true;
      } finally {
        if (eventsEnabled) {
          Blockly.Events.setGroup(false);
        }
      }
    }
  }

  // Case 3: No next substack, move to after parent's level
  var eventsEnabled = Blockly.Events.isEnabled();
  if (eventsEnabled) {
    Blockly.Events.setGroup(true);
  }

  try {
    // Step 1: Unplug block (heal the stack)
    block.unplug(true);

    // Step 2: Insert after surroundParent
    // The connect method will handle pushing away any existing nextBlock
    if (surroundParent.nextConnection && block.previousConnection) {
      surroundParent.nextConnection.connect(block.previousConnection);
    }

    return true;
  } finally {
    if (eventsEnabled) {
      Blockly.Events.setGroup(false);
    }
  }
};

/**
 * Move block left: move to before the parent (surround) block.
 * @param {!Blockly.BlockSvg} block The block to move.
 * @return {boolean} True if the move was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.moveBlockLeft_ = function(block) {
  if (!block) {
    return false;
  }

  var surroundParent = block.getSurroundParent();
  if (!surroundParent || !surroundParent.previousConnection ||
      !surroundParent.previousConnection.isConnected()) {
    return false;
  }

  var eventsEnabled = Blockly.Events.isEnabled();
  if (eventsEnabled) {
    Blockly.Events.setGroup(true);
  }

  try {
    // Find where surroundParent is connected
    var targetConnection = surroundParent.previousConnection.targetConnection;

    // Step 1: Unplug block (heal the stack)
    block.unplug(true);

    // Step 2: Unplug surroundParent (don't heal)
    surroundParent.unplug(false);

    // Step 3: Insert block where surroundParent was
    targetConnection.connect(block.previousConnection);

    // Step 4: Connect surroundParent after block
    if (block.nextConnection && surroundParent.previousConnection) {
      block.nextConnection.connect(surroundParent.previousConnection);
    }

    return true;
  } finally {
    if (eventsEnabled) {
      Blockly.Events.setGroup(false);
    }
  }
};

/**
 * Move block right: move to the first input position of the next sibling block.
 * @param {!Blockly.BlockSvg} block The block to move.
 * @return {boolean} True if the move was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.moveBlockRight_ = function(block) {
  if (!block) {
    return false;
  }

  var nextBlock = block.getNextBlock();
  if (!nextBlock) {
    return false;
  }

  // Find the first statement input in the next block
  var firstStatementConnection = nextBlock.getFirstStatementConnection();
  if (!firstStatementConnection) {
    return false;
  }

  var eventsEnabled = Blockly.Events.isEnabled();
  if (eventsEnabled) {
    Blockly.Events.setGroup(true);
  }

  try {
    // Step 1: Unplug block (heal the stack - connect previous to nextBlock)
    block.unplug(true);

    // Step 2: Insert block into nextBlock's first statement position
    // The connect method will automatically handle any blocks already there
    if (block.previousConnection) {
      firstStatementConnection.connect(block.previousConnection);
    }

    return true;
  } finally {
    if (eventsEnabled) {
      Blockly.Events.setGroup(false);
    }
  }
};

/**
 * Convert a block to an XML DOM element, but WITHOUT its next connection.
 * This is similar to Blockly.Xml.blockToDom, but excludes the external next blocks.
 * Internal next blocks (within substacks) are still included.
 * @param {!Blockly.BlockSvg} block The block to convert.
 * @return {!Element} XML DOM element representing the block.
 * @private
 */
Blockly.WorkspaceSvg.prototype.blockToDomWithoutNext_ = function(block) {
  var element = goog.dom.createDom(block.isShadow() ? 'shadow' : 'block');
  element.setAttribute('type', block.type);
  element.setAttribute('id', block.id);

  if (block.mutationToDom) {
    var mutation = block.mutationToDom();
    if (mutation && (mutation.hasChildNodes() || mutation.hasAttributes())) {
      element.appendChild(mutation);
    }
  }

  // Add all fields
  Blockly.Xml.allFieldsToDom_(block, element);

  // Add scratch comments
  Blockly.Xml.scratchCommentToDom_(block, element);

  if (block.data) {
    var dataElement = goog.dom.createDom('data', null, block.data);
    element.appendChild(dataElement);
  }

  // Process input connections (value inputs and statement inputs)
  for (var i = 0, input; input = block.inputList[i]; i++) {
    var container;
    var empty = true;
    if (input.type == Blockly.DUMMY_INPUT) {
      continue;
    } else {
      var childBlock = input.connection.targetBlock();
      if (input.type == Blockly.INPUT_VALUE) {
        container = goog.dom.createDom('value');
      } else if (input.type == Blockly.NEXT_STATEMENT) {
        container = goog.dom.createDom('statement');
      }
      var shadow = input.connection.getShadowDom();
      if (shadow && (!childBlock || !childBlock.isShadow())) {
        var shadowClone = Blockly.Xml.cloneShadow_(shadow);
        container.appendChild(shadowClone);
      }
      if (childBlock) {
        // For statement inputs (substacks), we need to include the FULL chain
        // of blocks within the substack (including their next connections)
        if (input.type == Blockly.NEXT_STATEMENT) {
          // Use the regular blockToDom to preserve the entire substack chain
          container.appendChild(Blockly.Xml.blockToDom(childBlock, false));
        } else {
          // For value inputs, recursively call blockToDomWithoutNext_
          container.appendChild(this.blockToDomWithoutNext_(childBlock));
        }
        empty = false;
      }
    }
    container.setAttribute('name', input.name);
    if (!empty) {
      element.appendChild(container);
    }
  }

  if (block.inputsInlineDefault != block.inputsInline) {
    element.setAttribute('inline', block.inputsInline);
  }
  if (block.isCollapsed()) {
    element.setAttribute('collapsed', true);
  }
  if (block.disabled) {
    element.setAttribute('disabled', true);
  }
  if (!block.isDeletable() && !block.isShadow()) {
    element.setAttribute('deletable', false);
  }
  if (!block.isMovable() && !block.isShadow()) {
    element.setAttribute('movable', false);
  }
  if (!block.isEditable()) {
    element.setAttribute('editable', false);
  }

  // IMPORTANT: Do NOT process block.nextConnection here!
  // That's the key difference from Blockly.Xml.blockToDom.
  // We want to exclude the external next blocks from the duplication.

  return element;
};

/**
 * Duplicate the selected block and place it right after the original.
 * VSCode-style: Cmd/Ctrl + D duplicates the current line.
 * Only duplicates the highlighted blocks (selected block and its children),
 * NOT the external next blocks.
 * @return {boolean} True if the duplication was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.duplicateSelectedBlock_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  var block = this.selectedBlock_;

  // Create XML from the selected block WITHOUT next blocks
  // This ensures we only copy the highlighted blocks (block + children)
  var blockXml = this.blockToDomWithoutNext_(block);

  // Clone the XML to create a new independent copy
  var newBlockXml = blockXml.cloneNode(true);

  var eventsEnabled = Blockly.Events.isEnabled();
  if (eventsEnabled) {
    Blockly.Events.setGroup(true);
  }

  try {
    // Create new block from XML
    var newBlock = Blockly.Xml.domToBlock(newBlockXml, this);

    // Position the new block after the original block
    if (block.nextConnection && newBlock.previousConnection) {
      // Original block has a next block - insert the duplicate between them
      var nextBlock = block.getNextBlock();

      if (nextBlock) {
        // Disconnect the next block
        block.nextConnection.disconnect();

        // Connect new block after original
        block.nextConnection.connect(newBlock.previousConnection);

        // Connect original next block after new block
        if (newBlock.nextConnection && nextBlock.previousConnection) {
          newBlock.nextConnection.connect(nextBlock.previousConnection);
        }
      } else {
        // No next block, just connect the duplicate after original
        block.nextConnection.connect(newBlock.previousConnection);
      }
    } else {
      // Original block has no nextConnection (e.g., reporter, end block)
      // Place the duplicate at a slight offset
      var xy = block.getRelativeToSurfaceXY();
      newBlock.moveBy(xy.x + 20, xy.y + 20);
    }

    // Select the newly created block
    this.selectBlock_(newBlock);

    return true;
  } catch (e) {
    console.error('Error duplicating block:', e);
    return false;
  } finally {
    if (eventsEnabled) {
      Blockly.Events.setGroup(false);
    }
  }
};

/**
 * Delete the currently selected block.
 * @return {boolean} True if the deletion was successful.
 * @private
 */
Blockly.WorkspaceSvg.prototype.deleteSelectedBlock_ = function() {
  if (!this.selectedBlock_) {
    return false;
  }

  var block = this.selectedBlock_;

  // Check if block is deletable
  if (!block.isDeletable()) {
    return false;
  }

  // Deselect before deleting
  this.deselectBlock_();

  // Delete the block
  var eventsEnabled = Blockly.Events.isEnabled();
  if (eventsEnabled) {
    Blockly.Events.setGroup(true);
  }

  try {
    block.dispose(true, true);
    return true;
  } catch (e) {
    console.error('Error deleting block:', e);
    return false;
  } finally {
    if (eventsEnabled) {
      Blockly.Events.setGroup(false);
    }
  }
};

/**
 * Calculate the bounding box for the blocks on the workspace.
 * Coordinate system: workspace coordinates.
 *
 * @return {Object} Contains the position and size of the bounding box
 *   containing the blocks on the workspace.
 */
Blockly.WorkspaceSvg.prototype.getBlocksBoundingBox = function() {
  var topBlocks = this.getTopBlocks(false);
  var topComments = this.getTopComments(false);
  var topElements = topBlocks.concat(topComments);
  // There are no blocks, return empty rectangle.
  if (!topElements.length) {
    return {x: 0, y: 0, width: 0, height: 0};
  }

  // Initialize boundary using the first block.
  var boundary = topElements[0].getBoundingRectangle();

  // Start at 1 since the 0th block was used for initialization
  for (var i = 1; i < topElements.length; i++) {
    var blockBoundary = topElements[i].getBoundingRectangle();
    if (blockBoundary.topLeft.x < boundary.topLeft.x) {
      boundary.topLeft.x = blockBoundary.topLeft.x;
    }
    if (blockBoundary.bottomRight.x > boundary.bottomRight.x) {
      boundary.bottomRight.x = blockBoundary.bottomRight.x;
    }
    if (blockBoundary.topLeft.y < boundary.topLeft.y) {
      boundary.topLeft.y = blockBoundary.topLeft.y;
    }
    if (blockBoundary.bottomRight.y > boundary.bottomRight.y) {
      boundary.bottomRight.y = blockBoundary.bottomRight.y;
    }
  }
  return {
    x: boundary.topLeft.x,
    y: boundary.topLeft.y,
    width: boundary.bottomRight.x - boundary.topLeft.x,
    height: boundary.bottomRight.y - boundary.topLeft.y
  };
};

/**
 * Initialize auto-layout by setting up event listeners
 * @private
 */
Blockly.WorkspaceSvg.prototype.initAutoLayout_ = function() {
  var workspace = this;

  // Create the event listener function
  this.autoLayoutListener_ = function(event) {
    // Only respond to certain event types
    if (!event || event.isUiEvent) {
      return;
    }

    // Events that should trigger auto-layout:
    // - CREATE: New block added
    // - DELETE: Block removed
    // - END_DRAG: Block drag ended (covers all cases: moving, connecting, etc.)
    var shouldLayout = false;

    if (event.type === Blockly.Events.CREATE ||
        event.type === Blockly.Events.DELETE ||
        event.type === Blockly.Events.END_DRAG) {
      shouldLayout = true;
    }

    if (shouldLayout) {
      workspace.scheduleAutoLayout_();
    }
  };

  // Add the listener to the workspace
  this.addChangeListener(this.autoLayoutListener_);
};

/**
 * Cleanup auto-layout by removing event listeners
 * @private
 */
Blockly.WorkspaceSvg.prototype.cleanupAutoLayout_ = function() {
  if (this.autoLayoutListener_) {
    this.removeChangeListener(this.autoLayoutListener_);
    this.autoLayoutListener_ = null;
  }

  // Clear any pending timer
  if (this.autoLayoutTimer_) {
    clearTimeout(this.autoLayoutTimer_);
    this.autoLayoutTimer_ = null;
  }
};

/**
 * Schedule auto-layout with debouncing
 * @private
 */
Blockly.WorkspaceSvg.prototype.scheduleAutoLayout_ = function() {
  if (!this.autoLayoutEnabled_ || this.isFlyout || this.isMutator) {
    return;
  }

  // Clear existing timer
  if (this.autoLayoutTimer_) {
    clearTimeout(this.autoLayoutTimer_);
  }

  // Schedule new layout
  var workspace = this;
  this.autoLayoutTimer_ = setTimeout(function() {
    workspace.autoLayoutTimer_ = null;
    workspace.performAutoLayout_();
  }, this.autoLayoutDelay_);
};

/**
 * Perform auto-layout (internal method)
 * @param {boolean=} opt_forceXAlign Whether to force X alignment (for target switch)
 * @private
 */
Blockly.WorkspaceSvg.prototype.performAutoLayout_ = function(opt_forceXAlign) {
  if (!this.autoLayoutEnabled_ || this.isFlyout || this.isMutator) {
    return;
  }

  // Don't auto-layout while dragging
  if (this.isDragging()) {
    return;
  }

  // Perform auto-layout - arrange statement blocks
  this.arrangeStatementBlocks_(opt_forceXAlign);
};

/**
 * Arrange statement blocks in a column with uniform spacing
 * Uses fixed spacing (MIN_BLOCK_Y) between blocks, same as cleanUp()
 * In gentle layout mode (default): only statement blocks are arranged, reporters are skipped
 * In forceXAlign mode: both statement and reporter blocks are arranged
 * @param {boolean=} opt_forceXAlign Whether to force X alignment (for target switch)
 * @private
 */
Blockly.WorkspaceSvg.prototype.arrangeStatementBlocks_ = function(opt_forceXAlign) {
  this.setResizesEnabled(false);
  // Only create new event group if we're not already in one
  // Note: empty string "" means no group, so we need explicit check
  var existingGroup = Blockly.Events.getGroup();
  var shouldCreateGroup = (existingGroup === '' || !existingGroup);
  if (shouldCreateGroup) {
    Blockly.Events.setGroup(true);
  }

  var topBlocks = this.getTopBlocks(true);
  var grid = this.getGrid();
  var shouldAlignToColumn = grid && grid.isColumnLayoutEnabled();
  // Use 72px spacing to match "Clean Up" function (was MIN_BLOCK_Y = 48px)
  var minSpacing = 72;
  var forceXAlign = opt_forceXAlign || false;

  // Use cursorY for fixed spacing, same approach as cleanUp()
  var cursorY = 0;

  for (var i = 0; i < topBlocks.length; i++) {
    var block = topBlocks[i];
    var isReporter = !!block.outputConnection;

    // Skip reporter blocks (round/hexagonal blocks) unless forceXAlign is true
    if (isReporter && !forceXAlign) {
      continue;
    }

    var xy = block.getRelativeToSurfaceXY();

    if (shouldAlignToColumn) {
      if (forceXAlign) {
        // CleanUp-style: force tight layout from top (for sprite switching)
        // Both statement blocks and reporter blocks align to column (X=48)
        var columnX = 48;
        var deltaX = columnX - xy.x;
        var deltaY = cursorY - xy.y;

        // Move to column position and compact Y layout
        block.moveBy(deltaX, deltaY);
        block.snapToGrid();

        // Update cursor for next block
        cursorY = block.getRelativeToSurfaceXY().y +
            block.getHeightWidth().height + minSpacing;
      } else {
        // Gentle layout: use fixed spacing like cleanUp(), but skip reporter blocks
        // Move to approximate position first, then let snapToGrid handle precise alignment
        block.moveBy(0, cursorY - xy.y);
        // Call snapToGrid() to ensure column alignment is exact
        block.snapToGrid();

        cursorY = block.getRelativeToSurfaceXY().y +
            block.getHeightWidth().height + minSpacing;
      }
    } else {
      // Default layout: align to left column with fixed spacing like cleanUp()
      var targetX = 0;
      block.moveBy(targetX - xy.x, cursorY - xy.y);
      block.snapToGrid();
      cursorY = block.getRelativeToSurfaceXY().y +
          block.getHeightWidth().height + minSpacing;
    }
  }

  // Only clear event group if we created it
  if (!existingGroup) {
    Blockly.Events.setGroup(false);
  }
  this.setResizesEnabled(true);
};

/**
 * Enable or disable auto-layout
 * @param {boolean} enabled Whether to enable auto-layout
 */
Blockly.WorkspaceSvg.prototype.setAutoLayoutEnabled = function(enabled) {
  if (this.autoLayoutEnabled_ === enabled) {
    return; // No change
  }

  this.autoLayoutEnabled_ = enabled;

  if (enabled) {
    // Initialize and trigger layout
    this.initAutoLayout_();
    this.scheduleAutoLayout_();
  } else {
    // Cleanup listeners
    this.cleanupAutoLayout_();
  }
};

/**
 * Check if auto-layout is enabled
 * @return {boolean} Whether auto-layout is enabled
 */
Blockly.WorkspaceSvg.prototype.isAutoLayoutEnabled = function() {
  return this.autoLayoutEnabled_;
};


/**
 * Clean up the workspace by ordering all the blocks in a column.
 */
Blockly.WorkspaceSvg.prototype.cleanUp = function() {
  this.setResizesEnabled(false);
  Blockly.Events.setGroup(true);
  var topBlocks = this.getTopBlocks(true);

  // Get grid settings for column layout
  var grid = this.getGrid();

  var cursorY = 0;
  for (var i = 0, block; block = topBlocks[i]; i++) {
    var xy = block.getRelativeToSurfaceXY();

    // In column layout mode, only align statement blocks (not reporters)
    var isStatementBlock = !block.outputConnection;
    var shouldAlignToColumn = grid && grid.isColumnLayoutEnabled() && isStatementBlock;
    var targetX = isStatementBlock ? 0 : xy.x;

    // Only move statement blocks vertically in column mode
    if (shouldAlignToColumn) {
      // Move to approximate position first, then let snapToGrid handle precise alignment
      block.moveBy(0, cursorY - xy.y);
      // Call snapToGrid() to ensure column alignment is exact
      block.snapToGrid();

      cursorY = block.getRelativeToSurfaceXY().y +
          block.getHeightWidth().height + Blockly.BlockSvg.MIN_BLOCK_Y;
    } else if (isStatementBlock) {
      // Default cleanup behavior for non-column mode statement blocks
      block.moveBy(targetX - xy.x, cursorY - xy.y);
      block.snapToGrid();
      cursorY = block.getRelativeToSurfaceXY().y +
          block.getHeightWidth().height + Blockly.BlockSvg.MIN_BLOCK_Y;
    }
    // Reporter blocks are not moved by cleanUp
  }
  Blockly.Events.setGroup(false);
  this.setResizesEnabled(true);
};

/**
 * Collapse all collapsible blocks in the workspace.
 * All collapse events will be grouped together for single undo/redo.
 */
Blockly.WorkspaceSvg.prototype.collapseAll = function() {
  var topBlocks = this.getTopBlocks(false);

  // Start event group - all collapse events will share the same group ID
  Blockly.Events.setGroup(true);

  try {
    // Collapse all blocks - each will fire an event in the same group
    for (var i = 0; i < topBlocks.length; i++) {
      var block = topBlocks[i];

      // Collapse next chain for hat blocks
      if (block.nextConnection) {
        var nextBlock = block.getNextBlock();
        if (nextBlock) {
          block.setSubstackCollapsed('__next__', true);
        }
      }

      // Collapse all substack inputs
      for (var j = 0; j < block.inputList.length; j++) {
        var input = block.inputList[j];
        if (input.type === Blockly.NEXT_STATEMENT && input.connection) {
          var substackBlock = input.connection.targetBlock();
          if (substackBlock) {
            block.setSubstackCollapsed(input.name, true);
          }
        }
      }
    }

    // Synchronously refresh UI (no events)
    if (this.blockOutline_) {
      this.blockOutline_.refresh();
    }
    if (this.collapseGutter_) {
      this.collapseGutter_.refresh();
    }

    // Synchronously run layout if enabled (move events will be in same group)
    if (this.arrangeStatementBlocks_ && this.grid_ &&
        this.grid_.isColumnLayoutEnabled()) {
      this.arrangeStatementBlocks_();
    }
  } finally {
    // End event group
    Blockly.Events.setGroup(false);
  }
};

/**
 * Expand all collapsed blocks in the workspace.
 * All expand events will be grouped together for single undo/redo.
 */
Blockly.WorkspaceSvg.prototype.expandAll = function() {
  var topBlocks = this.getTopBlocks(false);

  // Start event group - all expand events will share the same group ID
  Blockly.Events.setGroup(true);

  try {
    // Expand all blocks - each will fire an event in the same group
    for (var i = 0; i < topBlocks.length; i++) {
      var block = topBlocks[i];

      // Expand next chain for hat blocks
      if (block.nextConnection && block.isSubstackCollapsed('__next__')) {
        block.setSubstackCollapsed('__next__', false);
      }

      // Expand all substack inputs
      for (var j = 0; j < block.inputList.length; j++) {
        var input = block.inputList[j];
        if (input.type === Blockly.NEXT_STATEMENT) {
          if (block.isSubstackCollapsed(input.name)) {
            block.setSubstackCollapsed(input.name, false);
          }
        }
      }
    }

    // Synchronously refresh UI (no events)
    if (this.blockOutline_) {
      this.blockOutline_.refresh();
    }
    if (this.collapseGutter_) {
      this.collapseGutter_.refresh();
    }

    // Synchronously run layout if enabled (move events will be in same group)
    if (this.arrangeStatementBlocks_ && this.grid_ &&
        this.grid_.isColumnLayoutEnabled()) {
      this.arrangeStatementBlocks_();
    }
  } finally {
    // End event group
    Blockly.Events.setGroup(false);
  }
};

/**
 * Check if a mouse event occurred within the collapse gutter area.
 * @param {!Event} e Mouse event.
 * @return {boolean} True if the click is in the gutter area.
 * @private
 */
Blockly.WorkspaceSvg.prototype.isClickInGutter_ = function(e) {
  if (!this.collapseGutter_ || !this.collapseGutter_.svgGroup_) {
    return false;
  }

  // Get the click position in client coordinates
  var clickX = e.clientX;

  // Get the gutter's bounding box in client coordinates
  try {
    var gutterBBox = this.collapseGutter_.svgGroup_.getBoundingClientRect();

    // Check if click X is within gutter bounds
    return clickX >= gutterBBox.left && clickX <= gutterBBox.right;
  } catch (e) {
    // If getBoundingClientRect fails, assume not in gutter
    return false;
  }
};

/**
 * Show the context menu for the workspace.
 * @param {!Event} e Mouse event.
 * @private
 */
Blockly.WorkspaceSvg.prototype.showContextMenu_ = function(e) {
  if (this.options.readOnly || this.isFlyout) {
    return;
  }
  var menuOptions = [];
  var topBlocks = this.getTopBlocks(true);
  var eventGroup = Blockly.utils.genUid();
  var ws = this;

  // Options to undo/redo previous action.
  menuOptions.push(Blockly.ContextMenu.wsUndoOption(this));
  menuOptions.push(Blockly.ContextMenu.wsRedoOption(this));

  // Option to clean up blocks.
  if (this.scrollbar) {
    menuOptions.push(
        Blockly.ContextMenu.wsCleanupOption(this,topBlocks.length));
  }

  if (this.options.collapse) {
    var hasCollapsedBlocks = false;
    var hasExpandedBlocks = false;
    for (var i = 0; i < topBlocks.length; i++) {
      var block = topBlocks[i];
      while (block) {
        if (block.isCollapsed()) {
          hasCollapsedBlocks = true;
        } else {
          hasExpandedBlocks = true;
        }
        block = block.getNextBlock();
      }
    }

    menuOptions.push(Blockly.ContextMenu.wsCollapseOption(hasExpandedBlocks,
        topBlocks));

    menuOptions.push(Blockly.ContextMenu.wsExpandOption(hasCollapsedBlocks,
        topBlocks));
  }

  // Options to fold/unfold all hat blocks and C-shaped blocks
  // Only show these options when right-clicking in the gutter area
  var isInGutter = this.isClickInGutter_(e);
  if (isInGutter) {
    menuOptions.push(Blockly.ContextMenu.wsFoldAllOption(topBlocks));
    menuOptions.push(Blockly.ContextMenu.wsUnfoldAllOption(topBlocks));
  }

  // Option to add a workspace comment.
  if (this.options.comments) {
    menuOptions.push(Blockly.ContextMenu.workspaceCommentOption(ws, e));
  }

  // Option to delete all blocks.
  // Count the number of blocks that are deletable.
  var deleteList = Blockly.WorkspaceSvg.buildDeleteList_(topBlocks);
  // Scratch-specific: don't count shadow blocks in delete count
  var deleteCount = 0;
  for (var i = 0; i < deleteList.length; i++) {
    if (!deleteList[i].isShadow()) {
      deleteCount++;
    }
  }

  var DELAY = 10;
  function deleteNext() {
    Blockly.Events.setGroup(eventGroup);
    var block = deleteList.shift();
    if (block) {
      if (block.workspace) {
        block.dispose(false, true);
        setTimeout(deleteNext, DELAY);
      } else {
        deleteNext();
      }
    }
    Blockly.Events.setGroup(false);
  }

  var deleteOption = {
    text: deleteCount == 1 ? Blockly.Msg.DELETE_BLOCK :
        Blockly.Msg.DELETE_X_BLOCKS.replace('%1', String(deleteCount)),
    enabled: deleteCount > 0,
    callback: function() {
      if (ws.currentGesture_) {
        ws.currentGesture_.cancel();
      }
      if (deleteCount < 2 ) {
        deleteNext();
      } else {
        Blockly.confirm(
            Blockly.Msg.DELETE_ALL_BLOCKS.replace('%1', String(deleteCount)),
            function(ok) {
              if (ok) {
                deleteNext();
              }
            });
      }
    }
  };
  menuOptions.push(deleteOption);

  Blockly.ContextMenu.show(e, menuOptions, this.RTL);
};

/**
 * Build a list of all deletable blocks that are reachable from the given
 * list of top blocks.
 * @param {!Array.<!Blockly.BlockSvg>} topBlocks The list of top blocks on the
 *     workspace.
 * @return {!Array.<!Blockly.BlockSvg>} A list of deletable blocks on the
 *     workspace.
 * @private
 */
Blockly.WorkspaceSvg.buildDeleteList_ = function(topBlocks) {
  var deleteList = [];
  function addDeletableBlocks(block) {
    if (block.isDeletable()) {
      deleteList = deleteList.concat(block.getDescendants(false));
    } else {
      var children = block.getChildren();
      for (var i = 0; i < children.length; i++) {
        addDeletableBlocks(children[i]);
      }
    }
  }
  for (var i = 0; i < topBlocks.length; i++) {
    addDeletableBlocks(topBlocks[i]);
  }
  return deleteList;
};

/**
 * Modify the block tree on the existing toolbox.
 * @param {Node|string} tree DOM tree of blocks, or text representation of same.
 */
Blockly.WorkspaceSvg.prototype.updateToolbox = function(tree) {
  tree = Blockly.Options.parseToolboxTree(tree);
  if (!tree) {
    if (this.options.languageTree) {
      throw 'Can\'t nullify an existing toolbox.';
    }
    return;  // No change (null to null).
  }
  if (!this.options.languageTree) {
    throw 'Existing toolbox is null.  Can\'t create new toolbox.';
  }
  if (tree.getElementsByTagName('category').length) {
    if (!this.toolbox_) {
      throw 'Existing toolbox has no categories.  Can\'t change mode.';
    }
    this.options.languageTree = tree;
    this.toolbox_.populate_(tree);
    this.toolbox_.position();
  } else {
    if (!this.flyout_) {
      throw 'Existing toolbox has categories.  Can\'t change mode.';
    }
    this.options.languageTree = tree;
    this.flyout_.show(tree.childNodes);
  }
};

/**
 * Mark this workspace as the currently focused main workspace.
 */
Blockly.WorkspaceSvg.prototype.markFocused = function() {
  if (this.options.parentWorkspace) {
    this.options.parentWorkspace.markFocused();
  } else {
    Blockly.mainWorkspace = this;
    // We call e.preventDefault in many event handlers which means we
    // need to explicitly grab focus (e.g from a textarea) because
    // the browser will not do it for us.  How to do this is browser dependant.
    this.setBrowserFocus();
  }
};

/**
 * Set the workspace to have focus in the browser.
 * @private
 */
Blockly.WorkspaceSvg.prototype.setBrowserFocus = function() {
  // Blur whatever was focused since explcitly grabbing focus below does not
  // work in Edge.
  if (document.activeElement) {
    document.activeElement.blur();
  }
  try {
    // Focus the workspace SVG - this is for Chrome and Firefox.
    this.getParentSvg().focus();
  }  catch (e) {
    // IE and Edge do not support focus on SVG elements. When that fails
    // above, get the injectionDiv (the workspace's parent) and focus that
    // instead.  This doesn't work in Chrome.
    try {
      // In IE11, use setActive (which is IE only) so the page doesn't scroll
      // to the workspace gaining focus.
      this.getParentSvg().parentNode.setActive();
    } catch (e) {
      // setActive support was discontinued in Edge so when that fails, call
      // focus instead.
      this.getParentSvg().parentNode.focus();
    }
  }
};

/**
 * Zooming the blocks centered in (x, y) coordinate with zooming in or out.
 * @param {number} x X coordinate of center.
 * @param {number} y Y coordinate of center.
 * @param {number} amount Amount of zooming
 *                        (negative zooms out and positive zooms in).
 */
Blockly.WorkspaceSvg.prototype.zoom = function(x, y, amount) {
  var speed = this.options.zoomOptions.scaleSpeed;
  var metrics = this.getMetrics();
  var center = this.getParentSvg().createSVGPoint();
  center.x = x;
  center.y = y;
  center = center.matrixTransform(this.getCanvas().getCTM().inverse());
  x = center.x;
  y = center.y;
  var canvas = this.getCanvas();
  // Scale factor.
  var scaleChange = Math.pow(speed, amount);
  // Clamp scale within valid range.
  var newScale = this.scale * scaleChange;
  if (newScale > this.options.zoomOptions.maxScale) {
    scaleChange = this.options.zoomOptions.maxScale / this.scale;
  } else if (newScale < this.options.zoomOptions.minScale) {
    scaleChange = this.options.zoomOptions.minScale / this.scale;
  }
  if (this.scale == newScale) {
    return;  // No change in zoom.
  }
  if (this.scrollbar) {
    var matrix = canvas.getCTM()
        .translate(x * (1 - scaleChange), y * (1 - scaleChange))
        .scale(scaleChange);
    // newScale and matrix.a should be identical (within a rounding error).
    // ScrollX and scrollY are in pixels.
    this.scrollX = matrix.e - metrics.absoluteLeft;
    this.scrollY = matrix.f - metrics.absoluteTop;
  }
  this.setScale(newScale);
  // Hide the WidgetDiv without animation (zoom makes field out of place with div)
  Blockly.WidgetDiv.hide(true);
  Blockly.DropDownDiv.hideWithoutAnimation();
};

/**
 * Zooming the blocks centered in the center of view with zooming in or out.
 * @param {number} type Type of zooming (-1 zooming out and 1 zooming in).
 */
Blockly.WorkspaceSvg.prototype.zoomCenter = function(type) {
  var metrics = this.getMetrics();
  var x = metrics.viewWidth / 2;
  var y = metrics.viewHeight / 2;
  this.zoom(x, y, type);
};

/**
 * Zoom the blocks to fit in the workspace if possible.
 */
Blockly.WorkspaceSvg.prototype.zoomToFit = function() {
  var metrics = this.getMetrics();
  var blocksBox = this.getBlocksBoundingBox();
  var blocksWidth = blocksBox.width;
  var blocksHeight = blocksBox.height;
  if (!blocksWidth) {
    return;  // Prevents zooming to infinity.
  }
  var workspaceWidth = metrics.viewWidth;
  var workspaceHeight = metrics.viewHeight;
  if (this.flyout_) {
    workspaceWidth -= this.flyout_.width_;
  }
  if (!this.scrollbar) {
    // Origin point of 0,0 is fixed, blocks will not scroll to center.
    blocksWidth += metrics.contentLeft;
    blocksHeight += metrics.contentTop;
  }
  var ratioX = workspaceWidth / blocksWidth;
  var ratioY = workspaceHeight / blocksHeight;
  this.setScale(Math.min(ratioX, ratioY));
  this.scrollCenter();
};

/**
 * Center the workspace.
 */
Blockly.WorkspaceSvg.prototype.scrollCenter = function() {
  if (!this.scrollbar) {
    // Can't center a non-scrolling workspace.
    console.warn('Tried to scroll a non-scrollable workspace.');
    return;
  }
  // Hide the WidgetDiv without animation (zoom makes field out of place with div)
  Blockly.WidgetDiv.hide(true);
  Blockly.DropDownDiv.hideWithoutAnimation();
  Blockly.hideChaff(false);
  var metrics = this.getMetrics();
  var x = (metrics.contentWidth - metrics.viewWidth) / 2;
  if (this.flyout_) {
    x -= this.flyout_.width_ / 2;
  }
  var y = (metrics.contentHeight - metrics.viewHeight) / 2;
  this.scrollbar.set(x, y);
};

/**
 * Scroll the workspace to center on the given block.
 * @param {?string} id ID of block center on.
 * @public
 */
Blockly.WorkspaceSvg.prototype.centerOnBlock = function(id) {
  if (!this.scrollbar) {
    console.warn('Tried to scroll a non-scrollable workspace.');
    return;
  }

  var block = this.getBlockById(id);
  if (!block) {
    return;
  }

  // XY is in workspace coordinates.
  var xy = block.getRelativeToSurfaceXY();
  // Height/width is in workspace units.
  var heightWidth = block.getHeightWidth();

  // Find the enter of the block in workspace units.
  var blockCenterY = xy.y + heightWidth.height / 2;

  // In RTL the block's position is the top right of the block, not top left.
  var multiplier = this.RTL ? -1 : 1;
  var blockCenterX = xy.x + (multiplier * heightWidth.width / 2);

  // Workspace scale, used to convert from workspace coordinates to pixels.
  var scale = this.scale;

  // Center in pixels.  0, 0 is at the workspace origin.  These numbers may
  // be negative.
  var pixelX = blockCenterX * scale;
  var pixelY = blockCenterY * scale;

  var metrics = this.getMetrics();

  // Scrolling to here would put the block in the top-left corner of the
  // visible workspace.
  var scrollToBlockX = pixelX - metrics.contentLeft;
  var scrollToBlockY = pixelY - metrics.contentTop;

  // viewHeight and viewWidth are in pixels.
  var halfViewWidth = metrics.viewWidth / 2;
  var halfViewHeight = metrics.viewHeight / 2;

  // Put the block in the center of the visible workspace instead.
  var scrollToCenterX = scrollToBlockX - halfViewWidth;
  var scrollToCenterY = scrollToBlockY - halfViewHeight;

  Blockly.hideChaff();
  this.scrollbar.set(scrollToCenterX, scrollToCenterY);
};

/**
 * Set the workspace's zoom factor.
 * @param {number} newScale Zoom factor.
 */
Blockly.WorkspaceSvg.prototype.setScale = function(newScale) {
  if (this.options.zoomOptions.maxScale &&
      newScale > this.options.zoomOptions.maxScale) {
    newScale = this.options.zoomOptions.maxScale;
  } else if (this.options.zoomOptions.minScale &&
      newScale < this.options.zoomOptions.minScale) {
    newScale = this.options.zoomOptions.minScale;
  }
  this.scale = newScale;
  if (this.grid_) {
    this.grid_.update(this.scale);
  }
  if (this.scrollbar) {
    this.scrollbar.resize();
  } else {
    this.translate(this.scrollX, this.scrollY);
  }
  Blockly.hideChaff(false);
  if (this.flyout_) {
    // No toolbox, resize flyout.
    this.flyout_.reflow();
  }
  // Refresh collapse gutter to update button positions with new scale
  if (this.collapseGutter_) {
    this.collapseGutter_.refresh();
  }
  this.queueIntersectionCheck();
};

/**
 * Scroll the workspace by a specified amount, keeping in the bounds.
 * Be sure to set this.startDragMetrics with cached metrics before calling.
 * @param {number} x Target X to scroll to
 * @param {number} y Target Y to scroll to
 */
Blockly.WorkspaceSvg.prototype.scroll = function(x, y) {
  var metrics = this.startDragMetrics; // Cached values
  x = Math.min(x, -metrics.contentLeft);
  y = Math.min(y, -metrics.contentTop);
  x = Math.max(x, metrics.viewWidth - metrics.contentLeft -
               metrics.contentWidth);
  y = Math.max(y, metrics.viewHeight - metrics.contentTop -
               metrics.contentHeight);
  // When the workspace starts scrolling, hide the WidgetDiv without animation.
  // This is to prevent a dispoal animation from happening in the wrong location.
  Blockly.WidgetDiv.hide(true);
  Blockly.DropDownDiv.hideWithoutAnimation();
  // Move the scrollbars and the page will scroll automatically.
  this.scrollbar.set(-x - metrics.contentLeft, -y - metrics.contentTop);
  // Refresh collapse gutter to update button positions
  if (this.collapseGutter_) {
    this.collapseGutter_.refresh();
  }
};

/**
 * Update the workspace's stack glow radius to be proportional to scale.
 * Ensures that stack glows always appear to be a fixed size.
 */
Blockly.WorkspaceSvg.prototype.updateStackGlowScale_ = function() {
  // No such def in the flyout workspace.
  if (this.options.stackGlowBlur) {
    this.options.stackGlowBlur.setAttribute('stdDeviation',
        Blockly.Colours.stackGlowSize / this.scale);
  }
};

/**
 * Get the dimensions of the given workspace component, in pixels.
 * @param {Blockly.Toolbox|Blockly.Flyout} elem The element to get the
 *     dimensions of, or null.  It should be a toolbox or flyout, and should
 *     implement getWidth() and getHeight().
 * @return {!Object} An object containing width and height attributes, which
 *     will both be zero if elem did not exist.
 * @private
 */
Blockly.WorkspaceSvg.getDimensionsPx_ = function(elem) {
  var width = 0;
  var height = 0;
  if (elem) {
    width = elem.getWidth();
    height = elem.getHeight();
  }
  return {
    width: width,
    height: height
  };
};

/**
 * Get the content dimensions of the given workspace, taking into account
 * whether or not it is scrollable and what size the workspace div is on screen.
 * @param {!Blockly.WorkspaceSvg} ws The workspace to measure.
 * @param {!Object} svgSize An object containing height and width attributes in
 *     CSS pixels.  Together they specify the size of the visible workspace, not
 *     including areas covered up by the toolbox.
 * @return {!Object} The dimensions of the contents of the given workspace, as
 *     an object containing at least
 *     - height and width in pixels
 *     - left and top in pixels relative to the workspace origin.
 * @private
 */
Blockly.WorkspaceSvg.getContentDimensions_ = function(ws, svgSize) {
  if (ws.scrollbar) {
    return Blockly.WorkspaceSvg.getContentDimensionsBounded_(ws, svgSize);
  } else {
    return Blockly.WorkspaceSvg.getContentDimensionsExact_(ws);
  }
};

/**
 * Get the bounding box for all workspace contents, in pixels.
 * @param {!Blockly.WorkspaceSvg} ws The workspace to inspect.
 * @return {!Object} The dimensions of the contents of the given workspace, as
 *     an object containing
 *     - height and width in pixels
 *     - left, right, top and bottom in pixels relative to the workspace origin.
 * @private
 */
Blockly.WorkspaceSvg.getContentDimensionsExact_ = function(ws) {
  // Block bounding box is in workspace coordinates.
  var blockBox = ws.getBlocksBoundingBox();
  var scale = ws.scale;

  // Convert to pixels.
  var width = blockBox.width * scale;
  var height = blockBox.height * scale;
  var left = blockBox.x * scale;
  var top = blockBox.y * scale;

  return {
    left: left,
    top: top,
    right: left + width,
    bottom: top + height,
    width: width,
    height: height
  };
};

/**
 * Calculate the size of a scrollable workspace, which should include room for a
 * half screen border around the workspace contents.
 * @param {!Blockly.WorkspaceSvg} ws The workspace to measure.
 * @param {!Object} svgSize An object containing height and width attributes in
 *     CSS pixels.  Together they specify the size of the visible workspace, not
 *     including areas covered up by the toolbox.
 * @return {!Object} The dimensions of the contents of the given workspace, as
 *     an object containing
 *     - height and width in pixels
 *     - left and top in pixels relative to the workspace origin.
 * @private
 */
Blockly.WorkspaceSvg.getContentDimensionsBounded_ = function(ws, svgSize) {
  var content = Blockly.WorkspaceSvg.getContentDimensionsExact_(ws);

  // View height and width are both in pixels, and are the same as the SVG size.
  var viewWidth = svgSize.width;
  var viewHeight = svgSize.height;
  var halfWidth = viewWidth / 2;

  // Vertical padding: 1/4 viewport height on top, 1/3 on bottom
  var topPadding = viewHeight / 4;
  var bottomPadding = viewHeight / 3;

  // Add a border around the content that is at least half a screenful wide.
  // Ensure border is wide enough that blocks can scroll over entire screen.
  var grid = ws.getGrid();
  var isColumnLayout = grid && grid.isColumnLayoutEnabled();

  var left, right, top, bottom;
  if (isColumnLayout) {
    // In column layout mode: use fixed padding of 48 horizontally
    // Note: content.left/right are already in pixels (scaled), so padding should also be in pixels
    var fixedPaddingLeft = 48;
    var fixedPaddingRight = 48;

    // Add minimap width to right padding to prevent blocks from being hidden behind it
    if (ws.blockOutline_) {
      fixedPaddingRight += Blockly.BlockOutline.WIDTH;
    }

    // Horizontal bounds: fixed padding on left, fixed padding + minimap width on right
    left = content.left - fixedPaddingLeft;
    left = Math.max(left, 0); // Don't go negative (blocks start at x=48, so left edge is 0)
    right = content.right + fixedPaddingRight;

    // Ensure minimum width is the viewport width (prevents scrolling when content is narrow)
    var contentWidth = right - left;
    if (contentWidth < viewWidth) {
      // Content fits in viewport - expand to fill viewport, no scrolling
      right = left + viewWidth;
    }

    // Vertical bounds: 1/4 viewport height on top, 1/3 on bottom
    // This allows dragging blocks with reasonable space
    top = Math.min(content.top - topPadding, content.bottom - viewHeight);
    bottom = Math.max(content.bottom + bottomPadding, content.top + viewHeight);
  } else {
    // Default mode: half screen padding horizontally, 1/4 top and 1/3 bottom vertically
    left = Math.min(content.left - halfWidth, content.right - viewWidth);
    right = Math.max(content.right + halfWidth, content.left + viewWidth);
    top = Math.min(content.top - topPadding, content.bottom - viewHeight);
    bottom = Math.max(content.bottom + bottomPadding, content.top + viewHeight);
  }

  var dimensions = {
    left: left,
    top: top,
    height: bottom - top,
    width: right - left
  };
  return dimensions;
};

/**
 * Return an object with all the metrics required to size scrollbars for a
 * top level workspace.  The following properties are computed:
 * Coordinate system: pixel coordinates.
 * .viewHeight: Height of the visible rectangle,
 * .viewWidth: Width of the visible rectangle,
 * .contentHeight: Height of the contents,
 * .contentWidth: Width of the content,
 * .viewTop: Offset of top edge of visible rectangle from parent,
 * .viewLeft: Offset of left edge of visible rectangle from parent,
 * .contentTop: Offset of the top-most content from the y=0 coordinate,
 * .contentLeft: Offset of the left-most content from the x=0 coordinate.
 * .absoluteTop: Top-edge of view.
 * .absoluteLeft: Left-edge of view.
 * .toolboxWidth: Width of toolbox, if it exists.  Otherwise zero.
 * .toolboxHeight: Height of toolbox, if it exists.  Otherwise zero.
 * .flyoutWidth: Width of the flyout if it is always open.  Otherwise zero.
 * .flyoutHeight: Height of flyout if it is always open.  Otherwise zero.
 * .toolboxPosition: Top, bottom, left or right.
 * @return {!Object} Contains size and position metrics of a top level
 *   workspace.
 * @private
 * @this Blockly.WorkspaceSvg
 */
Blockly.WorkspaceSvg.getTopLevelWorkspaceMetrics_ = function() {

  var toolboxDimensions =
      Blockly.WorkspaceSvg.getDimensionsPx_(this.toolbox_);
  var flyoutDimensions =
      Blockly.WorkspaceSvg.getDimensionsPx_(this.flyout_);

  // Contains height and width in CSS pixels.
  // svgSize is equivalent to the size of the injectionDiv at this point.
  var svgSize = Blockly.svgSize(this.getParentSvg());
  if (this.toolbox_) {
    if (this.toolboxPosition == Blockly.TOOLBOX_AT_TOP ||
        this.toolboxPosition == Blockly.TOOLBOX_AT_BOTTOM) {
      svgSize.height -= toolboxDimensions.height;
    } else if (this.toolboxPosition == Blockly.TOOLBOX_AT_LEFT ||
        this.toolboxPosition == Blockly.TOOLBOX_AT_RIGHT) {
      svgSize.width -= toolboxDimensions.width;
    }
  }

  // svgSize is now the space taken up by the Blockly workspace, not including
  // the toolbox.
  var contentDimensions =
      Blockly.WorkspaceSvg.getContentDimensions_(this, svgSize);

  var absoluteLeft = 0;
  if (this.toolbox_ && this.toolboxPosition == Blockly.TOOLBOX_AT_LEFT) {
    absoluteLeft = toolboxDimensions.width;
  }
  var absoluteTop = 0;
  if (this.toolbox_ && this.toolboxPosition == Blockly.TOOLBOX_AT_TOP) {
    absoluteTop = toolboxDimensions.height;
  }

  var metrics = {
    contentHeight: contentDimensions.height,
    contentWidth: contentDimensions.width,
    contentTop: contentDimensions.top,
    contentLeft: contentDimensions.left,

    viewHeight: svgSize.height,
    viewWidth: svgSize.width,
    viewTop: -this.scrollY,   // Must be in pixels, somehow.
    viewLeft: -this.scrollX,  // Must be in pixels, somehow.

    absoluteTop: absoluteTop,
    absoluteLeft: absoluteLeft,

    toolboxWidth: toolboxDimensions.width,
    toolboxHeight: toolboxDimensions.height,

    flyoutWidth: flyoutDimensions.width,
    flyoutHeight: flyoutDimensions.height,

    toolboxPosition: this.toolboxPosition
  };
  return metrics;
};

/**
 * Sets the X/Y translations of a top level workspace to match the scrollbars.
 * @param {!Object} xyRatio Contains an x and/or y property which is a float
 *     between 0 and 1 specifying the degree of scrolling.
 * @private
 * @this Blockly.WorkspaceSvg
 */
Blockly.WorkspaceSvg.setTopLevelWorkspaceMetrics_ = function(xyRatio) {
  if (!this.scrollbar) {
    throw 'Attempt to set top level workspace scroll without scrollbars.';
  }
  var metrics = this.getMetrics();
  if (goog.isNumber(xyRatio.x)) {
    this.scrollX = -metrics.contentWidth * xyRatio.x - metrics.contentLeft;
  }
  if (goog.isNumber(xyRatio.y)) {
    this.scrollY = -metrics.contentHeight * xyRatio.y - metrics.contentTop;
  }
  var x = this.scrollX + metrics.absoluteLeft;
  var y = this.scrollY + metrics.absoluteTop;
  this.translate(x, y);
  if (this.grid_) {
    this.grid_.moveTo(x, y);
  }
  // Update minimap viewport indicator on scroll
  if (this.blockOutline_) {
    this.blockOutline_.updateViewportIndicator();
  }
};

/**
 * Update whether this workspace has resizes enabled.
 * If enabled, workspace will resize when appropriate.
 * If disabled, workspace will not resize until re-enabled.
 * Use to avoid resizing during a batch operation, for performance.
 * @param {boolean} enabled Whether resizes should be enabled.
 */
Blockly.WorkspaceSvg.prototype.setResizesEnabled = function(enabled) {
  var reenabled = (!this.resizesEnabled_ && enabled);
  this.resizesEnabled_ = enabled;
  if (reenabled) {
    // Newly enabled.  Trigger a resize.
    this.resizeContents();
  }
};

/**
 * Update whether this workspace has toolbox refreshes enabled.
 * If enabled, the toolbox will refresh when appropriate.
 * If disabled, workspace will not refresh until re-enabled.
 * Use to avoid refreshing during a batch operation, for performance.
 * @param {boolean} enabled Whether refreshes should be enabled.
 */
Blockly.WorkspaceSvg.prototype.setToolboxRefreshEnabled = function(enabled) {
  var reenabled = (!this.toolboxRefreshEnabled_ && enabled);
  this.toolboxRefreshEnabled_ = enabled;
  if (reenabled) {
    // Newly enabled.  Trigger a refresh.
    this.refreshToolboxSelection_();
  }
};


/**
 * Dispose of all blocks in workspace, with an optimization to prevent resizes.
 */
Blockly.WorkspaceSvg.prototype.clear = function() {
  this.setResizesEnabled(false);
  Blockly.WorkspaceSvg.superClass_.clear.call(this);
  this.setResizesEnabled(true);
};

/**
 * Register a callback function associated with a given key, for clicks on
 * buttons and labels in the flyout.
 * For instance, a button specified by the XML
 * <button text="create variable" callbackKey="CREATE_VARIABLE"></button>
 * should be matched by a call to
 * registerButtonCallback("CREATE_VARIABLE", yourCallbackFunction).
 * @param {string} key The name to use to look up this function.
 * @param {function(!Blockly.FlyoutButton)} func The function to call when the
 *     given button is clicked.
 */
Blockly.WorkspaceSvg.prototype.registerButtonCallback = function(key, func) {
  goog.asserts.assert(goog.isFunction(func),
      'Button callbacks must be functions.');
  this.flyoutButtonCallbacks_[key] = func;
};

/**
 * Get the callback function associated with a given key, for clicks on buttons
 * and labels in the flyout.
 * @param {string} key The name to use to look up the function.
 * @return {?function(!Blockly.FlyoutButton)} The function corresponding to the
 *     given key for this workspace; null if no callback is registered.
 */
Blockly.WorkspaceSvg.prototype.getButtonCallback = function(key) {
  var result = this.flyoutButtonCallbacks_[key];
  return result ? result : null;
};

/**
 * Remove a callback for a click on a button in the flyout.
 * @param {string} key The name associated with the callback function.
 */
Blockly.WorkspaceSvg.prototype.removeButtonCallback = function(key) {
  this.flyoutButtonCallbacks_[key] = null;
};

/**
 * Register a callback function associated with a given key, for populating
 * custom toolbox categories in this workspace.  See the variable and procedure
 * categories as an example.
 * @param {string} key The name to use to look up this function.
 * @param {function(!Blockly.Workspace):!Array.<!Element>} func The function to
 *     call when the given toolbox category is opened.
 */
Blockly.WorkspaceSvg.prototype.registerToolboxCategoryCallback = function(key,
    func) {
  goog.asserts.assert(goog.isFunction(func),
      'Toolbox category callbacks must be functions.');
  this.toolboxCategoryCallbacks_[key] = func;
};

/**
 * Get the callback function associated with a given key, for populating
 * custom toolbox categories in this workspace.
 * @param {string} key The name to use to look up the function.
 * @return {?function(!Blockly.Workspace):!Array.<!Element>} The function
 *     corresponding to the given key for this workspace, or null if no function
 *     is registered.
 */
Blockly.WorkspaceSvg.prototype.getToolboxCategoryCallback = function(key) {
  var result = this.toolboxCategoryCallbacks_[key];
  return result ? result : null;
};

/**
 * Remove a callback for a click on a custom category's name in the toolbox.
 * @param {string} key The name associated with the callback function.
 */
Blockly.WorkspaceSvg.prototype.removeToolboxCategoryCallback = function(key) {
  this.toolboxCategoryCallbacks_[key] = null;
};

/**
 * Look up the gesture that is tracking this touch stream on this workspace.
 * May create a new gesture.
 * @param {!Event} e Mouse event or touch event
 * @return {Blockly.Gesture} The gesture that is tracking this touch stream,
 *     or null if no valid gesture exists.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getGesture = function(e) {
  var isStart = (e.type == 'mousedown' || e.type == 'touchstart');

  var gesture = this.currentGesture_;
  if (gesture) {
    if (isStart && gesture.hasStarted()) {
      // That's funny.  We must have missed a mouse up.
      // Cancel it, rather than try to retrieve all of the state we need.
      gesture.cancel();
      return null;
    }
    return gesture;
  }

  // No gesture existed on this workspace, but this looks like the start of a
  // new gesture.
  if (isStart) {
    this.currentGesture_ = new Blockly.Gesture(e, this);
    return this.currentGesture_;
  }
  // No gesture existed and this event couldn't be the start of a new gesture.
  return null;
};

/**
 * Clear the reference to the current gesture.
 * @package
 */
Blockly.WorkspaceSvg.prototype.clearGesture = function() {
  this.currentGesture_ = null;

  if (this.checkProcedureReturnAfterGesture_) {
    this.processProcedureReturnsChanged_();
  }
};

/**
 * Cancel the current gesture, if one exists.
 * @package
 */
Blockly.WorkspaceSvg.prototype.cancelCurrentGesture = function() {
  if (this.currentGesture_) {
    this.currentGesture_.cancel();
  }
};

/**
 * Don't even think about using this function before talking to rachel-fenichel.
 *
 * Force a drag to start without clicking and dragging the block itself.  Used
 * to attach duplicated blocks to the mouse pointer.
 * @param {!Object} fakeEvent An object with the properties needed to start a
 *     drag, including clientX and clientY.
 * @param {!Blockly.BlockSvg} block The block to start dragging.
 * @package
 */
Blockly.WorkspaceSvg.prototype.startDragWithFakeEvent = function(fakeEvent,
    block) {
  Blockly.Touch.clearTouchIdentifier();
  Blockly.Touch.checkTouchIdentifier(fakeEvent);
  var gesture = block.workspace.getGesture(fakeEvent);
  gesture.forceStartBlockDrag(fakeEvent, block);
};

/**
 * Get the audio manager for this workspace.
 * @return {Blockly.WorkspaceAudio} The audio manager for this workspace.
 */
Blockly.WorkspaceSvg.prototype.getAudioManager = function() {
  return this.audioManager_;
};

/**
 * Get the grid object for this workspace, or null if there is none.
 * @return {Blockly.Grid} The grid object for this workspace.
 * @package
 */
Blockly.WorkspaceSvg.prototype.getGrid = function() {
  return this.grid_;
};

// Export symbols that would otherwise be renamed by Closure compiler.
Blockly.WorkspaceSvg.prototype['setVisible'] =
    Blockly.WorkspaceSvg.prototype.setVisible;
