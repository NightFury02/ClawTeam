# Contributing to ClawTeam

Thank you for your interest in contributing to ClawTeam! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Community](#community)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/your-username/ClawTeam.git
   cd ClawTeam
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original-org/ClawTeam.git
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Node.js 22+ and npm
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+
- Git

### Installation

```bash
# Install dependencies
npm install

# Start infrastructure
docker compose up postgres redis -d

# Run database migrations
npm run migrate:up

# Start development servers
npm run dev
```

### Environment Configuration

Copy `.env.example` to `.env` and configure your local environment:

```bash
cp .env.example .env
```

Edit `.env` with your local settings (database credentials, API keys, etc.).

## Development Workflow

### Branch Naming Convention

- `feature/` - New features (e.g., `feature/add-bot-discovery`)
- `fix/` - Bug fixes (e.g., `fix/session-recovery-bug`)
- `docs/` - Documentation updates (e.g., `docs/update-api-reference`)
- `refactor/` - Code refactoring (e.g., `refactor/task-coordinator`)
- `test/` - Test additions or updates (e.g., `test/add-integration-tests`)

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(api): add bot capability search endpoint

Implement semantic search for bot capabilities using vector similarity.
Includes caching layer for improved performance.

Closes #123
```

```
fix(gateway): resolve session recovery race condition

Fix race condition in session tracker that caused duplicate task routing.
Add mutex lock to prevent concurrent session updates.

Fixes #456
```

### Keeping Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Merge upstream main into your branch
git checkout main
git merge upstream/main

# Rebase your feature branch
git checkout feature/your-feature-name
git rebase main
```

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in `tsconfig.json`
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for functions
- Avoid `any` type - use `unknown` if type is truly unknown

**Example:**
```typescript
// Good
interface BotCapability {
  name: string;
  description: string;
  async: boolean;
  estimatedTime: string;
}

function searchCapabilities(query: string): Promise<BotCapability[]> {
  // implementation
}

// Avoid
function searchCapabilities(query: any): any {
  // implementation
}
```

### Naming Conventions

- **Files**: kebab-case (e.g., `task-coordinator.ts`)
- **Classes**: PascalCase (e.g., `TaskCoordinator`)
- **Functions/Variables**: camelCase (e.g., `searchCapabilities`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase with `I` prefix optional (e.g., `BotCapability` or `IBotCapability`)

### Code Organization

- Keep files focused and under 300 lines when possible
- Group related functionality into modules
- Use barrel exports (`index.ts`) for public APIs
- Separate concerns: routes, services, repositories, types

### Comments and Documentation

- Write self-documenting code with clear variable/function names
- Add JSDoc comments for public APIs
- Explain "why" not "what" in comments
- Keep comments up-to-date with code changes

**Example:**
```typescript
/**
 * Searches for bots with matching capabilities using semantic similarity.
 *
 * @param query - Natural language capability description
 * @param threshold - Minimum similarity score (0-1)
 * @returns Array of matching bots sorted by relevance
 */
export async function searchBots(
  query: string,
  threshold: number = 0.7
): Promise<Bot[]> {
  // Use cached results if available to reduce API calls
  const cached = await cache.get(query);
  if (cached) return cached;

  // implementation
}
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- task-coordinator.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Writing Tests

- Write tests for all new features
- Maintain or improve code coverage (target: 80%+)
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert
- Mock external dependencies

**Example:**
```typescript
describe('TaskCoordinator', () => {
  describe('delegateTask', () => {
    it('should delegate task to bot with matching capability', async () => {
      // Arrange
      const coordinator = new TaskCoordinator(mockDb, mockRedis);
      const task = createMockTask({ capability: 'code_review' });
      const bot = createMockBot({ capabilities: ['code_review'] });

      // Act
      const result = await coordinator.delegateTask(task, bot.id);

      // Assert
      expect(result.status).toBe('delegated');
      expect(result.assignedTo).toBe(bot.id);
    });
  });
});
```

### Integration Tests

Integration tests are located in `tests/multibot/`. To run them:

```bash
cd tests/multibot
python -m pytest
```

## Pull Request Process

### Before Submitting

1. **Update your branch** with the latest main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run tests** and ensure they pass:
   ```bash
   npm test
   npm run lint
   ```

3. **Update documentation** if needed:
   - Update README if adding new features
   - Update API docs if changing endpoints
   - Add/update code comments

4. **Update CHANGELOG.md** with your changes

### Submitting a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create a Pull Request** on GitHub

3. **Fill out the PR template** with:
   - Description of changes
   - Related issue numbers
   - Testing performed
   - Screenshots (if UI changes)

4. **Request review** from maintainers

### PR Review Process

- Maintainers will review your PR within 3-5 business days
- Address review comments by pushing new commits
- Once approved, a maintainer will merge your PR
- Your contribution will be included in the next release

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Tests added/updated and passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Commit messages follow convention
- [ ] No merge conflicts with main
- [ ] PR description is clear and complete

## Issue Reporting

### Bug Reports

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Error messages and stack traces
- Screenshots if applicable

### Feature Requests

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) and include:

- Clear description of the feature
- Use case and motivation
- Proposed implementation (optional)
- Alternatives considered

### Questions

Use the [Question template](.github/ISSUE_TEMPLATE/question.md) or start a [GitHub Discussion](https://github.com/your-org/ClawTeam/discussions).

## Community

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions, ideas, and general discussion
- **Pull Requests**: Code contributions

### Getting Help

- Check existing [documentation](docs/)
- Search [existing issues](https://github.com/your-org/ClawTeam/issues)
- Ask in [GitHub Discussions](https://github.com/your-org/ClawTeam/discussions)

---

Thank you for contributing to ClawTeam! 🎉
