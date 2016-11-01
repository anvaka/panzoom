/**
 * Move element to given x,y coordinates without affecting its scale
 */
var getTransform = require('./getTransform.js')

module.exports = moveTo

function moveTo(svgElement, x, y) {
  var transform = getTransform(svgElement)
  var tranformMatrix = [
    transform.matrix.a,
    transform.matrix.b,
    transform.matrix.c,
    transform.matrix.d,
    x,
    y
  ]

  svgElement.setAttribute( 'transform', 'matrix(' + tranformMatrix.join(' ') + ')')

  return tranformMatrix
}
