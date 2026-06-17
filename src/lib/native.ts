/**
 * Initialisation des fonctionnalités natives (Android/iOS via Capacitor).
 *
 * Ce module est importé depuis le Layout. Sur le web classique
 * (`app.bovo.bj` dans un navigateur) toutes les fonctions sont des no-op :
 * `Capacitor.isNativePlatform()` renvoie `false` et on sort immédiatement.
 *
 * Dans l'app native il :
 *  - masque le splash screen une fois le contenu prêt,
 *  - stylise la status bar aux couleurs Bovo,
 *  - gère le bouton retour matériel Android,
 *  - ajuste le redimensionnement clavier,
 *  - enregistre l'appareil pour les notifications push (fondation Phase C).
 */
import { Capacitor } from '@capacitor/core';

// Bleu Bovo (cf. design system) — utilisé pour la status bar.
const BOVO_BLUE = '#4470B3';

let initialised = false;

export async function initNative(): Promise<void> {
  // Garde-fou : web classique → rien à faire.
  if (!Capacitor.isNativePlatform()) return;
  // Idempotent : on n'attache les listeners qu'une seule fois.
  if (initialised) return;
  initialised = true;

  // Résout le routage multi-pages (/menage/ -> /menage/index.html) que le
  // serveur local Capacitor ne fait pas. À enregistrer au plus tôt.
  registerNativeRouter();

  await Promise.allSettled([
    setupStatusBar(),
    setupSplashScreen(),
    setupBackButton(),
    setupKeyboard(),
  ]);

  // Push : on n'enregistre que si l'utilisateur a déjà accepté ou si on est
  // dans un flux qui le justifie. La demande de permission explicite et le
  // câblage Supabase arrivent en Phase C.
  void registerPushIfGranted();
}

function registerNativeRouter(): void {
  if (!('serviceWorker' in navigator)) return;
  // Le serveur Capacitor tourne sur un contexte sécurisé (https/capacitor
  // localhost), donc les service workers y sont disponibles.
  navigator.serviceWorker.register('/native-router-sw.js').catch(() => {
    /* en cas d'échec, l'app reste utilisable sur les pages sans sous-route */
  });
}

async function setupStatusBar(): Promise<void> {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light }); // texte clair sur fond bleu
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: BOVO_BLUE });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    /* plugin absent ou indisponible — on ignore */
  }
}

async function setupSplashScreen(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // Le contenu web est prêt à ce stade : on masque le splash en fondu.
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }
}

async function setupBackButton(): Promise<void> {
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      // Sur une page interne on revient en arrière ; à la racine on laisse
      // l'OS mettre l'app en arrière-plan (comportement Android attendu).
      if (canGoBack && window.location.pathname !== '/') {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch {
    /* ignore */
  }
}

async function setupKeyboard(): Promise<void> {
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    // Le clavier pousse uniquement la zone de saisie, pas tout le WebView :
    // évite que la top bar saute pendant la frappe dans les tunnels.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    /* ignore */
  }
}

/**
 * Notifications push (FCM unifié Android + iOS via @capacitor-firebase/messaging).
 * Les jetons sont des tokens FCM sur les deux plateformes → un seul chemin serveur
 * (Edge Function `send-push` qui envoie via FCM HTTP v1).
 */
let pushListenersAttached = false;

function currentPlatform(): 'android' | 'ios' | 'web' {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
}

async function attachPushListeners(): Promise<void> {
  if (pushListenersAttached) return;
  pushListenersAttached = true;
  const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
  const { saveDeviceToken } = await import('@lib/push');

  // Jeton (ré)émis : on le (ré)enregistre côté Supabase.
  await FirebaseMessaging.addListener('tokenReceived', (event: { token: string }) => {
    void saveDeviceToken(event.token, currentPlatform());
  });

  // Tap sur une notification → router vers la page concernée (data.url).
  await FirebaseMessaging.addListener('notificationActionPerformed', (event: any) => {
    const url = event?.notification?.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) {
      window.location.href = url;
    }
  });
}

/**
 * Si la permission push est DÉJÀ accordée, (ré)enregistre le device sans rien
 * demander. La demande explicite passe par `requestPushPermission()`.
 */
async function registerPushIfGranted(): Promise<void> {
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive !== 'granted') return; // on ne harcèle pas l'utilisateur ici
    await attachPushListeners();
    const { token } = await FirebaseMessaging.getToken();
    const { saveDeviceToken } = await import('@lib/push');
    await saveDeviceToken(token, currentPlatform());
  } catch {
    /* plugin/Firebase non configuré (dev web) — ignore */
  }
}

/**
 * Demande explicite de permission push (à appeler depuis un bouton/onboarding
 * contextualisé). Renvoie true si accordée. Enregistre le token au passage.
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const result = await FirebaseMessaging.requestPermissions();
    if (result.receive !== 'granted') return false;
    await attachPushListeners();
    const { token } = await FirebaseMessaging.getToken();
    const { saveDeviceToken } = await import('@lib/push');
    await saveDeviceToken(token, currentPlatform());
    return true;
  } catch {
    return false;
  }
}

/**
 * À appeler sur une page POST-LOGIN (ex. /compte/). Enchaîne :
 *  1. rattache un éventuel jeton capté AVANT la connexion (flushPendingDeviceToken) ;
 *  2. sur natif uniquement, et seulement si l'utilisateur n'a pas encore décidé,
 *     demande la permission push (jamais au tout 1er lancement de l'app).
 * No-op sur le web (`app.bovo.bj`). On respecte un refus (pas de re-demande).
 */
export async function ensurePushRegistered(): Promise<void> {
  try {
    const { flushPendingDeviceToken } = await import('@lib/push');
    await flushPendingDeviceToken();
  } catch {
    /* ignore */
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
    const perm = await FirebaseMessaging.checkPermissions();
    if (perm.receive === 'granted') {
      await registerPushIfGranted();
    } else if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      await requestPushPermission();
    }
    // 'denied' → on respecte le choix de l'utilisateur, pas de re-demande.
  } catch {
    /* plugin/Firebase non configuré (dev web) — ignore */
  }
}
