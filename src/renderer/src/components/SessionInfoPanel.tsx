import { Blocks, Cpu, Plug, Server, Slash, Wrench } from 'lucide-react'
import type { SessionInitInfo, SessionMcpServer, SessionPlugin } from '../../../shared/types'
import { useSessionStore } from '../store/session-store'

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Icon size={12} className="text-base-text-muted" />
      <span className="font-medium text-base-text-muted text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="ml-auto text-[10px] text-base-text-faint tabular-nums">{count}</span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-[var(--color-success)]'
      : status === 'failed'
        ? 'bg-[var(--color-error)]'
        : status === 'pending'
          ? 'bg-[var(--color-accent-hover)] animate-pulse'
          : 'bg-[var(--color-base-text-faint)]'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
}

function PluginItem({ plugin }: { plugin: SessionPlugin }) {
  return (
    <div className="group flex items-center gap-2 rounded px-3 py-1.5">
      <Blocks size={12} className="shrink-0 text-violet-400/70" />
      <span className="truncate text-base-text text-xs">{plugin.name}</span>
    </div>
  )
}

function McpServerItem({ server }: { server: SessionMcpServer }) {
  return (
    <div className="group flex items-center gap-2 rounded px-3 py-1.5">
      <StatusDot status={server.status} />
      <span className="truncate text-base-text text-xs">{server.name}</span>
      <span className="ml-auto text-[10px] text-base-text-faint">{server.status}</span>
    </div>
  )
}

function SkillItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded px-3 py-1.5">
      <Slash size={10} className="shrink-0 text-warning/70" />
      <span className="truncate text-base-text text-xs">{name}</span>
    </div>
  )
}

function ToolItem({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2 rounded px-3 py-1">
      <span className="truncate text-base-text-muted text-xs">{name}</span>
    </div>
  )
}

function InfoContent({ info }: { info: SessionInitInfo }) {
  return (
    <div className="space-y-1">
      {/* Header metadata */}
      <div className="space-y-1 border-base-border-subtle/50 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <Cpu size={11} className="text-base-text-faint" />
          <span className="text-base-text-secondary text-xs">{info.model}</span>
        </div>
        {info.claudeCodeVersion && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-base-text-faint">SDK {info.claudeCodeVersion}</span>
          </div>
        )}
      </div>

      {/* Plugins */}
      {info.plugins.length > 0 && (
        <div className="pb-1">
          <SectionHeader icon={Plug} label="Plugins" count={info.plugins.length} />
          {info.plugins.map((p) => (
            <PluginItem key={p.name} plugin={p} />
          ))}
        </div>
      )}

      {/* MCP Servers */}
      {info.mcpServers.length > 0 && (
        <div className="pb-1">
          <SectionHeader icon={Server} label="MCP Servers" count={info.mcpServers.length} />
          {info.mcpServers.map((s) => (
            <McpServerItem key={s.name} server={s} />
          ))}
        </div>
      )}

      {/* Skills */}
      {info.skills.length > 0 && (
        <div className="pb-1">
          <SectionHeader icon={Slash} label="Skills" count={info.skills.length} />
          {info.skills.map((name) => (
            <SkillItem key={name} name={name} />
          ))}
        </div>
      )}

      {/* Tools */}
      {info.tools.length > 0 && (
        <div className="pb-1">
          <SectionHeader icon={Wrench} label="Tools" count={info.tools.length} />
          {info.tools.map((name) => (
            <ToolItem key={name} name={name} />
          ))}
        </div>
      )}
    </div>
  )
}

type SessionInfoPanelProps = {
  sessionId: string
}

export function SessionInfoPanel({ sessionId }: SessionInfoPanelProps) {
  const info = useSessionStore((s) => s.initInfo.get(sessionId))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto py-1">
        {!info ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-base-text-faint text-xs">No session info</p>
            <p className="mt-1 text-base-text-faint text-xs">Send a message to initialize</p>
          </div>
        ) : (
          <InfoContent info={info} />
        )}
      </div>
    </div>
  )
}
