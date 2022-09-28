'use strict';
/**
 * Allows to drag and zoom svg elements
 */
let wheel = require('wheel');
let animate = require('amator');
let eventify = require('ngraph.events');
let kinetic = require('./lib/kinetic.js');
let createTextSelectionInterceptor = require('./lib/createTextSelectionInterceptor.js');
let domTextSelectionInterceptor = createTextSelectionInterceptor();
let fakeTextSelectorInterceptor = createTextSelectionInterceptor(true);
let Transform = require('./lib/transform.js');
let makeSvgController = require('./lib/svgController.js');
let makeDomController = require('./lib/domController.js');

const defaultZoomSpeed = 1;
const defaultDoubleTapZoomSpeed = 1.75;
const doubleTapSpeedInMS = 300;
const clickEventTimeInMS = 200;



/**
 * Creates a new instance of panzoom, so that an object can be panned and zoomed
 *
 * @param {DOMElement} domElement where panzoom should be attached.
 * @param {Object} options that configure behavior.
 */
function createPanZoom(domElement, options) {
  options = options || {};

  let panController = options.controller;

  let linkAspect = true
  let scaleFactors = { x : 1.0, y : 1.0 }
  
  if ( typeof options.preserveAspecRatio === "boolean" ) {
    linkAspect = (typeof options.preserveAspecRatio === "boolean") ? options.preserveAspecRatio : true
    if ( !(linkAspect) && (typeof options.scaleFactors === "object") ) {
      scaleFactors.x = (options.scaleFactors.x !== undefined) ? options.scaleFactors.x : 1.0
      scaleFactors.y = (options.scaleFactors.y !== undefined) ? options.scaleFactors.y : 1.0
    }
  }

  if (!panController) {
    if (makeSvgController.canAttach(domElement)) {
      panController = makeSvgController(domElement, options);
    } else if (makeDomController.canAttach(domElement)) {
      panController = makeDomController(domElement, options);
    }
  }

  if (!panController) {
    throw new Error(
      'Cannot create panzoom for the current type of dom element'
    );
  }
  let owner = panController.getOwner();
  // just to avoid GC pressure, every time we do intermediate transform
  // we return this object. For internal use only. Never give it back to the consumer of this library
  let storedCTMResult = { x: 0, y: 0 };

  let isDirty = false;
  let transform = new Transform(linkAspect);

  if (panController.initTransform) {
    panController.initTransform(transform);
  }

  let filterKey = typeof options.filterKey === 'function' ? options.filterKey : noop;
  // TODO: likely need to unite pinchSpeed with zoomSpeed
  let pinchSpeed = typeof options.pinchSpeed === 'number' ? options.pinchSpeed : 1;
  let bounds = options.bounds;
  let maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : Number.POSITIVE_INFINITY;
  let minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0;

  let boundsPadding = typeof options.boundsPadding === 'number' ? options.boundsPadding : 0.05;
  let zoomDoubleClickSpeed = typeof options.zoomDoubleClickSpeed === 'number' ? options.zoomDoubleClickSpeed : defaultDoubleTapZoomSpeed;
  let beforeWheel = options.beforeWheel || noop;
  let beforeMouseDown = options.beforeMouseDown || noop;
  let speed = typeof options.zoomSpeed === 'number' ? options.zoomSpeed : defaultZoomSpeed;
  let transformOrigin = parseTransformOrigin(options.transformOrigin);
  let textSelection = options.enableTextSelection ? fakeTextSelectorInterceptor : domTextSelectionInterceptor;

  validateBounds(bounds);

  if (options.autocenter) {
    autocenter();
  }

  let frameAnimation;
  let lastTouchEndTime = 0;
  let lastTouchStartTime = 0;
  let pendingClickEventTimeout = 0;
  let lastMouseDownedEvent = null;
  let lastMouseDownTime = new Date();
  let lastSingleFingerOffset;
  let touchInProgress = false;

  // We only need to fire panstart when actual move happens
  let panstartFired = false;

  // cache mouse coordinates here
  let mouseX;
  let mouseY;

  // Where the first click has happened, so that we can differentiate
  // between pan and click
  let clickX;
  let clickY;

  let pinchZoomLength;

  let smoothScroll;
  if ('smoothScroll' in options && !options.smoothScroll) {
    // If user explicitly asked us not to use smooth scrolling, we obey
    smoothScroll = rigidScroll();
  } else {
    // otherwise we use forward smoothScroll settings to kinetic API
    // which makes scroll smoothing.
    if ( options.smoothScroll.reactZeroVelocity ) {
      options.smoothScroll.callWhenMotionStops = triggerDecelerateToZero
    }
    smoothScroll = kinetic(getPoint, scroll, options.smoothScroll);
  }

  let moveByAnimation;
  let zoomToAnimation;

  let multiTouch;
  let paused = false;

  listenForEvents();

  let api = {
    dispose: dispose,
    moveBy: internalMoveBy,
    moveTo: moveTo,
    smoothMoveTo: smoothMoveTo, 
    centerOn: centerOn,
    zoomTo: publicZoomTo,
    zoomAbs: zoomAbs,
    smoothZoom: smoothZoom,
    smoothZoomAbs: smoothZoomAbs,
    showRectangle: showRectangle,

    pause: pause,
    resume: resume,
    isPaused: isPaused,

    getTransform: getTransformModel,

    getMinZoom: getMinZoom,
    setMinZoom: setMinZoom,

    getMaxZoom: getMaxZoom,
    setMaxZoom: setMaxZoom,

    getTransformOrigin: getTransformOrigin,
    setTransformOrigin: setTransformOrigin,

    getZoomSpeed: getZoomSpeed,
    setZoomSpeed: setZoomSpeed,

    setPreserveAspect : setPreserveAspect
  };

 
  eventify(api);
  
  const initialX = typeof options.initialX === 'number' ? options.initialX : transform.x;
  const initialY = typeof options.initialY === 'number' ? options.initialY : transform.y;
  const initialZoom = typeof options.initialZoom === 'number' ? options.initialZoom : transform.scale;

  if(initialX != transform.x || initialY != transform.y || initialZoom != transform.scale){
    zoomAbs(initialX, initialY, initialZoom);
  }

  return api;

  function pause() {
    releaseEvents();
    paused = true;
  }

  function resume() {
    if (paused) {
      listenForEvents();
      paused = false;
    }
  }

  function isPaused() {
    return paused;
  }

  function showRectangle(rect) {
    // TODO: this duplicates autocenter. I think autocenter should go.
    let clientRect = owner.getBoundingClientRect();
    let size = transformToScreen(clientRect.width, clientRect.height);

    let rectWidth = rect.right - rect.left;
    let rectHeight = rect.bottom - rect.top;
    if (!Number.isFinite(rectWidth) || !Number.isFinite(rectHeight)) {
      throw new Error('Invalid rectangle');
    }

    let dw = size.x / rectWidth;
    let dh = size.y / rectHeight;
    let scale = Math.min(dw, dh);
    let scaleX = dw
    let scaleY = dh

    if ( linkAspect ) {
      transform.x = -(rect.left + rectWidth / 2) * scale + size.x / 2;
      transform.y = -(rect.top + rectHeight / 2) * scale + size.y / 2;
      transform.scale = scale;
    } else {
      transform.x = (-(rect.left + rectWidth / 2) * scaleX * scaleFactors.x) + size.x / 2;
      transform.y = (-(rect.top + rectHeight / 2) * scaleY * scaleFactors.y) + size.y / 2;
      transform.scaleX = scaleX * (scaleFactors.x === 0 ? 1.0 : scaleFactors.x)
      transform.scaleY = scaleY * (scaleFactors.y === 0 ? 1.0 : scaleFactors.y)
    }
  }


  function transformToScreen(x, y) {
    if (panController.getScreenCTM) {
      let parentCTM = panController.getScreenCTM();
      let parentScaleX = parentCTM.a;
      let parentScaleY = parentCTM.d;
      let parentOffsetX = parentCTM.e;
      let parentOffsetY = parentCTM.f;
      storedCTMResult.x = x * parentScaleX - parentOffsetX;
      storedCTMResult.y = y * parentScaleY - parentOffsetY;
    } else {
      storedCTMResult.x = x;
      storedCTMResult.y = y;
    }

    return storedCTMResult;
  }

  function autocenter() {
    let w; // width of the parent
    let h; // height of the parent
    let left = 0;
    let top = 0;
    let sceneBoundingBox = getBoundingBox();
    if (sceneBoundingBox) {
      // If we have bounding box - use it.
      left = sceneBoundingBox.left;
      top = sceneBoundingBox.top;
      w = sceneBoundingBox.right - sceneBoundingBox.left;
      h = sceneBoundingBox.bottom - sceneBoundingBox.top;
    } else {
      // otherwise just use whatever space we have
      let ownerRect = owner.getBoundingClientRect();
      w = ownerRect.width;
      h = ownerRect.height;
    }
    let bbox = panController.getBBox();
    if (bbox.width === 0 || bbox.height === 0) {
      // we probably do not have any elements in the SVG
      // just bail out;
      return;
    }
    let dh = h / bbox.height;
    let dw = w / bbox.width;
    let scale = Math.min(dw, dh);
    transform.x = -(bbox.left + bbox.width / 2) * scale + w / 2 + left;
    transform.y = -(bbox.top + bbox.height / 2) * scale + h / 2 + top;
    transform.scale = scale;
  }

  function getTransformModel() {
    // TODO: should this be read only?
    return transform;
  }

  function getMinZoom() {
    return minZoom;
  }

  function setMinZoom(newMinZoom) {
    minZoom = newMinZoom;
  }

  function getMaxZoom() {
    return maxZoom;
  }

  function setMaxZoom(newMaxZoom) {
    maxZoom = newMaxZoom;
  }

  function getTransformOrigin() {
    return transformOrigin;
  }

  function setTransformOrigin(newTransformOrigin) {
    transformOrigin = parseTransformOrigin(newTransformOrigin);
  }

  function getZoomSpeed() {
    return speed;
  }

  function setZoomSpeed(newSpeed) {
    if (!Number.isFinite(newSpeed)) {
      throw new Error('Zoom speed should be a number');
    }
    speed = newSpeed;
  }

  function getPoint() {
    return {
      x: transform.x,
      y: transform.y
    };
  }

  function moveTo(x, y) {
    transform.x = x;
    transform.y = y;

    keepTransformInsideBounds();

    triggerEvent('pan');
    makeDirty();
  }

  function moveBy(dx, dy) {
    moveTo(transform.x + dx, transform.y + dy);
  }

  function keepTransformInsideBounds() {
    let boundingBox = getBoundingBox();
    if (!boundingBox) return;

    let adjusted = false;
    let clientRect = getClientRect();

    let diff = boundingBox.left - clientRect.right;
    if (diff > 0) {
      transform.x += diff;
      adjusted = true;
    }
    // check the other side:
    diff = boundingBox.right - clientRect.left;
    if (diff < 0) {
      transform.x += diff;
      adjusted = true;
    }

    // y axis:
    diff = boundingBox.top - clientRect.bottom;
    if (diff > 0) {
      // we adjust transform, so that it matches exactly our bounding box:
      // transform.y = boundingBox.top - (boundingBox.height + boundingBox.y) * transform.scale =>
      // transform.y = boundingBox.top - (clientRect.bottom - transform.y) =>
      // transform.y = diff + transform.y =>
      transform.y += diff;
      adjusted = true;
    }

    diff = boundingBox.bottom - clientRect.top;
    if (diff < 0) {
      transform.y += diff;
      adjusted = true;
    }
    return adjusted;
  }

  /**
   * Returns bounding box that should be used to restrict scene movement.
   */
  function getBoundingBox() {
    if (!bounds) return; // client does not want to restrict movement

    if (typeof bounds === 'boolean') {
      // for boolean type we use parent container bounds
      let ownerRect = owner.getBoundingClientRect();
      let sceneWidth = ownerRect.width;
      let sceneHeight = ownerRect.height;

      return {
        left: sceneWidth * boundsPadding,
        top: sceneHeight * boundsPadding,
        right: sceneWidth * (1 - boundsPadding),
        bottom: sceneHeight * (1 - boundsPadding)
      };
    }

    return bounds;
  }

  function getClientRect() {
    let bbox = panController.getBBox();
    let leftTop = client(bbox.left, bbox.top);

    if ( linkAspect ) {
      return {
        left: leftTop.x,
        top: leftTop.y,
        right: bbox.width * transform.scale + leftTop.x,
        bottom: bbox.height * transform.scale + leftTop.y
      };  
    } else {
      let scx = scaleFactors.x ? scaleFactors.x : 1.0
      let scy = scaleFactors.y ? scaleFactors.y : 1.0
      return {
        left: leftTop.x,
        top: leftTop.y,
        right: (bbox.width * transform.scaleX * scx) + leftTop.x,
        bottom: (bbox.height * transform.scaleY * scy) + leftTop.y
      };
    }
  }

  function client(x, y) {
    if ( linkAspect ) {
      return {
        x: x * transform.scale + transform.x,
        y: y * transform.scale + transform.y
      };
    } else {
      let scx = scaleFactors.x ? scaleFactors.x : 1.0
      let scy = scaleFactors.y ? scaleFactors.y : 1.0
      return {
        x: (x * transform.scaleX * scx) + transform.x,
        y: (y * transform.scaleY * scy) + transform.y
      };
    }
  }

  function makeDirty() {
    isDirty = true;
    frameAnimation = window.requestAnimationFrame(frame);
  }

  function zoomByRatio(clientX, clientY, ratio) {
    if (isNaN(clientX) || isNaN(clientY) ) {
      throw new Error('zoom requires valid numbers');
    }
    if ( linkAspect ) {
      if ( isNaN(ratio)) {
        throw new Error('zoom requires valid numbers');
      }
  
      let newScale = transform.scale * ratio;
  
      if (newScale < minZoom) {
        if (transform.scale === minZoom) return;
        ratio = minZoom / transform.scale;
      }
      if (newScale > maxZoom) {
        if (transform.scale === maxZoom) return;
        ratio = maxZoom / transform.scale;
      }
  
      let size = transformToScreen(clientX, clientY);
  
      transform.x = size.x - ratio * (size.x - transform.x);
      transform.y = size.y - ratio * (size.y - transform.y);
  
      // TODO: https://github.com/anvaka/panzoom/issues/112
      if (bounds && boundsPadding === 1 && minZoom === 1) {
        transform.scale *= ratio;
        keepTransformInsideBounds();
      } else {
        let transformAdjusted = keepTransformInsideBounds();
        if (!transformAdjusted) transform.scale *= ratio;
      }
    } else {
      
      if ( (typeof ratio === "number") ) {
        ratio = { x : ratio, y : ratio } 
      } else if ( (typeof ratio !== "object") || isNaN(ratio.x) || isNaN(ratio.y) ) {
        throw new Error('zoom (no aspect) requires valid numbers in x,y pair');
      }

      let newScaleX = transform.scaleX * ratio.x * scaleFactors.x ;
      let newScaleY = transform.scaleY * ratio.y * scaleFactors.y ;
  
      if ( (scaleFactors.x > 0) && (newScaleX < minZoom) ) {
        if (transform.scaleX === minZoom) return;
        ratio.x = minZoom / transform.scaleX;
      }
      if ( (scaleFactors.y > 0) && (newScaleY < minZoom) ) {
        if (transform.scaleY === minZoom) return;
        ratio.y = minZoom / transform.scaleY;
      }

      if (newScaleX > maxZoom) {
        if (transform.scaleX === maxZoom) return;
        ratio.x  = maxZoom / transform.scaleX;
      }
      if (newScaleY > maxZoom) {
        if (transform.scaleY === maxZoom) return;
        ratio.y = maxZoom / transform.scaleY;
      }
  
      let size = transformToScreen(clientX, clientY);
  
      transform.x = size.x - ratio.x * (size.x - transform.x) * scaleFactors.x;  // scale factor?
      transform.y = size.y - ratio.y * (size.y - transform.y) * scaleFactors.y;
  
      // TODO: https://github.com/anvaka/panzoom/issues/112
      let scx = scaleFactors.x
      let scy = scaleFactors.y
      if ( bounds && (boundsPadding === 1) && (minZoom === 1) ) {
        if ( scx ) transform.scaleX *= ratio.x;
        if ( scy ) transform.scaleY *= ratio.y;
        keepTransformInsideBounds();
      } else {
        let transformAdjusted = keepTransformInsideBounds();
        if (!transformAdjusted) {
          if ( scx ) transform.scaleX *= ratio.x;
          if ( scy ) transform.scaleY *= ratio.y;
        }
      }

    }

    triggerEvent('zoom');

    makeDirty();
  }

  function zoomAbs(clientX, clientY, zoomLevel) {
    if ( linkAspect ) {
      let ratio = zoomLevel / transform.scale;
      zoomByRatio(clientX, clientY, ratio);
    } else {
      let r_pair = { x : 1, y : 1 } 
      if ( typeof zoomLevel === 'number' ) {
        r_pair = {
          x : (zoomLevel / transform.scaleX),
          y : (zoomLevel / transform.scaleY)
        }  
      } else {
        r_pair = {
          x : (zoomLevel.x / transform.scaleX),
          y : (zoomLevel.y / transform.scaleY)
        }  
      }
      zoomByRatio(clientX, clientY, r_pair);
    }
  }

  function centerOn(ui) {
    let parent = ui.ownerSVGElement;
    if (!parent)
      throw new Error('ui element is required to be within the scene');

    // TODO: should i use controller's screen CTM?
    let clientRect = ui.getBoundingClientRect();
    let cx = clientRect.left + clientRect.width / 2;
    let cy = clientRect.top + clientRect.height / 2;

    let container = parent.getBoundingClientRect();
    let dx = container.width / 2 - cx;
    let dy = container.height / 2 - cy;

    internalMoveBy(dx, dy, true);
  }

  function smoothMoveTo(x, y){
    internalMoveBy(x - transform.x, y - transform.y, true);
  }

  function internalMoveBy(dx, dy, smooth) {
    if (!smooth) {
      return moveBy(dx, dy);
    }

    if (moveByAnimation) moveByAnimation.cancel();

    let from = { x: 0, y: 0 };
    let to = { x: dx, y: dy };
    let lastX = 0;
    let lastY = 0;

    moveByAnimation = animate(from, to, {
      step: function (v) {
        moveBy(v.x - lastX, v.y - lastY);

        lastX = v.x;
        lastY = v.y;
      }
    });
  }

  function scroll(x, y) {
    cancelZoomAnimation();
    moveTo(x, y);
  }

  function dispose() {
    releaseEvents();
  }

  function listenForEvents() {
    owner.addEventListener('mousedown', onMouseDown, { passive: false });
    owner.addEventListener('dblclick', onDoubleClick, { passive: false });
    owner.addEventListener('touchstart', onTouch, { passive: false });
    owner.addEventListener('keydown', onKeyDown, { passive: false });

    // Need to listen on the owner container, so that we are not limited
    // by the size of the scrollable domElement
    wheel.addWheelListener(owner, onMouseWheel, { passive: false });

    makeDirty();
  }

  function releaseEvents() {
    wheel.removeWheelListener(owner, onMouseWheel);
    owner.removeEventListener('mousedown', onMouseDown);
    owner.removeEventListener('keydown', onKeyDown);
    owner.removeEventListener('dblclick', onDoubleClick);
    owner.removeEventListener('touchstart', onTouch);

    if (frameAnimation) {
      window.cancelAnimationFrame(frameAnimation);
      frameAnimation = 0;
    }

    smoothScroll.cancel();

    releaseDocumentMouse();
    releaseTouches();
    textSelection.release();

    triggerPanEnd();
  }

  function frame() {
    if (isDirty) applyTransform();
  }

  function applyTransform() {
    isDirty = false;

    // TODO: Should I allow to cancel this?
    let tt = Object.assign({},transform)
    tt.scaleX *= (scaleFactors.x === 0 ? 1.0 : scaleFactors.x)
    tt.scaleY *= (scaleFactors.y === 0 ? 1.0 : scaleFactors.y)
    panController.applyTransform(tt,linkAspect);

    triggerEvent('transform');
    frameAnimation = 0;
  }

  function onKeyDown(e) {
    let x = 0,
      y = 0,
      z = 0;
    if (e.keyCode === 38) {
      y = 1; // up
    } else if (e.keyCode === 40) {
      y = -1; // down
    } else if (e.keyCode === 37) {
      x = 1; // left
    } else if (e.keyCode === 39) {
      x = -1; // right
    } else if (e.keyCode === 189 || e.keyCode === 109) {
      // DASH or SUBTRACT
      z = 1; // `-` -  zoom out
    } else if (e.keyCode === 187 || e.keyCode === 107) {
      // EQUAL SIGN or ADD
      z = -1; // `=` - zoom in (equal sign on US layout is under `+`)
    }

    if (filterKey(e, x, y, z)) {
      // They don't want us to handle the key: https://github.com/anvaka/panzoom/issues/45
      return;
    }

    if (x || y) {
      e.preventDefault();
      e.stopPropagation();

      let clientRect = owner.getBoundingClientRect();
      // movement speed should be the same in both X and Y direction:
      let offset = Math.min(clientRect.width, clientRect.height);
      let moveSpeedRatio = 0.05;
      let dx = offset * moveSpeedRatio * x;
      let dy = offset * moveSpeedRatio * y;

      // TODO: currently we do not animate this. It could be better to have animation
      internalMoveBy(dx, dy);
    }

    if (z) {
      let scaleMultiplier = getScaleMultiplier(z * 100);
      let offset = transformOrigin ? getTransformOriginOffset() : midPoint();
      publicZoomTo(offset.x, offset.y, scaleMultiplier);
    }
  }

  function midPoint() {
    let ownerRect = owner.getBoundingClientRect();
    return {
      x: ownerRect.width / 2,
      y: ownerRect.height / 2
    };
  }

  function onTouch(e) {
    // let them override the touch behavior
    beforeTouch(e);
    clearPendingClickEventTimeout();

    if (e.touches.length === 1) {
      return handleSingleFingerTouch(e, e.touches[0]);
    } else if (e.touches.length === 2) {
      // handleTouchMove() will care about pinch zoom.
      pinchZoomLength = getPinchZoomLength(e.touches[0], e.touches[1]);
      multiTouch = true;
      startTouchListenerIfNeeded();
    }
  }

  function beforeTouch(e) {
    // TODO: Need to unify this filtering names. E.g. use `beforeTouch`
    if (options.onTouch && !options.onTouch(e)) {
      // if they return `false` from onTouch, we don't want to stop
      // events propagation. Fixes https://github.com/anvaka/panzoom/issues/12
      return;
    }

    e.stopPropagation();
    e.preventDefault();
  }

  function beforeDoubleClick(e) {
    clearPendingClickEventTimeout();

    // TODO: Need to unify this filtering names. E.g. use `beforeDoubleClick``
    if (options.onDoubleClick && !options.onDoubleClick(e)) {
      // if they return `false` from onTouch, we don't want to stop
      // events propagation. Fixes https://github.com/anvaka/panzoom/issues/46
      return;
    }

    e.preventDefault();
    e.stopPropagation();
  }

  function handleSingleFingerTouch(e) {
    lastTouchStartTime = new Date();
    let touch = e.touches[0];
    let offset = getOffsetXY(touch);
    lastSingleFingerOffset = offset;
    let point = transformToScreen(offset.x, offset.y);
    mouseX = point.x;
    mouseY = point.y;
    clickX = mouseX;
    clickY = mouseY;

    smoothScroll.cancel();
    startTouchListenerIfNeeded();
  }

  function startTouchListenerIfNeeded() {
    if (touchInProgress) {
      // no need to do anything, as we already listen to events;
      return;
    }

    touchInProgress = true;
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
  }

  function handleTouchMove(e) {
    if (e.touches.length === 1) {
      e.stopPropagation();
      let touch = e.touches[0];

      let offset = getOffsetXY(touch);
      let point = transformToScreen(offset.x, offset.y);

      let dx = point.x - mouseX;
      let dy = point.y - mouseY;

      if (dx !== 0 && dy !== 0) {
        triggerPanStart();
      }
      mouseX = point.x;
      mouseY = point.y;
      internalMoveBy(dx, dy);
    } else if (e.touches.length === 2) {
      // it's a zoom, let's find direction
      multiTouch = true;
      let t1 = e.touches[0];
      let t2 = e.touches[1];
      let currentPinchLength = getPinchZoomLength(t1, t2);

      // since the zoom speed is always based on distance from 1, we need to apply
      // pinch speed only on that distance from 1:
      let scaleMultiplier =
        1 + (currentPinchLength / pinchZoomLength - 1) * pinchSpeed;

      let firstTouchPoint = getOffsetXY(t1);
      let secondTouchPoint = getOffsetXY(t2);
      mouseX = (firstTouchPoint.x + secondTouchPoint.x) / 2;
      mouseY = (firstTouchPoint.y + secondTouchPoint.y) / 2;
      if (transformOrigin) {
        let offset = getTransformOriginOffset();
        mouseX = offset.x;
        mouseY = offset.y;
      }

      publicZoomTo(mouseX, mouseY, scaleMultiplier);

      pinchZoomLength = currentPinchLength;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  function clearPendingClickEventTimeout() {
    if (pendingClickEventTimeout) {
      clearTimeout(pendingClickEventTimeout);
      pendingClickEventTimeout = 0;
    }
  }

  function handlePotentialClickEvent(e) {
    // we could still be in the double tap mode, let's wait until double tap expires,
    // and then notify:
    if (!options.onClick) return;
    clearPendingClickEventTimeout();
    let dx = mouseX - clickX;
    let dy = mouseY - clickY;
    let l = Math.sqrt(dx * dx + dy * dy);
    if (l > 5) return; // probably they are panning, ignore it

    pendingClickEventTimeout = setTimeout(function() {
      pendingClickEventTimeout = 0;
      options.onClick(e);
    }, doubleTapSpeedInMS);
  }

  function handleTouchEnd(e) {
    clearPendingClickEventTimeout();
    if (e.touches.length > 0) {
      let offset = getOffsetXY(e.touches[0]);
      let point = transformToScreen(offset.x, offset.y);
      mouseX = point.x;
      mouseY = point.y;
    } else {
      let now = new Date();
      if (now - lastTouchEndTime < doubleTapSpeedInMS) {
        // They did a double tap here
        if (transformOrigin) {
          let offset = getTransformOriginOffset();
          if ( linkAspect ) {
            smoothZoom(offset.x, offset.y, zoomDoubleClickSpeed);            
          } else {
            let xypair = { x : zoomDoubleClickSpeed, y : zoomDoubleClickSpeed }
            smoothZoom(offset.x, offset.y, xypair);            
          }
        } else {
          // We want untransformed x/y here.
          if ( linkAspect ) {
            smoothZoom(lastSingleFingerOffset.x, lastSingleFingerOffset.y, zoomDoubleClickSpeed);            
          } else {
            let xypair = { x : zoomDoubleClickSpeed, y : zoomDoubleClickSpeed }
            smoothZoom(lastSingleFingerOffset.x, lastSingleFingerOffset.y, xypair);            
          }
        }
      } else if (now - lastTouchStartTime < clickEventTimeInMS) {
        handlePotentialClickEvent(e);
      }

      lastTouchEndTime = now;

      triggerPanEnd();
      releaseTouches();
    }
  }

  function getPinchZoomLength(finger1, finger2) {
    let dx = finger1.clientX - finger2.clientX;
    let dy = finger1.clientY - finger2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onDoubleClick(e) {
    beforeDoubleClick(e);
    let offset = getOffsetXY(e);
    if (transformOrigin) {
      // TODO: looks like this is duplicated in the file.
      // Need to refactor
      offset = getTransformOriginOffset();
    }
    if ( linkAspect ) {
      smoothZoom(offset.x, offset.y, zoomDoubleClickSpeed);
    } else {
      let ratio = { x : zoomDoubleClickSpeed, y: zoomDoubleClickSpeed }
      smoothZoom(offset.x, offset.y, ratio);
    }
  }

  function onMouseDown(e) {
    clearPendingClickEventTimeout();

    // if client does not want to handle this event - just ignore the call
    if (beforeMouseDown(e)) return;

    lastMouseDownedEvent = e;
    lastMouseDownTime = new Date();

    if (touchInProgress) {
      // modern browsers will fire mousedown for touch events too
      // we do not want this: touch is handled separately.
      e.stopPropagation();
      return false;
    }
    // for IE, left click == 1
    // for Firefox, left click == 0
    let isLeftButton =
      (e.button === 1 && window.event !== null) || e.button === 0;
    if (!isLeftButton) return;

    smoothScroll.cancel();

    let offset = getOffsetXY(e);
    let point = transformToScreen(offset.x, offset.y);
    clickX = mouseX = point.x;
    clickY = mouseY = point.y;

    // We need to listen on document itself, since mouse can go outside of the
    // window, and we will loose it
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    textSelection.capture(e.target || e.srcElement);

    return false;
  }

  function onMouseMove(e) {
    // no need to worry about mouse events when touch is happening
    if (touchInProgress) return;

    triggerPanStart();

    let offset = getOffsetXY(e);
    let point = transformToScreen(offset.x, offset.y);
    let dx = point.x - mouseX;
    let dy = point.y - mouseY;

    mouseX = point.x;
    mouseY = point.y;

    internalMoveBy(dx, dy);
  }

  function onMouseUp() {
    let now = new Date();
    if (now - lastMouseDownTime < clickEventTimeInMS) handlePotentialClickEvent(lastMouseDownedEvent);
    textSelection.release();
    triggerPanEnd();
    releaseDocumentMouse();
  }

  function releaseDocumentMouse() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    panstartFired = false;
  }

  function releaseTouches() {
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);
    panstartFired = false;
    multiTouch = false;
    touchInProgress = false;
  }

  function onMouseWheel(e) {
    // if client does not want to handle this event - just ignore the call
    if (beforeWheel(e)) return;

    smoothScroll.cancel();

    let delta = e.deltaY;
    if (e.deltaMode > 0) delta *= 100;

    let scaleMultiplier = getScaleMultiplier(delta);

    if (scaleMultiplier !== 1) {
      let offset = transformOrigin
        ? getTransformOriginOffset()
        : getOffsetXY(e);
      publicZoomTo(offset.x, offset.y, scaleMultiplier);
      e.preventDefault();
    }
  }

  function getOffsetXY(e) {
    let offsetX, offsetY;
    // I tried using e.offsetX, but that gives wrong results for svg, when user clicks on a path.
    let ownerRect = owner.getBoundingClientRect();
    offsetX = e.clientX - ownerRect.left;
    offsetY = e.clientY - ownerRect.top;

    return { x: offsetX, y: offsetY };
  }

  function smoothZoom(clientX, clientY, scaleMultiplier) {
    if ( linkAspect ) {
      let fromValue = transform.scale;
      let from = { scale: fromValue };
      let to = { scale: scaleMultiplier * fromValue };
  
      smoothScroll.cancel();
      cancelZoomAnimation();
  
      zoomToAnimation = animate(from, to, {
        step:  (v) => {
          zoomAbs(clientX, clientY, v.scale);
        },
        done: triggerZoomEnd
      });  
    } else {
      let fromValueX = transform.scaleX;
      let fromValueY = transform.scaleY;
      let from = { x: fromValueX, y: fromValueY };
      let to = false
      
      if ( typeof scaleMultiplier === 'number' ) {
        to = { x : (scaleMultiplier * fromValueX), y : (scaleMultiplier * fromValueY) };
      } else {
        to = { x : (scaleMultiplier.x * fromValueX), y : (scaleMultiplier.y * fromValueY) };
      }
  
      smoothScroll.cancel();
      cancelZoomAnimation();
  
      zoomToAnimation = animate(from, to, {
        step:  (v) => {
          zoomAbs(clientX, clientY, v);
        },
        done: triggerZoomEnd
      });
    }
  }

  function smoothZoomAbs(clientX, clientY, toScaleValue) {
    if ( linkAspect ) {
      let fromValue = transform.scale;
      let from = { scale: fromValue };
      let to = { scale: toScaleValue };

      smoothScroll.cancel();
      cancelZoomAnimation();

      zoomToAnimation = animate(from, to, {
        step: (v) => {
          zoomAbs(clientX, clientY, v.scale);
        }
      });
    } else if ( toScaleValue >= 0.0005 ) {
      let fromValueX = transform.scaleX;
      let fromValueY = transform.scaleY;
      let from = { x: fromValueX, y: fromValueY };

      let xdif = Math.abs(fromValueX - toScaleValue)/toScaleValue
      let ydif = Math.abs(fromValueY - toScaleValue)/toScaleValue


      let to = { x : xdif, y :ydif };

      smoothScroll.cancel();
      cancelZoomAnimation();

      zoomToAnimation = animate(from, to, {
        step: (v) => {
          zoomAbs(clientX, clientY, v);
        }
      });
    }
  }

  function getTransformOriginOffset() {
    let ownerRect = owner.getBoundingClientRect();
    return {
      x: ownerRect.width * transformOrigin.x,
      y: ownerRect.height * transformOrigin.y
    };
  }

  function publicZoomTo(clientX, clientY, scaleMultiplier) {
    smoothScroll.cancel();
    cancelZoomAnimation();
    if ( linkAspect ) {
      return zoomByRatio(clientX, clientY, scaleMultiplier);
    } else {
      if (  typeof scaleMultiplier === 'number' ) {
        return zoomByRatio(clientX, clientY, { x : scaleMultiplier, y: scaleMultiplier });
      } else {
        return zoomByRatio(clientX, clientY, { x : scaleMultiplier.x, y: scaleMultiplier.y });
      }
    }
  }

  function cancelZoomAnimation() {
    if (zoomToAnimation) {
      zoomToAnimation.cancel();
      zoomToAnimation = null;
    }
  }

  function getScaleMultiplier(delta) {
    let sign = Math.sign(delta);
    let deltaAdjustedSpeed = Math.min(0.25, Math.abs(speed * delta / 128));
    return 1 - sign * deltaAdjustedSpeed;
  }

  function triggerPanStart() {
    if (!panstartFired) {
      triggerEvent('panstart');
      panstartFired = true;
      smoothScroll.start();
    }
  }

  function triggerPanEnd() {
    if (panstartFired) {
      // we should never run smooth scrolling if it was multiTouch (pinch zoom animation):
      if (!multiTouch) smoothScroll.stop();
      triggerEvent('panend');
    }
  }

  function triggerDecelerateToZero() {
    if ( smoothScroll.stop !== noop ) {
      triggerEvent('decelerated-to-zero');
    }
  }

  function triggerZoomEnd() {
    triggerEvent('zoomend');
  }

  function triggerEvent(name) {
    api.fire(name, api);
  }
}

function parseTransformOrigin(options) {
  if (!options) return;
  if (typeof options === 'object') {
    if (!isNumber(options.x) || !isNumber(options.y))
      failTransformOrigin(options);
    return options;
  }

  failTransformOrigin();
}

function failTransformOrigin(options) {
  console.error(options);
  throw new Error(
    [
      'Cannot parse transform origin.',
      'Some good examples:',
      '  "center center" can be achieved with {x: 0.5, y: 0.5}',
      '  "top center" can be achieved with {x: 0.5, y: 0}',
      '  "bottom right" can be achieved with {x: 1, y: 1}'
    ].join('\n')
  );
}

 

function setPreserveAspect(state) {
  if ( typeof state === "boolean" ) linkAspect = state
}


function noop() { }

function validateBounds(bounds) {
  let boundsType = typeof bounds;
  if (boundsType === 'undefined' || boundsType === 'boolean') return; // this is okay
  // otherwise need to be more thorough:
  let validBounds =
    isNumber(bounds.left) &&
    isNumber(bounds.top) &&
    isNumber(bounds.bottom) &&
    isNumber(bounds.right);

  if (!validBounds)
    throw new Error(
      'Bounds object is not valid. It can be: ' +
      'undefined, boolean (true|false) or an object {left, top, right, bottom}'
    );
}

function isNumber(x) {
  return Number.isFinite(x);
}

// IE 11 does not support isNaN:
function isNaN(value) {
  if (Number.isNaN) {
    return Number.isNaN(value);
  }

  return value !== value;
}

function rigidScroll() {
  return {
    start: noop,
    stop: noop,
    cancel: noop
  };
}

function autoRun() {
  if (typeof document === 'undefined') return;

  let scripts = document.getElementsByTagName('script');
  if (!scripts) return;
  let panzoomScript;

  for (let i = 0; i < scripts.length; ++i) {
    let x = scripts[i];
    if (x.src && x.src.match(/\bpanzoom(\.min)?\.js/)) {
      panzoomScript = x;
      break;
    }
  }

  if (!panzoomScript) return;

  let query = panzoomScript.getAttribute('query');
  if (!query) return;

  let globalName = panzoomScript.getAttribute('name') || 'pz';
  let started = Date.now();

  tryAttach();

  function tryAttach() {
    let el = document.querySelector(query);
    if (!el) {
      let now = Date.now();
      let elapsed = now - started;
      if (elapsed < 2000) {
        // Let's wait a bit
        setTimeout(tryAttach, 100);
        return;
      }
      // If we don't attach within 2 seconds to the target element, consider it a failure
      console.error('Cannot find the panzoom element', globalName);
      return;
    }
    let options = collectOptions(panzoomScript);
    console.log(options);
    window[globalName] = createPanZoom(el, options);
  }

  function collectOptions(script) {
    let attrs = script.attributes;
    let options = {};
    for (let j = 0; j < attrs.length; ++j) {
      let attr = attrs[j];
      let nameValue = getPanzoomAttributeNameValue(attr);
      if (nameValue) {
        options[nameValue.name] = nameValue.value;
      }
    }

    return options;
  }

  function getPanzoomAttributeNameValue(attr) {
    if (!attr.name) return;
    let isPanZoomAttribute =
      attr.name[0] === 'p' && attr.name[1] === 'z' && attr.name[2] === '-';

    if (!isPanZoomAttribute) return;

    let name = attr.name.substr(3);
    let value = JSON.parse(attr.value);
    return { name: name, value: value };
  }
}

module.exports = createPanZoom;


autoRun();
	