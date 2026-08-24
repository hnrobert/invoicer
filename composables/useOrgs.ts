import type {
  Organization,
  OrgFull,
  OrgInvitation,
  OrgRole,
} from "#shared/types";

const ORG_ROLES = [
  "owner",
  "admin",
  "editor",
  "reviewer",
  "supervisor",
  "viewer",
  "member",
] as const;

// Reactive state + API calls for Better Auth organizations. All requests are
// same-origin `$fetch`, so the browser sends the session cookie automatically.
// Endpoint shapes verified against the Better Auth organization plugin.
export function useOrgs() {
  // The organization currently "active" for the user (drives org-scoped views).
  const activeOrganization = useState<Organization | null>(
    "org:active",
    () => null,
  );
  // Organizations the user belongs to or owns.
  const organizations = useState<Organization[]>("org:list", () => []);
  // Pending invitations addressed to the current user's email.
  const myInvitations = useState<OrgInvitation[]>("org:invites", () => []);

  function err(e: unknown, fallback: string): Error {
    return new Error(messageFromError(e, fallback));
  }

  /** Refresh the user's organizations + active org + pending invitations. */
  async function refresh() {
    try {
      const list = await $fetch<Organization[]>("/api/auth/organization/list");
      organizations.value = Array.isArray(list) ? list : [];
    } catch (e) {
      throw err(e, "Failed to load organizations");
    }
    try {
      const active = await $fetch<Organization | null>(
        "/api/auth/organization/get-full-organization",
      );
      activeOrganization.value =
        active && "id" in active ? pickOrg(active) : null;
    } catch {
      activeOrganization.value = null;
    }
    try {
      const inv = await $fetch<OrgInvitation[]>(
        "/api/auth/organization/list-user-invitations",
      );
      myInvitations.value = Array.isArray(inv)
        ? inv.filter((i) => i.status === "pending")
        : [];
    } catch {
      myInvitations.value = [];
    }
  }

  function pickOrg(o: Organization | OrgFull): Organization {
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      logo: o.logo,
      createdAt: o.createdAt,
    };
  }

  async function create(name: string, slug: string): Promise<Organization> {
    const org = await $fetch<Organization>("/api/auth/organization/create", {
      method: "POST",
      body: { name, slug },
    });
    organizations.value = [...organizations.value, pickOrg(org)];
    return org;
  }

  /**
   * Set the active organization by id; pass null to switch back to the user's
   * personal scope. The active org drives org-scoped views and API calls.
   */
  async function setActive(organizationId: string | null): Promise<void> {
    const body = organizationId === null ? {} : { organizationId };
    await $fetch("/api/auth/organization/set-active", { method: "POST", body });
    if (organizationId === null) {
      activeOrganization.value = null;
    } else {
      const found = organizations.value.find((o) => o.id === organizationId);
      if (found) activeOrganization.value = pickOrg(found);
      await refresh();
    }
  }

  async function getFull(organizationId?: string): Promise<OrgFull> {
    const query = organizationId ? { organizationId } : undefined;
    return await $fetch<OrgFull>(
      "/api/auth/organization/get-full-organization",
      { query },
    );
  }

  async function invite(
    email: string,
    role: OrgRole,
    organizationId?: string,
  ): Promise<void> {
    const body: Record<string, string> = { email, role };
    if (organizationId) body.organizationId = organizationId;
    await $fetch("/api/auth/organization/invite-member", {
      method: "POST",
      body,
    });
  }

  async function acceptInvitation(invitationId: string): Promise<void> {
    await $fetch("/api/auth/organization/accept-invitation", {
      method: "POST",
      body: { invitationId },
    });
    myInvitations.value = myInvitations.value.filter(
      (i) => i.id !== invitationId,
    );
    await refresh();
  }

  async function rejectInvitation(invitationId: string): Promise<void> {
    await $fetch("/api/auth/organization/reject-invitation", {
      method: "POST",
      body: { invitationId },
    });
    myInvitations.value = myInvitations.value.filter(
      (i) => i.id !== invitationId,
    );
  }

  async function removeMember(memberId: string): Promise<void> {
    await $fetch("/api/auth/organization/remove-member", {
      method: "POST",
      body: { memberId },
    });
  }

  async function updateMemberRole(
    memberId: string,
    role: OrgRole,
  ): Promise<void> {
    await $fetch("/api/auth/organization/update-member-role", {
      method: "POST",
      body: { memberId, role },
    });
  }

  async function leave(): Promise<void> {
    await $fetch("/api/auth/organization/leave", { method: "POST" });
    activeOrganization.value = null;
    await refresh();
  }

  async function remove(organizationId: string): Promise<void> {
    await $fetch("/api/auth/organization/delete", {
      method: "POST",
      body: { organizationId },
    });
    organizations.value = organizations.value.filter(
      (o) => o.id !== organizationId,
    );
    if (activeOrganization.value?.id === organizationId)
      activeOrganization.value = null;
  }

  return {
    ORG_ROLES,
    activeOrganization,
    organizations,
    myInvitations,
    refresh,
    create,
    setActive,
    getFull,
    invite,
    acceptInvitation,
    rejectInvitation,
    removeMember,
    updateMemberRole,
    leave,
    remove,
  };
}
