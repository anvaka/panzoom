/**
 * Returns transformation matrix for an element. If no such transformation matrix
 * exist - a new one is created.
 */
module.exports = getSvgTransformMatrix;

function getSvgTransformMatrix(svgElement) {
  var baseVal = svgElement.transform.baseVal;
  if (baseVal.numberOfItems) return baseVal.getItem(0);

  var owner = svgElement.ownerSVGElement || svgElement;
  var transform = owner.createSVGTransform();
  svgElement.transform.baseVal.appendItem(transform);

  return transform;
}
