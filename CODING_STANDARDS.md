# Coding Standards: Extreme Type-Driven & Test-Driven Development

## Core Principles

### 1. Test-First, Always
**NO CODE WITHOUT TESTS**
- Write the test FIRST
- Watch it fail (Red)
- Write minimal code to pass (Green)
- Refactor with confidence (Refactor)

### 2. Type-First, Always
**NO DYNAMIC TYPING**
- Define types/interfaces before implementation
- Use strictest type checking settings
- Runtime validation matches compile-time types

### 3. 100% Coverage Target
**EVERY LINE TESTED**
- Minimum 100% line coverage
- Minimum 100% branch coverage
- Mutation testing to verify test quality

## Python Backend Standards

### Type Safety
```python
# ❌ NEVER THIS
def process_message(message):
    return message.upper()

# ✅ ALWAYS THIS
from typing import Protocol, NewType
from pydantic import BaseModel, validator

MessageId = NewType('MessageId', str)

class Message(BaseModel):
    id: MessageId
    content: str
    
    @validator('content')
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Content cannot be empty")
        return v

def process_message(message: Message) -> Message:
    return Message(id=message.id, content=message.content.upper())
```

### Test-First Development
```python
# STEP 1: Write the test FIRST
import pytest
from typing import Type

def test_process_message_uppercases_content():
    # Arrange
    message = Message(id=MessageId("123"), content="hello")
    
    # Act
    result = process_message(message)
    
    # Assert
    assert result.content == "HELLO"
    assert result.id == MessageId("123")

def test_message_validates_empty_content():
    with pytest.raises(ValueError, match="Content cannot be empty"):
        Message(id=MessageId("123"), content="  ")

# STEP 2: Run test, watch it fail
# STEP 3: Implement minimal code to pass
# STEP 4: Refactor if needed
```

### Python Testing Stack
- **pytest**: Test runner with fixtures
- **pytest-cov**: Coverage reporting (must be 100%)
- **pytest-asyncio**: Async test support
- **hypothesis**: Property-based testing
- **mutmut**: Mutation testing
- **mypy**: Static type checking (strict mode)
- **pydantic**: Runtime type validation

### Configuration
```toml
# pyproject.toml
[tool.mypy]
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_any_unimported = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
check_untyped_defs = true

[tool.pytest.ini_options]
addopts = "--cov=. --cov-report=term-missing --cov-fail-under=100"
testpaths = ["tests"]

[tool.coverage.run]
branch = true
omit = ["tests/*", "*/migrations/*"]

[tool.coverage.report]
fail_under = 100
```

## React Native Frontend Standards

### TypeScript Configuration
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Type-First React Components
```typescript
// ❌ NEVER THIS
const MessageBubble = ({message}) => {
  return <div>{message}</div>
}

// ✅ ALWAYS THIS
import { z } from 'zod';

// Runtime validation schema
const MessageSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  author: z.object({
    id: z.string().uuid(),
    name: z.string().min(1)
  }),
  createdAt: z.date()
});

// Derive TypeScript type from schema
type Message = z.infer<typeof MessageSchema>;

interface MessageBubbleProps {
  message: Message;
  onEdit: (id: string, content: string) => void;
  isEditing: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  onEdit, 
  isEditing 
}) => {
  // Validate at runtime in development
  if (__DEV__) {
    MessageSchema.parse(message);
  }
  
  return (
    <View testID="message-bubble">
      <Text>{message.content}</Text>
    </View>
  );
};
```

### Test-First React Development
```typescript
// STEP 1: Write test FIRST
import { render, fireEvent } from '@testing-library/react-native';

describe('MessageBubble', () => {
  const mockMessage: Message = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    content: 'Hello World',
    author: {
      id: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Alice'
    },
    createdAt: new Date('2024-01-01')
  };

  it('renders message content', () => {
    const { getByText } = render(
      <MessageBubble 
        message={mockMessage}
        onEdit={jest.fn()}
        isEditing={false}
      />
    );
    
    expect(getByText('Hello World')).toBeTruthy();
  });

  it('calls onEdit when edit triggered', () => {
    const onEdit = jest.fn();
    const { getByTestId } = render(
      <MessageBubble 
        message={mockMessage}
        onEdit={onEdit}
        isEditing={true}
      />
    );
    
    fireEvent.press(getByTestId('edit-button'));
    expect(onEdit).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', 'Hello World');
  });
});

// STEP 2: Run test, watch fail
// STEP 3: Implement component
// STEP 4: Refactor
```

### Frontend Testing Stack
- **Jest**: Test runner
- **React Testing Library**: Component testing
- **MSW**: Mock service worker for API mocking
- **Zod**: Runtime type validation
- **TypeScript**: Compile-time type checking

## Shared Standards

### Git Workflow
1. Create branch with ticket number: `feature/TICK-123-add-message-editing`
2. Write failing tests for the feature
3. Commit tests: `test: add tests for message editing`
4. Implement feature to pass tests
5. Commit implementation: `feat: implement message editing`
6. **Self-Review**: After committing, review your own code:
   - Re-read the diff critically
   - Check for edge cases missed by tests
   - Verify type safety and documentation
   - Consider performance implications
   - Think: "Would I approve this PR?"
7. Refactor if needed based on self-review: `refactor: simplify message editing logic`
8. All commits must pass CI/CD checks

### Self-Review Checklist (After Each Commit)
```
- [ ] Does this code do what the tests expect?
- [ ] Are there any untested edge cases?
- [ ] Is the code readable without comments?
- [ ] Are all types explicit and correct?
- [ ] Would a new developer understand this?
- [ ] Are there any security concerns?
- [ ] Is there any duplicated logic?
- [ ] Could this be simpler?
- [ ] Are error messages helpful?
- [ ] Is the git commit message clear?
```

### Pre-commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: python-tests
        name: Python Tests
        entry: pytest
        language: system
        types: [python]
        pass_filenames: false
        always_run: true
      
      - id: python-types
        name: Python Type Check
        entry: mypy
        language: system
        types: [python]
        
      - id: python-coverage
        name: Python Coverage Check
        entry: pytest --cov-fail-under=100
        language: system
        types: [python]
        pass_filenames: false
        
      - id: typescript-types
        name: TypeScript Check
        entry: tsc --noEmit
        language: system
        types: [typescript, tsx]
        pass_filenames: false
        
      - id: frontend-tests
        name: Frontend Tests
        entry: npm test -- --coverage --watchAll=false
        language: system
        pass_filenames: false
```

### CI/CD Pipeline Requirements
```yaml
# Must pass before merge
python-backend:
  - mypy --strict
  - pytest --cov-fail-under=100
  - mutmut run --paths-to-mutate=src/
  
react-frontend:
  - tsc --noEmit
  - npm test -- --coverage --threshold=100
  - npm run lint
```

## Development Workflow

### Adding a New Feature
1. **Design types first**
   - Define Pydantic models (Python)
   - Define Zod schemas (TypeScript)
   - Generate OpenAPI spec

2. **Write integration test**
   - Full user journey test
   - API contract test
   - E2E test if applicable

3. **Write unit tests**
   - Test each function/component
   - Test error cases
   - Test edge cases

4. **Implement feature**
   - Minimal code to pass tests
   - No untested code paths

5. **Refactor**
   - Improve code quality
   - Tests ensure no regression

6. **Review checklist**
   - [ ] 100% test coverage
   - [ ] All types explicit
   - [ ] Tests written first
   - [ ] Mutation testing passed
   - [ ] No `any` types
   - [ ] No `@ts-ignore`
   - [ ] No `# type: ignore`

## Exceptions

The ONLY acceptable untested code:
1. Generated code (with generation tests)
2. Pure type definitions
3. Configuration files

Everything else: **100% coverage, no exceptions**.

## Enforcement

- **Local**: Pre-commit hooks prevent commits without tests
- **CI/CD**: PRs blocked without 100% coverage
- **Code Review**: Reject PRs that add code before tests
- **Monitoring**: Track coverage trends, alert on drops

## Benefits

1. **Confidence**: Every change is safe
2. **Documentation**: Tests document behavior
3. **Design**: TDD forces good architecture
4. **Refactoring**: Change code fearlessly
5. **Onboarding**: New devs understand via tests
6. **Quality**: Bugs caught before production

## Remember

> "The only way to go fast is to go well." - Robert C. Martin

Write the test first. Always.