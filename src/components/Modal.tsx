import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useIsMobile } from '../hooks/useIsMobile';
import { registerBackButtonHandler } from '../mobile/nativeBridge';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  allowFullscreen?: boolean;
  defaultFullscreen?: boolean;
  /** Açıldığında pencereyi kenar boşluğu olmadan ekranın tamamına yayar. */
  edgeToEdge?: boolean;
  /** Başka bir modalın içinden açılıyorsa ESC yalnızca bu modalı kapatır. */
  nested?: boolean;
}

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className, 
  size = 'xl', 
  headerActions,
  footer,
  allowFullscreen = true,
  defaultFullscreen = false,
  edgeToEdge = false,
  nested = false
}: ModalProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(defaultFullscreen);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const isMobile = useIsMobile();
  // Telefonda modal her zaman tam ekran: küçük ekranda kenar boşluğu/yuvarlatma
  // alanı çalıyor ve içerik kırpılıyordu.
  const fullscreen = edgeToEdge || isFullscreen || isMobile;

  React.useEffect(() => {
    if (isOpen) {
      setIsFullscreen(defaultFullscreen);
    }
  }, [isOpen, defaultFullscreen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const preferred = dialog?.querySelector<HTMLElement>('[autofocus]');
    (preferred ?? dialog)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen]);

  const keepFocusInside = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = (Array.from(dialog.querySelectorAll(FOCUSABLE)) as HTMLElement[])
      .filter(item => item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden');
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    return registerBackButtonHandler(() => {
      onClose();
      return true;
    });
  }, [isOpen, onClose]);

  React.useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // İç içe modallarda ESC alttaki modalı da kapatırdı ve orada girilen
      // veriler kaybolurdu; yakalama fazında dinleyip olayı burada kesiyoruz.
      if (nested) e.stopPropagation();
      onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc, nested);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEsc, nested);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, nested]);

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-lg',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-5xl',
    '2xl': 'max-w-6xl',
    '3xl': 'max-w-7xl',
    '4xl': 'max-w-[92vw]',
    full: 'max-w-[98vw]'
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="modal-wrapper" 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 flex items-center justify-center overflow-hidden transition-all",
            nested ? "z-[80]" : "z-[60]",
            edgeToEdge || isMobile ? "p-0" : fullscreen ? "p-0 sm:p-1 md:p-2" : "p-2 sm:p-4 md:p-6"
          )}
        >
          <div
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
          />
          <motion.div
            ref={dialogRef}
            key="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={keepFocusInside}
            initial={isMobile ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.96, y: 15 }}
            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.1 }}
            className={cn(
              "relative z-10 bg-white dark:bg-slate-900 w-full shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-700/80 transition-all duration-200",
              edgeToEdge || isMobile
                ? "h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-0"
                : fullscreen
                ? "h-[98vh] max-h-[99vh] max-w-[99vw] rounded-xl sm:rounded-2xl"
                : cn("max-h-[94vh] rounded-2xl md:rounded-3xl", sizeClasses[size] || sizeClasses.xl),
              className
            )}
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 sm:px-6 sm:py-4.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 sticky top-0 z-20">
              <h3 id={titleId} className="min-w-0 flex-1 break-words text-sm sm:text-base font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shadow-sm shadow-indigo-600/30"></span>
                {title}
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                {headerActions}
                {allowFullscreen && !isMobile && (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(prev => !prev)}
                    title={isFullscreen ? "Normal Boyuta Dön" : "Ekranı Kapla / Büyüt"}
                    className="p-2 text-slate-400 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95 cursor-pointer"
                  >
                    {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
                  </button>
                )}
                <button 
                  onClick={onClose} 
                  type="button"
                  title="Kapat (ESC)"
                  className="p-2 text-slate-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-3 sm:p-6 md:p-7 overflow-y-auto overscroll-contain flex-1 min-h-0">
              {children}
            </div>

            {/* Modal Footer */}
            {footer && (
              <div className="px-4 py-3 sm:px-6 md:px-7 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // İç içe modal document.body'ye taşınır: ev sahibi modalın <form> elemanının
  // içinde kalırsa iç içe <form> geçersiz HTML olur ve iç formun submit olayı
  // dış formun kaydetmesini de tetikler.
  return nested ? createPortal(content, document.body) : content;
}
