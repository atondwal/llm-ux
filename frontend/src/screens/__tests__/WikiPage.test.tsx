import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WikiPage from '../WikiPage';

// Mock navigation
const mockNavigation = {
  goBack: jest.fn(),
  setOptions: jest.fn(),
};

// Mock route
const mockRoute = {
  params: {
    concept: 'React Native'
  }
};

// Mock fetch for messages
global.fetch = jest.fn();

describe('WikiPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    } as Response);
  });

  it('should display the concept name as title', () => {
    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );
    
    expect(getByText('React Native')).toBeTruthy();
  });

  it('should show back button that calls navigation.goBack', () => {
    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );
    
    const backButton = getByText('← Back');
    fireEvent.press(backButton);
    
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('should display wiki content section', () => {
    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );
    
    expect(getByText('About React Native')).toBeTruthy();
    expect(getByText('This concept has not been documented yet.')).toBeTruthy();
  });

  it('should display related messages section', () => {
    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );
    
    expect(getByText('Messages mentioning this concept:')).toBeTruthy();
  });

  it('should show edit button for wiki content', () => {
    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );
    
    expect(getByText('Edit')).toBeTruthy();
  });

  it('should load and display related messages', async () => {
    // Mock conversations fetch
    (global.fetch as jest.MockedFunction<typeof fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'conv-1', title: 'Test' }] })
      } as Response)
      // Mock messages fetch for conv-1
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'msg-1', author_id: 'user-1', content: 'Learning [[React Native]] is fun!', created_at: '2024-01-01T00:00:00Z' },
            { id: 'msg-2', author_id: 'user-2', content: 'I use [[React Native]] for mobile apps.', created_at: '2024-01-02T00:00:00Z' }
          ]
        })
      } as Response);

    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );

    await waitFor(() => {
      expect(getByText('Learning [[React Native]] is fun!')).toBeTruthy();
      expect(getByText('I use [[React Native]] for mobile apps.')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('should show loading state while fetching messages', () => {
    // Make fetch hang to test loading state
    (global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const { getByText } = render(
      <WikiPage 
        navigation={mockNavigation as any} 
        route={mockRoute as any} 
      />
    );

    expect(getByText('Loading related messages...')).toBeTruthy();
  });
});