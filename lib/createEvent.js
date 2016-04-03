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
