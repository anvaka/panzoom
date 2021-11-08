declare module "panzoom" {
  interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }

  export interface TransformOrigin {
    x: number;
    y: number;
  }

  export interface Transform {
    x: number;
    y: number;
    scale: number;
  }

  export interface PanZoomController {
    getOwner: () => Element;
    applyTransform: (transform: Transform) => void;
  }

  export interface PanZoomOptions {
    filterKey?: () => boolean;
    bounds?: boolean | Bounds;
    maxZoom?: number;
    minZoom?: number;
    boundsPadding?: number;
    zoomDoubleClickSpeed?: number;
    zoomSpeed?: number;
    initialX?: number,
    initialY?: number,
    initialZoom?: number,
    pinchSpeed?: number;
    beforeWheel?: (e: WheelEvent) => void;
    beforeMouseDown?: (e: MouseEvent) => void;
    beforeTouchDown?: (e: TouchEvent) => void;
    autocenter?: boolean;
    onTouch?: (e: TouchEvent) => void;
    onDoubleClick?: (e: Event) => void;
    smoothScroll?: boolean;
    controller?: PanZoomController;
    enableTextSelection?: boolean;
    disableKeyboardInteraction?: boolean;
    transformOrigin?: TransformOrigin;
  }

  export interface PanZoom {
    dispose: () => void;
    moveBy: (dx: number, dy: number, smooth: boolean) => void;
    moveTo: (x: number, y: number) => void;
    smoothMoveTo: (x: number, y: number) => void;
    centerOn: (ui: any) => void;
    zoomTo: (clientX: number, clientY: number, scaleMultiplier: number) => void;
    zoomAbs: (clientX: number, clientY: number, zoomLevel: number) => void;
    smoothZoom: (
      clientX: number,
      clientY: number,
      scaleMultiplier: number
    ) => void;
    smoothZoomAbs: (
      clientX: number,
      clientY: number,
      toScaleValue: number
    ) => void;
    getTransform: () => Transform;
    showRectangle: (rect: ClientRect) => void;
    pause: () => void;
    resume: () => void;
    isPaused: () => boolean;
    on: <T>(eventName: string, handler: (e: T) => void) => void;
    off: (eventName: string, handler: Function) => void;
    fire: (eventName: string) => void;
    getMinZoom: () => number;
    setMinZoom: (newMinZoom: number) => number;
    getMaxZoom: () => number;
    setMaxZoom: (newMaxZoom: number) => number;
    getTransformOrigin: () => TransformOrigin;
    setTransformOrigin: (newTransformOrigin: TransformOrigin) => void;
    getZoomSpeed: () => number;
    setZoomSpeed: (zoomSpeed: number) => void;
  }

  export default function createPanZoom(
    domElement: HTMLElement | SVGElement,
    options?: PanZoomOptions
  ): PanZoom;
}
