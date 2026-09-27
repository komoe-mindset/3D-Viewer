import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { decodeSPZ } from './spzDecoder';
import { globalDecoderWorkerPool } from './decoderWorkerPool';
import { LoadedModel, ModelStats } from '../types';

/**
 * Concurrency-controlled queue for asynchronous 3D model parsing and loading.
 * Limits concurrent model decoding and geometry parsing to a max of 2-3 at a time
 * to prevent main-thread freezing and VRAM spike bottlenecks.
 */
export class ModelLoadingQueue {
  private maxConcurrent: number;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Enqueue a model loading task. Executes immediately if below concurrency limit,
   * otherwise waits for previous tasks to settle.
   */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        this.running++;
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          this.next();
        }
      };

      if (this.running < this.maxConcurrent) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }

  private next() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const task = this.queue.shift();
      if (task) task();
    }
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get activeCount(): number {
    return this.running;
  }
}

// Global model loader queue singleton with max concurrency of 2
export const globalModelLoadingQueue = new ModelLoadingQueue(2);

// Setup DRACO Loader singleton
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const fbxLoader = new FBXLoader();
const plyLoader = new PLYLoader();
const objLoader = new OBJLoader();
const stlLoader = new STLLoader();

/**
 * Prepares and optimizes meshes in an Object3D hierarchy:
 * - Enables frustum culling
 * - Pre-computes bounding box and bounding sphere for accurate spatial clipping
 * - Configures shadow casting/receiving
 */
export function optimizeMeshHierarchy(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      child.frustumCulled = true;
      child.castShadow = true;
      child.receiveShadow = true;

      const geom = child.geometry;
      if (geom) {
        if (!geom.boundingSphere) {
          geom.computeBoundingSphere();
        }
        if (!geom.boundingBox) {
          geom.computeBoundingBox();
        }
      }
    }
  });
}

/**
 * Calculates statistics (triangles, vertices, mesh count, materials, size) for an Object3D.
 */
export function calculateModelStats(object: THREE.Object3D): ModelStats {
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  const materialSet = new Set<string>();

  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
      meshes++;
      child.frustumCulled = true;
      child.castShadow = true;
      child.receiveShadow = true;

      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => materialSet.add(m.uuid));
        } else {
          materialSet.add(child.material.uuid);
        }
      }

      const geom = child.geometry;
      if (geom) {
        if (!geom.boundingSphere) {
          geom.computeBoundingSphere();
        }
        if (!geom.boundingBox) {
          geom.computeBoundingBox();
        }

        if (geom.index) {
          triangles += geom.index.count / 3;
        } else if (geom.attributes.position) {
          triangles += geom.attributes.position.count / 3;
        }
        if (geom.attributes.position) {
          vertices += geom.attributes.position.count;
        }
      }
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());

  return {
    triangles: Math.round(triangles),
    vertices,
    meshes,
    materials: materialSet.size,
    size: { x: size.x, y: size.y, z: size.z },
  };
}

/**
 * Centers an object and aligns its bottom to Y=0 ground plane.
 */
export function normalizeModelPosition(object: THREE.Object3D, existingModels: LoadedModel[]): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Center horizontally and depth-wise
  object.position.x -= center.x;
  object.position.y -= center.y;
  object.position.z -= center.z;

  // Place bottom on ground plane Y=0
  const updatedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= updatedBox.min.y;

  // Auto-offset along X axis if other models exist
  if (existingModels.length > 0) {
    const maxX = Math.max(...existingModels.map((m) => m.object.position.x));
    const offset = Math.max(size.x, size.z, 2) + 1.2;
    object.position.x = maxX + offset;
  }
}

/**
 * Loads a 3D model file and returns a LoadedModel object.
 * Processes via the globalModelLoadingQueue to limit concurrent decodes to 2 max.
 */
export async function loadModelFile(file: File, existingModels: LoadedModel[]): Promise<LoadedModel> {
  return globalModelLoadingQueue.enqueue(async () => {
    const filename = file.name;
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const url = URL.createObjectURL(file);

    let object: THREE.Object3D | null = null;
    let animations: THREE.AnimationClip[] = [];

    try {
      if (ext === 'glb' || ext === 'gltf') {
        const gltf = await gltfLoader.loadAsync(url);
        object = gltf.scene;
        animations = gltf.animations || [];
      } else if (ext === 'fbx') {
        const fbx = await fbxLoader.loadAsync(url);
        object = fbx;
        animations = fbx.animations || [];
      } else if (ext === 'ply') {
        if (globalDecoderWorkerPool.available) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const res = await globalDecoderWorkerPool.decode('ply', { buffer: arrayBuffer });
            if (res.positions) {
              const geom = new THREE.BufferGeometry();
              geom.setAttribute('position', new THREE.BufferAttribute(res.positions, 3));
              if (res.normals) geom.setAttribute('normal', new THREE.BufferAttribute(res.normals, 3));
              else geom.computeVertexNormals();
              if (res.colors) geom.setAttribute('color', new THREE.BufferAttribute(res.colors, 3));
              if (res.indices) geom.setIndex(new THREE.BufferAttribute(res.indices, 1));
              geom.computeBoundingSphere();
              geom.computeBoundingBox();

              if (!res.isPoints) {
                const mat = new THREE.MeshStandardMaterial({
                  color: 0x94a3b8,
                  roughness: 0.35,
                  metalness: 0.25,
                  vertexColors: !!res.colors,
                });
                object = new THREE.Mesh(geom, mat);
              } else {
                const mat = new THREE.PointsMaterial({
                  size: 0.05,
                  vertexColors: !!res.colors,
                  color: res.colors ? 0xffffff : 0x3b82f6,
                });
                object = new THREE.Points(geom, mat);
              }
            }
          } catch (workerErr) {
            console.warn('Worker PLY decoding error, using fallback:', workerErr);
          }
        }

        if (!object) {
          const geom = await plyLoader.loadAsync(url);
          geom.computeVertexNormals();
          if (geom.index || (geom.attributes.normal && geom.attributes.position.count > 500)) {
            const mat = new THREE.MeshStandardMaterial({
              color: 0x94a3b8,
              roughness: 0.35,
              metalness: 0.25,
              vertexColors: !!geom.attributes.color,
            });
            object = new THREE.Mesh(geom, mat);
          } else {
            const mat = new THREE.PointsMaterial({
              size: 0.05,
              vertexColors: !!geom.attributes.color,
              color: geom.attributes.color ? 0xffffff : 0x3b82f6,
            });
            object = new THREE.Points(geom, mat);
          }
        }
      } else if (ext === 'spz') {
        const geom = await decodeSPZ(file);
        const mat = new THREE.PointsMaterial({
          size: 0.04,
          vertexColors: true,
        });
        object = new THREE.Points(geom, mat);
      } else if (ext === 'obj') {
        if (globalDecoderWorkerPool.available) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const res = await globalDecoderWorkerPool.decode('obj', { buffer: arrayBuffer });
            if (res.meshes && res.meshes.length > 0) {
              const group = new THREE.Group();
              for (const m of res.meshes) {
                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
                if (m.normals) geom.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
                else geom.computeVertexNormals();
                if (m.uvs) geom.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
                if (m.colors) geom.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
                if (m.indices) geom.setIndex(new THREE.BufferAttribute(m.indices, 1));
                geom.computeBoundingSphere();
                geom.computeBoundingBox();

                const mat = new THREE.MeshStandardMaterial({
                  color: 0x94a3b8,
                  roughness: 0.35,
                  metalness: 0.25,
                  vertexColors: !!m.colors,
                });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.name = m.name;
                group.add(mesh);
              }
              object = group;
            }
          } catch (workerErr) {
            console.warn('Worker OBJ decoding error, using fallback:', workerErr);
          }
        }

        if (!object) {
          object = await objLoader.loadAsync(url);
        }
      } else if (ext === 'stl') {
        if (globalDecoderWorkerPool.available) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const res = await globalDecoderWorkerPool.decode('stl', { buffer: arrayBuffer });
            if (res.positions) {
              const geom = new THREE.BufferGeometry();
              geom.setAttribute('position', new THREE.BufferAttribute(res.positions, 3));
              if (res.normals) geom.setAttribute('normal', new THREE.BufferAttribute(res.normals, 3));
              else geom.computeVertexNormals();
              geom.computeBoundingSphere();
              geom.computeBoundingBox();

              const mat = new THREE.MeshStandardMaterial({
                color: 0x94a3b8,
                roughness: 0.35,
                metalness: 0.2,
              });
              object = new THREE.Mesh(geom, mat);
            }
          } catch (workerErr) {
            console.warn('Worker STL decoding error, using fallback:', workerErr);
          }
        }

        if (!object) {
          const geom = await stlLoader.loadAsync(url);
          geom.computeVertexNormals();
          const mat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.35,
            metalness: 0.2,
          });
          object = new THREE.Mesh(geom, mat);
        }
      } else if (ext === 'ts' || ext === 'js') {
        const code = await file.text();
        object = await executeThreeScript(code, filename);
      } else {
        throw new Error(
          `Unsupported file format: .${ext}. Supported formats are .glb, .gltf, .fbx, .ply, .spz, .obj, .stl, .ts, .js`
        );
      }

      if (!object) {
        throw new Error(`Failed to parse 3D model geometry for ${filename}`);
      }

      optimizeMeshHierarchy(object);
      normalizeModelPosition(object, existingModels);
      const stats = calculateModelStats(object);

      const modelId = `model_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      return {
        id: modelId,
        name: filename,
        object,
        visible: true,
        stats,
        animations,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
}

/**
 * Creates a procedural 3D demo sculpture.
 */
export function createDemoModel(existingModels: LoadedModel[]): LoadedModel {
  const group = new THREE.Group();

  // Central Glossy Torus Knot
  const torusGeo = new THREE.TorusKnotGeometry(0.8, 0.24, 128, 20);
  const torusMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.1,
    metalness: 0.85,
  });
  const torusMesh = new THREE.Mesh(torusGeo, torusMat);
  torusMesh.position.y = 1.3;
  torusMesh.castShadow = true;
  group.add(torusMesh);

  // Orbiting Satellites (Spheres & Octahedrons)
  const colors = [0xef4444, 0x10b981, 0xf59e0b, 0xa855f7];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const geom =
      i % 2 === 0
        ? new THREE.SphereGeometry(0.22, 32, 32)
        : new THREE.OctahedronGeometry(0.25, 0);

    const mat = new THREE.MeshStandardMaterial({
      color: colors[i],
      roughness: 0.2,
      metalness: 0.6,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(Math.cos(angle) * 1.8, 1.3 + Math.sin(angle * 2) * 0.2, Math.sin(angle) * 1.8);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Futuristic Base Pedestal
  const baseGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.35, 32);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.5,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = 0.175;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  optimizeMeshHierarchy(group);
  normalizeModelPosition(group, existingModels);
  const stats = calculateModelStats(group);

  const modelNumber = existingModels.length + 1;
  const modelId = `demo_model_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  return {
    id: modelId,
    name: `Procedural_Sculpture_${modelNumber}.glb`,
    object: group,
    visible: true,
    stats,
    animations: [],
  };
}

/**
 * Comprehensive cleanup function that recursively traverses a Three.js scene or Object3D hierarchy,
 * deeply disposing of all BufferGeometry instances, materials, textures, WebGL render targets,
 * shadow maps, skeletons, and animation buffers to strictly prevent WebGL memory leaks.
 */
export function disposeSceneHierarchy(
  root: THREE.Object3D | THREE.Scene,
  renderer?: THREE.WebGLRenderer
): void {
  if (!root) return;

  const disposedTextures = new Set<string>();
  const disposedMaterials = new Set<string>();
  const disposedGeometries = new Set<string>();
  const disposedRenderTargets = new Set<string>();

  const disposeTexture = (tex: any) => {
    if (!tex || typeof tex !== 'object' || disposedTextures.has(tex.uuid)) return;
    disposedTextures.add(tex.uuid);

    try {
      if (typeof tex.dispose === 'function') {
        tex.dispose();
      }
      if (tex.image) {
        if (typeof (tex.image as ImageBitmap).close === 'function') {
          (tex.image as ImageBitmap).close();
        }
        tex.image = null;
      }
      if (tex.source) {
        if (tex.source.data && typeof (tex.source.data as ImageBitmap).close === 'function') {
          (tex.source.data as ImageBitmap).close();
        }
        tex.source.data = null;
      }
    } catch (e) {
      console.warn('Error disposing texture:', e);
    }
  };

  const disposeRenderTarget = (target: any) => {
    if (!target || typeof target !== 'object' || disposedRenderTargets.has(target.uuid)) return;
    disposedRenderTargets.add(target.uuid);

    try {
      if (target.texture) disposeTexture(target.texture);
      if (target.depthTexture) disposeTexture(target.depthTexture);
      if (typeof target.dispose === 'function') {
        target.dispose();
      }
    } catch (e) {
      console.warn('Error disposing render target:', e);
    }
  };

  const disposeMaterial = (mat: THREE.Material) => {
    if (!mat || typeof mat !== 'object' || disposedMaterials.has(mat.uuid)) return;
    disposedMaterials.add(mat.uuid);

    const matAny = mat as any;

    const textureProps = [
      'map',
      'lightMap',
      'aoMap',
      'bumpMap',
      'normalMap',
      'specularMap',
      'specularColorMap',
      'specularIntensityMap',
      'envMap',
      'alphaMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'displacementMap',
      'clearcoatMap',
      'clearcoatRoughnessMap',
      'clearcoatNormalMap',
      'transmissionMap',
      'thicknessMap',
      'sheenColorMap',
      'sheenRoughnessMap',
      'iridescenceMap',
      'iridescenceThicknessMap',
      'anisotropyMap',
      'gradientMap',
    ];

    for (const prop of textureProps) {
      if (matAny[prop]) {
        disposeTexture(matAny[prop]);
        matAny[prop] = null;
      }
    }

    if (matAny.uniforms && typeof matAny.uniforms === 'object') {
      for (const key of Object.keys(matAny.uniforms)) {
        const uniformVal = matAny.uniforms[key]?.value;
        if (uniformVal) {
          if (uniformVal.isTexture || uniformVal instanceof THREE.Texture) {
            disposeTexture(uniformVal);
          } else if (uniformVal.isWebGLRenderTarget || uniformVal instanceof THREE.WebGLRenderTarget) {
            disposeRenderTarget(uniformVal);
          } else if (Array.isArray(uniformVal)) {
            uniformVal.forEach((item) => {
              if (item?.isTexture || item instanceof THREE.Texture) disposeTexture(item);
              else if (item?.isWebGLRenderTarget || item instanceof THREE.WebGLRenderTarget) disposeRenderTarget(item);
            });
          }
        }
      }
    }

    try {
      mat.dispose();
    } catch (e) {
      console.warn('Error disposing material:', e);
    }
  };

  const disposeGeometry = (geom: THREE.BufferGeometry) => {
    if (!geom || typeof geom !== 'object' || disposedGeometries.has(geom.uuid)) return;
    disposedGeometries.add(geom.uuid);

    try {
      if (geom.attributes) {
        for (const attrName of Object.keys(geom.attributes)) {
          const attr = geom.attributes[attrName];
          if (attr && typeof (attr as any).dispose === 'function') {
            (attr as any).dispose();
          }
        }
      }
      if (geom.index && typeof (geom.index as any).dispose === 'function') {
        (geom.index as any).dispose();
      }
      geom.dispose();
    } catch (e) {
      console.warn('Error disposing geometry:', e);
    }
  };

  root.traverse((child: any) => {
    // 1. BufferGeometry
    if (child.geometry && child.geometry instanceof THREE.BufferGeometry) {
      disposeGeometry(child.geometry);
    }

    // 2. Materials
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m: THREE.Material) => disposeMaterial(m));
      } else {
        disposeMaterial(child.material);
      }
    }

    // 3. Skeletons and bone textures
    if (child.skeleton) {
      if (child.skeleton.boneTexture) {
        disposeTexture(child.skeleton.boneTexture);
      }
      if (typeof child.skeleton.dispose === 'function') {
        child.skeleton.dispose();
      }
    }

    // 4. Lights with shadow map render targets
    if (child.isLight && child.shadow) {
      if (child.shadow.map) {
        disposeRenderTarget(child.shadow.map);
        child.shadow.map = null;
      }
    }

    // 5. Render targets on cameras / custom objects
    if (child.renderTarget) {
      disposeRenderTarget(child.renderTarget);
    }
  });

  if (renderer) {
    try {
      renderer.renderLists?.dispose?.();
    } catch {
      // ignore
    }
  }

  if (root.parent) {
    root.parent.remove(root);
  }
}

/**
 * Traverses an Object3D hierarchy and deeply disposes all geometries, textures,
 * materials, render targets, and skeleton buffers to prevent VRAM memory leaks.
 */
export function dispose3DObject(object: THREE.Object3D, renderer?: THREE.WebGLRenderer): void {
  disposeSceneHierarchy(object, renderer);
}

/**
 * Dynamically transpiles and executes a Three.js TypeScript or JavaScript script.
 * Sucrase is loaded dynamically only when a script is executed to maintain bundle splitting.
 */
export async function executeThreeScript(code: string, filename: string): Promise<THREE.Object3D> {
  // 1. Dynamic Dependency Loading
  const { transform } = await import('sucrase');

  // 2. TypeScript & CommonJS Module Transpilation
  let transpiled: string;
  try {
    transpiled = transform(code, { transforms: ['typescript', 'imports'] }).code;
  } catch (err: any) {
    throw new Error(`Syntax error in "${filename}": ${err?.message || err}`);
  }

  // Execution sandbox with mock require
  const customRequire = (moduleName: string) => {
    if (moduleName === 'three' || moduleName.startsWith('three/')) return THREE;
    throw new Error(`Module "${moduleName}" cannot be resolved. Only "three" is supported.`);
  };

  const moduleObj: { exports: any } = { exports: {} };
  const exportsObj = moduleObj.exports;

  try {
    const fn = new Function('THREE', 'require', 'exports', 'module', transpiled);
    fn(THREE, customRequire, exportsObj, moduleObj);
  } catch (err: any) {
    throw new Error(`Execution error in "${filename}": ${err?.message || err}`);
  }

  // 3. Extract model from module.exports.default, named export functions (e.g., createModel(), default()),
  // or direct Object3D exports. Ensure output instanceof THREE.Object3D.
  let output: any = null;
  const modExports = moduleObj.exports;

  if (modExports instanceof THREE.Object3D) {
    output = modExports;
  } else if (typeof modExports === 'function') {
    output = modExports();
  } else if (modExports && typeof modExports === 'object') {
    if (modExports.default instanceof THREE.Object3D) {
      output = modExports.default;
    } else if (typeof modExports.default === 'function') {
      output = modExports.default();
    } else if (typeof modExports.createModel === 'function') {
      output = modExports.createModel();
    } else if (modExports.model instanceof THREE.Object3D) {
      output = modExports.model;
    } else if (typeof modExports.model === 'function') {
      output = modExports.model();
    } else if (modExports.scene instanceof THREE.Object3D) {
      output = modExports.scene;
    } else {
      // Check other exported properties or functions
      for (const key of Object.keys(modExports)) {
        if (key === '__esModule') continue;
        const candidate = modExports[key];
        if (candidate instanceof THREE.Object3D) {
          output = candidate;
          break;
        } else if (typeof candidate === 'function') {
          try {
            const res = candidate();
            if (res instanceof THREE.Object3D || res instanceof Promise) {
              output = res;
              break;
            }
          } catch {
            // Non-instantiating function, proceed to next
          }
        }
      }
    }
  }

  // Support async function / Promise returning THREE.Object3D
  if (output instanceof Promise) {
    output = await output;
  }

  if (!(output instanceof THREE.Object3D)) {
    throw new Error(
      `No valid THREE.Object3D is returned from "${filename}". Make sure to export a THREE.Object3D instance or a function like "export default () => new THREE.Mesh(...)" or "export function createModel()".`
    );
  }

  return output;
}

/**
 * Creates a sample TypeScript script file that dynamically creates a procedural 3D sculpture.
 */
export function createSampleScriptFile(): File {
  const sampleScript = `import * as THREE from 'three';

/**
 * Procedural Cyber Crystal with Quantum Orbital Rings
 * Generated dynamically via Three.js TypeScript execution!
 */
export function createModel(): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'CyberCrystal_TS_Group';

  // 1. Central Prismatic Core
  const coreGeo = new THREE.OctahedronGeometry(1.2, 0);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0369a1,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.2,
    transmission: 0.65,
    ior: 1.52,
    thickness: 1.5,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 1.5;
  core.castShadow = true;
  group.add(core);

  // 2. Translucent Faceted Outer Cage
  const cageGeo = new THREE.IcosahedronGeometry(1.45, 1);
  const cageMat = new THREE.MeshBasicMaterial({
    color: 0x818cf8,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
  });
  const cage = new THREE.Mesh(cageGeo, cageMat);
  cage.position.y = 1.5;
  group.add(cage);

  // 3. Orbital Gyroscope Rings
  const ringGeo = new THREE.TorusGeometry(1.9, 0.045, 16, 100);
  
  const ring1 = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.2,
      metalness: 0.85,
    })
  );
  ring1.position.y = 1.5;
  ring1.rotation.x = Math.PI / 3;
  group.add(ring1);

  const ring2 = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.2,
      metalness: 0.85,
    })
  );
  ring2.position.y = 1.5;
  ring2.rotation.y = Math.PI / 3;
  group.add(ring2);

  // 4. Futuristic Base Pedestal
  const baseGeo = new THREE.CylinderGeometry(1.4, 1.7, 0.3, 32);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.6,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = 0.15;
  base.receiveShadow = true;
  group.add(base);

  return group;
}

export default createModel;
`;

  return new File([sampleScript], 'Procedural_CyberCrystal.ts', {
    type: 'application/typescript',
  });
}
