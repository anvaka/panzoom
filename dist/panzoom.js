(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.panzoom = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* globals SVGElement */
/**
 * Allows to drag and zoom svg elements
 */
var wheel = require('wheel')
var animate = require('amator');
var zoomTo = require('./lib/zoomTo.js')
var kinetic = require('./lib/kinetic.js')
var moveBy = require('./lib/moveBy.js')
var moveTo = require('./lib/moveTo.js')
var createEvent = require('./lib/createEvent.js')

var defaultZoomSpeed = 0.065

module.exports = createPanZoom;

function createPanZoom(svgElement, options) {
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

  options = options || {}

  var beforeWheel = options.beforeWheel || noop
  var speed = typeof options.zoomSpeed === 'number' ? options.zoomSpeed : defaultZoomSpeed

  var touchInProgress = false

  // We only need to fire panstart when actual move happens
  var panstartFired = false

  // cache mouse coordinates here
  var mouseX
  var mouseY

  var pinchZoomLength

  var dragObject
  var prevSelectStart
  var prevDragStart

  var smoothScroll = kinetic(svgElement, scroll)
  var previousAnimation

  var multitouch

  listenForEvents()

  return {
    dispose: dispose,
    moveBy: internalMoveBy,
    centerOn: centerOn,
    zoomTo: publicZoomTo
  }

  function centerOn(ui) {
    var parent = ui.ownerSVGElement
    if (!parent) throw new Error('ui element is required to be within the scene')

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
      moveBy(svgElement, dx, dy)
      return
    }

    if (previousAnimation) previousAnimation.cancel()

    var from = { x: 0, y: 0 }
    var to = { x: dx, y : dy }
    var lastX = 0
    var lastY = 0

    previousAnimation = animate(from, to, {
      step: function(v) {
        moveBy(svgElement, v.x - lastX, v.y - lastY)

        lastX = v.x
        lastY = v.y
      }
    })
  }

  function scroll(x, y) {
    moveTo(svgElement, x, y)
  }

  function dispose() {
    wheel.removeWheelListener(svgElement, onMouseWheel)
    owner.removeEventListener('mousedown', onMouseDown)

    smoothScroll.cancel()

    releaseDocumentMouse()
    releaseTouches()

    triggerPanEnd()
  }

  function listenForEvents() {
    owner.addEventListener('mousedown', onMouseDown)
    owner.addEventListener('touchstart', onTouch)
    wheel.addWheelListener(owner, onMouseWheel)
  }

  function onTouch(e) {
    if (e.touches.length === 1) {
      return handleSignleFingerTouch(e, e.touches[0])
    } else if (e.touches.length === 2) {
      // handleTouchMove() will care about pinch zoom.
      e.stopPropagation()
      e.preventDefault()

      pinchZoomLength = getPinchZoomLength(e.touches[0], e.touches[1])
      multitouch  = true;
      startTouchListenerIfNeeded()
    }
  }

  function handleSignleFingerTouch(e) {
    e.stopPropagation()
    e.preventDefault()

    var touch = e.touches[0]
    mouseX = touch.clientX
    mouseY = touch.clientY

    startTouchListenerIfNeeded()
  }

  function startTouchListenerIfNeeded() {
    if (!touchInProgress) {
      touchInProgress = true
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)
      document.addEventListener('touchcancel', handleTouchEnd)
    }
  }

  function handleTouchMove(e) {
    triggerPanStart()

    if (e.touches.length === 1) {
      e.stopPropagation()
      var touch = e.touches[0]

      var dx = touch.clientX - mouseX
      var dy = touch.clientY - mouseY

      mouseX = touch.clientX
      mouseY = touch.clientY
      internalMoveBy(dx, dy)
    } else if (e.touches.length === 2) {
      // it's a zoom, let's find direction
      multitouch = true;
      var t1 = e.touches[0]
      var t2 = e.touches[1]
      var currentPinchLength = getPinchZoomLength(t1, t2)

      var delta = 0
      if (currentPinchLength < pinchZoomLength) {
        delta = 1
      } else if (currentPinchLength > pinchZoomLength) {
        delta = -1
      }

      var scaleMultiplier = getScaleMultiplier(delta)

      mouseX = (t1.clientX + t2.clientX)/2
      mouseY = (t1.clientY + t2.clientY)/2

      zoomTo(svgElement, mouseX, mouseY, scaleMultiplier)

      pinchZoomLength = currentPinchLength
      e.stopPropagation()
      e.preventDefault()
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length > 0) {
      mouseX = e.touches[0].clientX
      mouseY = e.touches[0].clientY
    } else {
      touchInProgress = false
      triggerPanEnd()
      releaseTouches()
    }
  }

  function getPinchZoomLength(finger1, finger2) {
    return (finger1.clientX - finger2.clientX) * (finger1.clientX - finger2.clientX) +
      (finger1.clientY - finger2.clientY) * (finger1.clientY - finger2.clientY)
  }

  function onMouseDown(e) {
    if (touchInProgress) {
      // modern browsers will fire mousedown for touch events too
      // we do not want this, since touch is handled separately.
      e.stopPropagation()
      return false;
    }
    // for IE, left click == 1
    // for Firefox, left click == 0
    var isLeftButton = ((e.button === 1 && window.event !== null) || e.button === 0)
    if (!isLeftButton) return

    mouseX = e.clientX
    mouseY = e.clientY

    // We need to listen on document itself, since mouse can go outside of the
    // window, and we will loose it
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    // prevent text selection
    dragObject = e.target || e.srcElement
    prevSelectStart = window.document.onselectstart
    prevDragStart = window.document.ondragstart

    window.document.onselectstart = disabled
    dragObject.ondragstart = disabled

    return false
  }

  function onMouseMove(e) {
    // no need to worry about mouse events when touch is happening
    if (touchInProgress) return

    triggerPanStart()

    var dx = e.clientX - mouseX
    var dy = e.clientY - mouseY

    mouseX = e.clientX
    mouseY = e.clientY
    internalMoveBy(dx, dy)
  }

  function onMouseUp() {
    window.document.onselectstart = prevSelectStart
    if (dragObject) dragObject.ondragstart = prevDragStart

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
    if (beforeWheel(e)) return

    smoothScroll.cancel()

    var scaleMultiplier = getScaleMultiplier(e.deltaY)

    if (scaleMultiplier !== 1) {
      zoomTo(svgElement, e.clientX, e.clientY, scaleMultiplier)
      e.preventDefault()
    }
  }

  function publicZoomTo(clientX, clientY, scaleMultiplier) {
      zoomTo(svgElement, clientX, clientY, scaleMultiplier)
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
    var event = createEvent(name)
    svgElement.dispatchEvent(event)
  }
}

function disabled(e) {
  e.stopPropagation()
  return false
}

function noop() { }

},{"./lib/createEvent.js":2,"./lib/kinetic.js":4,"./lib/moveBy.js":5,"./lib/moveTo.js":6,"./lib/zoomTo.js":7,"amator":8,"wheel":10}],2:[function(require,module,exports){
/* global Event */
module.exports = createEvent;

var isIE = typeof Event !== 'function'

/**
 * Constructs custom event. Works in IE too
 */
function createEvent(name) {
  if (isIE) {
    var evt = document.createEvent('CustomEvent')
    evt.initCustomEvent(name, true, true, undefined)
    return evt
  } else {
    return new Event(name)
  }
}

},{}],3:[function(require,module,exports){
/**
 * Returns transformation matrix for an element. If no such transformation matrix
 * exist - a new one is created.
 */
module.exports = getTransform

function getTransform(svgElement) {
  var baseVal = svgElement.transform.baseVal
  if (baseVal.numberOfItems) return baseVal.getItem(0)

  var owner = svgElement.ownerSVGElement || svgElement
  var transform = owner.createSVGTransform()
  svgElement.transform.baseVal.appendItem(transform)

  return transform
}

},{}],4:[function(require,module,exports){
/**
 * Allows smooth kinetic scrolling of the surface
 */
var getTransform = require('./getTransform.js');

module.exports = kinetic;

var minVelocity = 10
var amplitude = 0.42

function kinetic(element, scroll) {
  var lastRect
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
    lastRect = getRect()

    ax = ay = vx = vy = 0
    timestamp = new Date()

    window.clearInterval(ticker)
    window.cancelAnimationFrame(raf)

    ticker = window.setInterval(track, 100);
  }

  function track() {
    var now = Date.now();
    var elapsed = now - timestamp;
    timestamp = now;

    var rect = getRect()

    var dx = rect.x - lastRect.x
    var dy = rect.y - lastRect.y

    lastRect = rect

    var dt = 1000 / (1 + elapsed)

    // moving average
    vx = 0.8 * dx * dt + 0.2 * vx
    vy = 0.8 * dy * dt + 0.2 * vy
  }

  function stop() {
    window.clearInterval(ticker);
    window.cancelAnimationFrame(raf)

    var rect = getRect()

    targetX = rect.x
    targetY = rect.y
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

  function getRect() {
    var matrix = getTransform(element).matrix
    return {
      x: matrix.e,
      y: matrix.f
    }
  }
}

},{"./getTransform.js":3}],5:[function(require,module,exports){
/**
 * Moves element by dx,dy offset without affecting its scale
 */
var getTransform = require('./getTransform.js')

module.exports = moveBy

function moveBy(svgElement, dx, dy) {
  var transform = getTransform(svgElement)

  svgElement.setAttribute(
    'transform', 'matrix(' +
      [
        transform.matrix.a,
        transform.matrix.b,
        transform.matrix.c,
        transform.matrix.d,
        transform.matrix.e + dx,
        transform.matrix.f + dy
      ].join(' ') + ')'
  )
}

},{"./getTransform.js":3}],6:[function(require,module,exports){
/**
 * Move element to given x,y coordinates without affecting its scale
 */
var getTransform = require('./getTransform.js')

module.exports = moveTo

function moveTo(svgElement, x, y) {
  var transform = getTransform(svgElement)

  svgElement.setAttribute(
    'transform', 'matrix(' +
      [
        transform.matrix.a,
        transform.matrix.b,
        transform.matrix.c,
        transform.matrix.d,
        x,
        y
      ].join(' ') + ')'
  )
}

},{"./getTransform.js":3}],7:[function(require,module,exports){
var getTransform = require('./getTransform.js')

module.exports = zoomTo

/**
 * Sets the new scale for an element, as if it was zoomed into `clientX, clientY`
 * point
 */
function zoomTo(svgElement, clientX, clientY, scaleMultiplier) {
  var transform = getTransform(svgElement)
  var parent = svgElement.ownerSVGElement
  var parentCTM = parent.getScreenCTM()
  // we have consistent scale on both X and Y, thus we can use just one attribute:
  var scale = transform.matrix.a * scaleMultiplier

  var x = clientX * parentCTM.a - parentCTM.e
  var y = clientY * parentCTM.a - parentCTM.f

  svgElement.setAttribute(
    'transform', 'matrix(' +
      [
        scale,
        transform.matrix.b,
        transform.matrix.c,
        scale,
        x - scaleMultiplier * (x - transform.matrix.e),
        y - scaleMultiplier * (y - transform.matrix.f)
      ].join(' ') + ')'
  )
}

},{"./getTransform.js":3}],8:[function(require,module,exports){
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

function animate(source, target, options) {
  var start= Object.create(null)
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

  var durationInMs = options.duration || 400
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

},{"bezier-easing":9}],9:[function(require,module,exports){
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

module.exports = function bezier (mX1, mY1, mX2, mY2) {
  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) {
    throw new Error('bezier x values must be in [0, 1] range');
  }

  // Precompute samples table
  var sampleValues = float32ArraySupported ? new Float32Array(kSplineTableSize) : new Array(kSplineTableSize);
  if (mX1 !== mY1 || mX2 !== mY2) {
    for (var i = 0; i < kSplineTableSize; ++i) {
      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
    }
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
    if (mX1 === mY1 && mX2 === mY2) {
      return x; // linear
    }
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


var prefix = "", _addEventListener, _removeEventListener, onwheel, support;

detectEventModel(typeof window !== 'undefined' && window,
                typeof document !== 'undefined' && document);

function addWheelListener( elem, callback, useCapture ) {
    _addWheelListener( elem, support, callback, useCapture );

    // handle MozMousePixelScroll in older Firefox
    if( support == "DOMMouseScroll" ) {
        _addWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
    }
};

function removeWheelListener( elem, callback, useCapture ) {
    _removeWheelListener( elem, support, callback, useCapture );

    // handle MozMousePixelScroll in older Firefox
    if( support == "DOMMouseScroll" ) {
        _removeWheelListener( elem, "MozMousePixelScroll", callback, useCapture );
    }
};

function _addWheelListener( elem, eventName, callback, useCapture ) {
  // TODO: in theory this anonymous function may result in incorrect
  // unsubscription in some browsers. But in practice, I don't think we should
  // worry too much about it (those browsers are on the way out)
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
      delatZ: 0,
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