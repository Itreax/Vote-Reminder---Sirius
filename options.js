// Fonction pour sauvegarder les options dans le stockage de Chrome
function saveOptions() {
    const delay = document.getElementById('delay').value;
    const maxNotificationsEnabled = document.getElementById('max-notifications-enabled').checked;
    const maxNotificationsCount = document.getElementById('max-notifications-count').value;

    chrome.storage.sync.set({
        delay: delay,
        maxNotificationsEnabled: maxNotificationsEnabled,
        maxNotificationsCount: maxNotificationsCount
    }, () => {
        console.log('Options sauvegardées avec succès.');
        // Vous pouvez ajouter un message de confirmation visible à l'utilisateur ici si vous le souhaitez.
    });
}

// Fonction pour charger les options depuis le stockage de Chrome
function restoreOptions() {
    chrome.storage.sync.get({
        // Délais entre 2 vérifications et notifications
        delay: 30, // 30 secondes par défaut
		// Notif Max
        maxNotificationsEnabled: true, // True = activé | False = désactivé
        maxNotificationsCount: 5 // Nombre de Notifications max (5 par défaut)
    }, (items) => {
        document.getElementById('delay').value = items.delay;
        document.getElementById('max-notifications-enabled').checked = items.maxNotificationsEnabled;
        document.getElementById('max-notifications-count').value = items.maxNotificationsCount;
        
        // Appeler la fonction pour mettre à jour l'état du champ de nombre au chargement
        toggleMaxNotificationsInput();
    });
}

// Fonction pour griser/activer le champ du nombre de notifications
function toggleMaxNotificationsInput() {
    const isEnabled = document.getElementById('max-notifications-enabled').checked;
    document.getElementById('max-notifications-count').disabled = !isEnabled;
}

// Écouteurs d'événements pour l'initialisation et l'interaction de l'utilisateur
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save-button').addEventListener('click', saveOptions);
document.getElementById('max-notifications-enabled').addEventListener('change', toggleMaxNotificationsInput);