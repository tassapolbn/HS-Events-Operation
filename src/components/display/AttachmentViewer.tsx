import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minus, Plus, X } from 'lucide-react';
import { getSignedUrl } from '../../hooks/useAttachments';
import { useLanguage } from '../../i18n';
import { cn } from '../../lib/utils';
import type { DisplayAttachment } from '../../types';

interface ViewerRequest {
  files: DisplayAttachment[];
  index: number;
}

const listeners = new Set<(request: ViewerRequest) => void>();

/**
 * Open a floor plan or any other attachment on top of the board itself.
 * Staff stay on the page they are reading: no new tab, nothing to navigate back from.
 */
export function showAttachment(file: DisplayAttachment, siblings?: DisplayAttachment[]) {
  const files = siblings && siblings.length > 0 ? siblings : [file];
  const found = files.findIndex((item) => item.id === file.id);
  const request: ViewerRequest = { files, index: found >= 0 ? found : 0 };
  for (const listener of listeners) listener(request);
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * The single viewer for the whole display board. Mount it once, next to the board.
 * Images can be zoomed and dragged, PDFs render inline, and anything the browser
 * cannot show still offers a new tab.
 */
export function AttachmentViewer() {
  const { t } = useLanguage();
  const [request, setRequest] = useState<ViewerRequest | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panFrom = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchFrom = useRef<{ distance: number; zoom: number } | null>(null);

  const file = request ? request.files[request.index] : null;
  const open = !!request && !!file;

  useEffect(() => {
    const listener = (next: ViewerRequest) => setRequest(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const close = useCallback(() => setRequest(null), []);

  const step = useCallback(
    (delta: number) => {
      setRequest((prev) => {
        if (!prev || prev.files.length < 2) return prev;
        const next = (prev.index + delta + prev.files.length) % prev.files.length;
        return { ...prev, index: next };
      });
    },
    []
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // A new file always starts fitted to the screen
  useEffect(() => {
    resetView();
    pointers.current.clear();
    panFrom.current = null;
    pinchFrom.current = null;
  }, [file?.id, resetView]);

  // Fetch a fresh signed link for the file being shown
  useEffect(() => {
    if (!file) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let alive = true;
    setUrl(null);
    setFailed(false);
    getSignedUrl(file.storage_path)
      .then((signed) => {
        if (alive) setUrl(signed);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [file?.id, file?.storage_path, file]);

  // Keyboard: escape closes, arrows page through, plus and minus zoom
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === '+' || event.key === '=') setZoom((z) => clampZoom(z * 1.25));
      else if (event.key === '-') setZoom((z) => clampZoom(z / 1.25));
      else if (event.key === '0') resetView();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close, step, resetView]);

  // Wheel zoom has to be a non passive listener to stop the page scrolling
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !open) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((z) => clampZoom(z * (event.deltaY < 0 ? 1.15 : 1 / 1.15)));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [open]);

  // Zooming back out re-centres the picture
  useEffect(() => {
    if (zoom === 1) setOffset({ x: 0, y: 0 });
  }, [zoom]);

  if (!open || !file) return null;

  const isImage = file.mime_type.startsWith('image/');
  const isPdf = file.mime_type === 'application/pdf';

  const distanceBetween = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!isImage) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      pinchFrom.current = { distance: distanceBetween(), zoom };
      panFrom.current = null;
    } else if (pointers.current.size === 1 && zoom > 1) {
      panFrom.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!isImage || !pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2 && pinchFrom.current) {
      const distance = distanceBetween();
      if (pinchFrom.current.distance > 0 && distance > 0) {
        setZoom(clampZoom((distance / pinchFrom.current.distance) * pinchFrom.current.zoom));
      }
      return;
    }
    if (panFrom.current) {
      setOffset({
        x: panFrom.current.ox + (event.clientX - panFrom.current.x),
        y: panFrom.current.oy + (event.clientY - panFrom.current.y)
      });
    }
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchFrom.current = null;
    if (pointers.current.size === 0) panFrom.current = null;
  };

  const toolbarButton =
    'flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 disabled:hover:bg-white/15';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-navy-950/95 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold text-white">{file.file_name}</p>
          {request.files.length > 1 && (
            <p className="text-xs font-semibold text-white/60">
              {request.index + 1} / {request.files.length}
            </p>
          )}
        </div>

        {request.files.length > 1 && (
          <>
            <button onClick={() => step(-1)} className={toolbarButton} title={t('display.viewerPrev')} aria-label={t('display.viewerPrev')}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => step(1)} className={toolbarButton} title={t('display.viewerNext')} aria-label={t('display.viewerNext')}>
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {isImage && (
          <>
            <button
              onClick={() => setZoom((z) => clampZoom(z / 1.25))}
              disabled={zoom <= MIN_ZOOM}
              className={toolbarButton}
              title={t('display.viewerZoomOut')}
              aria-label={t('display.viewerZoomOut')}
            >
              <Minus className="h-5 w-5" />
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-extrabold tabular-nums text-white/80">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => clampZoom(z * 1.25))}
              disabled={zoom >= MAX_ZOOM}
              className={toolbarButton}
              title={t('display.viewerZoomIn')}
              aria-label={t('display.viewerZoomIn')}
            >
              <Plus className="h-5 w-5" />
            </button>
            <button onClick={resetView} className={toolbarButton} title={t('display.viewerFit')} aria-label={t('display.viewerFit')}>
              <Maximize2 className="h-5 w-5" />
            </button>
          </>
        )}

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={toolbarButton}
            title={t('display.viewerNewTab')}
            aria-label={t('display.viewerNewTab')}
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
        <button
          onClick={close}
          className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 font-extrabold text-navy-900 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          title={t('common.close')}
        >
          <X className="h-5 w-5" /> <span className="hidden sm:inline">{t('common.close')}</span>
        </button>
      </div>

      {/* Stage */}
      <div
        ref={stageRef}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
      >
        {failed ? (
          <p className="rounded-2xl bg-white px-5 py-4 text-center text-base font-bold text-slate-700">
            {t('display.viewerFailed')}
          </p>
        ) : !url ? (
          <p className="text-base font-bold text-white/70">{t('common.loading')}</p>
        ) : isImage ? (
          <img
            src={url}
            alt={file.file_name}
            draggable={false}
            onDoubleClick={() => (zoom > 1 ? resetView() : setZoom(2))}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              touchAction: 'none'
            }}
            className={cn(
              'max-h-full max-w-full select-none rounded-xl bg-white shadow-2xl transition-transform duration-75',
              zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
            )}
          />
        ) : isPdf ? (
          <iframe src={url} title={file.file_name} className="h-full w-full rounded-xl border-0 bg-white shadow-2xl" />
        ) : (
          <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-base font-bold text-slate-700">{t('display.viewerCannotPreview')}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-2.5 font-extrabold text-white transition-colors hover:bg-navy-700"
            >
              <ExternalLink className="h-4 w-4" /> {t('display.viewerNewTab')}
            </a>
          </div>
        )}

        {isImage && url && !failed && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3.5 py-1.5 text-xs font-semibold text-white/80">
            {t('display.viewerHint')}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
