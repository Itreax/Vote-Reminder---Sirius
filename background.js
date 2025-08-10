console.log("[VoteNotifier] Service Worker lancé !");

// URLs à surveiller
const voteUrls = [
  'https://sirius-game.fr/vote',
  'https://www.sirius-game.fr/vote'
];

// Durée du cooldown en ms (1h30)
const VOTE_COOLDOWN_MS = 90 * 60 * 1000; // 5400000 ms

// Nom de l'alarme pour la vérification périodique
const ALARM_NAME = "voteCheckAlarm";

// --- NOUVELLE FONCTION ---
// Fonction utilitaire pour créer ou mettre à jour l'alarme en fonction des options
async function scheduleAlarm() {
  const options = await chrome.storage.sync.get('delay');
  // Utilise la valeur de "delay" des options (par défaut 30 secondes si non définie)
  const delayInSeconds = options.delay || 30;
  const delayInMinutes = delayInSeconds / 60;
  
  chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: delayInMinutes });
  console.log(`[VoteNotifier] Alarme '${ALARM_NAME}' créée/mise à jour pour une vérification toutes les ${delayInSeconds} secondes.`);
}

// Fonction utilitaire pour formater les secondes en HH:MM:SS
function formatSecondsToHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => num.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// --- MODIFICATIONS DANS L'ÉCOUTEUR onInstalled ---
// Lors de l'installation de l'extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("[VoteNotifier] Extension installée et prête !");

  reloadVotePageIfOpen();
  setTimeout(checkIfVoted, 1000);

  // Appelle la nouvelle fonction pour créer l'alarme avec les paramètres par défaut
  scheduleAlarm(); 
  
  // Initialise le compteur de notifications
  chrome.storage.local.set({ notificationCount: 0 });
});

// Écouteur pour les alarmes déclenchées
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[VoteNotifier] Alarme déclenchée, vérification du vote...");
    checkIfVoted();
  }
});

// --- NOUVEL ÉCOUTEUR ---
// Écouteur pour les changements dans les options (afin de mettre à jour l'alarme)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.delay) {
    console.log("[VoteNotifier] Le délai a changé dans les options, mise à jour de l'alarme...");
    scheduleAlarm();
  }
});

// Fonction pour envoyer une notification
async function sendVoteNotification() {
  console.log("[VoteNotifier] Tente d'envoyer la notification...");
  const options = await chrome.storage.sync.get({
    maxNotificationsEnabled: false,
    maxNotificationsCount: 5
  });

  const data = await chrome.storage.local.get('notificationCount');
  let count = data.notificationCount || 0;

  if (options.maxNotificationsEnabled && count >= options.maxNotificationsCount) {
    console.log(`[VoteNotifier] Limite de ${options.maxNotificationsCount} notifications atteinte. Pas d'envoi.`);
    return;
  }
  
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Vote disponible !",
    message: "Vous pouvez voter à nouveau sur Sirius.",
    priority: 2,
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.log("[VoteNotifier] Erreur lors de la création de la notification :", chrome.runtime.lastError);
    } else {
      console.log(`[VoteNotifier] Notification créée avec l'ID : ${notificationId}`);
      count++;
      chrome.storage.local.set({ notificationCount: count });
      console.log(`[VoteNotifier] Compteur de notifications (total) : ${count}`);
    }
  });
}

// Réinitialiser le compteur de notifications lorsque l'utilisateur clique sur la notification
chrome.notifications.onClicked.addListener(async (notificationId) => {
  console.log("[VoteNotifier] Notification cliquée, réinitialisation du compteur.");
  await chrome.storage.local.set({ notificationCount: 0 });
  chrome.tabs.create({ url: voteUrls[0] });
});

// Stocker la date du début du cooldown et réinitialiser le compteur
async function storeVoteCooldownStartTime(secondsRemaining) {
  const now = Date.now();
  const estimatedStartTime = now - (VOTE_COOLDOWN_MS - (secondsRemaining * 1000));
  await chrome.storage.local.set({ voteTime: estimatedStartTime });
  console.log("[VoteNotifier] Date de début de cooldown enregistrée (estimée) :", new Date(estimatedStartTime).toLocaleString());
  await chrome.storage.local.set({ notificationCount: 0 });
  console.log("[VoteNotifier] Compteur de notifications réinitialisé (nouveau cooldown détecté).");
}

// Fonction principale pour vérifier le vote
function checkIfVoted() {
  chrome.tabs.query({ url: voteUrls.map(url => url + '*') }, async (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      console.log("[VoteNotifier] Onglet vote trouvé (id:", tabId, ") - demande timer au content script.");
      chrome.tabs.sendMessage(tabId, { action: "getVoteTimer" }, async (response) => {
        if (chrome.runtime.lastError) {
          console.log("[VoteNotifier] Erreur de communication avec content script :", chrome.runtime.lastError.message);
          return;
        }
        if (response && typeof response.timeString === 'string') {
          const timeString = response.timeString.trim();
          console.log("[VoteNotifier] Timer reçu :", timeString === '' ? '[vide]' : timeString);
          if (!timeString || timeString === '00:00:10') {
            console.log("[VoteNotifier] Timer vide ou 00:00:10, envoi notif.");
            sendVoteNotification();
            await chrome.storage.local.remove('voteTime');
            await chrome.storage.local.set({ notificationCount: 0 });
            console.log("[VoteNotifier] Compteur de notifications réinitialisé (vote disponible).");
          } else {
            const parts = timeString.split(":");
            if (parts.length !== 3) {
              console.log("[VoteNotifier] Format timer invalide.");
              return;
            }
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            const seconds = parseInt(parts[2]);
            const secondsRemaining = hours * 3600 + minutes * 60 + seconds;
            if (secondsRemaining <= 1) {
              console.log("[VoteNotifier] Cooldown fini, envoi notif.");
              sendVoteNotification();
              await chrome.storage.local.remove('voteTime');
              await chrome.storage.local.set({ notificationCount: 0 });
              console.log("[VoteNotifier] Compteur de notifications réinitialisé (cooldown fini).");
            } else {
              await storeVoteCooldownStartTime(secondsRemaining);
              console.log(`[VoteNotifier] Cooldown actif: ${secondsRemaining}s restants.`);
            }
          }
        } else {
          console.log("[VoteNotifier] Réponse du content script invalide ou timeString manquant/non-string.");
          const data = await chrome.storage.local.get('voteTime');
          if (!data.voteTime) {
              sendVoteNotification();
              await chrome.storage.local.set({ notificationCount: 0 });
              console.log("[VoteNotifier] Compteur de notifications réinitialisé (pas de timer trouvé, potentiellement dispo).");
          }
        }
      });
    } else {
      const data = await chrome.storage.local.get('voteTime');
      const voteTime = data.voteTime || 0;
      const now = Date.now();
      if (voteTime && (now - voteTime) >= VOTE_COOLDOWN_MS) {
        console.log("[VoteNotifier] Page fermée, cooldown terminé, envoi notification.");
        sendVoteNotification();
      } else if (voteTime) {
        const remaining = Math.floor((VOTE_COOLDOWN_MS - (now - voteTime)) / 1000);
        const formattedRemaining = formatSecondsToHMS(remaining);
        console.log(`[VoteNotifier] Page fermée, cooldown en cours, temps restant: ${remaining}s (${formattedRemaining})`);
      } else {
        console.log("[VoteNotifier] Page fermée, pas de vote enregistré. Envoi de notification.");
        sendVoteNotification();
      }
    }
  });
}

// Fonction pour recharger la page de vote si elle est ouverte
function reloadVotePageIfOpen() {
  chrome.tabs.query({ url: voteUrls.map(url => url + '*') }, (tabs) => {
    if (tabs.length > 0) {
      console.log("[VoteNotifier] Onglet de vote trouvé, rechargement...");
      chrome.tabs.reload(tabs[0].id);
    } else {
      console.log("[VoteNotifier] Pas d'onglet de vote ouvert.");
    }
  });
}