(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.panzoom = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

/* globals SVGElement */
/**
 * Allows to drag and zoom svg elements
 */
var wheel = require('wheel')
var animate = require('amator')
var eventify = require('ngraph.events');
var kinetic = require('./lib/kinetic.js')
var preventTextSelection = require('./lib/textSelectionInterceptor.js')()
var Transform = require('./lib/transform.js');
var makeSvgController = require('./lib/svgController.js')
var makeDomController = require('./lib/domController.js')

var defaultZoomSpeed = 0.065
var defaultDoubleTapZoomSpeed = 1.75
var doubleTapSpeedInMS = 300

module.exports = createPanZoom

function sanitizeInstructions(instructions = { ignore: false, propagate: false }) {
  if (typeof instructions === 'boolean') {
    instructions = { ignore: instructions, propagate: instructions };
  }

  if (typeof instructions.propagate === 'undefined') {
    instructions.propagate = instructions.ignore;
  }
  return instructions;
}
/**
 * Creates a new instance of panzoom, so that an object can be panned and zoomed
 *
 * @param {DOMElement} domElement where panzoom should be attached.
 * @param {Object} options that configure behavior.
 */
function createPanZoom(domElement, options) {
  options = options || {}

  var panController = options.controller

  if (!panController) {
    if (domElement instanceof SVGElement) {
      panController = makeSvgController(domElement)
    }

    if (domElement instanceof HTMLElement) {
      panController = makeDomController(domElement)
    }
  }

  if (!panController) {
    throw new Error('Cannot create panzoom for the current type of dom element')
  }
  var owner = panController.getOwner()
  // just to avoid GC pressure, every time we do intermediate transform
  // we return this object. For internal use only. Never give it back to the consumer of this library
  var storedCTMResult = {x: 0, y: 0}

  var isDirty = false
  var transform = new Transform()

  if (panController.initTransform) {
    panController.initTransform(transform)
  }

  var realPinch = typeof options.realPinch === 'boolean' ? options.realPinch : false
  var bounds = options.bounds
  var maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : Number.POSITIVE_INFINITY
  var minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0

  var boundsPadding = typeof options.boundsPadding === 'number' ? options.boundsPadding : 0.05
  var zoomDoubleClickSpeed = typeof options.zoomDoubleClickSpeed === 'number' ? options.zoomDoubleClickSpeed : defaultDoubleTapZoomSpeed
  var beforeWheel = options.beforeWheel || defaultBeforeHandler;
  var beforeDblClick = options.beforeDblClick || defaultBeforeHandler;
  var beforeMouseDown = options.beforeMouseDown || defaultBeforeMouseDownHandler;
  var beforeTouch = options.beforeTouch || defaultBeforeHandler;
  var beforeKeyDown = options.beforeKeyDown || defaultBeforeHandler;
  var speed = typeof options.zoomSpeed === 'number' ? options.zoomSpeed : defaultZoomSpeed

  validateBounds(bounds)

  if (options.autocenter) {
    autocenter()
  }

  var frameAnimation

  var lastTouchEndTime = 0

  var touchInProgress = false

  // We only need to fire panstart when actual move happens
  var panstartFired = false

  // cache mouse coordinates here
  var mouseX
  var mouseY
  var touches = 0

  var pinchZoomLength

  var smoothScroll
  if ('smoothScroll' in options && !options.smoothScroll) {
    // If user explicitly asked us not to use smooth scrolling, we obey
    smoothScroll = rigidScroll()
  } else {
    // otherwise we use forward smoothScroll settings to kinetic API
    // which makes scroll smoothing.
    smoothScroll = kinetic(getPoint, scroll, options.smoothScroll)
  }

  var moveByAnimation
  var zoomToAnimation

  var multitouch
  var paused = false

  listenForEvents()

  var api = {
    dispose: dispose,
    moveBy: internalMoveBy,
    moveTo: moveTo,
    centerOn: centerOn,
    zoomTo: publicZoomTo,
    zoomAbs: zoomAbs,
    smoothZoom: smoothZoom,
    getTransform: getTransformModel,
    showRectangle: showRectangle,

    pause: pause,
    resume: resume,
    isPaused: isPaused,
  }

  eventify(api);

  return api;

  function pause() {
    releaseEvents()
    paused = true
  }

  function resume() {
    if (paused) {
      listenForEvents()
      paused = false
    }
  }

  function isPaused() {
    return paused;
  }

  function showRectangle(rect) {
    // TODO: this duplicates autocenter. I think autocenter should go.
    var clientRect = owner.getBoundingClientRect()
    var size = transformToScreen(clientRect.width, clientRect.height)

    var rectWidth = rect.right - rect.left
    var rectHeight = rect.bottom - rect.top
    if (!Number.isFinite(rectWidth) || !Number.isFinite(rectHeight)) {
      throw new Error('Invalid rectangle');
    }

    var dw = size.x/rectWidth
    var dh = size.y/rectHeight
    var scale = Math.min(dw, dh)
    transform.x = -(rect.left + rectWidth/2) * scale + size.x/2
    transform.y = -(rect.top + rectHeight/2) * scale + size.y/2
    transform.scale = scale
  }

  function transformToScreen(x, y) {
    if (panController.getScreenCTM) {
      var parentCTM = panController.getScreenCTM()
      var parentScaleX = parentCTM.a
      var parentScaleY = parentCTM.d
      var parentOffsetX = parentCTM.e
      var parentOffsetY = parentCTM.f
      storedCTMResult.x = x * parentScaleX - parentOffsetX
      storedCTMResult.y = y * parentScaleY - parentOffsetY
    } else {
      storedCTMResult.x = x
      storedCTMResult.y = y
    }

    return storedCTMResult
  }

  function autocenter() {
    var w // width of the parent
    var h // height of the parent
    var left = 0
    var top = 0
    var sceneBoundingBox = getBoundingBox()
    if (sceneBoundingBox) {
      // If we have bounding box - use it.
      left = sceneBoundingBox.left
      top = sceneBoundingBox.top
      w = sceneBoundingBox.right - sceneBoundingBox.left
      h = sceneBoundingBox.bottom - sceneBoundingBox.top
    } else {
      // otherwise just use whatever space we have
      var ownerRect = owner.getBoundingClientRect();
      w = ownerRect.width
      h = ownerRect.height
    }
    var bbox = panController.getBBox()
    if (bbox.width === 0 || bbox.height === 0) {
      // we probably do not have any elements in the SVG
      // just bail out;
      return;
    }
    var dh = h/bbox.height
    var dw = w/bbox.width
    var scale = Math.min(dw, dh)
    transform.x = -(bbox.left + bbox.width/2) * scale + w/2 + left
    transform.y = -(bbox.top + bbox.height/2) * scale + h/2 + top
    transform.scale = scale
  }

  function getTransformModel() {
    // TODO: should this be read only?
    return transform
  }

  function getPoint() {
    return {
      x: transform.x,
      y: transform.y
    }
  }

  function moveTo(x, y) {
    transform.x = x
    transform.y = y

    keepTransformInsideBounds()

    triggerEvent('pan')
    makeDirty()
  }

  function moveBy(dx, dy) {
    moveTo(transform.x + dx, transform.y + dy)
  }

  function keepTransformInsideBounds() {
    var boundingBox = getBoundingBox()
    if (!boundingBox) return

    var adjusted = false
    var clientRect = getClientRect()

    var diff = boundingBox.left - clientRect.right
    if (diff > 0) {
      transform.x += diff
      adjusted = true
    }
    // check the other side:
    diff = boundingBox.right - clientRect.left
    if (diff < 0) {
      transform.x += diff
      adjusted = true
    }

    // y axis:
    diff = boundingBox.top - clientRect.bottom
    if (diff > 0) {
      // we adjust transform, so that it matches exactly our bounding box:
      // transform.y = boundingBox.top - (boundingBox.height + boundingBox.y) * transform.scale =>
      // transform.y = boundingBox.top - (clientRect.bottom - transform.y) =>
      // transform.y = diff + transform.y =>
      transform.y += diff
      adjusted = true
    }

    diff = boundingBox.bottom - clientRect.top
    if (diff < 0) {
      transform.y += diff
      adjusted = true
    }
    return adjusted
  }

  /**
   * Returns bounding box that should be used to restrict scene movement.
   */
  function getBoundingBox() {
    if (!bounds) return // client does not want to restrict movement

    if (typeof bounds === 'boolean') {
      // for boolean type we use parent container bounds
      var ownerRect = owner.getBoundingClientRect()
      var sceneWidth = ownerRect.width
      var sceneHeight = ownerRect.height

      return {
        left: sceneWidth * boundsPadding,
        top: sceneHeight * boundsPadding,
        right: sceneWidth * (1 - boundsPadding),
        bottom: sceneHeight * (1 - boundsPadding),
      }
    }

    return bounds
  }

  function getClientRect() {
    var bbox = panController.getBBox()
    var leftTop = client(bbox.left, bbox.top)

    return {
      left: leftTop.x,
      top: leftTop.y,
      right: bbox.width * transform.scale + leftTop.x,
      bottom: bbox.height * transform.scale + leftTop.y
    }
  }

  function client(x, y) {
    return {
      x: (x * transform.scale) + transform.x,
      y: (y * transform.scale) + transform.y
    }
  }

  function makeDirty() {
    isDirty = true
    frameAnimation = window.requestAnimationFrame(frame)
  }

  function zoomByRatio(clientX, clientY, ratio) {
    if (isNaN(clientX) || isNaN(clientY) || isNaN(ratio)) {
      throw new Error('zoom requires valid numbers')
    }

    var newScale = transform.scale * ratio

    if (newScale < minZoom) {
      if (transform.scale === minZoom) return;

      ratio = minZoom / transform.scale
    }
    if (newScale > maxZoom) {
      if (transform.scale === maxZoom) return;

      ratio = maxZoom / transform.scale
    }

    var size = transformToScreen(clientX, clientY)

    transform.x = size.x - ratio * (size.x - transform.x)
    transform.y = size.y - ratio * (size.y - transform.y)

    var transformAdjusted = keepTransformInsideBounds()
    if (!transformAdjusted) transform.scale *= ratio

    triggerEvent('zoom')

    makeDirty()
  }

  function zoomAbs(clientX, clientY, zoomLevel) {
    var ratio = zoomLevel / transform.scale
    zoomByRatio(clientX, clientY, ratio)
  }

  function centerOn(ui) {
    var parent = ui.ownerSVGElement
    if (!parent) throw new Error('ui element is required to be within the scene')

    // TODO: should i use controller's screen CTM?
    var clientRect = ui.getBoundingClientRect()
    var cx = clientRect.left + clientRect.width/2
    var cy = clientRect.top + clientRect.height/2

    var container = parent.getBoundingClientRect()
    var dx = container.width/2 - cx
    var dy = container.height/2 - cy

    internalMoveBy(dx, dy, true)
  }

  function internalMoveBy(dx, dy, smooth) {
    if (!smooth) {
      return moveBy(dx, dy)
    }

    if (moveByAnimation) moveByAnimation.cancel()

    var from = { x: 0, y: 0 }
    var to = { x: dx, y : dy }
    var lastX = 0
    var lastY = 0

    moveByAnimation = animate(from, to, {
      step: function(v) {
        moveBy(v.x - lastX, v.y - lastY)

        lastX = v.x
        lastY = v.y
      }
    })
  }

  function scroll(x, y) {
    cancelZoomAnimation()
    moveTo(x, y)
  }

  function dispose() {
    releaseEvents();
  }

  function listenForEvents() {
    owner.addEventListener('mousedown', onMouseDown)
    owner.addEventListener('dblclick', onDoubleClick)
    owner.addEventListener('touchstart', onTouch, { passive: false })
    owner.addEventListener('keydown', onKeyDown)

    // Need to listen on the owner container, so that we are not limited
    // by the size of the scrollable domElement
    wheel.addWheelListener(owner, onMouseWheel)

    makeDirty()
  }

  function releaseEvents() {
    wheel.removeWheelListener(owner, onMouseWheel)
    owner.removeEventListener('mousedown', onMouseDown)
    owner.removeEventListener('keydown', onKeyDown)
    owner.removeEventListener('dblclick', onDoubleClick)
    owner.removeEventListener('touchstart', onTouch)

    if (frameAnimation) {
      window.cancelAnimationFrame(frameAnimation)
      frameAnimation = 0
    }

    smoothScroll.cancel()

    releaseDocumentMouse()
    releaseTouches()

    triggerPanEnd()

    api.off()
  }


  function frame() {
    if (isDirty) applyTransform()
  }

  function applyTransform() {
    isDirty = false

    // TODO: Should I allow to cancel this?
    panController.applyTransform(transform)

    triggerEvent('transform')
    frameAnimation = 0
  }

  function onKeyDown(e) {
    var instructions = sanitizeInstructions(sanitizeInstructions(beforeKeyDown(e)));
  
    if (!instructions.propagate) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (instructions.ignore) return;

    var x = 0, y = 0, z = 0
    if (e.keyCode === 38) {
      y = 1 // up
    } else if (e.keyCode === 40) {
      y = -1 // down
    } else if (e.keyCode === 37) {
      x = 1 // left
    } else if (e.keyCode === 39) {
      x = -1 // right
    } else if (e.keyCode === 189 || e.keyCode === 109) { // DASH or SUBTRACT
      z = 1 // `-` -  zoom out
    } else if (e.keyCode === 187 || e.keyCode === 107) { // EQUAL SIGN or ADD
      z = -1 // `=` - zoom in (equal sign on US layout is under `+`)
    }

    if (x || y) {
      var clientRect = owner.getBoundingClientRect()
      // movement speed should be the same in both X and Y direction:
      var offset = Math.min(clientRect.width, clientRect.height)
      var moveSpeedRatio = 0.05
      var dx = offset * moveSpeedRatio * x
      var dy = offset * moveSpeedRatio * y

      // TODO: currently we do not animate this. It could be better to have animation
      internalMoveBy(dx, dy)
    }

    if (z) {
      var scaleMultiplier = getScaleMultiplier(z)
      var ownerRect = owner.getBoundingClientRect()
      publicZoomTo(ownerRect.width/2, ownerRect.height/2, scaleMultiplier)
    }
  }

  function onTouch(e) {
    var instructions = sanitizeInstructions(beforeTouch(e));
 
    if (!instructions.propagate) {
      e.stopPropagation()
      e.preventDefault()
    }

    if (instructions.ignore) return;
    cacheTouchData(e);
    startTouchListenerIfNeeded();
  }

  function cacheTouchData(e) {
    touches = e.touches;
    var offset = getAverageOffset(e.touches);
    mouseX = offset.x
    mouseY = offset.y
    if (e.touches.length > 1) {
      pinchZoomLength = getPinchZoomLength(e.touches[0], e.touches[1]);
    }
    multitouch = touches.length > 1;
  }

  function startTouchListenerIfNeeded() {
    if (!touchInProgress) {
      touchInProgress = true
      smoothScroll.cancel()
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd, { passive: false })
      document.addEventListener('touchcancel', handleTouchEnd, { passive: false })
    }
  }

  function handleTouchMove(e) {
    if (touches.length !== e.touches.length) {
      cacheTouchData(e);
    }

    e.stopPropagation()
    e.preventDefault()

    var offset = getAverageOffset(e.touches);
    var dx = offset.x - mouseX
    var dy = offset.y - mouseY
    if (dx !== 0 && dy !== 0) {
      triggerPanStart()
    }
    mouseX = offset.x
    mouseY = offset.y
    var point = transformToScreen(dx, dy)
    internalMoveBy(point.x, point.y)

    if (multitouch) {
      var t1 = e.touches[0]
      var t2 = e.touches[1]
      var currentPinchLength = getPinchZoomLength(t1, t2)
      var scaleMultiplier = 1

      if (realPinch) {
        scaleMultiplier = currentPinchLength / pinchZoomLength
      } else {
        var delta = 0
        if (currentPinchLength < pinchZoomLength) {
          delta = 1
        } else if (currentPinchLength > pinchZoomLength) {
          delta = -1
        }

        scaleMultiplier = getScaleMultiplier(delta)
      }
      publicZoomTo(mouseX, mouseY, scaleMultiplier)
      pinchZoomLength = currentPinchLength
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length > 0) {
      var offset = getOffsetXY(e.touches[0])
      mouseX = offset.x
      mouseY = offset.y
    } else {
      var now = new Date()
      if (now - lastTouchEndTime < doubleTapSpeedInMS) {
        smoothZoom(mouseX, mouseY, zoomDoubleClickSpeed)
      }

      lastTouchEndTime = now

      touchInProgress = false
      triggerPanEnd()
      releaseTouches()
    }
  }

  function getPinchZoomLength(finger1, finger2) {
    return Math.sqrt((finger1.clientX - finger2.clientX) * (finger1.clientX - finger2.clientX) +
      (finger1.clientY - finger2.clientY) * (finger1.clientY - finger2.clientY))
  }

  function onDoubleClick(e) {
    var instructions = sanitizeInstructions(beforeDblClick(e));
 
    if (!instructions.propagate) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (instructions.ignore) return;

    var offset = getOffsetXY(e)
    smoothZoom(offset.x, offset.y, zoomDoubleClickSpeed)
  }

  function onMouseDown(e) {
    if (touchInProgress) {
      // modern browsers will fire mousedown for touch events too
      // we do not want this: touch is handled separately.
      e.stopPropagation()
      return false
    }

    var instructions = sanitizeInstructions(beforeMouseDown(e));
 
    if (!instructions.propagate) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (instructions.ignore) return;

    smoothScroll.cancel()

    var offset = getOffsetXY(e);
    var point = transformToScreen(offset.x, offset.y)
    mouseX = point.x
    mouseY = point.y

    // We need to listen on document itself, since mouse can go outside of the
    // window, and we will loose it
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    preventTextSelection.capture(e.target || e.srcElement)

    return false
  }

  function onMouseMove(e) {
    // no need to worry about mouse events when touch is happening
    if (touchInProgress) return

    triggerPanStart()

    var offset = getOffsetXY(e);
    var point = transformToScreen(offset.x, offset.y)
    var dx = point.x - mouseX
    var dy = point.y - mouseY

    mouseX = point.x
    mouseY = point.y

    internalMoveBy(dx, dy)
  }

  function onMouseUp() {
    preventTextSelection.release()
    triggerPanEnd()
    releaseDocumentMouse()
  }

  function releaseDocumentMouse() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    panstartFired = false
  }

  function releaseTouches() {
    document.removeEventListener('touchmove', handleTouchMove)
    document.removeEventListener('touchend', handleTouchEnd)
    document.removeEventListener('touchcancel', handleTouchEnd)
    panstartFired = false
    multitouch = false
  }

  function onMouseWheel(e) {
    // if client does not want to handle this event - just ignore the call
    var instructions = sanitizeInstructions(beforeWheel(e));

    if (instructions.ignore) return

    smoothScroll.cancel()

    var scaleMultiplier = getScaleMultiplier(e.deltaY)

    if (scaleMultiplier !== 1) {
      var offset = getOffsetXY(e)
      publicZoomTo(offset.x, offset.y, scaleMultiplier)
      if (!instructions.propagate) {
        e.preventDefault()
      }
    }
  }

  function getAverageOffset(touches) {
    var averageX = 0;
    var averageY = 0;
    for (var i = 0; i < touches.length; i++) {
      averageX += touches[i].clientX;
      averageY += touches[i].clientY;
    }
    
    return getOffsetXY({ clientX: averageX / touches.length, clientY: averageY / touches.length });
  }

  function getOffsetXY(e) {
    var offsetX, offsetY;
    // I tried using e.offsetX, but that gives wrong results for svg, when user clicks on a path.
    var ownerRect = owner.getBoundingClientRect();
    offsetX = e.clientX - ownerRect.left
    offsetY = e.clientY - ownerRect.top

    return { x: offsetX, y: offsetY };
  }

  function smoothZoom(clientX, clientY, scaleMultiplier) {
      var fromValue = transform.scale
      var from = {scale: fromValue}
      var to = {scale: scaleMultiplier * fromValue}

      smoothScroll.cancel()
      cancelZoomAnimation()

      zoomToAnimation = animate(from, to, {
        step: function(v) {
          zoomAbs(clientX, clientY, v.scale)
        }
      })
  }

  function publicZoomTo(clientX, clientY, scaleMultiplier) {
      smoothScroll.cancel()
      cancelZoomAnimation()
      return zoomByRatio(clientX, clientY, scaleMultiplier)
  }

  function cancelZoomAnimation() {
      if (zoomToAnimation) {
          zoomToAnimation.cancel()
          zoomToAnimation = null
      }
  }

  function getScaleMultiplier(delta) {
    var scaleMultiplier = 1
    if (delta > 0) { // zoom out
      scaleMultiplier = (1 - speed)
    } else if (delta < 0) { // zoom in
      scaleMultiplier = (1 + speed)
    }

    return scaleMultiplier
  }

  function triggerPanStart() {
    if (!panstartFired) {
      triggerEvent('panstart')
      panstartFired = true
      smoothScroll.start()
    }
  }

  function triggerPanEnd() {
    if (panstartFired) {
      // we should never run smooth scrolling if it was multitouch (pinch zoom animation):
      if (!multitouch) smoothScroll.stop()
      triggerEvent('panend')
    }
  }

  function triggerEvent(name) {
    api.fire(name, api);
  }
}

function noop() { }

function defaultBeforeHandler() { return { ignore: false, propagate: false } }

function defaultBeforeMouseDownHandler(e) {
  // for IE, left click == 1
  // for Firefox, left click == 0
  var isLeftButton = ((e.button === 1 && window.event !== null) || e.button === 0)
  return { ignore: !isLeftButton, propagate: true };
}
createPanZoom.defaultBeforeMouseDownHandler = defaultBeforeMouseDownHandler;


function validateBounds(bounds) {
  var boundsType = typeof bounds
  if (boundsType === 'undefined' || boundsType === 'boolean') return // this is okay
  // otherwise need to be more thorough:
  var validBounds = isNumber(bounds.left) && isNumber(bounds.top) &&
    isNumber(bounds.bottom) && isNumber(bounds.right)

  if (!validBounds) throw new Error('Bounds object is not valid. It can be: ' +
    'undefined, boolean (true|false) or an object {left, top, right, bottom}')
}

function isNumber(x) {
  return Number.isFinite(x)
}

// IE 11 does not support isNaN:
function isNaN(value) {
  if (Number.isNaN) {
    return Number.isNaN(value)
  }

  return value !== value
}

function rigidScroll() {
  return {
    start: noop,
    stop: noop,
    cancel: noop
  }
}


function autoRun() {
  if (typeof document === 'undefined') return

  var scripts = document.getElementsByTagName('script');
  if (!scripts) return;
  var panzoomScript;

  Array.from(scripts).forEach(function(x) {
    if (x.src && x.src.match(/\bpanzoom(\.min)?\.js/)) {
      panzoomScript = x
    }
  })

  if (!panzoomScript) return;

  var query = panzoomScript.getAttribute('query')
  if (!query) return;

  var globalName = panzoomScript.getAttribute('name') || 'pz'
  var started = Date.now()

  tryAttach();

  function tryAttach() {
    var el = document.querySelector(query)
    if (!el) {
      var now = Date.now()
      var elapsed = now - started;
      if (elapsed < 2000) {
        // Let's wait a bit
        setTimeout(tryAttach, 100);
        return;
      }
      // If we don't attach within 2 seconds to the target element, consider it a failure
      console.error('Cannot find the panzoom element', globalName)
      return
    }
    var options = collectOptions(panzoomScript)
    console.log(options)
    window[globalName] = createPanZoom(el, options);
  }

  function collectOptions(script) {
    var attrs = script.attributes;
    var options = {};
    for(var i = 0; i < attrs.length; ++i) {
      var attr = attrs[i];
      var nameValue = getPanzoomAttributeNameValue(attr);
      if (nameValue) {
        options[nameValue.name] = nameValue.value
      }
    }

    return options;
  }

  function getPanzoomAttributeNameValue(attr) {
    if (!attr.name) return;
    var isPanZoomAttribute = attr.name[0] === 'p' && attr.name[1] === 'z' && attr.name[2] === '-';

    if (!isPanZoomAttribute) return;

    var name = attr.name.substr(3)
    var value = JSON.parse(attr.value);
    return {name: name, value: value};
  }
}

autoRun();

},{"./lib/domController.js":2,"./lib/kinetic.js":3,"./lib/svgController.js":4,"./lib/textSelectionInterceptor.js":5,"./lib/transform.js":6,"amator":7,"ngraph.events":9,"wheel":10}],2:[function(require,module,exports){
module.exports = makeDomController

function makeDomController(domElement) {
  var elementValid = (domElement instanceof HTMLElement)
  if (!elementValid) {
    throw new Error('svg element is required for svg.panzoom to work')
  }

  var owner = domElement.parentElement
  if (!owner) {
    throw new Error(
      'Do not apply panzoom to the detached DOM element. '
    )
  }

  domElement.scrollTop = 0;
  owner.setAttribute('tabindex', 1); // TODO: not sure if this is really polite

  var api = {
    getBBox: getBBox,
    getOwner: getOwner,
    applyTransform: applyTransform,
  }
  
  return api

  function getOwner() {
    return owner
  }

  function getBBox() {
    // TODO: We should probably cache this?
    return  {
      left: 0,
      top: 0,
      width: domElement.clientWidth,
      height: domElement.clientHeight
    }
  }

  function applyTransform(transform) {
    // TODO: Should we cache this?
    domElement.style.transformOrigin = '0 0 0';
    domElement.style.transform = 'matrix(' +
      transform.scale + ', 0, 0, ' +
      transform.scale + ', ' +
      transform.x + ', ' + transform.y + ')'
  }
}

},{}],3:[function(require,module,exports){
/**
 * Allows smooth kinetic scrolling of the surface
 */
module.exports = kinetic;

function kinetic(getPoint, scroll, settings) {
  if (typeof settings !== 'object') {
    // setting could come as boolean, we should ignore it, and use an object.
    settings = {}
  }

  var minVelocity = (typeof settings.minVelocity === 'number') ? settings.minVelocity : 5
  var amplitude = (typeof settings.amplitude === 'number') ? settings.amplitude : 0.25

  var lastPoint
  var timestamp
  var timeConstant = 342

  var ticker
  var vx, targetX, ax;
  var vy, targetY, ay;

  var raf

  return {
    start: start,
    stop: stop,
    cancel: dispose
  }

  function dispose() {
    window.clearInterval(ticker)
    window.cancelAnimationFrame(raf)
  }

  function start() {
    lastPoint = getPoint()

    ax = ay = vx = vy = 0
    timestamp = new Date()

    window.clearInterval(ticker)
    window.cancelAnimationFrame(raf)

    // we start polling the point position to accumulate velocity
    // Once we stop(), we will use accumulated velocity to keep scrolling
    // an object.
    ticker = window.setInterval(track, 100);
  }

  function track() {
    var now = Date.now();
    var elapsed = now - timestamp;
    timestamp = now;

    var currentPoint = getPoint()

    var dx = currentPoint.x - lastPoint.x
    var dy = currentPoint.y - lastPoint.y

    lastPoint = currentPoint

    var dt = 1000 / (1 + elapsed)

    // moving average
    vx = 0.8 * dx * dt + 0.2 * vx
    vy = 0.8 * dy * dt + 0.2 * vy
  }

  function stop() {
    window.clearInterval(ticker);
    window.cancelAnimationFrame(raf)

    var currentPoint = getPoint()

    targetX = currentPoint.x
    targetY = currentPoint.y
    timestamp = Date.now()

    if (vx < -minVelocity || vx > minVelocity) {
      ax = amplitude * vx
      targetX += ax
    }

    if (vy < -minVelocity || vy > minVelocity) {
      ay = amplitude * vy
      targetY += ay
    }

    raf = window.requestAnimationFrame(autoScroll);
  }

  function autoScroll() {
    var elapsed = Date.now() - timestamp

    var moving = false
    var dx = 0
    var dy = 0

    if (ax) {
      dx = -ax * Math.exp(-elapsed / timeConstant)

      if (dx > 0.5 || dx < -0.5) moving = true
      else dx = ax = 0
    }

    if (ay) {
      dy = -ay * Math.exp(-elapsed / timeConstant)

      if (dy > 0.5 || dy < -0.5) moving = true
      else dy = ay = 0
    }

    if (moving) {
      scroll(targetX + dx, targetY + dy)
      raf = window.requestAnimationFrame(autoScroll);
    }
  }

}

},{}],4:[function(require,module,exports){
module.exports = makeSvgController

function makeSvgController(svgElement) {
  var elementValid = (svgElement instanceof SVGElement)
  if (!elementValid) {
    throw new Error('svg element is required for svg.panzoom to work')
  }

  var owner = svgElement.ownerSVGElement
  if (!owner) {
    throw new Error(
      'Do not apply panzoom to the root <svg> element. ' +
      'Use its child instead (e.g. <g></g>). ' +
      'As of March 2016 only FireFox supported transform on the root element')
  }

  owner.setAttribute('tabindex', 1); // TODO: not sure if this is really polite

  var api = {
    getBBox: getBBox,
    getScreenCTM: getScreenCTM,
    getOwner: getOwner,
    applyTransform: applyTransform,
    initTransform: initTransform
  }
  
  return api

  function getOwner() {
    return owner
  }

  function getBBox() {
    var bbox =  svgElement.getBBox()
    return {
      left: bbox.x,
      top: bbox.y,
      width: bbox.width,
      height: bbox.height,
    }
  }

  function getScreenCTM() {
    return owner.getScreenCTM()
  }

  function initTransform(transform) {
    var screenCTM = svgElement.getScreenCTM()
    transform.x = screenCTM.e;
    transform.y = screenCTM.f;
    transform.scale = screenCTM.a;
    owner.removeAttributeNS(null, 'viewBox');
  }

  function applyTransform(transform) {
    svgElement.setAttribute('transform', 'matrix(' +
      transform.scale + ' 0 0 ' +
      transform.scale + ' ' +
      transform.x + ' ' + transform.y + ')')
  }
}
},{}],5:[function(require,module,exports){
/**
 * Disallows selecting text.
 */
module.exports = createTextSelectionInterceptor

function createTextSelectionInterceptor() {
  var dragObject
  var prevSelectStart
  var prevDragStart

  return {
    capture: capture,
    release: release
  }

  function capture(domObject) {
    prevSelectStart = window.document.onselectstart
    prevDragStart = window.document.ondragstart

    window.document.onselectstart = disabled

    dragObject = domObject
    dragObject.ondragstart = disabled
  }

  function release() {
    window.document.onselectstart = prevSelectStart
    if (dragObject) dragObject.ondragstart = prevDragStart
  }
}

function disabled(e) {
  e.stopPropagation()
  return false
}

},{}],6:[function(require,module,exports){
module.exports = Transform;

function Transform() {
  this.x = 0;
  this.y = 0;
  this.scale = 1;
}

},{}],7:[function(require,module,exports){
var BezierEasing = require('bezier-easing')

// Predefined set of animations. Similar to CSS easing functions
var animations = {
  ease:  BezierEasing(0.25, 0.1, 0.25, 1),
  easeIn: BezierEasing(0.42, 0, 1, 1),
  easeOut: BezierEasing(0, 0, 0.58, 1),
  easeInOut: BezierEasing(0.42, 0, 0.58, 1),
  linear: BezierEasing(0, 0, 1, 1)
}


module.exports = animate;
module.exports.makeAggregateRaf = makeAggregateRaf;
module.exports.sharedScheduler = makeAggregateRaf();


function animate(source, target, options) {
  var start = Object.create(null)
  var diff = Object.create(null)
  options = options || {}
  // We let clients specify their own easing function
  var easing = (typeof options.easing === 'function') ? options.easing : animations[options.easing]

  // if nothing is specified, default to ease (similar to CSS animations)
  if (!easing) {
    if (options.easing) {
      console.warn('Unknown easing function in amator: ' + options.easing);
    }
    easing = animations.ease
  }

  var step = typeof options.step === 'function' ? options.step : noop
  var done = typeof options.done === 'function' ? options.done : noop

  var scheduler = getScheduler(options.scheduler)

  var keys = Object.keys(target)
  keys.forEach(function(key) {
    start[key] = source[key]
    diff[key] = target[key] - source[key]
  })

  var durationInMs = typeof options.duration === 'number' ? options.duration : 400
  var durationInFrames = Math.max(1, durationInMs * 0.06) // 0.06 because 60 frames pers 1,000 ms
  var previousAnimationId
  var frame = 0

  previousAnimationId = scheduler.next(loop)

  return {
    cancel: cancel
  }

  function cancel() {
    scheduler.cancel(previousAnimationId)
    previousAnimationId = 0
  }

  function loop() {
    var t = easing(frame/durationInFrames)
    frame += 1
    setValues(t)
    if (frame <= durationInFrames) {
      previousAnimationId = scheduler.next(loop)
      step(source)
    } else {
      previousAnimationId = 0
      setTimeout(function() { done(source) }, 0)
    }
  }

  function setValues(t) {
    keys.forEach(function(key) {
      source[key] = diff[key] * t + start[key]
    })
  }
}

function noop() { }

function getScheduler(scheduler) {
  if (!scheduler) {
    var canRaf = typeof window !== 'undefined' && window.requestAnimationFrame
    return canRaf ? rafScheduler() : timeoutScheduler()
  }
  if (typeof scheduler.next !== 'function') throw new Error('Scheduler is supposed to have next(cb) function')
  if (typeof scheduler.cancel !== 'function') throw new Error('Scheduler is supposed to have cancel(handle) function')

  return scheduler
}

function rafScheduler() {
  return {
    next: window.requestAnimationFrame.bind(window),
    cancel: window.cancelAnimationFrame.bind(window)
  }
}

function timeoutScheduler() {
  return {
    next: function(cb) {
      return setTimeout(cb, 1000/60)
    },
    cancel: function (id) {
      return clearTimeout(id)
    }
  }
}

function makeAggregateRaf() {
  var frontBuffer = new Set();
  var backBuffer = new Set();
  var frameToken = 0;

  return {
    next: next,
    cancel: next,
    clearAll: clearAll
  }

  function clearAll() {
    frontBuffer.clear();
    backBuffer.clear();
    cancelAnimationFrame(frameToken);
    frameToken = 0;
  }

  function next(callback) {
    backBuffer.add(callback);
    renderNextFrame();
  }

  function renderNextFrame() {
    if (!frameToken) frameToken = requestAnimationFrame(renderFrame);
  }

  function renderFrame() {
    frameToken = 0;

    var t = backBuffer;
    backBuffer = frontBuffer;
    frontBuffer = t;

    frontBuffer.forEach(function(callback) {
      callback();
    });
    frontBuffer.clear();
  }

  function cancel(callback) {
    backBuffer.delete(callback);
  }
}

},{"bezier-easing":8}],8:[function(require,module,exports){
/**
 * https://github.com/gre/bezier-easing
 * BezierEasing - use bezier curve for transition easing function
 * by Gaëtan Renaudeau 2014 - 2015 – MIT License
 */

// These values are established by empiricism with tests (tradeoff: performance VS precision)
var NEWTON_ITERATIONS = 4;
var NEWTON_MIN_SLOPE = 0.001;
var SUBDIVISION_PRECISION = 0.0000001;
var SUBDIVISION_MAX_ITERATIONS = 10;

var kSplineTableSize = 11;
var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);

var float32ArraySupported = typeof Float32Array === 'function';

function A (aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1; }
function B (aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1; }
function C (aA1)      { return 3.0 * aA1; }

// Returns x(t) given t, x1, and x2, or y(t) given t, y1, and y2.
function calcBezier (aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT; }

// Returns dx/dt given t, x1, and x2, or dy/dt given t, y1, and y2.
function getSlope (aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1); }

function binarySubdivide (aX, aA, aB, mX1, mX2) {
  var currentX, currentT, i = 0;
  do {
    currentT = aA + (aB - aA) / 2.0;
    currentX = calcBezier(currentT, mX1, mX2) - aX;
    if (currentX > 0.0) {
      aB = currentT;
    } else {
      aA = currentT;
    }
  } while (Math.abs(currentX) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
  return currentT;
}

function newtonRaphsonIterate (aX, aGuessT, mX1, mX2) {
 for (var i = 0; i < NEWTON_ITERATIONS; ++i) {
   var currentSlope = getSlope(aGuessT, mX1, mX2);
   if (currentSlope === 0.0) {
     return aGuessT;
   }
   var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
   aGuessT -= currentX / currentSlope;
 }
 return aGuessT;
}

function LinearEasing (x) {
  return x;
}

module.exports = function bezier (mX1, mY1, mX2, mY2) {
  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  if (mX1 === mY1 && mX2 === mY2) {
    return LinearEasing;
  }

  // Precompute samples table
  var sampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);
  for (var i = 0; i < kSplineTableSize; ++i) {
    sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
  }

  function getTForX (aX) {
    var intervalStart = 0.0;
    var currentSample = 1;
    var lastSample = kSplineTableSize - 1;

    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
      intervalStart += kSampleStepSize;
    }
    --currentSample;

    // Interpolate to provide an initial guess for t
    var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
    var guessForT = intervalStart + dist * kSampleStepSize;

    var initialSlope = getSlope(guessForT, mX1, mX2);
    if (initialSlope >= NEWTON_MIN_SLOPE) {
      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
    } else if (initialSlope === 0.0) {
      return guessForT;
    } else {
      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
    }
  }

  return function BezierEasing (x) {
    // Because JavaScript number are imprecise, we should guarantee the extremes are right.
    if (x === 0) {
      return 0;
    }
    if (x === 1) {
      return 1;
    }
    return calcBezier(getTForX(x), mY1, mY2);
  };
};

},{}],9:[function(require,module,exports){
module.exports = function(subject) {
  validateSubject(subject);

  var eventsStorage = createEventsStorage(subject);
  subject.on = eventsStorage.on;
  subject.off = eventsStorage.off;
  subject.fire = eventsStorage.fire;
  return subject;
};

function createEventsStorage(subject) {
  // Store all event listeners to this hash. Key is event name, value is array
  // of callback records.
  //
  // A callback record consists of callback function and its optional context:
  // { 'eventName' => [{callback: function, ctx: object}] }
  var registeredEvents = Object.create(null);

  return {
    on: function (eventName, callback, ctx) {
      if (typeof callback !== 'function') {
        throw new Error('callback is expected to be a function');
      }
      var handlers = registeredEvents[eventName];
      if (!handlers) {
        handlers = registeredEvents[eventName] = [];
      }
      handlers.push({callback: callback, ctx: ctx});

      return subject;
    },

    off: function (eventName, callback) {
      var wantToRemoveAll = (typeof eventName === 'undefined');
      if (wantToRemoveAll) {
        // Killing old events storage should be enough in this case:
        registeredEvents = Object.create(null);
        return subject;
      }

      if (registeredEvents[eventName]) {
        var deleteAllCallbacksForEvent = (typeof callback !== 'function');
        if (deleteAllCallbacksForEvent) {
          delete registeredEvents[eventName];
        } else {
          var callbacks = registeredEvents[eventName];
          for (var i = 0; i < callbacks.length; ++i) {
            if (callbacks[i].callback === callback) {
              callbacks.splice(i, 1);
            }
          }
        }
      }

      return subject;
    },

    fire: function (eventName) {
      var callbacks = registeredEvents[eventName];
      if (!callbacks) {
        return subject;
      }

      var fireArguments;
      if (arguments.length > 1) {
        fireArguments = Array.prototype.splice.call(arguments, 1);
      }
      for(var i = 0; i < callbacks.length; ++i) {
        var callbackInfo = callbacks[i];
        callbackInfo.callback.apply(callbackInfo.ctx, fireArguments);
      }

      return subject;
    }
  };
}

function validateSubject(subject) {
  if (!subject) {
    throw new Error('Eventify cannot use falsy object as events subject');
  }
  var reservedWords = ['on', 'fire', 'off'];
  for (var i = 0; i < reservedWords.length; ++i) {
    if (subject.hasOwnProperty(reservedWords[i])) {
      throw new Error("Subject cannot be eventified, since it already has property '" + reservedWords[i] + "'");
    }
  }
}

},{}],10:[function(require,module,exports){
/**
 * This module unifies handling of mouse whee event across different browsers
 *
 * See https://developer.mozilla.org/en-US/docs/Web/Reference/Events/wheel?redirectlocale=en-US&redirectslug=DOM%2FMozilla_event_reference%2Fwheel
 * for more details
 *
 * Usage:
 *  var addWheelListener = require('wheel').addWheelListener;
 *  var removeWheelListener = require('wheel').removeWheelListener;
 *  addWheelListener(domElement, function (e) {
 *    // mouse wheel event
 *  });
 *  removeWheelListener(domElement, function);
 */
// by default we shortcut to 'addEventListener':

module.exports = addWheelListener;

// But also expose "advanced" api with unsubscribe:
module.exports.addWheelListener = addWheelListener;
module.exports.removeWheelListener = removeWheelListener;


var prefix = "", _addEventListener, _removeEventListener,  support;

detectEventModel(typeof window !== 'undefined' && window,
                typeof document !== 'undefined' && document);

function addWheelListener( elem, callback, useCapture ) {
    _addWheelListener( elem, support, callback, useCapture );

    // handle MozMousePixelScroll in older Firefox
    if( support == "DOMMouseScroll" ) {
        _addWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
    }
}

function removeWheelListener( elem, callback, useCapture ) {
    _removeWheelListener( elem, support, callback, useCapture );

    // handle MozMousePixelScroll in older Firefox
    if( support == "DOMMouseScroll" ) {
        _removeWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
    }
}

  // TODO: in theory this anonymous function may result in incorrect
  // unsubscription in some browsers. But in practice, I don't think we should
  // worry too much about it (those browsers are on the way out)
function _addWheelListener( elem, eventName, callback, useCapture ) {
  elem[ _addEventListener ]( prefix + eventName, support == "wheel" ? callback : function( originalEvent ) {
    !originalEvent && ( originalEvent = window.event );

    // create a normalized event object
    var event = {
      // keep a ref to the original event object
      originalEvent: originalEvent,
      target: originalEvent.target || originalEvent.srcElement,
      type: "wheel",
      deltaMode: originalEvent.type == "MozMousePixelScroll" ? 0 : 1,
      deltaX: 0,
      deltaY: 0,
      deltaZ: 0,
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      preventDefault: function() {
        originalEvent.preventDefault ?
            originalEvent.preventDefault() :
            originalEvent.returnValue = false;
      },
      stopPropagation: function() {
        if(originalEvent.stopPropagation)
          originalEvent.stopPropagation();
      },
      stopImmediatePropagation: function() {
        if(originalEvent.stopImmediatePropagation)
          originalEvent.stopImmediatePropagation();
      }
    };

    // calculate deltaY (and deltaX) according to the event
    if ( support == "mousewheel" ) {
      event.deltaY = - 1/40 * originalEvent.wheelDelta;
      // Webkit also support wheelDeltaX
      originalEvent.wheelDeltaX && ( event.deltaX = - 1/40 * originalEvent.wheelDeltaX );
    } else {
      event.deltaY = originalEvent.detail;
    }

    // it's time to fire the callback
    return callback( event );

  }, useCapture || false );
}

function _removeWheelListener( elem, eventName, callback, useCapture ) {
  elem[ _removeEventListener ]( prefix + eventName, callback, useCapture || false );
}

function detectEventModel(window, document) {
  if ( window && window.addEventListener ) {
      _addEventListener = "addEventListener";
      _removeEventListener = "removeEventListener";
  } else {
      _addEventListener = "attachEvent";
      _removeEventListener = "detachEvent";
      prefix = "on";
  }

  if (document) {
    // detect available wheel event
    support = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
              document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE support at least "mousewheel"
              "DOMMouseScroll"; // let's assume that remaining browsers are older Firefox
  } else {
    support = "wheel";
  }
}

},{}]},{},[1])(1)
});
