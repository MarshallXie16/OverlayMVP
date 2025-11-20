/**
 * IndexedDB Storage Module
 * Local storage for workflow steps before upload to backend
 *
 * Database: WorkflowRecorderDB
 * Object Store: steps (auto-incrementing key)
 *
 * Functions:
 * - initDB(): Initialize/open database
 * - addStep(): Store a step
 * - getSteps(): Retrieve all steps
 * - clearSteps(): Delete all steps
 * - getStepCount(): Count stored steps
 */

import type { StepCreate } from '@/shared/types';

const DB_NAME = 'WorkflowRecorderDB';
const DB_VERSION = 1;
const STORE_NAME = 'steps';

/**
 * Opens or creates the IndexedDB database
 */
export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        console.log('IndexedDB opened successfully');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        console.log('IndexedDB upgrade needed, creating object store');
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });

          // Create index on step_number for sorting
          objectStore.createIndex('step_number', 'step_number', {
            unique: false,
          });

          // Create index on timestamp
          objectStore.createIndex('timestamp', 'timestamp', {
            unique: false,
          });

          console.log('Object store created:', STORE_NAME);
        }
      };

      request.onblocked = () => {
        console.warn('IndexedDB blocked - close other tabs using this database');
        reject(new Error('Database blocked by other tabs'));
      };
    } catch (error) {
      console.error('Error opening IndexedDB:', error);
      reject(error);
    }
  });
}

/**
 * Adds a step to the database
 */
export async function addStep(step: StepCreate): Promise<number> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        // Add timestamp if not present
        const stepWithTimestamp = {
          ...step,
          timestamp: step.timestamp || new Date().toISOString(),
        };

        const request = store.add(stepWithTimestamp);

        request.onsuccess = () => {
          const id = request.result as number;
          console.log(`Step ${step.step_number} stored with ID:`, id);
          resolve(id);
        };

        request.onerror = () => {
          console.error('Error adding step:', request.error);

          // Check for quota exceeded error
          if (
            request.error?.name === 'QuotaExceededError' ||
            request.error?.message?.includes('quota')
          ) {
            reject(
              new Error(
                'Storage quota exceeded. Please upload workflow and clear local storage.'
              )
            );
          } else {
            reject(new Error(`Failed to add step: ${request.error?.message}`));
          }
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = () => {
          console.error('Transaction error:', transaction.error);
          db.close();
          reject(new Error(`Transaction failed: ${transaction.error?.message}`));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error in addStep:', error);
    throw error;
  }
}

/**
 * Retrieves all steps from the database, sorted by step_number
 */
export async function getSteps(): Promise<StepCreate[]> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('step_number');

        const request = index.getAll();

        request.onsuccess = () => {
          const steps = request.result as StepCreate[];
          console.log(`Retrieved ${steps.length} steps from IndexedDB`);
          resolve(steps);
        };

        request.onerror = () => {
          console.error('Error getting steps:', request.error);
          reject(new Error(`Failed to get steps: ${request.error?.message}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = () => {
          console.error('Transaction error:', transaction.error);
          db.close();
          reject(new Error(`Transaction failed: ${transaction.error?.message}`));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error in getSteps:', error);
    throw error;
  }
}

/**
 * Clears all steps from the database
 */
export async function clearSteps(): Promise<void> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.clear();

        request.onsuccess = () => {
          console.log('All steps cleared from IndexedDB');
          resolve();
        };

        request.onerror = () => {
          console.error('Error clearing steps:', request.error);
          reject(new Error(`Failed to clear steps: ${request.error?.message}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = () => {
          console.error('Transaction error:', transaction.error);
          db.close();
          reject(new Error(`Transaction failed: ${transaction.error?.message}`));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error in clearSteps:', error);
    throw error;
  }
}

/**
 * Gets the count of steps in the database
 */
export async function getStepCount(): Promise<number> {
  try {
    const db = await initDB();

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.count();

        request.onsuccess = () => {
          const count = request.result;
          console.log(`Step count: ${count}`);
          resolve(count);
        };

        request.onerror = () => {
          console.error('Error counting steps:', request.error);
          reject(new Error(`Failed to count steps: ${request.error?.message}`));
        };

        transaction.oncomplete = () => {
          db.close();
        };

        transaction.onerror = () => {
          console.error('Transaction error:', transaction.error);
          db.close();
          reject(new Error(`Transaction failed: ${transaction.error?.message}`));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  } catch (error) {
    console.error('Error in getStepCount:', error);
    throw error;
  }
}

/**
 * Deletes the entire database (for cleanup/reset)
 */
export function deleteDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => {
        console.log('Database deleted successfully');
        resolve();
      };

      request.onerror = () => {
        console.error('Error deleting database:', request.error);
        reject(new Error(`Failed to delete database: ${request.error?.message}`));
      };

      request.onblocked = () => {
        console.warn('Database deletion blocked - close other tabs');
        reject(new Error('Database deletion blocked'));
      };
    } catch (error) {
      console.error('Error in deleteDB:', error);
      reject(error);
    }
  });
}
