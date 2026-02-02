/**
 * Fitness App - Main Application
 * A Strava-like personal fitness tracking app
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import FitnessMapScreen from "./src/FitnessMapScreen";
import 'react-native-get-random-values';

export type RootStackParamList = {
  FitnessMap: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="FitnessMap">
        <Stack.Screen
          name="FitnessMap"
          component={FitnessMapScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
