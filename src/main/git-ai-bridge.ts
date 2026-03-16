import { log } from '../shared/logger'
import type { CommitPlan, ConflictResolution, GitCommandPlan } from '../shared/git-types'
import { getDiffForAnalysis } from './git-commit-service'
import { getConflictFiles, readConflictFile } from './git-ops-service'
import { sessionManager } from './session-manager'

const logger = log.child('git-ai-bridge')

export async function analyzeForCommitPlan(
  cwd: string,
  sessionId: string,
): Promise<CommitPlan> {
  const diff = await getDiffForAnalysis(cwd)
  if (!diff.trim()) {
    return { groups: [], reasoning: 'No changes detected.' }
  }

  const systemPrompt = `You are a git commit assistant. Analyze the following diff and propose logical commit groups.
Return ONLY valid JSON matching this schema:
{ "groups": [{ "title": string, "message": string, "files": [{ "path": string }], "order": number, "rationale": string }], "reasoning": string }
Use conventional commit format for messages. Group related changes together.`

  const response = await sessionManager.sendGitAiQuery(sessionId, diff, systemPrompt)

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    return JSON.parse(jsonMatch[0]) as CommitPlan
  } catch (err) {
    logger.error('Failed to parse commit plan:', err)
    return { groups: [], reasoning: 'Failed to parse AI response' }
  }
}

export async function generateCommitMessage(
  cwd: string,
  sessionId: string,
): Promise<string> {
  const diff = await getDiffForAnalysis(cwd)
  const systemPrompt = `You are a git commit message generator. Analyze the staged diff and return ONLY a conventional commit message (no explanation, no markdown). Format: type(scope): description`

  const response = await sessionManager.sendGitAiQuery(sessionId, diff, systemPrompt)
  return response.trim().replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
}

export async function interpretNlCommand(
  _cwd: string,
  sessionId: string,
  text: string,
): Promise<GitCommandPlan> {
  const systemPrompt = `You are a git command interpreter. The user describes what they want in plain English.
Return ONLY valid JSON matching this schema:
{ "id": string, "interpretation": string, "commands": [{ "command": string, "explanation": string }], "preview": string, "riskLevel": "safe"|"moderate"|"destructive", "warnings": string[] }
All commands MUST start with "git". Classify risk accurately:
- safe: status, log, branch (read-only or easily reversible)
- moderate: commit, merge, checkout (changes state but recoverable)
- destructive: reset --hard, push --force, branch -D (potential data loss)`

  const response = await sessionManager.sendGitAiQuery(sessionId, text, systemPrompt)

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0]) as GitCommandPlan
  } catch (err) {
    logger.error('Failed to parse NL command:', err)
    return {
      id: crypto.randomUUID(),
      interpretation: 'Failed to interpret command',
      commands: [],
      preview: '',
      riskLevel: 'safe',
      warnings: ['Could not parse AI response'],
    }
  }
}

export async function resolveConflicts(
  cwd: string,
  sessionId: string,
): Promise<ConflictResolution[]> {
  const conflictFiles = await getConflictFiles(cwd)
  if (conflictFiles.length === 0) return []

  const resolutions: ConflictResolution[] = []
  for (const { filePath } of conflictFiles) {
    const content = await readConflictFile(cwd, filePath)

    const systemPrompt = `You are a merge conflict resolver. Analyze the conflict markers and produce a clean resolution.
Return ONLY valid JSON: { "resolvedContent": string, "explanation": string, "confidence": "high"|"medium"|"low" }
Choose the resolution that best preserves both sides' intent.`

    const response = await sessionManager.sendGitAiQuery(sessionId, content, systemPrompt)

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON')
      const parsed = JSON.parse(jsonMatch[0])
      resolutions.push({
        filePath,
        originalContent: content,
        resolvedContent: parsed.resolvedContent,
        explanation: parsed.explanation,
        confidence: parsed.confidence,
      })
    } catch {
      resolutions.push({
        filePath,
        originalContent: content,
        resolvedContent: content,
        explanation: 'Failed to resolve automatically',
        confidence: 'low',
      })
    }
  }

  return resolutions
}
