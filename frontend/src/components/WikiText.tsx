import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { parseWikiTags } from '../utils/wikiTagParser';

interface WikiTextProps {
  text: string;
  onWikiTagPress?: (concept: string) => void;
  textStyle?: any;
  wikiTagStyle?: any;
  containerStyle?: any;
}

const WikiText: React.FC<WikiTextProps> = ({ 
  text, 
  onWikiTagPress, 
  textStyle = {},
  wikiTagStyle = {},
  containerStyle = {}
}) => {
  const segments = parseWikiTags(text);

  if (segments.length === 0) {
    return null;
  }

  return (
    <Text style={[textStyle, containerStyle]}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return segment.content;
        } else {
          // Wiki tag - render as inline text with press handling
          return (
            <Text 
              key={index}
              style={[
                {
                  color: '#007AFF',
                  textDecorationLine: 'underline',
                  fontWeight: '500'
                },
                wikiTagStyle
              ]}
              onPress={() => onWikiTagPress?.(segment.content)}
            >
              {segment.content}
            </Text>
          );
        }
      })}
    </Text>
  );
};

export default WikiText;