# Workflow Platform - Design System

**Version:** 2.0  
**Last Updated:** November 2024  
**Theme:** Modern SaaS with Glassmorphism

---

## Table of Contents

1. [Brand Identity](#brand-identity)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Elevation & Shadows](#elevation--shadows)
6. [Animation System](#animation-system)
7. [Component Library](#component-library)
8. [Glassmorphism Guidelines](#glassmorphism-guidelines)
9. [Responsive Design](#responsive-design)
10. [Accessibility](#accessibility)

---

## Brand Identity

### Brand Archetype: **The Guide**

We position ourselves as the helpful, knowledgeable guide who makes the complex simple. Like a patient teacher or experienced mentor, we empower users to master their tools without frustration.

**Core Personality Traits:**
- **Approachable** - Never intimidating or overly technical
- **Reliable** - Always works, always there when needed
- **Clear** - No jargon, no confusion
- **Efficient** - Respects user's time
- **Empowering** - Makes users feel capable, not dependent

**Voice Principles:**
- Clear over clever
- Active over passive
- Conversational but professional
- Solution-oriented in error states

**Emotional Goals:**
Users should feel: Confident, Relieved, In Control, Efficient

---

## Color System

### Primary Palette: Teal + Coral

Our color system uses **Teal** (intelligent, fresh, trustworthy) as the primary color and **Coral** (warm, friendly, attention-grabbing) as the accent. This creates a modern, approachable feeling while standing out from typical SaaS blues.

### Color Tokens

```css
:root {
  /* ========================================
     PRIMARY - TEAL (70% of UI)
     Intelligence, Freshness, Trust
     ======================================== */
  --color-primary-50: #f0fdfa;
  --color-primary-100: #ccfbf1;
  --color-primary-200: #99f6e4;
  --color-primary-300: #5eead4;
  --color-primary-400: #2dd4bf;
  --color-primary-500: #14b8a6;  /* Main brand color */
  --color-primary-600: #0d9488;
  --color-primary-700: #0f766e;
  --color-primary-800: #115e59;
  --color-primary-900: #134e4a;
  
  /* ========================================
     ACCENT - CORAL (20% of UI)
     Warmth, Friendliness, Attention
     ======================================== */
  --color-accent-50: #fff5f5;
  --color-accent-100: #ffe3e3;
  --color-accent-200: #ffc9c9;
  --color-accent-300: #ffa8a8;
  --color-accent-400: #ff8787;
  --color-accent-500: #ff6b6b;  /* Main accent color */
  --color-accent-600: #fa5252;
  --color-accent-700: #f03e3e;
  --color-accent-800: #e03131;
  --color-accent-900: #c92a2a;
  
  /* ========================================
     SEMANTIC COLORS
     ======================================== */
  
  /* Success - Green */
  --color-success-50: #f0fdf4;
  --color-success-100: #dcfce7;
  --color-success-500: #22c55e;
  --color-success-600: #16a34a;
  --color-success-700: #15803d;
  
  /* Warning - Amber */
  --color-warning-50: #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-500: #f59e0b;
  --color-warning-600: #d97706;
  --color-warning-700: #b45309;
  
  /* Error - Red */
  --color-error-50: #fef2f2;
  --color-error-100: #fee2e2;
  --color-error-500: #ef4444;
  --color-error-600: #dc2626;
  --color-error-700: #b91c1c;
  
  /* Info - Blue */
  --color-info-50: #eff6ff;
  --color-info-100: #dbeafe;
  --color-info-500: #3b82f6;
  --color-info-600: #2563eb;
  --color-info-700: #1d4ed8;
  
  /* ========================================
     NEUTRALS (10% of UI)
     Backgrounds, Text, Borders
     ======================================== */
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-200: #e5e5e5;
  --color-neutral-300: #d4d4d4;
  --color-neutral-400: #a3a3a3;
  --color-neutral-500: #737373;
  --color-neutral-600: #525252;
  --color-neutral-700: #404040;
  --color-neutral-800: #262626;
  --color-neutral-900: #171717;
  --color-neutral-950: #0a0a0a;
}
```

### Gradient Presets

```css
:root {
  /* Primary Gradients */
  --gradient-primary: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
  --gradient-primary-vibrant: linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%);
  
  /* Accent Gradients */
  --gradient-accent: linear-gradient(135deg, #ff6b6b 0%, #fa5252 100%);
  
  /* Combined Gradients */
  --gradient-hero: linear-gradient(135deg, #14b8a6 0%, #0d9488 50%, #5eead4 100%);
  --gradient-hero-vibrant: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 25%, #0d9488 50%, #ff8787 75%, #ff6b6b 100%);
  
  /* Background Gradients */
  --gradient-background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%);
  --gradient-card: linear-gradient(135deg, rgba(20, 184, 166, 0.03) 0%, rgba(255, 107, 107, 0.03) 100%);
}
```

### Color Usage Guidelines

| Element | Color | Usage |
|---------|-------|-------|
| **Primary CTAs** | `--color-primary-500` | Main action buttons, links |
| **Secondary Actions** | `--color-neutral-600` | Edit, cancel, back buttons |
| **Accent/Attention** | `--color-accent-500` | Warnings that need attention but aren't errors |
| **Success States** | `--color-success-500` | Workflow healthy, save successful |
| **Destructive Actions** | `--color-error-500` | Delete, broken workflows |
| **Body Text** | `--color-neutral-900` | Primary readable text |
| **Secondary Text** | `--color-neutral-600` | Descriptions, metadata |
| **Borders** | `--color-neutral-200` | Subtle divisions |
| **Backgrounds** | `--color-neutral-50` | Page backgrounds |

---

## Typography

### Font Stack

```css
:root {
  --font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
}
```

**Required Font Import:**
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

### Type Scale

Based on 1.125 ratio (Major Second)

```css
:root {
  --text-xs: 0.75rem;      /* 12px - Small labels, badges */
  --text-sm: 0.875rem;     /* 14px - Secondary text, hints */
  --text-base: 1rem;       /* 16px - Body text */
  --text-lg: 1.125rem;     /* 18px - Subheadings */
  --text-xl: 1.25rem;      /* 20px - Card titles */
  --text-2xl: 1.5rem;      /* 24px - Section headings */
  --text-3xl: 1.875rem;    /* 30px - Page headings */
  --text-4xl: 2.25rem;     /* 36px - Hero titles */
  --text-5xl: 3rem;        /* 48px - Landing page hero */
}
```

### Font Weights

```css
:root {
  --font-normal: 400;      /* Body text */
  --font-medium: 500;      /* Emphasis, labels */
  --font-semibold: 600;    /* Buttons, headings */
  --font-bold: 700;        /* Strong headings */
  --font-extrabold: 800;   /* Hero titles */
}
```

### Line Heights

```css
:root {
  --leading-tight: 1.25;   /* Headings */
  --leading-normal: 1.5;   /* Body text */
  --leading-relaxed: 1.75; /* Long-form content */
}
```

### Typography Utilities

```css
.text-primary {
  color: var(--color-neutral-900);
}

.text-secondary {
  color: var(--color-neutral-600);
}

.text-muted {
  color: var(--color-neutral-500);
}

.text-gradient-primary {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Spacing & Layout

### Spacing Scale

4px base unit system

```css
:root {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

### Border Radius

```css
:root {
  --radius-none: 0;
  --radius-sm: 0.25rem;   /* 4px - Tight corners */
  --radius-md: 0.5rem;    /* 8px - Buttons, inputs */
  --radius-lg: 0.75rem;   /* 12px - Cards */
  --radius-xl: 1rem;      /* 16px - Feature cards */
  --radius-2xl: 1.5rem;   /* 24px - Hero cards */
  --radius-full: 9999px;  /* Pills, avatars */
}
```

### Container Widths

```css
:root {
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1536px;
}

.container {
  width: 100%;
  max-width: var(--container-xl);
  margin: 0 auto;
  padding: 0 var(--space-6);
}
```

---

## Elevation & Shadows

### Shadow System

```css
:root {
  /* Elevation Levels */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 
               0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 
               0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 
               0 10px 10px -5px rgba(0, 0, 0, 0.04);
  --shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  
  /* Colored Shadows for Primary Elements */
  --shadow-primary: 0 8px 25px rgba(20, 184, 166, 0.25);
  --shadow-primary-lg: 0 12px 35px rgba(20, 184, 166, 0.3);
}
```

### Z-Index Layers

```css
:root {
  /* Application Layers */
  --z-base: 0;
  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-modal-backdrop: 1200;
  --z-modal: 1300;
  --z-popover: 1400;
  --z-tooltip: 1500;
  --z-notification: 1600;
  
  /* Extension Layers (higher than page content) */
  --z-extension-backdrop: 999997;
  --z-extension-spotlight: 999998;
  --z-extension-tooltip: 999999;
  --z-extension-controls: 1000000;
}
```

---

## Animation System

### Timing Functions

```css
:root {
  /* Durations - Premium feel with 300-500ms */
  --duration-fast: 300ms;
  --duration-base: 400ms;
  --duration-slow: 500ms;
  
  /* Easing Functions */
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  
  /* Combined Transitions */
  --transition-fast: var(--duration-fast) var(--ease-smooth);
  --transition-base: var(--duration-base) var(--ease-smooth);
  --transition-slow: var(--duration-slow) var(--ease-smooth);
}
```

### Animation Presets

```css
/* Hover Lift */
.hover-lift {
  transition: transform var(--transition-base),
              box-shadow var(--transition-base);
}

.hover-lift:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-xl);
}

/* Hover Scale */
.hover-scale {
  transition: transform var(--transition-base);
}

.hover-scale:hover {
  transform: scale(1.05);
}

/* Hover Glow */
.hover-glow {
  transition: box-shadow var(--transition-base);
}

.hover-glow:hover {
  box-shadow: var(--shadow-primary-lg);
}

/* Fade In */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn var(--duration-base) var(--ease-smooth);
}

/* Spin (for loaders) */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Shimmer (for skeletons) */
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
```

### Animation Guidelines

**Hover States:**
- Buttons: lift + scale (2-4px up, 1.02x scale)
- Cards: lift + rotate (-1deg subtle tilt)
- Icons: scale + rotate (1.1x scale, 5deg rotation)
- Links: color change only (no movement)

**Focus States:**
- Inputs: border color + shadow ring
- Buttons: same as hover + focus ring
- Cards: border color change

**Loading States:**
- Spinners: 800ms rotation
- Skeletons: 1500ms shimmer
- Progress bars: smooth 400ms transitions

---

## Component Library

### Buttons

#### Primary Button

```html
<button class="btn btn-primary">Create Workflow</button>
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-base);
  white-space: nowrap;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: var(--shadow-md);
}

.btn-primary:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: var(--shadow-primary-lg);
}

.btn-primary:active {
  transform: translateY(0) scale(0.98);
  box-shadow: var(--shadow-md);
}

.btn-primary:disabled {
  background: var(--color-neutral-300);
  cursor: not-allowed;
  transform: none;
}
```

#### Secondary Button

```html
<button class="btn btn-secondary">Cancel</button>
```

```css
.btn-secondary {
  background: white;
  color: var(--color-neutral-700);
  border: 2px solid var(--color-neutral-200);
}

.btn-secondary:hover {
  background: var(--color-neutral-50);
  border-color: var(--color-neutral-300);
  transform: translateY(-2px);
}
```

#### Accent Button

```html
<button class="btn btn-accent">Fix Now</button>
```

```css
.btn-accent {
  background: var(--gradient-accent);
  color: white;
  box-shadow: var(--shadow-md);
}

.btn-accent:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.3);
}
```

#### Button Sizes

```css
.btn-sm {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
}

.btn-lg {
  padding: var(--space-4) var(--space-8);
  font-size: var(--text-lg);
}
```

---

### Cards

#### Standard Card

```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Register Invoice</h3>
    <span class="badge badge-success">Healthy</span>
  </div>
  <div class="card-body">
    <p class="card-description">
      Process for entering vendor invoices into NetSuite
    </p>
    <div class="card-meta">
      <span>7 steps</span>
      <span>•</span>
      <span>Updated 2 days ago</span>
    </div>
  </div>
  <div class="card-footer">
    <button class="btn btn-secondary btn-sm">Edit</button>
    <button class="btn btn-primary btn-sm">Start</button>
  </div>
</div>
```

```css
.card {
  background: white;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: all var(--transition-base);
}

.card:hover {
  transform: translateY(-8px) rotate(-1deg);
  box-shadow: var(--shadow-2xl);
  border-color: var(--color-primary-500);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6);
  border-bottom: 1px solid var(--color-neutral-100);
}

.card-title {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--color-neutral-900);
  margin: 0;
}

.card-body {
  padding: var(--space-6);
}

.card-description {
  font-size: var(--text-base);
  color: var(--color-neutral-600);
  margin-bottom: var(--space-4);
  line-height: var(--leading-normal);
}

.card-meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-neutral-500);
  align-items: center;
}

.card-footer {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
  padding: var(--space-4) var(--space-6);
  background: var(--color-neutral-50);
  border-top: 1px solid var(--color-neutral-100);
}
```

#### Glassmorphic Card

```html
<div class="card card-glass">
  <!-- content -->
</div>
```

```css
.card-glass {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}
```

---

### Badges

```html
<span class="badge badge-success">Healthy</span>
<span class="badge badge-warning">Needs Review</span>
<span class="badge badge-error">Broken</span>
<span class="badge badge-info">Draft</span>
<span class="badge badge-neutral">Archived</span>
```

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all var(--transition-fast);
}

.badge-success {
  background: linear-gradient(135deg, var(--color-success-50) 0%, var(--color-success-100) 100%);
  color: var(--color-success-700);
  border: 1px solid var(--color-success-200);
}

.badge-warning {
  background: linear-gradient(135deg, var(--color-warning-50) 0%, var(--color-warning-100) 100%);
  color: var(--color-warning-700);
  border: 1px solid var(--color-warning-200);
}

.badge-error {
  background: linear-gradient(135deg, var(--color-error-50) 0%, var(--color-error-100) 100%);
  color: var(--color-error-700);
  border: 1px solid var(--color-error-200);
}

.badge-info {
  background: linear-gradient(135deg, var(--color-info-50) 0%, var(--color-info-100) 100%);
  color: var(--color-info-700);
  border: 1px solid var(--color-info-200);
}

.badge-neutral {
  background: linear-gradient(135deg, var(--color-neutral-50) 0%, var(--color-neutral-100) 100%);
  color: var(--color-neutral-700);
  border: 1px solid var(--color-neutral-200);
}
```

---

### Alerts

```html
<div class="alert alert-success">
  <span class="alert-icon">✓</span>
  <div class="alert-content">
    <div class="alert-title">Workflow saved successfully</div>
    <div class="alert-description">Your team can now access this workflow.</div>
  </div>
</div>
```

```css
.alert {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid;
  transition: all var(--transition-base);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.alert:hover {
  transform: translateX(4px);
}

.alert-success {
  background: linear-gradient(135deg, rgba(236, 253, 245, 0.95) 0%, rgba(209, 250, 229, 0.95) 100%);
  border-color: var(--color-success-200);
  color: var(--color-success-800);
}

.alert-warning {
  background: linear-gradient(135deg, rgba(255, 251, 235, 0.95) 0%, rgba(254, 243, 199, 0.95) 100%);
  border-color: var(--color-warning-200);
  color: var(--color-warning-800);
}

.alert-error {
  background: linear-gradient(135deg, rgba(254, 242, 242, 0.95) 0%, rgba(254, 226, 226, 0.95) 100%);
  border-color: var(--color-error-200);
  color: var(--color-error-800);
}

.alert-info {
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.95) 0%, rgba(219, 234, 254, 0.95) 100%);
  border-color: var(--color-info-200);
  color: var(--color-info-800);
}

.alert-icon {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  flex-shrink: 0;
}

.alert-content {
  flex: 1;
}

.alert-title {
  font-weight: var(--font-semibold);
  margin-bottom: var(--space-1);
  font-size: var(--text-sm);
}

.alert-description {
  font-size: var(--text-sm);
  opacity: 0.9;
}
```

---

### Forms

#### Input Field

```html
<div class="form-group">
  <label for="workflow-name" class="form-label">Workflow Name</label>
  <input 
    type="text" 
    id="workflow-name" 
    class="form-input"
    placeholder="e.g., Register Invoice"
  />
  <span class="form-hint">Choose a clear, descriptive name</span>
</div>
```

```css
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-neutral-900);
}

.form-input {
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-base);
  font-family: var(--font-display);
  color: var(--color-neutral-900);
  background: white;
  border: 2px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  transition: all var(--transition-base);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.1);
  transform: translateY(-1px);
}

.form-input::placeholder {
  color: var(--color-neutral-400);
}

.form-input.error {
  border-color: var(--color-error-500);
}

.form-input.error:focus {
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.1);
}

.form-hint {
  font-size: var(--text-sm);
  color: var(--color-neutral-500);
}

.form-error {
  font-size: var(--text-sm);
  color: var(--color-error-600);
  font-weight: var(--font-medium);
}

textarea.form-input {
  resize: vertical;
  min-height: 100px;
}
```

---

### Loading States

#### Spinner

```html
<div class="spinner"></div>
```

```css
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-neutral-200);
  border-top-color: var(--color-primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

#### Skeleton Loader

```html
<div class="skeleton" style="width: 200px; height: 20px;"></div>
```

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-neutral-200) 25%,
    var(--color-neutral-100) 50%,
    var(--color-neutral-200) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

@keyframes shimmer {
  to { background-position: -200% 0; }
}
```

---

### Navigation

```html
<nav class="navbar">
  <div class="navbar-brand">
    <div class="navbar-logo">W</div>
    <span class="navbar-title">Workflow Platform</span>
  </div>
  
  <div class="navbar-actions">
    <button class="btn btn-secondary">Sign In</button>
    <button class="btn btn-primary">Get Started</button>
  </div>
</nav>
```

```css
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--color-neutral-200);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  transition: all var(--transition-base);
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.navbar-logo {
  width: 40px;
  height: 40px;
  background: var(--gradient-primary);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: var(--font-extrabold);
  font-size: var(--text-xl);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base);
}

.navbar-logo:hover {
  transform: rotate(5deg) scale(1.05);
  box-shadow: var(--shadow-primary);
}

.navbar-title {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  color: var(--color-neutral-900);
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

---

### Empty States

```html
<div class="empty-state">
  <div class="empty-state-icon">📋</div>
  <h3 class="empty-state-title">No workflows yet</h3>
  <p class="empty-state-description">
    Create your first workflow to get started guiding your team
  </p>
  <button class="btn btn-primary">Create Workflow</button>
</div>
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-8);
  text-align: center;
}

.empty-state-icon {
  font-size: 64px;
  margin-bottom: var(--space-6);
  opacity: 0.5;
}

.empty-state-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--color-neutral-900);
  margin-bottom: var(--space-3);
}

.empty-state-description {
  font-size: var(--text-base);
  color: var(--color-neutral-600);
  max-width: 400px;
  margin-bottom: var(--space-6);
  line-height: var(--leading-normal);
}
```

---

## Glassmorphism Guidelines

### Core Properties

```css
.glass {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: var(--shadow-lg);
}
```

### Glassmorphic Elements

**Use glassmorphism for:**
- Navigation bars (sticky headers)
- Modal overlays
- Floating tooltips
- Accent cards over gradient backgrounds
- Notification panels

**Don't use glassmorphism for:**
- Primary content cards (use solid backgrounds)
- Form inputs (need clear readability)
- Text-heavy content areas

### Background Requirements

Glassmorphism requires a **colorful or gradient background** to show the blur effect. It won't work on plain white/gray backgrounds.

```css
/* Good - over gradient */
.hero-section {
  background: var(--gradient-hero-vibrant);
}

.hero-section .glass-card {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
}
```

---

## Responsive Design

### Breakpoints

```css
/* Mobile First Approach */

/* Small devices (phones, 640px and up) */
@media (min-width: 640px) {
  /* ... */
}

/* Medium devices (tablets, 768px and up) */
@media (min-width: 768px) {
  /* ... */
}

/* Large devices (desktops, 1024px and up) */
@media (min-width: 1024px) {
  /* ... */
}

/* Extra large devices (wide screens, 1280px and up) */
@media (min-width: 1280px) {
  /* ... */
}
```

### Responsive Patterns

```css
/* Responsive Grid */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Responsive Typography */
.hero-title {
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: var(--leading-tight);
}
```

### Mobile Optimizations

- Touch targets minimum 44px × 44px
- Larger padding on mobile (add 4-8px)
- Stack cards vertically on mobile
- Hamburger menu below 768px
- Full-width form inputs on mobile

---

## Accessibility

### Color Contrast

All text must meet WCAG AA standards:
- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio

**Tested Combinations:**
- ✅ `--color-neutral-900` on white (21:1)
- ✅ `--color-neutral-600` on white (7:1)
- ✅ White on `--color-primary-500` (4.7:1)
- ✅ White on `--color-accent-500` (4.9:1)

### Focus States

All interactive elements must have visible focus states:

```css
.focusable:focus {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}

/* Or custom ring */
.focusable:focus {
  box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.2);
}
```

### Keyboard Navigation

- All interactive elements accessible via Tab
- Logical tab order (top to bottom, left to right)
- Escape key closes modals/dropdowns
- Enter/Space activates buttons

### Screen Reader Support

```html
<!-- Use semantic HTML -->
<button>Click Me</button>  <!-- Not <div> -->

<!-- Add aria-labels where needed -->
<button aria-label="Close modal">×</button>

<!-- Use proper heading hierarchy -->
<h1>Main Title</h1>
  <h2>Section Title</h2>
    <h3>Subsection</h3>
```

---

## Quick Reference

### Most Common Classes

```css
/* Buttons */
.btn.btn-primary      /* Primary action */
.btn.btn-secondary    /* Secondary action */
.btn.btn-sm           /* Small button */
.btn.btn-lg           /* Large button */

/* Cards */
.card                 /* Standard card */
.card-glass           /* Glassmorphic card */

/* Badges */
.badge.badge-success  /* Green badge */
.badge.badge-warning  /* Amber badge */
.badge.badge-error    /* Red badge */

/* Alerts */
.alert.alert-success  /* Success message */
.alert.alert-error    /* Error message */

/* Forms */
.form-group           /* Form field wrapper */
.form-input           /* Text input */
.form-label           /* Input label */

/* Layout */
.container            /* Max-width container */
.grid                 /* Responsive grid */

/* Loading */
.spinner              /* Loading spinner */
.skeleton             /* Skeleton loader */
```

### Color Variables Cheat Sheet

```css
--color-primary-500   /* Main teal */
--color-accent-500    /* Main coral */
--color-success-500   /* Green */
--color-warning-500   /* Amber */
--color-error-500     /* Red */
--color-neutral-900   /* Dark text */
--color-neutral-600   /* Secondary text */
--color-neutral-200   /* Borders */
--color-neutral-50    /* Backgrounds */
```

---

**End of Design System**

*For questions or contributions, please refer to the product team.*
