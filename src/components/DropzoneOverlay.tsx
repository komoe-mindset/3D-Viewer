import React from 'react';
import { UploadCloud, FileCode2, Box, Code2, ArrowRightLeft } from 'lucide-react';
import { ACCEPTED_FILE_EXTENSIONS } from '../types';
import { GoogleDriveIcon } from './GoogleDriveModal';

interface DropzoneOverlayProps {
  isDragging: boolean;
  modelCount: number;
  onOpenFileInput: () => void;
  onLoadDemo: () => void;
  onLoadSampleScript?: () => void;
  onOpenGoogleDrive?: () => void;
  onOpenConverter?: () => void;
}

export const DropzoneOverlay: React.FC<DropzoneOverlayProps> = ({
  isDragging,
  modelCount,
  onOpenFileInput,
  onLoadDemo,
  onLoadSampleScript,
  onOpenGoogleDrive,
  onOpenConverter,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenFileInput();
    }
  };

  return (
    <>
      {/* Drag & Drop Visual Overlay */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Upload 3D model or Three.js script"
        onKeyDown={handleKeyDown}
        className={`absolute inset-0 bg-slate-950/85 backdrop-blur-md z-40 flex flex-col items-center justify-center border-4 border-dashed border-blue-500/60 m-6 rounded-3xl transition-all duration-200 pointer-events-none ${
          isDragging ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="w-20 h-20 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-4 text-3xl animate-bounce border border-blue-500/40">
          <UploadCloud className="w-10 h-10" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 text-center">
          Drop 3D Models or Three.js Scripts Here
        </h2>
        <p className="text-slate-300 text-xs sm:text-sm mb-4 text-center max-w-lg px-4">
          Compatible with .GLB, .GLTF, .FBX, .PLY, .SPZ, .OBJ, .STL, and dynamic Three.js scripts (.TS, .JS)
        </p>
        <div className="flex flex-wrap gap-2 justify-center max-w-xl px-4" role="list" aria-label="Supported file formats">
          {[
            '.GLB',
            '.GLTF',
            '.FBX',
            '.PLY',
            '.SPZ (Gaussian)',
            '.OBJ',
            '.STL',
            '.TS (Three.js)',
            '.JS (Three.js)',
          ].map((fmt) => (
            <span
              key={fmt}
              role="listitem"
              className={`px-2.5 py-1 border rounded-lg text-xs font-mono font-medium ${
                fmt.includes('.TS') || fmt.includes('.JS')
                  ? 'bg-amber-950/60 border-amber-500/70 text-amber-200'
                  : 'bg-slate-900/90 border-slate-700 text-blue-300'
              }`}
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>

      {/* Empty State Banner (shown when 0 models in scene) */}
      {modelCount === 0 && !isDragging && (
        <div
          tabIndex={0}
          role="region"
          aria-label="Upload 3D model or Three.js script"
          onKeyDown={handleKeyDown}
          className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none p-6 text-center focus:outline-none"
        >
          <div className="glass-panel p-8 rounded-3xl max-w-lg pointer-events-auto border border-slate-700/80 shadow-2xl space-y-4 focus:ring-2 focus:ring-blue-500/50">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto text-2xl border border-blue-500/40 shadow-inner" aria-hidden="true">
              <Box className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-white">No 3D Model Loaded</h2>
              <p className="text-slate-300 text-xs leading-relaxed max-w-sm mx-auto">
                Drag and drop 3D files or Three.js (.ts / .js) scripts anywhere on screen, or choose an import option below.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-center pt-2" role="group" aria-label="Quick model import actions">
              <button
                type="button"
                role="button"
                onClick={onOpenFileInput}
                aria-label="Select 3D files from your computer to inspect"
                title="Select 3D files (.glb, .gltf, .fbx, .obj, .stl, .ply, .spz)"
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <FileCode2 className="w-4 h-4" aria-hidden="true" />
                <span>Select 3D Files</span>
              </button>
              {onOpenGoogleDrive && (
                <button
                  type="button"
                  role="button"
                  onClick={onOpenGoogleDrive}
                  aria-label="Import 3D models from Google Drive folder"
                  title="Import 3D models from Google Drive folder"
                  className="bg-slate-800 hover:bg-slate-700 border border-blue-500/40 text-blue-200 hover:text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <GoogleDriveIcon className="w-4 h-4" aria-hidden="true" />
                  <span>Google Drive</span>
                </button>
              )}
              {onOpenConverter && (
                <button
                  type="button"
                  role="button"
                  onClick={onOpenConverter}
                  aria-label="Open 3D File Converter to convert to PLY, OBJ, or STL"
                  title="Open 3D File Converter (PLY, OBJ, STL)"
                  className="bg-amber-600/25 hover:bg-amber-600/35 border border-amber-500/50 text-amber-200 hover:text-amber-100 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <ArrowRightLeft className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>3D Converter</span>
                </button>
              )}
              {onLoadSampleScript && (
                <button
                  type="button"
                  role="button"
                  onClick={onLoadSampleScript}
                  aria-label="Run sample procedural TypeScript 3D script"
                  title="Run sample TypeScript 3D script"
                  className="bg-amber-600/25 hover:bg-amber-600/35 border border-amber-500/50 text-amber-200 hover:text-amber-100 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                >
                  <Code2 className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  <span>Run Sample .TS Script</span>
                </button>
              )}
              <button
                type="button"
                role="button"
                onClick={onLoadDemo}
                aria-label="Load sample 3D geometric object into scene"
                title="Load sample 3D geometric object into scene"
                className="glass-button text-slate-100 hover:text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <Box className="w-4 h-4 text-blue-400" aria-hidden="true" />
                <span>Sample Object</span>
              </button>
            </div>

            <div className="pt-2 text-[10px] text-slate-300 font-mono flex items-center justify-center gap-1.5 flex-wrap" aria-label="Supported file types list">
              <span className="text-slate-400">Supports:</span>
              <span className="text-blue-300 font-medium">GLB</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-blue-300 font-medium">GLTF</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-indigo-300 font-medium">FBX</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-emerald-300 font-medium">PLY</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-amber-300 font-medium">SPZ</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-cyan-300 font-medium">OBJ</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-purple-300 font-medium">STL</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-amber-300 font-bold">.TS</span>
              <span className="text-slate-500" aria-hidden="true">•</span>
              <span className="text-amber-300 font-bold">.JS</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
