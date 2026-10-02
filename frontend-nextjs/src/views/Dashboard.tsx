"use client";

import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../components/AdminLayout";
import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Agent as ApiAgent } from "../services/api";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "../hooks/useMediaQuery";

interface DashboardSession {
	id: string;
	session_id: string;
	visitor_id?: string;
	status: string;
	message_count: number;
	created_at: string;
	updated_at?: string;
	last_message?: string;
}

interface SessionListResponse {
	items?: DashboardSession[];
}

interface QuickAction {
	title: string;
	description: string;
	path: string;
	icon: JSX.Element;
}

const quickActions: QuickAction[] = [
	{ title: "Open Playground", description: "Test your agent with a live conversation", path: "/playground", icon: <span aria-hidden="true">✦</span> },
	{ title: "Add Files", description: "Upload support documents for retrieval", path: "/files", icon: <span aria-hidden="true">+</span> },
	{ title: "Add Website", description: "Connect a website as a knowledge source", path: "/urls", icon: <span aria-hidden="true">↗</span> },
	{ title: "View Sessions", description: "Review customer conversations", path: "/sessions", icon: <span aria-hidden="true">◌</span> },
];

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "error" | "muted" }) {
	const color = { success: "var(--color-success)", warning: "var(--color-warning)", error: "var(--color-error)", muted: "var(--color-text-muted)" }[tone];
	return <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-full)", background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`, color, fontSize: "var(--text-xs)", fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />{label}</span>;
}

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
	return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", marginBottom: "var(--space-5)" }}><h2 style={{ color: "var(--color-text-primary)", fontSize: "var(--text-xl)", fontWeight: 600 }}>{title}</h2>{action && onAction && <button type="button" onClick={onAction} className="btn-secondary" style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>{action}</button>}</div>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
	return <div style={{ minWidth: 0 }}><div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ color: "var(--color-text-primary)", fontSize: "var(--text-2xl)", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>{detail && <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>{detail}</div>}</div>;
}

export default function Dashboard() {
	const { t } = useTranslation("common");
	const navigate = useNavigate();
	const { agentId: routeAgentId } = useParams<{ agentId?: string }>();
	const { admin } = useAuth();
	const isMobile = useIsMobile();
	const agentIdCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [agent, setAgent] = useState<ApiAgent | null>(null);
	const [quota, setQuota] = useState<{ used_messages_today: number; max_messages_per_day: number; remaining_messages_today: number } | null>(null);
	const [sourcesSummary, setSourcesSummary] = useState<{ urls: { total: number; indexed: number; pending: number }; files: { total: number; ready: number; processing: number }; has_pending: boolean } | null>(null);
	const [sessions, setSessions] = useState<DashboardSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [sessionsLoading, setSessionsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [agentIdCopied, setAgentIdCopied] = useState(false);

	useEffect(() => { void loadData(); }, [routeAgentId]);

	const loadData = async () => {
		if (!routeAgentId) { navigate("/"); return; }
		setLoading(true);
		setError(null);
		try {
			const loadedAgent = await api.getAgent(routeAgentId);
			setAgent(loadedAgent);
			const [quotaData, sourcesData] = await Promise.all([api.getQuota(loadedAgent.id), api.getSourcesSummary(loadedAgent.id)]);
			setQuota(quotaData);
			setSourcesSummary(sourcesData);
			setSessionsLoading(true);
			try {
				const response = (await api.getAdminSessions({ agent_id: loadedAgent.id })) as unknown as SessionListResponse;
				setSessions((response.items || []).slice(0, 5));
			} catch {
				setSessions([]);
			} finally { setSessionsLoading(false); }
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
		} finally { setLoading(false); }
	};

	const handleCopyAgentId = async () => {
		if (!agent?.id) return;
		try { await navigator.clipboard.writeText(agent.id); } catch {
			const textArea = document.createElement("textarea");
			textArea.value = agent.id;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand("copy");
			document.body.removeChild(textArea);
		}
		setAgentIdCopied(true);
		if (agentIdCopiedTimerRef.current) clearTimeout(agentIdCopiedTimerRef.current);
		agentIdCopiedTimerRef.current = setTimeout(() => setAgentIdCopied(false), 2000);
	};

	const getGreeting = () => { const hour = new Date().getHours(); return hour < 12 ? t("time.goodMorning") : hour < 18 ? t("time.goodAfternoon") : t("time.goodEvening"); };
	const agentStatus = agent?.last_error_code ? { label: t("status.error"), tone: "error" as const } : agent?.is_active && !agent.deleted_at ? { label: t("status.active"), tone: "success" as const } : { label: t("status.notConfigured"), tone: "muted" as const };
	const indexedBlocks = sourcesSummary ? sourcesSummary.urls.indexed + sourcesSummary.files.ready : 0;
	const hasKnowledge = indexedBlocks > 0;

	if (loading) return <AdminLayout><div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}><div className="spinner" /></div></AdminLayout>;
	if (error || !agent) return <AdminLayout><div style={{ padding: isMobile ? "var(--space-4)" : "var(--space-8)", color: "var(--color-error)" }}>{error || t("errors.loadFailed")}</div></AdminLayout>;

	return <AdminLayout>
		<div style={{ padding: isMobile ? "var(--space-4)" : "var(--space-8)", maxWidth: 1440, margin: "0 auto" }}>
			<header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--space-6)", flexWrap: "wrap", marginBottom: "var(--space-8)" }}>
				<div><div style={{ color: "var(--color-accent-primary)", fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "var(--space-3)" }}>Assistly workspace</div><h1 style={{ fontSize: isMobile ? "var(--text-2xl)" : "var(--text-4xl)", fontWeight: 700, color: "var(--color-text-primary)", marginBottom: "var(--space-2)" }}>{getGreeting()}, {admin?.name}</h1><p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-base)" }}>Here's what's happening with your AI support agent today.</p></div>
				<div style={{ textAlign: isMobile ? "left" : "right" }}><div style={{ color: "var(--color-text-primary)", fontSize: "var(--text-lg)", fontWeight: 700 }}>{agent.name}</div><div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)", margin: "var(--space-1) 0 var(--space-2)" }}>AI Support Agent</div><StatusBadge label={agentStatus.label} tone={agentStatus.tone} /></div>
			</header>

			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.35fr) minmax(320px, 0.65fr)", gap: "var(--space-5)", marginBottom: "var(--space-8)" }}>
				<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-5)" : "var(--space-6)" }}><SectionHeading title="AI Support Overview" /><div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}><Metric label="Agent" value={agent.name} /><Metric label="Provider" value={agent.provider_type || "Not available"} /><Metric label="Model" value={agent.model || "Not available"} /><Metric label="Today's messages" value={quota?.used_messages_today ?? "Not available"} detail={quota ? `${quota.remaining_messages_today} remaining` : undefined} /></div><div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2) var(--space-5)", paddingTop: "var(--space-5)", borderTop: "1px solid var(--color-border)" }}><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Type: <strong style={{ color: "var(--color-text-primary)" }}>{agent.agent_type || "Not available"}</strong></span><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Channel: <strong style={{ color: "var(--color-text-primary)" }}>{agent.channel_mode || "Not available"}</strong></span><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>API key: <strong style={{ color: agent.api_key_set ? "var(--color-success)" : "var(--color-warning)" }}>{agent.api_key_set ? "Configured" : "Not configured"}</strong></span></div><button type="button" onClick={handleCopyAgentId} style={{ marginTop: "var(--space-5)", padding: 0, border: "none", background: "transparent", color: agentIdCopied ? "var(--color-success)" : "var(--color-text-muted)", fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: "var(--text-xs)", cursor: "pointer" }}>{agentIdCopied ? `Copied: ${agent.id}` : `Agent ID: ${agent.id}`}</button></section>
				<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-5)" : "var(--space-6)" }}><SectionHeading title="Knowledge Base" action="Manage" onAction={() => navigate(`/agents/${agent.id}/knowledge`)} /><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)" }}><Metric label="Web Pages" value={sourcesSummary?.urls.total ?? "Not available"} detail={sourcesSummary ? `${sourcesSummary.urls.indexed} indexed` : undefined} /><Metric label="Files" value={sourcesSummary?.files.total ?? "Not available"} detail={sourcesSummary ? `${sourcesSummary.files.ready} ready` : undefined} /><Metric label="Indexed Blocks" value={sourcesSummary ? indexedBlocks : "Not available"} /></div><div style={{ marginTop: "var(--space-6)", padding: "var(--space-4)", borderRadius: "var(--radius-md)", background: hasKnowledge ? "color-mix(in srgb, var(--color-success) 9%, transparent)" : "color-mix(in srgb, var(--color-warning) 9%, transparent)", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>{hasKnowledge ? "Your AI agent has indexed knowledge ready for retrieval." : "Add documents or website sources to give your AI agent knowledge."}</div><div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-4)" }}><button type="button" className="btn-secondary" onClick={() => navigate(`/agents/${agent.id}/files`)} style={{ flex: 1, padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>Add files</button><button type="button" className="btn-secondary" onClick={() => navigate(`/agents/${agent.id}/urls`)} style={{ flex: 1, padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-xs)" }}>Add website</button></div></section>
			</div>

			<div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: "var(--space-5)", marginBottom: "var(--space-8)" }}>
				<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-5)" : "var(--space-6)" }}><SectionHeading title="Conversations" action="View sessions" onAction={() => navigate(`/agents/${agent.id}/sessions`)} /><div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-5)", marginBottom: "var(--space-6)" }}><Metric label="Active sessions" value={agent.active_session_count ?? "Not available"} /><Metric label="Daily messages" value={quota?.used_messages_today ?? "Not available"} detail={quota ? `of ${quota.max_messages_per_day}` : undefined} /></div>{sessionsLoading ? <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Loading recent conversations...</div> : sessions.length === 0 ? <div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No recent activity yet.<br />Customer conversations will appear here when your AI agent starts receiving requests.</div> : <div style={{ display: "grid", gap: "var(--space-3)" }}>{sessions.map((session) => <div key={session.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)", padding: "var(--space-3) 0", borderTop: "1px solid var(--color-border)" }}><div style={{ minWidth: 0 }}><div style={{ color: "var(--color-text-primary)", fontSize: "var(--text-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.visitor_id || "Customer conversation"}</div><div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.last_message || `${session.message_count} messages`}</div></div><div style={{ flexShrink: 0, textAlign: "right" }}><StatusBadge label={session.status} tone={session.status === "active" ? "success" : session.status === "taken_over" ? "warning" : "muted"} /><div style={{ color: "var(--color-text-muted)", fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>{new Date(session.updated_at || session.created_at).toLocaleDateString()}</div></div></div>)}</div>}</section>
				<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-5)" : "var(--space-6)" }}><SectionHeading title="System status" /><div style={{ display: "grid", gap: "var(--space-4)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center" }}><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>AI Agent</span><StatusBadge label={agentStatus.label} tone={agentStatus.tone} /></div><div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center" }}><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Knowledge Base</span><StatusBadge label={hasKnowledge ? "Ready" : "Not ready"} tone={hasKnowledge ? "success" : "warning"} /></div><div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center" }}><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Vector Index</span><StatusBadge label={sourcesSummary ? (hasKnowledge ? "Established" : "Not established") : "Not available"} tone={sourcesSummary ? (hasKnowledge ? "success" : "warning") : "muted"} /></div><div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center" }}><span style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>Backend/API</span><span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>Not available</span></div></div></section>
			</div>

			<section style={{ marginBottom: "var(--space-8)" }}><SectionHeading title="Quick actions" /><div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: "var(--space-3)" }}>{quickActions.map((action) => <button key={action.path} type="button" onClick={() => navigate(`/agents/${agent.id}${action.path}`)} className="liquid-glass-card" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-4)", textAlign: "left", cursor: "pointer", color: "var(--color-text-primary)" }}><span style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, borderRadius: "var(--radius-md)", color: "var(--color-accent-primary)", background: "color-mix(in srgb, var(--color-accent-primary) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-accent-primary) 20%, transparent)" }}>{action.icon}</span><span style={{ minWidth: 0 }}><strong style={{ display: "block", fontSize: "var(--text-sm)" }}>{action.title}</strong><span style={{ display: "block", marginTop: "var(--space-1)", color: "var(--color-text-muted)", fontSize: "var(--text-xs)" }}>{action.description}</span></span></button>)}</div></section>

			<section className="liquid-glass-card" style={{ padding: isMobile ? "var(--space-5)" : "var(--space-6)" }}><SectionHeading title="Source overview" /><div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "var(--space-4)" }}><Metric label="Website sources" value={sourcesSummary?.urls.total ?? "Not available"} detail={sourcesSummary ? `${sourcesSummary.urls.pending} pending` : undefined} /><Metric label="Uploaded files" value={sourcesSummary?.files.total ?? "Not available"} detail={sourcesSummary ? `${sourcesSummary.files.processing} processing` : undefined} /><Metric label="Indexed blocks" value={sourcesSummary ? indexedBlocks : "Not available"} /></div></section>
		</div>
	</AdminLayout>;
}
