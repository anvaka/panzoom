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
