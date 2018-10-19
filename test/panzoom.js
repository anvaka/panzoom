var test = require('tap').test;
var JSDOM = require("jsdom").JSDOM;
var globalDom = new JSDOM('', { pretendToBeVisual: true });
global.window = globalDom.window;
global.document = globalDom.window.document;
global.HTMLElement = globalDom.window.HTMLElement;
global.SVGElement = globalDom.window.SVGElement;

var createPanzoom = require('../');

test('it can be created', (t) => {
  // Note - have to do it after globals initialized.
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  var panzoom = createPanzoom(content);
  t.ok(panzoom, 'Created');
  t.end();
});

test('it updates transformation matrix on wheel event', t => {
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  var panzoom = createPanzoom(content);
  var wheelEvent = new dom.window.WheelEvent('wheel', {deltaY: 1});
  document.body.dispatchEvent(wheelEvent);
  setTimeout(() => {
    var transform = panzoom.getTransform();

    t.ok(transform.scale !== 1, 'Scale is updated');
    t.ok(content.style.transform, 'transform applied');
    t.end();
  }, 40);
})

test('it can pause/resume', t => {
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  var panzoom = createPanzoom(content);
  t.ok(panzoom.isPaused() === false, 'not paused by default');

  panzoom.pause();

  t.ok(panzoom.isPaused() === true, 'Paused when requested');

  var wheelEvent = new dom.window.WheelEvent('wheel', {deltaY: 1});
  document.body.dispatchEvent(wheelEvent);
  var originalTransform = panzoom.getTransform();

  setTimeout(() => {
    var transform = panzoom.getTransform();

    t.ok(originalTransform.x === transform.x, 'x transform is the same');
    t.ok(originalTransform.y === transform.y, 'y transform is the same' );
    t.ok(originalTransform.scale === transform.scale, 'scale is the same');

    panzoom.resume();
    t.ok(panzoom.isPaused() === false, 'not paused by default');

    var wheelEvent = new dom.window.WheelEvent('wheel', {deltaY: 1});
    document.body.dispatchEvent(wheelEvent);
    setTimeout(() => {
      var transform = panzoom.getTransform();

      t.ok(transform.scale !== 1, 'Scale is updated');
      t.ok(content.style.transform, 'transform applied');
      t.end();
    }, 40);
  }, 40);
})

test('it disposes correctly', t => {
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  var panzoom = createPanzoom(content);
  var wheelEvent = new dom.window.WheelEvent('wheel', {deltaY: 1});
  content.dispatchEvent(wheelEvent);
  var originalTransform;
  setTimeout(verifyFirstChangeAndDispose, 40);

  function verifyFirstChangeAndDispose() {
    originalTransform = content.style.transform;
    t.ok(originalTransform, 'transform applied first time');

    panzoom.dispose()

    var secondWheel = new dom.window.WheelEvent('wheel', {deltaY: 1});
    content.dispatchEvent(secondWheel);
    setTimeout(verifyTransformIsNotChanged, 40)
  }

  function verifyTransformIsNotChanged() {
    t.equals(content.style.transform, originalTransform, 'Transform has not changed after dispose');
    t.end();
  }
});

test('it can use keyboard', t => {
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  // JSDOM does not support this, have to override:
  content.parentElement.getBoundingClientRect = function() {
    return {
      width: 100,
      height: 100
    }
  }

  var panzoom = createPanzoom(content);

  var DOWN_ARROW = 40;
  var keyEvent = new dom.window.KeyboardEvent('keydown', {
    keyCode: DOWN_ARROW,
    bubbles: true
  });
  content.dispatchEvent(keyEvent);
  setTimeout(verifyTransformIsChanged, 40);

  function verifyTransformIsChanged() {
    t.equals(content.style.transform.toString(), 'matrix(1, 0, 0, 1, 0, -5)', 'keydown changed the y position');
    panzoom.dispose();
    t.end();
  }
});

test('it allows to cancel keyboard events', t => {
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  // JSDOM does not support this, have to override:
  content.parentElement.getBoundingClientRect = function() {
    return {
      width: 100,
      height: 100
    }
  }

  var DOWN_ARROW = 40;
  var filterKeyCalledCorrectly = false;
  var panzoom = createPanzoom(content, {
    filterKey(e, x, y, z) {
      t.equals(e.keyCode, DOWN_ARROW, 'down arrow is used');
      t.equals(x, 0, 'x has not changed');
      t.equals(y, -1, 'y changed!');
      t.equals(z, 0, 'z has not changed');
      filterKeyCalledCorrectly = true

      // don't let panzoom to handle this event
      return true;
    }
  });

  var keyEvent = new dom.window.KeyboardEvent('keydown', {
    keyCode: DOWN_ARROW,
    bubbles: true
  });
  content.dispatchEvent(keyEvent);
  setTimeout(verifyTransformIsChanged, 40);

  function verifyTransformIsChanged() {
    t.equals(content.style.transform.toString(), 'matrix(1, 0, 0, 1, 0, 0)', 'keydown does not change');
    t.equals(filterKeyCalledCorrectly, true, 'filter key called correctly');
    panzoom.dispose();
    t.end();
  }
});