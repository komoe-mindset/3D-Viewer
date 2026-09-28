import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  X,
  Search,
  FolderOpen,
  Key,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Info,
  Layers,
  ArrowRight,
  FileCheck,
  FileCode,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  Copy,
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
  onAddToast?: (message: string, type: 'info' | 'success' | 'error') => void;
}

/**
 * Strict Whitelist of supported 3D model formats.
 * Only these 7 extensions are allowed in the viewport.
 */
export const SUPPORTED_3D_EXTENSIONS = [
  '.glb',
  '.gltf',
  '.obj',
  '.fbx',
  '.stl',
  '.ply',
  '.spz',
] as const;

/**
 * Explicitly rejected script, code, data, and markup files.
 * These are blocked immediately with security warnings.
 */
export const REJECTED_SCRIPT_EXTENSIONS = [
  '.ts',
  '.js',
  '.jsx',
  '.tsx',
  '.json',
  '.txt',
  '.py',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.ps1',
  '.html',
  '.htm',
  '.css',
  '.xml',
  '.yaml',
  '.yml',
  '.md',
  '.php',
  '.wasm',
  '.exe',
] as const;

export interface FormatValidationResult {
  allowed: boolean;
  isExplicitlyBlocked: boolean;
  extension: string;
  reason?: string;
}

/**
 * Validates a filename against the strict 3D format whitelist.
 * Immediately rejects code, script, and non-3D files.
 */
export function validate3DFormat(filename: string): FormatValidationResult {
  if (!filename || typeof filename !== 'string') {
    return {
      allowed: false,
      isExplicitlyBlocked: false,
      extension: '',
      reason: 'Invalid or missing filename.',
    };
  }

  const clean = filename.trim().toLowerCase();

  // 1. Immediately reject code and script files
  for (const scriptExt of REJECTED_SCRIPT_EXTENSIONS) {
    if (clean.endsWith(scriptExt)) {
      return {
        allowed: false,
        isExplicitlyBlocked: true,
        extension: scriptExt.slice(1).toUpperCase(),
        reason: `Code and script files (${scriptExt}) are strictly rejected. Only 3D formats (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz) are permitted.`,
      };
    }
  }

  // 2. Strict Whitelist check
  for (const allowedExt of SUPPORTED_3D_EXTENSIONS) {
    if (clean.endsWith(allowedExt)) {
      return {
        allowed: true,
        isExplicitlyBlocked: false,
        extension: allowedExt.slice(1).toUpperCase(),
      };
    }
  }

  // 3. Fallback rejection for any other extension
  const extMatch = clean.match(/\.([a-z0-9]+)$/);
  const detectedExt = extMatch ? `.${extMatch[1]}` : 'unknown';
  return {
    allowed: false,
    isExplicitlyBlocked: false,
    extension: detectedExt,
    reason: `Format ${detectedExt} is not supported. Supported 3D formats: .glb, .gltf, .obj, .fbx, .stl, .ply, .spz.`,
  };
}

/**
 * Fast helper to check if a filename has an allowed 3D format
 */
export function isSupported3DFile(filename: string): boolean {
  return validate3DFormat(filename).allowed;
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
 * Dual-Mode Link Parser types and detection
 */
export type DriveLinkMode = 'file' | 'folder' | 'unknown';

export interface ParsedDriveLink {
  mode: DriveLinkMode;
  id: string;
  rawInput: string;
  suggestedName?: string;
  isValid: boolean;
}

/**
 * Dual-mode Google Drive Link Parser:
 * - Detects single 3D file links (e.g. drive.google.com/file/d/:id/view, drive.usercontent.google.com/download?id=:id)
 * - Detects shared folder links (e.g. drive.google.com/drive/folders/:id)
 * - Cleans and isolates the alphanumeric Google Drive resource ID
 */
export function parseDriveLink(input: string): ParsedDriveLink {
  const trimmed = input.trim();
  if (!trimmed) {
    return { mode: 'unknown', id: '', rawInput: trimmed, isValid: false };
  }

  // 1. Single File Patterns
  // Case 1a: drive.google.com/file/d/:id/...
  const singleFileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (singleFileMatch && singleFileMatch[1]) {
    return {
      mode: 'file',
      id: singleFileMatch[1],
      rawInput: trimmed,
      isValid: true,
    };
  }

  // Case 1b: drive.usercontent.google.com/download?id=:id
  const userContentMatch = trimmed.match(/drive\.usercontent\.google\.com\/download\?.*id=([a-zA-Z0-9_-]+)/i);
  if (userContentMatch && userContentMatch[1]) {
    return {
      mode: 'file',
      id: userContentMatch[1],
      rawInput: trimmed,
      isValid: true,
    };
  }

  // Case 1c: drive.google.com/uc?id=:id or ?export=download&id=:id
  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/i);
  if (ucMatch && ucMatch[1]) {
    return {
      mode: 'file',
      id: ucMatch[1],
      rawInput: trimmed,
      isValid: true,
    };
  }

  // Case 1d: drive.google.com/open?id=:id (if not a folder link)
  if (trimmed.includes('drive.google.com/open') && !trimmed.includes('/folders/')) {
    const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    if (openMatch && openMatch[1]) {
      return {
        mode: 'file',
        id: openMatch[1],
        rawInput: trimmed,
        isValid: true,
      };
    }
  }

  // 2. Folder Patterns
  // Case 2a: drive.google.com/drive/folders/:id or /drive/u/0/folders/:id
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/i);
  if (folderMatch && folderMatch[1]) {
    return {
      mode: 'folder',
      id: folderMatch[1],
      rawInput: trimmed,
      isValid: true,
    };
  }

  // 3. Raw Alphanumeric ID or Fallback
  // If it's a raw 20-50 character Drive ID without URL scheme:
  const cleanId = trimmed.split(/[?#/]/)[0].replace(/[^a-zA-Z0-9_-]/g, '');
  if (cleanId.length >= 15 && cleanId.length <= 64) {
    return {
      mode: 'unknown',
      id: cleanId,
      rawInput: trimmed,
      isValid: true,
    };
  }

  return {
    mode: 'unknown',
    id: cleanId,
    rawInput: trimmed,
    isValid: cleanId.length > 0,
  };
}

/**
 * Backward compatibility helper for extracting folder ID
 */
export function extractFolderId(input: string): string {
  const parsed = parseDriveLink(input);
  return parsed.id;
}

/**
 * Extracts filename from HTTP Content-Disposition header
 */
function extractFilenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;

  // Try UTF-8 encoding first: filename*=UTF-8''filename.ext
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      // ignore decoding error
    }
  }

  // Standard filename="filename.ext" or filename=filename.ext
  const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return fallback;
}

/**
 * Actionable Error Details structure for HTTP 400, 403, and network errors
 */
interface ActionableError {
  status?: number;
  title: string;
  summary: string;
  steps: string[];
  learnMoreUrl?: string;
}

/**
 * Custom Google Drive Logo Icon
 */
export const GoogleDriveIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-label="Google Drive Logo">
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
  onAddToast,
}) => {
  // Active operational mode: 'file' (direct download) vs 'folder' (API v3 folder browser)
  const [activeTab, setActiveTab] = useState<'file' | 'folder'>('file');

  // Input states
  const [linkInput, setLinkInput] = useState<string>('');
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => {
    return localStorage.getItem('gdrive_api_key_override') || '';
  });
  const [showApiKeySettings, setShowApiKeySettings] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Loading & Data states
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [loadingFileIds, setLoadingFileIds] = useState<Set<string>>(new Set());
  const [loadedFileIds, setLoadedFileIds] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [rejectedFilesCount, setRejectedFilesCount] = useState<number>(0);
  const [hasSearchedFolder, setHasSearchedFolder] = useState<boolean>(false);

  // Search filter inside fetched folder list
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Notifications and Error Toast states
  const [actionableError, setActionableError] = useState<ActionableError | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});

  // Input ref for focus management
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  // Environment fallback key
  const envApiKey = (import.meta.env.VITE_GOOGLE_DRIVE_API_KEY as string | undefined) || '';

  // Get active effective API Key
  const getEffectiveApiKey = useCallback(() => {
    return apiKeyInput.trim() || envApiKey.trim();
  }, [apiKeyInput, envApiKey]);

  // Persist API key override in localStorage
  const handleApiKeyChange = (val: string) => {
    setApiKeyInput(val);
    if (val.trim()) {
      localStorage.setItem('gdrive_api_key_override', val.trim());
    } else {
      localStorage.removeItem('gdrive_api_key_override');
    }
  };

  // Cancel ongoing file downloads if modal is closed or unmounted
  useEffect(() => {
    if (!isOpen) {
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
      setIsFetching(false);
      setLoadingFileIds(new Set());
    }
  }, [isOpen]);

  // Cancel ongoing download explicitly
  const handleCancelOngoingDownload = () => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsFetching(false);
    setLoadingFileIds(new Set());
    notify('Download cancelled', 'info');
  };

  // Keyboard shortcut listener (Escape to dismiss modal)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Parse input whenever it changes and intelligently update mode
  const parsedLink = useMemo(() => {
    return parseDriveLink(linkInput);
  }, [linkInput]);

  // When linkInput changes, auto-switch activeTab if a clear mode is detected
  useEffect(() => {
    setActionableError(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    if (parsedLink.mode === 'file') {
      setActiveTab('file');
    } else if (parsedLink.mode === 'folder') {
      setActiveTab('folder');
    }
  }, [parsedLink.mode]);

  // Toast dispatch helper
  const notify = useCallback(
    (message: string, type: 'info' | 'success' | 'error') => {
      if (onAddToast) {
        onAddToast(message, type);
      }
    },
    [onAddToast]
  );

  // Format badge color by extension
  const getBadgeStyle = (ext: string) => {
    switch (ext.toUpperCase()) {
      case 'GLB':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'GLTF':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'OBJ':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'FBX':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'STL':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'PLY':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'SPZ':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  /**
   * MODE 1: Direct Single 3D File Loader
   * Loads a single 3D model WITHOUT requiring any Google Cloud API key!
   * Uses direct download URL: https://drive.usercontent.google.com/download?id=:id&export=download
   */
  const handleLoadSingleDirectFile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const fileId = parsedLink.id;
    if (!fileId) {
      setActionableError({
        title: 'Missing File ID',
        summary: 'Please enter a valid Google Drive file share link or file ID.',
        steps: [
          'In Google Drive, right-click your 3D model (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz).',
          'Select Share → Copy link ("Anyone with the link can view").',
          'Paste the link into the input field above.',
        ],
      });
      return;
    }

    setIsFetching(true);
    setActionableError(null);
    setInfoMessage(null);
    setSuccessMessage(null);

    // Cancel any previous in-flight download before starting new one
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    let blobUrl: string | null = null;

    try {
      // Direct download URL without API key
      const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
        fileId
      )}&export=download`;

      let response: Response;
      try {
        response = await fetch(directUrl, { method: 'GET', signal: controller.signal });
      } catch (netErr: any) {
        if (netErr?.name === 'AbortError' || controller.signal.aborted) {
          throw netErr;
        }
        // Fallback to secondary direct download endpoint if drive.usercontent is blocked by network
        try {
          const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
          response = await fetch(fallbackUrl, { method: 'GET', signal: controller.signal });
        } catch (fallbackErr: any) {
          if (fallbackErr?.name === 'AbortError' || controller.signal.aborted) {
            throw fallbackErr;
          }
          throw new Error(
            `Network or CORS restriction prevented direct download (${netErr.message || 'Request blocked'}). Ensure your network/browser allows requests to drive.usercontent.google.com and the file is public.`
          );
        }
      }

      if (!response.ok) {
        if (response.status === 403) {
          setActionableError({
            status: 403,
            title: 'File Access Forbidden (HTTP 403)',
            summary:
              'Google Drive refused direct download. The file is either private or requires account sign-in.',
            steps: [
              'Open the file in Google Drive.',
              'Click Share (top right).',
              'Under "General access", switch from "Restricted" to "Anyone with the link" (Viewer).',
              'Click "Done" and try loading again.',
            ],
          });
          throw new Error('Access forbidden (403): Verify that the Google Drive file is set to "Anyone with the link".');
        } else if (response.status === 404) {
          setActionableError({
            status: 404,
            title: 'File Not Found (HTTP 404)',
            summary: `Google Drive cannot find file ID "${fileId}".`,
            steps: [
              'Check that the file ID in the URL is complete and has not been truncated.',
              'Ensure the file has not been deleted or moved to Google Drive Trash.',
            ],
          });
          throw new Error(`File not found (404): ID "${fileId}" does not exist.`);
        } else if (response.status === 400) {
          setActionableError({
            status: 400,
            title: 'Bad Request (HTTP 400)',
            summary: 'The file ID format is invalid.',
            steps: ['Ensure the file link does not contain extra spaces or broken parameters.'],
          });
          throw new Error(`Bad request (400) for file ID: ${fileId}`);
        } else {
          throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
        }
      }

      // Check Content-Disposition for filename
      const contentDisposition = response.headers.get('content-disposition');
      let determinedName = extractFilenameFromDisposition(
        contentDisposition,
        `drive-model-${fileId.slice(0, 8)}.glb`
      );

      // Verify filename against strict whitelist
      const validation = validate3DFormat(determinedName);
      if (validation.isExplicitlyBlocked) {
        setActionableError({
          title: 'Blocked Script / Code File',
          summary: `The file "${determinedName}" was rejected because code and script files (.ts, .js, .json, .txt) cannot be imported.`,
          steps: [
            'Only 3D model formats (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz) are permitted.',
            'If you intended to load a 3D model, make sure your link points directly to a 3D asset file.',
          ],
        });
        throw new Error(validation.reason || 'Script/code file rejected.');
      }

      // If format was not recognized, check content-type or default to .glb
      if (!validation.allowed) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('model/gltf+json')) {
          determinedName = `${determinedName}.gltf`;
        } else if (contentType.includes('model/gltf-binary')) {
          determinedName = `${determinedName}.glb`;
        } else {
          // Check if user provided an extension in the input link
          const matchExt = linkInput.match(/\.(glb|gltf|obj|fbx|stl|ply|spz)(\?.*)?$/i);
          if (matchExt) {
            determinedName = `model-${fileId.slice(0, 8)}.${matchExt[1].toLowerCase()}`;
          } else {
            setActionableError({
              title: 'Unsupported File Format',
              summary: `The file "${determinedName}" is not recognized as a supported 3D format.`,
              steps: [
                'Ensure the file has one of the supported 3D extensions: .glb, .gltf, .obj, .fbx, .stl, .ply, .spz.',
                'Renaming the file in Google Drive to include its correct extension (.glb, .obj, etc.) resolves this.',
              ],
            });
            throw new Error(`Unsupported 3D file format for "${determinedName}".`);
          }
        }
      }

      // Download buffer
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Downloaded file is empty (0 bytes).');
      }

      // Inspect header bytes to catch Google Drive HTML login/warning pages disguised as downloads
      const previewText = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer.slice(0, 250));
      if (
        previewText.trim().startsWith('<!DOCTYPE html>') ||
        previewText.trim().startsWith('<html')
      ) {
        setActionableError({
          title: 'HTML Page Received Instead of 3D File',
          summary:
            'Google Drive returned an HTML web page instead of raw model bytes. This occurs when the file is larger than 100MB (triggering a virus scan confirmation screen) or requires Google sign-in.',
          steps: [
            'Ensure the file General Access is set to "Anyone with the link" (Viewer).',
            'For very large models (>100MB), you can also use Folder Browser mode with a Google Cloud API Key, which provides authenticated alt=media streaming.',
          ],
        });
        throw new Error('Google Drive returned an HTML page instead of raw 3D data.');
      }

      // Wrap in File object and mount into 3D scene
      const mime = response.headers.get('content-type') || 'application/octet-stream';
      const blob = new Blob([arrayBuffer], { type: mime });
      blobUrl = URL.createObjectURL(blob);

      const modelFile = new File([blob], determinedName, {
        type: mime,
        lastModified: Date.now(),
      });

      await onLoadModelFile(modelFile);

      setLoadedFileIds((prev) => new Set(prev).add(fileId));
      setSuccessMessage(`Successfully loaded "${determinedName}" directly into the 3D scene!`);
      notify(`Loaded "${determinedName}" from Google Drive`, 'success');
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        console.info('Download cancelled by user.');
        return;
      }
      console.error('Single file direct load error:', err);
      if (!actionableError) {
        setActionableError({
          title: 'Failed to Load 3D Model',
          summary: err.message || 'An unexpected error occurred during direct download.',
          steps: [
            'Verify that the Google Drive share link is publicly accessible.',
            'Confirm the file is a supported 3D format (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz).',
          ],
        });
      }
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setIsFetching(false);
    }
  };

  /**
   * MODE 2: Folder Browser with Google Drive API v3
   * Lists 3D files in a public folder using Google Cloud API Key.
   * Validates API key before executing requests and delivers actionable 400/403 diagnostics.
   */
  const handleFetchFolderFiles = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const folderId = parsedLink.id;
    if (!folderId) {
      setActionableError({
        title: 'Folder Link or ID Required',
        summary: 'Please enter a Google Drive folder link or folder ID.',
        steps: [
          'In Google Drive, open or right-click your folder.',
          'Click Share → Copy link ("Anyone with the link can view").',
          'Paste the link into the field above.',
        ],
      });
      return;
    }

    // Strict validation of Google Cloud API Key before issuing request
    const effectiveApiKey = getEffectiveApiKey();
    if (!effectiveApiKey) {
      setShowApiKeySettings(true);
      setActionableError({
        status: 400,
        title: 'Google Cloud API Key Required for Folder Listing',
        summary:
          'Listing files inside a Google Drive folder requires querying Google Drive API v3, which mandates a Google Cloud API Key.',
        steps: [
          'Enter your Google Cloud API Key in the field below.',
          'Alternatively, if you only want to load a single 3D file, switch to "Single 3D File" mode above to load directly without any API key!',
          'To generate a free API key: Go to Google Cloud Console → APIs & Services → Credentials → Create Credentials → API Key.',
        ],
        learnMoreUrl: 'https://console.cloud.google.com/apis/credentials',
      });
      setTimeout(() => {
        apiKeyRef.current?.focus();
      }, 150);
      return;
    }

    // Format validation of API key string
    if (effectiveApiKey.length < 15 || !/^[A-Za-z0-9_-]+$/.test(effectiveApiKey)) {
      setShowApiKeySettings(true);
      setActionableError({
        status: 400,
        title: 'Malformed Google Cloud API Key',
        summary: 'The provided API Key format appears invalid or contains invalid characters.',
        steps: [
          'Google Cloud API Keys typically start with "AIzaSy..." and contain 39 alphanumeric characters.',
          'Check for accidental whitespace, quotes, or trailing characters in the API key input.',
        ],
      });
      return;
    }

    setIsFetching(true);
    setActionableError(null);
    setInfoMessage(null);
    setSuccessMessage(null);
    setFileErrors({});
    setFiles([]);
    setSearchFilter('');
    setRejectedFilesCount(0);

    try {
      const query = `'${folderId}' in parents and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name,size,mimeType)&pageSize=100&key=${encodeURIComponent(effectiveApiKey)}`;

      let response: Response;
      try {
        response = await fetch(url);
      } catch (netErr: any) {
        throw new Error(
          `CORS or Network Block: Could not connect to Google Drive API (${netErr.message || 'Request failed'}). Ensure your API key does not have restrictive HTTP referrer rules that block origin (${window.location.origin}) and that no adblocker is blocking googleapis.com.`
        );
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errReason = '';
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMessage = errData.error.message;
          }
          if (errData?.error?.errors?.[0]?.reason) {
            errReason = errData.error.errors[0].reason;
          }
        } catch {
          // not JSON
        }

        // Actionable Error Handling for HTTP 400
        if (response.status === 400) {
          setActionableError({
            status: 400,
            title: 'Invalid Request / API Key (HTTP 400)',
            summary: `Google Drive API rejected the request: ${errMessage}`,
            steps: [
              'Verify that your Google Cloud API key has not expired or been deleted.',
              `Verify that the Folder ID "${folderId}" is correct and alphanumeric.`,
              'Ensure no leading/trailing spaces exist in your API key.',
            ],
            learnMoreUrl: 'https://console.cloud.google.com/apis/credentials',
          });
          throw new Error(`Invalid request (400): ${errMessage}`);
        }

        // Actionable Error Handling for HTTP 403
        if (response.status === 403) {
          setActionableError({
            status: 403,
            title: 'Access Forbidden / Permission Denied (HTTP 403)',
            summary: `Google Drive API returned 403 (${errReason || 'forbidden'}): ${errMessage}`,
            steps: [
              '1. Enable Google Drive API v3: In Google Cloud Console, navigate to "APIs & Services" → "Library", search for "Google Drive API", and click "Enable".',
              '2. API Key Restrictions: If your API key has API restrictions, ensure "Google Drive API" is checked in the allowed list.',
              `3. Application Restrictions: If your API key restricts HTTP Referrers, add "${window.location.origin}/*" to allowed referrers.`,
              '4. Folder Sharing: In Google Drive, verify that the folder General Access is set to "Anyone with the link" (Viewer).',
            ],
            learnMoreUrl: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
          });
          throw new Error(`Permission denied (403): ${errMessage}`);
        }

        // Actionable Error Handling for HTTP 404
        if (response.status === 404) {
          setActionableError({
            status: 404,
            title: 'Folder Not Found (HTTP 404)',
            summary: `Google Drive could not find folder ID "${folderId}".`,
            steps: [
              'Check that the Folder ID is correct.',
              'Ensure the folder was not deleted or moved to trash.',
              'Make sure General Access is set to "Anyone with the link".',
            ],
          });
          throw new Error(`Folder not found (404): ${folderId}`);
        }

        throw new Error(`Google Drive API error (${response.status}): ${errMessage}`);
      }

      const data = await response.json();
      const rawFiles: DriveFile[] = data.files || [];

      // STRICT 3D FORMAT WHITELIST ENFORCEMENT:
      // Filter ONLY [.glb, .gltf, .obj, .fbx, .stl, .ply, .spz]
      // Reject and count all code, script (.ts, .js, .json, .txt), and non-3D files
      const valid3DFiles: DriveFile[] = [];
      let rejectedCount = 0;

      for (const item of rawFiles) {
        const validation = validate3DFormat(item.name);
        if (validation.allowed) {
          valid3DFiles.push(item);
        } else {
          rejectedCount++;
        }
      }

      setFiles(valid3DFiles);
      setRejectedFilesCount(rejectedCount);
      setHasSearchedFolder(true);

      if (valid3DFiles.length > 0) {
        setSuccessMessage(
          `Found ${valid3DFiles.length} supported 3D model${valid3DFiles.length === 1 ? '' : 's'} in folder.`
        );
      } else {
        if (rawFiles.length > 0) {
          setInfoMessage(
            `Found ${rawFiles.length} file(s) in this folder, but none are supported 3D formats (.glb, .gltf, .obj, .fbx, .stl, .ply, .spz). ${rejectedCount} non-3D / script file(s) were filtered out.`
          );
        } else {
          setInfoMessage('This Google Drive folder is empty or contains no accessible files.');
        }
      }
    } catch (err: any) {
      console.error('Folder fetch error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  /**
   * Load an individual 3D model file from the fetched folder list
   */
  const handleLoadFolderItem = async (file: DriveFile) => {
    // Re-verify strict format whitelist before loading
    const validation = validate3DFormat(file.name);
    if (!validation.allowed) {
      setFileErrors((prev) => ({
        ...prev,
        [file.id]: validation.reason || 'File format is not allowed.',
      }));
      return;
    }

    setLoadingFileIds((prev) => new Set(prev).add(file.id));
    setFileErrors((prev) => {
      const copy = { ...prev };
      delete copy[file.id];
      return copy;
    });

    // Cancel previous download if ongoing
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    let blobUrl: string | null = null;

    try {
      const effectiveApiKey = getEffectiveApiKey();

      // Attempt 1: Direct download endpoint (fastest, requires no API quota)
      let response: Response | null = null;
      try {
        const directUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
          file.id
        )}&export=download`;
        const res = await fetch(directUrl, { signal: controller.signal });
        if (res.ok) {
          response = res;
        }
      } catch (directErr: any) {
        if (directErr?.name === 'AbortError' || controller.signal.aborted) {
          throw directErr;
        }
        // continue to API v3 download
      }

      // Attempt 2: Google Drive API v3 alt=media endpoint with API key
      if (!response && effectiveApiKey) {
        const apiMediaUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          file.id
        )}?alt=media&key=${encodeURIComponent(effectiveApiKey)}`;
        response = await fetch(apiMediaUrl, { signal: controller.signal });
      }

      if (!response || !response.ok) {
        const status = response ? response.status : 500;
        if (status === 403) {
          throw new Error('Access forbidden (403): Verify that the file sharing is public.');
        } else if (status === 404) {
          throw new Error('File not found (404) on Google Drive.');
        } else {
          throw new Error(`Download failed with status ${status}`);
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error('Downloaded file is empty (0 bytes).');
      }

      const mime = file.mimeType || 'application/octet-stream';
      const blob = new Blob([arrayBuffer], { type: mime });
      blobUrl = URL.createObjectURL(blob);

      const modelFile = new File([blob], file.name, {
        type: mime,
        lastModified: Date.now(),
      });

      await onLoadModelFile(modelFile);

      setLoadedFileIds((prev) => new Set(prev).add(file.id));
      notify(`Loaded "${file.name}" into scene`, 'success');
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        console.info(`Download of ${file.name} cancelled by user.`);
        return;
      }
      console.error(`Failed to load ${file.name}:`, err);
      setFileErrors((prev) => ({
        ...prev,
        [file.id]: err.message || 'Failed to download and parse model.',
      }));
      notify(`Failed to load "${file.name}": ${err.message}`, 'error');
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

  /**
   * Batch load all models in the filtered folder list
   */
  const handleLoadAllFolderModels = async () => {
    for (const file of filteredFiles) {
      if (!loadingFileIds.has(file.id)) {
        await handleLoadFolderItem(file);
      }
    }
  };

  // Filter models by user search query
  const filteredFiles = useMemo(() => {
    if (!searchFilter.trim()) return files;
    const q = searchFilter.toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, searchFilter]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-modal-title"
      aria-describedby="drive-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-[#202020] border border-[#383838] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#333333] bg-[#242424]/95">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-center p-2 shadow-inner"
              aria-hidden="true"
            >
              <GoogleDriveIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 id="drive-modal-title" className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Google Drive 3D Importer</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-medium">
                  Dual-Mode
                </span>
              </h2>
              <p id="drive-modal-desc" className="text-xs text-slate-300">
                Load single 3D files directly (no API key) or browse shared Google Drive folders
              </p>
            </div>
          </div>

          <button
            type="button"
            role="button"
            onClick={onClose}
            aria-label="Close Google Drive modal (Escape)"
            title="Close modal (Escape)"
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-[#303030] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div
          role="tablist"
          aria-label="Google Drive Import Mode Selection"
          className="grid grid-cols-2 border-b border-[#333333] bg-[#1c1c1c] text-xs font-semibold"
        >
          <button
            type="button"
            role="tab"
            id="tab-single-file"
            aria-selected={activeTab === 'file'}
            aria-controls="panel-single-file"
            onClick={() => setActiveTab('file')}
            className={`py-3 px-4 flex items-center justify-center gap-2 transition cursor-pointer border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              activeTab === 'file'
                ? 'border-emerald-500 text-white bg-[#222222]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#202020]'
            }`}
          >
            <FileCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Single 3D File Link</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-normal">
              No API Key Required
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-folder"
            aria-selected={activeTab === 'folder'}
            aria-controls="panel-folder"
            onClick={() => setActiveTab('folder')}
            className={`py-3 px-4 flex items-center justify-center gap-2 transition cursor-pointer border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              activeTab === 'folder'
                ? 'border-[#ea7600] text-white bg-[#222222]'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-[#202020]'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-[#ea7600]" aria-hidden="true" />
            <span>Shared Folder Browser</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-normal">
              API Key Required
            </span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Actionable Error Toast Banner */}
          {actionableError && (
            <div
              role="alert"
              aria-live="assertive"
              className="p-4 rounded-xl bg-red-950/60 border border-red-500/60 text-red-200 text-xs space-y-2 animate-in fade-in duration-150 shadow-lg"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-red-300 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />
                  <span>{actionableError.title}</span>
                </div>
                <button
                  type="button"
                  role="button"
                  onClick={() => setActionableError(null)}
                  aria-label="Dismiss error notification"
                  title="Dismiss error"
                  className="p-1 rounded text-red-300 hover:text-white hover:bg-red-900/50 transition cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <p className="text-red-200 leading-relaxed">{actionableError.summary}</p>

              {actionableError.steps && actionableError.steps.length > 0 && (
                <div className="pt-1.5 border-t border-red-500/30">
                  <span className="font-semibold text-red-300 block mb-1">Recommended Action Steps:</span>
                  <ul className="list-disc list-inside space-y-1 text-red-200 pl-1">
                    {actionableError.steps.map((step, idx) => (
                      <li key={idx} className="leading-snug">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {actionableError.learnMoreUrl && (
                <div className="pt-1">
                  <a
                    href={actionableError.learnMoreUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11px] text-red-300 hover:text-white underline font-medium"
                  >
                    <span>Open Google Cloud Credentials Console</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in"
            >
              <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span className="flex-1 font-medium">{successMessage}</span>
              <button
                type="button"
                role="button"
                onClick={() => setSuccessMessage(null)}
                aria-label="Dismiss success message"
                className="p-1 rounded text-emerald-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Info Banner */}
          {infoMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-200 text-xs flex items-center gap-2"
            >
              <Info className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
              <span className="flex-1">{infoMessage}</span>
            </div>
          )}

          {/* TAB 1: SINGLE 3D FILE LINK (DIRECT DOWNLOAD WITHOUT API KEY) */}
          {activeTab === 'file' && (
            <div
              role="tabpanel"
              id="panel-single-file"
              aria-labelledby="tab-single-file"
              className="space-y-4 animate-in fade-in duration-100"
            >
              <form onSubmit={handleLoadSingleDirectFile} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="drive-single-file-input" className="block text-xs font-semibold text-slate-200">
                      Single 3D File Link or File ID
                    </label>
                    <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      Direct Download (No API Key)
                    </span>
                  </div>

                  <div className="relative flex items-center">
                    <div className="absolute left-3 text-slate-400 pointer-events-none" aria-hidden="true">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <input
                      ref={inputRef}
                      id="drive-single-file-input"
                      type="text"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="https://drive.google.com/file/d/1abc.../view or 1abc..."
                      aria-label="Google Drive single 3D model file URL or file ID"
                      className="w-full pl-9 pr-32 py-2.5 bg-[#181818] border border-[#383838] focus:border-emerald-500 rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 outline-none transition focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                    {isFetching ? (
                      <button
                        type="button"
                        role="button"
                        onClick={handleCancelOngoingDownload}
                        aria-label="Cancel ongoing Google Drive download"
                        title="Cancel download"
                        className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        role="button"
                        disabled={!linkInput.trim()}
                        aria-label="Directly download and load 3D model from Google Drive"
                        title="Load single 3D model"
                        className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-400 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Load 3D Model</span>
                      </button>
                    )}
                  </div>

                  {parsedLink.isValid && parsedLink.id && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Extracted File ID:</span>
                        <code className="text-emerald-300 bg-black/40 px-1.5 py-0.5 rounded font-mono">
                          {parsedLink.id}
                        </code>
                      </div>
                      <span className="text-slate-400">Direct download URL enabled</span>
                    </div>
                  )}
                </div>

                {/* Direct download feature callout */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-white">
                    <Info className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    <span>How Direct 3D Loading Works:</span>
                  </div>
                  <p className="leading-relaxed text-slate-300 text-[11px]">
                    Single file links use the Google Drive user-content download gateway (
                    <code className="text-emerald-300 font-mono text-[10px]">drive.usercontent.google.com</code>
                    ), enabling fast direct streaming into the WebGL viewport without creating or configuring any Google
                    Cloud credentials.
                  </p>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: SHARED FOLDER BROWSER (GOOGLE DRIVE API V3) */}
          {activeTab === 'folder' && (
            <div
              role="tabpanel"
              id="panel-folder"
              aria-labelledby="tab-folder"
              className="space-y-4 animate-in fade-in duration-100"
            >
              <form onSubmit={handleFetchFolderFiles} className="space-y-3">
                {/* Folder ID input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="drive-folder-input" className="block text-xs font-semibold text-slate-200">
                      Google Drive Shared Folder Link or Folder ID
                    </label>
                    <span className="text-[11px] text-[#ea7600] font-medium flex items-center gap-1">
                      <FolderOpen className="w-3 h-3" aria-hidden="true" />
                      Drive API v3
                    </span>
                  </div>

                  <div className="relative flex items-center">
                    <div className="absolute left-3 text-slate-400 pointer-events-none" aria-hidden="true">
                      <FolderOpen className="w-4 h-4 text-[#ea7600]" />
                    </div>
                    <input
                      id="drive-folder-input"
                      type="text"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/1abc... or 1abc..."
                      aria-label="Google Drive folder link or folder ID"
                      className="w-full pl-9 pr-28 py-2.5 bg-[#181818] border border-[#383838] focus:border-[#ea7600] rounded-xl text-xs sm:text-sm text-white placeholder-slate-400 outline-none transition focus:ring-1 focus:ring-[#ea7600] font-mono"
                    />
                    <button
                      type="submit"
                      role="button"
                      disabled={isFetching || !linkInput.trim()}
                      aria-label="Fetch 3D models from Google Drive folder"
                      title="Fetch folder 3D files"
                      className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-[#ea7600] hover:bg-[#d96d00] disabled:bg-slate-800 disabled:text-slate-400 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-[#ea7600]/20 cursor-pointer disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                      {isFetching ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          <span>Listing...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Fetch Files</span>
                        </>
                      )}
                    </button>
                  </div>

                  {parsedLink.isValid && parsedLink.id && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Extracted Folder ID:</span>
                        <code className="text-amber-300 bg-black/40 px-1.5 py-0.5 rounded font-mono">
                          {parsedLink.id}
                        </code>
                      </div>
                    </div>
                  )}
                </div>

                {/* API Key requirement notice & expandable input */}
                <div className="border border-[#303030] bg-[#1a1a1a] rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                      <Key className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                      <span>Google Cloud API Key (Required for Folders)</span>
                      {envApiKey && (
                        <span className="text-[10px] text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-medium">
                          Found in .env
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      role="button"
                      onClick={() => setShowApiKeySettings((prev) => !prev)}
                      aria-label={showApiKeySettings ? 'Hide Google Cloud API key field' : 'Configure Google Cloud API key'}
                      title="Toggle API key input"
                      className="text-[11px] text-blue-300 hover:text-blue-200 font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded px-1"
                    >
                      {showApiKeySettings ? 'Hide API Key' : apiKeyInput ? 'Edit API Key' : 'Enter API Key'}
                    </button>
                  </div>

                  {/* Informational notice */}
                  <div className="text-[11px] text-slate-300 leading-relaxed flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Google Drive API v3 requires an API key to query folders. Only 3D model formats (
                      <strong className="text-white">.glb, .gltf, .obj, .fbx, .stl, .ply, .spz</strong>
                      ) are shown; code and script files (.ts, .js, .json, .txt) are strictly filtered out.
                    </span>
                  </div>

                  {(showApiKeySettings || !getEffectiveApiKey()) && (
                    <div className="pt-2 border-t border-[#2a2a2a] space-y-2 animate-in fade-in duration-100">
                      <input
                        ref={apiKeyRef}
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => handleApiKeyChange(e.target.value)}
                        placeholder={
                          envApiKey
                            ? 'Using environment key (Enter to override)'
                            : 'Paste Google Cloud API Key with Drive API enabled (AIzaSy...)'
                        }
                        aria-label="Google Cloud Drive API Key"
                        className="w-full px-3 py-2 bg-[#121212] border border-[#383838] focus:border-amber-500 rounded-lg text-xs text-white placeholder-slate-400 outline-none font-mono focus:ring-1 focus:ring-amber-500"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Stored locally in browser session</span>
                        <a
                          href="https://console.cloud.google.com/apis/credentials"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-blue-300 hover:text-blue-200 underline inline-flex items-center gap-1"
                        >
                          <span>Get API Key</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </form>

              {/* Fetched Folder 3D Files List */}
              {files.length > 0 && (
                <div className="space-y-3 pt-2">
                  {/* Results Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#303030]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                        <span>Available 3D Models</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold">
                        {files.length} model{files.length === 1 ? '' : 's'}
                      </span>

                      {rejectedFilesCount > 0 && (
                        <span
                          title="Non-3D and script files filtered out according to strict whitelist"
                          className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono"
                        >
                          {rejectedFilesCount} non-3D file{rejectedFilesCount === 1 ? '' : 's'} filtered out
                        </span>
                      )}
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
                          onClick={handleLoadAllFolderModels}
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

                  {/* Scrollable File List */}
                  <div
                    role="list"
                    aria-label="Google Drive folder 3D models list"
                    className="space-y-2 max-h-64 overflow-y-auto pr-1"
                  >
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
                                onClick={() => handleLoadFolderItem(file)}
                                disabled={isCurrentLoading}
                                aria-label={`${isAlreadyInScene ? 'Reload' : 'Load'} ${file.name} into scene`}
                                title={`${isAlreadyInScene ? 'Reload' : 'Load'} ${file.name}`}
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
                                    <span>{isAlreadyInScene ? 'Reload' : 'Load Model'}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {fileErr && (
                            <div
                              role="alert"
                              className="text-[11px] text-red-200 bg-red-950/40 p-2 rounded-lg border border-red-500/30 flex items-start gap-1.5"
                            >
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
            </div>
          )}

          {/* Format Whitelist & Sharing Guidance Footer */}
          <div className="pt-3 border-t border-[#2a2a2a] text-[11px] text-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                <span>Strict 3D Format Whitelist:</span>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium">
                Scripts (.ts, .js, .json) Blocked
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_3D_EXTENSIONS.map((ext) => (
                <span
                  key={ext}
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${getBadgeStyle(
                    ext.slice(1)
                  )}`}
                >
                  {ext.toUpperCase()}
                </span>
              ))}
            </div>

            <p className="text-slate-400 text-[10px] leading-tight">
              To share any Google Drive item: Right click → <strong>Share</strong> → set General access to{' '}
              <strong className="text-slate-200">"Anyone with the link"</strong> (Viewer) → click{' '}
              <strong className="text-slate-200">Copy link</strong>.
            </p>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#333333] bg-[#242424]/95">
          <span className="text-[11px] text-slate-300 flex items-center gap-1">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/50 border border-[#3a3a3a] text-slate-200 font-mono text-[10px]">
              Esc
            </kbd>
            <span>to dismiss</span>
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
