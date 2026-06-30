import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = '确认',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Handle Escape key
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // Focus the modal when it opens
  useEffect(() => {
    if (open && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-[400px] mx-4 bg-white rounded-xl shadow-xl border border-black/[0.06] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 text-center">
          {danger && (
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
            </div>
          )}
          <h3 id="confirm-modal-title" className="text-[16px] font-bold text-black mb-2">{title}</h3>
          <p className="text-[14px] text-zinc-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex border-t border-black/[0.06]">
          <button
            ref={cancelButtonRef}
            className="flex-1 h-[48px] text-[14px] font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`flex-1 h-[48px] text-[14px] font-semibold border-l border-black/[0.06] transition-colors ${
              danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-black hover:bg-zinc-50'
            }`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
