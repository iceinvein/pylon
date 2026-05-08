type RepoFileRef = {
  filePath: string
}

type VisibleGraphNode = {
  id: string
  filePath: string
  isCluster?: boolean
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

export function findRepoFilePath(candidatePath: string, files: RepoFileRef[]): string | null {
  const normalizedCandidate = normalizePath(candidatePath)

  const exact = files.find((file) => normalizePath(file.filePath) === normalizedCandidate)
  if (exact) return exact.filePath

  const suffix = files.find((file) =>
    normalizePath(file.filePath).endsWith(`/${normalizedCandidate}`),
  )
  return suffix?.filePath ?? null
}

export function findVisibleGraphNode<T extends VisibleGraphNode>(
  candidatePath: string,
  files: RepoFileRef[],
  nodes: T[],
): T | null {
  const repoPath = findRepoFilePath(candidatePath, files)
  const paths = repoPath ? [repoPath, candidatePath] : [candidatePath]

  for (const path of paths) {
    const normalizedPath = normalizePath(path)
    const exact = nodes.find(
      (node) =>
        normalizePath(node.filePath) === normalizedPath ||
        normalizePath(node.id) === normalizedPath,
    )
    if (exact) return exact

    const collapsedParent = nodes
      .filter((node) => node.isCluster && normalizedPath.startsWith(`${normalizePath(node.id)}/`))
      .sort((a, b) => normalizePath(b.id).length - normalizePath(a.id).length)[0]
    if (collapsedParent) return collapsedParent
  }

  return null
}

export function countVisibleSearchMatches<T extends VisibleGraphNode>(
  matchedFilePaths: string[],
  files: RepoFileRef[],
  nodes: T[],
): Map<string, number> {
  const counts = new Map<string, number>()

  for (const filePath of matchedFilePaths) {
    const node = findVisibleGraphNode(filePath, files, nodes)
    if (!node) continue
    counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
  }

  return counts
}
