import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  onValue,
  Database,
  push,
} from "firebase/database";
import {
  Testimony,
  LiveTestimony,
  ServiceType,
  DEFAULT_SERVICES,
  FirebaseConfig,
} from "../types/testimonies";

let app: FirebaseApp | null = null;
let database: Database | null = null;
let currentConfig: FirebaseConfig | null = null;

/**
 * Validates that a Firebase config has all required fields and a valid databaseURL
 */
export function isValidFirebaseConfig(config: FirebaseConfig | null): config is FirebaseConfig {
  if (!config) return false;
  
  // Check for required fields
  if (!config.apiKey || !config.projectId || !config.databaseURL) {
    return false;
  }
  
  // Validate databaseURL format - must be a valid Firebase Realtime Database URL
  // Format: https://<project-id>.firebaseio.com or https://<project-id>.firebasedatabase.app
  const urlPattern = /^https:\/\/([a-zA-Z0-9-]+)\.(firebaseio\.com|firebasedatabase\.app)(\/.*)?$/;
  if (!urlPattern.test(config.databaseURL)) {
    return false;
  }
  
  return true;
}

function getFirebaseApp(config: FirebaseConfig): FirebaseApp {
  // Check if config has changed by comparing key fields
  const configChanged =
    !currentConfig ||
    currentConfig.apiKey !== config.apiKey ||
    currentConfig.projectId !== config.projectId ||
    currentConfig.databaseURL !== config.databaseURL;

  // If config changed or app doesn't exist, reinitialize
  if (!app || configChanged) {
    // If there are existing apps, try to get the default one first
    const existingApps = getApps();
    if (existingApps.length > 0 && !configChanged) {
      app = existingApps[0];
    } else {
      // Validate databaseURL before initializing
      if (!config.databaseURL || !config.databaseURL.startsWith('https://') || config.databaseURL.includes('<YOUR')) {
        throw new Error(`Invalid Firebase database URL: ${config.databaseURL}. Please configure a valid Firebase URL in Settings > Live Testimonies.`);
      }
      // Initialize new app - Firebase will handle multiple instances
      try {
        app = initializeApp(config);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to initialize Firebase: ${errorMsg}. Please check your Firebase configuration.`);
      }
    }
    currentConfig = { ...config };
    // Reset database when config changes
    database = null;
  }
  return app;
}

function getFirebaseDatabase(config: FirebaseConfig): Database {
  // Validate config before attempting to use it
  if (!isValidFirebaseConfig(config)) {
    throw new Error(
      "Invalid Firebase configuration. Please ensure all required fields are set and databaseURL is in the format: https://<YOUR-FIREBASE>.firebaseio.com"
    );
  }

  const configChanged =
    !currentConfig ||
    currentConfig.apiKey !== config.apiKey ||
    currentConfig.projectId !== config.projectId ||
    currentConfig.databaseURL !== config.databaseURL;

  if (!database || configChanged) {
    try {
      database = getDatabase(getFirebaseApp(config));
    } catch (error) {
      // Reset state on error
      database = null;
      app = null;
      currentConfig = null;
      throw error;
    }
  }
  return database;
}

// Get testimonies by date and service
export async function getTestimoniesByDateAndService(
  config: FirebaseConfig,
  date: string,
  service: string,
  statusFilter?: "pending" | "approved" | "declined"
): Promise<Testimony[]> {
  const db = getFirebaseDatabase(config);
  const testimoniesRef = ref(db, "testimonies");
  const snapshot = await get(testimoniesRef);

  if (!snapshot.exists()) return [];

  const testimonies: Testimony[] = [];
  snapshot.forEach((child) => {
    const data = child.val();
    if (data.date === date && data.service === service) {
      if (!statusFilter || data.status === statusFilter) {
        testimonies.push({ id: child.key!, ...data });
      }
    }
  });

  return testimonies.sort((a, b) => a.createdAt - b.createdAt);
}

// Live testimony operations
export async function setLiveTestimony(
  config: FirebaseConfig,
  testimony: LiveTestimony
): Promise<void> {
  const db = getFirebaseDatabase(config);
  const liveRef = ref(db, "liveTestimony");
  await set(liveRef, testimony);
}

export async function getLiveTestimony(
  config: FirebaseConfig
): Promise<LiveTestimony | null> {
  const db = getFirebaseDatabase(config);
  const liveRef = ref(db, "liveTestimony");
  const snapshot = await get(liveRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export async function clearLiveTestimony(
  config: FirebaseConfig
): Promise<void> {
  const db = getFirebaseDatabase(config);
  const liveRef = ref(db, "liveTestimony");
  await remove(liveRef);
}

// Services operations
export async function getServices(
  config: FirebaseConfig
): Promise<ServiceType[]> {
  const db = getFirebaseDatabase(config);
  const servicesRef = ref(db, "services");
  const snapshot = await get(servicesRef);

  if (!snapshot.exists()) {
    // Initialize with default services
    await initializeDefaultServices(config);
    return getServices(config);
  }

  const services: ServiceType[] = [];
  snapshot.forEach((child) => {
    services.push({ id: child.key!, ...child.val() });
  });

  return services.sort((a, b) => a.order - b.order);
}

async function initializeDefaultServices(config: FirebaseConfig): Promise<void> {
  const db = getFirebaseDatabase(config);
  const servicesRef = ref(db, "services");

  for (const service of DEFAULT_SERVICES) {
    const newServiceRef = push(servicesRef);
    await set(newServiceRef, service);
  }
}

// Realtime subscription for live testimony
export function subscribeToLiveTestimony(
  config: FirebaseConfig,
  callback: (live: LiveTestimony | null) => void,
  onError?: (err: unknown) => void
): () => void {
  const db = getFirebaseDatabase(config);
  const liveRef = ref(db, "liveTestimony");

  const unsubscribe = onValue(
    liveRef,
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() : null);
    },
    (err) => {
      console.error("Firebase subscribeToLiveTestimony error:", err);
      onError?.(err);
    }
  );

  return unsubscribe;
}

// Realtime subscription for testimonies by date and service
export function subscribeToTestimoniesByDateAndService(
  config: FirebaseConfig,
  date: string,
  service: string,
  callback: (testimonies: Testimony[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const db = getFirebaseDatabase(config);
  const testimoniesRef = ref(db, "testimonies");

  const unsubscribe = onValue(
    testimoniesRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }

      const testimonies: Testimony[] = [];
      snapshot.forEach((child) => {
        const data = child.val();
        if (data.date === date && data.service === service) {
          testimonies.push({ id: child.key!, ...data });
        }
      });

      callback(testimonies.sort((a, b) => a.createdAt - b.createdAt));
    },
    (err) => {
      console.error("Firebase subscribeToTestimoniesByDateAndService error:", err);
      onError?.(err);
    }
  );

  return unsubscribe;
}
