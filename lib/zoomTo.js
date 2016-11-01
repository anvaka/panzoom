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

  var e = x - scaleMultiplier * (x - transform.matrix.e)
  var f = y - scaleMultiplier * (y - transform.matrix.f)
  var transform = [
      scale,
      transform.matrix.b,
      transform.matrix.c,
      scale,
      e,
      f
    ]

  svgElement.setAttribute('transform', 'matrix(' + transform.join(' ') + ')')

  return transform
}
