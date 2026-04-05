# Reader Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first competition-focused reader upgrade with graph cleanup, AI sentence explanation, TOC navigation, and corpus expansion groundwork.

**Architecture:** Reuse the existing reader shell and learning side-panel area. Add one new SSE-backed sentence explanation flow on the backend and one new explain panel on the frontend. Keep TOC and corpus work incremental so the main reader experience stays stable.

**Tech Stack:** FastAPI, StreamingResponse (SSE), React 19, Zustand, Vitest, existing translator/RAG agents

---

### Task 1: Write the approved design into the repo

**Files:**
- Create: `docs/plans/2026-04-04-reader-upgrade-design.md`
- Create: `docs/plans/2026-04-04-reader-upgrade-implementation.md`

**Step 1:** Save the confirmed design

**Step 2:** Save the implementation plan

**Step 3:** Review for scope drift before editing runtime code

### Task 2: Clean knowledge-graph residue without breaking reader recommendations

**Files:**
- Modify: `src/backend-gateway/core/entity_extractor.py`
- Modify: `src/backend-gateway/routers/vision.py`
- Modify: `src/frontend-app/package.json`
- Modify: `README.md`
- Modify: `TECHNICAL_DOC.md`

**Step 1:** Replace “knowledge graph” internal terminology with neutral “reading cues / entity lexicon”

**Step 2:** Keep entity extraction behavior but decouple it from feature messaging

**Step 3:** Ensure frontend dependency list no longer includes graph visualization packages

### Task 3: Add backend SSE API for sentence explanation

**Files:**
- Create: `src/backend-gateway/agents/sentence_explainer.py`
- Modify: `src/backend-gateway/routers/document.py`
- Modify: `src/backend-gateway/models/schemas.py` (only if shared schemas are useful)

**Step 1:** Add a small sentence explainer agent with structured sections

**Step 2:** Add `POST /api/v1/documents/{document_id}/sentence-explain`

**Step 3:** Stream sections in this order: gloss, translation, citations, rhetoric/follow-up

**Step 4:** Keep fallback behavior when model calls fail

### Task 4: Make the reader sentence-aware and wire the new explain panel

**Files:**
- Create: `src/frontend-app/src/components/ReaderExplainPanel.tsx`
- Create: `src/frontend-app/src/utils/readerSentences.ts`
- Modify: `src/frontend-app/src/components/ThreeColumnReader.tsx`
- Modify: `src/frontend-app/src/store/useDocumentStore.ts`
- Modify: `src/frontend-app/src/App.tsx`

**Step 1:** Split punctuated text into sentence units

**Step 2:** Align original text sentences from punctuated text

**Step 3:** Add sentence click interaction to open the explain panel

**Step 4:** Reuse the right-side learning panel area for the explain panel

### Task 5: Add TOC navigation using existing segment data

**Files:**
- Create: `src/frontend-app/src/components/ReaderTocPanel.tsx`
- Modify: `src/frontend-app/src/components/ThreeColumnReader.tsx`
- Modify: `src/frontend-app/src/store/useDocumentStore.ts`
- Modify: `src/frontend-app/src/App.tsx`

**Step 1:** Expose document `segments` to the reader

**Step 2:** Add a TOC trigger in the reader header

**Step 3:** Jump to the selected chapter via existing anchor behavior

### Task 6: Expand curated corpus and rebuild support scripts

**Files:**
- Modify: `src/backend-gateway/core/kanripo_source.py`
- Modify: `src/backend-gateway/core/reading_guides.py`
- Modify: `src/backend-gateway/scripts/build_kanripo_corpus.py`

**Step 1:** Expand the curated work list

**Step 2:** Add matching reading-guide coverage for new high-priority works

**Step 3:** Verify the build script still produces valid records

### Task 7: Test and verify

**Files:**
- Modify: `src/frontend-app/src/__tests__/ThreeColumnReader.test.tsx`
- Modify: `src/frontend-app/src/__tests__/WordPopover.entity.test.tsx`
- Add if needed: `src/frontend-app/src/__tests__/ReaderExplainPanel.test.tsx`
- Add if needed: `src/backend-gateway/tests/test_sentence_explain_api.py`

**Step 1:** Update reader tests for the new explain panel path

**Step 2:** Run frontend tests for reader-related changes

**Step 3:** Run backend tests for the new API

**Step 4:** Run build/type checks before closing the task
