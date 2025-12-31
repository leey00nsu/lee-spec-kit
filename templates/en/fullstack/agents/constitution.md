# {{projectName}} Constitution

Core principles and technical decision guidelines for the project.
All development decisions should be based on this document.

---

## Project Mission

> (Write your project mission here)

---

## Tech Stack

### Backend

| Technology     | Version   | Reason   |
| -------------- | --------- | -------- |
| (e.g., NestJS) | (version) | (reason) |

### Frontend

| Technology    | Version   | Reason   |
| ------------- | --------- | -------- |
| (e.g., React) | (version) | (reason) |

### Common

| Technology        | Version | Reason             |
| ----------------- | ------- | ------------------ |
| TypeScript        | strict  | Type safety        |
| ESLint + Prettier | -       | Code quality       |
| pnpm              | -       | Package management |

---

## Architecture Principles

### 1. Feature-Centric Management

- New features managed in `docs/features/F00X/` structure
- Develop by **feature unit** with FE/BE separation
- Workflow: spec → plan → tasks → decisions

### 2. (Additional Principles)

(Write project-specific architecture principles)

---

## Code Quality Standards

- TypeScript strict mode required
- ESLint + Prettier required
- Test coverage **80%+** for core business logic
- Components follow **single responsibility principle**
- Minimize code duplication

---

## Security Principles

- Manage secrets via environment variables (no repo commits)
- **Minimal** user data collection
- CORS configured for allowed origins only

---

## Language/Code Rules

- **AI Responses**: English
- **Code/Filenames**: English
- **Comments/Commits**: English
- **Date/Time**: User's PC system time (e.g., `{{date}}`)
