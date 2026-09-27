import React from 'react';
import { UploadCloud, FileCode2, Box, Code2 } from 'lucide-react';
import { ACCEPTED_FILE_EXTENSIONS } from '../types';

interface DropzoneOverlayProps {
  isDragging: boolean;
  modelCount: number;
  onOpenFileInput: () => void;
  onLoadDemo: () => void;
  onLoadSampleScript?: () => void;
}

export const DropzoneOverlay: React.FC<DropzoneOverlayProps> = ({
  isDragging,
  modelCount,
  onOpenFileInput,
  onLoadDemo,
  onLoadSampleScript,
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
        <p className="text-slate-400 text-xs sm:text-sm mb-4 text-center max-w-lg px-4">
          Compatible with .GLB, .GLTF, .FBX, .PLY, .SPZ, .OBJ, .STL, and dynamic Three.js scripts (.TS, .JS)
        </p>
        <div className="flex flex-wrap gap-2 justify-center max-w-xl px-4">
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
              className={`px-2.5 py-1 border rounded-lg text-xs font-mono ${
                fmt.includes('.TS') || fmt.includes('.JS')
                  ? 'bg-amber-950/40 border-amber-500/60 text-amber-300'
                  : 'bg-slate-900/90 border-slate-700/80 text-blue-400'
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
          <div className="glass-panel p-8 rounded-3xl max-w-lg pointer-events-auto border border-slate-700/60 shadow-2xl space-y-4 focus:ring-2 focus:ring-blue-500/50">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto text-2xl border border-blue-500/30 shadow-inner">
              <Box className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-bold text-white">No 3D Model Loaded</h2>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
                Drag and drop 3D files or Three.js (.ts / .js) scripts anywhere on screen, or pick a file.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 justify-center pt-2">
              <button
                type="button"
                onClick={onOpenFileInput}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <FileCode2 className="w-4 h-4" />
                <span>Select 3D Files</span>
              </button>
              {onLoadSampleScript && (
                <button
                  type="button"
                  onClick={onLoadSampleScript}
                  className="bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                >
                  <Code2 className="w-4 h-4 text-amber-400" />
                  <span>Run Sample .TS Script</span>
                </button>
              )}
              <button
                type="button"
                onClick={onLoadDemo}
                className="glass-button text-slate-200 hover:text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Box className="w-4 h-4 text-blue-400" />
                <span>Sample Object</span>
              </button>
            </div>

            <div className="pt-2 text-[10px] text-slate-400 font-mono flex items-center justify-center gap-1.5 flex-wrap">
              <span>Supports:</span>
              <span className="text-blue-400">GLB</span>
              <span>•</span>
              <span className="text-blue-400">GLTF</span>
              <span>•</span>
              <span className="text-indigo-400">FBX</span>
              <span>•</span>
              <span className="text-emerald-400">PLY</span>
              <span>•</span>
              <span className="text-amber-400">SPZ</span>
              <span>•</span>
              <span className="text-cyan-400">OBJ</span>
              <span>•</span>
              <span className="text-purple-400">STL</span>
              <span>•</span>
              <span className="text-yellow-400 font-semibold">.TS</span>
              <span>•</span>
              <span className="text-yellow-400 font-semibold">.JS</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
