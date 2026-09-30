import React, { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  Download,
  Loader2,
  Box,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from 'lucide-react';
import { LoadedModel } from '../types';
import {
  TargetFormat,
  InputFormat,
  convertObject3D,
  triggerBlobDownload,
  detectFormatFromFilename,
  formatBytes,
} from '../utils/modelConverter';

interface ConverterBarProps {
  models: LoadedModel[];
  selectedModelId: string | null;
  onOpenConverterModal: () => void;
  onAddToast?: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const ConverterBar: React.FC<ConverterBarProps> = ({
  models,
  selectedModelId,
  onOpenConverterModal,
  onAddToast,
}) => {
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('ply');
  const [inputFormatOverride, setInputFormatOverride] = useState<InputFormat | 'auto'>('auto');
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [lastConvertedInfo, setLastConvertedInfo] = useState<string | null>(null);

  // Active selected or first available model
  const activeModel = useMemo(() => {
    if (!models || models.length === 0) return null;
    if (selectedModelId) {
      const found = models.find((m) => m.id === selectedModelId);
      if (found) return found;
    }
    return models[0] || null;
  }, [models, selectedModelId]);

  // Detected format of active model
  const detectedFormat = useMemo(() => {
    if (inputFormatOverride !== 'auto') return inputFormatOverride;
    if (activeModel) {
      return detectFormatFromFilename(activeModel.name);
    }
    return 'glb';
  }, [activeModel, inputFormatOverride]);

  if (!activeModel) {
    return null;
  }

  const handleConvert = async () => {
    if (!activeModel) return;

    setIsConverting(true);
    setLastConvertedInfo(null);

    try {
      const baseName = activeModel.name.replace(/\.[^/.]+$/, '');
      const result = await convertObject3D(activeModel.object, targetFormat, {
        filename: `${baseName}.${targetFormat}`,
        binary: true,
      });

      triggerBlobDownload(result.blob, result.filename);

      const summary = `${result.filename} (${formatBytes(result.size)}) in ${result.durationMs}ms`;
      setLastConvertedInfo(summary);

      if (onAddToast) {
        onAddToast(`Converted and downloaded ${summary}`, 'success');
      }
    } catch (err: any) {
      console.error('Quick conversion error:', err);
      const msg = err?.message || 'Conversion failed.';
      if (onAddToast) {
        onAddToast(msg, 'error');
      }
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <aside
      aria-label="3D Quick Format Converter Bar"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto select-none max-w-[94vw] sm:max-w-2xl"
    >
      <div className="bg-[#202020]/95 backdrop-blur-xl border border-[#3c3c3c] rounded-2xl shadow-2xl p-2 sm:p-2.5 flex flex-col gap-2 text-white text-xs">
        {/* Top Header / Minimized Bar */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-lg bg-[#ea7600] flex items-center justify-center text-white shrink-0">
              <ArrowRightLeft className="w-3 h-3" aria-hidden="true" />
            </div>
            <span className="font-bold text-xs text-white truncate flex items-center gap-1.5">
              <span>Quick 3D Converter</span>
              <span className="text-[10px] text-slate-400 font-normal truncate max-w-[140px] sm:max-w-[200px]">
                ({activeModel.name})
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenConverterModal}
              title="Open full Converter options modal"
              aria-label="Open full 3D Converter modal options"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized((prev) => !prev)}
              aria-label={isMinimized ? 'Expand quick converter bar' : 'Minimize quick converter bar'}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              {isMinimized ? (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Converter Controls Form */}
        {!isMinimized && (
          <div
            role="region"
            aria-label="Conversion inputs"
            aria-busy={isConverting}
            className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#303030]"
          >
            {/* Input Format Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#181818] border border-[#383838] rounded-xl px-2.5 py-1">
              <label htmlFor="quick-input-format" className="text-[11px] text-slate-400 font-medium">
                Input:
              </label>
              <div className="relative">
                <select
                  id="quick-input-format"
                  value={inputFormatOverride}
                  onChange={(e) => setInputFormatOverride(e.target.value as any)}
                  aria-label="Input 3D model format"
                  className="bg-transparent text-blue-300 font-mono font-bold text-xs outline-none cursor-pointer pr-4 appearance-none uppercase"
                >
                  <option value="auto" className="bg-[#242424] text-white">
                    {detectedFormat.toUpperCase()} (Auto)
                  </option>
                  <option value="glb" className="bg-[#242424] text-white">GLB</option>
                  <option value="gltf" className="bg-[#242424] text-white">GLTF</option>
                  <option value="obj" className="bg-[#242424] text-white">OBJ</option>
                  <option value="ply" className="bg-[#242424] text-white">PLY</option>
                  <option value="stl" className="bg-[#242424] text-white">STL</option>
                  <option value="fbx" className="bg-[#242424] text-white">FBX</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" aria-hidden="true" />

            {/* Target Format Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#181818] border border-[#383838] rounded-xl px-2.5 py-1">
              <label htmlFor="quick-target-format" className="text-[11px] text-slate-400 font-medium">
                Target:
              </label>
              <div className="relative">
                <select
                  id="quick-target-format"
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as TargetFormat)}
                  aria-label="Target format to export"
                  className="bg-transparent text-amber-300 font-bold text-xs outline-none cursor-pointer pr-4 appearance-none"
                >
                  <option value="ply" className="bg-[#242424] text-white">PLY (.ply)</option>
                  <option value="obj" className="bg-[#242424] text-white">OBJ (.obj)</option>
                  <option value="stl" className="bg-[#242424] text-white">STL (.stl)</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            {/* Convert & Download Button */}
            <button
              type="button"
              role="button"
              onClick={handleConvert}
              disabled={isConverting}
              aria-busy={isConverting}
              aria-label={`Convert and download ${activeModel.name} as ${targetFormat.toUpperCase()}`}
              className="ml-auto px-3.5 py-1.5 rounded-xl font-bold text-white bg-[#ea7600] hover:bg-[#d96d00] disabled:bg-slate-800 disabled:text-slate-500 shadow-md shadow-[#ea7600]/25 transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Convert & Download</span>
                </>
              )}
            </button>

            {/* Live region for accessibility announcements */}
            <div role="status" aria-live="polite" className="sr-only">
              {isConverting ? `Converting to ${targetFormat.toUpperCase()}` : lastConvertedInfo ? `Converted ${lastConvertedInfo}` : ''}
            </div>
          </div>
        )}

        {/* Converted result mini banner */}
        {!isMinimized && lastConvertedInfo && (
          <div className="text-[11px] text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-500/30 flex items-center justify-between">
            <span>✓ Downloaded: {lastConvertedInfo}</span>
            <button
              type="button"
              onClick={() => setLastConvertedInfo(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-2"
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
