/**
 * Location: batch-maker-website/components/Modal.tsx
 *
 * Drop-in portal wrapper. Renders children into document.body so no parent
 * stacking context (backdrop-filter, transform, etc.) can clip the z-index.
 *
 * Usage:
 *   <Modal isOpen={myModalOpen} onClose={() => setMyModalOpen(false)}>
 *     <div className="bg-white rounded-xl p-8 max-w-md w-full">
 *       ...content...
 *     </div>
 *   </Modal>
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}