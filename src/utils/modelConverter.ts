import * as THREE from 'three';
import { LoadedModel } from '../types';
import { loadModelFile, disposeSceneHierarchy, disposeLoadedModel } from './modelLoaders';

export type TargetFormat = 'ply' | 'obj' | 'stl';
export type InputFormat = 'glb' | 'gltf' | 'obj' | 'ply' | 'stl' | 'fbx' | 'spz' | 'ts' | 'js' | 'unknown';

export interface ConversionOptions {
  binary?: boolean;
  filename?: string;
  applyTransforms?: boolean;
  includeNormals?: boolean;
  includeColors?: boolean;
  includeUVs?: boolean;
}

export interface ConversionResult {
  blob: Blob;
  filename: string;
  size: number;
  durationMs: number;
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  targetFormat: TargetFormat;
  isBinary: boolean;
}

/**
 * On-demand lazy loaders for Three.js exporters.
 * Using dynamic import() guarantees zero impact on initial bundle size.
 */
export async function getPLYExporter() {
  const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
  return new PLYExporter();
}

export async function getOBJExporter() {
  const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
  return new OBJExporter();
}

export async function getSTLExporter() {
  const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
  return new STLExporter();
}

/**
 * Inspects a 3D Object hierarchy to collect geometry metrics:
 * vertices, triangles, and meshes.
 */
export function inspectObjectGeometry(object: THREE.Object3D): {
  vertexCount: number;
  triangleCount: number;
  meshCount: number;
  pointCount: number;
  hasMeshes: boolean;
  hasPoints: boolean;
} {
  let vertexCount = 0;
  let triangleCount = 0;
  let meshCount = 0;
  let pointCount = 0;

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geom = child.geometry;
      if (geom) {
        if (geom.index) {
          triangleCount += Math.round(geom.index.count / 3);
        } else if (geom.attributes.position) {
          triangleCount += Math.round(geom.attributes.position.count / 3);
        }
        if (geom.attributes.position) {
          vertexCount += geom.attributes.position.count;
        }
      }
    } else if (child instanceof THREE.Points) {
      pointCount++;
      const geom = child.geometry;
      if (geom && geom.attributes.position) {
        vertexCount += geom.attributes.position.count;
      }
    }
  });

  return {
    vertexCount,
    triangleCount,
    meshCount,
    pointCount,
    hasMeshes: meshCount > 0,
    hasPoints: pointCount > 0,
  };
}

/**
 * Detects the input format from filename or LoadedModel.
 */
export function detectFormatFromFilename(name: string): InputFormat {
  if (!name) return 'unknown';
  const clean = name.toLowerCase().split('?')[0].split('#')[0];
  const ext = clean.split('.').pop() || '';
  if (['glb', 'gltf', 'obj', 'ply', 'stl', 'fbx', 'spz', 'ts', 'js'].includes(ext)) {
    return ext as InputFormat;
  }
  return 'unknown';
}

/**
 * Converts a Three.js Object3D into the target format (PLY, OBJ, or STL)
 * on the client side using Three.js built-in exporters.
 * Yields to main thread before and after export to preserve low INP and prevent UI freeze.
 */
export async function convertObject3D(
  sourceObject: THREE.Object3D,
  targetFormat: TargetFormat,
  options: ConversionOptions = {}
): Promise<ConversionResult> {
  const startTime = performance.now();

  // Yield to browser UI thread to allow spinner to paint and prevent INP degradation
  await new Promise((resolve) => setTimeout(resolve, 30));

  const stats = inspectObjectGeometry(sourceObject);

  // Validate format requirements
  if (targetFormat === 'stl' || targetFormat === 'obj') {
    if (!stats.hasMeshes) {
      if (stats.hasPoints) {
        throw new Error(
          `Target format "${targetFormat.toUpperCase()}" requires polygonal surface meshes (faces). The selected model only contains point clouds. Please convert to PLY instead.`
        );
      }
      throw new Error(
        `The selected 3D model does not contain any exportable polygonal geometry.`
      );
    }
  } else if (targetFormat === 'ply') {
    if (!stats.hasMeshes && !stats.hasPoints) {
      throw new Error(
        `The selected 3D model does not contain any exportable mesh or point geometry.`
      );
    }
  }

  // Clone or prepare export target
  // We apply matrix world updates so exported coordinates are accurate
  sourceObject.updateMatrixWorld(true);

  let exportData: ArrayBuffer | string | DataView | null = null;
  let isBinary = options.binary !== false;
  let mimeType = 'application/octet-stream';

  try {
    if (targetFormat === 'ply') {
      const exporter = await getPLYExporter();
      isBinary = options.binary !== false;
      mimeType = isBinary ? 'application/octet-stream' : 'text/plain;charset=utf-8';

      const excludeAttrs: string[] = [];
      if (options.includeNormals === false) excludeAttrs.push('normal');
      if (options.includeColors === false) excludeAttrs.push('color');
      if (options.includeUVs === false) excludeAttrs.push('uv', 'uv2');

      exportData = await new Promise<ArrayBuffer | string>((resolve, reject) => {
        try {
          const res = exporter.parse(
            sourceObject,
            (output) => {
              if (output) resolve(output);
            },
            {
              binary: isBinary,
              excludeAttributes: excludeAttrs,
            }
          );
          // If parse returned synchronously before callback
          if (res) {
            resolve(res);
          }
        } catch (err) {
          reject(err);
        }
      });
    } else if (targetFormat === 'obj') {
      const exporter = await getOBJExporter();
      isBinary = false;
      mimeType = 'text/plain;charset=utf-8';
      exportData = exporter.parse(sourceObject);
    } else if (targetFormat === 'stl') {
      const exporter = await getSTLExporter();
      isBinary = options.binary !== false;
      mimeType = isBinary ? 'application/octet-stream' : 'text/plain;charset=utf-8';
      const stlResult = exporter.parse(sourceObject, { binary: isBinary });
      exportData = stlResult;
    } else {
      throw new Error(`Unsupported target format: ${targetFormat}`);
    }
  } catch (err: any) {
    throw new Error(
      `Failed to export 3D geometry to ${targetFormat.toUpperCase()}: ${err?.message || err}`
    );
  }

  if (!exportData) {
    throw new Error(`Export generated empty data for format: ${targetFormat.toUpperCase()}`);
  }

  // Construct binary or text Blob
  let blob: Blob;
  if (exportData instanceof DataView) {
    blob = new Blob([exportData.buffer], { type: mimeType });
  } else if (exportData instanceof ArrayBuffer) {
    blob = new Blob([exportData], { type: mimeType });
  } else if (typeof exportData === 'string') {
    blob = new Blob([exportData], { type: mimeType });
  } else {
    blob = new Blob([exportData as any], { type: mimeType });
  }

  // Compute clean output filename
  const baseName = options.filename
    ? options.filename.replace(/\.[^/.]+$/, '')
    : 'converted_model';
  const finalFilename = `${baseName}.${targetFormat}`;

  const durationMs = Math.round(performance.now() - startTime);

  return {
    blob,
    filename: finalFilename,
    size: blob.size,
    durationMs,
    vertexCount: stats.vertexCount,
    triangleCount: stats.triangleCount,
    meshCount: stats.meshCount,
    targetFormat,
    isBinary,
  };
}

/**
 * Converts a raw 3D File directly on the client side by loading it into an isolated
 * Three.js Object3D, exporting to target format, and thoroughly disposing of the
 * temporary geometry, materials, and textures to prevent memory leaks and VRAM spikes.
 */
export async function convertUploadedFile(
  file: File,
  targetFormat: TargetFormat,
  options: ConversionOptions = {}
): Promise<ConversionResult> {
  let loadedModel: LoadedModel | null = null;

  try {
    // 1. Load isolated model file
    loadedModel = await loadModelFile(file, []);

    // 2. Perform conversion
    const baseName = options.filename || file.name.replace(/\.[^/.]+$/, '');
    const result = await convertObject3D(loadedModel.object, targetFormat, {
      ...options,
      filename: baseName,
    });

    return result;
  } finally {
    // 3. Strict Memory Disposal: Free all temporary buffers and GPU context
    if (loadedModel) {
      disposeLoadedModel(loadedModel);
      disposeSceneHierarchy(loadedModel.object);
      loadedModel = null;
    }
  }
}

/**
 * Triggers a native browser file download for a generated Blob
 * and safely revokes the ObjectURL after the download starts.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Revoke object URL after delay to allow browser download initiation
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

/**
 * Formats byte size into human-readable string.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
