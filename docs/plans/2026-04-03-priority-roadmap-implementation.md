# WenDao Priority Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a product-facing upgrade centered on trusted answers, smoother reading flow, a stronger learning loop, clearer content expansion entry points, and a lightweight co-reading atmosphere.

**Architecture:** Extend the current FastAPI + React flow rather than introducing a new subsystem. Reuse existing chat citations, reader progress, study-card, and catalog APIs, then add one learning-focus payload and one answer-context payload so the frontend can present trust, reading, and review actions inside the existing surfaces.

**Tech Stack:** FastAPI, React 19, TypeScript, Zustand, Vitest, pytest

---

### Task 1: Trusted Answer Context

**Files:**
- Modify: `src/backend-gateway/routers/chat.py`
- Modify: `src/frontend-app/src/store/useStore.ts`
- Create: `src/frontend-app/src/components/AnswerContextCard.tsx`
- Modify: `src/frontend-app/src/components/MessageList.tsx`
- Modify: `src/frontend-app/src/components/ChatInterface.tsx`
- Test: `src/frontend-app/src/__tests__/ChatInterface.test.tsx`

**Step 1:** Add a backend SSE `answer_context` event derived from citations and related entities.

**Step 2:** Extend the chat message state so assistant messages can store trust metadata and suggested next actions.

**Step 3:** Render a compact “回答依据” card under assistant messages with citation count, trace summary, and one-click actions.

**Step 4:** Wire the actions to existing reader/search/chat flows.

**Step 5:** Verify with frontend tests.

### Task 2: Reader Companion Flow

**Files:**
- Modify: `src/frontend-app/src/components/ThreeColumnReader.tsx`
- Modify: `src/frontend-app/src/store/useDocumentStore.ts`
- Test: `src/frontend-app/src/__tests__/ThreeColumnReader.test.tsx`

**Step 1:** Add a reader-side companion strip with actions for “解释这篇”“梳理典故”“进入复习”.

**Step 2:** Reuse existing tab switching and draft-message flows so the reader can jump to chat or study without losing context.

**Step 3:** Verify the actions from both desktop and mobile reader layouts.

### Task 3: Learning Focus Payload

**Files:**
- Modify: `src/backend-gateway/routers/reader.py`
- Test: `src/backend-gateway/tests/test_reader_api.py`

**Step 1:** Add a `/api/v1/reader/focus` endpoint that aggregates today’s review focus, learning streak, curated reading paths, and co-reading prompts.

**Step 2:** Keep the implementation deterministic and fallback-safe for unauthenticated or empty-state users.

**Step 3:** Verify the new payload with backend tests.

### Task 4: Dashboard Upgrade

**Files:**
- Modify: `src/frontend-app/src/components/DashboardHome.tsx`
- Test: `src/frontend-app/src/__tests__/DashboardHome.test.tsx`

**Step 1:** Fetch the new learning-focus payload alongside existing dashboard data.

**Step 2:** Surface three new blocks: 今日复习, 经典路径, 共读灵感.

**Step 3:** Route each action into existing reader, search, and chat tabs.

**Step 4:** Verify rendering and callbacks with tests.

### Task 5: Verification

**Files:**
- Modify: none unless fixes are required
- Test: `src/backend-gateway/tests/test_reader_api.py`
- Test: `src/frontend-app/src/__tests__/DashboardHome.test.tsx`
- Test: `src/frontend-app/src/__tests__/SearchPanel.test.tsx`

**Step 1:** Run targeted frontend tests for dashboard/chat/reader surfaces.

**Step 2:** Run targeted backend tests for reader payloads.

**Step 3:** Fix regressions until green.
