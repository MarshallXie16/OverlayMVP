import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-sans transition-all duration-300 rounded-xl font-semibold border focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none";

  const variants: Record<string, string> = {
    primary:
      "bg-gradient-to-r from-primary-500 to-primary-600 text-white border-transparent hover:-translate-y-0.5 hover:shadow-primary-lg active:translate-y-0 shadow-md focus:ring-primary-500",
    secondary:
      "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 hover:-translate-y-0.5 hover:border-neutral-300 focus:ring-neutral-400",
    accent:
      "bg-gradient-to-r from-accent-500 to-accent-600 text-white border-transparent hover:-translate-y-0.5 hover:shadow-accent-lg shadow-md focus:ring-accent-500",
    ghost:
      "bg-transparent text-neutral-600 border-transparent hover:bg-neutral-100 focus:ring-neutral-400",
    danger:
      "bg-gradient-to-r from-red-500 to-red-600 text-white border-transparent hover:-translate-y-0.5 hover:shadow-lg shadow-md focus:ring-red-500",
  };

  const sizes: Record<string, string> = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-5 py-2.5 gap-2",
    lg: "text-base px-6 py-3 gap-3",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
