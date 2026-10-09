import "@/styles/global.css";
import "@/styles/dashboard.css";
import { DashboardClient } from "@/components/dashboard-client";
import { ForgePicker } from "@/components/forge-picker";
import { SiteFooter } from "@/components/site-footer";
import { adapterForConnection } from "@/lib/forge/connections";
import { listInstallationRepos } from "@/lib/github-app";
import { pageMetadata } from "@/lib/seo";
import { getSession } from "@/lib/session";
import { listSharesForOwner } from "@/lib/share-store";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
	title: "Dashboard",
	path: "/app",
	index: false,
});

const APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;

export default async function AppPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = await searchParams;
	const session = await getSession();

	if (!session) {
		const installUrl = APP_SLUG
			? `https://github.com/apps/${APP_SLUG}/installations/new`
			: null;
		return (
			<div className="page-shell">
				<main className="signin-screen">
					<h1>Sign in to create a link</h1>
					{sp.error && <p className="signin-error">{String(sp.error)}</p>}
					{sp.needs_install && (
						<p className="signin-note">
							You're signed in but the app isn't installed on any repos yet.
							Install it and pick the repos to share.
						</p>
					)}
					<ForgePicker />
					{installUrl && (
						<a className="signin-alt" href={installUrl}>
							Or install the app on your repositories
						</a>
					)}
				</main>
				<SiteFooter />
			</div>
		);
	}

	interface DashRepo {
		installationId?: number;
		connectionId?: string;
		forge: string;
		host: string;
		owner: string;
		name: string;
		fullName: string;
		private: boolean;
	}
	let repos: DashRepo[] = [];
	// One entry per connected account, so a slow or broken forge shows as an error on its own row instead of taking the whole dashboard down.
	const connections = session.connections.map((c) => ({
		...c,
		error: false,
	}));
	let loadError: string | null = null;
	try {
		const lists = await Promise.all([
			...session.installationIds.map(async (id) =>
				(await listInstallationRepos(id)).map(
					(r): DashRepo => ({
						installationId: id,
						forge: "github",
						host: "github.com",
						owner: r.owner,
						name: r.name,
						fullName: r.fullName,
						private: r.private,
					}),
				),
			),
			...connections.map(async (c): Promise<DashRepo[]> => {
				try {
					const adapter = await adapterForConnection(c.id);
					if (!adapter) throw new Error("gone");
					return (await adapter.listRepos()).map((r) => ({
						connectionId: c.id,
						forge: c.forge,
						host: c.host,
						owner: r.owner,
						name: r.name,
						fullName: r.fullName,
						private: r.private,
					}));
				} catch {
					c.error = true;
					return [];
				}
			}),
		]);
		// Deduplicated per forge: the same owner/name on two forges is two different repositories.
		const seen = new Set<string>();
		repos = lists.flat().filter((r) => {
			const k = `${r.forge}:${r.fullName}`.toLowerCase();
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load repositories";
	}

	let shares: {
		id: string;
		forge?: string;
		owner: string;
		repo: string;
		createdAt?: number;
		expiresAt?: number;
		ref?: string;
		showBranches?: boolean;
		allowDownload?: boolean;
		showReleases?: boolean;
	}[] = [];
	try {
		const all = await listSharesForOwner({
			installationIds: session.installationIds,
			connectionIds: session.connections.map((c) => c.id),
		});
		shares = all.map((s) => ({
			id: s.id,
			forge: s.forge ?? "github",
			owner: s.owner,
			repo: s.repo,
			createdAt: s.createdAt,
			expiresAt: s.expiresAt,
			ref: s.ref,
			showBranches: s.showBranches,
			allowDownload: s.allowDownload,
			showReleases: s.showReleases,
		}));
	} catch {
		// Non-fatal.
	}

	if (loadError) {
		return (
			<div className="page-shell">
				<main className="signin-screen">
					<h1>Couldn't load repositories</h1>
					<p className="signin-error">{loadError}</p>
					<a className="btn btn--ghost btn--sm" href="/api/github/logout">
						Sign out
					</a>
				</main>
				<SiteFooter />
			</div>
		);
	}

	return (
		<DashboardClient
			repos={repos}
			shares={shares}
			login={session.login}
			connections={connections}
		/>
	);
}
