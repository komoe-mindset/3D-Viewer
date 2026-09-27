import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  LoadedModel,
  TransformValues,
  GizmoMode,
  TransformSpace,
  LightingPreset,
  RenderMode,
  CameraView,
} from '../types';
import { dispose3DObject } from '../utils/modelLoaders';

interface Viewport3DProps {
  models: LoadedModel[];
  selectedModelId: string | null;
  transformValues: TransformValues;
  gizmoMode: GizmoMode;
  transformSpace: TransformSpace;
  lightingPreset: LightingPreset;
  lightIntensity: number;
  bgColor: string;
  renderMode: RenderMode;
  showGrid: boolean;
  showAxes: boolean;
  pointSize: number;
  autoRotate: boolean;
  rotateSpeed: number;
  showBBox: boolean;
  activeAnimIndex: number;
  isAnimPlaying: boolean;
  animSpeed: number;
  isOrthographic?: boolean;
  onSelectModel: (id: string | null) => void;
  onTransformChange: (values: Partial<TransformValues>) => void;
  onFpsUpdate?: (fps: number) => void;
  cameraQuaternionRef?: React.MutableRefObject<THREE.Quaternion>;
}

export interface ViewportHandle {
  focusModel: (id?: string) => void;
  focusAll: () => void;
  setCameraView: (view: CameraView) => void;
  orbit: (deltaX: number, deltaY: number) => void;
  dolly: (deltaY: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  captureScreenshot: () => string;
  requestRender: () => void;
}

export const Viewport3D = React.forwardRef<ViewportHandle, Viewport3DProps>(
  (
    {
      models,
      selectedModelId,
      transformValues,
      gizmoMode,
      transformSpace,
      lightingPreset,
      lightIntensity,
      bgColor,
      renderMode,
      showGrid,
      showAxes,
      pointSize,
      autoRotate,
      rotateSpeed,
      showBBox,
      activeAnimIndex,
      isAnimPlaying,
      animSpeed,
      isOrthographic = false,
      onSelectModel,
      onTransformChange,
      onFpsUpdate,
      cameraQuaternionRef,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // On-demand rendering request frame counter
    const needsRenderRef = useRef<number>(3);
    const requestRender = useCallback(() => {
      needsRenderRef.current = Math.max(needsRenderRef.current, 3);
    }, []);

    // Track override materials created for custom render modes (wireframe/normals/xray/points)
    const overrideMaterialsRef = useRef<THREE.Material[]>([]);

    // Track previously mounted model Object3D instances for safe GPU memory disposal
    const prevModelsMapRef = useRef<Map<string, THREE.Object3D>>(new Map());

    // Camera target position transition ref
    const targetCameraPos = useRef<THREE.Vector3 | null>(null);
    const targetControlsTarget = useRef<THREE.Vector3 | null>(null);

    // Three.js instances ref
    const threeRef = useRef<{
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      orthoCamera: THREE.OrthographicCamera;
      activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
      renderer: THREE.WebGLRenderer;
      controls: OrbitControls;
      transformControls: TransformControls;
      gridHelper: THREE.GridHelper;
      groundAxesHelper: THREE.Group;
      axesHelper: THREE.AxesHelper;
      bboxHelper: THREE.BoxHelper | null;
      ambientLight: THREE.AmbientLight;
      hemiLight: THREE.HemisphereLight;
      dirLight: THREE.DirectionalLight;
      dirLight2: THREE.DirectionalLight;
      mixer: THREE.AnimationMixer | null;
      currentAction: THREE.AnimationAction | null;
      clock: THREE.Clock;
      originalMaterials: Map<string, THREE.Material | THREE.Material[]>;
      pointerDownPos: { x: number; y: number };
      frameCount: number;
      lastTime: number;
    } | null>(null);

    // Stable references to props
    const propsRef = useRef({
      models,
      selectedModelId,
      gizmoMode,
      transformSpace,
      onSelectModel,
      onTransformChange,
      autoRotate,
      rotateSpeed,
      onFpsUpdate,
      isAnimPlaying,
    });

    useEffect(() => {
      propsRef.current = {
        models,
        selectedModelId,
        gizmoMode,
        transformSpace,
        onSelectModel,
        onTransformChange,
        autoRotate,
        rotateSpeed,
        onFpsUpdate,
        isAnimPlaying,
      };
      requestRender();
    });

    // Helper to safely dispose temporary override materials
    const disposeOverrideMaterials = useCallback(() => {
      if (overrideMaterialsRef.current.length > 0) {
        overrideMaterialsRef.current.forEach((mat) => {
          if (mat && typeof mat.dispose === 'function') {
            mat.dispose();
          }
        });
        overrideMaterialsRef.current = [];
      }
    }, []);

    // Initialize Three.js scene
    useEffect(() => {
      if (!canvasRef.current || !containerRef.current) return;

      const canvas = canvasRef.current;
      const width = containerRef.current.clientWidth || window.innerWidth;
      const height = containerRef.current.clientHeight || window.innerHeight;

      // 1. Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(bgColor);

      // 2. Camera (Perspective & Orthographic)
      const aspect = width / height;
      const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      camera.position.set(4, 3, 6);

      const frustumHeight = 5;
      const frustumWidth = frustumHeight * aspect;
      const orthoCamera = new THREE.OrthographicCamera(
        -frustumWidth / 2,
        frustumWidth / 2,
        frustumHeight / 2,
        -frustumHeight / 2,
        0.01,
        1000
      );
      orthoCamera.position.copy(camera.position);
      orthoCamera.quaternion.copy(camera.quaternion);

      const activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = isOrthographic
        ? orthoCamera
        : camera;

      // 3. Renderer with capped DPR
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;

      // 4. OrbitControls with change listener for on-demand rendering
      const controls = new OrbitControls(activeCamera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.maxDistance = 300;
      controls.minDistance = 0.15;

      controls.addEventListener('change', () => {
        requestRender();
      });

      // 5. TransformControls
      const transformControls = new TransformControls(activeCamera, renderer.domElement);
      transformControls.size = 0.85;
      const gizmoHelper = typeof (transformControls as any).getHelper === 'function' 
        ? (transformControls as any).getHelper() 
        : (transformControls as unknown as THREE.Object3D);
      scene.add(gizmoHelper);

      transformControls.addEventListener('change', () => {
        requestRender();
      });

      // Disable orbit controls while dragging gizmo
      transformControls.addEventListener('dragging-changed', (event) => {
        controls.enabled = !event.value;
        requestRender();
      });

      // Synchronize changes made with gizmo back to React state
      transformControls.addEventListener('objectChange', () => {
        const target = transformControls.object;
        if (!target) return;

        const posX = target.position.x;
        const posY = target.position.y;
        const posZ = target.position.z;

        const rotX = THREE.MathUtils.radToDeg(target.rotation.x);
        const rotY = THREE.MathUtils.radToDeg(target.rotation.y);
        const rotZ = THREE.MathUtils.radToDeg(target.rotation.z);

        const scaleX = target.scale.x;
        const scaleY = target.scale.y;
        const scaleZ = target.scale.z;

        propsRef.current.onTransformChange({
          posX,
          posY,
          posZ,
          rotX,
          rotY,
          rotZ,
          scaleX,
          scaleY,
          scaleZ,
        });

        // Update BoxHelper if visible
        if (threeRef.current?.bboxHelper) {
          threeRef.current.bboxHelper.update();
        }
        requestRender();
      });

      // 6. Optimized Lights (Blender Studio 3-Point Setup with 1024x1024 shadow map)
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x303030, 0.5);
      hemiLight.position.set(0, 20, 0);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(5, 12, 7);
      dirLight.castShadow = true;
      // Optimized shadow map resolution to reduce GPU memory footprint
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 35;
      dirLight.shadow.camera.left = -14;
      dirLight.shadow.camera.right = 14;
      dirLight.shadow.camera.top = 14;
      dirLight.shadow.camera.bottom = -14;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
      scene.add(dirLight);

      const dirLight2 = new THREE.DirectionalLight(0xe2e8f0, 0.4);
      dirLight2.position.set(-5, 6, -5);
      scene.add(dirLight2);

      // 7. Floor Grid (Blender Style)
      const gridHelper = new THREE.GridHelper(30, 30, 0x555555, 0x3d3d3d);
      gridHelper.position.y = -0.002;
      scene.add(gridHelper);

      // Blender Ground Coordinates: Red X-axis & Green Y/Z-axis intersecting cleanly at origin
      const groundAxesHelper = new THREE.Group();

      const xLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-15, 0, 0),
        new THREE.Vector3(15, 0, 0),
      ]);
      const xLineMat = new THREE.LineBasicMaterial({ color: 0xdc2626, linewidth: 2 });
      const xGroundLine = new THREE.Line(xLineGeo, xLineMat);
      groundAxesHelper.add(xGroundLine);

      const zLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, -15),
        new THREE.Vector3(0, 0, 15),
      ]);
      const zLineMat = new THREE.LineBasicMaterial({ color: 0x16a34a, linewidth: 2 });
      const zGroundLine = new THREE.Line(zLineGeo, zLineMat);
      groundAxesHelper.add(zGroundLine);

      groundAxesHelper.position.y = -0.001;
      scene.add(groundAxesHelper);

      // 8. Axes Helper
      const axesHelper = new THREE.AxesHelper(3);
      axesHelper.visible = false;
      scene.add(axesHelper);

      // 9. Raycasting on canvas click for model selection
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const handlePointerDown = (e: MouseEvent) => {
        if (!threeRef.current) return;
        threeRef.current.pointerDownPos = { x: e.clientX, y: e.clientY };
      };

      const handlePointerUp = (e: MouseEvent) => {
        if (!threeRef.current) return;
        const dx = Math.abs(e.clientX - threeRef.current.pointerDownPos.x);
        const dy = Math.abs(e.clientY - threeRef.current.pointerDownPos.y);

        // Only treat as a click if mouse didn't drag extensively
        if (dx < 6 && dy < 6 && !transformControls.dragging) {
          const rect = canvas.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

          const currentCam = threeRef.current.activeCamera || camera;
          raycaster.setFromCamera(mouse, currentCam);

          const currentModels = propsRef.current.models;
          const rootObjects = currentModels.filter((m) => m.visible).map((m) => m.object);

          const intersects = raycaster.intersectObjects(rootObjects, true);

          if (intersects.length > 0) {
            let clickedObj: THREE.Object3D | null = intersects[0].object;
            let matchedModel: LoadedModel | undefined;

            while (clickedObj) {
              matchedModel = currentModels.find((m) => m.object === clickedObj);
              if (matchedModel) break;
              clickedObj = clickedObj.parent;
            }

            if (matchedModel) {
              propsRef.current.onSelectModel(matchedModel.id);
              requestRender();
            }
          }
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointerup', handlePointerUp);

      const clock = new THREE.Clock();

      threeRef.current = {
        scene,
        camera,
        orthoCamera,
        activeCamera,
        renderer,
        controls,
        transformControls,
        gridHelper,
        groundAxesHelper,
        axesHelper,
        bboxHelper: null,
        ambientLight,
        hemiLight,
        dirLight,
        dirLight2,
        mixer: null,
        currentAction: null,
        clock,
        originalMaterials: new Map(),
        pointerDownPos: { x: 0, y: 0 },
        frameCount: 0,
        lastTime: performance.now(),
      };

      // Resize observer with DPR capping
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          const h = entry.contentRect.height;
          if (w > 0 && h > 0 && threeRef.current) {
            const currentAspect = w / h;
            camera.aspect = currentAspect;
            camera.updateProjectionMatrix();

            const dist = camera.position.distanceTo(controls.target);
            const hHalf = Math.max(0.5, dist * Math.tan((45 / 2) * (Math.PI / 180)));
            const wHalf = hHalf * currentAspect;
            orthoCamera.left = -wHalf;
            orthoCamera.right = wHalf;
            orthoCamera.top = hHalf;
            orthoCamera.bottom = -hHalf;
            orthoCamera.updateProjectionMatrix();

            renderer.setSize(w, h);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            requestRender();
          }
        }
      });
      resizeObserver.observe(containerRef.current);

      // On-Demand & Continuous Adaptive Render Loop
      let animId: number;
      const animate = () => {
        animId = requestAnimationFrame(animate);

        const isAutoRotating = propsRef.current.autoRotate && propsRef.current.models.length > 0;
        const isPlayingAnim = propsRef.current.isAnimPlaying && !!threeRef.current?.mixer;
        const isLerping = !!targetCameraPos.current || !!targetControlsTarget.current;
        const isInteracting =
          (threeRef.current?.controls as any)?.state !== -1 ||
          (threeRef.current?.transformControls as any)?.dragging;

        const shouldRender =
          isAutoRotating ||
          isPlayingAnim ||
          isLerping ||
          isInteracting ||
          needsRenderRef.current > 0;

        if (needsRenderRef.current > 0) {
          needsRenderRef.current--;
        }

        if (!shouldRender) {
          return;
        }

        const delta = clock.getDelta();

        // FPS Calculation
        if (threeRef.current) {
          threeRef.current.frameCount++;
          const now = performance.now();
          if (now - threeRef.current.lastTime >= 500) {
            const currentFps = Math.round(
              (threeRef.current.frameCount * 1000) / (now - threeRef.current.lastTime)
            );
            if (propsRef.current.onFpsUpdate) {
              propsRef.current.onFpsUpdate(currentFps);
            }
            threeRef.current.frameCount = 0;
            threeRef.current.lastTime = now;
          }
        }

        const currentActiveCam = threeRef.current?.activeCamera || camera;

        // Smooth camera transition if active
        if (targetCameraPos.current && targetControlsTarget.current) {
          currentActiveCam.position.lerp(targetCameraPos.current, 0.14);
          controls.target.lerp(targetControlsTarget.current, 0.14);

          if (
            currentActiveCam.position.distanceTo(targetCameraPos.current) < 0.005 &&
            controls.target.distanceTo(targetControlsTarget.current) < 0.005
          ) {
            currentActiveCam.position.copy(targetCameraPos.current);
            controls.target.copy(targetControlsTarget.current);
            targetCameraPos.current = null;
            targetControlsTarget.current = null;
          }
          requestRender();
        }

        // Update ViewportGizmo quaternion ref
        if (cameraQuaternionRef) {
          cameraQuaternionRef.current.copy(currentActiveCam.quaternion);
        }

        // Update animation mixer if playing
        if (isPlayingAnim && threeRef.current?.mixer) {
          threeRef.current.mixer.update(delta);
          requestRender();
        }

        // Auto rotate logic
        if (isAutoRotating) {
          propsRef.current.models.forEach((m) => {
            if (m.visible && m.object) {
              m.object.rotation.y += 0.006 * propsRef.current.rotateSpeed;
            }
          });
          requestRender();
        }

        const controlsChanged = controls.update();
        if (controlsChanged) {
          requestRender();
        }

        renderer.render(scene, currentActiveCam);
      };
      animate();

      return () => {
        cancelAnimationFrame(animId);
        resizeObserver.disconnect();
        canvas.removeEventListener('pointerdown', handlePointerDown);
        canvas.removeEventListener('pointerup', handlePointerUp);

        disposeOverrideMaterials();

        // Explicit cleanup of scene objects, helpers, and renderer
        if (threeRef.current) {
          const { gridHelper, groundAxesHelper, axesHelper, bboxHelper, transformControls, renderer, scene } = threeRef.current;
          
          if (gridHelper) {
            gridHelper.geometry?.dispose();
            if (Array.isArray(gridHelper.material)) gridHelper.material.forEach((m) => m.dispose());
            else gridHelper.material?.dispose();
          }

          if (groundAxesHelper) {
            groundAxesHelper.traverse((child: any) => {
              if (child.geometry) child.geometry.dispose();
              if (child.material) child.material.dispose();
            });
          }

          if (axesHelper) {
            axesHelper.geometry?.dispose();
            (axesHelper.material as any)?.dispose?.();
          }

          if (bboxHelper) {
            bboxHelper.geometry?.dispose();
            (bboxHelper.material as any)?.dispose?.();
          }

          transformControls.dispose();
          renderer.dispose();
          scene.clear();
        }
      };
    }, [disposeOverrideMaterials, requestRender]);

    // Sync Orthographic Projection Mode
    useEffect(() => {
      if (!threeRef.current || !containerRef.current) return;
      const { camera, orthoCamera, controls, transformControls } = threeRef.current;
      const w = containerRef.current.clientWidth || window.innerWidth;
      const h = containerRef.current.clientHeight || window.innerHeight;
      const aspect = w / h;

      if (isOrthographic) {
        const dist = camera.position.distanceTo(controls.target);
        const halfH = Math.max(0.5, dist * Math.tan((45 / 2) * (Math.PI / 180)));
        const halfW = halfH * aspect;
        orthoCamera.left = -halfW;
        orthoCamera.right = halfW;
        orthoCamera.top = halfH;
        orthoCamera.bottom = -halfH;
        orthoCamera.position.copy(camera.position);
        orthoCamera.quaternion.copy(camera.quaternion);
        orthoCamera.updateProjectionMatrix();

        controls.object = orthoCamera;
        (transformControls as any).camera = orthoCamera;
        threeRef.current.activeCamera = orthoCamera;
      } else {
        camera.position.copy(orthoCamera.position);
        camera.quaternion.copy(orthoCamera.quaternion);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        controls.object = camera;
        (transformControls as any).camera = camera;
        threeRef.current.activeCamera = camera;
      }
      controls.update();
      requestRender();
    }, [isOrthographic, requestRender]);

    // Sync Scene Models, Meshes, and Frustum Culling
    useEffect(() => {
      if (!threeRef.current) return;
      const { scene, originalMaterials } = threeRef.current;

      // 1. Before mounting new or updated models, safely traverse and dispose of previous geometries,
      // materials, and textures to prevent WebGL GPU memory leaks.
      const currentModelMap = new Map(models.map((m) => [m.id, m.object]));
      prevModelsMapRef.current.forEach((prevObj, id) => {
        const currentObj = currentModelMap.get(id);
        // If a model was removed or replaced with a new Object3D reference
        if (!currentObj || currentObj !== prevObj) {
          scene.remove(prevObj);
          dispose3DObject(prevObj);
        }
      });
      prevModelsMapRef.current = currentModelMap;

      // 2. Mount and configure new models
      models.forEach((model) => {
        if (!scene.children.includes(model.object)) {
          scene.add(model.object);
        }
        model.object.visible = model.visible;

        model.object.traverse((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
            // Enable Frustum Culling and pre-compute bounding spheres/boxes
            child.frustumCulled = true;
            if (child.geometry) {
              if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
              if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
            }

            if (!originalMaterials.has(child.uuid) && child.material) {
              originalMaterials.set(child.uuid, child.material);
            }
          }
        });
      });

      // 3. Remove and dispose any orphaned objects that are no longer in models list
      const modelObjects = new Set(models.map((m) => m.object));
      scene.children.forEach((child) => {
        if (
          child instanceof THREE.Group ||
          child instanceof THREE.Mesh ||
          child instanceof THREE.Points ||
          child instanceof THREE.Line
        ) {
          if (
            child !== threeRef.current?.gridHelper &&
            child !== threeRef.current?.groundAxesHelper &&
            child !== threeRef.current?.axesHelper &&
            child !== threeRef.current?.bboxHelper &&
            !modelObjects.has(child)
          ) {
            if (!(child as any).isTransformControls) {
              scene.remove(child);
              dispose3DObject(child);
            }
          }
        }
      });

      requestRender();
    }, [models, requestRender]);

    // Attach / Detach TransformControls to active model
    useEffect(() => {
      if (!threeRef.current) return;
      const { transformControls, scene } = threeRef.current;

      const selectedModel = models.find((m) => m.id === selectedModelId && m.visible);

      if (selectedModel && gizmoMode) {
        transformControls.attach(selectedModel.object);
        transformControls.setMode(gizmoMode);
        transformControls.setSpace(transformSpace);
        transformControls.visible = true;
      } else {
        transformControls.detach();
        transformControls.visible = false;
      }

      // Update Bounding Box Helper with explicit resource disposal
      if (threeRef.current.bboxHelper) {
        threeRef.current.bboxHelper.geometry?.dispose();
        (threeRef.current.bboxHelper.material as any)?.dispose?.();
        scene.remove(threeRef.current.bboxHelper);
        threeRef.current.bboxHelper = null;
      }

      if (selectedModel && showBBox) {
        const bbox = new THREE.BoxHelper(selectedModel.object, 0x3b82f6);
        scene.add(bbox);
        threeRef.current.bboxHelper = bbox;
      }

      requestRender();
    }, [selectedModelId, gizmoMode, transformSpace, models, showBBox, requestRender]);

    // Apply numerical Transform updates to selected model
    useEffect(() => {
      if (!threeRef.current || !selectedModelId) return;
      const selectedModel = models.find((m) => m.id === selectedModelId);
      if (!selectedModel) return;

      const obj = selectedModel.object;
      obj.position.set(transformValues.posX, transformValues.posY, transformValues.posZ);
      obj.rotation.set(
        THREE.MathUtils.degToRad(transformValues.rotX),
        THREE.MathUtils.degToRad(transformValues.rotY),
        THREE.MathUtils.degToRad(transformValues.rotZ)
      );
      obj.scale.set(transformValues.scaleX, transformValues.scaleY, transformValues.scaleZ);

      if (threeRef.current.bboxHelper) {
        threeRef.current.bboxHelper.update();
      }

      requestRender();
    }, [transformValues, selectedModelId, models, requestRender]);

    // Update Lighting Presets & Intensity
    useEffect(() => {
      if (!threeRef.current) return;
      const { ambientLight, dirLight, dirLight2, hemiLight } = threeRef.current;

      dirLight.intensity = lightIntensity;

      switch (lightingPreset) {
        case 'studio':
          ambientLight.color.setHex(0xffffff);
          ambientLight.intensity = 0.65;
          dirLight.color.setHex(0xffffff);
          dirLight.intensity = lightIntensity;
          dirLight2.color.setHex(0xe2e8f0);
          dirLight2.intensity = 0.4 * (lightIntensity / 1.2);
          hemiLight.color.setHex(0xffffff);
          hemiLight.groundColor.setHex(0x303030);
          hemiLight.intensity = 0.5;
          break;
        case 'sunset':
          ambientLight.color.setHex(0xffaa77);
          ambientLight.intensity = 0.5;
          dirLight.color.setHex(0xff8833);
          dirLight2.color.setHex(0xd946ef);
          dirLight2.intensity = 0.6;
          hemiLight.color.setHex(0xffaa66);
          hemiLight.groundColor.setHex(0x331122);
          break;
        case 'night':
          ambientLight.color.setHex(0x223355);
          ambientLight.intensity = 0.4;
          dirLight.color.setHex(0x38bdf8);
          dirLight2.color.setHex(0x6366f1);
          dirLight2.intensity = 0.5;
          hemiLight.color.setHex(0x1e293b);
          hemiLight.groundColor.setHex(0x050510);
          break;
        case 'outdoor':
          ambientLight.color.setHex(0xddf0ff);
          ambientLight.intensity = 0.7;
          dirLight.color.setHex(0xfffaed);
          dirLight2.color.setHex(0x38bdf8);
          dirLight2.intensity = 0.5;
          hemiLight.color.setHex(0x87ceeb);
          hemiLight.groundColor.setHex(0x2e8b57);
          break;
        case 'neon':
          ambientLight.color.setHex(0x220533);
          ambientLight.intensity = 0.3;
          dirLight.color.setHex(0x06b6d4);
          dirLight2.color.setHex(0xf43f5e);
          dirLight2.intensity = 0.8;
          hemiLight.color.setHex(0xa855f7);
          hemiLight.groundColor.setHex(0x0f172a);
          break;
      }

      requestRender();
    }, [lightingPreset, lightIntensity, requestRender]);

    // Update Background Color
    useEffect(() => {
      if (!threeRef.current) return;
      threeRef.current.scene.background = new THREE.Color(bgColor);
      requestRender();
    }, [bgColor, requestRender]);

    // Update Grid & Axes Helper
    useEffect(() => {
      if (!threeRef.current) return;
      threeRef.current.gridHelper.visible = showGrid;
      threeRef.current.groundAxesHelper.visible = showGrid;
      threeRef.current.axesHelper.visible = showAxes;
      requestRender();
    }, [showGrid, showAxes, requestRender]);

    // Update Point Size for point clouds
    useEffect(() => {
      if (!threeRef.current) return;
      models.forEach((m) => {
        m.object.traverse((child) => {
          if (child instanceof THREE.Points && child.material) {
            (child.material as THREE.PointsMaterial).size = pointSize;
            child.material.needsUpdate = true;
          }
        });
      });
      requestRender();
    }, [pointSize, models, requestRender]);

    // Update Material Render Modes with proper disposal of previous override materials
    useEffect(() => {
      if (!threeRef.current) return;
      const { originalMaterials } = threeRef.current;

      disposeOverrideMaterials();

      models.forEach((m) => {
        if (m.object) {
          m.object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const origMat = originalMaterials.get(child.uuid) || child.material;

              if (renderMode === 'default') {
                child.material = origMat;
              } else if (renderMode === 'wireframe') {
                const mat = new THREE.MeshBasicMaterial({
                  color: 0x60a5fa,
                  wireframe: true,
                });
                overrideMaterialsRef.current.push(mat);
                child.material = mat;
              } else if (renderMode === 'normals') {
                const mat = new THREE.MeshNormalMaterial();
                overrideMaterialsRef.current.push(mat);
                child.material = mat;
              } else if (renderMode === 'xray') {
                const mat = new THREE.MeshStandardMaterial({
                  color: 0x3b82f6,
                  transparent: true,
                  opacity: 0.45,
                  roughness: 0.1,
                });
                overrideMaterialsRef.current.push(mat);
                child.material = mat;
              } else if (renderMode === 'points') {
                const mat = new THREE.MeshBasicMaterial({
                  color: 0x38bdf8,
                  wireframe: true,
                });
                overrideMaterialsRef.current.push(mat);
                child.material = mat;
              }
            }
          });
        }
      });

      requestRender();
    }, [renderMode, models, disposeOverrideMaterials, requestRender]);

    // Animation playback handling
    useEffect(() => {
      if (!threeRef.current) return;

      const selectedModel = models.find((m) => m.id === selectedModelId) || models[0];
      if (!selectedModel || !selectedModel.animations || selectedModel.animations.length === 0) {
        if (threeRef.current.mixer) {
          threeRef.current.mixer.stopAllAction();
          threeRef.current.mixer = null;
        }
        return;
      }

      const clip = selectedModel.animations[activeAnimIndex];
      if (!clip) return;

      if (!threeRef.current.mixer || (threeRef.current.mixer.getRoot() as any) !== selectedModel.object) {
        threeRef.current.mixer = new THREE.AnimationMixer(selectedModel.object);
      }

      const mixer = threeRef.current.mixer;
      mixer.stopAllAction();

      const action = mixer.clipAction(clip);
      action.timeScale = animSpeed;
      threeRef.current.currentAction = action;

      if (isAnimPlaying) {
        action.play();
        action.paused = false;
      } else {
        action.play();
        action.paused = true;
      }

      requestRender();
    }, [activeAnimIndex, isAnimPlaying, animSpeed, selectedModelId, models, requestRender]);

    // Expose methods to parent via ref
    React.useImperativeHandle(ref, () => ({
      requestRender,

      focusModel: (id?: string) => {
        if (!threeRef.current) return;
        const { camera } = threeRef.current;
        const targetModel = models.find((m) => m.id === (id || selectedModelId)) || models[0];
        if (!targetModel) return;

        const box = new THREE.Box3().setFromObject(targetModel.object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 2;

        const fov = camera.fov * (Math.PI / 180);
        let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;
        dist = Math.max(dist, 2.5);

        targetCameraPos.current = new THREE.Vector3(
          center.x + dist * 0.7,
          center.y + dist * 0.6,
          center.z + dist
        );
        targetControlsTarget.current = center.clone();
        requestRender();
      },

      focusAll: () => {
        if (!threeRef.current || models.length === 0) return;
        const { camera } = threeRef.current;

        const combinedBox = new THREE.Box3();
        models.forEach((m) => {
          if (m.visible) combinedBox.expandByObject(m.object);
        });

        const size = combinedBox.getSize(new THREE.Vector3());
        const center = combinedBox.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 2;

        const fov = camera.fov * (Math.PI / 180);
        let dist = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;
        dist = Math.max(dist, 3);

        targetCameraPos.current = new THREE.Vector3(
          center.x + dist * 0.7,
          center.y + dist * 0.6,
          center.z + dist
        );
        targetControlsTarget.current = center.clone();
        requestRender();
      },

      setCameraView: (view: CameraView) => {
        if (!threeRef.current) return;

        const combinedBox = new THREE.Box3();
        const selectedModel = models.find((m) => m.id === selectedModelId);

        if (selectedModel && selectedModel.visible) {
          combinedBox.setFromObject(selectedModel.object);
        } else if (models.length > 0) {
          models.forEach((m) => {
            if (m.visible) combinedBox.expandByObject(m.object);
          });
        } else {
          combinedBox.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
        }

        const center = combinedBox.getCenter(new THREE.Vector3());
        const size = combinedBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 2;
        const dist = Math.max(maxDim * 2.2, 3);

        let newPos = new THREE.Vector3();

        switch (view) {
          case 'front':
            newPos.set(center.x, center.y, center.z + dist);
            break;
          case 'back':
            newPos.set(center.x, center.y, center.z - dist);
            break;
          case 'top':
            newPos.set(center.x, center.y + dist, center.z + 0.0001);
            break;
          case 'bottom':
            newPos.set(center.x, center.y - dist, center.z + 0.0001);
            break;
          case 'left':
            newPos.set(center.x - dist, center.y, center.z);
            break;
          case 'right':
            newPos.set(center.x + dist, center.y, center.z);
            break;
          case 'isometric':
            newPos.set(center.x + dist * 0.75, center.y + dist * 0.75, center.z + dist * 0.75);
            break;
        }

        targetCameraPos.current = newPos;
        targetControlsTarget.current = center.clone();
        requestRender();
      },

      orbit: (deltaX: number, deltaY: number) => {
        if (!threeRef.current) return;
        const { controls, activeCamera } = threeRef.current;
        const offset = new THREE.Vector3().subVectors(activeCamera.position, controls.target);
        const radius = offset.length();
        let theta = Math.atan2(offset.x, offset.z);
        let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / (radius || 1))));

        theta -= deltaX * 0.005;
        phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi - deltaY * 0.005));

        offset.x = radius * Math.sin(phi) * Math.sin(theta);
        offset.y = radius * Math.cos(phi);
        offset.z = radius * Math.sin(phi) * Math.cos(theta);

        activeCamera.position.copy(controls.target).add(offset);
        activeCamera.lookAt(controls.target);
        controls.update();
        requestRender();
      },

      dolly: (deltaY: number) => {
        if (!threeRef.current) return;
        const { controls, activeCamera, orthoCamera } = threeRef.current;
        const factor = 1 + deltaY * 0.005;
        const offset = new THREE.Vector3().subVectors(activeCamera.position, controls.target);
        const newDist = Math.max(0.2, Math.min(500, offset.length() * factor));
        offset.setLength(newDist);
        activeCamera.position.copy(controls.target).add(offset);

        if (activeCamera === orthoCamera) {
          orthoCamera.zoom = Math.max(0.01, Math.min(50, orthoCamera.zoom / factor));
          orthoCamera.updateProjectionMatrix();
        }
        controls.update();
        requestRender();
      },

      pan: (deltaX: number, deltaY: number) => {
        if (!threeRef.current) return;
        const { controls, activeCamera } = threeRef.current;
        const vRight = new THREE.Vector3();
        const vUp = new THREE.Vector3();
        activeCamera.matrix.extractBasis(vRight, vUp, new THREE.Vector3());

        const panDist = Math.max(0.5, activeCamera.position.distanceTo(controls.target)) * 0.0015;
        const panOffset = new THREE.Vector3()
          .addScaledVector(vRight, -deltaX * panDist)
          .addScaledVector(vUp, deltaY * panDist);

        activeCamera.position.add(panOffset);
        controls.target.add(panOffset);
        controls.update();
        requestRender();
      },

      captureScreenshot: () => {
        if (!threeRef.current) return '';
        const { renderer, scene, camera, orthoCamera, activeCamera, transformControls } = threeRef.current;

        const wasGizmoVisible = transformControls.visible;
        transformControls.visible = false;
        renderer.render(scene, activeCamera || camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        transformControls.visible = wasGizmoVisible;
        renderer.render(scene, activeCamera || camera);

        return dataUrl;
      },
    }));

    return (
      <div ref={containerRef} className="w-full h-full relative overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />
      </div>
    );
  }
);
