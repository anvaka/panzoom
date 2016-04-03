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
