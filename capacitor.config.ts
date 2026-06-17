import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'bj.bovo.app',
  appName: 'Bovo',
  // Astro builds the static site here; Capacitor bundles it into the native app.
  webDir: 'dist',
  // Bundling the web assets locally (not pointing server.url at app.bovo.bj)
  // keeps the app usable on flaky connections and avoids App Store rejection
  // for "thin web wrapper" apps. Supabase/Kkiapay still call the network as usual.
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
