/**
 * Vitest Setup File
 *
 * Mock Chrome APIs and global objects for testing
 */

import { vi } from "vitest";

// Mock XPathResult for happy-dom (doesn't have full XPath support)
// XPathResult constants used by document.evaluate()
globalThis.XPathResult = {
  ANY_TYPE: 0,
  NUMBER_TYPE: 1,
  STRING_TYPE: 2,
  BOOLEAN_TYPE: 3,
  UNORDERED_NODE_ITERATOR_TYPE: 4,
  ORDERED_NODE_ITERATOR_TYPE: 5,
  UNORDERED_NODE_SNAPSHOT_TYPE: 6,
  ORDERED_NODE_SNAPSHOT_TYPE: 7,
  ANY_UNORDERED_NODE_TYPE: 8,
  FIRST_ORDERED_NODE_TYPE: 9,
} as any;

// Mock chrome.storage API
const createStorageMock = () => {
  let storage: Record<string, any> = {};

  return {
    local: {
      get: vi.fn(
        (keys: string | string[] | null, callback?: (items: any) => void) => {
          return new Promise((resolve) => {
            let result: any = {};
            if (keys === null) {
              result = { ...storage };
            } else if (typeof keys === "string") {
              if (keys in storage) {
                result[keys] = storage[keys];
              }
            } else if (Array.isArray(keys)) {
              keys.forEach((key) => {
                if (key in storage) {
                  result[key] = storage[key];
                }
              });
            } else if (typeof keys === "object") {
              // Handle object with default values
              Object.keys(keys).forEach((key) => {
                result[key] = storage[key] ?? keys[key];
              });
            }

            if (callback) {
              callback(result);
            }
            resolve(result);
          });
        },
      ),

      set: vi.fn((items: Record<string, any>, callback?: () => void) => {
        return new Promise((resolve) => {
          Object.keys(items).forEach((key) => {
            storage[key] = items[key];
          });

          if (callback) {
            callback();
          }
          resolve(undefined);
        });
      }),

      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        return new Promise((resolve) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach((key) => {
            delete storage[key];
          });

          if (callback) {
            callback();
          }
          resolve(undefined);
        });
      }),

      clear: vi.fn((callback?: () => void) => {
        return new Promise((resolve) => {
          storage = {};
          if (callback) {
            callback();
          }
          resolve(undefined);
        });
      }),
    },

    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
};

// Mock chrome.runtime API
const createRuntimeMock = () => ({
  lastError: null as chrome.runtime.LastError | null,
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  onInstalled: {
    addListener: vi.fn(),
  },
  sendMessage: vi.fn(),
});

// Mock chrome.tabs API
const createTabsMock = () => ({
  query: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  captureVisibleTab: vi.fn(),
  onUpdated: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
});

// Create global chrome mock
globalThis.chrome = {
  storage: createStorageMock(),
  runtime: createRuntimeMock(),
  tabs: createTabsMock(),
} as any;

// Reset storage between tests
export function resetChromeStorage() {
  // Check if chrome.storage exists before trying to clear
  if (globalThis.chrome?.storage?.local?.clear) {
    (globalThis.chrome.storage.local.clear as any)();
  }
}

// Mock fetch for API tests
export function mockFetch(
  response: any,
  options: { status?: number; ok?: boolean } = {},
) {
  const mockResponse = {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.status === 401 ? "Unauthorized" : "OK",
    json: vi.fn(() => Promise.resolve(response)),
    text: vi.fn(() => Promise.resolve(JSON.stringify(response))),
    headers: new Headers({ "content-type": "application/json" }),
  };

  global.fetch = vi.fn(() => Promise.resolve(mockResponse as any));
  return global.fetch;
}

// Reset all mocks between tests
beforeEach(() => {
  resetChromeStorage();
  vi.clearAllMocks();
});
