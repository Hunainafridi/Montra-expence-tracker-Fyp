import React from 'react'
import { Slot } from "expo-router"
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import SafeScreen from "../components/SafeScreen"
import { AuthProvider } from '../contexts/authContext'
import { CurrencyProvider } from '../contexts/currencyContext'

const _layout = () => {
  return (
    <SafeAreaProvider>
      <SafeScreen>
        <AuthProvider>
          <CurrencyProvider>
            <Slot />
          </CurrencyProvider>
        </AuthProvider>
      </SafeScreen>
      <StatusBar style="light" />
    </SafeAreaProvider>
  )
}

export default _layout