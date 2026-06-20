import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Show notifications immediately while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions from the OS.
 * Returns true if granted, false otherwise.
 * On Android no dialog is shown but we still call to set up the channel.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("budget-alerts", {
      name: "Budget Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Fire an immediate local notification for a budget warning or overflow.
 * Silently no-ops if permissions have not been granted.
 */
export async function scheduleBudgetNotification(
  title: string,
  body: string,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    // Request on first use
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }

  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      seconds: 1,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}
