/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2015 Google Inc.
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
 * @fileoverview Object representing a zoom icons.
 * @author carloslfu@gmail.com (Carlos Galarza)
 */
'use strict';

goog.provide('Blockly.ZoomControls');

goog.require('Blockly.Touch');
goog.require('goog.dom');


/**
 * Class for a zoom controls.
 * @param {!Blockly.Workspace} workspace The workspace to sit in.
 * @constructor
 */
Blockly.ZoomControls = function(workspace) {
  this.workspace_ = workspace;
};

/**
 * Zoom in icon path.
 * @type {string}
 * @private
 */
Blockly.ZoomControls.prototype.ZOOM_IN_PATH_ = 'zoom-in.svg';

/**
 * Zoom out icon path.
 * @type {string}
 * @private
 */
Blockly.ZoomControls.prototype.ZOOM_OUT_PATH_ = 'zoom-out.svg';

/**
 * Zoom reset icon path.
 * @type {string}
 * @private
 */
Blockly.ZoomControls.prototype.ZOOM_RESET_PATH_ = 'zoom-reset.svg';

/**
 * Selection mode icon path.
 * @type {string}
 * @private
 */
Blockly.ZoomControls.prototype.SELECTION_MODE_PATH_ = 'selection-mode.svg';

/**
 * Width of the zoom controls.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.WIDTH_ = 36;

/**
 * Height of the zoom controls (including selection mode button).
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.HEIGHT_ = 168;

/**
 * Distance between each zoom control.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.MARGIN_BETWEEN_ = 8;

/**
 * Distance between zoom controls and bottom edge of workspace.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.MARGIN_BOTTOM_ = 12;

/**
 * Distance between zoom controls and right edge of workspace.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.MARGIN_SIDE_ = 12;

/**
 * The SVG group containing the zoom controls.
 * @type {Element}
 * @private
 */
Blockly.ZoomControls.prototype.svgGroup_ = null;

/**
 * Left coordinate of the zoom controls.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.left_ = 0;

/**
 * Top coordinate of the zoom controls.
 * @type {number}
 * @private
 */
Blockly.ZoomControls.prototype.top_ = 0;

/**
 * Create the zoom controls.
 * @return {!Element} The zoom controls SVG group.
 */
Blockly.ZoomControls.prototype.createDom = function() {
  this.svgGroup_ =
      Blockly.utils.createSvgElement('g', {'class': 'blocklyZoom'}, null);
  this.createSelectionModeSvg_();
  this.createZoomOutSvg_();
  this.createZoomInSvg_();
  this.createZoomResetSvg_();
  return this.svgGroup_;
};

/**
 * Initialize the zoom controls.
 * @param {number} bottom Distance from workspace bottom to bottom of controls.
 * @return {number} Distance from workspace bottom to the top of controls.
 */
Blockly.ZoomControls.prototype.init = function(bottom) {
  this.bottom_ = this.MARGIN_BOTTOM_ + bottom;
  return this.bottom_ + this.HEIGHT_;
};

/**
 * Dispose of this zoom controls.
 * Unlink from all DOM elements to prevent memory leaks.
 */
Blockly.ZoomControls.prototype.dispose = function() {
  if (this.svgGroup_) {
    goog.dom.removeNode(this.svgGroup_);
    this.svgGroup_ = null;
  }
  this.workspace_ = null;
};

/**
 * Move the zoom controls to the bottom-right corner.
 */
Blockly.ZoomControls.prototype.position = function() {
  var metrics = this.workspace_.getMetrics();
  if (!metrics) {
    // There are no metrics available (workspace is probably not visible).
    return;
  }
  if (this.workspace_.RTL) {
    this.left_ = this.MARGIN_SIDE_ + Blockly.Scrollbar.scrollbarThickness;
    if (metrics.toolboxPosition == Blockly.TOOLBOX_AT_LEFT) {
      this.left_ += metrics.flyoutWidth;
      if (this.workspace_.toolbox_) {
        this.left_ += metrics.absoluteLeft;
      }
    }
  } else {
    this.left_ = metrics.viewWidth + metrics.absoluteLeft -
        this.WIDTH_ - this.MARGIN_SIDE_ - Blockly.Scrollbar.scrollbarThickness;

    if (metrics.toolboxPosition == Blockly.TOOLBOX_AT_RIGHT) {
      this.left_ -= metrics.flyoutWidth;
    }
  }
  this.top_ = metrics.viewHeight + metrics.absoluteTop -
      this.HEIGHT_ - this.bottom_;
  if (metrics.toolboxPosition == Blockly.TOOLBOX_AT_BOTTOM) {
    this.top_ -= metrics.flyoutHeight;
  }
  this.svgGroup_.setAttribute('transform',
      'translate(' + this.left_ + ',' + this.top_ + ')');
};

/**
 * Create the selection mode icon and its event handler.
 * @private
 */
Blockly.ZoomControls.prototype.createSelectionModeSvg_ = function() {
  var ws = this.workspace_;

  /**
   * Selection mode control group.
   * @type {SVGElement}
   */
  var selectionModeGroup = Blockly.utils.createSvgElement(
      'g',
      {
        'class': 'blocklySelectionMode',
        'y': 0
      },
      this.svgGroup_
  );

  // Create background circle (same style as zoom buttons)
  var bgCircle = Blockly.utils.createSvgElement(
      'circle',
      {
        'r': this.WIDTH_ / 2,
        'cx': this.WIDTH_ / 2,
        'cy': 0 + this.WIDTH_ / 2,
        'fill': '#ffffff',
        'fill-opacity': 0.9,
        'stroke': '#C0C0C0',
        'stroke-width': 1,
        'class': 'blocklySelectionModeBackground'
      },
      selectionModeGroup
  );

  // Create tap/touch icon centered in button
  // Icon represents a finger tapping (selection gesture)
  var iconGroup = Blockly.utils.createSvgElement(
      'g',
      {
        // Scale down from 511.448 viewBox to ~20px and center in 36x36 button
        'transform': 'translate(' + (this.WIDTH_ / 2) + ',' + (this.WIDTH_ / 2) + ') ' +
                     'scale(0.04) translate(-255, -255)'
      },
      selectionModeGroup
  );

  // White fill path (hand outline)
  var _whitePath = Blockly.utils.createSvgElement(
      'path',
      {
        'd': 'M282.788,114.33c0,37.204-21.364,71.117-54.127,87.498v-21.662' +
             'c21.916-14.559,35.348-39.358,35.348-65.836c0-43.556-35.437-78.982-78.982-78.982' +
             's-78.982,35.426-78.982,78.982c0,26.478,13.432,51.277,35.348,65.836v21.662' +
             'c-32.764-16.382-54.127-50.294-54.127-87.498c0-53.906,43.854-97.761,97.761-97.761' +
             'S282.788,60.424,282.788,114.33z M424.182,257.248v157.544c0,44.163-35.923,80.086-80.086,80.086' +
             'H213.373c-34.52,0-65.063-22.004-75.977-54.757l-31.394-94.204' +
             'c-5.015-15.045,0.287-31.339,13.189-40.562l22.203-15.863v72.277' +
             'c0,4.573,3.712,8.285,8.285,8.285s8.285-3.712,8.285-8.285V114.33' +
             'c0-7.611,3.226-14.913,8.87-20.027c5.7-5.192,13.123-7.644,20.877-6.904' +
             'c13.675,1.303,24.379,13.797,24.379,28.455v175.218c0,4.573,3.712,8.285,8.285,8.285' +
             's8.285-3.712,8.285-8.285V238.05c0-7.611,3.226-14.913,8.87-20.027' +
             'c5.7-5.192,13.123-7.655,20.877-6.904c13.675,1.303,24.379,13.797,24.379,28.455' +
             'v7.313v53.023c0,4.573,3.712,8.285,8.285,8.285c4.573,0,8.285-3.712,8.285-8.285' +
             'v-53.023c0-7.611,3.226-14.913,8.87-20.027c5.7-5.192,13.123-7.655,20.877-6.904' +
             'c13.675,1.303,24.379,13.797,24.379,28.455v7.313v53.023c0,4.573,3.712,8.285,8.285,8.285' +
             's8.285-3.712,8.285-8.285v-53.023c0-7.611,3.226-14.913,8.87-20.027' +
             'c5.7-5.192,13.123-7.655,20.877-6.904C413.478,230.096,424.182,242.59,424.182,257.248z',
        'fill': '#FFFFFF',
        'stroke': 'none'
      },
      iconGroup
  );

  // Green fill path (thumb)
  var _greenPath = Blockly.utils.createSvgElement(
      'path',
      {
        'd': 'M247.44,114.33c0,16.934-6.948,32.985-18.779,44.594v-43.07' +
             'c0-23.109-17.299-42.849-39.38-44.959c-12.271-1.16-24.522,2.894-33.603,11.146' +
             'c-9.08,8.252-14.283,20.027-14.283,32.289v44.594c-11.831-11.61-18.779-27.671-18.779-44.594' +
             'c0-34.409,28.003-62.412,62.412-62.412S247.44,79.921,247.44,114.33z',
        'fill': '#C2E95D',
        'stroke': 'none'
      },
      iconGroup
  );

  // Dark outline path
  var icon = Blockly.utils.createSvgElement(
      'path',
      {
        'd': 'M440.751,257.248v157.544c0,53.299-43.357,96.656-96.656,96.656H213.373' +
             'c-41.667,0-78.518-26.556-91.696-66.091l-31.394-94.193' +
             'c-7.336-21.993,0.42-45.82,19.275-59.286l31.836-22.744v-49.101' +
             'C98.92,202.48,70.696,160.581,70.696,114.33C70.696,51.288,121.985,0,185.026,0' +
             's114.33,51.288,114.33,114.33c0,31.04-12.725,60.114-33.923,81.191' +
             'c12.239,2.861,22.524,11.212,28.456,22.292c1.005-1.127,2.066-2.198,3.181-3.214' +
             'c9.081-8.252,21.332-12.306,33.603-11.146c14.604,1.392,27.12,10.505,33.912,23.197' +
             'c1.005-1.127,2.066-2.198,3.181-3.214c9.081-8.252,21.332-12.306,33.603-11.146' +
             'C423.453,214.399,440.751,234.139,440.751,257.248z M424.182,414.792V257.248' +
             'c0-14.659-10.704-27.152-24.379-28.455c-7.755-0.751-15.177,1.712-20.877,6.904' +
             'c-5.645,5.114-8.87,12.416-8.87,20.027v53.023c0,4.573-3.712,8.285-8.285,8.285' +
             's-8.285-3.712-8.285-8.285v-53.023v-7.313c0-14.659-10.704-27.152-24.379-28.455' +
             'c-7.755-0.751-15.177,1.712-20.877,6.904c-5.645,5.114-8.87,12.416-8.87,20.027' +
             'v53.023c0,4.573-3.712,8.285-8.285,8.285c-4.573,0-8.285-3.712-8.285-8.285v-53.023' +
             'v-7.313c0-14.659-10.704-27.152-24.379-28.455c-7.755-0.751-15.177,1.712-20.877,6.904' +
             'c-5.645,5.114-8.87,12.416-8.87,20.027v53.023c0,4.573-3.712,8.285-8.285,8.285' +
             'c-4.573,0-8.285-3.712-8.285-8.285V115.855c0-14.659-10.704-27.152-24.379-28.455' +
             'c-7.755-0.74-15.177,1.712-20.877,6.904c-5.645,5.114-8.87,12.416-8.87,20.027' +
             'v247.439c0,4.573-3.712,8.285-8.285,8.285c-4.573,0-8.285-3.712-8.285-8.285v-72.277' +
             'l-22.203,15.863c-12.903,9.224-18.204,25.517-13.189,40.562l31.394,94.204' +
             'c10.914,32.753,41.457,54.757,75.977,54.757H344.1' +
             'C388.259,494.878,424.182,458.955,424.182,414.792z M228.661,201.829' +
             'c32.764-16.382,54.127-50.294,54.127-87.498c0-53.906-43.854-97.761-97.761-97.761' +
             'S87.267,60.424,87.267,114.33c0,37.204,21.364,71.117,54.127,87.498v-21.662' +
             'c-21.916-14.559-35.348-39.358-35.348-65.836c0-43.556,35.437-78.982,78.982-78.982' +
             's78.982,35.426,78.982,78.982c0,26.478-13.432,51.277-35.348,65.836V201.829z' +
             'M228.661,158.924c11.831-11.61,18.779-27.66,18.779-44.594' +
             'c0-34.409-28.003-62.412-62.412-62.412s-62.412,28.003-62.412,62.412' +
             'c0,16.923,6.948,32.985,18.779,44.594V114.33c0-12.261,5.203-24.037,14.283-32.289' +
             'c9.081-8.252,21.332-12.306,33.603-11.146c22.082,2.11,39.38,21.85,39.38,44.959V158.924z',
        'fill': '#575E75',
        'stroke': 'none',
        'class': 'blocklySelectionModeIcon'
      },
      iconGroup
  );

  // Store references for toggling
  this.selectionModeButton_ = selectionModeGroup;
  this.selectionModeBackground_ = bgCircle;
  this.selectionModeIcon_ = icon;

  // Attach event listener
  Blockly.bindEventWithChecks_(selectionModeGroup, 'mousedown', null, function(e) {
    ws.markFocused();
    ws.toggleSelectionMode();
    Blockly.Touch.clearTouchIdentifier();
    e.stopPropagation();
    e.preventDefault();
  });
};

/**
 * Create the zoom in icon and its event handler.
 * The Scratch Blocks implementation of this function is different from the
 * Blockly implementation.
 * @private
 */
Blockly.ZoomControls.prototype.createZoomOutSvg_ = function() {
  /* This markup will be generated and added to the "blocklyZoom" group:
    <image width="36" height="36" y="88" xlink:href="../media/zoom-out.svg">
    </image>
  */
  var ws = this.workspace_;
  /**
   * Zoom out control.
   * @type {SVGElement}
   */
  var zoomoutSvg = Blockly.utils.createSvgElement(
      'image',
      {
        'width': this.WIDTH_,
        'height': this.WIDTH_,
        'y': (this.WIDTH_ * 2) + (this.MARGIN_BETWEEN_ * 2)
      },
      this.svgGroup_
  );
  zoomoutSvg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
      ws.options.pathToMedia + this.ZOOM_OUT_PATH_);
  // Attach listener.
  Blockly.bindEventWithChecks_(zoomoutSvg, 'mousedown', null, function(e) {
    ws.markFocused();
    ws.zoomCenter(-1);
    Blockly.Touch.clearTouchIdentifier();  // Don't block future drags.
    e.stopPropagation();  // Don't start a workspace scroll.
    e.preventDefault();  // Stop double-clicking from selecting text.
  });
};

/**
 * Create the zoom out icon and its event handler.
 * The Scratch Blocks implementation of this function is different from the
 * Blockly implementation.
 * @private
 */
Blockly.ZoomControls.prototype.createZoomInSvg_ = function() {
  /* This markup will be generated and added to the "blocklyZoom" group:
    <image width="36" height="36" y="44" xlink:href="../media/zoom-in.svg">
    </image>
  */
  var ws = this.workspace_;
  /**
   * Zoom in control.
   * @type {SVGElement}
   */
  var zoominSvg = Blockly.utils.createSvgElement(
      'image',
      {
        'width': this.WIDTH_,
        'height': this.WIDTH_,
        'y': (this.WIDTH_ * 1) + (this.MARGIN_BETWEEN_ * 1)
      },
      this.svgGroup_
  );
  zoominSvg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
      ws.options.pathToMedia + this.ZOOM_IN_PATH_);

  // Attach listener.
  Blockly.bindEventWithChecks_(zoominSvg, 'mousedown', null, function(e) {
    ws.markFocused();
    ws.zoomCenter(1);
    Blockly.Touch.clearTouchIdentifier();  // Don't block future drags.
    e.stopPropagation();  // Don't start a workspace scroll.
    e.preventDefault();  // Stop double-clicking from selecting text.
  });
};

/**
 * Create the zoom reset icon and its event handler.
 * The Scratch Blocks implementation of this function is different from the
 * Blockly implementation.
 * @private
 */
Blockly.ZoomControls.prototype.createZoomResetSvg_ = function() {
  /* This markup will be generated and added to the "blocklyZoom" group:
    <image width="36" height="36" y="132" xlink:href="../media/zoom-reset.svg">
    </image>
  */
  var ws = this.workspace_;

  /**
   * Zoom reset control.
   * @type {SVGElement}
   */
  var zoomresetSvg = Blockly.utils.createSvgElement(
      'image',
      {
        'width': this.WIDTH_,
        'height': this.WIDTH_,
        'y': (this.WIDTH_ * 3) + (this.MARGIN_BETWEEN_ * 3)
      },
      this.svgGroup_
  );
  zoomresetSvg.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href',
      ws.options.pathToMedia + this.ZOOM_RESET_PATH_);

  // Attach event listeners.
  Blockly.bindEventWithChecks_(zoomresetSvg, 'mousedown', null, function(e) {
    ws.markFocused();
    ws.setScale(ws.options.zoomOptions.startScale);
    ws.scrollCenter();
    Blockly.Touch.clearTouchIdentifier();  // Don't block future drags.
    e.stopPropagation();  // Don't start a workspace scroll.
    e.preventDefault();  // Stop double-clicking from selecting text.
  });
};
