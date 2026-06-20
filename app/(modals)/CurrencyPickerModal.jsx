import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/theme";
import { useCurrency, CURRENCIES } from "../../contexts/currencyContext";

const CurrencyPickerModal = ({ visible, onClose }) => {
  const { selectedCurrency, changeCurrency } = useCurrency();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Currency</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.list}>
            {Object.keys(CURRENCIES).map((code) => {
              const currency = CURRENCIES[code];
              const isSelected = selectedCurrency === code;
              return (
                <TouchableOpacity
                  key={code}
                  style={[
                    styles.item,
                    isSelected && styles.itemActive,
                  ]}
                  onPress={() => {
                    changeCurrency(code);
                    onClose();
                  }}
                >
                  <View style={styles.itemLeft}>
                    <Text
                      style={[
                        styles.symbolText,
                        isSelected && styles.activeText,
                      ]}
                    >
                      {currency.symbol.trim()}
                    </Text>
                    <Text
                      style={[
                        styles.nameText,
                        isSelected && styles.activeText,
                      ]}
                    >
                      {currency.name} ({code})
                    </Text>
                  </View>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={Colors.primary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default CurrencyPickerModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: Colors.cardDark,
    borderRadius: 20,
    padding: 20,
    width: "80%",
    maxHeight: "65%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "white",
  },
  list: {
    marginVertical: 10,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  itemActive: {
    backgroundColor: Colors.primary + "20",
    borderColor: Colors.primary,
    borderWidth: 1,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  symbolText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.primary,
    width: 40,
    textAlign: "center",
  },
  nameText: {
    fontSize: 14,
    color: "white",
  },
  activeText: {
    color: Colors.primary,
    fontWeight: "600",
  },
});
