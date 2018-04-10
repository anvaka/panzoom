var test = require('tap').test;
var JSDOM = require("jsdom").JSDOM;
var globalDom = new JSDOM('', { pretendToBeVisual: true });
global.window = globalDom.window;
global.document = globalDom.window.document;
global.HTMLElement = globalDom.window.HTMLElement;
global.SVGElement = globalDom.window.SVGElement;

test('it can be created', (t) => {
  // Note - have to do it after globals initialized.
  var createPanzoom = require('../');
  var dom = new JSDOM(`<body><div class='content'></div></body>`);
  const document = dom.window.document;
  var content = document.querySelector('.content');

  var panzoom = createPanzoom(content);
  t.ok(panzoom, 'Created');
  t.end();
});

test('it updates transformation matrix on wheel event', t => {
  var createPanzoom = require('../');
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

test('it disposes correctly', t => {
  var createPanzoom = require('../');
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
})