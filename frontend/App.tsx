import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AppLive from './AppLive';
import WikiPage from './src/screens/WikiPage';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Chat" screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="Chat" 
          component={AppLive} 
        />
        <Stack.Screen 
          name="WikiPage" 
          component={WikiPage}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
