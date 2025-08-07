/**
 * LessWrong-inspired design system
 * Clean, readable, and thoughtful typography with excellent information hierarchy
 */

import { Platform } from 'react-native';

// Color palette inspired by LessWrong and ChatGPT
export const colors = {
  // Base colors
  background: '#FFFFFF',
  surface: '#FAFAFA',
  surfaceHover: '#F5F5F5',
  
  // Text colors (LessWrong uses very specific grays)
  text: {
    primary: '#1C1C1C',      // Main body text (almost black)
    secondary: '#5F5F5F',    // Secondary text
    tertiary: '#8B8B8B',     // Metadata, timestamps
    link: '#5F9B65',         // LessWrong green for links
    linkHover: '#4A7A4F',
  },
  
  // Accent colors
  accent: {
    primary: '#5F9B65',      // LessWrong green
    secondary: '#2B6CB0',    // Blue for secondary actions
    warning: '#D4A72C',      // Yellow/gold for warnings
    error: '#D83C3E',        // Red for errors
    success: '#5F9B65',      // Green for success
  },
  
  // UI elements
  border: {
    light: '#E0E0E0',
    medium: '#D0D0D0',
    heavy: '#B0B0B0',
  },
  
  // Special elements
  code: {
    background: '#F6F8FA',
    text: '#24292E',
    border: '#E1E4E8',
  },
  
  // Chat/conversation specific (ChatGPT-inspired)
  chat: {
    userBg: '#F7F7F8',
    assistantBg: '#FFFFFF',
    userBorder: '#E5E5E7',
    assistantBorder: '#E5E5E7',
  },
  
  // Collaborative editing
  collaboration: {
    presence: '#E8F5E9',
    cursor: '#4CAF50',
    selection: 'rgba(95, 155, 101, 0.2)',
  },
};

// Typography system
export const typography = {
  // Font families - using system fonts that approximate LessWrong's choices
  fontFamily: {
    serif: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'Georgia, serif',
    }),
    sansSerif: Platform.select({
      ios: 'System',
      android: 'sans-serif',
      default: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
    mono: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'Menlo, Monaco, "Courier New", monospace',
    }),
  },
  
  // Font sizes (using LessWrong's scale)
  fontSize: {
    tiny: 12,
    small: 14,
    body: 16,       // Main body text
    large: 18,
    h3: 20,
    h2: 24,
    h1: 32,
    title: 40,
  },
  
  // Line heights for optimal readability
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,    // For body text
    loose: 2.0,
  },
  
  // Font weights
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  
  // Letter spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
  },
};

// Spacing system (8px base unit like LessWrong)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

// Layout constants
export const layout = {
  maxWidth: {
    content: 680,     // Main content width (like LessWrong posts)
    wide: 960,        // Wide layouts
    full: 1200,       // Full width max
  },
  
  padding: {
    page: spacing.lg,
    section: spacing.xl,
    card: spacing.md,
  },
  
  borderRadius: {
    small: 4,
    medium: 8,
    large: 12,
    round: 9999,
  },
};

// Shadows (subtle, like LessWrong)
export const shadows = {
  none: {},
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  // ChatGPT-style shadow for cards
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
};

// Animation durations
export const animations = {
  fast: 150,
  normal: 250,
  slow: 350,
};

// Responsive breakpoints
export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

export default {
  colors,
  typography,
  spacing,
  layout,
  shadows,
  animations,
  breakpoints,
};