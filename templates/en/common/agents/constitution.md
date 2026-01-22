# {{projectName}} Constitution

> ⚠️ **Replace `{{projectName}}` and `{{date}}` with actual project name and date.**

Core principles and technical decision guidelines for this project.
All development decisions are based on this document.

> **📌 Document Scope**
>
> - **This document**: Tech stack, architecture principles, code quality, security principles
> - **PRD**: Product requirements, business logic, user stories → `prd/*.md`

---

## Project Mission

> (Write your project mission here)

---

## Tech Stack

### Backend

| Tech          | Version   | Reason   |
| ------------- | --------- | -------- |
| (e.g. NestJS) | (version) | (reason) |

### Frontend

| Tech         | Version   | Reason   |
| ------------ | --------- | -------- |
| (e.g. React) | (version) | (reason) |

### Common

| Tech              | Version | Reason       |
| ----------------- | ------- | ------------ |
| TypeScript        | strict  | Type safety  |
| ESLint + Prettier | -       | Code quality |
| pnpm              | -       | Package mgmt |

---

## Architecture Principles

### 1. Feature-Centric Management

- Manage new features in `docs/features/F00X/` structure
- Develop by **feature unit** (FE/BE separate)
- spec → plan → tasks → decisions workflow

### 2. (Additional Principles)

(Write project-specific architecture principles here)

---

## Code Quality Standards

- TypeScript strict mode required
- ESLint + Prettier required
- Major business logic test coverage **80%+**
- Components follow **Single Responsibility Principle**
- Minimize code duplication

---

## Security Principles

- Manage secrets via environment variables (no repo commits)
- **Minimal data collection** for user data
- CORS only for allowed origins

---

## Language/Code Rules

- **Responses**: English
- **Code/Filenames**: English
- **Comments/Commits**: English
- **Date/Time**: User's local system time (e.g., `{{date}}`)
