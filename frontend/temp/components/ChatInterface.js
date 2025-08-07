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
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * ChatInterface component - minimal implementation to pass tests.
 * Following extreme TDD - only implementing what tests require.
 */
var react_1 = require("react");
var react_native_1 = require("react-native");
var ChatInterface = function (_a) {
    var conversation = _a.conversation, currentUserId = _a.currentUserId, onSendMessage = _a.onSendMessage, onTagClick = _a.onTagClick, _b = _a.editingSessions, editingSessions = _b === void 0 ? [] : _b;
    var _c = (0, react_1.useState)(''), inputText = _c[0], setInputText = _c[1];
    var _d = (0, react_1.useState)(null), editingMessageId = _d[0], setEditingMessageId = _d[1];
    var _e = (0, react_1.useState)(''), editText = _e[0], setEditText = _e[1];
    var _f = (0, react_1.useState)(conversation.type === 'chat' ? false : true), aiProactive = _f[0], setAiProactive = _f[1];
    var handleSend = (0, react_1.useCallback)(function () {
        if (!inputText.trim())
            return;
        var mentionsAI = inputText.includes('@ai');
        onSendMessage === null || onSendMessage === void 0 ? void 0 : onSendMessage(__assign({ content: inputText, authorId: currentUserId }, (mentionsAI && { mentionsAI: true })));
        setInputText('');
    }, [inputText, currentUserId, onSendMessage]);
    var handleEditMessage = (0, react_1.useCallback)(function (messageId, content) {
        setEditingMessageId(messageId);
        setEditText(content);
    }, []);
    var handleSaveEdit = (0, react_1.useCallback)(function () {
        // Update message content locally (in real app, would sync)
        var messageIndex = conversation.messages.findIndex(function (m) { return m.id === editingMessageId; });
        if (messageIndex !== -1) {
            conversation.messages[messageIndex].content = editText;
        }
        setEditingMessageId(null);
        setEditText('');
    }, [editText, editingMessageId, conversation.messages]);
    var renderWikiTags = (0, react_1.useCallback)(function (content) {
        var tagRegex = /\[\[([^\]]+)\]\]/g;
        var parts = [];
        var lastIndex = 0;
        var match;
        var _loop_1 = function () {
            // Add text before tag
            if (match.index > lastIndex) {
                parts.push(react_1.default.createElement(react_native_1.Text, { key: "text-".concat(lastIndex) }, content.substring(lastIndex, match.index)));
            }
            // Add tag as clickable
            var tagName = match[1];
            parts.push(react_1.default.createElement(react_native_1.TouchableOpacity, { key: "tag-".concat(match.index), testID: "wiki-tag-".concat(tagName), onPress: function () { return onTagClick === null || onTagClick === void 0 ? void 0 : onTagClick(tagName); } },
                react_1.default.createElement(react_native_1.Text, { style: styles.wikiTag }, tagName)));
            lastIndex = match.index + match[0].length;
        };
        while ((match = tagRegex.exec(content)) !== null) {
            _loop_1();
        }
        // Add remaining text
        if (lastIndex < content.length) {
            parts.push(react_1.default.createElement(react_native_1.Text, { key: "text-".concat(lastIndex) }, content.substring(lastIndex)));
        }
        return parts.length > 0 ? parts : react_1.default.createElement(react_native_1.Text, null, content);
    }, [onTagClick]);
    var renderMessage = (0, react_1.useCallback)(function (_a) {
        var item = _a.item;
        var isOwnMessage = item.authorId === currentUserId;
        var isEditing = editingMessageId === item.id;
        var editingSession = editingSessions.find(function (s) { return s.messageId === item.id; });
        return (react_1.default.createElement(react_native_1.TouchableOpacity, { testID: "message-".concat(item.id), onLongPress: function () { return isOwnMessage && handleEditMessage(item.id, item.content); }, style: [styles.messageContainer, isOwnMessage && styles.ownMessage] },
            editingSession && (react_1.default.createElement(react_native_1.View, { testID: "editing-cursor-".concat(editingSession.userId) },
                react_1.default.createElement(react_native_1.Text, { style: styles.editingIndicator },
                    editingSession.userName,
                    " is editing..."))),
            isEditing ? (react_1.default.createElement(react_native_1.TextInput, { value: editText, onChangeText: setEditText, onSubmitEditing: handleSaveEdit, style: styles.editInput })) : (react_1.default.createElement(react_native_1.View, { testID: "message-item" }, renderWikiTags(item.content)))));
    }, [currentUserId, editingMessageId, editText, editingSessions, handleEditMessage, handleSaveEdit, renderWikiTags]);
    return (react_1.default.createElement(react_native_1.View, { style: styles.container },
        react_1.default.createElement(react_native_1.Text, { style: styles.title }, conversation.title),
        react_1.default.createElement(react_native_1.View, { style: styles.aiToggleContainer },
            react_1.default.createElement(react_native_1.Text, null, "AI Proactive Mode:"),
            react_1.default.createElement(react_native_1.Switch, { testID: "ai-proactive-toggle", value: aiProactive, onValueChange: setAiProactive })),
        react_1.default.createElement(react_native_1.FlatList, { testID: "message-list", data: conversation.messages, renderItem: renderMessage, keyExtractor: function (item) { return item.id; }, style: styles.messageList }),
        react_1.default.createElement(react_native_1.View, { style: styles.inputContainer },
            react_1.default.createElement(react_native_1.TextInput, { placeholder: "Type a message...", value: inputText, onChangeText: setInputText, style: styles.input }),
            react_1.default.createElement(react_native_1.TouchableOpacity, { testID: "send-button", onPress: handleSend, style: styles.sendButton },
                react_1.default.createElement(react_native_1.Text, null, "Send")))));
};
var styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    aiToggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    messageList: {
        flex: 1,
    },
    messageContainer: {
        padding: 12,
        marginVertical: 4,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
    },
    ownMessage: {
        backgroundColor: '#e3f2fd',
        alignSelf: 'flex-end',
    },
    editingIndicator: {
        fontSize: 12,
        fontStyle: 'italic',
        color: '#666',
    },
    editInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        padding: 8,
        borderRadius: 4,
    },
    wikiTag: {
        color: '#2196F3',
        textDecorationLine: 'underline',
    },
    inputContainer: {
        flexDirection: 'row',
        marginTop: 16,
    },
    input: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 4,
        padding: 8,
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: '#2196F3',
        padding: 12,
        borderRadius: 4,
        justifyContent: 'center',
    },
});
exports.default = ChatInterface;
