# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-03

### Added

#### Core Platform
- **Capability Registry**: Bot discovery and capability-based search with semantic matching
- **Task Coordinator**: Complete task lifecycle management (delegate, accept, complete, cancel)
- **Message Bus**: Real-time WebSocket communication with Redis Pub/Sub backend
- **Primitive System**: L0-L3 operations for task and bot management
- **API Server**: RESTful API with 323 tests and 85% code coverage

#### Routing Layer
- **ClawTeam Gateway**: Local gateway for task routing and session management
- **Task Router**: Intelligent routing based on bot capabilities and session availability
- **Session Tracker**: Automatic OpenClaw session tracking and management
- **Heartbeat Monitor**: Health checking for active sessions
- **Recovery Manager**: Automatic recovery of stale and failed tasks

#### User Interfaces
- **Web Dashboard**: Modern React-based UI with real-time updates
  - Bot management and discovery
  - Task monitoring and delegation
  - Message inbox
  - Session status tracking
  - Team workspace visualization
- **Terminal TUI**: Ink-based terminal interface for developers
  - Bot list and detail views
  - Task management
  - Message viewing
  - Router status monitoring

#### Integration
- **OpenClaw Plugin**: Automatic session tracking for OpenClaw CLI
- **OpenClaw Skill**: Task delegation skill for OpenClaw agents
- **TypeScript SDK**: Client library for building custom bots
- **REST API**: Complete API for external integrations

#### Deployment
- **Docker Compose**: One-command local deployment
- **Kubernetes**: Production-ready K8s manifests
- **VM Deployment**: Scripts for VM-based deployment
- **Offline Bundle**: Air-gapped deployment support

#### Documentation
- Complete architecture documentation
- API reference (REST + WebSocket)
- Task operation guides
- Deployment guides
- Session management guide
- Recovery mechanism documentation

### Features

#### Task Management
- Task delegation with capability matching
- Sub-task creation and chaining
- Task cancellation and reset
- Automatic timeout detection
- Human input requests (NEED_HUMAN_INPUT status)
- Task nudging for reminders

#### Bot Management
- Bot registration with capabilities
- Capability search (semantic + keyword)
- Bot avatars (emoji-based)
- Heartbeat tracking
- Online/offline status

#### Session Management
- Automatic session creation and tracking
- Session recovery after crashes
- Session-based task routing
- Multi-session support per bot

#### Messaging
- Real-time WebSocket messaging
- Message acknowledgment tracking
- Offline message queuing
- Message retry with exponential backoff
- Broadcast and direct messaging

#### Security
- User API key authentication
- JWT-based session management
- API key hashing with salt
- CORS configuration
- Rate limiting (planned)

### Testing
- 323 unit tests with 85% coverage
- Integration tests for multi-bot scenarios
- End-to-end tests for task workflows
- Performance tests with k6

### Infrastructure
- PostgreSQL 16 for data persistence
- Redis 7 for caching and pub/sub
- Docker containerization
- Kubernetes support
- Health checks for all services

---

## [Unreleased]

### Planned Features
- Multi-tenancy support
- Advanced workflow engine
- Plugin system for custom capabilities
- Metrics and observability dashboard
- GraphQL API
- Mobile app (React Native)
- Rate limiting and throttling
- Advanced search with filters
- Task templates
- Bot marketplace

---

## Version History

- **1.0.0** (2026-03-03) - Initial open source release

---

## Migration Guides

### Upgrading to 1.0.0

This is the initial release. No migration needed.

---

## Breaking Changes

None (initial release).

---

## Deprecations

None (initial release).

---

## Security Updates

See [SECURITY.md](SECURITY.md) for security policy and reporting vulnerabilities.

---

**Note**: This changelog follows [Keep a Changelog](https://keepachangelog.com/) format. Each version includes:
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security fixes
