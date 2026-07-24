/* tslint:disable */
/* eslint-disable */

export class Renderer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static init(canvas: HTMLCanvasElement): Promise<Renderer>;
    /**
     * Assemble the source with texture inputs, interpret it, and draw to the canvas.
     */
    render(source: string, time: number, textures: any): any;
}

export function analyze(source: string): any;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_renderer_free: (a: number, b: number) => void;
    readonly analyze: (a: number, b: number) => any;
    readonly renderer_init: (a: any) => any;
    readonly renderer_render: (a: number, b: number, c: number, d: number, e: any) => any;
    readonly start: () => void;
    readonly wasm_bindgen__closure__destroy__h0935b00e02a5d6d9: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h80b894678d38979c: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hb79a1d8cb4268fc4: (a: number, b: number, c: any) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
