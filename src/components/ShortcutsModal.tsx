import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'W', desc: 'Activate Move / Translate Gizmo' },
    { key: 'E', desc: 'Activate Rotate Gizmo' },
    { key: 'R', desc: 'Activate Scale Gizmo' },
    { key: 'X', desc: 'Toggle World / Local Transform Space' },
    { key: 'Q / Esc', desc: 'Deselect active model / Hide gizmo' },
    { key: 'F', desc: 'Frame / Focus camera on selected model' },
    { key: '1 / Num 1', desc: 'Snap camera to Front View' },
    { key: '3 / Num 3', desc: 'Snap camera to Right View' },
    { key: '7 / Num 7', desc: 'Snap camera to Top View' },
    { key: '5 / Num 5', desc: 'Toggle Perspective / Orthographic' },
    { key: '0 / Num 0', desc: 'User Perspective / Isometric View' },
    { key: 'Left Drag', desc: 'Orbit / Rotate 3D camera' },
    { key: 'Right / Shift+Drag', desc: 'Pan / Move 3D camera' },
    { key: 'Scroll Wheel', desc: 'Zoom / Dolly camera' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none"
    >
      <div className="w-full max-w-md rounded-2xl p-5 bg-[#202020]/95 border border-[#3a3a3a] shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#333333]">
          <div id="shortcuts-title" className="flex items-center gap-2 text-white font-semibold text-sm">
            <Keyboard className="w-4 h-4 text-[#ea7600]" aria-hidden="true" />
            <span>Blender 3D Viewport Shortcuts</span>
          </div>
          <button
            type="button"
            role="button"
            onClick={onClose}
            aria-label="Close shortcuts modal"
            title="Close (Escape)"
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-[#2e2e2e] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1.5 max-h-84 overflow-y-auto pr-1" role="list" aria-label="Available keyboard and mouse shortcuts">
          {shortcuts.map((item, idx) => (
            <div
              key={idx}
              role="listitem"
              className="flex items-center justify-between p-2 rounded-lg bg-[#282828] border border-[#333333] text-xs"
            >
              <span className="text-slate-200">{item.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-[#181818] border border-[#3a3a3a] font-mono text-[11px] font-semibold text-amber-300 shadow-sm shrink-0 ml-2">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            role="button"
            onClick={onClose}
            aria-label="Dismiss shortcuts modal"
            title="Dismiss"
            className="w-full py-2 bg-[#ea7600] hover:bg-[#ff8811] text-white font-medium text-xs rounded-xl shadow-lg shadow-[#ea7600]/25 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
