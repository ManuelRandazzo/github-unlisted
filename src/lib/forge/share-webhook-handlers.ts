import { deleteSharesForInstallation, deleteSharesForRepos } from "@/lib/share-store";
import { registerForgeWebhookHandler } from "./webhooks";

// These domain-level effects are shared by any Forge whose webhook adapter
// normalizes the source event to the same provider-neutral kind.
registerForgeWebhookHandler("installation.revoked", async (event) => {
	if (event.installationId) await deleteSharesForInstallation(event.installationId);
});

registerForgeWebhookHandler("repositories.removed", async (event) => {
	if (event.installationId && event.repositories?.length) {
		await deleteSharesForRepos(event.installationId, event.repositories);
	}
});
