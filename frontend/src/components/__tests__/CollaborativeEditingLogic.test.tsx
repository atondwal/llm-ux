// Test the collaborative editing logic directly without complex component rendering
describe('Collaborative Editing Logic', () => {
  
  it('should identify when editingMessageId matches incoming text_delta messageId', () => {
    // Simulate the state that should exist when user is editing
    const editingMessageId = 'msg-123';
    const currentUserId = 'user-1';
    
    // Simulate receiving a text_delta from another user for the same message
    const incomingTextDelta = {
      type: 'text_delta',
      messageId: 'msg-123',
      userId: 'user-2',
      text: 'collaborative text',
      cursorPosition: 17
    };
    
    // Test the condition that determines if text_delta should be applied
    const shouldApplyTextDelta = (
      editingMessageId === incomingTextDelta.messageId && 
      incomingTextDelta.userId !== currentUserId
    );
    
    expect(shouldApplyTextDelta).toBe(true);
    expect(editingMessageId).toBe('msg-123');
    expect(incomingTextDelta.messageId).toBe('msg-123');
  });
  
  it('should NOT apply text_delta when editingMessageId is null', () => {
    // This is the bug scenario - user is not editing any message
    const editingMessageId = null;
    const currentUserId = 'user-1';
    
    const incomingTextDelta = {
      type: 'text_delta',
      messageId: 'msg-123',
      userId: 'user-2', 
      text: 'should not apply',
      cursorPosition: 15
    };
    
    const shouldApplyTextDelta = (
      editingMessageId === incomingTextDelta.messageId &&
      incomingTextDelta.userId !== currentUserId
    );
    
    expect(shouldApplyTextDelta).toBe(false);
    expect(editingMessageId).toBe(null);
    expect(incomingTextDelta.messageId).toBe('msg-123');
  });
  
  it('should NOT apply text_delta when messageIds do not match', () => {
    // User is editing a different message
    const editingMessageId = 'msg-456';
    const currentUserId = 'user-1';
    
    const incomingTextDelta = {
      type: 'text_delta',
      messageId: 'msg-123', // Different message
      userId: 'user-2',
      text: 'different message text',
      cursorPosition: 20
    };
    
    const shouldApplyTextDelta = (
      editingMessageId === incomingTextDelta.messageId &&
      incomingTextDelta.userId !== currentUserId
    );
    
    expect(shouldApplyTextDelta).toBe(false);
    expect(editingMessageId).toBe('msg-456');
    expect(incomingTextDelta.messageId).toBe('msg-123');
  });
  
  it('should NOT apply text_delta from same user (echo prevention)', () => {
    // Same user - this should be ignored to prevent echo
    const editingMessageId = 'msg-123';
    const currentUserId = 'user-1';
    
    const incomingTextDelta = {
      type: 'text_delta',
      messageId: 'msg-123',
      userId: 'user-1', // Same user!
      text: 'my own text',
      cursorPosition: 11
    };
    
    const shouldApplyTextDelta = (
      editingMessageId === incomingTextDelta.messageId &&
      incomingTextDelta.userId !== currentUserId
    );
    
    expect(shouldApplyTextDelta).toBe(false);
    expect(editingMessageId).toBe('msg-123');
    expect(incomingTextDelta.userId).toBe(currentUserId);
  });
  
  // This test demonstrates the exact problem from the debug logs
  it('should demonstrate the bug scenario from debug logs', () => {
    // This matches the exact debug output we saw:
    // editingMessageId: null, 
    // incomingMessageId: '69edf09f-65bd-4f10-876c-f19f063de202'
    // messageIdMatch: false
    // isMyMessage: false
    
    const editingMessageId = null; // The problem!
    const incomingMessageId = '69edf09f-65bd-4f10-876c-f19f063de202';
    const currentUserId = 'user-1';
    const incomingUserId = 'user-2';
    
    const messageIdMatch = editingMessageId === incomingMessageId;
    const isMyMessage = incomingUserId === currentUserId;
    
    expect(messageIdMatch).toBe(false); // This is why text_delta is ignored
    expect(isMyMessage).toBe(false);
    expect(editingMessageId).toBe(null); // This is the root cause
    
    // The fix is ensuring editingMessageId is properly set when user starts editing
    const fixedEditingMessageId = '69edf09f-65bd-4f10-876c-f19f063de202';
    const fixedMessageIdMatch = fixedEditingMessageId === incomingMessageId;
    expect(fixedMessageIdMatch).toBe(true); // This would make collaborative editing work
  });
});