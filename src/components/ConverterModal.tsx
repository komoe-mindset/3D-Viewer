import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ArrowRightLeft,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Layers,
  UploadCloud,
  Box,
  Settings2,
  Eye,
  FileText,
  ChevronDown,
  Info,
} from 'lucide-react';
import { LoadedModel } from '../types';
import {
  TargetFormat,
  InputFormat,
  ConversionResult,
  convertObject3D,
  convertUploadedFile,
  triggerBlobDownload,
  detectFormatFromFilename,
  inspectObjectGeometry,
  formatBytes,
} from '../utils/modelConverter';

interface ConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: LoadedModel[];
  selectedModelId: string | null;
  onLoadConvertedModel?: (file: File) => void;
  onAddToast?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const ConverterModal: React.FC<ConverterModalProps> = ({
  isOpen,
  onClose,
  models,
  selectedModelId,
  onLoadConvertedModel,
  onAddToast,
}) => {
  // Source mode: 'scene' (from active loaded models) or 'upload' (local file)
  const [sourceMode, setSourceMode] = useState<'scene' | 'upload'>('scene');

  // Selected model ID from scene
  const [activeModelId, setActiveModelId] = useState<string>('');

  // Uploaded local file state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Conversion format options
  const [inputFormatOverride, setInputFormatOverride] = useState<InputFormat | 'auto'>('auto');
  const [targetFormat, setTargetFormat] = useState<TargetFormat | 'fbx'>('glb');
  const [isBinary, setIsBinary] = useState<boolean>(true);
  const [includeNormals, setIncludeNormals] = useState<boolean>(true);
  const [includeColors, setIncludeColors] = useState<boolean>(true);
  const [customFilename, setCustomFilename] = useState<string>('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Conversion process state
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [conversionStatusText, setConversionStatusText] = useState<string>('');
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const targetFormatSelectRef = useRef<HTMLSelectElement>(null);
  const primaryActionBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the select control or primary action upon modal open
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (targetFormatSelectRef.current) {
        targetFormatSelectRef.current.focus();
      } else if (primaryActionBtnRef.current) {
        primaryActionBtnRef.current.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen]);

  // Determine current active scene model
  const currentSceneModel = useMemo(() => {
    if (!models || models.length === 0) return null;
    if (activeModelId) {
      const found = models.find((m) => m.id === activeModelId);
      if (found) return found;
    }
    if (selectedModelId) {
      const found = models.find((m) => m.id === selectedModelId);
      if (found) return found;
    }
    return models[0] || null;
  }, [models, activeModelId, selectedModelId]);

  // Sync activeModelId when selectedModelId changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setConversionResult(null);
      setConversionError(null);
      if (selectedModelId && models.some((m) => m.id === selectedModelId)) {
        setActiveModelId(selectedModelId);
      } else if (models.length > 0) {
        setActiveModelId(models[0].id);
      } else {
        setSourceMode('upload');
      }
    }
  }, [isOpen, selectedModelId, models]);

  // Detected Input Format
  const detectedInputFormat: InputFormat = useMemo(() => {
    if (inputFormatOverride !== 'auto') {
      return inputFormatOverride;
    }
    if (sourceMode === 'scene' && currentSceneModel) {
      return detectFormatFromFilename(currentSceneModel.name);
    }
    if (sourceMode === 'upload' && uploadedFile) {
      return detectFormatFromFilename(uploadedFile.name);
    }
    return 'unknown';
  }, [sourceMode, currentSceneModel, uploadedFile, inputFormatOverride]);

  // Default suggested output filename
  const suggestedFilename = useMemo(() => {
    let base = 'converted_model';
    if (sourceMode === 'scene' && currentSceneModel) {
      base = currentSceneModel.name.replace(/\.[^/.]+$/, '');
    } else if (sourceMode === 'upload' && uploadedFile) {
      base = uploadedFile.name.replace(/\.[^/.]+$/, '');
    }
    return `${base}.${targetFormat}`;
  }, [sourceMode, currentSceneModel, uploadedFile, targetFormat]);

  // Target filename to use
  const effectiveFilename = customFilename.trim() || suggestedFilename;

  // Geometry inspect stats for scene model
  const sceneModelGeometry = useMemo(() => {
    if (!currentSceneModel?.object) return null;
    return inspectObjectGeometry(currentSceneModel.object);
  }, [currentSceneModel]);

  // Handle keyboard escape to close modal and trap Tab navigation within modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isConverting) {
        e.stopPropagation();
        onClose();
        return;
      }

      // Prevent keyboard tab navigation from leaking out of the modal (focus trap)
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if focused on first element or outside, loop to last element
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if focused on last element or outside, loop to first element
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConverting, onClose]);

  // Drag and drop handlers for upload mode
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setUploadedFile(file);
      setSourceMode('upload');
      setConversionResult(null);
      setConversionError(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setConversionResult(null);
      setConversionError(null);
      e.target.value = '';
    }
  };

  // Perform 3D conversion
  const handleConvertAndDownload = async () => {
    if (targetFormat === 'fbx') {
      const notice = 'FBX export requires server-side rendering, please use GLB or OBJ.';
      setConversionError(notice);
      if (onAddToast) onAddToast(notice, 'info');
      return;
    }

    setIsConverting(true);
    setConversionError(null);
    setConversionResult(null);
    setConversionStatusText(`Preparing ${targetFormat.toUpperCase()} export pipeline...`);

    // Defer the heavy conversion parsing to next event loop tick using await new Promise(resolve => setTimeout(resolve, 50))
    // so the conversion spinner immediately renders on the UI without blocking main thread responsiveness (INP)
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      let result: ConversionResult;

      if (sourceMode === 'scene') {
        if (!currentSceneModel) {
          throw new Error('No 3D model selected from the scene.');
        }

        setConversionStatusText(`Converting "${currentSceneModel.name}" to ${targetFormat.toUpperCase()}...`);

        result = await convertObject3D(currentSceneModel.object, targetFormat, {
          binary: isBinary,
          filename: effectiveFilename,
          includeNormals,
          includeColors,
        });
      } else {
        if (!uploadedFile) {
          throw new Error('Please select or drop a 3D model file to convert.');
        }

        setConversionStatusText(`Parsing "${uploadedFile.name}" and generating ${targetFormat.toUpperCase()} buffer...`);

        result = await convertUploadedFile(uploadedFile, targetFormat, {
          binary: isBinary,
          filename: effectiveFilename,
          includeNormals,
          includeColors,
        });
      }

      setConversionStatusText(`Conversion complete! Initiating download...`);
      setConversionResult(result);

      // Trigger automatic browser download
      triggerBlobDownload(result.blob, result.filename);

      if (onAddToast) {
        onAddToast(`Converted and downloaded ${result.filename} (${formatBytes(result.size)})`, 'success');
      }
    } catch (err: any) {
      console.error('3D Conversion error:', err);
      const msg = err?.message || 'Failed to convert 3D model.';
      setConversionError(msg);
      if (onAddToast) {
        onAddToast(msg, 'error');
      }
    } finally {
      setIsConverting(false);
    }
  };

  // Load newly converted model directly into the 3D Viewport
  const handleLoadConvertedToScene = () => {
    if (!conversionResult || !onLoadConvertedModel) return;

    try {
      const file = new File([conversionResult.blob], conversionResult.filename, {
        type: conversionResult.blob.type,
        lastModified: Date.now(),
      });
      onLoadConvertedModel(file);
      onClose();
    } catch (err: any) {
      console.error('Error mounting converted file to viewport:', err);
    }
  };

  // Handle backdrop click to close modal
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isConverting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="converter-title"
      aria-describedby="converter-dialog-description"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#202020] border border-[#3c3c3c] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[#e0e0e0] font-sans"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#262626] border-b border-[#383838]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#ea7600] flex items-center justify-center text-white shadow-md shadow-[#ea7600]/30 border border-white/20">
              <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="converter-title" className="text-sm font-bold text-white flex items-center gap-2">
                <span>3D File Converter</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Client-Side
                </span>
              </h2>
              <p id="converter-dialog-description" className="text-[11px] text-slate-400">
                Convert 3D models between PLY, OBJ, and STL with zero server uploads
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            aria-label="Close 3D Converter dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* 1. Source Selection Tabs */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-300">Model Source:</span>
              <span className="text-[11px] text-slate-400">
                {sourceMode === 'scene'
                  ? `${models.length} model${models.length === 1 ? '' : 's'} in viewport`
                  : 'Convert external 3D file'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-[#181818] rounded-xl border border-[#333333]">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'scene'}
                onClick={() => setSourceMode('scene')}
                disabled={models.length === 0}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  sourceMode === 'scene'
                    ? 'bg-[#333333] text-white shadow-sm border border-[#484848]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>Scene Model ({models.length})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'upload'}
                onClick={() => setSourceMode('upload')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                  sourceMode === 'upload'
                    ? 'bg-[#333333] text-white shadow-sm border border-[#484848]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>Upload Local 3D File</span>
              </button>
            </div>
          </div>

          {/* 2. Source Model Config */}
          {sourceMode === 'scene' ? (
            <div className="p-3 bg-[#181818] border border-[#333333] rounded-xl space-y-2.5">
              <label htmlFor="scene-model-select" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Select Viewport Model:</span>
                {currentSceneModel && (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                    Active
                  </span>
                )}
              </label>

              {models.length > 0 ? (
                <div className="relative">
                  <select
                    id="scene-model-select"
                    value={activeModelId}
                    onChange={(e) => {
                      setActiveModelId(e.target.value);
                      setConversionResult(null);
                      setConversionError(null);
                    }}
                    className="w-full bg-[#242424] border border-[#404040] focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white appearance-none outline-none cursor-pointer focus:ring-1 focus:ring-amber-500"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.stats.vertices.toLocaleString()} verts, {m.stats.triangles.toLocaleString()} tris)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">
                  No 3D models currently loaded in the scene.
                </div>
              )}

              {/* Geometry telemetry summary */}
              {sceneModelGeometry && (
                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] text-slate-300">
                  <div className="p-2 bg-[#222222] rounded-lg border border-[#333333]">
                    <div className="text-slate-400 text-[10px]">Vertices</div>
                    <div className="font-mono font-bold text-blue-300">
                      {sceneModelGeometry.vertexCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 bg-[#222222] rounded-lg border border-[#333333]">
                    <div className="text-slate-400 text-[10px]">Triangles</div>
                    <div className="font-mono font-bold text-indigo-300">
                      {sceneModelGeometry.triangleCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-2 bg-[#222222] rounded-lg border border-[#333333]">
                    <div className="text-slate-400 text-[10px]">Meshes</div>
                    <div className="font-mono font-bold text-amber-300">
                      {sceneModelGeometry.meshCount}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-4 rounded-xl border-2 border-dashed transition cursor-pointer text-center flex flex-col items-center justify-center gap-2 ${
                isDragOver
                  ? 'border-amber-500 bg-amber-500/10'
                  : uploadedFile
                  ? 'border-emerald-500/60 bg-emerald-950/20'
                  : 'border-[#404040] bg-[#181818] hover:border-slate-500 hover:bg-[#222222]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf,.obj,.ply,.stl,.fbx,.spz"
                onChange={handleFileInputChange}
                className="hidden"
                aria-label="Upload 3D model file for conversion"
              />

              {uploadedFile ? (
                <>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                    <FileCode className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{uploadedFile.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {formatBytes(uploadedFile.size)} • Click or drop another file to replace
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center border border-slate-700">
                    <UploadCloud className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Click or drag a 3D model file here</div>
                    <div className="text-[11px] text-slate-400">Supports .GLB, .GLTF, .OBJ, .PLY, .STL, .FBX, .SPZ</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 3. Conversion Format Controls (Input & Target Format) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[#181818] border border-[#333333] rounded-xl">
            {/* Input Format Display & Override */}
            <div>
              <label htmlFor="input-format-override" className="block text-xs font-semibold text-slate-300 mb-1">
                Input Format:
              </label>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1.5 rounded-lg bg-[#252525] border border-[#404040] text-xs font-mono font-bold text-blue-300 uppercase shrink-0">
                  {detectedInputFormat !== 'unknown' ? detectedInputFormat : 'Auto-Detect'}
                </span>
                <div className="relative flex-1">
                  <select
                    id="input-format-override"
                    value={inputFormatOverride}
                    onChange={(e) => setInputFormatOverride(e.target.value as any)}
                    aria-label="Input 3D model format"
                    className="w-full bg-[#242424] border border-[#404040] focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-white appearance-none outline-none cursor-pointer focus:ring-1 focus:ring-amber-500 font-mono"
                  >
                    <option value="auto">Auto (Detected)</option>
                    <option value="glb">GLB (Binary)</option>
                    <option value="gltf">GLTF (JSON)</option>
                    <option value="obj">OBJ (Wavefront)</option>
                    <option value="ply">PLY (Polygon)</option>
                    <option value="stl">STL (3D Print)</option>
                    <option value="fbx">FBX (Autodesk)</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Target Format Dropdown */}
            <div>
              <label htmlFor="target-format-select" className="block text-xs font-semibold text-slate-300 mb-1">
                Target Format:
              </label>
              <div className="relative">
                <select
                  ref={targetFormatSelectRef}
                  id="target-format-select"
                  value={targetFormat}
                  onChange={(e) => {
                    const val = e.target.value as TargetFormat | 'fbx';
                    setTargetFormat(val);
                    setConversionResult(null);
                    if (val === 'fbx') {
                      setConversionError('FBX export requires server-side rendering, please use GLB or OBJ.');
                    } else {
                      setConversionError(null);
                    }
                  }}
                  aria-label="Target format for conversion"
                  className="w-full bg-[#242424] border border-[#404040] focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-white appearance-none outline-none cursor-pointer focus:ring-1 focus:ring-amber-500 font-semibold"
                >
                  <option value="glb">GLB (.glb) — Binary glTF 2.0 (Recommended)</option>
                  <option value="usdz">USDZ (.usdz) — Universal Scene Description (Apple AR / iOS)</option>
                  <option value="ply">PLY (.ply) — Polygon File Format</option>
                  <option value="obj">OBJ (.obj) — Wavefront 3D Object</option>
                  <option value="stl">STL (.stl) — Stereolithography (3D Printing)</option>
                  <option value="fbx">FBX (.fbx) — Autodesk Filmbox (Server-side)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* Graceful FBX notice banner */}
          {targetFormat === 'fbx' && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 bg-amber-950/60 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 animate-in fade-in duration-100"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-bold text-white block">FBX Export Unsupported Client-Side</span>
                <p className="text-[11px] text-amber-300 mt-0.5 leading-relaxed">
                  FBX export requires server-side rendering, please use GLB or OBJ.
                </p>
              </div>
            </div>
          )}

          {/* 4. Format Details & Quick Badges */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>
                  {targetFormat === 'glb' && 'Binary glTF 2.0 (GLB)'}
                  {targetFormat === 'usdz' && 'Universal Scene Description (USDZ)'}
                  {targetFormat === 'ply' && 'Polygon File Format (PLY)'}
                  {targetFormat === 'obj' && 'Wavefront Object (OBJ)'}
                  {targetFormat === 'stl' && 'Stereolithography (STL)'}
                  {targetFormat === 'fbx' && 'Autodesk Filmbox (FBX)'}
                </span>
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {targetFormat === 'glb' && 'three/examples/jsm/exporters/GLTFExporter.js'}
                {targetFormat === 'usdz' && 'three/examples/jsm/exporters/USDZExporter.js'}
                {targetFormat === 'ply' && 'three/examples/jsm/exporters/PLYExporter.js'}
                {targetFormat === 'obj' && 'three/examples/jsm/exporters/OBJExporter.js'}
                {targetFormat === 'stl' && 'three/examples/jsm/exporters/STLExporter.js'}
                {targetFormat === 'fbx' && 'Server-side rendering required'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {targetFormat === 'glb' &&
                'Industry standard 3D web format packaging meshes, PBR materials, textures, and transformations into a single compact binary file.'}
              {targetFormat === 'usdz' &&
                'Native augmented reality format developed by Apple & Pixar for iOS, iPadOS, macOS, and Safari AR Quick Look previews.'}
              {targetFormat === 'ply' &&
                'High-fidelity polygon format supporting vertex coordinates, normals, vertex colors, and faces. Ideal for 3D scanning, point clouds, and photogrammetry.'}
              {targetFormat === 'obj' &&
                'Universal 3D geometry interchange format recognized across all CAD, Blender, Maya, Unity, and 3D DCC tools. Exports vertices, normals, and UVs.'}
              {targetFormat === 'stl' &&
                'Industry standard format for 3D Printing, CNC slicing, and rapid prototyping. Represents triangular surfaces with binary compactness.'}
              {targetFormat === 'fbx' &&
                'FBX export requires server-side rendering, please use GLB or OBJ.'}
            </p>
          </div>

          {/* 5. Advanced Settings Toggle */}
          <div className="border-t border-[#333333] pt-2">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings((prev) => !prev)}
              aria-expanded={showAdvancedSettings}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer py-1"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Export Customization & Options</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {showAdvancedSettings && (
              <div className="mt-2.5 p-3 bg-[#181818] border border-[#333333] rounded-xl space-y-3 animate-in fade-in duration-100">
                {/* Custom Output Filename */}
                <div>
                  <label htmlFor="custom-filename-input" className="block text-xs font-semibold text-slate-300 mb-1">
                    Output Filename:
                  </label>
                  <input
                    id="custom-filename-input"
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder={suggestedFilename}
                    className="w-full bg-[#242424] border border-[#404040] focus:border-amber-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none font-mono"
                  />
                </div>

                {/* Binary vs ASCII for PLY and STL */}
                {(targetFormat === 'ply' || targetFormat === 'stl') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Output Encoding:</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsBinary(true)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          isBinary
                            ? 'bg-amber-600/25 border-amber-500/70 text-amber-200'
                            : 'bg-[#222222] border-[#383838] text-slate-400 hover:text-white'
                        }`}
                      >
                        Binary (Compact & Fast)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBinary(false)}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          !isBinary
                            ? 'bg-amber-600/25 border-amber-500/70 text-amber-200'
                            : 'bg-[#222222] border-[#383838] text-slate-400 hover:text-white'
                        }`}
                      >
                        ASCII (Plain Text)
                      </button>
                    </div>
                  </div>
                )}

                {/* Attribute options for PLY */}
                {targetFormat === 'ply' && (
                  <div className="flex flex-wrap gap-4 text-xs text-slate-300 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeNormals}
                        onChange={(e) => setIncludeNormals(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Include Normals</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeColors}
                        onChange={(e) => setIncludeColors(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Include Vertex Colors</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. Success Feedback & Download Again Banner */}
          {conversionResult && (
            <div
              role="status"
              aria-live="polite"
              className="p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-xl space-y-2 text-xs text-emerald-200 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  <span>Conversion Successful!</span>
                </span>
                <span className="font-mono text-[10px] text-emerald-300">
                  {conversionResult.durationMs}ms
                </span>
              </div>

              <div className="text-[11px] text-slate-300 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">File:</span>{' '}
                  <span className="font-mono font-semibold text-white">{conversionResult.filename}</span>
                </div>
                <div>
                  <span className="text-slate-400">Size:</span>{' '}
                  <span className="font-mono text-emerald-300">{formatBytes(conversionResult.size)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Geometry:</span>{' '}
                  <span className="font-mono text-slate-200">
                    {conversionResult.vertexCount.toLocaleString()} verts • {conversionResult.triangleCount.toLocaleString()} tris
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Format:</span>{' '}
                  <span className="font-mono uppercase text-amber-300">
                    {conversionResult.targetFormat} ({conversionResult.isBinary ? 'Binary' : 'ASCII'})
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(conversionResult.blob, conversionResult.filename)}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download Again</span>
                </button>

                {onLoadConvertedModel && (
                  <button
                    type="button"
                    onClick={handleLoadConvertedToScene}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>View in Viewport</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 7. Error Alert */}
          {conversionError && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 bg-red-950/50 border border-red-500/50 rounded-xl text-xs text-red-200 space-y-1 animate-in fade-in duration-150"
            >
              <div className="font-bold flex items-center gap-1.5 text-white">
                <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
                <span>Conversion Error</span>
              </div>
              <p className="text-[11px] text-red-300 leading-relaxed">{conversionError}</p>
            </div>
          )}

          {/* Status Announcer (aria-live='polite') for conversion completion and error notifications */}
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {isConverting
              ? conversionStatusText || 'Converting 3D model, please wait...'
              : conversionError
              ? `Conversion error: ${conversionError}`
              : conversionResult
              ? `Conversion completed successfully! Generated ${conversionResult.filename} (${formatBytes(conversionResult.size)}). Download started.`
              : ''}
          </div>
        </div>

        {/* Modal Footer & CTA Button */}
        <div className="px-5 py-3.5 bg-[#262626] border-t border-[#383838] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isConverting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            ref={primaryActionBtnRef}
            type="button"
            role="button"
            onClick={handleConvertAndDownload}
            disabled={isConverting || targetFormat === 'fbx' || (sourceMode === 'scene' && !currentSceneModel) || (sourceMode === 'upload' && !uploadedFile)}
            aria-busy={isConverting}
            aria-label={
              targetFormat === 'fbx'
                ? 'FBX export requires server-side rendering, please use GLB or OBJ.'
                : `Convert and download model as ${targetFormat.toUpperCase()}`
            }
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#ea7600] hover:bg-[#d96d00] disabled:bg-slate-800 disabled:text-slate-500 shadow-md shadow-[#ea7600]/30 transition flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {isConverting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                <span>{conversionStatusText || 'Converting...'}</span>
              </>
            ) : targetFormat === 'fbx' ? (
              <span>FBX Unsupported (Use GLB or OBJ)</span>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
                <span>Convert & Download ({targetFormat.toUpperCase()})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
