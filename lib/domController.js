var getTransform = require('./getSvgTransformMatrix.js')

module.exports = makeSvgController

function makeSvgController(domElement) {
  var elementValid = (domElement instanceof HTMLElement)
  var idScreenCTM = { a: 1, e: 0, f: 0 }
  if (!elementValid) {
    throw new Error('svg element is required for svg.panzoom to work')
  }

  var owner = domElement.parentElement
  if (!owner) {
    throw new Error(
      'Do not apply panzoom to the detached DOM element. '
    )
  }

  owner.setAttribute('tabindex', 1); // TODO: not sure if this is really polite

  var api = {
    getLeftTop: getLeftTop,
    getScreenCTM: getScreenCTM,
    getOwner: getOwner,
    applyTransform: applyTransform,
  }
  
  return api

  function getOwner() {
    return owner
  }

  function getLeftTop() {
    return  {
      x: 0,
      y: 0
    }
  }

  function getScreenCTM() {
    return idScreenCTM 
  }

  function applyTransform(transform) {
    // TODO: Should we cache this?
    domElement.style.transformOrigin = '0 0 0';
    domElement.style.transform = 'matrix(' +
      transform.scale + ', 0, 0, ' +
      transform.scale + ', ' +
      transform.x + ', ' + transform.y + ')'
  }
}