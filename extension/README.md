# Workflow Recorder - Chrome Extension

Chrome extension for recording, managing, and executing interactive workflows with AI-powered guidance.

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Install root dependencies (if not already done)
cd .. && npm install
```

### Development

```bash
# Build extension in watch mode (auto-rebuild on changes)
npm run dev

# Build for production
npm run build
```

### Loading Extension in Chrome

1. Build the extension:
   ```bash
   npm run dev  # or npm run build
   ```

2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked**

5. Select the `dist/` folder inside this directory:
   ```
   /path/to/OverlayMVP/extension/dist/
   ```

6. The extension should now appear in your Chrome toolbar

### Testing the Extension

After loading:

1. **Click the extension icon** in Chrome toolbar
   - Should see the popup UI with placeholder message

2. **Open browser console** in any web page
   - Should see messages from content scripts:
     - "📝 Workflow Recorder: Content script (recorder) loaded"
     - "🎯 Workflow Recorder: Content script (walkthrough) loaded"

3. **Check background service worker**:
   - Go to `chrome://extensions/`
   - Find "Workflow Recorder"
   - Click "service worker" link
   - Should see console logs from background worker

### Project Structure

```
extension/
├── src/
│   ├── background/          # Background service worker
│   │   └── index.ts
│   ├── content/             # Content scripts injected into pages
│   │   ├── recorder.ts      # Records user actions
│   │   ├── walkthrough.ts   # Guides users through workflows
│   │   └── overlay.css      # Styles for overlays
│   ├── popup/               # Popup UI (React app)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── index.css
│   ├── shared/              # Shared types and utilities
│   │   └── types.ts
│   └── manifest.json        # Extension manifest (Manifest V3)
├── public/
│   └── icons/               # Extension icons
├── dist/                    # Built extension (gitignored)
├── vite.config.ts           # Vite build configuration
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── package.json
```

### Build System

**Vite Configuration Highlights:**
- **Background worker**: Bundled as ES module (Manifest V3 requirement)
- **Content scripts**: Bundled as IIFE (Chrome requires non-module format)
- **Popup**: React app with hot module replacement (HMR)
- **Assets**: Icons and manifest.json copied to dist/

### Development Workflow

1. **Make changes** to source files in `src/`

2. **Hot reload** (dev mode):
   - `npm run dev` watches for changes
   - Rebuild happens automatically
   - Refresh extension in `chrome://extensions/`
   - Reload any open tabs

3. **Test changes**:
   - Open popup to test UI changes
   - Check console logs in content scripts
   - Inspect service worker logs

### Debugging

**Popup UI:**
- Right-click extension icon → Inspect popup
- Or click extension icon, then F12

**Content Scripts:**
- Open any web page
- F12 → Console
- Look for logs from recorder/walkthrough scripts

**Background Worker:**
- `chrome://extensions/`
- Find "Workflow Recorder"
- Click "service worker" (or "Inspect views: service worker")

**Common Issues:**

1. **Extension not loading:**
   - Check manifest.json is valid
   - Ensure all referenced files exist in dist/
   - Check console for errors

2. **Content scripts not injecting:**
   - Refresh the page after loading extension
   - Check host_permissions in manifest.json

3. **Build errors:**
   - Run `npm install` to ensure dependencies are installed
   - Check TypeScript errors: `npx tsc --noEmit`

### TypeScript

Strict mode enabled with:
- No unused locals/parameters
- No implicit returns
- No fallthrough cases
- Full type checking

### Tailwind CSS

Using custom theme matching product design:
- **Primary color**: Teal (#14b8a6)
- **Accent color**: Coral (#ff6b6b)
- **Extension z-index**: 999997-1000000 (overlays page content)

### Next Steps

- **FE-002**: Shared types & API client (authentication, workflow API calls)
- **FE-003**: Background service worker (message passing, screenshot capture)
- **FE-004**: Popup UI (login form, recording controls)
- **FE-005**: Content script recorder (event capture, selector extraction)

### Resources

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)
