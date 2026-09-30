import React from 'react';
import { Move, RotateCw, Maximize2, XCircle, Globe, Box, ArrowRightLeft } from 'lucide-react';
import { GizmoMode, TransformSpace } from '../types';

interface TransformHUDProps {
  mode: GizmoMode;
  space: TransformSpace;
  hasSelection: boolean;
  selectedModelName?: string;
  onSetMode: (mode: GizmoMode) => void;
  onToggleSpace: () => void;
  onDeselect: () => void;
  onOpenConverter?: () => void;
}

export const TransformHUD: React.FC<TransformHUDProps> = ({
  mode,
  space,
  hasSelection,
  selectedModelName,
  onSetMode,
  onToggleSpace,
  onDeselect,
  onOpenConverter,
}) => {
  return (
    <nav
      aria-label="3D Transform Controls"
      className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-auto select-none"
    >
      {/* Selected Model Tag (if selected) */}
      {hasSelection && selectedModelName && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 py-0.5 rounded-full bg-[#242424] border border-[#ea7600] text-amber-200 text-xs font-semibold backdrop-blur-md shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <span className="w-2 h-2 rounded-full bg-[#ea7600] animate-ping" aria-hidden="true"></span>
          <span className="truncate max-w-[240px]">Selected: {selectedModelName}</span>
        </div>
      )}

      {/* Main HUD Toolbar */}
      <div
        role="toolbar"
        aria-label="Model manipulation modes"
        className="bg-[#242424]/95 p-1 rounded-xl flex items-center gap-1 shadow-2xl border border-[#383838] backdrop-blur-xl"
      >
        {/* Deselect / Select Mode */}
        <button
          type="button"
          role="button"
          onClick={onDeselect}
          aria-label="Deselect active model and hide transform gizmo (Shortcut: Q or Escape)"
          aria-pressed={!hasSelection || mode === null}
          title="Select / Deselect (Shortcut: Q / Esc)"
          className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424] ${
            !hasSelection || mode === null
              ? 'bg-[#383838] text-white border border-[#555555]'
              : 'text-slate-300 hover:text-white hover:bg-[#333333]'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
          <span className="hidden sm:inline">Select</span>
          <kbd className="px-1 py-0.2 text-[9px] bg-[#1a1a1a] rounded border border-[#444444] font-mono text-slate-200" aria-hidden="true">
            Q
          </kbd>
        </button>

        <div className="h-4 w-px bg-[#383838] mx-0.5" aria-hidden="true" />

        {/* Translate / Move */}
        <button
          type="button"
          role="button"
          onClick={() => onSetMode('translate')}
          aria-label="Activate Translate / Move gizmo (Shortcut: W)"
          aria-pressed={hasSelection && mode === 'translate'}
          title="Translate / Move (Shortcut: W)"
          className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea7600] focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424] ${
            hasSelection && mode === 'translate'
              ? 'bg-[#ea7600] text-white shadow-md shadow-[#ea7600]/30 font-semibold'
              : 'text-slate-200 hover:text-white hover:bg-[#333333]'
          }`}
        >
          <Move className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Move</span>
          <kbd className="px-1 py-0.2 text-[9px] bg-[#1a1a1a] rounded border border-[#444444] font-mono text-slate-200" aria-hidden="true">
            W
          </kbd>
        </button>

        {/* Rotate */}
        <button
          type="button"
          role="button"
          onClick={() => onSetMode('rotate')}
          aria-label="Activate Rotate gizmo (Shortcut: E)"
          aria-pressed={hasSelection && mode === 'rotate'}
          title="Rotate (Shortcut: E)"
          className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea7600] focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424] ${
            hasSelection && mode === 'rotate'
              ? 'bg-[#ea7600] text-white shadow-md shadow-[#ea7600]/30 font-semibold'
              : 'text-slate-200 hover:text-white hover:bg-[#333333]'
          }`}
        >
          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Rotate</span>
          <kbd className="px-1 py-0.2 text-[9px] bg-[#1a1a1a] rounded border border-[#444444] font-mono text-slate-200" aria-hidden="true">
            E
          </kbd>
        </button>

        {/* Scale */}
        <button
          type="button"
          role="button"
          onClick={() => onSetMode('scale')}
          aria-label="Activate Scale gizmo (Shortcut: R)"
          aria-pressed={hasSelection && mode === 'scale'}
          title="Scale (Shortcut: R)"
          className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea7600] focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424] ${
            hasSelection && mode === 'scale'
              ? 'bg-[#ea7600] text-white shadow-md shadow-[#ea7600]/30 font-semibold'
              : 'text-slate-200 hover:text-white hover:bg-[#333333]'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Scale</span>
          <kbd className="px-1 py-0.2 text-[9px] bg-[#1a1a1a] rounded border border-[#444444] font-mono text-slate-200" aria-hidden="true">
            R
          </kbd>
        </button>

        <div className="h-4 w-px bg-[#383838] mx-0.5" aria-hidden="true" />

        {/* Space Toggle: World / Local */}
        <button
          type="button"
          role="button"
          onClick={onToggleSpace}
          aria-label={`Toggle transform coordinate space: currently ${space.toUpperCase()} (Shortcut: X)`}
          title={`Transform Space: ${space.toUpperCase()} (Shortcut: X to toggle)`}
          className="px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-[#333333] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424]"
        >
          {space === 'world' ? (
            <Globe className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          ) : (
            <Box className="w-3.5 h-3.5 text-[#ea7600]" aria-hidden="true" />
          )}
          <span className="uppercase text-[11px] font-semibold">{space}</span>
          <kbd className="px-1 py-0.2 text-[9px] bg-[#1a1a1a] rounded border border-[#444444] font-mono text-slate-200" aria-hidden="true">
            X
          </kbd>
        </button>

        {/* Quick Convert Button */}
        {hasSelection && onOpenConverter && (
          <>
            <div className="h-4 w-px bg-[#383838] mx-0.5" aria-hidden="true" />
            <button
              type="button"
              role="button"
              onClick={onOpenConverter}
              aria-label={`Convert ${selectedModelName || 'active model'} to PLY, OBJ, or STL`}
              title="Convert 3D Model (PLY, OBJ, STL)"
              className="px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-amber-300 hover:text-white hover:bg-amber-600/25 border border-amber-500/40 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#242424]"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span className="hidden sm:inline">Convert</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
};
