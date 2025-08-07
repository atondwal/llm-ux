import React, { useState } from 'react';
import ChatView from './ChatView';
import WikiPage from './src/screens/WikiPage';

type CurrentScreen = 'Chat' | 'WikiPage';

interface NavigationState {
  currentScreen: CurrentScreen;
  wikiConcept?: string;
}

export default function App() {
  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentScreen: 'Chat'
  });

  const navigate = (screen: CurrentScreen, params?: { concept?: string }) => {
    setNavigationState({
      currentScreen: screen,
      wikiConcept: params?.concept
    });
  };

  const goBack = () => {
    setNavigationState({ currentScreen: 'Chat' });
  };

  // Simple navigation object to match React Navigation API
  const navigation = {
    navigate,
    goBack,
    push: (screen: string, params: any) => navigate(screen as CurrentScreen, params)
  };

  if (navigationState.currentScreen === 'WikiPage') {
    return (
      <WikiPage
        navigation={navigation}
        route={{ params: { concept: navigationState.wikiConcept } }}
      />
    );
  }

  return <ChatView navigation={navigation} />;
}
