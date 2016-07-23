# panzoom

Pan and zoom an SVG scene.

# Demo

 * [Standalone page](https:////anvaka.github.io/panzoom/demo/index.html) - this repository
 * [YASIV](http://www.yasiv.com/#/Search?q=algorithms&category=Books&lang=US) - my hobby project
 * [SVG Tiger](https://jsfiddle.net/uwxcmbyg/) - js fiddle

# Usage

Grab it from npm and use with your favorite bundler:

```
npm install panzoom --save
```

Or download from CDN:

```
https://cdn.rawgit.com/anvaka/panzoom/v1.2.1/dist/panzoom.min.js
```

If you download from CDN the library will be available under `panzoom` global name.

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

When user starts/ends dragging the scene, the scene will fire `panstart`/`panend`
events. By default they will bubble up, so you can catch them any time you want:

``` js
document.body.addEventListener('panstart', function(e) {
  console.log('pan start', e);
}, true);

document.body.addEventListener('panend', function(e) {
  console.log('pan end', e);
}, true);
```

See [JSFiddle](https://jsfiddle.net/uwxcmbyg/1/) console for a demo.

## Ignore mouse wheel

Sometimes zooming interferes with scrolling. If you want to alleviate it you
can provide a custom filter, which will allow zooming only when modifier key is
down. E.g.

``` js
panzoom(document.getElementById('g4'), {
  beforeWheel: function(e) {
    // allow wheel-zoom only if altKey is down. Otherwise - ignore
    var shouldIgnore = !e.altKey;
    return shouldIgnore;
  }
});
```

See [JSFiddle](https://jsfiddle.net/Laxq9jLu/) for the demo. The tiger will be
zooomable only when `Alt` key is down.

## Zoom Speed

You can adjust how fast it zooms, by passing optional `zoomSpeed` argument:

``` js
panzoom(document.getElementById('g4'), {
  zoomSpeed: 0.065 // 6.5% per mouse wheel event
});
```

# license

MIT
