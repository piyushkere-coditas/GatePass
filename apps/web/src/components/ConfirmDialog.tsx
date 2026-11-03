import { type ReactNode, useEffect, useId, useRef } from 'react';

/** Small modal used for every admin change that needs a confirmation (spec 01 UI). */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="backdrop">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog">
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog title="Confirm change" onClose={onCancel}>
      <p>{message}</p>
      <div className="row end">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </Dialog>
  );
}
