import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/theme";

const colors = {
  neutral800: Colors.cardDark,
  neutral700: "rgba(255,255,255,0.1)",
  neutral500: Colors.textSecondary,
  green: Colors.primary,
  text: "white",
  textLight: "rgba(255,255,255,0.6)",
};
import CustomButton from "../../components/CustomButton";
import { useCurrency, CURRENCIES } from "../../contexts/currencyContext";
import CurrencyPickerModal from "./CurrencyPickerModal";

const SettingsModal = ({ visible, onClose }) => {
  const { selectedCurrency, changeCurrency } = useCurrency();
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const handleResetAccount = async () => {
    try {
      const { auth, firestore } = await import("../../config/firebase");
      const { collection, query, where, getDocs, writeBatch } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (!user) return;
      
      const batch = writeBatch(firestore);
      
      // Delete transactions
      const txSnap = await getDocs(query(collection(firestore, "transactions"), where("uid", "==", user.uid)));
      txSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete wallets
      const walletSnap = await getDocs(query(collection(firestore, "wallets"), where("uid", "==", user.uid)));
      walletSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete goals
      const goalsSnap = await getDocs(query(collection(firestore, "savings_goals"), where("uid", "==", user.uid)));
      goalsSnap.forEach(doc => batch.delete(doc.ref));
      
      // Delete budgets
      const budgetsSnap = await getDocs(query(collection(firestore, "budget_limits"), where("uid", "==", user.uid)));
      budgetsSnap.forEach(doc => batch.delete(doc.ref));

      await batch.commit();
      Alert.alert("Success", "Account has been reset successfully.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not reset account.");
    }
  };

  const settingsOptions = [
    {
      title: "App Currency",
      subtitle: `Format values (Current: ${selectedCurrency})`,
      icon: "cash-outline",
      type: "select",
      value: selectedCurrency,
      onPress: () => setShowCurrencyPicker(true),
    },
    {
      title: "Push Notifications",
      subtitle: "Receive notifications for expenses",
      icon: "notifications",
      value: notifications,
      onValueChange: setNotifications,
    },
    {
      title: "Dark Mode",
      subtitle: "Use dark theme",
      icon: "moon",
      value: darkMode,
      onValueChange: setDarkMode,
    },
    {
      title: "Biometric Login",
      subtitle: "Use fingerprint or face ID",
      icon: "finger-print",
      value: biometric,
      onValueChange: setBiometric,
    },
    {
      title: "Auto Sync",
      subtitle: "Automatically sync data",
      icon: "sync",
      value: autoSync,
      onValueChange: setAutoSync,
    },
    {
      title: "Reset Account",
      subtitle: "Delete all your data completely",
      icon: "warning-outline",
      type: "button",
      color: Colors.danger,
      onPress: () => {
        Alert.alert("Reset Account", "Are you sure you want to delete all your transactions, wallets, and goals? This cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Reset Everything", style: "destructive", onPress: handleResetAccount }
        ]);
      }
    }
  ];

  const renderSettingItem = (item) => {
    if (item.type === "select") {
      return (
        <TouchableOpacity
          key={item.title}
          style={styles.settingItem}
          onPress={item.onPress}
        >
          <View style={styles.settingLeft}>
            <View style={styles.iconWrapper}>
              <Ionicons name={item.icon} size={20} color={colors.green} />
            </View>
            <View style={styles.settingText}>
              <Text style={styles.settingTitle}>{item.title}</Text>
              <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
            </View>
          </View>
          <View style={styles.settingRight}>
            <Text style={styles.settingValueText}>{item.value}</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textLight}
              style={{ marginLeft: 4 }}
            />
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === "button") {
      return (
        <TouchableOpacity
          key={item.title}
          style={styles.settingItem}
          onPress={item.onPress}
        >
          <View style={styles.settingLeft}>
            <View style={[styles.iconWrapper, { backgroundColor: item.color ? item.color + "20" : colors.neutral700 }]}>
              <Ionicons name={item.icon} size={20} color={item.color || colors.green} />
            </View>
            <View style={styles.settingText}>
              <Text style={[styles.settingTitle, item.color && { color: item.color }]}>{item.title}</Text>
              <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View key={item.title} style={styles.settingItem}>
        <View style={styles.settingLeft}>
          <View style={styles.iconWrapper}>
            <Ionicons name={item.icon} size={20} color={colors.green} />
          </View>
          <View style={styles.settingText}>
            <Text style={styles.settingTitle}>{item.title}</Text>
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          </View>
        </View>
        <Switch
          value={item.value}
          onValueChange={item.onValueChange}
          trackColor={{ false: colors.neutral700, true: colors.green }}
          thumbColor={item.value ? "#fff" : colors.neutral500}
        />
      </View>
    );
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Settings</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Settings List */}
            <ScrollView style={styles.settingsList}>
              {settingsOptions.map(renderSettingItem)}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <CustomButton
                title="Save Settings"
                onPress={() => {
                  // Save settings logic here
                  onClose();
                }}
                style={styles.saveButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      <CurrencyPickerModal 
        visible={showCurrencyPicker} 
        onClose={() => setShowCurrencyPicker(false)} 
      />
    </>
  );
};

export default SettingsModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: colors.neutral800,
    borderRadius: 20,
    padding: 20,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  closeButton: {
    padding: 5,
  },
  settingsList: {
    flex: 1,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral700,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral700,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 12,
    color: colors.textLight,
  },
  settingRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingValueText: {
    fontSize: 14,
    color: colors.green,
    fontWeight: "600",
  },
  footer: {
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: colors.green,
  },
  subOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  subModal: {
    backgroundColor: colors.neutral800,
    borderRadius: 20,
    padding: 20,
    width: "80%",
    maxHeight: "65%",
    borderWidth: 1,
    borderColor: colors.neutral700,
  },
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral700,
    paddingBottom: 10,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  currencyList: {
    marginVertical: 10,
  },
  currencyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.neutral700 + "40",
  },
  currencyItemActive: {
    backgroundColor: colors.green + "20",
    borderColor: colors.green,
    borderWidth: 1,
  },
  currencyItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  currencySymbolText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.green,
    width: 40,
    textAlign: "center",
  },
  currencyNameText: {
    fontSize: 14,
    color: colors.text,
  },
  activeText: {
    color: colors.green,
    fontWeight: "600",
  },
});
