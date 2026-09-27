import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  FolderOpen,
  Key,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';

export interface DriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType?: string;
}

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadModelFile: (file: File) => Promise<void>;
  loadedModelNames?: string[];
}

const SUPPORTED_3D_EXTENSIONS = ['.glb', '.gltf', '.obj', '.fbx', '.stl', '.ply', '.spz'];

/**
 * Checks if a filename has a supported 3D extension
 */
export function isSupported3DFile(filename: string): boolean {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return SUPPORTED_3D_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Extracts the file extension cleanly without the dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()?.toUpperCase() || '' : '';
}

/**
 * Formats byte size into human-readable string (KB, MB, GB)
 */
export function formatFileSize(bytes?: string | number): string {
  if (!bytes) return 'Size unknown';
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(num) / Math.log(1024));
  return `${(num / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Extracts a Google Drive Folder ID from full URL, share link, or raw ID
 */
export function extractFolderId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 1. Try URL parsing if it looks like a URL
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('drive.google.com')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);

      // Case: /drive/folders/<id> or /folders/<id>
      const folderMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (folderMatch && folderMatch[1]) {
        return folderMatch[1];
      }

      // Case: ?id=<id>
      const idParam = url.searchParams.get('id');
      if (idParam) {
        return idParam;
      }
    }
  } catch {
    // Fall back to regex
  }

  // 2. Regex fallback for /folders/<id> or ?id=<id>
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }

  // 3. Otherwise clean off trailing query params or slashes
  return trimmed.split(/[?#]/)[0].replace(/\/+$/, '');
}

/**
 * Custom Google Drive Logo Icon
 */
export const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-label="Google Drive">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  onLoadModelFile,
  loadedModelNames = [],
}) => {
  // Inputs
  const [folderInput, setFolderInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    return localStorage.getItem('gdrive_api_key_override') || '';
  });
  const [showApiKeySettings, setShowApiKeySettings] = useState<boolean>(false);

  // Loading & Data States
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [loadingFileIds, setLoadingFileIds] = useState<Set<string>>(new Set());
  const [loadedFileIds, setLoadedFileIds] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [totalFolderFiles, setTotalFolderFiles] = useState<number>(0);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // Filter & Search inside fetched list
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Error & Status Messages
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  // Environment fallback
  const envApiKey = (import.meta.env.VITE_GOOGLE_DRIVE_API_KEY as string | undefined) || '';

  // Get active effective API Key
  const getEffectiveApiKey = useCallback(() => {
    return apiKeyInput.trim() || envApiKey.trim();
  }, [apiKeyInput, envApiKey]);

  // Persist API key override if user changes it
  const handleApiKeyChange = (val: string) => {
    setApiKeyInput(val);
    if (val.trim()) {
      localStorage.setItem('gdrive_api_key_override', val.trim());
    } else {
      localStorage.removeItem('gdrive_api_key_override');
    }
  };

  // Keyboard shortcut listener (Escape to dismiss)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Clear messages when inputs change
  useEffect(() => {
    setGlobalError(null);
  }, [folderInput, apiKeyInput]);

  // Derived parsed folder ID
  const parsedFolderId = useMemo(() => {
    return extractFolderId(folderInput);
  }, [folderInput]);

  // Fetch list of files using Google Drive API v3
  const handleFetchFiles = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const folderId = parsedFolderId;
    if (!folderId) {
      setGlobalError('Please enter a Google Drive folder link or folder ID.');
      return;
    }

    const effectiveApiKey = getEffectiveApiKey();
    if (!effectiveApiKey) {
      setGlobalError(
        'Google Drive API Key is required. Please provide an API key below or set VITE_GOOGLE_DRIVE_API_KEY in your environment.'
      );
      setShowApiKeySettings(true);
      return;
    }

    setIsFetching(true);
    setGlobalError(null);
    setInfoMessage(null);
    setFileErrors({});
    setFiles([]);
    setSearchFilter('');

    try {
      // Query as specified in requirement 2:
      // https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,size,mimeType)&key=${apiKey}
      const query = `'${folderId}' in parents and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,size,mimeType)&pageSize=100&key=${encodeURIComponent(effectiveApiKey)}`;

      let response: Response;
      try {
        response = await fetch(url);
      } catch (netErr: any) {
        throw new Error(
          `CORS / Network Error: Could not connect to Google Drive API (${netErr.message || 'Blocked'}). Ensure your API key does not have restrictive referrer rules that block this origin (${window.location.origin}) and that no adblocker is interfering.`
        );
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
        } catch {
          // not JSON
        }

        if (response.status === 403) {
          throw new Error(
            `Access Forbidden (403): ${errMessage}. Make sure the Google Drive folder has General Access set to "Anyone with the link can view", and that the Google Drive API v3 is enabled for your API key in Google Cloud Console.`
          );
        } else if (response.status === 404) {
          throw new Error(
            `Folder Not Found (404): ${errMessage}. Check that the Folder ID is correct and that the folder is publicly accessible.`
          );
        } else if (response.status === 400) {
          throw new Error(`Invalid Request (400): ${errMessage}. Verify that the Folder ID is valid.`);
        } else {
          throw new Error(`Google Drive API Error (${response.status}): ${errMessage}`);
        }
      }

      const data = await response.json();
      const rawFiles: DriveFile[] = data.files || [];

      // Filter only supported 3D models: .glb, .gltf, .obj, .fbx, .stl, .ply, .spz
      const supportedFiles = rawFiles.filter((f) => isSupported3DFile(f.name));

      setFiles(supportedFiles);
      setTotalFolderFiles(rawFiles.length);
      setHasSearched(true);

      if (supportedFiles.length === 0) {
        if (rawFiles.length > 0) {
          setInfoMessage(
            `Found ${rawFiles.length} file(s) in this folder, but none are supported 3D formats (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz).`
          );
        } else {
          setInfoMessage('The specified Google Drive folder is empty or contains no accessible files.');
        }
      }
    } catch (err: any) {
      console.error('Drive fetch error:', err);
      setGlobalError(err.message || 'Failed to fetch folder contents.');
    } finally {
      setIsFetching(false);
    }
  };

  // Load a single 3D file into the scene
  const handleLoadSingleModel = async (file: DriveFile) => {
    const effectiveApiKey = getEffectiveApiKey();
    if (!effectiveApiKey) {
      setFileErrors((prev) => ({
        ...prev,
        [file.id]: 'API Key missing. Enter an API key to download files.',
      }));
      return;
    }

    setLoadingFileIds((prev) => new Set(prev).add(file.id));
    setFileErrors((prev) => {
      const copy = { ...prev };
      delete copy[file.id];
      return copy;
    });

    let blobUrl: string | null = null;

    try {
      // 4. Fetch the file as an ArrayBuffer using 'alt=media'
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${encodeURIComponent(
        effectiveApiKey
      )}`;

      let response: Response;
      try {
        response = await fetch(downloadUrl);
      } catch (netErr: any) {
        throw new Error(
          `CORS / Network Download Error: ${netErr.message || 'Request failed'}. Verify file permissions and origin restrictions.`
        );
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
        } catch {
          // not JSON
        }

        if (response.status === 403) {
          throw new Error(`Permission Denied (403): ${errMessage}. Verify that the file is shared publicly.`);
        } else if (response.status === 404) {
          throw new Error(`File Not Found (404): ${errMessage}`);
        } else {
          throw new Error(`Download failed (${response.status}): ${errMessage}`);
        }
      }

      // Convert to ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();

      // Convert to Blob Object URL
      const mime = file.mimeType || 'application/octet-stream';
      const blob = new Blob([arrayBuffer], { type: mime });
      blobUrl = URL.createObjectURL(blob);

      // Create a standard File instance for modelLoaders.ts
      const modelFile = new File([blob], file.name, {
        type: mime,
        lastModified: Date.now(),
      });

      // Trigger the existing model loading logic in modelLoaders.ts
      await onLoadModelFile(modelFile);

      setLoadedFileIds((prev) => new Set(prev).add(file.id));
    } catch (err: any) {
      console.error(`Failed to load ${file.name}:`, err);
      setFileErrors((prev) => ({
        ...prev,
        [file.id]: err.message || 'Failed to download and parse model.',
      }));
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setLoadingFileIds((prev) => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };

  // Load all 3D files in the current folder into the scene
  const handleLoadAllModels = async () => {
    for (const file of filteredFiles) {
      if (!loadingFileIds.has(file.id)) {
        await handleLoadSingleModel(file);
      }
    }
  };

  // Filtered files according to search input
  const filteredFiles = useMemo(() => {
    if (!searchFilter.trim()) return files;
    const q = searchFilter.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, searchFilter]);

  // Format badge color by extension
  const getBadgeStyle = (ext: string) => {
    switch (ext) {
      case 'GLB':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'GLTF':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40';
      case 'OBJ':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';
      case 'FBX':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40';
      case 'STL':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'PLY':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'SPZ':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#202020] border border-[#383838] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333333] bg-[#242424]/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center p-1.5 shadow-inner" aria-hidden="true">
              <GoogleDriveIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 id="drive-modal-title" className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Google Drive 3D Importer</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-mono font-medium">
                  Drive API v3
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Load 3D models directly from a public Google Drive shared folder
              </p>
            </div>
          </div>

          <button
            type="button"
            role="button"
            onClick={onClose}
            aria-label="Close Google Drive modal"
            title="Close (Escape)"
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#303030] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Folder ID / Link Input */}
          <form onSubmit={handleFetchFiles} className="space-y-3">
            <div>
              <label htmlFor="drive-folder-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                Google Drive Folder Link or Folder ID
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3 text-slate-400 pointer-events-none" aria-hidden="true">
                  <FolderOpen className="w-4 h-4 text-[#ea7600]" />
                </div>
                <input
                  id="drive-folder-input"
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1abc... or 1abc..."
                  aria-label="Google Drive folder URL or ID"
                  className="w-full pl-9 pr-24 py-2.5 bg-[#181818] border border-[#383838] focus:border-[#ea7600] rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 outline-none transition focus:ring-1 focus:ring-[#ea7600]"
                />
                <button
                  type="submit"
                  role="button"
                  disabled={isFetching || !folderInput.trim()}
                  aria-label="Fetch 3D models from Google Drive folder"
                  title="Fetch files"
                  className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-[#ea7600] hover:bg-[#d96d00] disabled:bg-slate-800 disabled:text-slate-400 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-[#ea7600]/20 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Fetch Files</span>
                    </>
                  )}
                </button>
              </div>

              {parsedFolderId && parsedFolderId !== folderInput.trim() && (
                <div className="mt-1 text-[11px] text-slate-300 flex items-center gap-1">
                  <span>Detected Folder ID:</span>
                  <code className="text-[#ea7600] bg-black/40 px-1.5 py-0.5 rounded font-mono">
                    {parsedFolderId}
                  </code>
                </div>
              )}
            </div>

            {/* API Key Toggle & Input */}
            <div className="border border-[#303030] bg-[#1a1a1a] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Key className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>Google Cloud API Key</span>
                  {envApiKey && (
                    <span className="text-[10px] text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-medium">
                      Default Available (.env)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  role="button"
                  onClick={() => setShowApiKeySettings((prev) => !prev)}
                  aria-label={showApiKeySettings ? 'Hide Google Cloud API key settings' : 'Configure Google Cloud API key'}
                  title="Configure API key"
                  className="text-[11px] text-blue-300 hover:text-blue-200 font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded px-1"
                >
                  {showApiKeySettings ? 'Hide API Key' : apiKeyInput ? 'Edit API Key' : 'Configure API Key'}
                </button>
              </div>

              {showApiKeySettings && (
                <div className="pt-2 border-t border-[#2a2a2a] space-y-2 animate-in fade-in duration-100">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={
                      envApiKey
                        ? 'Using environment key (Enter to override)'
                        : 'Enter Google Cloud API Key with Drive API enabled'
                    }
                    aria-label="Google Cloud Drive API Key"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#383838] focus:border-blue-500 rounded-lg text-xs text-white placeholder-slate-400 outline-none font-mono focus:ring-1 focus:ring-blue-400"
                  />
                  <div className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-tight">
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Fallback source: <code className="text-slate-200 font-mono">VITE_GOOGLE_DRIVE_API_KEY</code>. A public API key with Google Drive API v3 enabled is required to read metadata and download public file contents.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </form>

          {/* Global Error Banner */}
          {globalError && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/50 text-red-200 text-xs space-y-1.5 animate-in fade-in duration-150" role="alert">
              <div className="flex items-center gap-2 font-bold text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />
                <span>Error accessing Google Drive</span>
              </div>
              <p className="text-red-200 whitespace-pre-line leading-relaxed pl-6">{globalError}</p>
            </div>
          )}

          {/* Info Banner */}
          {infoMessage && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/80 text-slate-200 text-xs flex items-center gap-2" role="status">
              <Info className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Fetched Models Section */}
          {files.length > 0 && (
            <div className="space-y-3 pt-2">
              {/* Header with Search and Load All */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-[#303030]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                    <span>Available 3D Models</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold">
                    {files.length} model{files.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {files.length > 3 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" aria-hidden="true" />
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter models..."
                        aria-label="Filter models by name"
                        className="pl-7 pr-2.5 py-1 bg-[#161616] border border-[#333333] rounded-lg text-xs text-white placeholder-slate-400 outline-none w-32 sm:w-40 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  )}

                  {files.length > 1 && (
                    <button
                      type="button"
                      role="button"
                      onClick={handleLoadAllModels}
                      disabled={loadingFileIds.size > 0}
                      aria-label={`Load all ${files.length} models into 3D scene`}
                      title={`Load all ${files.length} models into scene`}
                      className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-400 text-white font-medium text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <Download className="w-3 h-3" aria-hidden="true" />
                      <span>Load All ({files.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Models List */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1" role="list" aria-label="Google Drive 3D models list">
                {filteredFiles.map((file) => {
                  const ext = getFileExtension(file.name);
                  const isCurrentLoading = loadingFileIds.has(file.id);
                  const isAlreadyInScene =
                    loadedFileIds.has(file.id) || loadedModelNames.includes(file.name);
                  const fileErr = fileErrors[file.id];

                  return (
                    <div
                      key={file.id}
                      role="listitem"
                      className={`p-2.5 rounded-xl border transition flex flex-col gap-2 ${
                        isAlreadyInScene
                          ? 'bg-slate-900/40 border-slate-700/60'
                          : 'bg-[#181818] border-[#303030] hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {/* File Name & Format Badge */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider shrink-0 border ${getBadgeStyle(
                              ext
                            )}`}
                          >
                            .{ext}
                          </span>

                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-[11px] text-slate-300 font-mono">
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                        </div>

                        {/* Action Button */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isAlreadyInScene && (
                            <span className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-300 font-medium px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30">
                              <Check className="w-3 h-3" aria-hidden="true" />
                              <span>In Scene</span>
                            </span>
                          )}

                          <button
                            type="button"
                            role="button"
                            onClick={() => handleLoadSingleModel(file)}
                            disabled={isCurrentLoading}
                            aria-label={`${isAlreadyInScene ? 'Reload' : 'Load'} ${file.name} into scene`}
                            title={`${isAlreadyInScene ? 'Reload' : 'Load'} ${file.name} into scene`}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                              isAlreadyInScene
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                : 'bg-[#ea7600] hover:bg-[#d96d00] text-white shadow-md shadow-[#ea7600]/20'
                            }`}
                          >
                            {isCurrentLoading ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                <span>Loading...</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{isAlreadyInScene ? 'Reload' : 'Load into Scene'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Individual File Error */}
                      {fileErr && (
                        <div className="text-[11px] text-red-200 bg-red-950/40 p-2 rounded-lg border border-red-500/30 flex items-start gap-1.5" role="alert">
                          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{fileErr}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Guide / Help */}
          <div className="pt-2 border-t border-[#2a2a2a] text-[11px] text-slate-300 space-y-1.5">
            <div className="font-semibold text-slate-200 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
              <span>How to share your Google Drive 3D Folder:</span>
            </div>
            <ol className="list-decimal list-inside space-y-0.5 pl-1 text-slate-300">
              <li>In Google Drive, right-click the folder containing your 3D files and select <strong className="text-white">Share</strong>.</li>
              <li>Under General access, switch to <strong className="text-white">"Anyone with the link"</strong> (Viewer).</li>
              <li>Click <strong className="text-white">Copy link</strong> and paste it into the input above.</li>
            </ol>
            <div className="pt-1 flex items-center gap-1 text-[10px] text-slate-300">
              <span className="text-slate-400">Supported 3D formats:</span>
              <span className="text-blue-300">.GLB</span>,{' '}
              <span className="text-sky-300">.GLTF</span>,{' '}
              <span className="text-cyan-300">.OBJ</span>,{' '}
              <span className="text-indigo-300">.FBX</span>,{' '}
              <span className="text-purple-300">.STL</span>,{' '}
              <span className="text-emerald-300">.PLY</span>,{' '}
              <span className="text-amber-300">.SPZ</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#333333] bg-[#242424]/90">
          <span className="text-[11px] text-slate-300">
            Press <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-[#3a3a3a] text-slate-200 font-mono text-[10px]">Esc</kbd> to close
          </span>

          <button
            type="button"
            role="button"
            onClick={onClose}
            aria-label="Close Google Drive modal"
            title="Close"
            className="px-4 py-1.5 bg-[#303030] hover:bg-[#3a3a3a] text-slate-200 hover:text-white font-medium text-xs rounded-xl transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
