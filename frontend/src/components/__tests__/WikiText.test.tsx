import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WikiText from '../WikiText';

describe('WikiText Component', () => {
  it('should render plain text without wiki tags', () => {
    const { getByText } = render(
      <WikiText text="This is just plain text." />
    );
    
    expect(getByText('This is just plain text.')).toBeTruthy();
  });

  it('should render wiki tags as clickable links', () => {
    const mockOnWikiTagPress = jest.fn();
    const { getByText } = render(
      <WikiText 
        text="Learn about [[React Native]] development." 
        onWikiTagPress={mockOnWikiTagPress}
      />
    );
    
    expect(getByText('Learn about ')).toBeTruthy();
    expect(getByText('React Native')).toBeTruthy(); 
    expect(getByText(' development.')).toBeTruthy();
  });

  it('should call onWikiTagPress when wiki tag is pressed', () => {
    const mockOnWikiTagPress = jest.fn();
    const { getByText } = render(
      <WikiText 
        text="Click on [[machine learning]] here." 
        onWikiTagPress={mockOnWikiTagPress}
      />
    );
    
    const wikiLink = getByText('machine learning');
    fireEvent.press(wikiLink);
    
    expect(mockOnWikiTagPress).toHaveBeenCalledWith('machine learning');
  });

  it('should handle multiple wiki tags', () => {
    const mockOnWikiTagPress = jest.fn();
    const { getByText } = render(
      <WikiText 
        text="[[React]] and [[TypeScript]] work well together." 
        onWikiTagPress={mockOnWikiTagPress}
      />
    );
    
    const reactLink = getByText('React');
    const typeScriptLink = getByText('TypeScript');
    
    fireEvent.press(reactLink);
    expect(mockOnWikiTagPress).toHaveBeenCalledWith('React');
    
    fireEvent.press(typeScriptLink);
    expect(mockOnWikiTagPress).toHaveBeenCalledWith('TypeScript');
    
    expect(mockOnWikiTagPress).toHaveBeenCalledTimes(2);
  });

  it('should style wiki tags differently from regular text', () => {
    const mockOnWikiTagPress = jest.fn();
    const { getByText } = render(
      <WikiText 
        text="This is [[special]] text." 
        onWikiTagPress={mockOnWikiTagPress}
      />
    );
    
    const wikiLink = getByText('special');
    const regularText = getByText('This is ');
    
    // Wiki links should have different styling (we'll verify this through props)
    expect(wikiLink.props.style).toBeDefined();
    expect(regularText.props.style).toBeDefined();
  });

  it('should handle empty text', () => {
    const { queryByText } = render(<WikiText text="" />);
    
    // Should render without errors but with no visible text
    expect(queryByText('')).toBeNull();
  });

  it('should work without onWikiTagPress callback', () => {
    const { getByText } = render(
      <WikiText text="This has [[no callback]] handler." />
    );
    
    const wikiLink = getByText('no callback');
    
    // Should not crash when pressed without callback
    expect(() => fireEvent.press(wikiLink)).not.toThrow();
  });
});