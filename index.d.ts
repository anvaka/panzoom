declare module "panzoom" {
  interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }

  export interface EventInstructions {
    ignore: boolean,
    propage: boolean,
  }

  export interface PanZoomOptions {
    bounds?: boolean | Bounds;
    realPinch?: boolean;
    maxZoom?: number;
    minZoom?: number;
    boundsPadding?: number;
    zoomDoubleClickSpeed?: number;
    zoomSpeed?: number;
    beforeWheel?: (e: WheelEvent) => boolean | EventInstructions;
    beforeDblClick?: (e: MouseEvent) => boolean | EventInstructions;
    beforeMouseDown?: (e: MouseEvent) => boolean | EventInstructions;
    beforeTouch?: (e: TouchEvent) => boolean | EventInstructions;
    beforeKeyDown?: (e: KeyboardEvent) => boolean | EventInstructions;
    autocenter?: boolean;
    onTouch?: (e: TouchEvent) => void;
    onDoubleClick?: (e: Event) => void;
    smoothScroll?: boolean;
    controller?: SVGElement | HTMLElement;
  }

  export interface PanZoom {
    dispose: () => void;
    moveBy: (dx: number, dy: number, smooth: boolean) => void;
    moveTo: (x: number, y: number) => void;
    centerOn: (ui: any) => void;
    zoomTo: (clientX: number, clientY: number, scaleMultiplier: number) => void;
    zoomAbs: (clientX: number, clientY: number, zoomLevel: number) => void;
    smoothZoom: (
      clientX: number,
      clientY: number,
      scaleMultiplier: number
    ) => void;
    getTransform: () => {
      x: number;
      y: number;
      scale: number;
    };
    showRectangle: (rect: ClientRect) => void;
    pause: () => void;
    resume: () => void;
    isPaused: () => boolean;
    on: <T>(eventName: string, handler: (e: T) => void) => void;
    off: (eventName: string, handler: Function) => void;
    fire: (eventName: string) => void;
  }

  export default function createPanZoom(
    domElement: HTMLElement | SVGElement,
    Options: PanZoomOptions
  ): PanZoom;
}
