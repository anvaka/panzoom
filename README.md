# panzoom [![Build Status](https://travis-ci.org/anvaka/panzoom.svg)](https://travis-ci.org/anvaka/panzoom)

Extensible, mobile friendly pan and zoom framework (supports DOM and SVG).

# Demo

 * [Regular DOM object](https://anvaka.github.io/panzoom/demo/dom.html)
 * [Advanced usage](https://anvaka.github.io/panzoom/demo/dom-advanced.html)
 * [Standalone page](https://anvaka.github.io/panzoom/demo/index.html) - this repository
 * [YASIV](http://www.yasiv.com/#/Search?q=algorithms&category=Books&lang=US) - my hobby project
 * [SVG Tiger](https://jsfiddle.net/uwxcmbyg/609/) - js fiddle

# Usage

Grab it from npm and use with your favorite bundler:

```
npm install panzoom --save
```

Or download from CDN:

```
<script src='https://unpkg.com/panzoom@7.1.2/dist/panzoom.min.js'></script>
```

If you download from CDN the library will be available under `panzoom` global name.

## Pan and zoom DOM subtree

``` JS
// just grab any DOM element
var area = document.querySelector('.zoomable')

// And pass it to panzoom
panzoom(area)
```

## SVG panzoom example

``` html
<!-- this is your html file with svg -->
<body>
  <svg>
    <!-- this is the draggable root -->
    <g id='scene'> 
      <circle cx='10' cy='10' r='5' fill='pink'></circle>
    </g>
  </svg>
</body>
```

``` js
// In the browser panzoom is already on the
// window. If you are in common.js world, then 
// var panzoom = require('panzoom')

// grab the DOM SVG element that you want to be draggable/zoomable:
var scene = document.getElementById('scene')

// and forward it it to panzoom.
panzoom(scene)
```

If your use case requires dynamic behavior (i.e. you want to make a scene not 
draggable anymore, or even completely delete an SVG element) make sure to call
`dispose()` method:

``` js
var instance = panzoom(scene)
// do work
// ...
// then at some point you decide you don't need this anymore:
instance.dispose()
```

This will make sure that all event handlers are cleared and you are not leaking
memory

## Events notification

The library allows to subscribe to transformation changing events. E.g. when
user starts/ends dragging the scene, the scene will fire `panstart`/`panend`
events. Here is example of all supported events:

``` js
var instance = panzoom(scene);
instance.on('panstart', function(e) {
  console.log('Fired when pan is just started ', e);
  // Note: e === instance.
});

instance.on('pan', function(e) {
  console.log('Fired when the scene is being panned', e);
});

instance.on('panend', function(e) {
  console.log('Fired when pan ended', e);
});

instance.on('zoom', function(e) {
  console.log('Fired when scene is zoomed', e);
});

instance.on('transform', function(e) {
  // This event will be called along with events above.
  console.log('Fired when any transformation has happened', e);
});
```

See [JSFiddle](https://jsfiddle.net/uwxcmbyg/609/) console for a demo.

## Advanced usage

The following functions can be passed to modify the default behavior:

```
beforeWheel
beforeDblClick
beforeMouseDown
beforeTouch
beforeKeyDown
```

Each of these can return an object containing: `{ ignore: boolean, propagete: boolean }`.
If you specify `ignore: true` the library will not handle this event.
If both values are `true` or `false`, you can just return the boolean.

This allows to for example to implement two-finger pan or the use of modifier keys.

2 examples of this:

### Two-finger pan 

To avoid panning interfering with normal scrolling, you can add a `beforeTouch` handler.
``` js
panzoom(document.getElementById('g4'), {
  beforeTouch: function(e) {
    // allow touch-pan only with 2 fingers
    return e.touches.length < 2;
  }
});
```

### Scroll-zoom with modifier key

Sometimes zooming interferes with scrolling. If you want to alleviate it you
can provide a custom filter, which will allow zooming only when modifier key is
down. E.g.

``` js
panzoom(document.getElementById('g4'), {
  beforeWheel: function(e) {
    // allow wheel-zoom only if ctrlKey is down. Otherwise - ignore
    return !e.ctrlKey;
  },
});
```

See [JSFiddle](https://jsfiddle.net/Laxq9jLu/) for the demo. The tiger will be
zoomable only when `Alt` key is down.

### Ignore keyboard events

By default, panzoom will listen to keyboard events, so that users can navigate the scene
with arrow keys and `+`, `-` signs to zoom out. If you don't want this behavior you can
use `beforeKeyDown()`.

``` js
panzoom(document.getElementById('g4'), {
  beforeKeyDown: function(e) {
    // don't let panzoom handle this event:
    return true;
  }
});
```

## Zoom Speed

You can adjust how fast it zooms, by passing optional `zoomSpeed` argument:

``` js
panzoom(document.getElementById('g4'), {
  zoomSpeed: 0.065 // 6.5% per mouse wheel event
});
```

## Min Max Zoom

You can set min and max zoom, by passing optional `minZoom` and `maxZoom` argument:

``` js
panzoom(document.getElementById('g4'), {
  maxZoom: 1,
  minZoom: 0.1
});
```

## Disable Smooth Scroll

You can disable smooth scroll, by passing optional `smoothScroll` argument:

``` js
panzoom(document.getElementById('g4'), {
  smoothScroll: false
});
```

With this setting the momentum is disabled.

## Pause/resume the panzoom

You can pause and resume the panzoom by calling the following methods:

``` js
var controller = panzoom(document.getElementById('g4'));

controller.isPaused(); //  returns false
controller.pause();    //  Pauses event handling
controller.isPaused(); //  returns true now
controller.resume();   //  Resume panzoom
controller.isPaused(); //  returns false again
```

## Script attachment

If you want to quickly play with panzoom without using javascript, you can configure it via
`script` tag:

``` html
<!-- this is your html file -->
<!DOCTYPE html>
<html>
<head>
  <script src='https://unpkg.com/panzoom@7.1.2/dist/panzoom.min.js'
    query='#scene' name='pz'></script>
</head>
<body>
  <svg>
    <!-- this is the draggable root -->
    <g id='scene'> 
      <circle cx='10' cy='10' r='5' fill='pink'></circle>
    </g>
  </svg>
</body>
</html>
```

Most importantly, you can see `query` attribute that points to CSS selector. Once the element is found 
panzoom is attached to this element. The controller will become available under `window.pz` name. And you
can pass additional options to the panzoom via attributes prefixed with `pz-`.

Here is a demo: [Script based attributes](https://anvaka.github.io/panzoom/demo/attach-via-script.html)

## Adjust Double Click Zoom

You can adjust the double click zoom multiplier, by passing optional `zoomDoubleClickSpeed` argument.

When double clicking, zoom is multiplied by `zoomDoubleClickSpeed`, which means that a value of 1 will disable double click zoom completely. 

``` js
panzoom(document.getElementById('g4'), {
  zoomDoubleClickSpeed: 1, 
});
```

## Set Initial Position And Zoom

You can set the initial position and zoom, by chaining the `zoomAbs` function with x position, y position and zoom as arguments:

``` js
panzoom(document.getElementById('g4'), {
  maxZoom: 1,
  minZoom: 0.1
}).zoomAbs(
  300, // initial x position
  500, // initial y position
  0.1  // initial zoom 
);
```

## Handling touch events

The library will handle `ontouch` events very aggressively, it will `preventDefault`, and
`stopPropagation` for the touch events inside container. [Sometimes](https://github.com/anvaka/panzoom/issues/12) this is not a desirable behavior.

If you want to take care about this yourself, you can pass `onTouch` callback to the options object:

``` js
panzoom(document.getElementById('g4'), {
  onTouch: function(e) {
    // `e` - is current touch event.

    return false; // tells the library to not preventDefault.
  }
});
```

Note: if you don't `preventDefault` yourself - make sure you test the page behavior on iOS devices.
Sometimes this may cause page to [bounce undesirably](https://stackoverflow.com/questions/23862204/disable-ios-safari-elastic-scrolling). 


## Handling double click events

By default panzoom will prevent default action on double click events - this is done to avoid
accidental text selection (which is default browser action on double click). If you prefer to
allow default action, you can pass `onDoubleClick()` callback to options. If this callback
returns false, then the library will not prevent default action:

``` js
panzoom(document.getElementById('g4'), {
  onDoubleClick: function(e) {
    // `e` - is current double click event.

    return false; // tells the library to not preventDefault, and not stop propagation
  }
});
```

# license

MIT
