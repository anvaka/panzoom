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
