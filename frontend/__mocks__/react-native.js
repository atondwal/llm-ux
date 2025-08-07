// Mock React Native components for testing
const React = require('react');

const View = ({ children, testID, ...props }) => 
  React.createElement('View', { testID, ...props }, children);

const Text = ({ children, ...props }) => 
  React.createElement('Text', props, children);

const TextInput = ({ value, onChangeText, placeholder, testID, ...props }) => 
  React.createElement('TextInput', { 
    value, 
    placeholder, 
    testID,
    props: { value },
    ...props 
  }, null);

const TouchableOpacity = ({ children, onPress, onLongPress, testID, ...props }) => 
  React.createElement('TouchableOpacity', { 
    testID, 
    onPress,
    onLongPress,
    ...props 
  }, children);

const FlatList = ({ data, renderItem, keyExtractor, testID, ...props }) => {
  if (!data || data.length === 0) {
    return React.createElement('FlatList', { testID, ...props }, null);
  }
  return React.createElement('FlatList', { testID, ...props }, 
    data.map((item, index) => {
      const key = keyExtractor ? keyExtractor(item, index) : index.toString();
      return React.createElement(React.Fragment, { key }, renderItem({ item, index }));
    })
  );
};

const Switch = ({ value, onValueChange, testID, ...props }) =>
  React.createElement('Switch', { 
    testID, 
    value,
    props: { value },
    ...props 
  }, null);

const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
};

module.exports = {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Switch,
  StyleSheet,
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios || obj.default,
  },
};