import React, { useEffect, useState, useRef } from 'react';
import { Pause, Square, GripVertical, Play } from 'lucide-react';

interface RecordingWidgetProps {
  isRecording: boolean;
  isPaused: boolean;
  stepCount: number;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onRecordAction: () => void;
}

export const RecordingWidget: React.FC<RecordingWidgetProps> = ({
  isRecording,
  isPaused,
  stepCount,
  onStop,
  onPause,
  onResume,
  onRecordAction
}) => {
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState({ x: 24, y: window.innerHeight - 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Timer simulation
  useEffect(() => {
    let interval: any;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Click simulator
  useEffect(() => {
    const handleClick = () => {
      if(isRecording && !isPaused) {
        onRecordAction();
      }
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [isRecording, isPaused, onRecordAction]);

  // Draggable Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (widgetRef.current) {
      setIsDragging(true);
      const rect = widgetRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) return null;

  return (
    <div 
      ref={widgetRef}
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        position: 'fixed',
        zIndex: 9999, // Ensure it's above everything
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
      className="flex items-center"
    >
      
      {/* Main Container */}
      <div className="bg-white/90 backdrop-blur-md border border-neutral-200/60 rounded-full pl-2 pr-2 py-2 shadow-2xl flex items-center gap-3 ring-1 ring-black/5 select-none transition-shadow hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        
        {/* Drag Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-teal-600 transition-colors px-1"
        >
          <GripVertical size={20} />
        </div>

        {/* Status & Timer */}
        <div className="flex items-center gap-3 pr-4 border-r border-neutral-200">
          <div className="relative flex h-3 w-3">
             {isPaused ? (
               <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400 ring-2 ring-amber-100"></span>
             ) : (
               <>
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
               </>
             )}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-0.5">
              {isPaused ? 'Paused' : 'Rec'}
            </span>
            <span className="text-sm font-mono font-medium text-neutral-900 tabular-nums w-12">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Steps Counter */}
        <div className="flex flex-col min-w-[40px] leading-none items-center pr-2">
          <span className="text-lg font-bold text-neutral-900 leading-none">{stepCount}</span>
          <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Steps</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pl-2 border-l border-neutral-200">
          {isPaused ? (
             <button 
             onClick={onResume}
             className="h-8 w-8 flex items-center justify-center rounded-full bg-teal-50 text-teal-600 hover:bg-teal-100 hover:text-teal-700 transition-colors"
             title="Resume"
           >
             <Play size={14} fill="currentColor" />
           </button>
          ) : (
            <button 
              onClick={onPause}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-800 transition-colors"
              title="Pause"
            >
              <Pause size={14} fill="currentColor" />
            </button>
          )}

          <button 
            onClick={onStop}
            className="h-8 w-8 flex items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
            title="Finish Recording"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </div>

      </div>
    </div>
  );
};