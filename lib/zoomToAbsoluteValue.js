var getTransform = require('./getTransform.js')

module.exports = zoomToAbsoluteValue

/**
 * Sets the new absolute scale for an element, as if it was zoomed into `clientX, clientY`
 * point
 */
function zoomToAbsoluteValue(svgElement, clientX, clientY, zoomLevel) {
  var transform = getTransform(svgElement)
  var parent = svgElement.ownerSVGElement
  var parentCTM = parent.getScreenCTM()

  var x = clientX * parentCTM.a - parentCTM.e
  var y = clientY * parentCTM.a - parentCTM.f

  var dz = zoomLevel / transform.matrix.a
  var e = x - dz * (x - transform.matrix.e)
  var f = y - dz * (y - transform.matrix.f)

  var transform = [
      zoomLevel,
      transform.matrix.b,
      transform.matrix.c,
      zoomLevel,
      e,
      f
    ]

  svgElement.setAttribute('transform', 'matrix(' + transform.join(' ') + ')')

  return transform
}
