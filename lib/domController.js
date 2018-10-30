module.exports = makeDomController

var Transform = require('./transform.js');

function makeDomController(domElement) {
  var elementValid = (domElement instanceof HTMLElement)
  if (!elementValid) {
    throw new Error('svg element is required for svg.panzoom to work')
  }

  var owner = domElement.parentElement
  if (!owner) {
    throw new Error(
      'Do not apply panzoom to the detached DOM element. '
    )
  }

  domElement.scrollTop = 0;
  owner.setAttribute('tabindex', 1); // TODO: not sure if this is really polite

  var api = {
    getBBox: getBBox,
    getOwner: getOwner,
    applyTransform: applyTransform,
    getTransform: getTransform,
  }

  return api

  function getOwner() {
    return owner
  }

  function getBBox() {
    // TODO: We should probably cache this?
    return  {
      left: 0,
      top: 0,
      width: domElement.clientWidth,
      height: domElement.clientHeight
    }
  }

  function applyTransform(transform) {
    // TODO: Should we cache this?
    domElement.style.transformOrigin = '0 0 0';
    domElement.style.transform = 'matrix(' +
      transform.scale + ', 0, 0, ' +
      transform.scale + ', ' +
      transform.x + ', ' + transform.y + ')'
  }

  function getTransform() {
    var transformStyle = domElement.style.transform;
    var transform = new Transform();
    if (!transformStyle.startsWith('matrix(')) {
      return transform;
    }

    var transformArray = transformStyle.substring(transformStyle.indexOf('(') + 1, transformStyle.lastIndexOf(')')).split(', ');
    transform.x = parseFloat(transformArray[4]);
    transform.y = parseFloat(transformArray[5]);
    transform.scale = parseFloat(transformArray[0]);

    return transform;
  }
}
