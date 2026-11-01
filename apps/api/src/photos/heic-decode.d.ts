declare module 'heic-decode' {
  /** Decodes the primary image of a HEIC/HEIF file to RGBA pixels (libheif in wasm). */
  function decode(input: {
    buffer: Uint8Array | ArrayBuffer;
  }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  export = decode;
}
