import * as THREE from 'three';

export interface ModelStats {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  size: { x: number; y: number; z: number };
}

export interface LoadedModel {
  id: string;
  name: string;
  object: THREE.Object3D;
  visible: boolean;
  wireframeOnly?: boolean;
  stats: ModelStats;
  animations: THREE.AnimationClip[];
  isScript?: boolean;
}

export interface TransformValues {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number; // degrees
  rotY: number; // degrees
  rotZ: number; // degrees
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  uniformScale: boolean;
}

export type GizmoMode = 'translate' | 'rotate' | 'scale' | null;
export type TransformSpace = 'world' | 'local';
export type LightingPreset = 'studio' | 'sunset' | 'night' | 'outdoor' | 'neon';
export type RenderMode = 'default' | 'wireframe' | 'normals' | 'xray' | 'points';
export type CameraView = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'isometric';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

export type SupportedFileFormat =
  | 'glb'
  | 'gltf'
  | 'fbx'
  | 'ply'
  | 'spz'
  | 'obj'
  | 'stl'
  | 'ts'
  | 'js';

export const SUPPORTED_FILE_EXTENSIONS: readonly SupportedFileFormat[] = [
  'glb',
  'gltf',
  'fbx',
  'ply',
  'spz',
  'obj',
  'stl',
  'ts',
  'js',
] as const;

export const ACCEPTED_FILE_EXTENSIONS = '.glb,.gltf,.fbx,.ply,.spz,.obj,.stl,.ts,.js,text/javascript,application/javascript,application/typescript';
