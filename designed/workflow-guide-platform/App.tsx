import React, { useState } from 'react';
import { SignInPage } from './components/SignInPage';
import { RecordingWidget } from './components/RecordingWidget';
import { WalkthroughOverlay } from './components/WalkthroughOverlay';
import { Video, PlayCircle } from 'lucide-react';

type ViewMode = 'recording' | 'walkthrough';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('recording');
  
  // State for recording mockup
  const [isRecording, setIsRecording] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [stepCount, setStepCount] = useState(0);

  // State for walkthrough mockup
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 7;

  return (
    <div className="min-h-screen relative bg-neutral-50 text-neutral-900 selection:bg-primary-100 selection:text-primary-900 font-sans">
      
      {/* 
        Background Page Content (The "Host" App) 
        Removed 'z-0' to allow children (like spotlight elements) to pop out above fixed overlays.
      */}
      <div className="">
         <SignInPage 
            isWalkthroughActive={viewMode === 'walkthrough'} 
            currentStep={currentStep}
         />
      </div>

      {/* --- OVERLAYS --- */}

      {/* 
        1. Backdrop for Walkthrough 
        This is fixed and covers the screen. z-40 puts it above standard content.
        Spotlight elements in SignInPage use z-50 to sit above this.
      */}
      {viewMode === 'walkthrough' && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-[2px] z-40 transition-opacity duration-500 animate-in fade-in" />
      )}

      {/* 2. Walkthrough UI Overlay (The Tooltip Card) */}
      {viewMode === 'walkthrough' && (
        <WalkthroughOverlay 
          currentStep={currentStep} 
          totalSteps={totalSteps}
          onNext={() => setCurrentStep(prev => Math.min(prev + 1, totalSteps))}
          onBack={() => setCurrentStep(prev => Math.max(prev - 1, 1))}
          onExit={() => setViewMode('recording')}
        />
      )}

      {/* 3. Recording Widget (Floating & Draggable) */}
      {viewMode === 'recording' && (
        <RecordingWidget 
          isRecording={isRecording}
          isPaused={isPaused}
          stepCount={stepCount}
          onStop={() => setIsRecording(false)}
          onPause={() => setIsPaused(!isPaused)}
          onResume={() => setIsPaused(false)}
          onRecordAction={() => setStepCount(s => s + 1)}
        />
      )}

      {/* --- DEV TOOLBAR (For Switching Views) --- */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 p-1.5 glass-dark rounded-full shadow-2xl scale-90 hover:scale-100 transition-transform duration-300">
        <button 
          onClick={() => setViewMode('recording')}
          className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all ${
            viewMode === 'recording' 
              ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg' 
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Video size={16} />
          <span>Recording Mode</span>
        </button>
        <button 
          onClick={() => setViewMode('walkthrough')}
          className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all ${
            viewMode === 'walkthrough' 
              ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg' 
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <PlayCircle size={16} />
          <span>Walkthrough Mode</span>
        </button>
      </div>

    </div>
  );
};

export default App;