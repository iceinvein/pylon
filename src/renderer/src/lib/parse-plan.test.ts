import { describe, expect, test } from 'bun:test'
import { isPlanPath, parsePlanSections, toRelativePath } from './parse-plan'

describe('isPlanPath', () => {
  test('matches files in /plans/ directory', () => {
    expect(isPlanPath('docs/plans/auth-feature.md')).toBe(true)
    expect(isPlanPath('/home/user/project/docs/plans/roadmap.md')).toBe(true)
  })

  test('matches files in /specs/ directory', () => {
    expect(isPlanPath('docs/specs/api-spec.md')).toBe(true)
  })

  test('matches files with -plan.md suffix', () => {
    expect(isPlanPath('auth-plan.md')).toBe(true)
    expect(isPlanPath('/some/path/feature-plan.md')).toBe(true)
  })

  test('matches files with -design.md suffix', () => {
    expect(isPlanPath('ui-design.md')).toBe(true)
  })

  test('rejects non-markdown files even in plans dir', () => {
    expect(isPlanPath('docs/plans/notes.txt')).toBe(false)
  })

  test('rejects random markdown files', () => {
    expect(isPlanPath('README.md')).toBe(false)
    expect(isPlanPath('src/utils/helpers.md')).toBe(false)
  })

  test('is case-insensitive', () => {
    expect(isPlanPath('docs/Plans/Feature.md')).toBe(true)
    expect(isPlanPath('AUTH-PLAN.MD')).toBe(true)
  })
})

describe('toRelativePath', () => {
  test('extracts path from docs/ onward', () => {
    expect(toRelativePath('/home/user/project/docs/plans/auth.md')).toBe('docs/plans/auth.md')
  })

  test('falls back to last two segments', () => {
    expect(toRelativePath('/home/user/project/src/utils.ts')).toBe('src/utils.ts')
  })

  test('handles path with only one segment', () => {
    expect(toRelativePath('file.ts')).toBe('file.ts')
  })
})

describe('parsePlanSections', () => {
  test('returns empty array for empty string', () => {
    expect(parsePlanSections('')).toEqual([])
  })

  test('skips frontmatter', () => {
    const md = `---
title: My Plan
---

## Section One

Content here.`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Section One')
    expect(sections[0].body).toBe('Content here.')
  })

  test('skips the first H1 (document title)', () => {
    const md = `# My Plan Title

## Overview

Some overview content.`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Overview')
  })

  test('parses multiple H2 sections', () => {
    const md = `## First

Content A

## Second

Content B`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('First')
    expect(sections[0].body).toBe('Content A')
    expect(sections[1].title).toBe('Second')
    expect(sections[1].body).toBe('Content B')
  })

  test('parses H3 children under H2 sections', () => {
    const md = `## Phase 1

### Task 1

Do the thing.

### Task 2

Do another thing.`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].children).toHaveLength(2)
    expect(sections[0].children![0].title).toBe('Task 1')
    expect(sections[0].children![0].body).toBe('Do the thing.')
    expect(sections[0].children![1].title).toBe('Task 2')
    expect(sections[0].children![1].body).toBe('Do another thing.')
  })

  test('H2 without H3s is a leaf section (no children)', () => {
    const md = `## Standalone Section

Just content, no sub-sections.`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].children).toBeUndefined()
  })

  test('sets level correctly on sections and children', () => {
    const md = `## Parent

### Child`
    const sections = parsePlanSections(md)
    expect(sections[0].level).toBe(2)
    expect(sections[0].children![0].level).toBe(3)
  })

  test('handles frontmatter + H1 + H2 + H3 together', () => {
    const md = `---
version: 1
---

# Project Plan

## Phase 1

Introduction.

### Step 1

First step.

## Phase 2

Second phase content.`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('Phase 1')
    expect(sections[0].children).toHaveLength(1)
    expect(sections[0].children![0].title).toBe('Step 1')
    expect(sections[1].title).toBe('Phase 2')
    expect(sections[1].body).toBe('Second phase content.')
  })

  test('treats subsequent H1s as body content', () => {
    const md = `# Title

## Section

# This is not a title anymore`
    const sections = parsePlanSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].body).toContain('# This is not a title anymore')
  })
})
