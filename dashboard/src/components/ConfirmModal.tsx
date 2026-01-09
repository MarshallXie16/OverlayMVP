/**
 * Confirmation Modal Component
 * Reusable modal for confirming destructive actions
 * Uses Headless UI Dialog for accessibility
 */

import { Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  loading = false,
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[1600]" onClose={onCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-2xl transition-all animate-fade-in border border-neutral-200">
                {/* Close Button */}
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 transition-colors disabled:opacity-50"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>

                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`p-2 rounded-full flex-shrink-0 ${
                      confirmVariant === "danger" ? "bg-red-100" : "bg-blue-100"
                    }`}
                  >
                    <AlertTriangle
                      className={`w-6 h-6 ${
                        confirmVariant === "danger"
                          ? "text-red-600"
                          : "text-blue-600"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pt-0.5">
                    <Dialog.Title className="text-lg font-semibold text-neutral-900">
                      {title}
                    </Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm text-neutral-600">
                      {message}
                    </Dialog.Description>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={onCancel}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant={confirmVariant === "danger" ? "danger" : "primary"}
                    onClick={onConfirm}
                    disabled={loading}
                  >
                    {loading ? "Processing..." : confirmLabel}
                  </Button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
