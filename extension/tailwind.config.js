/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Teal (from product design)
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6', // Main brand color
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // Accent - Coral (from product design)
        accent: {
          50: '#fff5f5',
          100: '#ffe3e3',
          200: '#ffc9c9',
          300: '#ffa8a8',
          400: '#ff8787',
          500: '#ff6b6b', // Main accent color
          600: '#fa5252',
          700: '#f03e3e',
          800: '#e03131',
          900: '#c92a2a',
        },
      },
      // Extension-specific z-index layers (very high to overlay page content)
      zIndex: {
        'extension-backdrop': '999997',
        'extension-spotlight': '999998',
        'extension-tooltip': '999999',
        'extension-controls': '1000000',
      },
    },
  },
  plugins: [],
};
