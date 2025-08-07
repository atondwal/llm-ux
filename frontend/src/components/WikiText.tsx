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
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap' }, containerStyle]}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <Text key={index} style={textStyle}>
              {segment.content}
            </Text>
          );
        } else {
          // Wiki tag
          return (
            <TouchableOpacity
              key={index}
              onPress={() => onWikiTagPress?.(segment.content)}
            >
              <Text style={[
                {
                  color: '#007AFF',
                  textDecorationLine: 'underline',
                  fontWeight: '500'
                },
                wikiTagStyle
              ]}>
                {segment.content}
              </Text>
            </TouchableOpacity>
          );
        }
      })}
    </View>
  );
};

export default WikiText;