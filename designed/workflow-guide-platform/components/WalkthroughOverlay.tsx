import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface WalkthroughOverlayProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}

export const WalkthroughOverlay: React.FC<WalkthroughOverlayProps> = ({
  currentStep,
  totalSteps,
  onNext,
  onBack,
  onExit
}) => {
  
  // Hardcoded position near the "Email Address" field from SignInPage.
  // The email field is centered on screen.
  
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      {/* 
        This wrapper helps position the popover relative to the spotlight element. 
        Assuming the email input is roughly in the center, we offset the popover to the right.
      */}
      <div className="relative w-full max-w-md h-[400px]"> 
        
        {/* The Popover Card - Positioned to the right of the input field */}
        <div className="absolute top-[85px] left-[105%] w-[340px] pointer-events-auto animate-in fade-in zoom-in-95 duration-300 slide-in-from-left-4">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5">
            
            {/* Header matching screenshot */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
               <div className="flex items-center gap-3">
                 <span className="text-teal-600 font-bold text-lg">{currentStep}</span>
                 <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                   Step {currentStep} of {totalSteps}
                 </span>
               </div>
               <button 
                 onClick={onExit}
                 className="text-neutral-400 hover:text-neutral-600 transition-colors"
               >
                 <X size={20} />
               </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <h3 className="text-lg font-bold text-neutral-900 mb-2">
                Email Address
              </h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Click on the email address field and enter your work email to sign in to your account.
              </p>

              {/* Footer / Controls */}
              <div className="flex items-center justify-between mt-8">
                <button 
                  onClick={onBack}
                  disabled={currentStep === 1}
                  className="text-sm font-medium text-neutral-400 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={onExit}
                    className="text-sm font-medium text-neutral-500 hover:text-neutral-800 transition-colors"
                  >
                    Exit
                  </button>
                  <button 
                    onClick={onNext}
                    className="px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg shadow-md hover:bg-teal-700 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Progress Bar (Optional, subtle bottom border) */}
            <div className="h-1 bg-neutral-50 w-full">
              <div 
                className="h-full bg-teal-500 transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>

          </div>

          {/* Arrow pointing left to the element */}
          <div className="absolute top-10 -left-2 transform rotate-45 w-4 h-4 bg-white border-l border-b border-neutral-100" />
        </div>
      </div>
    </div>
  );
};