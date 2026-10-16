import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { authEnabled } from './convexApi';

// The web config is public. Without it, app and auth stay undefined and callers show "not set up".
export const app = authEnabled ? initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
}) : undefined;

export const auth = app && getAuth(app);
