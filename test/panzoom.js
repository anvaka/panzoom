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