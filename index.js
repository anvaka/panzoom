/* globals SVGElement */
/**
 * Allows to drag and zoom svg elements
 */
var wheel = require('wheel')
var animate = require('amator');
var kinetic = require('./lib/kinetic.js')
var createEvent = require('./lib/createEvent.js')
var preventTextSelection = require('./lib/textSlectionInterceptor.js')()
var getTransform = require('./lib/getSvgTransformMatrix.js')
var Transform = require('./lib/transform.js');

var defaultZoomSpeed = 0.065
var defaultDoubleTapZoomSpeed = 1.75
var doubleTapSpeedInMS = 300

module.exports = createPanZoom;

function createPanZoom(svgElement, options) {
  var elementValid = (svgElement instanceof SVGElement)

  var isDirty = false
  var transform = new Transform()

  if (!elementValid) {
    throw new Error('svg element is required for svg.panzoom to work')
  }

  var frameAnimation
  var owner = svgElement.ownerSVGElement
  if (!owner) {
    throw new Error(
      'Do not apply panzoom to the root <svg> element. ' +
      'Use its child instead (e.g. <g></g>). ' +
      'As of March 2016 only FireFox supported transform on the root element')
  }

  owner.setAttribute('tabindex', 1); // TODO: not sure if this is really polite
  options = options || {}

  var beforeWheel = options.beforeWheel || noop
  var speed = typeof options.zoomSpeed === 'number' ? options.zoomSpeed : defaultZoomSpeed
  var bounds = options.bounds
  validateBounds(bounds)

  var maxZoom = typeof options.maxZoom === 'number' ? options.maxZoom : Number.POSITIVE_INFINITY
  var minZoom = typeof options.minZoom === 'number' ? options.minZoom : 0
  var boundsPadding = typeof options.bounds === 'number' ? options.bounds : 0.05

  var lastTouchEndTime = 0

  var touchInProgress = false

  // We only need to fire panstart when actual move happens
  var panstartFired = false

  // cache mouse coordinates here
  var mouseX
  var mouseY

  var pinchZoomLength

  var smoothScroll = kinetic(getRect, scroll)
  var moveByAnimation
  var zoomToAnimation

  var multitouch

  listenForEvents()

  return {
    dispose: dispose,
    moveBy: internalMoveBy,
    centerOn: centerOn,
    zoomTo: publicZoomTo,
    zoomAbs: zoomToAbsoluteValue,
    getTransform: getTransformModel
  }

  function getTransformModel() {
    // TODO: should this be read only?
    return transform
  }

  function getRect() {
    return {
      x: transform.x,
      y: transform.y
    }
  }

  function moveBy(dx, dy) {
    transform.x += dx
    transform.y += dy

    keepTransformInsideBounds()

    triggerEvent('pan')
    makeDirty()
  }

  function keepTransformInsideBounds() {
    var boundingBox = getBoundingBox()
    if (!boundingBox) return

    var adjusted = false
    var clientRect = getClientRect()

    var diff = boundingBox.left - clientRect.right;
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
    diff = boundingBox.top - clientRect.bottom;
    if (diff > 0) {
      // we adjust transform, so that it matches exactly our boinding box:
      // transform.y = boundingBox.top - (boundingBox.height + boundingBox.y) * transform.scale =>
      // transform.y = boundingBox.top - (clientRect.bottom - transform.y) =>
      // transform.y = diff + transform.y =>
      transform.y += diff
      adjusted = true
    }

    diff = boundingBox.bottom - clientRect.top;
    if (diff < 0) {
      transform.y += diff
      adjusted = true
    }
    return adjusted
  }

  /**
   * Returns bounding box that should be used to restrict svg scene movement.
   */
  function getBoundingBox() {
    if (!bounds) return // client does not want to restrict movement

    if (typeof bounds === 'boolean') {
      var sceneWidth = owner.clientWidth
      var sceneHeight = owner.clientHeight

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
    var bbox = svgElement.getBBox()
    var leftTop = client(bbox.x, bbox.y)

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


  function moveTo(x, y) {
    transform.x = x
    transform.y = y
    keepTransformInsideBounds()
    makeDirty()
  }

  function makeDirty() {
    isDirty = true
    frameAnimation = window.requestAnimationFrame(frame)
  }

  function zoomByRatio(clientX, clientY, ratio) {
    var newScale = transform.scale * ratio

    if (newScale > maxZoom || newScale < minZoom) {
      // outside of allowed bounds
      return
    }

    var parentCTM = owner.getScreenCTM()

    var x = clientX * parentCTM.a - parentCTM.e
    var y = clientY * parentCTM.a - parentCTM.f

    transform.x = x - ratio * (x - transform.x)
    transform.y = y - ratio * (y - transform.y)

    var transformAdjusted = keepTransformInsideBounds()
    if (!transformAdjusted) transform.scale *= ratio

    makeDirty()
  }

  function zoomToAbsoluteValue(clientX, clientY, zoomLevel) {
    var ratio = zoomLevel / transform.scale
    zoomByRatio(clientX, clientY, ratio)
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
    triggerEvent('pan')
    moveTo(x, y)
  }

  function dispose() {
    wheel.removeWheelListener(svgElement, onMouseWheel)
    owner.removeEventListener('mousedown', onMouseDown)
    owner.removeEventListener('keydown', onKeyDown)
    owner.removeEventListener('dblclick', onDoubleClick)
    if (frameAnimation) {
      window.cancelAnimationFrame(frameAnimation)
      frameAnimation = 0;
    }

    smoothScroll.cancel()

    releaseDocumentMouse()
    releaseTouches()

    triggerPanEnd()
  }

  function listenForEvents() {
    owner.addEventListener('mousedown', onMouseDown)
    owner.addEventListener('dblclick', onDoubleClick)
    owner.addEventListener('touchstart', onTouch)
    owner.addEventListener('keydown', onKeyDown)
    wheel.addWheelListener(owner, onMouseWheel)

    makeDirty()
  }


  function frame() {
    if (isDirty) applyTransform()
  }

  function applyTransform() {
    isDirty = false

    svgElement.setAttribute('transform', 'matrix(' +
      transform.scale + ' 0 0 ' +
      transform.scale + ' ' +
      transform.x + ' ' + transform.y + ')')

    frameAnimation = 0
  }

  function onKeyDown(e) {
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
      e.preventDefault()
      e.stopPropagation()

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
      publicZoomTo(owner.clientWidth/2, owner.clientHeight/2, scaleMultiplier)
    }
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

    if (e.touches.length === 1) {
      e.stopPropagation()
      var touch = e.touches[0]

      var dx = touch.clientX - mouseX
      var dy = touch.clientY - mouseY

      if (dx !== 0 && dy !== 0) {
        triggerPanStart()
      }
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

      publicZoomTo(mouseX, mouseY, scaleMultiplier)

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
      var now = new Date()
      if (now - lastTouchEndTime < doubleTapSpeedInMS) {
        smoothZoom(mouseX, mouseY, defaultDoubleTapZoomSpeed)
      }

      lastTouchEndTime = now

      touchInProgress = false
      triggerPanEnd()
      releaseTouches()
    }
  }

  function getPinchZoomLength(finger1, finger2) {
    return (finger1.clientX - finger2.clientX) * (finger1.clientX - finger2.clientX) +
      (finger1.clientY - finger2.clientY) * (finger1.clientY - finger2.clientY)
  }

  function onDoubleClick(e) {
    smoothZoom(e.clientX, e.clientY, defaultDoubleTapZoomSpeed)

    e.preventDefault()
    e.stopPropagation()
  }

  function onMouseDown(e) {
    if (touchInProgress) {
      // modern browsers will fire mousedown for touch events too
      // we do not want this: touch is handled separately.
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

    preventTextSelection.capture(e.target || e.srcElement)

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
    if (beforeWheel(e)) return

    smoothScroll.cancel()

    var scaleMultiplier = getScaleMultiplier(e.deltaY)

    if (scaleMultiplier !== 1) {
      publicZoomTo(e.clientX, e.clientY, scaleMultiplier)
      e.preventDefault()
    }
  }

  function smoothZoom(clientX, clientY, scaleMultiplier) {
      var transform = getTransform(svgElement)
      var fromValue = transform.matrix.a
      var from = {scale: fromValue}
      var to = {scale: scaleMultiplier * fromValue}

      smoothScroll.cancel()
      cancelZoomAnimation()

      // TODO: should consolidate this and publicZoomTo
      triggerEvent('zoom')

      zoomToAnimation = animate(from, to, {
        step: function(v) {
          zoomToAbsoluteValue(clientX, clientY, v.scale)
        }
      })
  }

  function publicZoomTo(clientX, clientY, scaleMultiplier) {
      triggerEvent('zoom')

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
    var event = createEvent(name)
    svgElement.dispatchEvent(event)
  }
}


function noop() { }

function validateBounds(bounds) {
  var boundsType = typeof bounds
  if (boundsType === 'undefined' || boundsType === 'boolean') return // this is okay
  // otherwise need to be more thorough:
  var validBounds = isNumber(bounds.left) && isNumber(bounds.top) &&
    isNumber(bounds.top) && isNumber(bounds.right)

  if (!boundsValid) throw new Error('Bounds object is not valid. It can be: ' +
    'undefined, boolean (true|false) or an object {left, top, right, bottom}')
}

function isNumber(x) {
  return Number.isFinite(x)
}
