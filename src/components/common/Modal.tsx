import React, { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * An accessible name is mandatory: either point `titleId` at the id of a
 * visible heading rendered in `children` (preferred), or supply an explicit
 * `ariaLabel` when no visible title is rendered.
 */
type ModalLabelProps =
  | { titleId: string; ariaLabel?: never }
  | { ariaLabel: string; titleId?: never };

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'detail' | 'pack';
  /** Sticky action bar pinned below the body. */
  footer?: React.ReactNode;
  hideClose?: boolean;
  /** Use 'alertdialog' for destructive confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog';
} & ModalLabelProps;

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  small: 'w-full max-w-[min(24rem,calc(100vw-1.5rem))]',
  medium: 'w-full max-w-[min(32rem,calc(100vw-1.5rem))]',
  large: 'w-full max-w-[min(42rem,calc(100vw-2rem))]',
  detail: 'w-full max-w-[min(48rem,calc(100vw-2rem))]',
  /** Near-fullscreen stage for pack opening — dominates the page. */
  pack: 'w-[min(64rem,calc(100vw-1.5rem))] h-[min(52rem,calc(100dvh-1.5rem))] sm:h-[min(56rem,calc(100dvh-2rem))]',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'medium',
  footer,
  hideClose = false,
  role = 'dialog',
  titleId,
  ariaLabel,
}) => {
  const previousActiveElement = useRef<Element | null>(null);
  const isPack = size === 'pack';

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement;
    }
  }, [isOpen]);

  const maxHeight =
    size === 'pack'
      ? undefined
      : size === 'detail'
        ? 'max-h-[min(calc(100dvh-1.5rem),52rem)]'
        : 'max-h-[min(calc(100dvh-1rem),40rem)]';

  const labelProps = titleId
    ? ({ 'aria-labelledby': titleId } as const)
    : ({ 'aria-label': ariaLabel } as const);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 sm:p-4"
              >
                <Dialog.Content
                  asChild
                  forceMount
                  role={role}
                  {...labelProps}
                  onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    if (previousActiveElement.current instanceof HTMLElement) {
                      previousActiveElement.current.focus();
                    }
                  }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className={`relative flex flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface-overlay shadow-2xl ${sizeClasses[size]} ${maxHeight ?? ''}`}
                  >
                    {!hideClose && (
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          className="absolute right-3 top-3 z-20 rounded-lg border border-border-default bg-surface-overlay/95 p-2 text-ink-secondary shadow-sm backdrop-blur transition-colors hover:bg-surface-hover hover:text-ink-primary"
                          aria-label="Close modal"
                        >
                          <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </Dialog.Close>
                    )}

                    <div
                      className={`custom-scrollbar min-h-0 flex-1 overflow-x-hidden px-4 pt-12 sm:px-8 sm:pt-14 ${
                        isPack
                          ? 'flex flex-col overflow-y-hidden'
                          : 'overflow-y-auto overscroll-contain pb-4 sm:pb-5'
                      }`}
                    >
                      <div className="min-h-0 flex-1">{children}</div>
                    </div>

                    {footer ? (
                      <div className="shrink-0 border-t border-border-default bg-surface-overlay px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-4">
                        {footer}
                      </div>
                    ) : null}
                  </motion.div>
                </Dialog.Content>
              </motion.div>
            </Dialog.Overlay>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};
