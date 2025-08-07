"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Test-first development for the ChatInterface component.
 * Writing tests BEFORE implementation following extreme TDD.
 */
var react_1 = require("react");
var react_native_1 = require("@testing-library/react-native");
var ChatInterface_1 = require("../ChatInterface");
describe('ChatInterface', function () {
    var mockConversation = {
        id: 'conv-123',
        type: 'chat',
        title: 'Test Conversation',
        participants: [
            { id: 'user-1', type: 'human', name: 'Alice' },
            { id: 'user-2', type: 'human', name: 'Bob' },
        ],
        messages: [],
        createdAt: new Date().toISOString(),
    };
    describe('Message Display', function () {
        it('should render an empty conversation', function () {
            var _a = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1" })), getByText = _a.getByText, queryByTestId = _a.queryByTestId;
            expect(getByText('Test Conversation')).toBeTruthy();
            expect(queryByTestId('message-list')).toBeTruthy();
            expect(queryByTestId('message-item')).toBeNull();
        });
        it('should display messages in the conversation', function () {
            var conversationWithMessages = __assign(__assign({}, mockConversation), { messages: [
                    {
                        id: 'msg-1',
                        conversationId: 'conv-123',
                        authorId: 'user-1',
                        content: 'Hello, Bob!',
                        createdAt: new Date().toISOString(),
                    },
                    {
                        id: 'msg-2',
                        conversationId: 'conv-123',
                        authorId: 'user-2',
                        content: 'Hi Alice!',
                        createdAt: new Date().toISOString(),
                    },
                ] });
            var getByText = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: conversationWithMessages, currentUserId: "user-1" })).getByText;
            expect(getByText('Hello, Bob!')).toBeTruthy();
            expect(getByText('Hi Alice!')).toBeTruthy();
        });
    });
    describe('Message Input', function () {
        it('should have a message input field', function () {
            var getByPlaceholderText = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1" })).getByPlaceholderText;
            var input = getByPlaceholderText('Type a message...');
            expect(input).toBeTruthy();
        });
        it('should allow typing in the message input', function () {
            var getByPlaceholderText = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1" })).getByPlaceholderText;
            var input = getByPlaceholderText('Type a message...');
            react_native_1.fireEvent.changeText(input, 'New message');
            expect(input.props.value).toBe('New message');
        });
        it('should send a message when send button is pressed', function () { return __awaiter(void 0, void 0, void 0, function () {
            var onSendMessage, _a, getByPlaceholderText, getByTestId, input, sendButton;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        onSendMessage = jest.fn();
                        _a = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1", onSendMessage: onSendMessage })), getByPlaceholderText = _a.getByPlaceholderText, getByTestId = _a.getByTestId;
                        input = getByPlaceholderText('Type a message...');
                        react_native_1.fireEvent.changeText(input, 'Test message');
                        sendButton = getByTestId('send-button');
                        react_native_1.fireEvent.press(sendButton);
                        return [4 /*yield*/, (0, react_native_1.waitFor)(function () {
                                expect(onSendMessage).toHaveBeenCalledWith({
                                    content: 'Test message',
                                    authorId: 'user-1',
                                });
                            })];
                    case 1:
                        _b.sent();
                        // Input should be cleared after sending
                        expect(input.props.value).toBe('');
                        return [2 /*return*/];
                }
            });
        }); });
        it('should not send empty messages', function () {
            var onSendMessage = jest.fn();
            var getByTestId = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1", onSendMessage: onSendMessage })).getByTestId;
            var sendButton = getByTestId('send-button');
            react_native_1.fireEvent.press(sendButton);
            expect(onSendMessage).not.toHaveBeenCalled();
        });
    });
    describe('Wiki Tags', function () {
        it('should highlight wiki tags in messages', function () {
            var messageWithTag = __assign(__assign({}, mockConversation), { messages: [
                    {
                        id: 'msg-1',
                        conversationId: 'conv-123',
                        authorId: 'user-1',
                        content: 'Let\'s discuss [[machine-learning]] today',
                        createdAt: new Date().toISOString(),
                    },
                ] });
            var getByTestId = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: messageWithTag, currentUserId: "user-1" })).getByTestId;
            var tagElement = getByTestId('wiki-tag-machine-learning');
            expect(tagElement).toBeTruthy();
            expect(tagElement.props.children).toContain('machine-learning');
        });
        it('should handle clicking on wiki tags', function () {
            var onTagClick = jest.fn();
            var messageWithTag = __assign(__assign({}, mockConversation), { messages: [
                    {
                        id: 'msg-1',
                        conversationId: 'conv-123',
                        authorId: 'user-1',
                        content: 'Check out [[react-native]]',
                        createdAt: new Date().toISOString(),
                    },
                ] });
            var getByTestId = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: messageWithTag, currentUserId: "user-1", onTagClick: onTagClick })).getByTestId;
            var tag = getByTestId('wiki-tag-react-native');
            react_native_1.fireEvent.press(tag);
            expect(onTagClick).toHaveBeenCalledWith('react-native');
        });
    });
    describe('Collaborative Editing', function () {
        it('should allow editing own messages', function () {
            var conversationWithMessage = __assign(__assign({}, mockConversation), { messages: [
                    {
                        id: 'msg-1',
                        conversationId: 'conv-123',
                        authorId: 'user-1',
                        content: 'Original message',
                        createdAt: new Date().toISOString(),
                    },
                ] });
            var _a = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: conversationWithMessage, currentUserId: "user-1" })), getByTestId = _a.getByTestId, getByDisplayValue = _a.getByDisplayValue;
            var message = getByTestId('message-msg-1');
            (0, react_native_1.fireEvent)(message, 'onLongPress');
            // Should enter edit mode
            var editInput = getByDisplayValue('Original message');
            expect(editInput).toBeTruthy();
            react_native_1.fireEvent.changeText(editInput, 'Edited message');
            (0, react_native_1.fireEvent)(editInput, 'onSubmitEditing');
            expect(getByTestId('message-msg-1').props.children).toContain('Edited message');
        });
        it('should show live cursors when others are editing', function () {
            var getByTestId = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1", editingSessions: [
                    { messageId: 'msg-1', userId: 'user-2', userName: 'Bob' }
                ] })).getByTestId;
            var cursor = getByTestId('editing-cursor-user-2');
            expect(cursor).toBeTruthy();
            expect(cursor.props.children).toContain('Bob');
        });
    });
    describe('AI Integration', function () {
        it('should show AI toggle for proactive mode', function () {
            var getByTestId = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1" })).getByTestId;
            var aiToggle = getByTestId('ai-proactive-toggle');
            expect(aiToggle).toBeTruthy();
            expect(aiToggle.props.value).toBe(false); // Default off for human chats
        });
        it('should allow tagging AI for help', function () {
            var onSendMessage = jest.fn();
            var _a = (0, react_native_1.render)(react_1.default.createElement(ChatInterface_1.default, { conversation: mockConversation, currentUserId: "user-1", onSendMessage: onSendMessage })), getByPlaceholderText = _a.getByPlaceholderText, getByTestId = _a.getByTestId;
            var input = getByPlaceholderText('Type a message...');
            react_native_1.fireEvent.changeText(input, '@ai help me understand React hooks');
            var sendButton = getByTestId('send-button');
            react_native_1.fireEvent.press(sendButton);
            expect(onSendMessage).toHaveBeenCalledWith({
                content: '@ai help me understand React hooks',
                authorId: 'user-1',
                mentionsAI: true,
            });
        });
    });
});
