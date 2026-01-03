/**
 * Layout Component
 * Main layout wrapper with sidebar navigation and glassmorphic background
 */

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * Animated background blobs for glassmorphism effect
 */
const AnimatedBlobs: React.FC = () => (
  <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
    <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary-300/30 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob"></div>
    <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent-300/20 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-2000"></div>
    <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-purple-300/20 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-4000"></div>
  </div>
);

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-primary-50 font-sans text-neutral-900">
      {/* Animated background gradients */}
      <AnimatedBlobs />

      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main content area */}
      <main className="flex-1 ml-64 p-8 relative z-10">{children}</main>
    </div>
  );
};
