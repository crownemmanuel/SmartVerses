/**
 * Configure Transformers.js ONNX Runtime WASM paths for production builds
 * 
 * In production builds, the WASM files need to be explicitly configured
 * with their paths. By default, transformers.js tries to load WASM files
 * from a CDN, but in Tauri production builds, network access may be restricted
 * or the CDN may not be accessible.
 * 
 * This configuration allows transformers.js to load WASM files from the
 * default CDN (cdn.jsdelivr.net) which should work in most cases.
 * If CDN access is blocked, the files will need to be bundled locally.
 */

import { env } from '@huggingface/transformers';

let configured = false;

export function configureTransformersEnv(): void {
  if (configured) return;

  // Ensure ONNX backend is initialized
  if (!env.backends?.onnx?.wasm) {
    console.warn('ONNX WASM backend not available, skipping configuration');
    return;
  }

  // Configure WASM paths to use bundled assets
  // Vite automatically bundles WASM files from onnxruntime-web into the dist/assets folder
  // We configure the path to point to the assets directory so transformers.js can find them
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wasmConfig = env.backends.onnx.wasm as any;
  
  // Set wasmPaths to the assets directory where Vite bundles the WASM files
  // In production, this will be something like "/assets/" or "./assets/"
  // The transformers.js library will append the specific WASM filenames
  if (!wasmConfig.wasmPaths) {
    // Use relative path to assets directory - transformers.js will construct full URLs
    wasmConfig.wasmPaths = './assets/';
  }

  configured = true;
}
