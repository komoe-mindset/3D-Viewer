import React, { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import {
  Box,
  Upload,
  Sparkles,
  Camera,
  Layers,
  Sun,
  Palette,
  Film,
  Activity,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Unlock,
  RotateCcw,
  Focus,
  Play,
  Pause,
  Square,
  Keyboard,
  Maximize,
  Minimize,
  Grid,
  Compass,
} from 'lucide-react';
import {
  LoadedModel,
  TransformValues,
  LightingPreset,
  RenderMode,
  GizmoMode,
} from '../types';

interface TopNavbarProps {
  models: LoadedModel[];
  selectedModelId: string | null;
  transformValues: TransformValues;
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
  animations: THREE.AnimationClip[];
  activeAnimIndex: number;
  isAnimPlaying: boolean;
  animSpeed: number;
  fps: number;
  onFilesSelected: (files: FileList | File[]) => void;
  onGenerateDemo: () => void;
  onTakeScreenshot: () => void;
  onToggleShortcuts: () => void;
  onSelectModel: (id: string) => void;
  onToggleModelVisibility: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onClearAllModels: () => void;
  onUpdateTransform: (values: Partial<TransformValues>) => void;
  onResetTransform: () => void;
  onFocusModel: (id?: string) => void;
  onSetLightingPreset: (preset: LightingPreset) => void;
  onSetLightIntensity: (intensity: number) => void;
  onSetBgColor: (color: string) => void;
  onSetRenderMode: (mode: RenderMode) => void;
  onToggleGrid: (show: boolean) => void;
  onToggleAxes: (show: boolean) => void;
  onSetPointSize: (size: number) => void;
  onToggleAutoRotate: (rotate: boolean) => void;
  onSetRotateSpeed: (speed: number) => void;
  onToggleBBox: (show: boolean) => void;
  onSelectAnimTrack: (index: number) => void;
  onTogglePlayAnim: () => void;
  onStopAnim: () => void;
  onSetAnimSpeed: (speed: number) => void;
}

type OpenDropdown = 'models' | 'lighting' | 'display' | 'animation' | 'stats' | null;

export const TopNavbar: React.FC<TopNavbarProps> = ({
  models,
  selectedModelId,
  transformValues,
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
  animations,
  activeAnimIndex,
  isAnimPlaying,
  animSpeed,
  fps,
  onFilesSelected,
  onGenerateDemo,
  onTakeScreenshot,
  onToggleShortcuts,
  onSelectModel,
  onToggleModelVisibility,
  onDeleteModel,
  onClearAllModels,
  onUpdateTransform,
  onResetTransform,
  onFocusModel,
  onSetLightingPreset,
  onSetLightIntensity,
  onSetBgColor,
  onSetRenderMode,
  onToggleGrid,
  onToggleAxes,
  onSetPointSize,
  onToggleAutoRotate,
  onSetRotateSpeed,
  onToggleBBox,
  onSelectAnimTrack,
  onTogglePlayAnim,
  onStopAnim,
  onSetAnimSpeed,
}) => {
  const [openMenu, setOpenMenu] = useState<OpenDropdown>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = '';
      setOpenMenu(null);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  // Global scene stats totals
  const totalStats = models.reduce(
    (acc, m) => ({
      triangles: acc.triangles + m.stats.triangles,
      vertices: acc.vertices + m.stats.vertices,
      meshes: acc.meshes + m.stats.meshes,
    }),
    { triangles: 0, vertices: 0, meshes: 0 }
  );

  const toggleDropdown = (menu: OpenDropdown) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  };

  return (
    <header
      ref={menuContainerRef}
      className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-3 sm:px-4 py-2 bg-[#242424]/95 border-b border-[#383838] backdrop-blur-xl select-none text-[#e0e0e0]"
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.fbx,.ply,.spz,.obj,.stl,.ts,.js,text/javascript,application/typescript"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Left Area: Brand & Dropdown Popovers */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-2 sm:pr-3 border-r border-[#383838]">
          <div className="w-7 h-7 rounded-lg bg-[#ea7600] flex items-center justify-center shadow-md shadow-[#ea7600]/30 border border-white/20 shrink-0">
            <Box className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-xs sm:text-sm tracking-wide text-white hidden md:inline">
            Blender 3D Viewport
          </span>
        </div>

        {/* 1. Models / Outliner Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('models')}
            className={`glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              openMenu === 'models' ? 'glass-button-active' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Models</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/20 text-blue-400 font-mono font-bold">
              {models.length}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'models' && (
            <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl glass-panel p-3 border border-slate-700/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-400" />
                  <span>Scene Outliner</span>
                </span>
                {models.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearAllModels}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20"
                  >
                    Clear Scene
                  </button>
                )}
              </div>

              {models.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  No 3D models in scene. Drop files or click "Open Files".
                </div>
              ) : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {models.map((model) => {
                    const isSelected = model.id === selectedModelId;
                    return (
                      <div
                        key={model.id}
                        onClick={() => onSelectModel(model.id)}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition border ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500/60 text-white'
                            : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <Box className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                          <span className="truncate font-medium">{model.name}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onFocusModel(model.id)}
                            title="Focus in Camera"
                            className="p-1 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-800"
                          >
                            <Focus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleModelVisibility(model.id)}
                            title={model.visible ? 'Hide' : 'Show'}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                          >
                            {model.visible ? <Eye className="w-3.5 h-3.5 text-blue-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteModel(model.id)}
                            title="Delete model"
                            className="p-1 text-slate-400 hover:text-red-400 rounded hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Model Numerical Transform Inspector */}
              {selectedModel && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300">Transforms: {selectedModel.name}</span>
                    <button
                      type="button"
                      onClick={onResetTransform}
                      className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>

                  {/* Position */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400">Position (X, Y, Z)</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['posX', 'posY', 'posZ'] as const).map((axis) => (
                        <div key={axis} className="flex items-center bg-slate-950/80 rounded-lg px-2 py-1 border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 mr-1 uppercase">{axis.replace('pos', '')}</span>
                          <input
                            type="number"
                            step="0.1"
                            value={Number(transformValues[axis].toFixed(2))}
                            onChange={(e) => onUpdateTransform({ [axis]: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400">Rotation (Deg)</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['rotX', 'rotY', 'rotZ'] as const).map((axis) => (
                        <div key={axis} className="flex items-center bg-slate-950/80 rounded-lg px-2 py-1 border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 mr-1 uppercase">{axis.replace('rot', '')}°</span>
                          <input
                            type="number"
                            step="5"
                            value={Math.round(transformValues[axis])}
                            onChange={(e) => onUpdateTransform({ [axis]: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scale */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400">Scale</span>
                      <button
                        type="button"
                        onClick={() => onUpdateTransform({ uniformScale: !transformValues.uniformScale })}
                        className="text-[10px] text-blue-400 flex items-center gap-1"
                      >
                        {transformValues.uniformScale ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                        {transformValues.uniformScale ? 'Uniform' : 'Free'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['scaleX', 'scaleY', 'scaleZ'] as const).map((axis) => (
                        <div key={axis} className="flex items-center bg-slate-950/80 rounded-lg px-2 py-1 border border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 mr-1 uppercase">{axis.replace('scale', '')}</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.01"
                            value={Number(transformValues[axis].toFixed(2))}
                            onChange={(e) => {
                              const val = Math.max(0.01, parseFloat(e.target.value) || 1);
                              if (transformValues.uniformScale) {
                                onUpdateTransform({ scaleX: val, scaleY: val, scaleZ: val });
                              } else {
                                onUpdateTransform({ [axis]: val });
                              }
                            }}
                            className="w-full bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Lighting Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('lighting')}
            className={`glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              openMenu === 'lighting' ? 'glass-button-active' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Lighting</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'lighting' && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl glass-panel p-3 border border-slate-700/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Environment Lighting</span>
              </span>

              {/* Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Presets</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'studio', label: 'Studio' },
                    { id: 'sunset', label: 'Sunset' },
                    { id: 'night', label: 'Night / Blue' },
                    { id: 'outdoor', label: 'Outdoor' },
                    { id: 'neon', label: 'Neon / Cyber' },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSetLightingPreset(preset.id as LightingPreset)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border text-left ${
                        lightingPreset === preset.id
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Intensity Slider */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Light Intensity</span>
                  <span className="font-mono text-amber-400 font-bold">{lightIntensity.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="4.0"
                  step="0.1"
                  value={lightIntensity}
                  onChange={(e) => onSetLightIntensity(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

        {/* 3. Display & Shading Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('display')}
            className={`glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              openMenu === 'display' ? 'glass-button-active' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Display</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'display' && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl glass-panel p-3 border border-slate-700/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Palette className="w-3.5 h-3.5 text-cyan-400" />
                <span>Viewport Shading & Helpers</span>
              </span>

              {/* Shading Modes */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Render Shading</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'default', label: 'Material' },
                    { id: 'wireframe', label: 'Wireframe' },
                    { id: 'normals', label: 'Normals' },
                    { id: 'xray', label: 'X-Ray' },
                    { id: 'points', label: 'Point Cloud' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onSetRenderMode(mode.id as RenderMode)}
                      className={`px-2 py-1.5 rounded-xl text-xs font-semibold transition border text-left ${
                        renderMode === mode.id
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Helpers Toggles */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Scene Helpers</span>
                <div className="space-y-1">
                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-800/40">
                    <span className="flex items-center gap-2">
                      <Grid className="w-3.5 h-3.5 text-blue-400" /> Ground Grid
                    </span>
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => onToggleGrid(e.target.checked)}
                      className="accent-blue-500 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-800/40">
                    <span className="flex items-center gap-2">
                      <Compass className="w-3.5 h-3.5 text-emerald-400" /> XYZ Axes Helper
                    </span>
                    <input
                      type="checkbox"
                      checked={showAxes}
                      onChange={(e) => onToggleAxes(e.target.checked)}
                      className="accent-blue-500 rounded"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-800/40">
                    <span className="flex items-center gap-2">
                      <Box className="w-3.5 h-3.5 text-amber-400" /> Selection Bounds
                    </span>
                    <input
                      type="checkbox"
                      checked={showBBox}
                      onChange={(e) => onToggleBBox(e.target.checked)}
                      className="accent-blue-500 rounded"
                    />
                  </label>
                </div>
              </div>

              {/* Point Cloud Size (for PLY/SPZ) */}
              <div className="space-y-1 pt-1 border-t border-slate-800">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Point Size</span>
                  <span className="font-mono text-cyan-400 font-bold">{pointSize.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.25"
                  step="0.01"
                  value={pointSize}
                  onChange={(e) => onSetPointSize(parseFloat(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>

              {/* Background Color Palette */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Background Color</span>
                <div className="flex items-center gap-2">
                  {[
                    { hex: '#303030', label: 'Blender Neutral (#303030)' },
                    { hex: '#3e3e3e', label: 'Studio Gray (#3e3e3e)' },
                    { hex: '#242424', label: 'Deep Charcoal (#242424)' },
                    { hex: '#1e1e1e', label: 'Dark Gray (#1e1e1e)' },
                    { hex: '#090d16', label: 'Navy Slate (#090d16)' },
                    { hex: '#000000', label: 'Pure Black (#000000)' },
                  ].map(({ hex, label }) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => onSetBgColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-6 h-6 rounded-md border-2 transition-transform cursor-pointer ${
                        bgColor === hex ? 'border-[#ea7600] scale-110' : 'border-slate-700'
                      }`}
                      title={label}
                    />
                  ))}
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => onSetBgColor(e.target.value)}
                    className="w-6 h-6 rounded-md bg-transparent border-0 cursor-pointer"
                    title="Custom Color"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Animation Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('animation')}
            className={`glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              openMenu === 'animation' ? 'glass-button-active' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Animations</span>
            {animations.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            )}
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'animation' && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl glass-panel p-3 border border-slate-700/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-3">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Film className="w-3.5 h-3.5 text-purple-400" />
                <span>Animation Timeline</span>
              </span>

              {animations.length === 0 ? (
                <div className="py-4 text-center text-slate-400 text-xs">
                  No skeletal or mesh animation tracks found in selected model.
                </div>
              ) : (
                <>
                  {/* Track selector */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Select Track</span>
                    <select
                      value={activeAnimIndex}
                      onChange={(e) => onSelectAnimTrack(parseInt(e.target.value, 10))}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none"
                    >
                      {animations.map((clip, idx) => (
                        <option key={idx} value={idx}>
                          {clip.name || `Animation Clip ${idx + 1}`} ({clip.duration.toFixed(1)}s)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Play Controls */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onTogglePlayAnim}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        isAnimPlaying
                          ? 'bg-amber-600 text-white hover:bg-amber-500'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                    >
                      {isAnimPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isAnimPlaying ? 'Pause' : 'Play'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onStopAnim}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold"
                    >
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Speed slider */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Playback Speed</span>
                      <span className="font-mono text-purple-400 font-bold">{animSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.1"
                      value={animSpeed}
                      onChange={(e) => onSetAnimSpeed(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                    />
                  </div>
                </>
              )}

              {/* Turntable Auto-Rotate */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
                  <span>Turntable Auto-Rotate</span>
                  <input
                    type="checkbox"
                    checked={autoRotate}
                    onChange={(e) => onToggleAutoRotate(e.target.checked)}
                    className="accent-blue-500 rounded"
                  />
                </label>
                {autoRotate && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Turntable Speed</span>
                      <span>{rotateSpeed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="4.0"
                      step="0.2"
                      value={rotateSpeed}
                      onChange={(e) => onSetRotateSpeed(parseFloat(e.target.value))}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. Stats & Info Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => toggleDropdown('stats')}
            className={`glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              openMenu === 'stats' ? 'glass-button-active' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Stats</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {openMenu === 'stats' && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl glass-panel p-3 border border-slate-700/90 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-2.5">
              <span className="text-xs font-bold text-white flex items-center gap-1.5 pb-2 border-b border-slate-800">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Scene Telemetry & Statistics</span>
              </span>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Frame Rate</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">{fps} FPS</div>
                </div>
                <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Total Models</div>
                  <div className="text-sm font-mono font-bold text-white">{models.length}</div>
                </div>
                <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Triangles</div>
                  <div className="text-sm font-mono font-bold text-blue-400">
                    {totalStats.triangles.toLocaleString()}
                  </div>
                </div>
                <div className="p-2 bg-slate-950/80 rounded-xl border border-slate-800/80">
                  <div className="text-[10px] text-slate-400">Vertices</div>
                  <div className="text-sm font-mono font-bold text-indigo-400">
                    {totalStats.vertices.toLocaleString()}
                  </div>
                </div>
              </div>

              {selectedModel && (
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Selected: {selectedModel.name}</div>
                  <div className="flex justify-between">
                    <span>Bounding Box:</span>
                    <span className="font-mono text-white">
                      {selectedModel.stats.size.x.toFixed(1)} × {selectedModel.stats.size.y.toFixed(1)} × {selectedModel.stats.size.z.toFixed(1)}m
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Area: Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Open Files Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#ea7600] hover:bg-[#d96d00] shadow-md shadow-[#ea7600]/25 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          title="Open .glb, .gltf, .fbx, .ply, .spz, .obj, .stl"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Open Files</span>
        </button>

        {/* Demo Object */}
        <button
          type="button"
          onClick={onGenerateDemo}
          className="glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition"
          title="Generate Procedural Demo 3D Object"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">Demo Object</span>
        </button>

        {/* Screenshot */}
        <button
          type="button"
          onClick={onTakeScreenshot}
          className="glass-button px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 transition"
          title="Capture High-Res PNG Screenshot"
        >
          <Camera className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden lg:inline">Capture</span>
        </button>

        {/* Shortcuts Modal Trigger */}
        <button
          type="button"
          onClick={onToggleShortcuts}
          className="glass-button p-1.5 rounded-xl text-slate-400 hover:text-white transition"
          title="Keyboard Shortcuts"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Fullscreen */}
        <button
          type="button"
          onClick={handleFullscreen}
          className="glass-button p-1.5 rounded-xl text-slate-400 hover:text-white transition"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
